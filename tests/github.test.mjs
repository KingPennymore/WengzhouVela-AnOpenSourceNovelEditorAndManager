import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHub,deviceLogin,GitHubError} from '../web/github.mjs';
import {decodeContent} from '../web/model.mjs';
test('超过一页的仓库列表会继续读取，且保留查询条件',async()=>{
  const calls=[];const gh=new GitHub(async(_op,request)=>{calls.push(request.path);return {status:200,body:calls.length===1?Array.from({length:100},(_,i)=>({id:i})):[{id:100}]};});
  const repos=await gh.repositories();assert.equal(repos.length,101);assert.match(calls[1],/affiliation=.*&per_page=100&page=2/);
});
test('提交使用原有 SHA 与 UTF-8 文本，冲突后不自动抓取新版本或覆盖',async()=>{
  const calls=[];const gh=new GitHub(async(op,data)=>{calls.push(data);return {status:409,body:{message:'Conflict'}};});
  const request={repo:'author/book',branch:'draft/one',path:'全书.txt',sha:'old-sha',text:'中文𠮷😀',message:'修改第十章'};
  await assert.rejects(()=>gh.commit(request),e=>e instanceof GitHubError&&e.status===409);
  assert.equal(calls.length,1);assert.equal(calls[0].method,'PUT');assert.equal(calls[0].body.sha,'old-sha');
  assert.equal(decodeContent(calls[0].body.content),request.text);assert.equal(request.sha,'old-sha');
});
test('新文件提交不传 SHA，分支名与中文路径正确编码',async()=>{
  let captured;const gh=new GitHub(async(op,data)=>{captured=data;return {status:201,body:{content:{sha:'new'}}};});
  await gh.commit({repo:'author/book',branch:'main',path:'长篇/全书.txt',text:'甲',message:'初稿'});
  assert.equal('sha' in captured.body,false);assert.ok(captured.path.includes(encodeURIComponent('全书.txt')));
});
test('创建分支读取指定基础分支的引用',async()=>{
  const calls=[];const gh=new GitHub(async(_op,data)=>{calls.push(data);return {status:200,body:{object:{sha:'base'}}};});
  await gh.createBranch('a/b','draft/first','draft/second');assert.match(calls[0].path,/draft%2Ffirst$/);assert.deepEqual(calls[1].body,{ref:'refs/heads/draft/second',sha:'base'});
});
test('文件读取拒绝大文件和二进制，不使用任意下载地址',async()=>{
  for(const body of [{type:'file',encoding:'none',size:1},{type:'file',encoding:'base64',size:3000000},{type:'file',encoding:'base64',size:2,content:'AA=='}]){
    const gh=new GitHub(async()=>({status:200,body}));await assert.rejects(()=>gh.readFile('a/b','main','file.txt'));
  }
});
test('超过 1 MB 的长篇文稿按不可变 blob SHA 读取，避免内容接口大小限制',async()=>{
  const sha='a'.repeat(40),calls=[];const text='汉'.repeat(400000);
  const gh=new GitHub(async(_op,data)=>{calls.push(data.path);return {status:200,body:calls.length===1?{type:'file',encoding:'none',size:1200000,sha,download_url:'https://untrusted.example/file'}:{encoding:'base64',content:Buffer.from(text).toString('base64')}};});
  const file=await gh.readFile('writer/book','main','全书.txt');assert.equal(file.text,text);assert.equal(file.sha,sha);assert.equal(calls[1],`/repos/writer/book/git/blobs/${sha}`);
});
test('设备授权遵守等待间隔、pending 与 slow_down，再完成登录',async()=>{
  let time=0;const waits=[],requests=[];
  const responses=[{device_code:'d',user_code:'USER-CODE',expires_in:90,interval:5},{error:'authorization_pending'},{error:'slow_down'},{authorized:true}];
  let code;await deviceLogin(async(op,data)=>{requests.push(data);return responses.shift();},'client',c=>code=c,null,async ms=>{waits.push(ms);time+=ms;},()=>time);
  assert.deepEqual(waits,[5000,5000,10000]);assert.equal(code.user_code,'USER-CODE');assert.equal(requests[1].body.grant_type,'urn:ietf:params:oauth:grant-type:device_code');
});
test('设备授权拒绝、过期和取消均会停止轮询',async()=>{
  let clock=0;await assert.rejects(()=>deviceLogin(async()=>({device_code:'d',user_code:'c',expires_in:1}), 'id',()=>{},null,async ms=>{clock+=ms;},()=>clock),/过期/);
  let step=0;await assert.rejects(()=>deviceLogin(async()=>++step===1?{device_code:'d',user_code:'c',expires_in:60}:{error:'access_denied'},'id',()=>{},null,async()=>{}),/拒绝/);
  const controller=new AbortController();controller.abort();let polls=0;await assert.rejects(()=>deviceLogin(async()=>{polls++;return {device_code:'d',user_code:'c',expires_in:60};},'id',()=>{},controller.signal,async()=>{}),/取消/);assert.equal(polls,1);
});
