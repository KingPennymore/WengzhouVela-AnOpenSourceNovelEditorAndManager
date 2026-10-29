import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {AiBridge,aiEndpoint,aiCredential,aiPath,aiHeaders} from '../windows/ai.mjs';
import {createCredentials} from '../windows/credentials.mjs';

const config={format:'openai',endpoint:'https://api.example.com/v1',key:'test-secret-1234'};
function memory(){const values=new Map();return {read:p=>values.get(p)||'',write:(value,p)=>values.set(p,value),clear:p=>values.delete(p)};}
const request=(requestId='one',body={messages:[]})=>({action:'request',requestId,method:'POST',path:'/chat/completions',body});
async function serverFor(t,handler){
  const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});return `http://127.0.0.1:${server.address().port}`;
}

test('AI endpoint policy allows HTTPS and only local HTTP, with no credential ambiguity',()=>{
  for(const host of ['localhost','127.0.0.1','[::1]','10.0.2.2','10.255.255.255','172.16.0.1','172.31.255.255','192.168.1.1','ollama.local'])assert.equal(aiEndpoint(`http://${host}:11434/v1/`),`http://${host}:11434/v1`);
  assert.equal(aiEndpoint('HTTPS://API.Example.com:443/v1/'),'HTTPS://API.Example.com:443/v1');
  for(const value of ['http://127.1','http://2130706433','http://0x7f000001','http://010.0.0.1','https://example.com:0'])assert.throws(()=>aiEndpoint(value),/AI/);
  assert.equal(aiEndpoint('https://example.com/'+'x'.repeat(380)).length,400);
  for(const endpoint of ['',null,42,'/relative','file:///tmp/test','ftp://example.com','http://example.com','http://localhost.example.com','http://172.15.0.1','http://172.32.0.1','http://192.169.0.1','http://169.254.1.1','http://[::2]','http://10.999.0.1','https://user:pass@example.com','https://@example.com','https://example.com?','https://example.com/#','https://example.com?q=x','https://example.com/#x','https://example.com\\@evil.com','https://example.com/\n','https://example.com:65536','https://example.com/'+'x'.repeat(381),'https://例子.com','https://example.com/中','https://example.com/\u0000','https://example.com/\u007f'])assert.throws(()=>aiEndpoint(endpoint),/AI/);
  assert.equal(aiEndpoint('https://xn--fsqu00a.com'),'https://xn--fsqu00a.com');
});

test('AI path allow-list is exact for every format and blocks traversal and injected queries',()=>{
  const paths={openai:'/chat/completions',anthropic:'/v1/messages',gemini:'/v1beta/models/publishers/google/models/gemini-2.5-flash:generateContent',azure:'/openai/deployments/chat-1/chat/completions?api-version=2024-10-21'};
  assert.equal(aiPath('azure','/openai/deployments/chat..1/chat/completions?api-version=2024..preview'),'/openai/deployments/chat..1/chat/completions?api-version=2024..preview');
  for(const [format,allowed] of Object.entries(paths)){
    assert.equal(aiPath(format,allowed),allowed);
    for(const other of Object.values(paths).filter(p=>p!==allowed))assert.throws(()=>aiPath(format,other),/路径/);
    for(const suffix of ['/','&key=leak','#x','\n'])assert.throws(()=>aiPath(format,allowed+suffix),/路径/);
  }
  for(const value of ['/v1beta/models/../x:generateContent','/v1beta/models/%2e%2e:generateContent','/v1beta/models/'+ 'a'.repeat(129)+':generateContent'])assert.throws(()=>aiPath('gemini',value),/路径/);
  for(const value of ['/openai/deployments/a/b/chat/completions?api-version=2024','/openai/deployments/a/chat/completions?api-version=2024&x=1','/openai/deployments/a/chat/completions?api-version='+ 'a'.repeat(33)])assert.throws(()=>aiPath('azure',value),/路径/);
});

