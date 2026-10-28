import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {WorkspaceStorage,relativePath,decodeText} from '../windows/storage.mjs';
import {workspaceDelta} from '../web/platform.mjs';
import {GitHubBridge} from '../windows/github.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'vela-storage-qa-'));
const clean=folder=>fs.rmSync(folder,{recursive:true,force:true});

test('Windows batch trash scans once, retains conflicting records and rolls back I/O failures',()=>{
  const base=temp(),rename=fs.renameSync;try{
    const store=new WorkspaceStorage(base);
    for(const name of ['a.txt','b.txt','c.txt']){fs.writeFileSync(store.target(name),name);store.manage('delete',name);}
    const records=store.listTrash(),byPath=new Map(records.map(item=>[item.path,item.id]));
    fs.writeFileSync(store.target('b.txt'),'existing');let scans=0;const scan=store.scan.bind(store);store.scan=()=>{scans++;return scan();};
    const result=store.restoreTrashBatch(records.map(item=>item.id));
    assert.equal(scans,1);assert.deepEqual(result.failed,[byPath.get('b.txt')]);assert.equal(store.listTrash().length,1);
    assert.equal(fs.readFileSync(store.target('b.txt'),'utf8'),'existing');
    for(const name of ['a.txt','c.txt'])store.manage('delete',name);
    let fail=true;fs.renameSync=(from,to)=>{if(to===store.target('c.txt')&&fail){fail=false;throw Error('injected I/O error');}return rename(from,to);};
    const ids=store.listTrash().filter(item=>item.path!=='b.txt').map(item=>item.id);
    assert.throws(()=>store.restoreTrashBatch(ids),/injected I\/O/);assert.equal(fs.existsSync(store.target('a.txt')),false);assert.equal(store.listTrash().length,3);
    fs.renameSync=rename;scans=0;const removed=store.restoreTrashBatch(store.listTrash().map(item=>item.id),true);assert.equal(scans,1);assert.equal(removed.failed.length,0);assert.equal(store.listTrash().length,0);
  }finally{fs.renameSync=rename;clean(base);}
});

test('Windows trash moves payloads without copying, and rolls back a failed metadata write',()=>{
  const base=temp(),copy=fs.copyFileSync,rename=fs.renameSync;
  try{
    const store=new WorkspaceStorage(base),folder=store.target('资料');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'素材.bin'),Buffer.alloc(8*1024*1024));
    let payloadCopies=0;fs.copyFileSync=(source,...args)=>{if(source===path.join(folder,'素材.bin'))payloadCopies++;return copy(source,...args);};
    store.manage('delete','资料');assert.equal(payloadCopies,0);const record=store.listTrash()[0];
    store.restoreTrash(record.id);assert.equal(fs.statSync(path.join(folder,'素材.bin')).size,8*1024*1024);
    let fail=true;fs.renameSync=(from,to)=>{if(to===store.cache&&fail){fail=false;throw Error('metadata write failed');}return rename(from,to);};
    assert.throws(()=>store.manage('delete','资料'),/metadata write failed/);
    assert.equal(fs.existsSync(path.join(folder,'素材.bin')),true);assert.equal(store.listTrash().length,0);
    assert.equal(fs.readdirSync(store.transactions).length,0);
  }finally{fs.copyFileSync=copy;fs.renameSync=rename;clean(base);}
});

test('Windows startup recovers an interrupted rename into the trash',()=>{
  const base=temp();try{
    const store=new WorkspaceStorage(base),source=store.target('正文.txt'),payload=path.join(base,'trash-payload','qa-interrupted');
    fs.writeFileSync(source,'原文');fs.mkdirSync(path.dirname(payload));
    const transaction=path.join(store.transactions,'qa-interrupted');fs.mkdirSync(transaction);
    fs.writeFileSync(path.join(transaction,'journal.json'),JSON.stringify({committed:false,items:[{path:'trash-payload/qa-interrupted',moveFrom:'workspaces/Vela/正文.txt'}]}));
    fs.renameSync(source,payload);new WorkspaceStorage(base);
    assert.equal(fs.readFileSync(source,'utf8'),'原文');assert.equal(fs.existsSync(payload),false);
  }finally{clean(base);}
});

