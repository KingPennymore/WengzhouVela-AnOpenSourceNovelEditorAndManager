import {t,say} from './i18n.mjs';
import {
  error,
  relativePath,
  within,
  jsonObject
} from './project-contract.mjs';
import {parseVela} from './vela.mjs';
import {documentPath} from './workspace.mjs';
import {fromBase64} from './plugin-package.mjs';

/** The io, snapshot, asset and preview APIs a plugin binding exposes. Mixed into ProjectService.prototype, so `this` is the service. */
export const pluginApiMethods={
  extendIO(api,binding,fs){
    api.io={
      pickFiles:async args=>{
        this.alive(binding);
        if(!this.host.userGesture())
          throw error('E_PERMISSION',t('请从按钮或命令的用户操作中选择素材。'));
        if(
          !Array.isArray(args.accept)||
          args.accept.some(type=>typeof type!=='string'||type.length>120)
        )
          throw error('E_INVALID_DATA',t('文件过滤条件无效。'));
        return this.call(binding,'pick',{multiple:!!args.multiple,accept:args.accept});
      },
      importFiles:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            const p=this.permission(binding,args.workspaceId);
            if(
              !Array.isArray(args.selections)||
              !args.selections.length||
              !['error','rename'].includes(args.collision)
            )
              throw error('E_INVALID_DATA',t('导入参数无效。'));
            const tree=await this.entries(binding,p);
            if(tree.revision!==args.expectedWorkspaceRevision)
              throw error('E_CONFLICT',t('工作区已改变。'));
            const used=new Set(tree.entries.map(e=>e.path.toLowerCase())),
              changes=[];
            let i=0;
            for(const s of args.selections){
              ctx.check();
              let target=relativePath(s.targetPath);
              if(used.has(target.toLowerCase())){
                if(args.collision==='error')
                  throw error('E_EXISTS',t('导入目标已存在。'),{path:target});
                const dot=target.lastIndexOf('.'),
                  suffix=dot>target.lastIndexOf('/')?target.slice(dot):'',
                  stem=suffix?target.slice(0,dot):target;
                let n=2;
                while(used.has((stem + '-' + n + suffix).toLowerCase())) n++;
                target=stem + '-' + n + suffix;
              }
              used.add(target.toLowerCase());
              const staged=await this.call(binding,'selectionStage',{
                token:s.token,
                root:p.root,
                taskId:ctx.id
              });
              binding.blobs.set(staged.blobId,{
                ...staged,
                workspaceId:p.id,
                finished:true,
                taskId:ctx.id
              });
              changes.push({
                kind:'writeBlob',
                path:target,
                blobId:staged.blobId,
                expectedRevision:null
              });
              ctx.progress({
                phase:'importing',
                completedFiles:++i,
                totalFiles:args.selections.length
              });
            }
            const result=await this.batch(
              binding,
              {
                workspaceId:p.id,
                expectedWorkspaceRevision:args.expectedWorkspaceRevision,
                idempotencyKey:ctx.id,
                changes,
                label:t('导入素材')
              },
              {signal:ctx.signal,origin:'import'},
              ctx
            );
            return {transactionId:result.transactionId,entries:result.changed};
          },
          options
        ),
      inspectArchive:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            ctx.progress({phase:'inspecting'});
            const result=await this.call(binding,'archiveInspect',{
              selectionToken:args.selectionToken,
              taskId:ctx.id
            });
            return {...result,totalBytes:result.totalBytes??result.expandedBytes};
          },
          options
        ),
      readArchiveText:async args=>{
        this.alive(binding);
        const result=await this.call(binding,'archiveRead',{
          archiveToken:args.archiveToken,
          path:relativePath(args.path),
          maxBytes:this.capabilities.limits.textBytes
        });
        return {text:new TextDecoder('utf-8',{fatal:true}).decode(fromBase64(result.data))};
      },
      importArchive:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            const p=this.permission(binding,args.workspaceId),
              target=relativePath(args.targetDirectory??'',true);
            if(args.collision!=='error')
              throw error('E_INVALID_DATA',t('归档导入必须采用 collision:error。'));
            const staged=await this.call(binding,'archiveStage',{
                archiveToken:args.archiveToken,
                root:p.root,
                target,
                taskId:ctx.id
              }),
              changes=[];
            for(const e of staged.entries)
              if(!e.directory)
                binding.blobs.set(e.blobId,{
                  ...e,
                  workspaceId:p.id,
                  finished:true,
                  taskId:ctx.id
                });
            for(const e of staged.entries){
              const path=(target?target + '/':'') + e.path;
              if(e.directory){
                if(
                  !staged.entries.some(other=>other.path!==e.path&&within(e.path,other.path))
                )
                  changes.push({kind:'mkdir',path});
              } else {
                if(e.path==='.vela'||e.path.endsWith('/.vela')){
                  const content=await api.io.readArchiveText({
                    archiveToken:args.archiveToken,
                    path:e.path
                  });
                  parseVela(content.text);
                  changes.push({
                    kind:'writeText',
                    path,
                    text:content.text,
                    expectedRevision:null
                  });
                } else
                  changes.push({kind:'writeBlob',path,blobId:e.blobId,expectedRevision:null});
              }
            }
            ctx.check();
            const result=await this.batch(
              binding,
              {
                workspaceId:p.id,
                expectedWorkspaceRevision:args.expectedWorkspaceRevision,
                idempotencyKey:ctx.id,
                changes,
                label:t('导入项目包')
              },
              {signal:ctx.signal,origin:'import'},
              ctx
            );
            return {transactionId:result.transactionId,revision:result.workspaceRevision};
          },
          options
        ),
      exportFile:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            const p=this.permission(binding,args.workspaceId),
              path=relativePath(args.path),
              read=await this.entries(binding,p),
              entry=read.entries.find(e=>e.path===path);
            if(!entry||entry.revision!==args.expectedRevision)
              throw error('E_CONFLICT',t('导出文件已改变。'));
            if(!this.host.userGesture())
              throw error('E_PERMISSION',t('请从用户操作中导出文件。'));
            return this.exclusive(binding,async ()=>{
              ctx.check();
              ctx.commit();
              return this.call(binding,'exportFile',{
                root:p.root,
                path,
                expectedRevision:entry.revision,
                suggestedName:args.suggestedName,
                taskId:ctx.id
              });
            });
          },
          options
        ),
      exportArchive:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            this.alive(binding);
            if(!this.host.userGesture())
              throw error('E_PERMISSION',t('请从用户操作中导出归档。'));
            if(!Array.isArray(args.paths)||!args.paths.length)
              throw error('E_INVALID_DATA',t('导出必须明确指定文件白名单。'));
            ctx.progress({phase:'exporting'});
            const result=await this.call(binding,'archiveExport',{
              ...args,
              paths:args.paths.map(path=>relativePath(path)),
              root:relativePath(args.root??'',true),
              taskId:ctx.id
            });
            try {
              ctx.check();
              ctx.commit();
              return await this.call(binding,'deliver',{
                outputToken:result.outputToken,
                suggestedName:args.suggestedName,
                sha256:result.sha256,
                taskId:ctx.id
              });
            } finally {
              await this.backend
                .call('discardOutput',binding.owner,{outputToken:result.outputToken})
                .catch(()=>{});
            }
          },
          options
        )
    };
  },
  extendSnapshots(api,binding){
    api.snapshots={
      create:(args,options={})=>
        this.task(
          binding,
          async ctx=>
            this.exclusive(binding,async ()=>{
              const p=this.permission(binding,args.workspaceId),
                tree=await this.entries(binding,p);
              if(tree.revision!==args.expectedWorkspaceRevision)
                throw error('E_CONFLICT',t('工作区已改变。'));
              const roots=(args.includeRoots||[]).map(path=>relativePath(path,true));
              if(!roots.length) throw error('E_INVALID_DATA',t('快照范围不能为空。'));
              ctx.progress({phase:'snapshot'});
              const result=await this.call(binding,'snapshotCreate',{
                root:p.root,
                workspaceId:p.id,
                label:args.label,
                includeRoots:roots,
                workspace:JSON.stringify(this.state()),
                entries:tree.entries.map(e=>this.publicEntry(e)),
                taskId:ctx.id
              });
              return {...result,revision:tree.revision};
            }),
          options
        ),
      list:args=>{
        const p=this.permission(binding,args.workspaceId);
        return this.call(binding,'snapshotList',{workspaceId:p.id});
      },
      restore:(args,options={})=>
        this.task(
          binding,
          async ctx=>{
            const p=this.permission(binding,args.workspaceId),
              tree=await this.entries(binding,p);
            if(tree.revision!==args.expectedWorkspaceRevision)
              throw error('E_CONFLICT',t('工作区已改变。'));
            const record=await this.call(binding,'snapshotEntries',{
              snapshotId:args.snapshotId,
              workspaceId:p.id
            });
            if(
              !(await this.host.confirm(
                t('恢复项目快照'),
                say(
                  `恢复“${record.label}”？会先保存当前项目的安全快照。`,
                  `Restore “${record.label}”? A safety snapshot of the current project will be saved first.`
                )
              ))
            )
              throw error('E_CANCELLED',t('恢复已取消。'));
            const safety=api.snapshots.create(
              {
                workspaceId:p.id,
                expectedWorkspaceRevision:tree.revision,
                label:t('恢复前安全快照'),
                includeRoots:['']
              },
              {signal:ctx.signal}
            );
            const safetyResult=await safety.result;
            ctx.check();
            const staged=await this.call(binding,'snapshotStage',{
                snapshotId:args.snapshotId,
                workspaceId:p.id,
                root:p.root,
                taskId:ctx.id
              }),
              changes=[],
              saved=new Map(record.entries.map(e=>[e.path,e])),
              extras=tree.entries.filter(
                e=>record.includeRoots.some(root=>within(root,e.path))&&!saved.has(e.path)
              );
            for(const e of staged.entries)
              if(e.blobId)
                binding.blobs.set(e.blobId,{
                  ...e,
                  workspaceId:p.id,
                  finished:true,
                  taskId:ctx.id
                });
            for(const e of extras.filter(
              e=>!extras.some(parent=>parent!==e&&within(parent.path,e.path))
            ))
              changes.push({
                kind:'delete',
                path:e.path,
                expectedRevision:e.revision,
                recursive:true,
                mode:'trash'
              });
            for(const e of staged.entries){
              const current=tree.entries.find(old=>old.path===e.path);
              if(e.kind==='directory'){
                if(
                  !current&&
                  !staged.entries.some(other=>other!==e&&within(e.path,other.path))
                )
                  changes.push({kind:'mkdir',path:e.path});
                continue;
              }
              if(current?.revision===e.revision&&current?.entryId===e.entryId) continue;
              const full=(p.root?p.root + '/':'') + e.path,
                doc=this.state().documents.find(d=>documentPath(d)===full);
              if(
                doc||
                JSON.parse(record.workspace||'{}').documents?.some(
                  d=>documentPath(d)===full
                )||
                e.path==='.vela'||
                e.path.endsWith('/.vela')
              ){
                const parts=[];
                let offset=0;
                while(offset<e.size){
                  ctx.check();
                  const part=await this.call(binding,'read',{
                    snapshotId:args.snapshotId,
                    path:e.path,
                    offset,
                    length:Math.min(this.capabilities.limits.readChunkBytes,e.size - offset),
                    expectedRevision:e.revision
                  });
                  const data=fromBase64(part.data);
                  parts.push(data);
                  offset+=data.length;
                }
                const data=new Uint8Array(e.size);
                let at=0;
                for(const part of parts){
                  data.set(part,at);
                  at+=part.length;
                }
                changes.push({
                  kind:'writeText',
                  path:e.path,
                  text:new TextDecoder('utf-8',{fatal:true}).decode(data),
                  expectedRevision:current?.revision??null
                });
              } else {
                binding.blobs.set(e.blobId,{
                  ...e,
                  workspaceId:p.id,
                  finished:true,
                  taskId:ctx.id
                });
                changes.push({
                  kind:'writeBlob',
                  path:e.path,
                  blobId:e.blobId,
                  expectedRevision:current?.revision??null
                });
              }
            }
            if(!changes.length)
              return {revision:tree.revision,safetySnapshotId:safetyResult.snapshotId};
            const result=await this.batch(
              binding,
              {
                workspaceId:p.id,
                expectedWorkspaceRevision:tree.revision,
                idempotencyKey:ctx.id,
                changes,
                label:t('恢复项目快照')
              },
              {signal:ctx.signal,origin:'restore',restoreMetadata:record},
              ctx
            );
            return {revision:result.workspaceRevision,safetySnapshotId:safetyResult.snapshotId};
          },
          options
        )
    };
  },
  extendAssets(api,binding){
    const urls=new Map(),
      sessions=new Map();
    binding.resources.add(()=>{
      for(const url of urls.values()) URL.revokeObjectURL(url);
    });
    api.assets={
      openSession:async args=>{
        const p=this.permission(binding,args.workspaceId);
        if(
          !['editor','preview'].includes(args.purpose)||
          !Array.isArray(args.allowedRoots)||
          !args.allowedRoots.length
        )
          throw error('E_INVALID_DATA',t('资源会话范围无效。'));
        const allowedRoots=args.allowedRoots.map(path=>relativePath(path,true));
        if(args.purpose==='preview'&&!args.snapshotId)
          throw error('E_INVALID_DATA',t('试演资源必须绑定快照。'));
        const result=await this.call(binding,'assetOpen',{
          root:p.root,
          workspaceId:p.id,
          snapshotId:args.snapshotId,
          allowedRoots,
          purpose:args.purpose
        });
        sessions.set(result.sessionId,{workspaceId:p.id,...args});
        return result;
      },
      resolve:async args=>{
        this.alive(binding);
        const s=sessions.get(args.sessionId);
        if(!s) throw error('E_NOT_FOUND',t('资源会话不存在。'));
        const path=relativePath(args.path);
        if(!s.allowedRoots.some(root=>within(root,path)))
          throw error('E_PERMISSION',t('资源不在授权范围内。'));
        const result=await this.call(binding,'assetResolve',{
          sessionId:args.sessionId,
          path,
          expectedRevision:args.expectedRevision
        });
        if(result.url) return result;
        const key=args.sessionId + ':' + path;
        if(urls.has(key)) URL.revokeObjectURL(urls.get(key));
        const blob=result.blob||new Blob([fromBase64(result.data)],{type:result.mime}),
          url=URL.createObjectURL(blob);
        urls.set(key,url);
        return {...result,url,data:undefined,blob:undefined,supportsRange:false};
      },
      release:async args=>{
        this.alive(binding);
        await this.call(binding,'assetRelease',args);
        sessions.delete(args.sessionId);
        for(const [key,url] of urls)
          if(key.startsWith(args.sessionId + ':')){
            URL.revokeObjectURL(url);
            urls.delete(key);
          }
      }
    };
  },
  extendPreview(api,binding){
    const previews=new Map();
    binding.resources.add(()=>{
      for(const record of previews.values()){
        clearInterval(record.timer);
        record.listeners.clear();
      }
    });
    api.preview={
      open:async args=>{
        this.alive(binding);
        if(!this.capabilities.features.independentPreview)
          throw error('E_UNSUPPORTED',t('此平台支持插件页内试演，请在插件页面中运行。'));
        if(args.network!=='none') throw error('E_INVALID_DATA',t('独立试演不允许网络访问。'));
        const asset=relativePath(args.runtime?.pluginAsset),
          runtime=this.host.pluginAsset(binding.id,asset);
        if(!runtime||!/\.(html?|js)$/i.test(asset))
          throw error('E_INVALID_DATA',t('试演入口必须来自当前插件包。'));
        const result=await this.call(binding,'previewOpen',{
          ...args,
          runtime:{path:asset,data:runtime,files:this.host.pluginAssets?.(binding.id)||{}},
          initialState:jsonObject(args.initialState||{},65536),
          contentRoot:relativePath(args.contentRoot??'',true)
        });
        previews.set(result.previewId,{listeners:new Set(),timer:null});
        return result;
      },
      reload:args=>{
        this.alive(binding);
        if(!previews.has(args.previewId)) throw error('E_NOT_FOUND',t('试演不存在。'));
        return this.call(binding,'previewReload',args);
      },
      close:async args=>{
        this.alive(binding);
        await this.call(binding,'previewClose',args);
      },
      on:(id,listener)=>{
        this.alive(binding);
        const record=previews.get(id);
        if(!record||typeof listener!=='function')
          throw error('E_NOT_FOUND',t('试演不存在。'));
        record.listeners.add(listener);
        if(!record.timer)
          record.timer=setInterval(async ()=>{
            if(binding.stopped) return;
            try {
              const events=await this.call(binding,'previewEvents',{previewId:id});
              for(const event of events) for(const fn of record.listeners) fn(event);
            } catch {
              clearInterval(record.timer);
              record.timer=null;
            }
          },500);
        return ()=>{
          record.listeners.delete(listener);
          if(!record.listeners.size){
            clearInterval(record.timer);
            record.timer=null;
          }
        };
      }
    };
  }
};
