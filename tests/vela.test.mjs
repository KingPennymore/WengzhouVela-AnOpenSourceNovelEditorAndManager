import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVela,createVela,velaText,readingDocuments,projectWriter,velaVisiblePaths,includeNewReadingFile,rewriteVelaFiles} from '../web/vela.mjs';
import {subscriptionRepo,subscriptionChanged,SubscriptionAPI} from '../web/subscriptions.mjs';
import {GitHub} from '../web/github.mjs';
import {encodeContent} from '../web/model.mjs';
const config=(files=[],templates=[])=>({...createVela('Book'),reading:{files},titleTemplates:templates});
test('.vela 配置校验、未知字段保留及路径越界拒绝',()=>{
  assert.equal(parseVela(velaText({...config(['正文.txt']),custom:{keep:true}})).custom.keep,true);
  for(const value of [{...config(),version:2},{...config(),fontSize:100},{...config(),titleTemplates:'bad'},config(['../secret.txt']),config(['.vela']),config(['a.txt'],['没有占位符'])])assert.throws(()=>parseVela(JSON.stringify(value)));
});
test('最近工作区控制阅读清单和标题模板，不把全局模板应用到其他小说',()=>{
  const docs=[{id:'root',name:'.vela',text:velaText(config(['outside.txt','Sub/a.txt'],['【{title}】']))},{id:'sub',name:'.vela',path:'Sub/.vela',text:velaText(config(['a.txt'],['幕 {number}: {title}']))},{id:'a',name:'a.txt',path:'Sub/a.txt',text:''},{id:'b',name:'b.txt',path:'Sub/b.txt',text:''},{id:'c',name:'outside.txt',text:''}];
  const workspace={documents:docs,settings:{writer:{titleTemplates:['不适用{title}']}}};
  assert.deepEqual(readingDocuments(workspace).map(doc=>doc.id),['a','c']);assert.deepEqual(projectWriter(workspace,docs[2]).titleTemplates,['幕 {number}: {title}']);
  docs[1].text='invalid';assert.deepEqual(readingDocuments(workspace).map(doc=>doc.id),['c']);
});
test('新文稿自动进入所属工作区的阅读清单，其他工作区不变',()=>{
  const manifest={id:'config',name:'.vela',path:'Novel/.vela',text:velaText(config())},doc={name:'a.md',path:'Novel/a.md'};const workspace={documents:[manifest,doc]};includeNewReadingFile(workspace,doc);includeNewReadingFile(workspace,doc);assert.deepEqual(parseVela(manifest.text).reading.files,['a.md']);
});
test('订阅只接受 HTTPS 仓库首页，拒绝凭据、代理、查询与多余路径',()=>{
  assert.equal(subscriptionRepo('https://github.com/owner/repo.git/'),'owner/repo');
  for(const value of ['http://github.com/o/r','https://example.com/o/r','https://user:token@github.com/o/r','https://github.com/o/r/issues','https://github.com/o/r?q=secret','https://github.com/o/.git'])assert.throws(()=>subscriptionRepo(value));
});
test('.vela 配置变化静默同步；只有原阅读清单内文件的新 SHA 才提示',()=>{
  const old={vela:true,watched:{'book.txt':'a','future.md':null},signature:'old'};
  assert.equal(subscriptionChanged(old,{vela:true,watched:{'book.txt':'a','new.txt':'new'},signature:'changed'}),false);
  assert.equal(subscriptionChanged(old,{vela:true,watched:{'book.txt':'b'},signature:'old'}),true);
  assert.equal(subscriptionChanged(old,{vela:true,watched:{'book.txt':'a','future.md':'published'}}),true);
  assert.equal(subscriptionChanged(null,{vela:false,signature:'a'}),false);assert.equal(subscriptionChanged({vela:false,signature:'a'},{vela:false,signature:'b'}),true);
});
test('订阅快照以 Git tree 筛选可读文件，配置、其他附件和 Release 不影响 .vela 未读',async()=>{
  const calls=[],manifest=velaText(config(['book.txt']));const transport=async(operation,{path})=>{calls.push({operation,path});const body=path.endsWith('/releases?per_page=20')?[{id:1,tag_name:'v1',body:'Notes'}]:path.includes('/git/trees/')?{sha:'tree',tree:[{path:'.vela',sha:'config',type:'blob'},{path:'book.txt',sha:'book',type:'blob'},{path:'private.txt',sha:'private',type:'blob'}]}:path.endsWith('/git/blobs/config')?{encoding:'base64',content:encodeContent(manifest),size:manifest.length}:{full_name:'o/r',default_branch:'main',pushed_at:'now'};return {status:200,body};};
  const snapshot=await new SubscriptionAPI(transport).snapshot('o/r');assert.deepEqual(snapshot.files.map(file=>file.path),['book.txt']);assert.equal(snapshot.vela,true);assert.ok(calls.every(call=>call.operation==='publicApi'));
});
test('批量工作区提交将文本和二进制合为一个 commit，分支更新禁止强推',async()=>{
  const calls=[],gh=new GitHub(async(_operation,payload)=>{calls.push(payload);let body=payload.path.includes('/git/ref/heads/')?{object:{sha:'parent'}}:payload.path.endsWith('/git/commits/parent')?{tree:{sha:'base'}}:payload.path.endsWith('/git/blobs')?{sha:'binary'}:payload.path.endsWith('/git/trees')?{sha:'tree'}:{sha:'commit'};return {status:200,body};});
  await gh.commitWorkspace({repo:'o/r',branch:'main',prefix:'novel',message:'Save',files:[{path:'.vela',text:velaText(config(['book.txt']))},{path:'book.txt',text:'中文正文'},{path:'cover.png',data:'AAEC'}]});
  const tree=calls.find(call=>call.path.endsWith('/git/trees')).body;assert.equal(tree.base_tree,'base');assert.deepEqual(tree.tree.map(item=>item.path),['novel/.vela','novel/book.txt','novel/cover.png']);assert.equal(tree.tree[2].sha,'binary');assert.deepEqual(calls.at(-1).body,{sha:'commit',force:false});assert.equal(calls.filter(call=>call.path.endsWith('/git/commits')&&call.method==='POST').length,1);
});
test('远端分支冲突不会强推重试，非法批量路径在网络请求前被拒绝',async()=>{
  let count=0;const gh=new GitHub(async(_op,payload)=>{count++;if(payload.method==='PATCH')return {status:409,body:{}};return {status:200,body:payload.path.includes('/git/ref/')?{object:{sha:'parent'}}:payload.path.endsWith('/parent')?{tree:{sha:'base'}}:{sha:'created'}};});
  await assert.rejects(gh.commitWorkspace({repo:'o/r',branch:'main',message:'Save',files:[{path:'book.txt',text:'a'}]}),/远端版本/);assert.equal(count,5);count=0;
  await assert.rejects(gh.commitWorkspace({repo:'o/r',branch:'main',message:'Save',files:[{path:'../secret',text:'a'}]}));assert.equal(count,0);
});

test('移动与复制工作区保持配置相对路径，文件更名和删除更新阅读清单',()=>{
 const manifest={id:'config',name:'.vela',path:'Novel/.vela',text:velaText(config(['正文/book.txt']))},book={id:'book',name:'book.txt',path:'Novel/正文/book.txt',text:'body'};const before={documents:[manifest,book]};
 const moved=structuredClone(before);moved.documents[1].path='Novel/正文/renamed.txt';rewriteVelaFiles(before,moved,'move','Novel/正文/book.txt','Novel/正文/renamed.txt');assert.deepEqual(parseVela(moved.documents[0].text).reading.files,['正文/renamed.txt']);
 const folder=structuredClone(before);for(const doc of folder.documents)doc.path=doc.path.replace('Novel/','Renamed/');rewriteVelaFiles(before,folder,'move','Novel','Renamed');assert.deepEqual(parseVela(folder.documents[0].text).reading.files,['正文/book.txt']);
 const deleted={documents:[structuredClone(manifest)]};rewriteVelaFiles(before,deleted,'delete',book.path);assert.deepEqual(parseVela(deleted.documents[0].text).reading.files,[]);
});
