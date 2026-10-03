import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ProjectService} from '../web/project-service.mjs';
import {PluginTasks} from '../web/plugin-tasks.mjs';
import {relativePath,mime} from '../web/project-contract.mjs';
import {checkPluginCompatibility} from '../web/plugin-package.mjs';
import {WorkspaceStorage} from '../windows/storage.mjs';
import {ProjectStore} from '../windows/project-store.mjs';
import {newDocument} from '../web/model.mjs';
import {createVelaV2,velaText,parseVela} from '../web/vela.mjs';
import {DocumentService} from '../web/document-service.mjs';
import {inspectZip,crc32} from '../web/project-archive.mjs';
import {zipSync,strToU8} from 'fflate';

async function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'vela-project-')),store=new WorkspaceStorage(base),backend=new ProjectStore(store),config=createVelaV2('工程'),doc=newDocument('.vela',velaText(config));doc.path='工程/.vela';
 const outside=newDocument('outside.txt','未保存修改必须保留');let workspace={version:1,documents:[doc,outside],folders:['工程'],storage:{id:store.id},activeId:doc.id,openIds:[doc.id],settings:{}};store.saveWorkspace(JSON.stringify(workspace));
 const documents=new DocumentService({workspace:()=>workspace,write:w=>store.saveWorkspace(JSON.stringify(w))});for(const doc of workspace.documents)documents.register(doc);let confirms=0;
 const host={workspace:()=>workspace,current:()=>workspace.documents.find(d=>d.id===workspace.activeId),platform:'windows',confirm:async()=>{confirms++;return true;},fail:e=>{throw e;},userGesture:()=>true,lock:async()=>{documents.save();return ()=>{};},prepare:w=>documents.prepareProject(w),adopt:w=>{workspace=w;documents.committedProject();},openDocument:async()=>({}),pluginAsset:()=>null};
 const manager=new ProjectService(host,backend);await manager.ready();const binding=manager.bind('test.scenario','工坊'),api=binding.api;await api.workspace.open({workspaceId:config.id});
 return {base,store,backend,config,manager,binding,api,documents,host,state:()=>workspace,confirms:()=>confirms,close:async()=>{await binding.stop();fs.rmSync(base,{recursive:true,force:true});}};
}
const batch=async(f,changes,key=crypto.randomUUID())=>f.api.fs.applyBatch({workspaceId:f.config.id,expectedWorkspaceRevision:(await f.api.workspace.current()).revision,idempotencyKey:key,label:'测试事务',changes});

test('host file rename preserves lazy text identity and watch aggregates one transaction',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'Makefile',text:'all:\n\techo Vela',expectedRevision:null}]);const before=await f.api.fs.stat({workspaceId:f.config.id,path:'Makefile'}),events=[],off=f.api.fs.watch({workspaceId:f.config.id,paths:['']},event=>events.push(event));await new Promise(r=>setTimeout(r,20));
 await batch(f,[{kind:'writeText',path:'a.json',text:'{}',expectedRevision:null},{kind:'writeText',path:'b.csv',text:'a,b',expectedRevision:null}],'watch');f.manager.changed('editor');await new Promise(r=>setTimeout(r,100));assert.equal(events.length,1);assert.equal(events[0].origin,'plugin');assert.ok(events[0].transactionId);
 const moved=f.store.manage('move','工程/Makefile','工程/Buildfile');f.state().pluginProject=moved.pluginProject;f.manager.changed('external');await new Promise(r=>setTimeout(r,120));const entry=await f.api.fs.stat({workspaceId:f.config.id,path:'Buildfile'});assert.equal(entry.entryId,before.entryId);assert.equal(entry.textEditable,true);assert.ok(!moved.documents.some(d=>d.name==='Buildfile'));assert.ok(events.some(e=>e.origin==='external'&&e.changes.some(c=>c.kind==='move'&&c.entryId===before.entryId)));off();
 }finally{await f.close();}});

