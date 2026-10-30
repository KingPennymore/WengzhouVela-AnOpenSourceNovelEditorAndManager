// AI services and their four request formats (docs/AI-ASSIST.md). Pure functions: no network, no keys. The native
// `ai` operation enforces the same paths and adds the auth headers; the browser preview uses authHeaders() itself.
import {t} from './i18n.mjs';

export const FORMATS=['openai','anthropic','gemini','azure'];
export const AZURE_API_VERSION='2024-10-21';

// i18n-data-start: service names are brands; endpoints are data
export const PRESETS=[
  {id:'openai',name:'OpenAI',format:'openai',endpoint:'https://api.openai.com/v1'},
  {id:'anthropic',name:'Anthropic Claude',format:'anthropic',endpoint:'https://api.anthropic.com'},
  {id:'gemini',name:'Google Gemini',format:'gemini',endpoint:'https://generativelanguage.googleapis.com'},
  {id:'azure',name:'Azure OpenAI',format:'azure',endpoint:'https://<resource>.openai.azure.com'},
  {id:'deepseek',name:'DeepSeek',format:'openai',endpoint:'https://api.deepseek.com/v1'},
  {id:'qwen',name:'通义千问（百炼）',format:'openai',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1'},
  {id:'moonshot',name:'Kimi（月之暗面）',format:'openai',endpoint:'https://api.moonshot.cn/v1'},
  {id:'zhipu',name:'智谱 GLM',format:'openai',endpoint:'https://open.bigmodel.cn/api/paas/v4'},
  {id:'doubao',name:'豆包（火山方舟）',format:'openai',endpoint:'https://ark.cn-beijing.volces.com/api/v3'},
  {id:'qianfan',name:'百度千帆',format:'openai',endpoint:'https://qianfan.baidubce.com/v2'},
  {id:'hunyuan',name:'腾讯混元',format:'openai',endpoint:'https://api.hunyuan.cloud.tencent.com/v1'},
  {id:'siliconflow',name:'硅基流动',format:'openai',endpoint:'https://api.siliconflow.cn/v1'},
  {id:'openrouter',name:'OpenRouter',format:'openai',endpoint:'https://openrouter.ai/api/v1'},
  {id:'mistral',name:'Mistral',format:'openai',endpoint:'https://api.mistral.ai/v1'},
  {id:'xai',name:'xAI Grok',format:'openai',endpoint:'https://api.x.ai/v1'},
  {id:'groq',name:'Groq',format:'openai',endpoint:'https://api.groq.com/openai/v1'},
  {id:'ollama',name:'Ollama（本机）',format:'openai',endpoint:'http://localhost:11434/v1',local:true},
  {id:'lmstudio',name:'LM Studio（本机）',format:'openai',endpoint:'http://localhost:1234/v1',local:true},
  {id:'custom',name:'自定义',format:'openai',endpoint:''},
];
// i18n-data-end
export const preset=id=>PRESETS.find(item=>item.id===id)||PRESETS.at(-1);

const PRIVATE_HOST=/^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)$/i;
// The whole stored record (format, endpoint, key) must fit the 1024-byte HarmonyOS Asset Store secret.
export const MAX_ENDPOINT=400,MAX_KEY=512;
const PRINTABLE=/^[\x21-\x7e]*$/;
/** The base URL without a trailing slash, or an Error explaining why it is refused. Native code applies the same rules. */
export function normalizeEndpoint(value){
  const text=String(value||'').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  if(!text)return new Error(t('请填写接口地址。'));
  if(text.length>MAX_ENDPOINT||!PRINTABLE.test(text))return new Error(t('接口地址过长或包含非 ASCII 字符（国际化域名请使用 punycode 形式）。'));
  let url;
  try{url=new URL(text);}catch{return new Error(t('接口地址格式不正确。'));}
  if(url.username||url.password||url.search||url.hash)return new Error(t('接口地址不能包含用户名、查询参数或片段。'));
  if(url.protocol==='http:'&&!PRIVATE_HOST.test(url.hostname))return new Error(t('只有本机或局域网地址可以使用 HTTP，其他地址请使用 HTTPS。'));
  if(url.protocol!=='https:'&&url.protocol!=='http:')return new Error(t('接口地址格式不正确。'));
  return text;
}
/** Keys are printable ASCII, at most MAX_KEY characters; local models may use none. */
export const validKey=key=>typeof key==='string'&&key.length<=MAX_KEY&&PRINTABLE.test(key);
export const isLocalEndpoint=endpoint=>{try{return PRIVATE_HOST.test(new URL(endpoint).hostname);}catch{return false;}};