test('AI header construction uses only the selected provider authentication',()=>{
  const base={Accept:'application/json','Content-Type':'application/json'};
  assert.deepEqual(aiHeaders(config),{...base,Authorization:'Bearer '+config.key});
  assert.deepEqual(aiHeaders({...config,key:''}),base);
  assert.deepEqual(aiHeaders({...config,format:'anthropic'}),{...base,'x-api-key':config.key,'anthropic-version':'2023-06-01'});
  assert.deepEqual(aiHeaders({...config,format:'gemini'}),{...base,'x-goog-api-key':config.key});
  assert.deepEqual(aiHeaders({...config,format:'azure'}),{...base,'api-key':config.key});
  for(const key of [null,42,'bad key','bad\nkey','bad\u00a0key','密钥','\u0000','\u007f','x'.repeat(513)])assert.throws(()=>aiCredential({...config,key}),/密钥/);
  assert.equal(aiCredential({...config,key:'x'.repeat(512)}).key.length,512);
  assert.equal(aiCredential({...config,key:''}).key,'');
  assert.throws(()=>aiCredential({...config,format:'unknown'}),/格式/);
});

test('AI maximum-size credential fits a 1024-byte packed record',()=>{
  const value=aiCredential({format:'anthropic',endpoint:'https://example.com/'+'x'.repeat(380),key:'"\\'.repeat(256)});
  const packed=value.format+'\n'+value.endpoint+'\n'+value.key;
  assert.equal(value.endpoint.length,400);assert.equal(value.key.length,512);
  assert.equal(Buffer.byteLength(packed,'utf8'),923);assert.ok(Buffer.byteLength(packed,'utf8')<=1024);
});

test('AI status/save/clear encrypts the whole credential with safeStorage and preserves Git tokens',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'vela-ai-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const encrypted=[],safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>{encrypted.push(text);return Buffer.from(text).map(byte=>byte^173);},decryptString:bytes=>Buffer.from(bytes).map(byte=>byte^173).toString()};
  const credentials=createCredentials(base,safeStorage),ai=new AiBridge({credentials,fetch:()=>assert.fail('save must not send requests')});
  const empty={saved:false,format:'',endpoint:'',last4:''};
  assert.deepEqual(await ai.call({action:'status'}),empty);
  assert.deepEqual(await ai.call({action:'request'}),{status:401,body:{error:{message:'未配置 AI 服务。'}}});
  credentials.write('github-token');credentials.write('gitee-token','gitee');
  const expected={saved:true,format:config.format,endpoint:config.endpoint,last4:'1234'};
  assert.deepEqual(await ai.call({...config,action:'save'}),expected);
  assert.deepEqual(JSON.parse(encrypted.at(-1)),config);
  assert.ok(!fs.readFileSync(path.join(base,'ai-token.dat')).includes(Buffer.from(config.key)));
  const restarted=new AiBridge({credentials:createCredentials(base,safeStorage)});
  assert.deepEqual(await restarted.call({action:'status'}),expected);
  assert.equal(credentials.read(),'github-token');assert.equal(credentials.read('gitee'),'gitee-token');
  assert.deepEqual(await restarted.call({...config,key:'',action:'save'}),{...expected,last4:''});
  assert.equal(await restarted.call({action:'clear'}),true);
  assert.equal(await restarted.call({action:'clear'}),true);
  assert.deepEqual(await restarted.call({action:'status'}),empty);
  assert.equal(credentials.read(),'github-token');
  const locked=createCredentials(base,{isEncryptionAvailable:()=>false});
  assert.throws(()=>locked.write('secret','ai'),/安全凭据存储不可用/);
});

test('AI verify is temporary and Azure validates without making a network call',async()=>{
  const calls=[],credentials=memory(),ai=new AiBridge({credentials,fetch:async(url,options)=>{calls.push({url,...options});return new Response('{"models":[]}',{status:200});}});
  for(const [format,path] of [['openai','/models'],['anthropic','/v1/models'],['gemini','/v1beta/models']]){
    assert.deepEqual(await ai.call({...config,format,action:'verify'}),{status:200,body:{models:[]}});
    assert.equal(calls.at(-1).url,config.endpoint+path);assert.equal(calls.at(-1).method,'GET');
    assert.equal(calls.at(-1).redirect,'manual');assert.equal(calls.at(-1).body,undefined);
    assert.deepEqual(calls.at(-1).headers,aiHeaders({...config,format}));
    assert.equal((await ai.call({action:'status'})).saved,false);
  }
  assert.deepEqual(await ai.call({...config,format:'azure',action:'verify'}),{status:200,body:{}});assert.equal(calls.length,3);
  await assert.rejects(ai.call({...config,format:'azure',endpoint:'http://public.example',action:'verify'}),/HTTPS/);
});