test('plugin stop waits for an already committing direct batch before native cleanup',async()=>{const f=await fixture();try{
 const original=f.backend.call.bind(f.backend);let entered,continueCommit;const signal=new Promise(r=>entered=r),gate=new Promise(r=>continueCommit=r);f.backend.call=async(action,owner,args)=>{if(action==='apply'){entered();await gate;}return original(action,owner,args);};
 const pending=batch(f,[{kind:'writeText',path:'committed.json',text:'{"ok":true}',expectedRevision:null}]);await signal;let stopped=false;const stop=f.binding.stop().then(()=>stopped=true);await new Promise(r=>setTimeout(r,20));assert.equal(stopped,false);continueCommit();await pending;await stop;assert.equal(fs.readFileSync(f.store.target('工程/committed.json'),'utf8'),'{"ok":true}');assert.equal(stopped,true);await assert.rejects(f.api.fs.stat({workspaceId:f.config.id,path:'committed.json'}),e=>e.code==='E_PLUGIN_STOPPED');
 }finally{fs.rmSync(f.base,{recursive:true,force:true});}});

test('an unfinished system picker never blocks plugin stop or returns a late token',async()=>{const f=await fixture();try{
 const original=f.backend.call.bind(f.backend);let selected,pickerOwner;f.backend.call=(action,owner,args)=>{if(action==='pick'){pickerOwner=owner;return new Promise(r=>selected=r);}return original(action,owner,args);};const pending=f.api.io.pickFiles({accept:['.png'],multiple:false});const rejected=assert.rejects(pending,e=>e.code==='E_PLUGIN_STOPPED');await f.binding.stop();await rejected;selected({cancelled:false,selections:[{token:'late',name:'test.png'}]});await new Promise(r=>setTimeout(r,20));assert.equal(f.backend.stopped.has(pickerOwner),true);assert.throws(()=>f.backend.check(pickerOwner),e=>e.code==='E_PLUGIN_STOPPED');
 }finally{fs.rmSync(f.base,{recursive:true,force:true});}});

test('v3 paths, MIME and manifest gates reject invalid contracts',()=>{
 for(const p of ['../secret','/absolute','a\\b','a//b','CON.txt','a/.git/config','a/..','NUL','a:foo'])assert.throws(()=>relativePath(p),e=>e.code==='E_INVALID_PATH');
 assert.equal(mime('音频.ogg'),'audio/ogg');assert.equal(mime('movie.ogv'),'video/ogg');assert.equal(mime('视频.mp4'),'video/mp4');
 checkPluginCompatibility({vela:{api:'>=3 <4',requiredCapabilities:['filesystem-v1']}},3,['filesystem-v1']);checkPluginCompatibility({},3,[]);
 assert.throws(()=>checkPluginCompatibility({vela:{api:'>=4 <5'}},3,[]),e=>e.code==='E_UNSUPPORTED');assert.throws(()=>checkPluginCompatibility({vela:{api:'>=3 <4',requiredCapabilities:['snapshots-v1']}},3,[]),e=>e.code==='E_UNSUPPORTED');
});

test('pagination cursor roundtrips a Unicode directory without exposing a native path',async()=>{const f=await fixture();try{
 await batch(f,[1,2,3].map(n=>({kind:'writeText',path:'中文目录/数据'+n+'.json',text:'{}',expectedRevision:null})));
 const first=await f.api.fs.list({workspaceId:f.config.id,path:'中文目录',limit:2}),next=await f.api.fs.list({workspaceId:f.config.id,path:'中文目录',limit:2,cursor:first.nextCursor});assert.equal(first.entries.length,2);assert.equal(next.entries.length,1);assert.equal(new Set([...first.entries,...next.entries].map(e=>e.path)).size,3);
 }finally{await f.close();}});

test('mobile ZIP preflight rejects traversal, links, duplicate aliases and forged lengths',()=>{
 const good=zipSync({'数据.json':[strToU8('{"ok":true}'),{mtime:new Date('1980-01-01T00:00:00Z')}],'empty/':new Uint8Array(0)});
 assert.equal(inspectZip(good).entries.length,2);assert.equal(crc32(strToU8('123456789')),0xcbf43926);
 assert.throws(()=>inspectZip(zipSync({'../secret':strToU8('x')})),e=>e.code==='E_INVALID_PATH');
 assert.throws(()=>inspectZip(zipSync({'A.json':strToU8('1'),'a.json':strToU8('2')})),e=>e.code==='E_INVALID_DATA');
 const symlink=good.slice(),v=new DataView(symlink.buffer);let central=-1;for(let p=0;p<symlink.length-46;p++)if(v.getUint32(p,true)===0x02014b50){central=p;break;}v.setUint32(central+38,0xa1ff0000,true);assert.throws(()=>inspectZip(symlink),e=>e.code==='E_INVALID_DATA');
 const huge=good.slice(),hv=new DataView(huge.buffer);hv.setUint32(central+24,9*1024*1024,true);assert.throws(()=>inspectZip(huge),e=>e.code==='E_INVALID_DATA');
});

