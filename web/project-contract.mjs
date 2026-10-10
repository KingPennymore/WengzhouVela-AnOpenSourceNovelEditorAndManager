/** API v3 wire values. All paths are project-relative, never platform URIs. */
export class VelaError extends Error {
  constructor(code,message,details={},retryable=false){super(message);this.name='VelaError';Object.assign(this,{code,details,retryable});}
}
export const error=(code,message,details,retryable)=>new VelaError(code,message,details,retryable);
export function relativePath(value,empty=false){
  if(value===''&&empty)return value;
  if(typeof value!=='string'||!value||value.length>4096||value.includes('\\')||/[\x00-\x1f:*?"<>|]/.test(value))throw error('E_INVALID_PATH','请使用有效的项目相对路径。');
  const parts=value.split('/');
  if(parts.length>64||parts.some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)||/\.(?:vela|wenzhou)-tmp$/.test(p)))throw error('E_INVALID_PATH','路径越界或包含不可用的名称。');
  return value.normalize('NFC');
}
export const within=(root,path)=>!root||path===root||path.startsWith(root+'/');
export const parentPath=path=>path.split('/').slice(0,-1).join('/');
const types={epub:'application/epub+zip',fb2:'application/x-fictionbook+xml',mobi:'application/x-mobipocket-ebook',azw:'application/vnd.amazon.ebook',azw3:'application/vnd.amazon.ebook',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',json:'application/json',csv:'text/csv',tsv:'text/tab-separated-values',mp4:'video/mp4',webm:'video/webm',ogg:'audio/ogg',oga:'audio/ogg',ogv:'video/ogg',mp3:'audio/mpeg',wav:'audio/wav',pdf:'application/pdf',zip:'application/zip',html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',wasm:'application/wasm',txt:'text/plain',md:'text/markdown',vela:'application/json',gly:'application/json',glossary:'application/json'};
export const mime=path=>types[path.split('.').at(-1).toLowerCase()]||'application/octet-stream';
export const textEditable=path=>!/^image\/(?!svg)|^(video|audio|font)\/|^application\/(pdf|zip|wasm|octet-stream|epub\+zip|x-fictionbook\+xml|x-mobipocket-ebook|vnd\.amazon\.ebook)$/.test(mime(path))||/\.(tex|bib|js|ts|py|yaml|yml|toml|xml|csv|json|html|css|sql|ini|sh|c|cpp|h|java|rs|go|lua)$/i.test(path);
export const bytes=value=>new TextEncoder().encode(value);
export async function sha256(value){const input=typeof value==='string'?bytes(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',input))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const revision=async value=>'r:'+await sha256(value);
export function checkAbort(signal){if(signal?.aborted)throw error('E_CANCELLED','操作已取消。');}
export function positive(value,name,max,{zero=false}={}){if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>max)throw error('E_LIMIT',name+'超过限制或无效。',{limit:max,actual:value});return value;}
export function jsonObject(value,max=262144){
  let serialized;try{serialized=JSON.stringify(value);}catch{throw error('E_INVALID_DATA','配置必须是可序列化的 JSON 对象。');}
  if(!value||Array.isArray(value)||typeof value!=='object'||!serialized||bytes(serialized).length>max)throw error('E_INVALID_DATA','JSON 对象格式或大小无效。');
  const walk=(obj,depth=0)=>{if(depth>64)throw error('E_LIMIT','JSON 嵌套超过 64 层。');for(const [key,v] of Object.entries(obj)){if(['__proto__','prototype','constructor'].includes(key))throw error('E_INVALID_DATA','JSON 包含不可用字段。');if(/(?:private.?key|access.?token|password|secret|credential)/i.test(key))throw error('E_INVALID_DATA','配置扩展不可存放密码或凭据。');if(typeof v==='function'||typeof v==='undefined'||typeof v==='symbol'||typeof v==='number'&&!Number.isFinite(v))throw error('E_INVALID_DATA','配置含有非 JSON 值。');if(v&&typeof v==='object')walk(v,depth+1);}};walk(value);return JSON.parse(serialized);
}
