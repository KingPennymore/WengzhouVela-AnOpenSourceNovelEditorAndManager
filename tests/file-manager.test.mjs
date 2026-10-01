import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyFileOperation,restoreFile,copyDestination} from '../web/file-manager.mjs';
const fixture=()=>({documents:[{id:'book',name:'全书.txt',path:'小说/全书.txt',text:'正文',remote:{repo:'me/book'}},{id:'other',name:'旁.txt',path:'小说2/旁.txt',text:'旁文'}],folders:['小说','小说/空目录','小说2'],entries:[{path:'小说/封面.png',name:'封面.png',editable:false}],repositories:[{repo:'me/book',folder:'小说',branch:'main',commit:'abc'}],openIds:['book','other'],activeId:'book'});
test('目录移动保留文稿 ID、关联、附件和空目录，复制获得独立文稿',()=>{
  const w=fixture();applyFileOperation(w,'move','小说','成稿/第一部');
  assert.equal(w.documents.find(d=>d.id==='book').path,'成稿/第一部/全书.txt');assert.equal(w.repositories[0].folder,'成稿/第一部');assert.equal(w.entries[0].path,'成稿/第一部/封面.png');assert.ok(w.folders.includes('成稿/第一部/空目录'));assert.equal(w.documents.find(d=>d.id==='other').path,'小说2/旁.txt');
  applyFileOperation(w,'copy','成稿/第一部','成稿/副本');const clone=w.documents.find(d=>d.path==='成稿/副本/全书.txt');assert.notEqual(clone.id,'book');assert.equal(clone.remote,null);assert.equal(clone.text,'正文');assert.equal(w.repositories.length,1);
});
test('回收站恢复全部目录数据和仓库关联，冲突时保留回收站内容',()=>{
  const w=fixture();applyFileOperation(w,'delete','小说');const id=w.trash[0].id;assert.equal(w.documents.length,1);assert.equal(w.activeId,null);assert.equal(w.repositories.length,0);
  w.folders.push('小说');assert.throws(()=>restoreFile(w,id),/同名/);assert.equal(w.trash.length,1);w.folders=w.folders.filter(p=>p!=='小说');restoreFile(w,id);assert.equal(w.documents.find(d=>d.id==='book').text,'正文');assert.equal(w.repositories[0].folder,'小说');assert.equal(w.entries[0].path,'小说/封面.png');
  applyFileOperation(w,'delete','小说');restoreFile(w,w.trash[0].id,true);assert.equal(w.documents.length,1);assert.equal(w.trash.length,0);
});
test('拒绝路径越界、自身子目录和覆盖，自动生成不冲突的副本名称',()=>{
  const w=fixture();assert.throws(()=>applyFileOperation(w,'move','小说','../坏'),/路径/);assert.throws(()=>applyFileOperation(w,'copy','小说','小说/副本'),/自身/);assert.throws(()=>applyFileOperation(w,'move','小说','小说2'),/目标已存在/);assert.throws(()=>applyFileOperation(w,'copy','小说','小说2/旁.txt/子文件'),/父路径/);assert.equal(copyDestination(w,'小说/全书.txt'),'小说/全书 (2).txt');assert.equal(w.documents.length,2);
});
