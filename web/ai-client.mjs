import {projectConfig} from './vela.mjs';
// One entry point for AI requests (docs/AI-ASSIST.md). In the apps the key stays in the native secure store and the
// native `ai` operation sends requests; the browser preview is for testing only and keeps the key in memory.
import {t,say} from './i18n.mjs';
import {native,transport} from './platform.mjs';
import {buildRequest,parseResponse,parseModels,verifyPath,authHeaders,normalizeEndpoint,validKey,preset,AZURE_API_VERSION} from './ai-providers.mjs';

let browserKey=null,requestCounter=0,activeRequests=0;
const activityListeners=new Set();
export function subscribeAiActivity(listener){activityListeners.add(listener);listener(activeRequests);return ()=>activityListeners.delete(listener);}
export async function aiComplete(workspace,options){
  activeRequests++;for(const listener of activityListeners)listener(activeRequests);
  try{return await complete(workspace,options);}
  finally{activeRequests--;for(const listener of activityListeners)listener(activeRequests);}
}

/** Default settings; stored in workspace.settings.ai, never with the key. */
export function aiSettings(workspace){
  const value=workspace.settings.ai||={};
  value.enabled??=false;value.consented??=false;value.provider??='openai';
  value.format??=preset(value.provider).format;value.endpoint??=preset(value.provider).endpoint;
  value.models||={};value.models.extract??='';value.models.suggest??='';
  value.apiVersion??=AZURE_API_VERSION;value.confirmChars??=20000;value.dailyChars??=0;value.contextTokens??=8192;
  value.usage||={day:'',chars:0};
  return value;
}

/** {saved, format, endpoint, last4}; in the browser preview, whether a key is held in memory. */
export async function aiStatus(){
  if(native)return transport('ai',{action:'status'});
  return browserKey?{saved:true,format:browserKey.format,endpoint:browserKey.endpoint,last4:browserKey.key.slice(-4)}:{saved:false,format:'',endpoint:'',last4:''};
}

/** Checks a key against the service and returns the models it offers ([] when the format has no list call). */
export async function aiVerify({format,endpoint,key}){
  const base=normalizeEndpoint(endpoint);if(base instanceof Error)throw base;
  const result=native?await transport('ai',{action:'verify',format,endpoint:base,key})
    :verifyPath(format)?await browserFetch(format,base,key,'GET',verifyPath(format)):{status:200,body:{}};
  if(result.status<200||result.status>=300){const error=parseResponse(format,result.status,result.body);throw error instanceof Error?error:new Error(t('AI 服务拒绝了请求。'));}
  return parseModels(format,result.body);
}

export async function aiSave({format,endpoint,key}){
  const base=normalizeEndpoint(endpoint);if(base instanceof Error)throw base;
  if(!validKey(key))throw new Error(t('API Key 格式不正确。'));
  if(native)return transport('ai',{action:'save',format,endpoint:base,key});
  browserKey={format,endpoint:base,key};return aiStatus();
}

export async function aiClear(){
  if(native)return transport('ai',{action:'clear'});
  browserKey=null;return true;
}

/** True when the saved key belongs to the configured service (changing the endpoint needs the key again). */
export const aiReady=(settings,status)=>!!settings.enabled&&!!status?.saved&&status.format===settings.format&&status.endpoint===normalizeEndpoint(settings.endpoint);

export function aiModelFor(workspace,doc,purpose,settings=aiSettings(workspace)){
 return (doc&&projectConfig(workspace,doc)?.config?.ai?.models?.[purpose])||settings.models[purpose]||settings.models.extract;
}
/**
 * Sends one generation request. `purpose` picks the model ('extract' or 'suggest'); `chars` is what counts toward
 * the daily limit (the text the user chose to send).
 */
async function complete(workspace,{purpose,system,messages,maxTokens,temperature,signal,document:source}){
  const settings=aiSettings(workspace),chars=[system,...messages.map(message=>message.content)].join('').length;
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(!settings.consented||!aiReady(settings,await aiStatus()))throw new Error(t('未配置 AI 服务。'));
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  if(settings.usage.day!==today)settings.usage={day:today,chars:0};
  if(settings.dailyChars&&settings.usage.chars+chars>settings.dailyChars)throw new Error(say(`已达到每日发送上限（${settings.dailyChars.toLocaleString()} 字），明天再试，或在 AI 设置中调整。`,`Daily limit reached (${settings.dailyChars.toLocaleString()} characters). Try tomorrow or change it in AI settings.`));
  const document=source||workspace.documents?.find(doc=>doc.id===workspace.activeId);
  const request=buildRequest(settings.format,{model:aiModelFor(workspace,document,purpose,settings),system,messages,maxTokens,temperature,apiVersion:settings.apiVersion});
  // Like the local Tarot client, use non-streaming chat requests. DeepSeek's
  // thinking tokens share the output budget; short continuation budgets otherwise
  // leave no final answer. These bounded text tasks explicitly use non-thinking mode.
  if(settings.format==='openai' && new URL(settings.endpoint).hostname==='api.deepseek.com'){
    request.body.thinking={type:'disabled'};
    if(purpose==='extract')request.body.response_format={type:'json_object'};
  }
  settings.usage.chars+=chars;
  let result;
  if(native){
    const requestId='ai-'+(++requestCounter)+'-'+Date.now();
    const cancel=()=>transport('ai',{action:'cancel',requestId}).catch(()=>{});
    signal?.addEventListener('abort',cancel,{once:true});
    try{result=await transport('ai',{action:'request',requestId,method:'POST',path:request.path,body:request.body});}
    catch(error){cancel();throw error;}
    finally{signal?.removeEventListener('abort',cancel);}
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  }else{
    if(!browserKey)throw new Error(t('未配置 AI 服务。'));
    result=await browserFetch(settings.format,browserKey.endpoint,browserKey.key,'POST',request.path,request.body,signal);
  }
  const parsed=parseResponse(settings.format,result.status,result.body);
  if(parsed instanceof Error)throw parsed;
  return parsed;
}

async function browserFetch(format,endpoint,key,method,path,body,signal){
  // AbortSignal.any needs Chromium 116; the WebView target is 105.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let response,text;
  try{
    response=await fetch(endpoint+path,{method,headers:{...authHeaders(format,key),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:controller.signal});
    text=await response.text();
    if(text.length>4*1024*1024)throw new Error(t('AI 结果超过大小限制。'));
  }catch(error){
    if(signal?.aborted)throw error;
    throw new Error(controller.signal.aborted?t('AI 服务响应超时。'):t('无法连接 AI 服务。浏览器预览版可能被服务的跨域限制拒绝，请在文舟应用中使用。'));
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  let parsed;try{parsed=JSON.parse(text);}catch{parsed={error:{message:text.slice(0,300)}};}
  return {status:response.status,body:parsed};
}