test('lost native reply recovers the persistent receipt and never repeats the commit',async()=>{const f=await fixture();try{
 const original=f.backend.call.bind(f.backend);let commits=0;f.backend.call=async(action,owner,args)=>{const result=await original(action,owner,args);if(action==='apply'){commits++;throw Error('reply lost after commit');}return result;};
 const receipt=await batch(f,[{kind:'writeText',path:'result.json',text:'{"complete":true}',expectedRevision:null}]);assert.equal(commits,1);assert.ok(receipt.transactionId);assert.equal((await f.api.fs.readText({workspaceId:f.config.id,path:'result.json'})).text,'{"complete":true}');
 }finally{await f.close();}});

test('lazy data remains lazy after native restart and explicit text formats stay readable',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'Makefile',text:'all:\n\tprintf done',expectedRevision:null},{kind:'writeText',path:'scene.csv',text:'a,b\n1,2',expectedRevision:null}]);
 const scanned=new WorkspaceStorage(f.base).scan();assert.equal(scanned.documents.some(d=>d.name==='scene.csv'),false);assert.equal(scanned.entries.find(e=>e.name==='scene.csv').editable,true);assert.equal((await f.api.fs.readText({workspaceId:f.config.id,path:'Makefile'})).text,'all:\n\tprintf done');
 await assert.rejects(batch(f,[{kind:'writeText',path:'SCENE.csv',text:'conflict',expectedRevision:null}]),e=>e.code==='E_EXISTS');
 }finally{await f.close();}});

test('restoring a moved file restores its captured stable ID and leaves snapshot objects intact',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'source.txt',text:'captured',expectedRevision:null}]);const before=await f.api.fs.stat({workspaceId:f.config.id,path:'source.txt'}),handle=await f.api.workspace.current(),snap=await f.api.snapshots.create({workspaceId:f.config.id,expectedWorkspaceRevision:handle.revision,label:'before move',includeRoots:['']}).result;
 await batch(f,[{kind:'move',from:'source.txt',to:'renamed.txt',expectedRevision:before.revision}]);await f.api.snapshots.restore({workspaceId:f.config.id,snapshotId:snap.snapshotId,expectedWorkspaceRevision:(await f.api.workspace.current()).revision}).result;
 assert.equal((await f.api.fs.stat({workspaceId:f.config.id,path:'source.txt'})).entryId,before.entryId);assert.equal((await f.api.fs.readText({workspaceId:f.config.id,path:'source.txt'})).text,'captured');assert.ok(fs.existsSync(path.join(f.backend.objects,before.revision.slice(2))));
 }finally{await f.close();}});
test('project handles, full directory listing, stale cursors and unrelated dirty text',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'mkdir',path:'Empty'},{kind:'writeText',path:'角色.csv',text:'id,name\nhero,主角',expectedRevision:null},{kind:'writeText',path:'对白.json',text:'{"scene":1}',expectedRevision:null}]);
 const handle=await f.api.workspace.current();assert.equal(handle.id,f.config.id);assert.ok(!JSON.stringify(handle).includes(f.base));const page=await f.api.fs.list({workspaceId:handle.id,path:'',limit:1});assert.ok(page.nextCursor);assert.ok((await f.api.fs.list({workspaceId:handle.id,path:'',recursive:true})).entries.some(e=>e.kind==='directory'&&e.path==='Empty'));
 const read=await f.api.fs.readText({workspaceId:handle.id,path:'角色.csv'});assert.equal(read.text,'id,name\nhero,主角');assert.equal(f.state().documents.some(d=>d.path==='工程/角色.csv'),false);assert.deepEqual(parseVela(f.state().documents.find(d=>d.name==='.vela').text).reading.items,[]);
 const outside=f.state().documents.find(d=>d.name==='outside.txt');outside.text+='新内容';await batch(f,[{kind:'writeText',path:'对白.json',text:'{"scene":2}',expectedRevision:(await f.api.fs.stat({workspaceId:handle.id,path:'对白.json'})).revision}]);assert.match(f.state().documents.find(d=>d.id===outside.id).text,/新内容/);
 await assert.rejects(f.api.fs.list({workspaceId:handle.id,path:'',limit:1,cursor:page.nextCursor}),e=>e.code==='E_STALE_CURSOR');assert.equal(f.confirms(),1);
 }finally{await f.close();}});
