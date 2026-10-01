import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GitHub} from '../web/github.mjs';
import {applyRemoteFile,applyRepository,repositoryFolder} from '../web/git-workspace.mjs';

test('相同仓库和文件路径再次拉取覆盖同一文档，不混淆不同仓库或不同目录',()=>{
  const workspace={documents:[],openIds:[]};
  const first=applyRemoteFile(workspace,{repo:'a/book',branch:'main',path:'one/book.md',text:'旧',sha:'old'});
  const changed=applyRemoteFile(workspace,{repo:'a/book',branch:'draft',path:'one/book.md',text:'新',sha:'new'});
  assert.equal(changed.id,first.id);assert.equal(workspace.documents.length,1);assert.equal(changed.text,'新');assert.equal(changed.remote.sha,'new');
  applyRemoteFile(workspace,{repo:'b/book',branch:'main',path:'one/book.md',text:'其他仓库',sha:'x'});
  applyRemoteFile(workspace,{repo:'a/book',branch:'main',path:'two/book.md',text:'不同目录',sha:'y'});assert.equal(workspace.documents.length,3);
});
test('整仓库内容取自同一提交，保留目录和二进制，截断树逐级读取完整目录',async()=>{
  const calls=[],progress=[],data=Buffer.from('中文').toString('base64');
  const responses=[{object:{sha:'commit'}},{tree:{sha:'root'}},{tree:[],truncated:true},{tree:[{type:'tree',path:'folder',sha:'sub'},{type:'blob',path:'image.png',sha:'image',size:2,mode:'100644'}]},{tree:[{type:'blob',path:'小说.md',sha:'text',size:6,mode:'100644'}]},{encoding:'base64',content:'AP8='},{encoding:'base64',content:data}];
  const github=new GitHub(async(_op,request)=>{calls.push(request.path);return {status:200,body:responses.shift()};});
  const result=await github.pullRepository('a/book','draft/one',{onProgress:p=>progress.push(p)});
  assert.equal(result.commit,'commit');assert.equal(result.files[0].text,null);assert.equal(result.files[1].text,'中文');assert.equal(result.files[1].path,'folder/小说.md');assert.deepEqual(result.folders,['folder']);assert.match(calls[0],/draft%2Fone$/);assert.equal(progress.at(-1).done,2);
});
test('取消、超限及子模块使完整拉取失败，失败前不写工作区',async()=>{
  for(const entry of [{type:'blob',path:'huge.bin',size:9*1024*1024,sha:'a'},{type:'commit',path:'sub',mode:'160000'}]){
    const responses=[{object:{sha:'c'}},{tree:{sha:'t'}},{tree:[entry]}],github=new GitHub(async()=>({status:200,body:responses.shift()}));await assert.rejects(github.pullRepository('a/b','main'),/工作区未修改/);
  }
  const controller=new AbortController();controller.abort();let requests=0;const github=new GitHub(async()=>{requests++;});await assert.rejects(github.pullRepository('a/b','main',{signal:controller.signal}),/取消/);assert.equal(requests,0);
});
test('整仓库落盘后的文档与 Git 关联合并，不产生同名副本且保留原打开文档 ID',()=>{
  const workspace={documents:[{id:'original',name:'a.md',path:'a.md',text:'旧',remote:{repo:'a/book',path:'chapters/a.md'}},{id:'scanned',name:'a.md',path:'book/chapters/a.md',text:'新',remote:null}],openIds:['original'],folders:[]};
  const result={repo:'a/book',branch:'main',commit:'c',folders:['chapters'],files:[{path:'chapters/a.md',text:'新',sha:'s'}]};applyRepository(workspace,result,'book');
  assert.equal(workspace.documents.length,1);assert.equal(workspace.documents[0].id,'original');assert.equal(workspace.documents[0].path,'book/chapters/a.md');assert.equal(workspace.documents[0].text,'新');assert.equal(repositoryFolder(workspace,'a/book'),'book');
});
