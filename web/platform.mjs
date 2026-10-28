export const native = typeof window !== 'undefined' && !!window.WenzhouNative;
import {gitIdentity, gitHostKey, gitApiBase, validateGitApiPath} from './git-host.mjs';
import {MB} from './text-utils.mjs';
const sessionTokens=new Map();
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
  const {provider}=gitIdentity(payload),key=gitHostKey(payload),origin=gitApiBase(payload),sessionToken=sessionTokens.get(key)||'';
  if(operation==='oauth') throw new Error('设备授权请在文舟应用中使用。浏览器预览可使用个人访问令牌登录。');
  if(operation==='connection') {
    const result=await fetch(origin+(provider==='gitea'?'/version':provider==='gitee'?'/emojis':''),{redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:{}};
  }
  if(operation==='logout') {sessionTokens.delete(key);return true;}
  if(operation==='login') {
    const token=payload.token?.trim();
    if(!token||token.length>4096||/\s/.test(token))throw new Error('访问令牌格式不正确。');
    const result=await fetch(origin+'/user',{headers:headers(token,provider),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!result.ok) throw new Error(result.status===401?'访问令牌无效或已过期（HTTP 401）。':result.status===403?'令牌验证受限（HTTP 403），请检查令牌授权、组织策略或请求速率限制。':`令牌验证失败（HTTP ${result.status}），请检查网络后重试。`);
    const user=await result.json();sessionTokens.set(key,token);
    return user;
  }
  if(operation==='api'||operation==='publicApi') {
    validateGitApiPath(payload.path);
    if(operation==='publicApi'&&(!/^\/repos\/[\w.-]+\/[\w.-]+(?:[/?]|$)/.test(payload.path)||/[\r\n\\#]/.test(payload.path)||payload.path.includes('..')||payload.method!=='GET'))throw new Error('不允许的 GitHub 请求路径。');
    if(!sessionToken&&operation!=='publicApi') return {status:401,body:{}};
    const result=await fetch(origin+payload.path,{method:payload.method,headers:sessionToken?headers(sessionToken,provider):{Accept:provider!=='github'?'application/json':'application/vnd.github+json'},body:payload.body ? JSON.stringify(payload.body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:result.status===204?null:await result.json()};
  }
  throw new Error('当前环境不支持此操作。');
}
function headers(token,provider='github') { if(provider!=='github')return {'Authorization':`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json'};return {'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}; }
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
let saveEpoch=0,saveWorker=null,workerSequence=0,browserSerial=Date.now(),browserBaseline=null;
const workerRequests=new Map();
function serializer(payload,mode,serial){
  if(!saveWorker){saveWorker=new Worker('./workspace-save-worker.js');saveWorker.onmessage=({data})=>{const task=workerRequests.get(data.id);if(!task)return;workerRequests.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error)):task.resolve(data);};saveWorker.onerror=()=>{saveWorker.terminate();saveWorker=null;for(const task of workerRequests.values()){clearTimeout(task.timer);task.reject(Error('后台保存线程异常，请手动保存。'));}workerRequests.clear();};}
  return new Promise((resolve,reject)=>{const id=++workerSequence,timer=setTimeout(()=>{workerRequests.delete(id);reject(Error('后台保存超时，请手动保存。'));},30000);workerRequests.set(id,{resolve,reject,timer});try{saveWorker.postMessage({id,payload,mode,serial});}catch(error){clearTimeout(timer);workerRequests.delete(id);reject(error);}});
}
export async function readWorkspaceAsync(){
  if(native)return readWorkspace();
  const sync=readWorkspace();
  try{return await new Promise(resolve=>{const request=indexedDB.open('wenzhou-autosave',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onerror=()=>resolve(sync);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readwrite'),table=tx.objectStore('workspace'),get=table.get('latest');get.onsuccess=()=>{const record=get.result,marker=Number(localStorage.getItem('wenzhou.workspace.syncSerial'))||0,data=record?.serial>marker?record.data:sync,serial=record?.serial>marker?record.serial:Math.max(marker,1);browserSerial=Math.max(browserSerial,serial);if(data&&(!record||record.serial<serial))table.put({serial,data},'latest');try{const value=JSON.parse(data);browserBaseline={serial,texts:new Map(value.documents.map(doc=>[doc.id,doc.text])),histories:new Map(Object.entries(value.localHistory||{}).map(([id,list])=>[id,{list,length:list?.length}]))};}catch{browserBaseline=null;}resolve(data);};get.onerror=()=>resolve(sync);tx.oncomplete=()=>db.close();};});}catch{return sync;}
}
function browserDelta(value,base,serial){
  const texts={},histories={},current=value.localHistory||{};
  const documents=value.documents.map(doc=>{const {text,...rest}=doc;if(base.texts.get(doc.id)!==text)texts[doc.id]=text;return rest;});
  for(const [docId,list] of Object.entries(current)){const old=base.histories.get(docId);if(!old||old.list!==list||old.length!==list?.length)histories[docId]=list;}
  for(const docId of base.histories.keys())if(!(docId in current))histories[docId]=null;
  const {localHistory,documents:_,...rest}=value;
  return {baseSerial:base.serial,serial,workspace:{...rest,documents},texts,histories};
}
function rememberBrowser(value,serial){browserBaseline={serial,texts:new Map(value.documents.map(doc=>[doc.id,doc.text])),histories:new Map(Object.entries(value.localHistory||{}).map(([id,list])=>[id,{list,length:list?.length}]))};}
export async function saveWorkspaceAsync(value){
  const epoch=++saveEpoch,start=performance.now(),serial=browserSerial=Math.max(Date.now(),browserSerial+1);
  // Capture strings/references before yielding. A later edit must never advance this save's baseline.
  const snapshot={...value,documents:value.documents.map(doc=>{const {text,...rest}=doc;return {...rest,text:doc.text};}),localHistory:{...value.localHistory}};
  let id=newSaveId(),mode=native&&baseline&&baseline.storage===(snapshot.storage?.id||'')&&typeof window.WenzhouNative.writeWorkspaceDelta==='function'?'delta':native?'full':browserBaseline?'browser-delta':'browser';
  let payload=mode==='delta'?workspaceDelta(snapshot,baseline,id):mode==='browser-delta'?browserDelta(snapshot,browserBaseline,serial):native?{...snapshot,saveId:id}:snapshot;
  let encoded;
  try{encoded=await serializer(payload,mode,serial);}catch(error){if(mode!=='browser-delta'||!String(error.message).includes('E_BROWSER_BASE'))throw error;mode='browser';payload=snapshot;encoded=await serializer(payload,mode,serial);}
  if(epoch!==saveEpoch)return false;
  if(native){
    const apply=async json=>{const raw=await window.WenzhouNative.call('saveWorkspace',json);const result=JSON.parse(raw);if(!result.ok)throw Object.assign(Error(result.error||'后台保存失败。'),{code:result.code});return result.value;};
    let result;try{result=await apply(encoded.json);}catch(error){if(epoch!==saveEpoch)return false;if(!String(error.message).includes('E_DELTA_BASE'))throw error;mode='full';id=newSaveId();encoded=await serializer({...snapshot,saveId:id},mode,serial);if(epoch!==saveEpoch)return false;result=await apply(encoded.json);}
    if(epoch!==saveEpoch||result?.superseded)return false;
    remember(snapshot,id);
  }
  if(mode==='browser')rememberBrowser(snapshot,serial);
  if(mode==='browser-delta')rememberBrowser(snapshot,serial);
  if(epoch!==saveEpoch)return false;
  Object.assign(workspaceSaveStats,{mode:'background-'+mode,bytes:encoded.bytes,milliseconds:performance.now()-start});return true;
}
export function saveWorkspace(value) {
  saveEpoch++;
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
  localStorage.setItem('wenzhou.workspace.syncSerial',String(browserSerial=Math.max(Date.now(),browserSerial+1)));
  if(!native)rememberBrowser(value,browserSerial);
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
 if(typeof name!=='string'||!name||name.length>160||/[\\/\x00-\x1f]/.test(name)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>32*MB)throw Error('导出文件名或二进制数据无效，文件限 32 MB。');
 if(native){let data='';for(let i=0;i<bytes.length;i+=16384)data+=String.fromCharCode(...bytes.subarray(i,i+16384));return transport(mime==='image/png'?'exportPng':mime==='application/pdf'?'exportPdf':mime==='application/vnd.oasis.opendocument.text'||mime==='application/epub+zip'?'exportOdt':'exportBinary',{name,data:btoa(data),mime});}
 const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);return true;
}
