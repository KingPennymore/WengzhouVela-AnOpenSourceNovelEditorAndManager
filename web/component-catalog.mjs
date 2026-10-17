// The component catalog: one `catalog.json` published as the asset of the fixed release tag `catalog` on GitHub and
// mirrored to Gitee. It lists the newest version of every downloadable component, so a component (or a new TeX
// version) published later shows up in apps that are already installed, without a new app release.
import {compareVersions} from './updates.mjs';
import {downloadSignedText,releaseSources} from './component-downloads.mjs';

export const CATALOG_TAG='catalog',CATALOG_NAME='catalog.json',CATALOG_LIMIT=256*1024;
const ID=/^vela\.component\.[a-z0-9][a-z0-9.-]{0,63}$/,NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/,TAG=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,VERSION=/^\d+\.\d+\.\d+$/;
const PLATFORMS=['android','harmonyos','windows'];
const text=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;

/**
 * Validates catalog text and returns its components as download items. Entries that are malformed are skipped (and
 * counted), so one bad entry never hides the others; a file that is not a catalog at all is refused.
 */
export function parseCatalog(source){
  if(typeof source!=='string'||source.length>CATALOG_LIMIT)throw Error('组件目录超过 256 KB。');
  let raw;try{raw=JSON.parse(source);}catch{throw Error('组件目录不是有效的 JSON。');}
  if(raw?.format!==1||!Array.isArray(raw.components))throw Error('组件目录格式不受支持。');
  const items=[],seen=new Set();let skipped=0;
  for(const entry of raw.components.slice(0,200)){
    const valid=entry&&ID.test(entry.id)&&!seen.has(entry.id)&&['tex','plugin'].includes(entry.kind)&&text(entry.title,80)&&VERSION.test(entry.version)&&TAG.test(entry.tag)&&NAME.test(entry.name)&&/\.zip$/i.test(entry.name)
      &&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&/^[0-9a-f]{64}$/.test(entry.sha256)&&(entry.minApp===undefined||VERSION.test(entry.minApp))&&(entry.note===undefined||typeof entry.note==='string'&&entry.note.length<=200)
      &&(entry.platforms===undefined||Array.isArray(entry.platforms)&&entry.platforms.every(platform=>PLATFORMS.includes(platform)));
    if(!valid){skipped++;continue;}
    seen.add(entry.id);
    items.push({key:entry.kind==='tex'?'tex':'plugin.'+entry.id.slice('vela.component.'.length),kind:entry.kind,id:entry.id,title:entry.title,note:entry.note||'',version:entry.version,tag:entry.tag,name:entry.name,bytes:entry.bytes,sha256:entry.sha256,minApp:entry.minApp||null,platforms:entry.platforms||null});
  }
  return {updated:typeof raw.updated==='string'?raw.updated:'',items,skipped};
}
/** Why an item cannot be installed here ('' when it can): the app is too old, or the platform is not supported. */
export function catalogBlocker(item,{appVersion='',platform=''}={}){
  if(item.platforms&&platform&&!item.platforms.includes(platform))return '此平台不可用';
  if(item.minApp&&appVersion&&compareVersions(item.minApp,appVersion)>0)return '需要文舟 '+item.minApp+' 或更新版本';
  return '';
}
/** Install state of an item against the installed version (if any): new, update, current, or newer than offered. */
export function catalogStatus(item,installedVersion){
  if(!installedVersion)return 'missing';const order=compareVersions(item.version,installedVersion);
  return order>0?'update':order<0?'newer':'current';
}
/** Builds catalog text (used by scripts/build-catalog.mjs): newest version per ID, sorted by ID. */
export function catalogText(components,{updated=new Date().toISOString()}={}){
  const latest=new Map();for(const item of components){const old=latest.get(item.id);if(!old||compareVersions(item.version,old.version)>0)latest.set(item.id,item);}
  const fields=['id','kind','title','note','version','tag','name','bytes','sha256','minApp','platforms'];
  const list=[...latest.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(item=>Object.fromEntries(fields.filter(key=>item[key]!==undefined&&item[key]!==null&&item[key]!=='').map(key=>[key,item[key]])));
  const result=JSON.stringify({format:1,updated,components:list},null,2)+'\n';parseCatalog(result);return result;
}
/**
 * Reads the catalog from the first mirror with a valid catalog.json.sig (Gitee, then GitHub). Until this device has
 * seen a signed catalog it also accepts the unsigned catalog published before signing, from GitHub only; afterwards
 * an unsigned catalog is refused, so a mirror cannot fall back to it.
 */
const SIGNED_SEEN='vela.catalog.signed';
const seenSigned=()=>{try{return localStorage.getItem(SIGNED_SEEN)==='1';}catch{return false;}};
export async function loadCatalog(transport,{sources=releaseSources}={}){
  const {text,source,signed}=await downloadSignedText(transport,CATALOG_TAG,CATALOG_NAME,{sources,limit:CATALOG_LIMIT,allowUnsigned:!seenSigned()});
  const catalog=parseCatalog(text);
  if(signed)try{localStorage.setItem(SIGNED_SEEN,'1');}catch{}
  return {...catalog,source,signed};
}
