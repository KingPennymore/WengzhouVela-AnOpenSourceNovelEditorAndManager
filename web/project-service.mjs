import {t,say} from './i18n.mjs';
import {
  error,
  relativePath,
  within,
  parentPath,
  mime,
  textEditable,
  bytes,
  sha256,
  revision,
  checkAbort,
  positive,
  jsonObject
} from './project-contract.mjs';
import {PluginTasks} from './plugin-tasks.mjs';
import {
  createVela,
  parseVela,
  velaText
} from './vela.mjs';
import {newDocument} from './model.mjs';
import {documentPath} from './workspace.mjs';
import {fromBase64,toBase64} from './plugin-package.mjs';
import {batchMethods} from './project-batch.mjs';
import {pluginApiMethods} from './project-plugin-api.mjs';

/** Coordinates public project operations with live DocumentService state. */
export class ProjectService {
  constructor(host,backend){
    this.host=host;
    this.backend=backend;
    this.tasks=new PluginTasks();
    this.bindings=new Map();
    this.watchers=new Set();
    this.queue=Promise.resolve();
    this.capabilities=null;
    this.pendingEvents=new Map();
    this.observed=new Map();
  }
  async ready(){
    this.capabilities=await this.backend.call('capabilities','host',{});
    return this.capabilities;
  }
  featureNames(){
    const f=this.capabilities?.features||{};
    return [
      ...(f.filesystem?['workspace-v1','filesystem-v1']:[]),
      ...(f.transactions?['file-transactions-v1']:[]),
      ...(f.assetSessions?['asset-sessions-v1']:[]),
      ...(f.archives?['archive-v1']:[]),
      ...(f.snapshots?['snapshots-v1']:[])
    ];
  }
  state(){
    return this.host.workspace();
  }
  projects(){
    return this.state()
      .documents.filter(d=>d.name==='.vela')
      .flatMap(doc=>{
        try {
          const config=parseVela(doc.text);
          return config.kind==='workspace'
            ?[
                {
                  id:config.id,
                  name:
                    config.project?.name||
                    parentPath(documentPath(doc)).split('/').at(-1)||
                    'Vela',
                  root:parentPath(documentPath(doc)),
                  doc
                }
              ]
            :[];
        } catch {
          return [];
        }
      });
  }
  project(id){
    const all=this.projects().filter(p=>p.id===id);
    if(all.length!==1)
      throw error(
        all.length?'E_INVALID_DATA':'E_NOT_FOUND',
        all.length?t('项目 ID 重复，请修复 .vela。'):t('项目不存在。')
      );
    return all[0];
  }
  alive(binding){
    if(binding.stopped||this.bindings.get(binding.owner)!==binding)
      throw error('E_PLUGIN_STOPPED',t('插件已停用。'));
  }
  permission(binding,id){
    this.alive(binding);
    // Only host code can create this session; it is never exposed through plugin APIs.
    if(binding.builtinProject?.id===id)return binding.builtinProject;
    if(!binding.grants.has(id))
      throw error('E_PERMISSION',t('请先打开并授权此工作区。'),{workspaceId:id});
    return this.project(id);
  }
  async authorize(binding,id){
    this.alive(binding);
    const p=this.project(id);
    if(!binding.grants.has(id)){
      if(
        !(await this.host.confirm(
          t('插件项目授权'),
          say(
            `允许“${binding.name}”读写工作区“${p.name}”及其附件？`,
            `Allow “${binding.name}” to read and write workspace “${p.name}” and its attachments?`
          )
        ))
      )
        throw error('E_PERMISSION',t('项目授权已取消。'));
      this.alive(binding);
      binding.grants.add(id);
    }
    return p;
  }
  async call(binding,action,args={}){
    this.alive(binding);
    let onStop;
    try {
      const pending=this.backend
          .call(action,binding.owner,{...args,pluginId:binding.id})
          .then(result=>{
            if(binding.stopped&&!['apply','receipt'].includes(action))
              this.backend.call('stop',binding.owner,{pluginId:binding.id}).catch(()=>{});
            return result;
          }),
        stop=['apply','receipt'].includes(action)
          ?null
          :new Promise((_,reject)=>{
              onStop=()=>reject(error('E_PLUGIN_STOPPED',t('插件已停用。')));
              binding.stopController.signal.addEventListener('abort',onStop,{once:true});
              if(binding.stopped) onStop();
            });
      const result=await (stop?Promise.race([pending,stop]):pending);
      if(binding.stopped&&!['apply','receipt'].includes(action)){
        await this.backend.call('stop',binding.owner,{pluginId:binding.id}).catch(()=>{});
        this.alive(binding);
      }
      return result;
    } catch(cause){
      if(cause.code) throw cause;
      throw error('E_INVALID_DATA',t('项目操作失败，请保留原始数据并重试。'));
    } finally {
      if(onStop) binding.stopController.signal.removeEventListener('abort',onStop);
    }
  }
  async entries(binding,p){
    const tree=await this.call(binding,'tree',{root:p.root}),
      workspace=this.state();
    workspace.pluginProject||={entries:{},receipts:{}};
    workspace.pluginProject.entries||={};
    const docs=new Map(
      workspace.documents
        .filter(d=>within(p.root,documentPath(d)))
        .map(d=>[documentPath(d).slice(p.root?p.root.length + 1:0),d])
    );
    const entries=[];
    for(const raw of tree.entries){
      const path=relativePath(raw.path),
        full=(p.root?p.root + '/':'') + path,
        doc=docs.get(path);
      const entryId=workspace.pluginProject.entries[full]||doc?.id||crypto.randomUUID();
      workspace.pluginProject.entries[full]=entryId;
      entries.push({
        ...raw,
        path,
        workspaceId:p.id,
        entryId,
        textEditable:
          raw.kind==='file'&&
          (!!doc||workspace.pluginProject?.textFiles?.[full]||textEditable(path)),
        revision:doc?await revision(doc.text):raw.revision,
        diskRevision:raw.revision,
        size:doc?bytes(doc.text).length:raw.size,
        mime:raw.mime||mime(path),
        modifiedAt:doc?new Date(doc.updatedAt).toISOString():raw.modifiedAt
      });
      docs.delete(path);
    }
    // New unsaved editor files participate in the same revision as on-disk files.
    for(const [path,doc] of docs){
      const full=(p.root?p.root + '/':'') + path,
        entryId=workspace.pluginProject.entries[full]||doc.id;
      workspace.pluginProject.entries[full]=entryId;
      entries.push({
        path,
        workspaceId:p.id,
        entryId,
        kind:'file',
        size:bytes(doc.text).length,
        mime:mime(path),
        revision:await revision(doc.text),
        diskRevision:null,
        textEditable:true,
        modifiedAt:new Date(doc.updatedAt).toISOString()
      });
    }
    for(const e of entries
      .filter(e=>e.kind==='directory')
      .sort((a,b)=>b.path.length - a.path.length))
      e.revision=await revision(
        JSON.stringify(
          entries
            .filter(child=>child!==e&&within(e.path,child.path))
            .sort((a,b)=>a.path.localeCompare(b.path))
            .map(child=>[child.path,child.revision])
        )
      );
    entries.sort((a,b)=>a.path.localeCompare(b.path));
    const rev=
      'w:' + (await sha256(JSON.stringify(entries.map(e=>[e.path,e.entryId,e.revision]))));
    return {entries,revision:rev};
  }
  publicEntry(entry){
    const {diskRevision,...value}=entry;
    return value;
  }
  async handle(binding,p){
    const tree=await this.entries(binding,p);
    return {id:p.id,name:p.name,revision:tree.revision,writable:true};
  }
  async readText(binding,ref,options={}){
    checkAbort(options.signal);
    const p=this.permission(binding,ref.workspaceId),
      path=relativePath(ref.path),
      tree=await this.entries(binding,p),
      entry=tree.entries.find(e=>e.path===path);
    if(!entry) throw error('E_NOT_FOUND',t('文件不存在。'),{path});
    if(entry.kind!=='file'||!entry.textEditable)
      throw error('E_INVALID_DATA',t('此文件不可作为文本读取。'),{path});
    if(entry.size>this.capabilities.limits.textBytes)
      throw error('E_LIMIT',t('文本超过读取限制。'),{limit:this.capabilities.limits.textBytes});
    const full=(p.root?p.root + '/':'') + path,
      doc=this.state().documents.find(d=>documentPath(d)===full);
    if(doc) return {text:doc.text,revision:entry.revision,encoding:'utf-8'};
    const chunks=[];
    let offset=0;
    while(offset<entry.size){
      checkAbort(options.signal);
      const part=await this.call(binding,'read',{
        root:p.root,
        path,
        offset,
        length:Math.min(this.capabilities.limits.readChunkBytes,entry.size - offset),
        expectedRevision:entry.diskRevision
      });
      const data=fromBase64(part.data);
      if(!data.length) throw error('E_CONFLICT',t('文件读取期间已改变。'));
      chunks.push(data);
      offset+=data.length;
    }
    const data=new Uint8Array(entry.size);
    let at=0;
    for(const chunk of chunks){
      data.set(chunk,at);
      at+=chunk.length;
    }
    let text;
    try {
      text=new TextDecoder('utf-8',{fatal:true}).decode(data);
    } catch {
      throw error('E_INVALID_DATA',t('文件不是有效的 UTF-8 文本。'),{path});
    }
    return {text,revision:entry.revision,encoding:'utf-8'};
  }
  async readBytes(binding,ref,options={}){
    checkAbort(options.signal);
    const p=this.permission(binding,ref.workspaceId),
      path=relativePath(ref.path),
      doc=this.state().documents.find(
        d=>documentPath(d)===(p.root?p.root + '/':'') + path
      );
    if(doc){
      const data=bytes(doc.text),
        rev=await revision(data),
        offset=ref.offset??0,
        length=
          ref.length??Math.min(data.length - offset,this.capabilities.limits.readChunkBytes);
      positive(offset,t('读取偏移'),data.length,{zero:true});
      positive(length,t('块大小'),this.capabilities.limits.readChunkBytes,{zero:true});
      if(ref.expectedRevision&&ref.expectedRevision!==rev)
        throw error('E_CONFLICT',t('文件已改变。'),{path});
      return {bytes:data.slice(offset,offset + length),revision:rev,totalSize:data.length};
    }
    const result=await this.call(binding,'read',{
      root:p.root,
      path,
      offset:ref.offset,
      length:ref.length,
      expectedRevision:ref.expectedRevision
    });
    return {...result,bytes:fromBase64(result.data),data:undefined};
  }
  exclusive(binding,run){
    const task=this.queue.then(async ()=>{
      this.alive(binding);
      const release=await this.host.lock();
      try {
        if(this.recoveryBlocked)
          throw error('E_RECOVERY_REQUIRED',t('项目提交结果需要恢复，请重启应用。'));
        return await run();
      } finally {
        if(!this.recoveryBlocked) release();
      }
    });
    binding.operations.add(task);
    task.finally(()=>binding.operations.delete(task)).catch(()=>{});
    this.queue=task.catch(()=>{});
    return task;
  }
  emit(id,event){
    for(const w of this.watchers)
      if(
        w.workspaceId===id&&
        !w.binding.stopped&&
        (!w.paths.length||
          event.changes.some(c=>
            w.paths.some(p=>within(p,c.path)||(c.oldPath&&within(p,c.oldPath)))
          ))
      )
        try {
          w.listener(structuredClone(event));
        } catch(cause){
          this.host.fail(cause);
        }
  }
  changed(origin='editor',paths=[]){
    for(const p of this.projects()){
      if(paths.length&&!paths.some(path=>within(p.root,path))) continue;
      const previous=this.pendingEvents.get(p.id);
      this.pendingEvents.set(p.id,{
        origin:
          origin==='editor'&&previous?.origin!=='editor'
            ?previous?.origin||origin
            :origin,
        paths
      });
    }
    if(this.eventTimer) return;
    this.eventTimer=setTimeout(async ()=>{
      this.eventTimer=null;
      const events=[...this.pendingEvents];
      this.pendingEvents.clear();
      for(const [id,{origin}] of events){
        const watcher=[...this.watchers].find(w=>w.workspaceId===id&&!w.binding.stopped);
        if(!watcher) continue;
        try {
          await watcher.ready;
          const p=this.permission(watcher.binding,id),
            tree=await this.entries(watcher.binding,p),
            before=this.observed.get(id);
          this.observed.set(id,tree);
          if(!before||tree.revision===before.revision) continue;
          const old=new Map(before.entries.map(e=>[e.entryId,e])),
            live=new Map(tree.entries.map(e=>[e.entryId,e])),
            changes=[];
          for(const e of tree.entries){
            const previous=old.get(e.entryId);
            if(!previous||previous.path!==e.path||previous.revision!==e.revision)
              changes.push({
                kind:!previous?'create':previous.path!==e.path?'move':'change',
                entryId:e.entryId,
                path:e.path,
                oldPath:previous?.path!==e.path?previous?.path:undefined,
                revision:e.revision
              });
          }
          for(const e of before.entries)
            if(!live.has(e.entryId))
              changes.push({kind:'delete',entryId:e.entryId,path:e.path});
          if(changes.length) this.emit(id,{revision:tree.revision,origin,changes});
        } catch(cause){
          if(!watcher.binding.stopped) this.host.fail(cause);
        }
      }
    },50);
  }
  task(binding,run,options={}){
    this.alive(binding);
    return this.tasks.start(
      binding.owner,
      async ctx=>{
        const cancel=()=>
          this.backend.call('cancel',binding.owner,{taskId:ctx.id}).catch(()=>{});
        ctx.signal.addEventListener('abort',cancel,{once:true});
        try {
          return await run(ctx);
        } finally {
          ctx.signal.removeEventListener('abort',cancel);
          for(const [blobId,staged] of binding.blobs)
            if(staged.taskId===ctx.id){
              await this.backend.call('abort',binding.owner,{blobId}).catch(()=>{});
              binding.blobs.delete(blobId);
            }
        }
      },
      options
    );
  }
  bind(id,name){
    const owner=crypto.randomUUID(),
      binding={
        id,
        name,
        owner,
        grants:new Set(),
        blobs:new Map(),
        resources:new Set(),
        operations:new Set(),
        stopController:new AbortController(),
        stopped:false
      };
    this.bindings.set(owner,binding);
    const manager=this;
    const fileAPI={
      list:async args=>{
        const p=this.permission(binding,args.workspaceId),
          path=relativePath(args.path??'',true),
          tree=await this.entries(binding,p),
          limit=positive(args.limit??200,t('分页大小'),1000);
        let offset=0;
        if(args.cursor){
          let cursor;
          try {
            cursor=JSON.parse(
              new TextDecoder('utf-8',{fatal:true}).decode(fromBase64(args.cursor))
            );
          } catch {
            throw error('E_STALE_CURSOR',t('分页游标无效。'));
          }
          if(
            cursor.workspaceId!==p.id||
            cursor.path!==path||
            cursor.recursive!==!!args.recursive||
            cursor.revision!==tree.revision
          )
            throw error('E_STALE_CURSOR',t('目录已改变，请重新列举。'));
          offset=positive(cursor.offset,t('分页偏移'),tree.entries.length,{zero:true});
        }
        const matching=tree.entries.filter(
          e=>
            e.path!==path&&
            within(path,e.path)&&
            (args.recursive||parentPath(e.path)===path)
        );
        return {
          entries:matching.slice(offset,offset + limit).map(e=>this.publicEntry(e)),
          revision:tree.revision,
          ...(offset + limit<matching.length
            ?{
                nextCursor:toBase64(
                  bytes(
                    JSON.stringify({
                      workspaceId:p.id,
                      path,
                      recursive:!!args.recursive,
                      revision:tree.revision,
                      offset:offset + limit
                    })
                  )
                )
              }
            :{})
        };
      },
      stat:async ref=>{
        const p=this.permission(binding,ref.workspaceId),
          path=relativePath(ref.path),
          tree=await this.entries(binding,p),
          entry=tree.entries.find(e=>e.path===path);
        if(!entry) throw error('E_NOT_FOUND',t('文件不存在。'),{path});
        return this.publicEntry(entry);
      },
      readText:(ref,options)=>this.readText(binding,ref,options),
      readBytes:(ref,options)=>this.readBytes(binding,ref,options),
      applyBatch:(args,options)=>this.batch(binding,args,options),
      beginWrite:async args=>{
        const p=this.permission(binding,args.workspaceId);
        positive(args.size,t('素材大小'),this.capabilities.limits.importFileBytes,{zero:true});
        const result=await this.call(binding,'begin',{
          root:p.root,
          size:args.size,
          mime:args.mime,
          sha256:args.sha256
        });
        binding.blobs.set(result.blobId,{workspaceId:p.id,size:args.size});
        return result;
      },
      writeChunk:async args=>{
        if(
          !(args.bytes instanceof Uint8Array)||
          args.bytes.byteLength>this.capabilities.limits.bridgeChunkBytes
        )
          throw error('E_LIMIT',t('传输块超过限制。'));
        return this.call(binding,'chunk',{
          blobId:args.blobId,
          sequence:args.sequence,
          data:toBase64(args.bytes)
        });
      },
      finishWrite:async args=>{
        const result=await this.call(binding,'finish',args),
          b=binding.blobs.get(args.blobId);
        if(!b) throw error('E_NOT_FOUND',t('暂存对象不存在。'));
        Object.assign(b,result,{finished:true});
        return result;
      },
      abortWrite:async args=>{
        await this.call(binding,'abort',args);
        binding.blobs.delete(args.blobId);
      },
      watch:(args,listener)=>{
        this.permission(binding,args.workspaceId);
        if(typeof listener!=='function') throw error('E_INVALID_DATA',t('事件监听器无效。'));
        const w={
          binding,
          workspaceId:args.workspaceId,
          paths:(args.paths||[]).map(p=>relativePath(p,true)),
          listener
        };
        this.watchers.add(w);
        w.ready=this.entries(binding,this.project(args.workspaceId))
          .then(tree=>{
            if(!this.observed.has(args.workspaceId)) this.observed.set(args.workspaceId,tree);
          })
          .catch(cause=>{
            if(!binding.stopped) this.host.fail(cause);
          });
        return ()=>this.watchers.delete(w);
      }
    };
    const api={
      workspace:{
        current:async ()=>{
          this.alive(binding);
          const doc=this.host.current(),
            path=doc&&documentPath(doc),
            p=
              path&&
              this.projects()
                .filter(p=>within(p.root,path))
                .sort((a,b)=>b.root.length - a.root.length)[0];
          if(!p) return null;
          await this.authorize(binding,p.id);
          return this.handle(binding,p);
        },
        list:async ()=>{
          this.alive(binding);
          return Promise.all(this.projects().map(p=>this.handle(binding,p)));
        },
        open:async args=>this.handle(binding,await this.authorize(binding,args.workspaceId)),
        create:async args=>
          this.exclusive(binding,async ()=>{
            const name=relativePath(args.name);
            if(name.includes('/')) throw error('E_INVALID_PATH',t('工作区名称不能包含斜杠。'));
            const parent=args.parentWorkspaceId
                ?this.permission(binding,args.parentWorkspaceId)
                :null,
              root=(parent?.root?parent.root + '/':'') + name,
              tree=await this.call(binding,'tree',{root:parent?.root||''});
            if(tree.entries.some(e=>e.path.toLowerCase()===name.toLowerCase()))
              throw error('E_EXISTS',t('工作区已存在。'));
            if(
              !(await this.host.confirm(
                t('创建插件工作区'),
                say(`在内部文件夹中创建“${name}”？`,`Create “${name}” in the internal folder?`)
              ))
            )
              throw error('E_PERMISSION',t('创建已取消。'));
            this.alive(binding);
            const candidate=structuredClone(this.state()),
              config=createVela(name),
              doc=newDocument('.vela',velaText(config));
            doc.path=root + '/.vela';
            candidate.documents.push(doc);
            candidate.folders=[...new Set([...(candidate.folders||[]),root])];
            candidate.treeRevision=(candidate.treeRevision||0) + 1;
            await this.call(binding,'apply',{
              root:parent?.root||'',
              expected:[{path:name,revision:null}],
              changes:[
                {kind:'mkdir',path:name},
                {kind:'writeText',path:name + '/.vela',text:doc.text}
              ],
              workspace:JSON.stringify(candidate)
            });
            this.host.adopt(candidate,{root,changed:[],removed:[]});
            binding.grants.add(config.id);
            return this.handle(binding,this.project(config.id));
          })
      },
      fs:fileAPI,
      documents:{
        open:async args=>{
          const p=this.permission(binding,args.workspaceId),
            read=await this.readText(binding,args);
          if(args.expectedRevision&&args.expectedRevision!==read.revision)
            throw error('E_CONFLICT',t('定位所依据的文稿已改变。'));
          if(
            args.selection&&
            (!Number.isSafeInteger(args.selection.from)||
              !Number.isSafeInteger(args.selection.to)||
              args.selection.from<0||
              args.selection.to<args.selection.from||
              args.selection.to>read.text.length)
          )
            throw error('E_INVALID_DATA',t('文稿选区无效。'));
          return this.host.openDocument(
            (p.root?p.root + '/':'') + relativePath(args.path),
            read,
            args
          );
        }
      },
      config:{
        patchExtension:async args=>{
          const read=await this.readText(binding,{workspaceId:args.workspaceId,path:'.vela'});
          if(read.revision!==args.expectedRevision)
            throw error('E_CONFLICT',t('工作区配置已改变。'));
          const config=parseVela(read.text),
            patch=jsonObject(args.patch);
          config.extensions={
            ...config.extensions,
            [binding.id]:{...config.extensions?.[binding.id],...patch}
          };
          const handle=await this.handle(binding,this.permission(binding,args.workspaceId));
          await this.batch(binding,{
            workspaceId:args.workspaceId,
            expectedWorkspaceRevision:handle.revision,
            idempotencyKey:crypto.randomUUID(),
            label:t('插件配置'),
            changes:[
              {
                kind:'writeText',
                path:'.vela',
                text:velaText(config),
                expectedRevision:read.revision
              }
            ]
          });
          return {revision:await revision(velaText(config))};
        }
      },
      tasks:{
        status:async id=>{
          this.alive(binding);
          return this.tasks.status(owner,id);
        },
        cancel:async id=>{
          this.alive(binding);
          return this.tasks.cancel(owner,id);
        }
      },
      getCapabilities:async ()=>{
        this.alive(binding);
        return structuredClone({apiVersion:3,platform:this.host.platform,...this.capabilities});
      }
    };
    this.extendIO(api,binding,fileAPI);
    this.extendSnapshots(api,binding);
    this.extendAssets(api,binding);
    this.extendPreview(api,binding);
    return {
      owner,
      api,
      stop:async ()=>{
        binding.stopped=true;
        binding.stopController.abort();
        for(const w of this.watchers) if(w.binding===binding) this.watchers.delete(w);
        await this.tasks.stop(owner);
        await Promise.allSettled([...binding.operations]);
        try {
          if(this.capabilities.features.filesystem)
            await this.backend.call('stop',owner,{pluginId:id});
        } finally {
          for(const dispose of binding.resources) dispose();
          this.bindings.delete(owner);
        }
      }
    };
  }
  /** Trusted application features reuse the same queue, locks, revisions and atomic backend as plugins. */
  bindBuiltin(id,root,name){
    root=relativePath(root,true);
    const session=this.bind(id,name),binding=this.bindings.get(session.owner);
    binding.builtinProject={id:'builtin:'+session.owner,name,root};
    return {...session,handle:()=>this.handle(binding,binding.builtinProject),stop:async()=>{
      try{await session.stop();}finally{
        this.observed.delete(binding.builtinProject.id);
        this.pendingEvents.delete(binding.builtinProject.id);
      }
    }};
  }
}
Object.assign(ProjectService.prototype,batchMethods,pluginApiMethods);
