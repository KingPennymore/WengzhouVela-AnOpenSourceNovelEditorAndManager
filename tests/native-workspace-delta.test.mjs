import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {workspaceDelta} from '../web/platform.mjs';

// The HarmonyOS incremental save (WorkspaceFiles.saveDelta, WorkspaceStore.ets) run against a Node file system shim,
// like tests/native-workspace.test.mjs. The full save is NativeBridge.writeWorkspace: mirror() then workspace.json.
const compiled=await build({entryPoints:['entry/src/main/ets/services/WorkspaceFiles.ets'],bundle:true,write:false,platform:'node',format:'cjs',resolveExtensions:['.ets','.js'],loader:{'.ets':'ts'},plugins:[{name:'sdk',setup(p){p.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));p.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(args.path)}];`}));}}]});
const hydrate=await build({entryPoints:['entry/src/main/ets/services/WorkspaceStore.ets'],bundle:true,write:false,platform:'node',format:'cjs',resolveExtensions:['.ets','.js'],loader:{'.ets':'ts'},plugins:[{name:'sdk',setup(p){p.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));p.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(args.path)}];`}));}}]});
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wenzhou-delta-')),sandbox=path.join(root,'sandbox');fs.mkdirSync(sandbox);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sdk={'@kit.AbilityKit':{},'@kit.CoreFileKit':{fileIo:{OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4,READ_ONLY:0},accessSync:p=>fs.existsSync(p),readTextSync:p=>fs.readFileSync(p,'utf8'),openSync:(p,mode)=>({fd:fs.openSync(p,mode?'w':'r')}),writeSync:(fd,b)=>fs.writeSync(fd,new Uint8Array(b)),readSync:(fd,b)=>fs.readSync(fd,new Uint8Array(b)),statSync:fd=>fs.fstatSync(fd),lstatSync:p=>fs.lstatSync(p),closeSync:f=>fs.closeSync(f.fd),fsyncSync:fd=>fs.fsyncSync(fd),copyFileSync:(a,b)=>fs.copyFileSync(a,b),renameSync:(a,b)=>fs.renameSync(a,b),mkdirSync:(p,recursive)=>fs.mkdirSync(p,{recursive:!!recursive}),rmdirSync:p=>fs.rmSync(p,{recursive:true}),unlinkSync:p=>fs.unlinkSync(p),listFileSync:p=>fs.readdirSync(p)}},
    '@kit.ArkTS':{util:{generateRandomUUID:randomUUID,TextEncoder:class{encodeInto(s){return new TextEncoder().encode(s);}},TextDecoder:{create:(encoding,options)=>({decodeToString:bytes=>new TextDecoder(encoding,options).decode(bytes)})},Base64Helper:class{}}}};
  const load=code=>{const module={exports:{}},context=vm.createContext({sdk,module,exports:module.exports,Error,Uint8Array,ArrayBuffer,Date,decodeURIComponent});new vm.Script(code).runInContext(context);return module.exports;};
  const files=load(compiled.outputFiles[0].text),store=load(hydrate.outputFiles[0].text),service=new files.WorkspaceFiles();service.context={filesDir:sandbox};const folder=await service.initialize();
  const state=path.join(sandbox,'workspace.json'),full=value=>{const data=JSON.stringify(value);service.mirror(data);if(fs.existsSync(state))fs.copyFileSync(state,state+'.bak');fs.writeFileSync(state,data);service.collectStore();};
  return {service,folder,sandbox,full,read:()=>JSON.parse(store.hydrateWorkspace(sandbox,fs.readFileSync(state,'utf8'))),file:relative=>path.join(folder.storage.root,relative)};
}
const baselineOf=(value,saveId)=>({saveId,storage:value.storage.id,texts:new Map(value.documents.map(doc=>[doc.id,doc.text])),histories:new Map(Object.entries(value.localHistory||{}).map(([id,list])=>[id,{list,length:list.length}]))});

test('HarmonyOS CSV delta saves and conflict detection preserve BOM and CRLF',async t=>{
  const f=await fixture(t),text='\uFEFF姓名\t备注\r\n甲\t原文\r\n';
  const value={version:1,storage:f.folder.storage,documents:[{id:'csv',name:'数据.TSV',path:'数据.TSV',text,updatedAt:1,remote:null}]};
  f.full({...value,saveId:'csv0'});
  value.documents[0].text=text.replace('原文','改稿');
  f.service.saveDelta(JSON.stringify(workspaceDelta(value,baselineOf({...value,documents:[{...value.documents[0],text}]},'csv0'),'csv1')));
  assert.equal(fs.readFileSync(f.file('数据.TSV'),'utf8'),value.documents[0].text);
  assert.equal(f.service.scan().documents[0].text,value.documents[0].text);
  const baseline=baselineOf(value,'csv1');
  fs.writeFileSync(f.file('数据.TSV'),value.documents[0].text.slice(1));
  value.documents[0].text=text.replace('原文','再改');
  assert.throws(()=>f.service.saveDelta(JSON.stringify(workspaceDelta(value,baseline,'csv2'))),/外部修改/);
});

