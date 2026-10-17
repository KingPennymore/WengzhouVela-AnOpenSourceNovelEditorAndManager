import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {WorkspaceStorage} from '../windows/storage.mjs';
import {workspaceDelta} from '../web/platform.mjs';

// Incremental workspace saves on the Windows storage (docs/WORKSPACE-STORAGE.md). The HarmonyOS and Android ports
// follow the same rules; these tests pin the protocol the web client speaks.
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'vela-delta-qa-'));
const clean=folder=>fs.rmSync(folder,{recursive:true,force:true});
const baselineOf=(value,saveId)=>({saveId,storage:value.storage.id,texts:new Map(value.documents.map(doc=>[doc.id,doc.text])),histories:new Map(Object.entries(value.localHistory||{}).map(([id,list])=>[id,{list,length:list.length}]))});
function fixture(){
  const base=temp(),store=new WorkspaceStorage(base),scan=store.scan();
  const docs=[['a','书/第一卷.txt','第一卷正文'],['b','书/第二卷.txt','第二卷正文'],['c','笔记.txt','笔记']].map(([id,p,text])=>({id,name:p.split('/').at(-1),path:p,text,updatedAt:1}));
  const value={version:1,...scan,documents:docs,folders:['书'],localHistory:{a:[{text:'旧稿',createdAt:1,revision:0}]},settings:{theme:'light'}};
  store.saveWorkspace(JSON.stringify({...value,saveId:'s0'}));
  return {base,store,value,baseline:baselineOf(value,'s0')};
}
const storeFiles=base=>fs.existsSync(path.join(base,'workspace-store'))?fs.readdirSync(path.join(base,'workspace-store')).sort():[];

test('only changed texts travel; renames, deletions, new files and history apply; reads return the full workspace',()=>{
  const {base,store,value,baseline}=fixture();try{
    value.documents[0].text='第一卷改稿';value.documents[1].path='书/卷二.txt';value.documents[1].name='卷二.txt';value.documents.splice(2,1);
    value.documents.push({id:'d',name:'新章.txt',path:'书/新章.txt',text:'新章',updatedAt:2});value.localHistory={a:[...value.localHistory.a,{text:'第一卷正文',createdAt:2,revision:1}]};
    const delta=workspaceDelta(value,baseline,'s1');
    assert.deepEqual(Object.keys(delta.texts).sort(),['a','d'],'unchanged and renamed texts are not sent');
    assert.ok(delta.workspace.documents.every(doc=>!('text' in doc)));assert.deepEqual(Object.keys(delta.histories),['a']);
    store.saveWorkspaceDelta(JSON.stringify(delta));
    assert.equal(fs.readFileSync(store.target('书/第一卷.txt'),'utf8'),'第一卷改稿');assert.equal(fs.readFileSync(store.target('书/卷二.txt'),'utf8'),'第二卷正文');
    assert.equal(fs.existsSync(store.target('书/第二卷.txt')),false);assert.equal(fs.existsSync(store.target('笔记.txt')),false);assert.equal(fs.readFileSync(store.target('书/新章.txt'),'utf8'),'新章');
    const raw=fs.readFileSync(path.join(base,'workspace.json'),'utf8');assert.ok(raw.startsWith('{"store":{"format":2'));assert.ok(!raw.includes('第一卷改稿'),'the skeleton holds no texts');
    const read=JSON.parse(store.readWorkspace());assert.equal(read.saveId,'s1');assert.deepEqual(read.documents.map(doc=>[doc.id,doc.path,doc.text]),[['a','书/第一卷.txt','第一卷改稿'],['b','书/卷二.txt','第二卷正文'],['d','书/新章.txt','新章']]);
    assert.deepEqual(read.localHistory.a.map(item=>item.text),['旧稿','第一卷正文']);assert.equal(read.store,undefined);
    assert.equal(new WorkspaceStorage(base).metadata().documents.find(doc=>doc.id==='a').text,'第一卷改稿','the folder cache hydrates too');
    // A second delta from the confirmed state keeps the previous generation (previous.json) and drops older ones.
    const next=baselineOf(read,'s1');read.documents[0].text='第一卷三稿';delete read.saveId;store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(read,next,'s2')));
    const files=storeFiles(base),texts=files.filter(name=>name.startsWith('a.')&&name.endsWith('.txt'));assert.equal(texts.length,2,'current and previous text of a: '+files);
    assert.ok(files.includes('previous.json'));assert.equal(JSON.parse(store.readWorkspace()).documents[0].text,'第一卷三稿');
  }finally{clean(base);}
});

