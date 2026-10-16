export const native = typeof window !== 'undefined' && !!window.WenzhouNative;
const sessionTokens=new Map();
const providerOf=payload=>{const provider=payload.provider||'github';if(!['github','gitee'].includes(provider))throw Error('不支持此代码托管平台。');return provider;};
const apiOrigin=provider=>provider==='gitee'?'https://gitee.com/api/v5':'https://api.github.com';
export async function transport(operation,payload={}) {
  if(native) {
    const raw=await window.WenzhouNative.call(operation,JSON.stringify(payload));
    if(typeof raw!=='string' || !raw) throw new Error('原生调用未返回结果，请更新文舟应用后重试。');
    let response;
    try {response=JSON.parse(raw);}catch{throw new Error('原生调用返回格式异常，请更新文舟应用后重试。');}
    if(typeof response?.ok!=='boolean') throw new Error('原生调用返回格式异常，请更新文舟应用后重试。');
    if(!response.ok) throw Object.assign(new Error(response.error || `设备操作失败${response.code?'（错误码 '+response.code+'）':''}。`),typeof response.code==='string'?{code:response.code,details:response.details||{},retryable:!!response.retryable}:{});
    return response.value;
  }
  const provider=providerOf(payload),origin=apiOrigin(provider),sessionToken=sessionTokens.get(provider)||'';
  if(operation==='oauth') throw new Error('设备授权请在文舟应用中使用。浏览器预览可使用个人访问令牌登录。');
  if(operation==='connection') {
    const result=await fetch(origin+(provider==='gitee'?'/emojis':''),{redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:{}};
  }
  if(operation==='logout') {sessionTokens.delete(provider);return true;}
  if(operation==='login') {
    const token=payload.token.trim();
    const result=await fetch(origin+'/user',{headers:headers(token,provider),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!result.ok) throw new Error('令牌验证失败，请检查令牌和网络。');
    const user=await result.json();sessionTokens.set(provider,token);
    return user;
  }
  if(operation==='api'||operation==='publicApi') {
    if(operation==='publicApi'&&(!/^\/repos\/[\w.-]+\/[\w.-]+(?:[/?]|$)/.test(payload.path)||/[\r\n\\#]/.test(payload.path)||payload.path.includes('..')||payload.method!=='GET'))throw new Error('不允许的 GitHub 请求路径。');
    if(!sessionToken&&operation!=='publicApi') return {status:401,body:{}};
    const result=await fetch(origin+payload.path,{method:payload.method,headers:sessionToken?headers(sessionToken,provider):{Accept:provider==='gitee'?'application/json':'application/vnd.github+json'},body:payload.body ? JSON.stringify(payload.body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:result.status===204?null:await result.json()};
  }
  throw new Error('当前环境不支持此操作。');
}
function headers(token,provider='github') { if(provider==='gitee')return {'Authorization':`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json'};return {'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}; }
export function readWorkspace() { return native ? window.WenzhouNative.readWorkspace() : localStorage.getItem('wenzhou.workspace'); }
// Native saves are incremental when the shell offers writeWorkspaceDelta (docs/WORKSPACE-STORAGE.md): only texts and
// local histories that differ from the last state the shell confirmed are sent, with the rest of the workspace as a
// small skeleton. `saveId` names that confirmed state; a shell whose state has a different saveId answers E_DELTA_BASE
// and the save falls back to the full JSON (still the only path for the browser and for older shells).
let baseline=null;
const newSaveId=()=>crypto.randomUUID();
function remember(value,saveId){baseline={saveId,storage:value.storage?.id||'',texts:new Map(value.documents.map(doc=>[doc.id,doc.text])),histories:new Map(Object.entries(value.localHistory||{}).map(([id,list])=>[id,{list,length:list?.length}]))};}
export function primeWorkspaceBaseline(value){const saveId=value.saveId;delete value.saveId;if(native&&typeof saveId==='string')remember(value,saveId);}
export function workspaceDelta(value,base,id=newSaveId()){
  const texts={},histories={},current=value.localHistory||{};
  const documents=value.documents.map(doc=>{const {text,...rest}=doc;if(base.texts.get(doc.id)!==text)texts[doc.id]=text;return rest;});
  for(const [docId,list] of Object.entries(current)){const old=base.histories.get(docId);if(!old||old.list!==list||old.length!==list?.length)histories[docId]=list;}
  for(const docId of base.histories.keys())if(!(docId in current))histories[docId]=null;
  const {localHistory,saveId,...rest}=value;
  return {format:2,id,base:base.saveId,workspace:{...rest,documents},texts,histories};
}
export const workspaceSaveStats={mode:'',bytes:0,milliseconds:0};
export function saveWorkspace(value) {
  const start=performance.now();
  if(native) {
    if(baseline&&typeof window.WenzhouNative.writeWorkspaceDelta==='function'&&baseline.storage===(value.storage?.id||'')){
      const delta=workspaceDelta(value,baseline),data=JSON.stringify(delta),result=window.WenzhouNative.writeWorkspaceDelta(data);
      if(result==='ok'){remember(value,delta.id);Object.assign(workspaceSaveStats,{mode:'delta',bytes:data.length,milliseconds:performance.now()-start});return;}
      if(!String(result).includes('E_DELTA_BASE'))throw new Error(result);
    }
    const saveId=newSaveId(),data=JSON.stringify({...value,saveId}),result=window.WenzhouNative.writeWorkspace(data); if(result!=='ok') throw new Error(result);
    remember(value,saveId);Object.assign(workspaceSaveStats,{mode:'full',bytes:data.length,milliseconds:performance.now()-start});
    return;
  }
  const data=JSON.stringify(value);
  try{localStorage.setItem('wenzhou.workspace',data);}catch(error){
    if(error.name!=='QuotaExceededError'||!value.localHistory||!Object.values(value.localHistory).some(list=>list.length))throw error;
    // Evict recoverable snapshots only; current documents must never be omitted.
    localStorage.setItem('wenzhou.workspace',JSON.stringify({...value,localHistory:{}}));value.localHistory={};
  }
}
export function readPluginStore(){return native?window.WenzhouNative.readPlugins():localStorage.getItem('wenzhou.plugins');}
export function writePluginStore(value){const data=JSON.stringify(value);if(native){const result=window.WenzhouNative.writePlugins(data);if(result!=='ok')throw new Error(result);}else localStorage.setItem('wenzhou.plugins',data);}
export function readEnvironment(){try{return native&&window.WenzhouNative.readEnvironment?JSON.parse(window.WenzhouNative.readEnvironment()):null;}catch{return null;}}
export async function exportText(name,text) {
  if(native) return transport('export',{name,text});
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  return true;
}
export async function openAuthorization() {
  if(native) return transport('openAuth',{});
  window.open('https://github.com/login/device','_blank','noopener,noreferrer');
}

export async function exportBinary(name,bytes,mime='application/vnd.oasis.opendocument.text'){
 if(native){let data='';for(let i=0;i<bytes.length;i+=16384)data+=String.fromCharCode(...bytes.subarray(i,i+16384));return transport('exportOdt',{name,data:btoa(data)});}
 const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);return true;
}
