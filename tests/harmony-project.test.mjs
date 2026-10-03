import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const compile=entry=>build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',resolveExtensions:['.ets','.js'],loader:{'.ets':'ts'},plugins:[{name:'kit-fixture',setup(p){p.onResolve({filter:/^@kit\./},a=>({path:a.path,namespace:'kit'}));p.onLoad({filter:/.*/,namespace:'kit'},a=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(a.path)}];`}));}}]});
const [projectModule,storageModule]=await Promise.all([compile('entry/src/main/ets/services/ProjectFiles.ets'),compile('entry/src/main/ets/services/WorkspaceFiles.ets')]);
async function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'vela-harmony-project-'));t.after(()=>{assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(base,{recursive:true,force:true});});let failure='';
 const guardedRemove=p=>{assert.ok(path.resolve(p).startsWith(path.resolve(base)+path.sep));fs.rmSync(p,{recursive:true});};
 const stat=value=>{const s=typeof value==='number'?fs.fstatSync(value):fs.statSync(value);return {size:s.size,mtime:s.mtimeMs/1000,isDirectory:()=>s.isDirectory(),isFile:()=>s.isFile(),isSymbolicLink:()=>s.isSymbolicLink()};};
 const sdk={
  '@kit.AbilityKit':{},'@kit.CoreFileKit':{picker:{},fileUri:{},fileIo:{OpenMode:{READ_ONLY:0,CREATE:1,READ_WRITE:2,TRUNC:4,APPEND:8},accessSync:p=>fs.existsSync(p),readTextSync:p=>fs.readFileSync(p,'utf8'),openSync:(p,m)=>({fd:fs.openSync(p,m&4?'w':m&8?'a':m&2?'r+':'r')}),closeSync:f=>fs.closeSync(f.fd),fsyncSync:fd=>fs.fsyncSync(fd),readSync:(fd,b,o)=>fs.readSync(fd,new Uint8Array(b),0,b.byteLength,o?.offset??null),writeSync:(fd,b)=>fs.writeSync(fd,new Uint8Array(b)),statSync:stat,lstatSync:p=>{const s=fs.lstatSync(p);return {size:s.size,mtime:s.mtimeMs/1000,isDirectory:()=>s.isDirectory(),isFile:()=>s.isFile(),isSymbolicLink:()=>s.isSymbolicLink()};},copyFileSync:(a,b)=>fs.copyFileSync(a,b),renameSync:(a,b)=>{if(failure&&b.endsWith(failure)){failure='';throw Error('injected native failure');}fs.renameSync(a,b);},mkdirSync:(p,r)=>fs.mkdirSync(p,{recursive:!!r}),listFileSync:p=>fs.readdirSync(p),rmdirSync:guardedRemove,unlinkSync:p=>fs.unlinkSync(p)}},
  '@kit.ArkTS':{util:{generateRandomUUID:randomUUID,TextEncoder:class{encodeInto(s){return new TextEncoder().encode(s);}},TextDecoder:{create:encoding=>({decodeToString:b=>new TextDecoder(encoding).decode(b)})},Base64Helper:class{encodeToStringSync(b){return Buffer.from(b).toString('base64');}decodeSync(s){return new Uint8Array(Buffer.from(s,'base64'));}}}},
  '@kit.CryptoArchitectureKit':{cryptoFramework:{createMd:()=>{const hash=createHash('sha256');return {updateSync:b=>hash.update(b.data),digestSync:()=>({data:new Uint8Array(hash.digest())})};}}}
 };
 const load=compiled=>{const module={exports:{}},context=vm.createContext({sdk,module,exports:module.exports,Error,Map,Set,Uint8Array,ArrayBuffer,Date,decodeURIComponent});new vm.Script(compiled.outputFiles[0].text).runInContext(context);return module.exports;};
 const {WorkspaceFiles}=load(storageModule),{ProjectFiles}=load(projectModule),context={filesDir:base},files=new WorkspaceFiles();files.context=context;const folder=await files.initialize();
 const doc={id:'guide',path:'工程/正文.txt',name:'正文.txt',text:'正文',updatedAt:1,remote:null},workspace={version:1,documents:[doc],folders:['工程'],storage:folder.storage};files.mirror(JSON.stringify(workspace));fs.writeFileSync(path.join(base,'workspace.json'),JSON.stringify(workspace));
 const create=()=>{const native=new ProjectFiles();native.context=context;native.recover();return native;};const native=create(),call=(action,args={},owner='session')=>native.call(action,owner,JSON.stringify(args));
 return {base,root:path.join(base,'workspaces/文舟'),workspace,doc,files,create,call,failOnce:suffix=>failure=suffix};
}
test('Harmony project binary chunks preserve bytes, directories and conditional indexes',async t=>{const f=await fixture(t),data=Uint8Array.from([0,255,137,80,78,71]),start=await f.call('begin',{root:'工程',size:data.length,mime:'image/png'}),args={blobId:start.blobId,sequence:0,data:Buffer.from(data).toString('base64')};
 const first=await f.call('chunk',args);assert.equal((await f.call('chunk',args)).nextSequence,first.nextSequence);await f.call('finish',start);
 await f.call('apply',{root:'工程',expected:[{path:'图片.png',revision:null}],changes:[{kind:'mkdir',path:'空目录'},{kind:'writeBlob',path:'图片.png',blobId:start.blobId}],workspace:JSON.stringify(f.workspace)});
 const tree=await f.call('tree',{root:'工程'});assert.ok(tree.entries.some(e=>e.path==='空目录'&&e.kind==='directory'));const read=await f.call('read',{root:'工程',path:'图片.png',offset:1,length:3});assert.deepEqual([...Buffer.from(read.data,'base64')],[255,137,80]);
 await assert.rejects(f.call('apply',{root:'工程',expected:[{path:'图片.png',revision:null}],changes:[{kind:'writeText',path:'图片.png',text:'unsafe'}],workspace:JSON.stringify(f.workspace)}),e=>e.projectCode==='E_CONFLICT');assert.deepEqual(fs.readFileSync(path.join(f.root,'工程/图片.png')),Buffer.from(data));
});
test('Harmony project failure restores payload and both indexes; delete is recoverable by host trash',async t=>{const f=await fixture(t),before=fs.readFileSync(path.join(f.base,'workspace.json'),'utf8'),tree=await f.call('tree',{root:'工程'}),rev=tree.entries.find(e=>e.path==='正文.txt').revision;
 f.failOnce('folder-'+f.workspace.storage.id+'.json');await assert.rejects(f.call('apply',{root:'工程',expected:[{path:'正文.txt',revision:rev}],changes:[{kind:'writeText',path:'正文.txt',text:'new'}],workspace:JSON.stringify({...f.workspace,documents:[{...f.doc,text:'new'}]})}));assert.equal(fs.readFileSync(path.join(f.root,'工程/正文.txt'),'utf8'),'正文');assert.equal(fs.readFileSync(path.join(f.base,'workspace.json'),'utf8'),before);
 await f.call('apply',{root:'工程',expected:[{path:'正文.txt',revision:rev}],changes:[{kind:'delete',path:'正文.txt'}],workspace:JSON.stringify({...f.workspace,documents:[]}),removedDocuments:[f.doc]});const items=f.files.listTrash();assert.equal(items.length,1);f.files.restoreTrash(items[0].id,false);assert.equal(fs.readFileSync(path.join(f.root,'工程/正文.txt'),'utf8'),'正文');
});
test('Harmony recovery runs before reads and snapshots preserve immutable content',async t=>{const f=await fixture(t),file=path.join(f.root,'工程/正文.txt'),journal=path.join(f.base,'project-data/transaction');fs.mkdirSync(journal);fs.copyFileSync(file,path.join(journal,'0'));fs.writeFileSync(path.join(journal,'journal.json'),JSON.stringify({committed:false,entries:[{target:f.base+'/workspaces/文舟/工程/正文.txt',backup:f.base+'/project-data/transaction/0',exists:true}]}));fs.writeFileSync(file,'partial');f.create();assert.equal(fs.readFileSync(file,'utf8'),'正文');
 const tree=await f.call('tree',{root:'工程'}),snapshot=await f.call('snapshotCreate',{root:'工程',workspaceId:'project',pluginId:'test.plugin',includeRoots:[''],label:'fixed',workspace:JSON.stringify(f.workspace),entries:tree.entries});fs.writeFileSync(file,'changed');const read=await f.call('read',{snapshotId:snapshot.snapshotId,pluginId:'test.plugin',path:'正文.txt',offset:0,length:100});assert.equal(Buffer.from(read.data,'base64').toString(),'正文');await assert.rejects(f.call('snapshotEntries',{snapshotId:snapshot.snapshotId,pluginId:'other.plugin',workspaceId:'project'}),e=>e.projectCode==='E_PERMISSION');
});