test('a stale base, a missing base text or an older shell state asks for a full save',()=>{
  const {base,store,value,baseline}=fixture();try{
    value.documents[0].text='改';assert.throws(()=>store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(value,{...baseline,saveId:'other'},'s1'))),/E_DELTA_BASE/);
    const missing=workspaceDelta(value,baseline,'s1');missing.workspace.documents.push({id:'ghost',name:'g.txt',path:'g.txt',updatedAt:1});
    assert.throws(()=>store.saveWorkspaceDelta(JSON.stringify(missing)),/E_DELTA_BASE/);
    store.saveWorkspace(JSON.stringify(value));assert.throws(()=>store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(value,baseline,'s2'))),/E_DELTA_BASE/,'a full save without saveId (older client) resets the base');
    assert.equal(JSON.parse(store.readWorkspace()).documents[0].text,'改');
  }finally{clean(base);}
});

test('delta validation matches the full save: ids, paths, sizes, 5000 items, storage id, external edits',()=>{
  const {base,store,value,baseline}=fixture();try{
    const attempt=(mutate,pattern)=>{const copy=structuredClone(value);const delta=workspaceDelta(copy,baseline,'bad');mutate(delta,copy);assert.throws(()=>store.saveWorkspaceDelta(JSON.stringify(delta)),pattern);};
    attempt(delta=>{delta.workspace.documents[0].id='a/b';},/文件标识/);
    attempt(delta=>{delta.workspace.documents[1].path='书/第一卷.TXT';},/同名路径/);
    attempt(delta=>{delta.workspace.documents[0].path='../escape.txt';},/路径/);
    attempt(delta=>{delta.texts.a='字'.repeat(3*1024*1024);},/大小/);
    attempt(delta=>{delta.workspace.folders=Array.from({length:4998},(_,i)=>'f'+i);},/5000/);
    attempt(delta=>{delta.workspace.storage={...delta.workspace.storage,id:'elsewhere'};},/标识无效/);
    attempt(delta=>{delta.texts.zz='孤立';},/不属于/);
    attempt(delta=>{delta.histories.a=[{text:1}];},/历史/);
    attempt(delta=>{delta.workspace.documents[0].text='inline';},/文件标识|无效/);
    fs.writeFileSync(store.target('书/第一卷.txt'),'外部改动');value.documents[0].text='内部改动';
    const before=storeFiles(base);assert.throws(()=>store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(value,baseline,'s1'))),/外部修改/);
    assert.equal(fs.readFileSync(store.target('书/第一卷.txt'),'utf8'),'外部改动');assert.deepEqual(storeFiles(base),before,'a refused delta leaves no store files');
    assert.equal(JSON.parse(store.readWorkspace()).saveId,'s0');
  }finally{clean(base);}
});

test('a crash before the skeleton commits leaves the previous state readable and orphans are collected',()=>{
  const {base,store,value,baseline}=fixture();try{
    store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(value,baseline,'s1')));
    const orphan=path.join(base,'workspace-store','a.0123456789ab.txt');fs.writeFileSync(orphan,'未提交');
    const reopened=new WorkspaceStorage(base);assert.equal(JSON.parse(reopened.readWorkspace()).documents[0].text,'第一卷正文');
    const read=JSON.parse(reopened.readWorkspace()),next=baselineOf(read,'s1');read.documents[2].text='笔记二';delete read.saveId;reopened.saveWorkspaceDelta(JSON.stringify(workspaceDelta(read,next,'s2')));
    assert.equal(fs.existsSync(orphan),false);
  }finally{clean(base);}
});
