import {readImportedArchive} from './imported-archive.mjs';
import {verifySignature,unsignedRelease} from './release-signing.mjs';
import {formatBytes,MB} from './text-utils.mjs';
// Release mirrors. Downloads try Gitee first (reachable in mainland China), then GitHub; tags and file names are identical.
export const releaseSources=Object.freeze([
  Object.freeze({id:'gitee',label:'Gitee',provider:'gitee',repository:'kingpennymore/wenzhou-vela-mirror-repository'}),
  Object.freeze({id:'github',label:'GitHub',provider:'github',repository:'KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager'})
]);
export const COMPONENT_LIMIT=96*MB;
const SAFE_NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/,SAFE_TAG=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function releaseUrl(source,tag,name){
  if(!SAFE_TAG.test(tag)||!SAFE_NAME.test(name))throw Error('发布文件名无效。');
  return `https://${source.id==='gitee'?'gitee.com':'github.com'}/${source.repository}/releases/download/${tag}/${name}`;
}
export async function sha256Hex(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export {formatBytes};
const cancelled=()=>Object.assign(Error('下载已取消。'),{code:'E_CANCELLED'});
let sequence=0;
/**
 * Native code fetches one URL into its private cache and hands back a same-origin URL (never a Base64 string).
 * Each source is tried in order; a network failure, size mismatch or wrong SHA-256 moves on to the next mirror.
 * Cancelling stops at once. Progress arrives as `wenzhouDownload` window events carrying the request id.
 */
export async function downloadAsset({transport,tag,name,bytes,sha256,limit=COMPONENT_LIMIT,sources=releaseSources,onProgress=()=>{},signal}){
  if(bytes!=null&&(!Number.isSafeInteger(bytes)||bytes<=0))throw Error('组件大小信息无效。');
  if(bytes>limit)throw Error(`组件大小 ${formatBytes(bytes)} 超过 ${formatBytes(limit)} 上限。`);
  if(!/^[0-9a-f]{64}$/.test(sha256))throw Error('组件校验信息无效。');
  const failures=[];
  for(const source of sources){
    if(signal?.aborted)throw cancelled();
    const id='dl'+Date.now().toString(36)+(++sequence),url=releaseUrl(source,tag,name);
    const listener=event=>{const detail=event.detail||{};if(detail.id===id)onProgress({source:source.label,received:Math.max(0,Number(detail.received)||0),total:bytes||Math.max(0,Number(detail.total)||0)});};
    const abort=()=>transport('cancelDownload',{id}).catch(()=>{});
    window.addEventListener('wenzhouDownload',listener);signal?.addEventListener('abort',abort);
    try{
      onProgress({source:source.label,received:0,total:bytes||0});
      const result=await transport('downloadComponent',{id,url,name,size:bytes||0,sha256,limit});
      if(signal?.aborted){if(result?.importToken)await transport('releaseImport',{token:result.importToken}).catch(()=>{});throw cancelled();}
      if(!result||(bytes?result.size!==bytes:!(result.size>0&&result.size<=limit))){if(result?.importToken)await transport('releaseImport',{token:result.importToken}).catch(()=>{});throw Error(bytes?`文件大小不符（应为 ${bytes} 字节）。`:'文件大小超出上限。');}
      const data=await readImportedArchive(result,token=>transport('releaseImport',{token}));
      if(data.length!==result.size)throw Error('下载内容不完整。');
      if(await sha256Hex(data)!==sha256)throw Object.assign(Error('ZIP 的 SHA-256 与内置清单不符。'),{code:'E_INTEGRITY'});
      onProgress({source:source.label,received:data.length,total:data.length,done:true});
      return {bytes:data,source:source.label};
    }catch(error){
      if(signal?.aborted||error.code==='E_CANCELLED')throw cancelled();
      failures.push(source.label+'：'+error.message);
    }finally{window.removeEventListener('wenzhouDownload',listener);signal?.removeEventListener('abort',abort);}
  }
  throw Object.assign(Error('下载失败。'+failures.join('；')),{failures});
}
/** The single TeX package comes from the build-time descriptor: fixed tag, file name, size and SHA-256. */
export function texDownloads(descriptor){
  const downloads=descriptor?.downloads,item=downloads?.package;
  if(!downloads||!SAFE_TAG.test(downloads.tag||'')||!SAFE_NAME.test(item?.name||'')||!Number.isSafeInteger(item.bytes)||!/^[0-9a-f]{64}$/.test(item.sha256||''))return [];
  return [{key:'tex',kind:'tex',id:'vela.component.tex',title:'LaTeX 排版组件',note:'XeLaTeX / pdfLaTeX 引擎、基础宏包、中文宏包与 Fandol 字体',version:descriptor.version,tag:downloads.tag,name:item.name,bytes:item.bytes,sha256:item.sha256}];
}
/** Parse a `SHA256SUMS-<tag>.txt` asset ("<hex>  <name>" per line). */
export function parseSums(text){const sums=new Map();for(const line of String(text).split(/\r?\n/)){const match=/^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());if(match)sums.set(match[2],match[1]);}return sums;}
const releasePath=(source,suffix)=>'/repos/'+source.repository+'/releases'+suffix;
const normalise=(source,release)=>({source:source.label,tag:release.tag_name,name:release.name||release.tag_name,notes:String(release.body||'').slice(0,20000),prerelease:!!release.prerelease,draft:!!release.draft,
  assets:(release.assets||[]).filter(asset=>SAFE_NAME.test(asset?.name||'')).map(asset=>({name:asset.name,bytes:Number.isSafeInteger(asset.size)&&asset.size>0?asset.size:null,sha256:/^sha256:[0-9a-f]{64}$/.test(asset.digest||'')?asset.digest.slice(7):null}))});
