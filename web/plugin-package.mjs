import {unzipSync,strFromU8} from 'fflate';
export const MAX_PLUGIN_BYTES=8*1024*1024;
export const MAX_TEX_PLUGIN_BYTES=64*1024*1024;
export function assetPath(path) {
  if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||/[\x00-\x1f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('插件包含无效资源路径。');
  return path;
}
export function toBase64(bytes) {let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function fromBase64(value) {return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function readPluginZip(bytes) {
  if(bytes.length>MAX_TEX_PLUGIN_BYTES)throw new Error('宏包插件安装包不能超过 64 MB。');
  let total=0,count=0;
  const extracted=unzipSync(bytes,{filter:file=>{if(file.name.endsWith('/'))return false;assetPath(file.name);total+=file.originalSize;count++;if(total>128*1024*1024||count>10000)throw new Error('插件解压后超过 128 MB 或 10000 个文件。');return true;}});
  if(!extracted['plugin.json']&&total>16*1024*1024)throw new Error('插件解压后超过 16 MB。');
  if(!extracted['plugin.json'])throw new Error('ZIP 根目录缺少 Acode plugin.json。');
  let manifest;try{manifest=JSON.parse(strFromU8(extracted['plugin.json']));}catch{throw new Error('plugin.json 格式不正确。');}
  if(!/^[a-z0-9][\w.-]{1,127}$/i.test(manifest.id||'')||typeof manifest.name!=='string'||typeof manifest.version!=='string')throw new Error('插件缺少有效的 id、name 或 version。');
  if(manifest.vela?.type==='tex-package')return {manifest,files:{'plugin.json':toBase64(extracted['plugin.json'])},texPending:extracted,enabled:true};
  if(bytes.length>MAX_PLUGIN_BYTES||total>16*1024*1024||count>512)throw new Error('JavaScript 插件限 8 MB，解压限 16 MB / 512 个文件。');
  assetPath(manifest.main);if(!/\.js$/i.test(manifest.main)||!extracted[manifest.main])throw new Error('插件 main 必须指向包内 JavaScript 文件。');
  return {manifest,files:Object.fromEntries(Object.entries(extracted).map(([name,data])=>[name,toBase64(data)])),enabled:true};
}
export function validatePluginStore(value) {
  if(!Array.isArray(value))throw new Error('插件存储格式不正确。');
  const ids=new Set();
  for(const item of value){if(!item?.manifest||ids.has(item.manifest.id)||typeof item.files!=='object'||(item.manifest.vela?.type==='tex-package'?!Array.isArray(item.texFiles):!item.files?.[item.manifest.main]))throw new Error('插件存储损坏。');ids.add(item.manifest.id);for(const path of Object.keys(item.files))assetPath(path);for(const file of item.texFiles||[])assetPath(file.path);}
  return value;
}
