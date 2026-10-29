import assert from 'node:assert/strict';
import test from 'node:test';
import {PRESETS,normalizeEndpoint,isLocalEndpoint,validKey,MAX_ENDPOINT,MAX_KEY,buildRequest,parseResponse,parseModels,verifyPath,authHeaders} from '../web/ai-providers.mjs';

test('endpoints: HTTPS anywhere, HTTP only for local and LAN hosts, no credentials or queries',()=>{
  assert.equal(normalizeEndpoint('https://api.deepseek.com/v1/'),'https://api.deepseek.com/v1');
  for(const local of ['http://localhost:11434/v1','http://127.0.0.1:1234/v1','http://192.168.1.20:8080/v1','http://10.0.0.5/v1','http://172.20.1.1/v1','http://box.local/v1'])
    assert.equal(normalizeEndpoint(local),local,local);
  for(const bad of ['','not a url','http://api.openai.com/v1','http://172.32.0.1/v1','https://user:pass@x.com/v1','https://x.com/v1?key=1','https://x.com/v1#a','ftp://x.com','https://'+'a'.repeat(400)+'.com','https://例子.测试/v1'])
    assert.ok(normalizeEndpoint(bad) instanceof Error,bad);
  const longest='https://'+'a'.repeat(MAX_ENDPOINT-12)+'.com';assert.equal(longest.length,MAX_ENDPOINT);assert.equal(normalizeEndpoint(longest),longest);
  assert.equal(validKey('sk-'+'a'.repeat(MAX_KEY-3)),true);assert.equal(validKey('a'.repeat(MAX_KEY+1)),false);assert.equal(validKey(''),true);assert.equal(validKey('sk 1'),false);assert.equal(validKey('密钥'),false);
  // format + endpoint + key + two separators must fit the 1024-byte HarmonyOS Asset Store secret
  assert.ok('anthropic'.length+MAX_ENDPOINT+MAX_KEY+2<=1024);
  assert.equal(isLocalEndpoint('http://localhost:11434/v1'),true);assert.equal(isLocalEndpoint('https://api.openai.com/v1'),false);
  for(const item of PRESETS.filter(item=>item.endpoint&&!item.endpoint.includes('<')))assert.equal(typeof normalizeEndpoint(item.endpoint),'string',item.id);
});

test('requests for the four formats use the allowed paths and carry system prompts the way each service expects',()=>{
  const input={model:'m-1',system:'你是编辑',messages:[{role:'user',content:'第一章'},{role:'assistant',content:'好'}],maxTokens:300,temperature:0.2};
  const openai=buildRequest('openai',input);
  assert.equal(openai.path,'/chat/completions');assert.deepEqual(openai.body.messages[0],{role:'system',content:'你是编辑'});assert.equal(openai.body.model,'m-1');assert.equal(openai.body.max_tokens,300);
  const anthropic=buildRequest('anthropic',input);
  assert.equal(anthropic.path,'/v1/messages');assert.equal(anthropic.body.system,'你是编辑');assert.equal(anthropic.body.messages.length,2);assert.equal(anthropic.body.max_tokens,300);
  const gemini=buildRequest('gemini',{...input,model:'gemini-x'});
  assert.equal(gemini.path,'/v1beta/models/gemini-x:generateContent');assert.equal(gemini.body.contents[1].role,'model');assert.equal(gemini.body.systemInstruction.parts[0].text,'你是编辑');assert.equal(gemini.body.generationConfig.maxOutputTokens,300);
  const azure=buildRequest('azure',{...input,model:'my-deploy',apiVersion:'2024-10-21'});
  assert.equal(azure.path,'/openai/deployments/my-deploy/chat/completions?api-version=2024-10-21');assert.equal(azure.body.model,undefined);
  assert.throws(()=>buildRequest('openai',{...input,model:''}));
  assert.throws(()=>buildRequest('gemini',{...input,model:'../../evil'}));
  assert.throws(()=>buildRequest('azure',{...input,model:'a/b'}));
  assert.throws(()=>buildRequest('azure',{...input,model:'d',apiVersion:'x&key=1'}));
});

test('responses: text and usage per format; HTTP errors keep the service message',()=>{
  assert.deepEqual(parseResponse('openai',200,{choices:[{message:{content:'续写'}}],usage:{prompt_tokens:3,completion_tokens:4}}),{text:'续写',usage:{input:3,output:4}});
  assert.deepEqual(parseResponse('anthropic',200,{content:[{type:'text',text:'甲'},{type:'text',text:'乙'}],usage:{input_tokens:1,output_tokens:2}}),{text:'甲乙',usage:{input:1,output:2}});
  assert.equal(parseResponse('gemini',200,{candidates:[{content:{parts:[{text:'丙'}]}}]}).text,'丙');
  const unauthorized=parseResponse('openai',401,{error:{message:'Incorrect API key'}});
  assert.ok(unauthorized instanceof Error);assert.match(unauthorized.message,/API Key/);assert.match(unauthorized.message,/Incorrect API key/);
  assert.ok(parseResponse('openai',429,{})instanceof Error);
  assert.ok(parseResponse('anthropic',200,{content:[]})instanceof Error,'an empty answer is an error');
});

test('model lists and verify paths',()=>{
  assert.deepEqual(parseModels('openai',{data:[{id:'b'},{id:'a'},{id:'a'},{id:'../x'}]}),['a','b']);
  assert.deepEqual(parseModels('anthropic',{data:[{id:'claude-x'}]}),['claude-x']);
  assert.deepEqual(parseModels('gemini',{models:[{name:'models/g-1',supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}]}),['g-1']);
  assert.equal(verifyPath('openai'),'/models');assert.equal(verifyPath('anthropic'),'/v1/models');assert.equal(verifyPath('gemini'),'/v1beta/models');assert.equal(verifyPath('azure'),'');
});

test('browser-preview auth headers; keyless local models send none',()=>{
  assert.deepEqual(authHeaders('openai','sk-1'),{Authorization:'Bearer sk-1'});
  assert.deepEqual(authHeaders('openai',''),{});
  assert.equal(authHeaders('anthropic','k')['x-api-key'],'k');
  assert.equal(authHeaders('gemini','k')['x-goog-api-key'],'k');
  assert.equal(authHeaders('azure','k')['api-key'],'k');
});