/**
 * Recent releases of one mirror, newest first. Listing (rather than `/latest`) matters because component tags
 * such as tex-0.1.1 share the repository with app tags.
 */
export async function listReleases(transport,source){
  const response=await transport('publicApi',{provider:source.provider,path:releasePath(source,source.id==='gitee'?'?page=1&per_page=20&direction=desc':'?per_page=20'),method:'GET'});
  if(response.status!==200||!Array.isArray(response.body))throw Error('HTTP '+response.status);
  return response.body.filter(release=>release&&SAFE_TAG.test(release.tag_name||'')&&!release.draft).map(release=>normalise(source,release));
}
/** First mirror that answers wins (Gitee, then GitHub); `pick` chooses a release from its list. */
export async function findRelease(transport,pick,{sources=releaseSources}={}){
  const failures=[];
  for(const source of sources){
    try{const releases=await listReleases(transport,source),release=pick(releases);if(release)return release;failures.push(source.label+'：没有匹配的发布');}
    catch(error){failures.push(source.label+'：'+error.message);}
  }
  throw Object.assign(Error('无法读取发布信息。'+failures.join('；')),{failures});
}
/**
 * The release's assets with only trustworthy SHA-256 values (docs/RELEASE-SIGNING.md): those listed in its signed
 * SHA256SUMS-<tag>.txt. Releases from before signing (unsignedRelease) may use an unsigned list or the API digests,
 * but only from GitHub, which computes the digests itself; the Gitee mirror's unsigned data is never trusted.
 * `signed` on the result says which case applied. A release that should be signed and is not throws E_SIGNATURE.
 */
export async function trustedAssets(transport,release,{sources=releaseSources,needed=null}={}){
  const legacy=unsignedRelease(release.tag),bare=release.tag.replace(/^v/,''),apiTrusted=legacy&&release.source==='GitHub';
  // An old release listed by GitHub already carries GitHub's own digests for what is needed: nothing to download.
  if(apiTrusted&&needed&&needed.every(name=>release.assets.find(asset=>asset.name===name)?.sha256))return release.assets.map(asset=>({...asset,signed:false}));
  const sums=release.assets.find(asset=>[`SHA256SUMS-${release.tag}.txt`,`SHA256SUMS-${bare}.txt`].includes(asset.name))?.name||`SHA256SUMS-${bare}.txt`;
  let table=null,signed=false;
  try{const list=await downloadSignedText(transport,release.tag,sums,{sources,allowUnsigned:legacy});table=parseSums(list.text);signed=list.signed;}
  catch(error){if(!legacy)throw error;}
  return release.assets.map(asset=>({...asset,sha256:table?.get(asset.name)||(apiTrusted?asset.sha256:null),signed}));
}
async function fetchText(transport,source,tag,name,limit){
  const id='dl'+Date.now().toString(36)+(++sequence),result=await transport('downloadComponent',{id,url:releaseUrl(source,tag,name),name,size:0,sha256:'',limit});
  const bytes=await readImportedArchive(result,token=>transport('releaseImport',{token}));return {bytes,text:new TextDecoder().decode(bytes)};
}
/**
 * A signed text asset (SHA256SUMS, catalog.json): the file and <file>.sig from the same mirror, tried in order until one
 * verifies. A bad signature is never accepted. With allowUnsigned, a file without .sig is accepted from GitHub only, and
 * only when no mirror has a valid signature; the result then has signed:false.
 */
export async function downloadSignedText(transport,tag,name,{sources=releaseSources,limit=64*1024,allowUnsigned=false}={}){
  const failures=[];let unsigned=null;
  for(const source of sources){
    let file,signature=null;
    try{file=await fetchText(transport,source,tag,name,limit);}catch(error){failures.push(source.label+'：'+error.message);continue;}
    try{signature=(await fetchText(transport,source,tag,name+'.sig',4096)).text;}catch{/* no .sig on this mirror */}
    if(signature===null){if(allowUnsigned&&source.id==='github'&&!unsigned)unsigned={...file,source:source.label,signed:false};failures.push(source.label+'：缺少签名');continue;}
    const check=await verifySignature(file.bytes,signature);
    if(check.valid)return {...file,source:source.label,signed:true,key:check.key};
    failures.push(source.label+'：'+check.reason);
  }
  if(unsigned)return unsigned;
  throw Object.assign(Error(`无法验证 ${name} 的签名，已拒绝使用。`+failures.join('；')),{code:'E_SIGNATURE',failures});
}
const COMPONENT_ASSET=/^Vela-((?:[A-Z][A-Za-z]*-)*[A-Z][A-Za-z]*)-(\d+\.\d+\.\d+)\.zip$/;
/** Optional executable components (e.g. the e-book reader) published with an app release. */
export function releaseComponents(release){
  return release.assets.map(asset=>{const match=COMPONENT_ASSET.exec(asset.name);if(!match||/^TeX-/.test(match[1]+'-'))return null;
    const slug=match[1].toLowerCase();return {key:'plugin.'+slug,kind:'plugin',id:'vela.component.'+slug,title:match[1].replace(/-/g,' '),note:'随 '+release.tag+' 发布的可选组件',version:match[2],tag:release.tag,name:asset.name,bytes:asset.bytes,sha256:asset.sha256};
  }).filter(Boolean);
}
