import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {WorkspaceStorage,relativePath} from '../windows/storage.mjs';
import {GitHubBridge} from '../windows/github.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'vela-storage-qa-'));
const clean=folder=>fs.rmSync(folder,{recursive:true,force:true});
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
