import {t} from './i18n.mjs';
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
  checkAbort
} from './project-contract.mjs';
import {
  rewriteVelaFiles,
  includeNewReadingFile
} from './vela.mjs';
import {newDocument} from './model.mjs';
import {documentPath} from './workspace.mjs';

/** Atomic multi-file changes requested by plugins (ProjectService.batch). Mixed into ProjectService.prototype, so `this` is the service. */
export const batchMethods={
  async batch(binding,args,options={},taskContext){
    return this.exclusive(binding,async ()=>{
      checkAbort(options.signal);
      const p=this.permission(binding,args.workspaceId);
      if(!this.capabilities.features.transactions)
        throw error('E_UNSUPPORTED',t('当前环境不支持项目事务。'));
      if(
        typeof args.idempotencyKey!=='string'||
        !args.idempotencyKey||
        args.idempotencyKey.length>160
      )
        throw error('E_INVALID_DATA',t('需要有效的幂等键。'));
      const before=structuredClone(this.state()),
        candidate=structuredClone(before),
        receipts=candidate.pluginProject?.receipts||{},
        key=binding.id + ':' + p.id + ':' + args.idempotencyKey,
        signature=await sha256(JSON.stringify(args)),
        previous=receipts[key];
      if(previous){
        if(previous.signature!==signature)
          throw error('E_INVALID_DATA',t('同一幂等键不可用于不同内容。'));
        return structuredClone(previous.result);
      }
      const tree=await this.entries(binding,p);
      candidate.pluginProject||={entries:{},receipts:{}};
      candidate.pluginProject.entries={...before.pluginProject.entries};
      candidate.pluginProject.textFiles={...before.pluginProject.textFiles};
      if(tree.revision!==args.expectedWorkspaceRevision)
        throw error('E_CONFLICT',t('工作区已改变，请重新读取。'),{workspaceId:p.id},true);
      const changes=args.changes;
      if(
        !Array.isArray(changes)||
        !changes.length||
        changes.length>this.capabilities.limits.projectEntries
      )
        throw error('E_LIMIT',t('批量变更数量无效。'));
      const original=new Map(tree.entries.map(e=>[e.path,e])),
        working=new Map(original),
        affected=[],
        expected=new Map(),
        wire=[];
      const removed=[],
        changedIds=new Set();
      const full=path=>(p.root?p.root + '/':'') + path;
      if(changes.some(c=>c.kind==='move'||c.kind==='delete'))
        for(const entry of tree.entries.filter(
          e=>
            e.kind==='file'&&
            /\.(process|pcs|velamap|vlmp)$/i.test(e.path)&&
            !before.documents.some(d=>documentPath(d)===full(e.path))
        )){
          const read=await this.readText(binding,{workspaceId:p.id,path:entry.path});
          if(read.revision!==entry.revision)
            throw error('E_CONFLICT',t('规划文件读取期间已改变。'));
          const doc={
            id:entry.entryId,
            name:entry.path.split('/').at(-1),
            path:full(entry.path),
            text:read.text,
            updatedAt:Date.now()
          };
          before.documents.push(doc);
          candidate.documents.push(structuredClone(doc));
          expected.set(entry.path,entry.diskRevision??null);
        }

      const check=(path,expectedRevision,creating=false)=>{
        const entry=original.get(path);
        if(expectedRevision===null){
          if(entry) throw error('E_EXISTS',t('创建目标已存在。'),{path});
        } else if(!entry||entry.revision!==expectedRevision)
          throw error('E_CONFLICT',t('文件修订不匹配。'),{path},true);
        if(creating&&[...working.keys()].some(key=>key.toLowerCase()===path.toLowerCase()))
          throw error('E_EXISTS',t('创建目标已存在。'),{path});
        expected.set(path,entry?.diskRevision??null);
        return entry;
      };
      const parents=path=>{
        let parent=parentPath(path);
        while(parent){
          const conflict=[...working.keys()].find(
            key=>key.toLowerCase()===parent.toLowerCase()&&key!==parent
          );
          if(conflict) throw error('E_EXISTS',t('父路径大小写冲突。'),{path:parent});
          const e=working.get(parent);
          if(e&&e.kind!=='directory')
            throw error('E_EXISTS',t('父路径是文件。'),{path:parent});
          if(!e){
            working.set(parent,{
              path:parent,
              entryId:crypto.randomUUID(),
              kind:'directory',
              revision:'pending',
              mime:'inode/directory',
              size:0,
              modifiedAt:new Date().toISOString(),
              workspaceId:p.id
            });
            candidate.folders=[...new Set([...(candidate.folders||[]),full(parent)])];
            wire.push({kind:'mkdir',path:parent});
            expected.set(parent,null);
          }
          parent=parentPath(parent);
        }
      };
      for(const c of changes){
        checkAbort(options.signal);
        if(!c||!['mkdir','writeText','writeBlob','move','delete'].includes(c.kind))
          throw error('E_INVALID_DATA',t('变更类型无效。'));
        const path=relativePath(c.path||c.from);
        if(affected.some(other=>within(other,path)||within(path,other)))
          throw error('E_INVALID_DATA',t('首版不支持交叠或循环变更，请拆成独立事务。'),{path});
        affected.push(path);
        parents(path);
        if(c.kind==='mkdir'){
          check(path,null,true);
          const entry={
            path,
            entryId:crypto.randomUUID(),
            kind:'directory',
            mime:'inode/directory',
            size:0,
            revision:'pending',
            modifiedAt:new Date().toISOString(),
            workspaceId:p.id
          };
          working.set(path,entry);
          candidate.folders=[...new Set([...(candidate.folders||[]),full(path)])];
          wire.push({kind:'mkdir',path});
          changedIds.add(entry.entryId);
        }
        if(['writeText','writeBlob'].includes(c.kind)){
          const old=check(path,c.expectedRevision,c.expectedRevision===null);
          if(old?.kind==='directory')
            throw error('E_INVALID_DATA',t('不能用文件覆盖目录。'),{path});
          let size,rev;
          if(c.kind==='writeText'){
            if(typeof c.text!=='string') throw error('E_INVALID_DATA',t('正文必须是字符串。'));
            size=bytes(c.text).length;
            if(size>this.capabilities.limits.textBytes)
              throw error('E_LIMIT',t('文本超过限制。'));
            rev=await revision(c.text);
          } else {
            const staged=binding.blobs.get(c.blobId);
            if(!staged?.finished||staged.workspaceId!==p.id)
              throw error('E_INVALID_DATA',t('素材尚未完成或不属于当前项目。'));
            size=staged.size;
            rev='r:' + staged.sha256;
          }
          const entry={
            ...old,
            path,
            workspaceId:p.id,
            entryId:old?.entryId||crypto.randomUUID(),
            kind:'file',
            mime:mime(path),
            size,
            revision:rev,
            textEditable:c.kind==='writeText'||textEditable(path),
            modifiedAt:new Date().toISOString()
          };
          working.set(path,entry);
          if(c.kind==='writeText') candidate.pluginProject.textFiles[full(path)]=true;
          else delete candidate.pluginProject.textFiles[full(path)];
          wire.push({
            kind:c.kind,
            path,
            ...(c.kind==='writeText'?{text:c.text}:{blobId:c.blobId})
          });
          changedIds.add(entry.entryId);
          const doc=candidate.documents.find(d=>documentPath(d)===full(path));
          if(doc&&c.kind==='writeBlob')
            throw error('E_INVALID_DATA',t('已打开的文本请使用 writeText。'),{path});
          if(doc){
            doc.text=c.text;
            doc.revision=(doc.revision||0) + 1;
            doc.updatedAt=Date.now();
          } else if(
            c.kind==='writeText'&&
            (path.endsWith('/.vela')||
              path==='.vela'||
              c.addToReadingList||
              (options.restoreMetadata&&
                JSON.parse(options.restoreMetadata.workspace||'{}').documents?.some(
                  d=>documentPath(d)===full(path)
                )))
          ){
            const created=newDocument(path.split('/').at(-1),c.text);
            created.path=full(path);
            created.id=entry.entryId;
            candidate.documents.push(created);
          }
          if(c.addToReadingList){
            const doc=candidate.documents.find(d=>documentPath(d)===full(path));
            if(doc) includeNewReadingFile(candidate,doc);
          }
        }
        if(c.kind==='move'){
          const old=check(path,c.expectedRevision),
            to=relativePath(c.to);
          if(
            within(path.toLowerCase(),to.toLowerCase())||
            [...working.keys()].some(
              other=>other.toLowerCase()===to.toLowerCase()&&other!==path
            )
          )
            throw error('E_EXISTS',t('移动目标已存在或在自身目录内。'),{path:to});
          if(affected.slice(0,-1).some(other=>within(other,to)||within(to,other)))
            throw error('E_INVALID_DATA',t('移动目标与其它操作交叠。'));
          affected.push(to);
          parents(to);
          expected.set(to,null);
          for(const [key,e] of [...working])
            if(within(path,key)){
              working.delete(key);
              const next=to + key.slice(path.length);
              working.set(next,{...e,path:next});
              changedIds.add(e.entryId);
              delete candidate.pluginProject.entries[full(key)];
              candidate.pluginProject.entries[full(next)]=e.entryId;
              if(candidate.pluginProject.textFiles[full(key)]){
                delete candidate.pluginProject.textFiles[full(key)];
                candidate.pluginProject.textFiles[full(next)]=true;
              }
            }
          for(const doc of candidate.documents)
            if(within(full(path),documentPath(doc))){
              doc.path=full(to) + documentPath(doc).slice(full(path).length);
              doc.name=doc.path.split('/').at(-1);
            }
          candidate.folders=(candidate.folders||[]).map(value=>
            within(full(path),value)?full(to) + value.slice(full(path).length):value
          );
          for(const repo of candidate.repositories||[])
            if(within(full(path),repo.folder))
              repo.folder=full(to) + repo.folder.slice(full(path).length);
          rewriteVelaFiles(before,candidate,'move',full(path),full(to));
          wire.push({kind:'move',from:path,to});
        }
        if(c.kind==='delete'){
          const old=check(path,c.expectedRevision);
          if(c.mode!=='trash') throw error('E_INVALID_DATA',t('删除必须移入回收站。'));
          if(
            old.kind==='directory'&&
            [...working.keys()].some(key=>key!==path&&within(path,key))&&
            !c.recursive
          )
            throw error('E_INVALID_DATA',t('非空目录需要 recursive:true。'));
          for(const [key,e] of [...working])
            if(within(path,key)){
              working.delete(key);
              removed.push({entryId:e.entryId,path:key});
              delete candidate.pluginProject.entries[full(key)];
              delete candidate.pluginProject.textFiles[full(key)];
            }
          candidate.documents=candidate.documents.filter(
            d=>!within(full(path),documentPath(d))
          );
          candidate.folders=(candidate.folders||[]).filter(f=>!within(full(path),f));
          candidate.repositories=(candidate.repositories||[]).filter(
            repo=>!within(full(path),repo.folder)
          );
          rewriteVelaFiles(before,candidate,'delete',full(path));
          let trashId;
          if(this.host.platform==='browser'){
            trashId=crypto.randomUUID();
            candidate.trash||=[];
            if(candidate.trash.length>=100) throw error('E_QUOTA',t('回收站已满。'));
            candidate.trash.push({
              id:trashId,
              path:full(path),
              createdAt:Date.now(),
              directory:old.kind==='directory',
              documents:before.documents.filter(d=>within(full(path),documentPath(d))),
              folders:(before.folders||[]).filter(f=>within(full(path),f)),
              entries:(before.entries||[]).filter(e=>within(full(path),e.path)),
              repositories:(before.repositories||[]).filter(r=>within(full(path),r.folder)),
              projectPayload:true
            });
          }
          wire.push({kind:'delete',path,trashId});
        }
      }
      if(working.size>this.capabilities.limits.projectEntries)
        throw error('E_LIMIT',t('项目超过条目限制。'));
      if(
        [...working.values()].reduce((sum,e)=>sum + e.size,0)>
        this.capabilities.limits.projectBytes
      )
        throw error('E_LIMIT',t('项目超过容量限制。'));
      // Manifest reference rewrites and explicit reading-list additions share this commit.
      for(const doc of candidate.documents.filter(
        d=>
          d.name==='.vela'||
          d.name==='.global.vela'||
          /\.(process|pcs|velamap|vlmp)$/i.test(d.name)
      )){
        const old=before.documents.find(d=>d.id===doc.id);
        if(
          old&&
          old.text!==doc.text&&
          !wire.some(c=>c.kind==='writeText'&&full(c.path)===documentPath(doc))
        ){
          const path=documentPath(doc).slice(p.root?p.root.length + 1:0);
          if(!within(p.root,documentPath(doc)))
            throw error('E_INVALID_DATA',t('此变更会修改项目之外的配置，请先调整引用。'));
          wire.push({kind:'writeText',path,text:doc.text});
          expected.set(path,original.get(path)?.diskRevision??null);
          const entry=working.get(path);
          if(entry){
            entry.revision=await revision(doc.text);
            entry.size=bytes(doc.text).length;
            changedIds.add(entry.entryId);
          }
        } else if(old&&old.text!==doc.text){
          const c=wire.find(c=>c.kind==='writeText'&&full(c.path)===documentPath(doc));
          if(c) c.text=doc.text;
        }
      }
      for(const e of working.values()) candidate.pluginProject.entries[full(e.path)]=e.entryId;
      for(const e of [...working.values()]
        .filter(e=>e.kind==='directory')
        .sort((a,b)=>b.path.length - a.path.length))
        e.revision=await revision(
          JSON.stringify(
            [...working.values()]
              .filter(child=>child!==e&&within(e.path,child.path))
              .sort((a,b)=>a.path.localeCompare(b.path))
              .map(child=>[child.path,child.revision])
          )
        );
      if(options.restoreMetadata){
        const saved=options.restoreMetadata,
          stored=JSON.parse(saved.workspace||'{}');
        for(const e of working.values()){
          const original=saved.entries.find(old=>old.path===e.path);
          if(original?.entryId){
            if(changedIds.has(e.entryId)){
              changedIds.delete(e.entryId);
              changedIds.add(original.entryId);
            }
            if(original.textEditable||stored.pluginProject?.textFiles?.[full(e.path)])
              candidate.pluginProject.textFiles[full(e.path)]=true;
            e.entryId=original.entryId;
            candidate.pluginProject.entries[full(e.path)]=original.entryId;
          }
        }
        for(const old of stored.documents||[])
          if(
            within(p.root,documentPath(old))&&
            saved.includeRoots.some(root=>
              within(root,documentPath(old).slice(p.root?p.root.length + 1:0))
            )
          ){
            const doc=candidate.documents.find(d=>documentPath(d)===documentPath(old));
            if(doc){
              const liveText=doc.text;
              Object.assign(doc,structuredClone(old),{text:liveText});
            }
          }
        for(const field of ['annotations','editorPositions','localHistory'])
          if(stored[field]){
            candidate[field]||={};
            for(const old of stored.documents||[])
              if(
                within(p.root,documentPath(old))&&
                candidate.documents.some(d=>d.id===old.id)&&
                stored[field][old.id]
              )
                candidate[field][old.id]=structuredClone(stored[field][old.id]);
          }
      }
      const sorted=[...working.values()].sort((a,b)=>a.path.localeCompare(b.path)),
        workspaceRevision=
          'w:' + (await sha256(JSON.stringify(sorted.map(e=>[e.path,e.entryId,e.revision])))),
        transactionId=crypto.randomUUID(),
        result={
          transactionId,
          workspaceRevision,
          changed:sorted.filter(e=>changedIds.has(e.entryId)).map(e=>this.publicEntry(e)),
          removed
        };
      candidate.pluginProject.receipts={...receipts,[key]:{signature,result}};
      const keys=Object.keys(candidate.pluginProject.receipts);
      for(const k of keys.slice(0,Math.max(0,keys.length - 1000)))
        delete candidate.pluginProject.receipts[k];
      candidate.pluginProject.transactions=[
        ...(candidate.pluginProject.transactions||[]),
        {
          id:transactionId,
          label:String(args.label||t('插件事务')).slice(0,200),
          createdAt:Date.now(),
          paths:result.changed.map(e=>e.path),
          removed
        }
      ].slice(-100);
      candidate.treeRevision=(candidate.treeRevision||0) + 1;
      candidate.entries=[
        ...(candidate.entries||[]).filter(e=>!within(p.root,e.path)),
        ...sorted.map(e=>({
          path:full(e.path),
          name:e.path.split('/').at(-1),
          directory:e.kind==='directory',
          editable:e.textEditable,
          size:e.size,
          modifiedAt:e.modifiedAt,
          reason:e.kind==='file'&&e.textEditable?t('按需读取项目文件'):''
        }))
      ];
      candidate.openIds=candidate.openIds.filter(id=>
        candidate.documents.some(d=>d.id===id)
      );
      if(!candidate.documents.some(d=>d.id===candidate.activeId)) candidate.activeId=null;
      this.host.prepare?.(candidate);
      if(options.restoreMetadata){
        const saved=JSON.parse(options.restoreMetadata.workspace||'{}');
        for(const field of ['annotations','editorPositions'])
          for(const doc of candidate.documents)
            if(within(p.root,documentPath(doc))&&saved[field]?.[doc.id]){
              candidate[field]||={};
              candidate[field][doc.id]=structuredClone(saved[field][doc.id]);
            }
      }
      checkAbort(options.signal);
      this.alive(binding);
      taskContext?.commit();
      try {
        await this.call(binding,'apply',{
          root:p.root,
          expected:[...expected].map(([path,revision])=>({path,revision})),
          changes:wire,
          workspace:JSON.stringify(candidate),
          removedDocuments:before.documents.filter(
            d=>!candidate.documents.some(c=>c.id===d.id)
          )
        });
      } catch(cause){
        let recovered;
        try {
          const raw=await this.backend.call('receipt',binding.owner,{});
          recovered=raw?JSON.parse(raw):null;
        } catch {
          this.recoveryBlocked=true;
          throw error(
            'E_RECOVERY_REQUIRED',
            t('无法确认项目提交结果，写入已暂停；请重启应用恢复。'),
            {},
            true
          );
        }
        const receipt=recovered?.pluginProject?.receipts?.[key];
        if(
          !receipt||
          receipt.signature!==signature||
          receipt.result.transactionId!==transactionId
        )
          throw cause;
      }

      this.host.adopt(candidate,{transactionId,changed:result.changed,removed,root:p.root});
      this.observed.set(p.id,{entries:sorted,revision:workspaceRevision});
      this.emit(p.id,{
        revision:workspaceRevision,
        transactionId,
        origin:options.origin||'plugin',
        originPluginId:binding.id,
        changes:[
          ...result.changed.map(e=>({
            kind:original.has(e.path)
              ?'change'
              :original.size&&[...original.values()].some(old=>old.entryId===e.entryId)
                ?'move'
                :'create',
            entryId:e.entryId,
            path:e.path,
            oldPath:[...original.values()].find(
              old=>old.entryId===e.entryId&&old.path!==e.path
            )?.path,
            revision:e.revision
          })),
          ...removed.map(e=>({...e,kind:'delete'}))
        ]
      });
      return result;
    });
  }
};