test('cross-file writes reject stale revisions, preserve IDs on move and are idempotent',async()=>{const f=await fixture();try{
 const handle=await f.api.workspace.current(),args={workspaceId:handle.id,expectedWorkspaceRevision:handle.revision,idempotencyKey:'same-request',label:'建立工程',changes:[{kind:'writeText',path:'a.json',text:'{"id":"hero"}',expectedRevision:null},{kind:'writeText',path:'b.csv',text:'hero,main',expectedRevision:null},{kind:'writeText',path:'c.txt',text:'hero',expectedRevision:null}]};const receipt=await f.api.fs.applyBatch(args);assert.deepEqual(await f.api.fs.applyBatch(args),receipt);await assert.rejects(f.api.fs.applyBatch({...args,label:'另一个请求'}),e=>e.code==='E_INVALID_DATA');
 const a=await f.api.fs.stat({workspaceId:handle.id,path:'a.json'});await batch(f,[{kind:'move',from:'a.json',to:'renamed.json',expectedRevision:a.revision}]);assert.equal((await f.api.fs.stat({workspaceId:handle.id,path:'renamed.json'})).entryId,a.entryId);await assert.rejects(f.api.fs.applyBatch({...args,idempotencyKey:'different'}),e=>e.code==='E_CONFLICT');
 }finally{await f.close();}});
test('mid-commit error rolls back files and both cached indexes',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'a.txt',text:'old-a',expectedRevision:null},{kind:'writeText',path:'b.txt',text:'old-b',expectedRevision:null}]);const a=await f.api.fs.stat({workspaceId:f.config.id,path:'a.txt'}),b=await f.api.fs.stat({workspaceId:f.config.id,path:'b.txt'}),before=f.store.readWorkspace(),original=f.store.transaction.bind(f.store);f.store.transaction=fn=>original(tx=>{const write=tx.write.bind(tx);tx.write=(file,data)=>{if(file.endsWith('b.txt'))throw new Error('injected disk failure');return write(file,data);};return fn(tx);});
 await assert.rejects(batch(f,[{kind:'writeText',path:'a.txt',text:'new-a',expectedRevision:a.revision},{kind:'writeText',path:'b.txt',text:'new-b',expectedRevision:b.revision}]));assert.equal(fs.readFileSync(f.store.target('工程/a.txt'),'utf8'),'old-a');assert.equal(fs.readFileSync(f.store.target('工程/b.txt'),'utf8'),'old-b');assert.equal(f.store.readWorkspace(),before);assert.equal(fs.readdirSync(f.store.transactions).length,0);
 }finally{await f.close();}});
test('interrupted native project transaction recovers before workspace load',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'a.txt',text:'old-a',expectedRevision:null},{kind:'writeText',path:'b.txt',text:'old-b',expectedRevision:null}]);const module=new URL('../windows/storage.mjs',import.meta.url).href;
 const script='import {WorkspaceStorage} from '+JSON.stringify(module)+';const s=new WorkspaceStorage('+JSON.stringify(f.base)+');s.transaction(tx=>{tx.write(s.target("工程/a.txt"),"partial");process.exit(72);});';const child=spawnSync(process.execPath,['--input-type=module','-e',script]);assert.equal(child.status,72);new WorkspaceStorage(f.base);assert.equal(fs.readFileSync(f.store.target('工程/a.txt'),'utf8'),'old-a');assert.equal(fs.readdirSync(f.store.transactions).length,0);
 }finally{await f.close();}});
