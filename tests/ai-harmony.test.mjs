import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const compiled=await build({entryPoints:['entry/src/main/ets/services/NativeBridge.ets'],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.ets':'ts'},resolveExtensions:['.ets','.js'],plugins:[{name:'sdk',setup(plugin){
  plugin.onLoad({filter:/WorkspaceSave\.ets$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/^@Concurrent\s*$/m,''),loader:'ts'}));
  plugin.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));
  plugin.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(args.path)}];`}));
}}]});
const config={format:'openai',endpoint:'http://127.0.0.1:11434/v1',key:'fixture-1234'};
const request=(requestId='one')=>({action:'request',requestId,method:'POST',path:'/chat/completions',body:{messages:[]}});
function fixture(){
  const assets=new Map(),sessions=[],logs=[];let onFetch;
  const tags={ALIAS:1,SECRET:2,RETURN_TYPE:3,ACCESSIBILITY:4,CONFLICT_RESOLUTION:5},alias=value=>new TextDecoder().decode(value.get(tags.ALIAS));
  const sdk={
    '@kit.RemoteCommunicationKit':{rcp:{Request:class{constructor(url,method,headers,body){Object.assign(this,{url,method,headers,body});}},createSession(configuration){
      const session={configuration,cancelled:false,closed:false,cancel(){this.cancelled=true;this.reject?.(Error('cancelled'));},close(){this.closed=true;},fetch(req){this.request=req;return new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;if(onFetch)onFetch(this);else this.reply('{}');});},reply(text,statusCode=200){configuration.requestConfiguration.tracing?.httpEventsHandler.onDataReceive(new TextEncoder().encode(text).buffer);this.resolve({statusCode,toString:()=>text});}};
      sessions.push(session);return session;
    }}},
    '@kit.AssetStoreKit':{asset:{Tag:tags,ReturnType:{ALL:0},Accessibility:{DEVICE_UNLOCKED:0},ConflictResolution:{OVERWRITE:1},async query(query){const found=assets.get(alias(query));if(!found)throw {code:24000002};return [found];},async add(attributes){assert.ok(attributes.get(tags.SECRET).byteLength<=1024);assert.equal(attributes.size,4);assert.equal(attributes.get(tags.ACCESSIBILITY),0);assert.equal(attributes.get(tags.CONFLICT_RESOLUTION),1);assets.set(alias(attributes),new Map(attributes));},async remove(query){if(!assets.delete(alias(query)))throw {code:24000002};}}},
    '@kit.ArkTS':{url:{URL:{parseURL:value=>new URL(value)}},util:{TextEncoder:class{encodeInto(value){return new TextEncoder().encode(value);}},TextDecoder:{create:()=>({decodeToString:bytes=>new TextDecoder().decode(bytes)})}}},
    '@kit.PerformanceAnalysisKit':{hilog:{error:(...args)=>logs.push(args)}},'@kit.CoreFileKit':{fileIo:{},picker:{},fileUri:{}},'@kit.AbilityKit':{}
  };
  const module={exports:{}},context=vm.createContext({sdk,module,exports:module.exports,Error,Map,Uint8Array,setTimeout,clearTimeout});
  new vm.Script(compiled.outputFiles[0].text).runInContext(context);
  const create=()=>new module.exports.NativeBridge(),bridge=create();
  return {assets,sessions,logs,create,bridge,setFetch:fn=>{onFetch=fn;},call:async data=>JSON.parse(await bridge.call('ai',JSON.stringify(data)))};
}

test('Harmony AI uses its own Asset Store alias and survives a bridge restart without exposing the key',async()=>{
  const f=fixture();assert.deepEqual((await f.call({action:'request'})).value,{status:401,body:{error:{message:'未配置 AI 服务。'}}});
  assert.deepEqual((await f.call({...config,action:'save'})).value,{saved:true,format:'openai',endpoint:config.endpoint,last4:'1234'});
  assert.equal(new TextDecoder().decode(f.assets.get('wenzhou.ai.token').get(2)),config.format+'\n'+config.endpoint+'\n'+config.key);
  const restarted=f.create();assert.equal(JSON.parse(await restarted.call('ai','{"action":"status"}')).value.last4,'1234');
  assert.equal((await f.call({action:'clear'})).value,true);assert.equal((await f.call({action:'clear'})).value,true);assert.equal((await f.call({action:'status'})).value.saved,false);
  assert.ok(!JSON.stringify(f.logs).includes(config.key));
});

test('Harmony AI stores a maximum-size packed record directly in SECRET and enforces ASCII limits',async()=>{
  const f=fixture(),endpoint='https://example.com/'+'x'.repeat(380),key='"\\'.repeat(256),format='anthropic';
  assert.equal(endpoint.length,400);assert.equal(key.length,512);
  assert.equal((await f.call({format,endpoint,key,action:'save'})).ok,true);
  assert.equal(f.assets.size,1);
  const entry=f.assets.get('wenzhou.ai.token'),secret=entry.get(2);
  assert.equal(entry.size,4);assert.equal(secret.byteLength,923);assert.ok(secret.byteLength<=1024);
  assert.equal(new TextDecoder().decode(secret),format+'\n'+endpoint+'\n'+key);
  const restarted=f.create(),status=JSON.parse(await restarted.call('ai','{"action":"status"}'));
  assert.deepEqual(status.value,{saved:true,format,endpoint,last4:key.slice(-4)});
  for(const invalid of [endpoint+'x','https://例子.com','https://example.com/中','https://example.com/\u0000','https://example.com/\u007f'])assert.equal((await f.call({...config,endpoint:invalid,action:'save'})).ok,false);
  for(const invalid of [key+'x','密钥','bad key','bad\nkey','\u0000','\u007f'])assert.equal((await f.call({...config,key:invalid,action:'save'})).ok,false);
  assert.equal((await f.call({...config,format:'unknown',action:'save'})).ok,false);
  assert.equal((await f.call({action:'status'})).value.last4,key.slice(-4));
  assert.equal((await f.call({...config,endpoint:'https://xn--fsqu00a.com',key:'',action:'save'})).ok,true);
  assert.equal(f.assets.size,1);assert.equal((await f.call({action:'status'})).value.last4,'');
});

test('Harmony AI queued writes survive Git login/logout and preserve Git credentials',async()=>{
  const f=fixture(),gitToken='git-fixture-token';
  const git=(operation)=>f.bridge.call(operation,JSON.stringify({token:gitToken})).then(JSON.parse);
  assert.equal((await git('login')).ok,true);
  // Hold the shared queue so both AI saves encounter subsequent Git generation changes.
  let release;const gate=new Promise(resolve=>{release=resolve;});
  f.bridge.credentialWrite(()=>gate);
  const first=f.call({...config,action:'save'}),second=f.call({...config,key:'replacement',action:'save'});
  const login=git('login');
  release();
  assert.equal((await first).ok,true);assert.equal((await second).ok,true);assert.equal((await login).ok,true);
  assert.equal(new TextDecoder().decode(f.assets.get('wenzhou.github.token').get(2)),gitToken);
  assert.equal((await f.call({action:'status'})).value.last4,'ment');
  let resume;const blocked=new Promise(resolve=>{resume=resolve;});
  f.bridge.credentialWrite(()=>blocked);
  const saved=f.call({...config,action:'save'}),logout=git('logout');
  resume();
  assert.equal((await saved).ok,true);assert.equal((await logout).ok,true);
  assert.equal(f.assets.has('wenzhou.github.token'),false);
  assert.equal((await f.call({action:'status'})).value.last4,'1234');
  const before=f.assets.get('wenzhou.ai.token');
  await assert.rejects(f.bridge.storeAiCredential('x'.repeat(1025)),/1024/);
  assert.equal(f.assets.get('wenzhou.ai.token'),before);
});

test('Harmony AI verifies temporarily and attaches stored authentication only to allowed paths',async()=>{
  const f=fixture();
  for(const [format,path,header] of [['openai','/models','Authorization'],['anthropic','/v1/models','x-api-key'],['gemini','/v1beta/models','x-goog-api-key']]){
    assert.equal((await f.call({...config,format,action:'verify'})).value.status,200);
    const session=f.sessions.at(-1);assert.equal(session.request.url,config.endpoint+path);assert.ok(session.request.headers[header].endsWith(config.key));assert.equal(session.configuration.requestConfiguration.transfer.autoRedirect,false);assert.ok(session.closed);
  }
  assert.equal((await f.call({action:'status'})).value.saved,false);
  assert.deepEqual((await f.call({...config,format:'azure',action:'verify'})).value,{status:200,body:{}});assert.equal(f.sessions.length,3);
  for(const endpoint of ['http://public.example','http://010.0.0.1','https://user@example.com','https://example.com/?key=x'])assert.equal((await f.call({...config,endpoint,action:'save'})).ok,false);
  await f.call({...config,action:'save'});
  assert.match((await f.call({...request(),path:'/models'})).error,/路径/);
  assert.match((await f.call({...request(),body:'中'.repeat(700000)})).error,/2 MB/);
  f.setFetch(session=>session.reply('upstream unavailable',503));
  assert.deepEqual((await f.call({...request(),endpoint:'https://other.example',key:'other'})).value,{status:503,body:{error:{message:'upstream unavailable'}}});
  assert.equal(f.sessions.at(-1).request.url,config.endpoint+'/chat/completions');
});

test('Harmony AI cancellation targets one session, releases IDs, and enforces the response limit',async()=>{
  const f=fixture();await f.call({...config,action:'save'});
  const active=[];f.setFetch(session=>active.push(session));
  const first=f.call(request('first')),second=f.call(request('second'));
  // Drain Asset Store/cache promise continuations before cancelling the live sessions.
  await new Promise(resolve=>setImmediate(resolve));
  assert.match((await f.call(request('first'))).error,/标识已在使用/);
  assert.equal((await f.call({action:'cancel',requestId:'first'})).value,true);
  assert.match((await first).error,/AI 请求已取消/);assert.ok(active[0].cancelled&&active[0].closed);assert.equal(active[1].cancelled,false);
  active[1].reply('{"ok":true}');assert.deepEqual((await second).value,{status:200,body:{ok:true}});
  f.setFetch(session=>session.reply('a'.repeat(4*1024*1024+1)));
  assert.match((await f.call(request('first'))).error,/4 MB/);assert.ok(f.sessions.at(-1).cancelled&&f.sessions.at(-1).closed);
  f.setFetch(session=>session.reject({code:1007900201}));assert.match((await f.call(request('first'))).error,/HTTP.*HTTPS/);
});
