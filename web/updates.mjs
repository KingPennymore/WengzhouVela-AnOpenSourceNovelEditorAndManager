import {releaseSources,findRelease,completeAssets,releaseUrl,releaseComponents,formatBytes} from './component-downloads.mjs';
export const updateRepository=releaseSources.find(source=>source.id==='github').repository;
export const UPDATE_LIMIT=256*1024*1024;
const APP_TAG=/^v?\d+\.\d+\.\d+(?:\.\d+)?$/;
export function compareVersions(left,right){const parts=value=>String(value).replace(/^v/,'').split(/[.-]/).filter(part=>/^\d+$/.test(part)).slice(0,4).map(Number),a=parts(left),b=parts(right);for(let i=0;i<Math.max(a.length,b.length);i++)if((a[i]||0)!==(b[i]||0))return Math.sign((a[i]||0)-(b[i]||0));return 0;}
export const releasePage=(sourceLabel,tag)=>sourceLabel==='Gitee'?`https://gitee.com/${releaseSources[0].repository}/releases/tag/${tag}`:`https://github.com/${updateRepository}/releases/tag/${tag}`;
/** The installer this platform can apply in place. HarmonyOS apps cannot be side-loaded, so it only gets the release page. */
export function installerFor(platform,assets,{lite=true}={}){
  const pattern=platform==='windows'?/^Vela-\d+\.\d+\.\d+(?:\.\d+)?-windows(-lite)?-setup-x64\.exe$/:platform==='android'?/^Vela-\d+\.\d+\.\d+(?:\.\d+)?-android\.\d+(-lite)?-release-signed\.apk$/:null;
  if(!pattern)return null;
  const matches=assets.filter(asset=>pattern.test(asset.name));
  return matches.find(asset=>!!pattern.exec(asset.name)[1]===lite)||matches[0]||null;
}
/** Newest stable app release (Gitee mirror first, then GitHub), its installer for this platform and newer optional components. */
export async function checkUpdates(transport,current,{platform='',lite=true,installed=new Map(),sources=releaseSources}={}){
  const release=await findRelease(transport,releases=>releases.filter(item=>APP_TAG.test(item.tag)&&!item.prerelease).sort((a,b)=>compareVersions(b.tag,a.tag))[0],{sources});
  const available=compareVersions(release.tag,current)>0;
  let assets=release.assets,installer=available?installerFor(platform,assets,{lite}):null;
  const components=releaseComponents(release).filter(item=>installed.has(item.id)&&compareVersions(item.version,installed.get(item.id))>0);
  if(installer&&!installer.sha256||components.some(item=>!item.sha256)){assets=await completeAssets(transport,release,{sources});installer=installer&&assets.find(asset=>asset.name===installer.name);}
  const verified=item=>({...item,sha256:item.sha256||assets.find(asset=>asset.name===item.name)?.sha256||null});
  return {available,version:release.tag,source:release.source,url:releasePage(release.source,release.tag),notes:release.notes,checkedAt:Date.now(),
    installer:installer?.sha256&&installer.bytes!==0?installer:null,components:components.map(verified).filter(item=>item.sha256)};
}
let sequence=0;
/** Native code downloads and checks the installer itself (too large for the page); the page only gets an opaque token. */
export async function downloadInstaller({transport,tag,installer,sources=releaseSources,onProgress=()=>{},signal}){
  if(installer.bytes&&installer.bytes>UPDATE_LIMIT)throw Error('安装包超过 '+formatBytes(UPDATE_LIMIT)+' 上限。');
  const failures=[];
  for(const source of sources){
    if(signal?.aborted)throw Object.assign(Error('下载已取消。'),{code:'E_CANCELLED'});
    const id='up'+Date.now().toString(36)+(++sequence);
    const listener=event=>{const detail=event.detail||{};if(detail.id===id)onProgress({source:source.label,received:Number(detail.received)||0,total:installer.bytes||Number(detail.total)||0});};
    const abort=()=>transport('cancelDownload',{id}).catch(()=>{});
    window.addEventListener('wenzhouDownload',listener);signal?.addEventListener('abort',abort);
    try{onProgress({source:source.label,received:0,total:installer.bytes||0});return {...await transport('downloadUpdate',{id,url:releaseUrl(source,tag,installer.name),name:installer.name,size:installer.bytes||0,sha256:installer.sha256}),source:source.label};}
    catch(error){if(signal?.aborted||error.code==='E_CANCELLED')throw Object.assign(Error('下载已取消。'),{code:'E_CANCELLED'});failures.push(source.label+'：'+error.message);}
    finally{window.removeEventListener('wenzhouDownload',listener);signal?.removeEventListener('abort',abort);}
  }
  throw Error('安装包下载失败。'+failures.join('；'));
}
