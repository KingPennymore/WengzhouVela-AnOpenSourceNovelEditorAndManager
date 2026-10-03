export const native = typeof window !== 'undefined' && !!window.WenzhouNative;
let sessionToken = '';
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
  if(operation==='oauth') throw new Error('设备授权请在文舟应用中使用。浏览器预览可使用个人访问令牌登录。');
  if(operation==='connection') {
    const result=await fetch('https://api.github.com',{redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:{}};
  }
  if(operation==='logout') {sessionToken='';return true;}
  if(operation==='login') {
    const token=payload.token.trim();
    const result=await fetch('https://api.github.com/user',{headers:headers(token)});
    if(!result.ok) throw new Error('令牌验证失败，请检查令牌和网络。');
    sessionToken=token;
    return result.json();
  }
  if(operation==='api'||operation==='publicApi') {
    if(operation==='publicApi'&&(!/^\/repos\/[\w.-]+\/[\w.-]+(?:[/?]|$)/.test(payload.path)||/[\r\n\\#]/.test(payload.path)||payload.path.includes('..')||payload.method!=='GET'))throw new Error('不允许的 GitHub 请求路径。');
    if(!sessionToken&&operation!=='publicApi') return {status:401,body:{}};
    const result=await fetch('https://api.github.com'+payload.path,{method:payload.method,headers:sessionToken?headers(sessionToken):{Accept:"application/vnd.github+json"},body:payload.body ? JSON.stringify(payload.body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
    return {status:result.status,body:result.status===204?null:await result.json()};
  }
  throw new Error('当前环境不支持此操作。');
}
function headers(token) { return {'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}; }
export function readWorkspace() { return native ? window.WenzhouNative.readWorkspace() : localStorage.getItem('wenzhou.workspace'); }
export function saveWorkspace(value) {
  const data=JSON.stringify(value);
  if(native) { const result=window.WenzhouNative.writeWorkspace(data); if(result!=='ok') throw new Error(result); }
  else try{localStorage.setItem('wenzhou.workspace',data);}catch(error){
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