const MODEL=/^(?!.*\.\.)[A-Za-z0-9._:/-]{1,128}$/,DEPLOYMENT=/^[A-Za-z0-9._-]{1,128}$/,VERSION=/^[0-9a-z.-]{1,32}$/;
/** Path and JSON body of a generation request. `messages` are {role:'user'|'assistant', content}. */
export function buildRequest(format,{model,system='',messages,maxTokens=1024,temperature=0.7,apiVersion=AZURE_API_VERSION}){
  if(format==='azure'?!DEPLOYMENT.test(model||''):!MODEL.test(model||''))throw new Error(t('请先选择模型。'));
  const chat=[...(system?[{role:'system',content:system}]:[]),...messages];
  if(format==='anthropic')return {path:'/v1/messages',body:{model,max_tokens:maxTokens,temperature,...(system?{system}:{}),messages}};
  if(format==='gemini')return {path:`/v1beta/models/${model}:generateContent`,body:{
    ...(system?{systemInstruction:{parts:[{text:system}]}}:{}),
    contents:messages.map(message=>({role:message.role==='assistant'?'model':'user',parts:[{text:message.content}]})),
    generationConfig:{maxOutputTokens:maxTokens,temperature}}};
  if(format==='azure'){
    if(!VERSION.test(apiVersion))throw new Error(t('API 版本格式不正确。'));
    return {path:`/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`,body:{messages:chat,max_tokens:maxTokens,temperature}};
  }
  return {path:'/chat/completions',body:{model,messages:chat,max_tokens:maxTokens,temperature,stream:false}};
}

/** Text and token usage from a response, or an Error carrying the service's own message. */
export function parseResponse(format,status,body){
  const message=body?.error?.message||(typeof body?.error==='string'?body.error:'')||body?.message;
  if(status<200||status>=300)return new Error(serviceError(status,message));
  let text='',usage={input:0,output:0};
  if(format==='anthropic'){
    text=(body?.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('');
    usage={input:body?.usage?.input_tokens||0,output:body?.usage?.output_tokens||0};
  }else if(format==='gemini'){
    text=(body?.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('');
    usage={input:body?.usageMetadata?.promptTokenCount||0,output:body?.usageMetadata?.candidatesTokenCount||0};
  }else{
    const content=body?.choices?.[0]?.message?.content;
    text=Array.isArray(content)?content.filter(part=>part.type==='text').map(part=>part.text).join('\n'):content||'';
    if(body?.choices?.[0]?.finish_reason==='length')return new Error(t('AI 输出达到长度上限，请减少所选章节或更换非思考模型后重试。'));
    usage={input:body?.usage?.prompt_tokens||0,output:body?.usage?.completion_tokens||0};
  }
  if(!text)return new Error(message||t('AI 服务没有返回内容。'));
  return {text,usage};
}
function serviceError(status,message){
  const reason=status===401||status===403?t('API Key 无效或没有权限。'):status===404?t('接口地址或模型不存在。'):status===429?t('请求过于频繁或额度不足，请稍后再试。'):status>=500?t('AI 服务暂时不可用。'):t('AI 服务拒绝了请求。');
  return message?reason+' '+String(message).slice(0,300):reason;
}

/** Model ids from the verify response (the services' model lists). */
export function parseModels(format,body){
  const ids=format==='gemini'
    ?(body?.models||[]).filter(model=>!model.supportedGenerationMethods||model.supportedGenerationMethods.includes('generateContent')).map(model=>String(model.name||'').replace(/^models\//,''))
    :(body?.data||body?.models||[]).map(model=>model.id||model.name);
  return [...new Set(ids.filter(id=>typeof id==='string'&&MODEL.test(id)))].sort();
}

/** The verify request: the service's model list (Azure has none worth calling). */
export const verifyPath=format=>({openai:'/models',anthropic:'/v1/models',gemini:'/v1beta/models'})[format]||'';

/** Auth headers. Only the browser preview calls this; native code attaches the stored key itself. */
export function authHeaders(format,key){
  if(format==='anthropic')return {'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};
  if(format==='gemini')return {'x-goog-api-key':key};
  if(format==='azure')return {'api-key':key};
  return key?{Authorization:'Bearer '+key}:{};
}