test('CSV/TSV BOM and CRLF survive native reads, full and delta saves without false conflicts',()=>{
  const base=temp();try{
    const store=new WorkspaceStorage(base),text='\uFEFF姓名,备注\r\n甲,"原文"\r\n';
    const state={version:1,...store.scan(),saveId:'csv0',documents:[{id:'csv',name:'人物.CSV',text,updatedAt:1},{id:'tsv',name:'数据.TSV',text:text.replaceAll(',', '\t'),updatedAt:1}]};
    store.saveWorkspace(JSON.stringify(state));
    state.documents[0].text=text.replace('原文','改稿');state.saveId='csv1';
    store.saveWorkspace(JSON.stringify(state));
    const baseline={saveId:'csv1',storage:state.storage.id,texts:new Map(state.documents.map(d=>[d.id,d.text])),histories:new Map()};
    state.documents[0].text=text.replace('原文','再改');
    store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(state,baseline,'csv2')));
    const reopened=new WorkspaceStorage(base).scan();
    assert.deepEqual(reopened.documents.map(d=>d.text),state.documents.map(d=>d.text));
    assert.equal(fs.readFileSync(store.target('人物.CSV'),'utf8'),state.documents[0].text);
    assert.equal(decodeText(Buffer.from(text),'人物.csv'),text);
    assert.equal(decodeText(Buffer.from(text),'正文.txt'),text.slice(1));
    assert.equal(decodeText(Buffer.concat([Buffer.from([255,254]),Buffer.from(text.slice(1),'utf16le')]),'数据.tsv'),text);
    fs.writeFileSync(store.target('人物.CSV'),state.documents[0].text.slice(1));
    assert.throws(()=>store.saveWorkspace(JSON.stringify(state)),/外部修改/,'removing the BOM externally is a real file change');
  }finally{clean(base);}
});
test('Windows 同一令牌重复登录与重启后登录不重复写安全存储，失效令牌仍被拒绝',async()=>{
 let token='',writes=0,status=200,requests=0;
 const options={request:async()=>{requests++;return {status,body:{login:'writer'}};},credentials:{read:()=>token,write:value=>{writes++;if(token===value)throw Error('duplicate credential');token=value;},clear:()=>token=''}};
 const bridge=new GitHubBridge(options),data={token:'github_pat_fixture_repeat'};
 await bridge.call('login',data);await bridge.call('login',data);await new GitHubBridge(options).call('login',data);
 assert.equal(writes,1);assert.equal(requests,3);
 status=401;await assert.rejects(bridge.call('login',data),/无效或已过期/);assert.equal(writes,1);
 status=200;await bridge.call('logout');await bridge.call('login',data);assert.equal(writes,2);
});
test('Windows 内部文件持久保存，保留空文件和稳定 ID，阻止外部修改被覆盖',()=>{
  const base=temp();try{const store=new WorkspaceStorage(base),scan=store.scan(),state={version:1,...scan,documents:[{id:'book',name:'book.txt',path:'Novel/book.txt',text:'中文正文',updatedAt:1},{id:'empty',name:'empty.txt',text:'',updatedAt:1}],folders:['Novel','Empty']};store.saveWorkspace(JSON.stringify(state));assert.equal(fs.readFileSync(store.target('empty.txt'),'utf8'),'');assert.equal(store.scan().documents.find(doc=>doc.path==='Novel/book.txt').id,'book');
    fs.writeFileSync(store.target('Novel/book.txt'),'external');assert.throws(()=>store.saveWorkspace(JSON.stringify(state)),/外部修改/);assert.equal(fs.readFileSync(store.target('Novel/book.txt'),'utf8'),'external');
  }finally{clean(base);}
});
test('Windows 文件夹复制、移动、删除及恢复保留附件和原文稿 ID',()=>{
  const base=temp();try{const store=new WorkspaceStorage(base);store.writeFiles([{path:'Novel/book.txt',data:Buffer.from('body').toString('base64')},{path:'Novel/image.png',data:'AAEC'}],['Novel/Empty']);const original=store.scan().documents[0].id;
    const copied=store.manage('copy','Novel','Copy');assert.equal(copied.documents.find(doc=>doc.path==='Novel/book.txt').id,original);assert.notEqual(copied.documents.find(doc=>doc.path==='Copy/book.txt').id,original);assert.deepEqual(fs.readFileSync(store.target('Copy/image.png')),Buffer.from([0,1,2]));store.manage('move','Copy','Moved');store.manage('delete','Novel');assert.equal(fs.existsSync(store.target('Novel/book.txt')),false);const record=store.listTrash()[0];assert.equal(record.directory,true);const restored=store.restoreTrash(record.id);assert.equal(restored.documents.find(doc=>doc.path==='Novel/book.txt').id,original);assert.ok(restored.folders.includes('Novel/Empty'));assert.equal(store.listTrash().length,0);
  }finally{clean(base);}
});
test('Windows 批量写入失败完整回滚，路径越界与保留设备文件名被拒绝',()=>{
  const base=temp();try{const store=new WorkspaceStorage(base);store.writeFiles([{path:'book.txt',data:Buffer.from('old').toString('base64')}]);fs.mkdirSync(store.target('blocked'));
    assert.throws(()=>store.writeFiles([{path:'book.txt',data:Buffer.from('new').toString('base64')},{path:'blocked',data:'AAEC'}]));assert.equal(fs.readFileSync(store.target('book.txt'),'utf8'),'old');assert.ok(fs.statSync(store.target('blocked')).isDirectory());assert.equal(fs.readdirSync(store.transactions).length,0);
    for(const value of ['../secret','D:/secret','CON.txt','NUL','sub\\file','sub/../secret','file.'])assert.throws(()=>relativePath(value));
  }finally{clean(base);}
});
test('Windows 启动恢复未提交的写入事务，已提交事务不回滚',()=>{
  const base=temp();try{const store=new WorkspaceStorage(base);fs.writeFileSync(store.target('book.txt'),'new');const folder=path.join(store.transactions,'qa-crash');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'0'),'old');fs.writeFileSync(path.join(folder,'journal.json'),JSON.stringify({committed:false,items:[{path:'workspaces/Vela/book.txt',exists:true,directory:false,backup:'0'}]}));new WorkspaceStorage(base);assert.equal(fs.readFileSync(store.target('book.txt'),'utf8'),'old');assert.equal(fs.existsSync(folder),false);
  }finally{clean(base);}
});
test('Windows GitHub 取消期间完成的登录不会重写已退出凭据',async()=>{
  let resolve,token='',calls=0;const bridge=new GitHubBridge({request:()=>{calls++;return new Promise(done=>resolve=done);},credentials:{write:value=>token=value,read:()=>token,clear:()=>token=''}});const login=bridge.call('login',{token:'test'});await bridge.call('logout',{});resolve({status:200,body:{login:'QA'}});await assert.rejects(login,/取消/);assert.equal(token,'');
  for(const data of [{path:'/repos/o/r/../secret',method:'GET'},{path:'/user',method:'GET'},{path:'/repos/o/r',method:'POST'}])await assert.rejects(bridge.call('publicApi',data));assert.equal(calls,1);
});
