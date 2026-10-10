import {unzipSync,strFromU8} from 'fflate';
export const MAX_PLUGIN_BYTES=8*1024*1024;
export const MAX_TEX_PLUGIN_BYTES=64*1024*1024;
export function assetPath(path) {
  if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||/[\x00-\x1f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('插件包含无效资源路径。');
  return path;
}
export function toBase64(bytes) {let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function fromBase64(value) {return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function validateApiRequirement(manifest){
  const requirement=manifest.vela;if(!requirement)return;if(typeof requirement!=='object'||Array.isArray(requirement))throw new Error('vela 必须是配置对象。');
  if(requirement.api!==undefined&&(typeof requirement.api!=='string'||!requirement.api.trim()||!requirement.api.trim().split(/\s+/).every(part=>/^(?:>=|<=|>|<|=|\^|~)?\d+(?:\.\d+){0,2}$/.test(part))))throw new Error('vela.api 必须是有效的版本范围，例如 >=3 <4。');
  if(requirement.requiredCapabilities!==undefined&&(!Array.isArray(requirement.requiredCapabilities)||requirement.requiredCapabilities.length>64||requirement.requiredCapabilities.some(name=>typeof name!=='string'||!/^[-a-z0-9]{1,80}$/.test(name))||new Set(requirement.requiredCapabilities).size!==requirement.requiredCapabilities.length))throw new Error('requiredCapabilities 必须是无重复的能力名称数组。');
}
export function checkPluginCompatibility(manifest,version,capabilities){validateApiRequirement(manifest);const actual=String(version).split('.').map(Number);while(actual.length<3)actual.push(0);const compare=(a,b)=>{for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1;}return 0;};
  for(const part of manifest.vela?.api?.trim().split(/\s+/)||[]){const match=/^(>=|<=|>|<|=|\^|~)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(part),operator=match[1]||'=',wanted=[Number(match[2]),Number(match[3]||0),Number(match[4]||0)],order=compare(actual,wanted);let accepted=operator==='>='?order>=0:operator==='<='?order<=0:operator==='>'?order>0:operator==='<'?order<0:order===0;if(operator==='^'||operator==='~'){const upper=operator==='~'&&match[3]!==undefined?[wanted[0],wanted[1]+1,0]:operator==='^'&&wanted[0]===0&&match[3]!==undefined?(wanted[1]?[0,wanted[1]+1,0]:[0,0,wanted[2]+1]):[wanted[0]+1,0,0];accepted=order>=0&&compare(actual,upper)<0;}if(!accepted)throw Object.assign(new Error('插件需要 Vela API '+manifest.vela.api+'，当前为 '+version+'。请更新宿主或使用兼容插件。'),{code:'E_UNSUPPORTED'});}
  const missing=(manifest.vela?.requiredCapabilities||[]).filter(name=>!capabilities.includes(name));if(missing.length)throw Object.assign(new Error('当前平台缺少插件所需能力：'+missing.join('、')+'。插件入口未执行。'),{code:'E_UNSUPPORTED',details:{missing}});
}
export function readPluginZip(bytes) {
  if(bytes.length>MAX_TEX_PLUGIN_BYTES)throw new Error('宏包插件安装包不能超过 64 MB。');
  let total=0,count=0;
  const extracted=unzipSync(bytes,{filter:file=>{if(file.name.endsWith('/'))return false;assetPath(file.name);total+=file.originalSize;count++;if(total>128*1024*1024||count>10000)throw new Error('插件解压后超过 128 MB 或 10000 个文件。');return true;}});
  if(!extracted['plugin.json']&&total>16*1024*1024)throw new Error('插件解压后超过 16 MB。');
  if(!extracted['plugin.json'])throw new Error('ZIP 根目录缺少 Acode plugin.json。');
  let manifest;try{manifest=JSON.parse(strFromU8(extracted['plugin.json']));}catch{throw new Error('plugin.json 格式不正确。');}
  if(!/^[a-z0-9][\w.-]{1,127}$/i.test(manifest.id||'')||typeof manifest.name!=='string'||typeof manifest.version!=='string')throw new Error('插件缺少有效的 id、name 或 version。');
  if(manifest.id.startsWith('vela.component.tex.')||manifest.vela?.type==='tex-component')throw new Error('此组件 ID 或类型由宿主保留；排版资源请使用匹配的固定组件包。');
  validateApiRequirement(manifest);
  if(manifest.vela?.type==='tex-package')return {manifest,files:{'plugin.json':toBase64(extracted['plugin.json'])},texPending:extracted,enabled:true};
  if(bytes.length>MAX_PLUGIN_BYTES||total>16*1024*1024||count>512)throw new Error('JavaScript 插件限 8 MB，解压限 16 MB / 512 个文件。');
  assetPath(manifest.main);if(!/\.js$/i.test(manifest.main)||!extracted[manifest.main])throw new Error('插件 main 必须指向包内 JavaScript 文件。');
  return {manifest,files:Object.fromEntries(Object.entries(extracted).map(([name,data])=>[name,toBase64(data)])),enabled:true};
}
export function validatePluginStore(value) {
  if(!Array.isArray(value))throw new Error('插件存储格式不正确。');
  const ids=new Set();
  for(const item of value){if(!item?.manifest||ids.has(item.manifest.id)||typeof item.files!=='object'||(item.manifest.vela?.type==='tex-package'?!Array.isArray(item.texFiles):!item.files?.[item.manifest.main]))throw new Error('插件存储损坏。');validateApiRequirement(item.manifest);ids.add(item.manifest.id);for(const path of Object.keys(item.files))assetPath(path);for(const file of item.texFiles||[])assetPath(file.path);}
  return value;
}