test('chunk retries, binary revisions, scoped Range URLs and resource release',async()=>{const f=await fixture();try{
 const data=Uint8Array.from([0,137,80,78,71,255,1]),start=await f.api.fs.beginWrite({workspaceId:f.config.id,size:data.length,mime:'image/png'});const a=await f.api.fs.writeChunk({blobId:start.blobId,sequence:0,bytes:data});assert.deepEqual(await f.api.fs.writeChunk({blobId:start.blobId,sequence:0,bytes:data}),a);await assert.rejects(f.api.fs.writeChunk({blobId:start.blobId,sequence:0,bytes:new Uint8Array([1])}),e=>e.code==='E_INVALID_DATA');await f.api.fs.finishWrite(start);await batch(f,[{kind:'writeBlob',path:'素材/透明.png',blobId:start.blobId,expectedRevision:null}]);
 const read=await f.api.fs.readBytes({workspaceId:f.config.id,path:'素材/透明.png',offset:1,length:3});assert.deepEqual([...read.bytes],[137,80,78]);const session=await f.api.assets.openSession({workspaceId:f.config.id,allowedRoots:['素材'],purpose:'editor'}),asset=await f.api.assets.resolve({...session,path:'素材/透明.png'});assert.equal(asset.mime,'image/png');assert.ok(asset.supportsRange);
 const response=await f.backend.resource(new Request(asset.url,{headers:{Range:'bytes=1-3'}}));assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 1-3/7');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[137,80,78]);await assert.rejects(f.api.assets.resolve({...session,path:'.vela'}),e=>e.code==='E_PERMISSION');await f.api.assets.release(session);assert.equal((await f.backend.resource(new Request(asset.url))).status,403);
 }finally{await f.close();}});
test('fixed snapshots, deterministic ZIP, hashes and safety restore',async()=>{const f=await fixture();try{
 await batch(f,[{kind:'writeText',path:'场景.json',text:'{"title":"中文路径"}',expectedRevision:null},{kind:'mkdir',path:'Empty'}]);const handle=await f.api.workspace.current(),snapshot=await f.api.snapshots.create({workspaceId:f.config.id,expectedWorkspaceRevision:handle.revision,label:'发布',includeRoots:['']}).result;
 const binding=[...f.manager.bindings.values()][0],args={pluginId:binding.id,snapshotId:snapshot.snapshotId,root:'',paths:['.vela','场景.json','Empty'],deterministic:true};const first=await f.backend.archiveExport(binding.owner,args),second=await f.backend.archiveExport(binding.owner,args);assert.equal(first.sha256,second.sha256);const selected=await f.backend.selection(binding.owner,f.backend.outputs.get(first.outputToken).file),inspect=await f.backend.archiveInspect(binding.owner,{selectionToken:selected.token});assert.ok(inspect.entries.some(e=>e.path==='Empty'&&e.directory));assert.equal(Buffer.from((await f.backend.archiveRead(binding.owner,{archiveToken:inspect.archiveToken,path:'场景.json'})).data,'base64').toString(),'{"title":"中文路径"}');
 const read=await f.api.fs.stat({workspaceId:f.config.id,path:'场景.json'});await batch(f,[{kind:'writeText',path:'场景.json',text:'changed',expectedRevision:read.revision}]);const restored=await f.api.snapshots.restore({workspaceId:f.config.id,snapshotId:snapshot.snapshotId,expectedWorkspaceRevision:(await f.api.workspace.current()).revision}).result;assert.ok(restored.safetySnapshotId);assert.equal((await f.api.fs.readText({workspaceId:f.config.id,path:'场景.json'})).text,'{"title":"中文路径"}');
 }finally{await f.close();}});
test('task cancellation honors commit point; stopped SDK objects refuse writes',async()=>{const tasks=new PluginTasks();let ready;const gate=new Promise(r=>ready=r);const t=tasks.start('owner',async ctx=>{await gate;ctx.check();return 1;});await t.cancel();ready();await assert.rejects(t.result,e=>e.code==='E_CANCELLED');let committed;const point=new Promise(r=>committed=r);const done=tasks.start('owner',async ctx=>{ctx.commit();committed();await new Promise(r=>setTimeout(r,10));return 2;});await point;await done.cancel();assert.equal(await done.result,2);const f=await fixture();try{await f.binding.stop();await assert.rejects(f.api.workspace.current(),e=>e.code==='E_PLUGIN_STOPPED');}finally{fs.rmSync(f.base,{recursive:true,force:true});}});