test('AI request binds endpoint and key to saved configuration and returns JSON or text errors',async()=>{
  let response=new Response('{"ok":true}',{status:201});const calls=[];
  const ai=new AiBridge({credentials:memory(),fetch:async(url,options)=>{calls.push({url,...options});return response;}});
  await ai.call({...config,action:'save'});
  assert.deepEqual(await ai.call({...request(),endpoint:'https://evil.example',key:'other'}),{status:201,body:{ok:true}});
  assert.equal(calls[0].url,config.endpoint+'/chat/completions');assert.equal(calls[0].headers.Authorization,'Bearer '+config.key);assert.equal(calls[0].body,'{"messages":[]}');
  response=new Response('upstream unavailable',{status:503});
  assert.deepEqual(await ai.call(request()),{status:503,body:{error:{message:'upstream unavailable'}}});
  for(const text of ['null','[1,2]','"text"','true','42']){response=new Response(text);assert.deepEqual((await ai.call(request())).body,JSON.parse(text));}
  response=new Response(null,{status:204});
  assert.deepEqual(await ai.call(request()),{status:204,body:{error:{message:''}}});
});

test('AI enforces byte limits, methods, and redirect policy before exposing a response',async()=>{
  let calls=0;const ai=new AiBridge({credentials:memory(),fetch:async()=>{calls++;return new Response('{}');}});
  await ai.call({...config,action:'save'});
  await assert.rejects(ai.call({...request(),method:'GET'}),/方法/);
  await assert.rejects(ai.call({...request(),path:'/models'}),/路径/);
  await assert.rejects(ai.call({...request(),body:undefined}),/数据无效/);
  await assert.rejects(ai.call(request('large','中'.repeat(700000))),/2 MB/);assert.equal(calls,0);
  await ai.call(request('limit','a'.repeat(2*1024*1024-2)));assert.equal(calls,1);
  ai.fetch=async()=>new Response('a'.repeat(4*1024*1024+1));
  await assert.rejects(ai.call(request()),/4 MB/);assert.equal(ai.requests.size,0);
  ai.fetch=async()=>new Response('',{status:302,headers:{Location:'https://evil.example'}});
  await assert.rejects(ai.call(request()),/重定向/);
  ai.fetch=async()=>{throw Error(config.key);};
  await assert.rejects(ai.call(request()),error=>error.message==='无法连接 AI 服务，请检查网络或接口地址。');
});

test('AI cancellation aborts local HTTP requests before headers and during the response body',async t=>{
  let reached;const sockets=new Map();
  const endpoint=await serverFor(t,(req,res)=>{req.resume();req.on('end',()=>{const id=req.headers['x-test-id'];sockets.set(id,res);if(id==='body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"partial":');}else if(id==='other'){res.end('{"ok":true}');}reached?.();});});
  const ai=new AiBridge({credentials:memory(),fetch});await ai.call({...config,endpoint,action:'save'});
  for(const id of ['headers','body']){
    ai.fetch=(url,options)=>fetch(url,{...options,headers:{...options.headers,'x-test-id':id}});
    const arrived=new Promise(resolve=>{reached=resolve;}),pending=ai.call(request(id)),rejected=assert.rejects(pending,/AI 请求已取消/);
    await arrived;
    await assert.rejects(ai.call(request(id)),/标识已在使用/);
    assert.equal(await ai.call({action:'cancel',requestId:id}),true);
    await rejected;assert.equal(ai.requests.size,0);
  }
  ai.fetch=(url,options)=>fetch(url,{...options,headers:{...options.headers,'x-test-id':'other'}});
  assert.deepEqual(await ai.call(request('other')),{status:200,body:{ok:true}});
  assert.equal(await ai.call({action:'cancel',requestId:'missing'}),true);
});

test('AI never follows HTTP redirects with the stored key',async t=>{
  let forwarded=0;
  const endpoint=await serverFor(t,(req,res)=>{req.resume();if(req.url==='/chat/completions'){res.writeHead(302,{Location:'/untrusted'});res.end();}else{forwarded++;res.end('{}');}});
  const ai=new AiBridge({credentials:memory(),fetch});await ai.call({...config,endpoint,action:'save'});
  await assert.rejects(ai.call(request()),/AI 服务不允许重定向/);assert.equal(forwarded,0);
});

test('AI timeout aborts the request and releases its request ID',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ai=new AiBridge({credentials:memory(),fetch:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
  await ai.call({...config,action:'save'});
  const pending=ai.call(request()),rejected=assert.rejects(pending,/AI 请求超时/);
  t.mock.timers.tick(120000);await rejected;assert.equal(ai.requests.size,0);
});