test('HarmonyOS delta: changed texts, rename, delete, history; previous text and .bak generation kept',async t=>{
  const f=await fixture(t),docs=[['a','书/甲.txt','甲'],['b','书/乙.txt','乙'],['c','丙.txt','丙']].map(([id,p,text])=>({id,name:p.split('/').at(-1),path:p,text,updatedAt:1,remote:null}));
  const value={version:1,storage:f.folder.storage,documents:docs,folders:['书'],localHistory:{a:[{text:'旧',createdAt:1}]}};f.full({...value,saveId:'s0'});const base=baselineOf(value,'s0');
  value.documents[0].text='甲二';value.documents[1].path='书/乙卷.txt';value.documents[1].name='乙卷.txt';value.documents.splice(2,1);value.localHistory={};
  f.service.saveDelta(JSON.stringify(workspaceDelta(value,base,'s1')));
  assert.equal(fs.readFileSync(f.file('书/甲.txt'),'utf8'),'甲二');assert.equal(fs.readFileSync(f.file('书/乙卷.txt'),'utf8'),'乙');assert.equal(fs.existsSync(f.file('书/乙.txt')),false);assert.equal(fs.existsSync(f.file('丙.txt')),false);
  assert.equal(fs.readFileSync(path.join(f.sandbox,'previous-a.txt'),'utf8'),'甲');
  const read=f.read();assert.equal(read.saveId,'s1');assert.deepEqual(read.documents.map(d=>[d.id,d.path,d.text]),[['a','书/甲.txt','甲二'],['b','书/乙卷.txt','乙']]);assert.deepEqual(read.localHistory,{});
  assert.equal(f.service.scan().documents.find(d=>d.id==='a').text,'甲二','the folder cache hydrates');
  const next=baselineOf(read,'s1');read.documents[1].text='乙二';delete read.saveId;f.service.saveDelta(JSON.stringify(workspaceDelta(read,next,'s2')));
  const stored=fs.readdirSync(path.join(f.sandbox,'workspace-store'));assert.equal(stored.filter(n=>n.startsWith('b.')).length,2,'current and .bak generations of b: '+stored);assert.equal(f.read().documents[1].text,'乙二');
});

test('HarmonyOS delta refuses stale bases, invalid ids, oversize texts, external edits and other workspaces',async t=>{
  const f=await fixture(t),value={version:1,storage:f.folder.storage,documents:[{id:'a',name:'甲.txt',path:'甲.txt',text:'甲',updatedAt:1,remote:null}],folders:[]};f.full({...value,saveId:'s0'});
  const base=baselineOf(value,'s0'),attempt=(mutate,pattern)=>{const copy=structuredClone(value);copy.documents[0].text='改';const delta=workspaceDelta(copy,base,'x');mutate(delta);assert.throws(()=>f.service.saveDelta(JSON.stringify(delta)),pattern);};
  attempt(delta=>{delta.base='other';},/E_DELTA_BASE/);
  attempt(delta=>{delta.workspace.documents.push({id:'ghost',name:'g.txt',path:'g.txt'});},/E_DELTA_BASE/);
  attempt(delta=>{delta.workspace.documents[0].id='a b';},/文件标识/);
  attempt(delta=>{delta.texts.a='字'.repeat(3*1024*1024);},/大小/);
  attempt(delta=>{delta.workspace.folders=Array.from({length:5000},(_,i)=>'f'+i);},/5000/);
  attempt(delta=>{delta.workspace.storage={...delta.workspace.storage,id:'other'};},/已切换/);
  attempt(delta=>{delta.workspace.documents[0].path='../x.txt';},/路径/);
  fs.writeFileSync(f.file('甲.txt'),'外部');attempt(()=>{},/外部修改/);assert.equal(fs.readFileSync(f.file('甲.txt'),'utf8'),'外部');
  assert.deepEqual(fs.existsSync(path.join(f.sandbox,'workspace-store'))?fs.readdirSync(path.join(f.sandbox,'workspace-store')):[],[],'refused deltas leave no store files');
});
