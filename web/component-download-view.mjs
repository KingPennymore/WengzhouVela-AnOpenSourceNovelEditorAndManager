import {downloadAsset,texDownloads,findRelease,trustedAssets,releaseComponents,formatBytes,COMPONENT_LIMIT} from './component-downloads.mjs';
import {compareVersions} from './updates.mjs';
import {loadCatalog,catalogBlocker,catalogStatus} from './component-catalog.mjs';

// Downloads outlive the dialog: closing or re-rendering the plugin list keeps them running, and reopening shows progress.
const jobs=new Map();
let discovery=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APP_TAG=/^v?\d+\.\d+\.\d+(?:\.\d+)?$/;

/**
 * Downloadable components: the component catalog (release tag `catalog`), or, while no catalog can be read, the
 * components attached to the newest stable app release. Gitee first, then GitHub; cached for ten minutes.
 */
function discover(transport,{force=false}={}){
  if(discovery&&!force&&Date.now()-discovery.at<600000)return discovery.promise;
  const promise=loadCatalog(transport).then(catalog=>({source:catalog.source,catalog:true,signed:catalog.signed,updated:catalog.updated,skipped:catalog.skipped,components:catalog.items})).catch(()=>findRelease(transport,releases=>releases.filter(release=>APP_TAG.test(release.tag)&&!release.prerelease&&releaseComponents(release).length).sort((a,b)=>compareVersions(b.tag,a.tag))[0])
    .then(async release=>{const assets=await trustedAssets(transport,release,{needed:releaseComponents(release).map(item=>item.name)});return {source:release.source,catalog:false,signed:assets[0]?.signed??null,release:release.tag,components:releaseComponents({...release,assets}).filter(item=>item.sha256)};}));
  discovery={at:Date.now(),promise};promise.catch(()=>{if(discovery?.promise===promise)discovery.at=0;});
  return promise;
}

/**
 * Renders the "在线组件" section of the plugin manager into `container`.
 * host: {transport, native, platform, appVersion, descriptor(), installed() -> Map(id -> {version, enabled}), install(bytes, item)}
 */
export function mountComponentDownloads(container,host){
  let remote={state:'loading',items:[],error:'',info:null};
  const mobile=['android','harmonyos'].includes(host.platform);
  // TeX: full builds ship it; otherwise the catalog's version when it is at least the one this build knows.
  const items=async()=>{
    const descriptor=await host.descriptor().catch(()=>null),plugins=remote.items.filter(item=>item.kind!=='tex');if(!descriptor||descriptor.builtin)return plugins;
    const known=texDownloads(descriptor),listed=remote.items.find(item=>item.kind==='tex');
    return [...(listed&&(!known.length||compareVersions(listed.version,known[0].version)>=0)?[listed]:known),...plugins];
  };
  const status=(item,installed)=>{
    const blocker=catalogBlocker(item,{appVersion:host.appVersion,platform:host.platform});if(blocker)return {label:blocker,action:'',blocked:true};
    const current=installed.get(item.id),state=catalogStatus(item,current?.version);
    if(state==='missing')return {label:'未安装',action:'下载并安装'};
    if(state==='update')return {label:'已安装 '+current.version+'，可更新到 '+item.version,action:'更新',update:true};
    return {label:state==='newer'?'已安装 '+current.version+'（比在线版本新）':'已安装最新版',action:''};
  };
  const card=(item,installed)=>{
    const job=jobs.get(item.key),state=status(item,installed),size=item.bytes?formatBytes(item.bytes):'大小未知';
    let body='';
    if(job?.state==='running'){const percent=job.total?Math.min(100,Math.floor(job.received/job.total*100)):0;body=`<progress max="100" value="${percent}" aria-label="下载进度"></progress><small class="download-progress">${esc(job.source||'')} · ${formatBytes(job.received)} / ${job.total?formatBytes(job.total):'?'}${job.installing?' · 正在校验并安装…':''}</small><div class="button-row"><button type="button" class="secondary" data-download-cancel="${esc(item.key)}" ${job.installing?'disabled':''}>取消</button></div>`;}
    else{
      if(job?.state==='error')body+=`<p class="error" role="alert">${esc(job.error)}</p>`;
      if(job?.state==='cancelled')body+='<p class="blank">下载已取消。</p>';
      if(host.native&&!state.blocked&&(state.action||job?.state==='error'))body+=`<div class="button-row"><button type="button" class="${job?.state==='error'?'secondary':'primary'}" data-download-start="${esc(item.key)}">${job?.state==='error'?'重试':state.action||'重新下载'}</button></div>`;
    }
    return `<article class="plugin-card download-card${state.update?' download-update':''}" data-download-card="${esc(item.key)}"><strong>${esc(item.title)}</strong><small>${esc(item.id)} · ${esc(item.version)} · ${esc(size)} · ${esc(state.label)}</small>${item.note?`<small>${esc(item.note)}</small>`:''}${body}</article>`;
  };
  const render=async()=>{
    if(!container.isConnected)return;
    const list=await items(),installed=await host.installed();
    const intro=host.native?`<small>来源：Gitee 镜像优先，失败时改用 GitHub。下载后先核对整个 ZIP 的 SHA-256，再按文件校验安装；单个组件不超过 ${formatBytes(COMPONENT_LIMIT)}。</small>${mobile?'<small class="download-hint">组件较大，建议在 Wi‑Fi 下下载。</small>':''}`
      :'<p class="blank" data-download-unavailable>浏览器预览版不能直接下载组件。请在文舟应用中使用此功能，或从 GitHub / Gitee 发布页下载 ZIP 后点击“从 ZIP 安装”。</p>';
    const info=remote.info,when=info?.updated&&!Number.isNaN(Date.parse(info.updated))?new Date(info.updated).toLocaleDateString('zh-CN'):'';
    const trust=info?.signed===true?' · 签名已验证':info?.signed===false?' · 发布签名前的旧清单，仅接受 GitHub':'';
    const origin=!info?'':(info.catalog?`组件目录 · ${esc(info.source)}${when?' · 更新于 '+esc(when):''}${info.skipped?` · ${info.skipped} 项格式无效已跳过`:''}`:`暂时读不到组件目录，显示 ${esc(info.release)} 附带的组件 · ${esc(info.source)}`)+trust;
    const updates=list.filter(item=>status(item,installed).update).length;
    const discoveryNote=remote.state==='loading'?'<small class="blank">正在从 Gitee / GitHub 获取组件目录…</small>':remote.state==='error'?`<p class="error">${esc(remote.error)}</p>`:'';
    const head=`<div class="download-head"><h3>在线组件${updates?` <span class="download-badge">${updates} 个可更新</span>`:''}</h3>${host.native?`<button type="button" class="secondary" data-download-refresh ${remote.state==='loading'?'disabled':''}>检查更新</button>`:''}</div>${origin?`<small class="download-origin">${origin}</small>`:''}`;
    container.innerHTML=`${head}${intro}${list.map(item=>card(item,installed)).join('')||(remote.state==='ready'?'<p class="blank">没有可下载的组件。</p>':'')}${discoveryNote}`;
  };
  const update=key=>{const job=jobs.get(key),node=container.querySelector(`[data-download-card="${CSS.escape(key)}"]`);if(!job||!node)return void render();const bar=node.querySelector('progress'),text=node.querySelector('.download-progress');if(!bar||!text||job.state!=='running')return void render();bar.value=job.total?Math.min(100,Math.floor(job.received/job.total*100)):0;text.textContent=`${job.source||''} · ${formatBytes(job.received)} / ${job.total?formatBytes(job.total):'?'}${job.installing?' · 正在校验并安装…':''}`;};
  const start=async item=>{
    if(jobs.get(item.key)?.state==='running')return;
    const controller=new AbortController(),job={state:'running',received:0,total:item.bytes||0,source:'',controller,listeners:new Set()};jobs.set(item.key,job);
    const notify=()=>{for(const listener of job.listeners)listener();};job.listeners.add(()=>update(item.key));render();
    try{
      const {bytes}=await downloadAsset({transport:host.transport,tag:item.tag,name:item.name,bytes:item.bytes,sha256:item.sha256,signal:controller.signal,onProgress:progress=>{Object.assign(job,{received:progress.received,total:progress.total||job.total,source:progress.source});notify();}});
      job.installing=true;notify();
      await host.install(bytes,item);
      jobs.delete(item.key);
    }catch(error){Object.assign(job,error.code==='E_CANCELLED'?{state:'cancelled'}:{state:'error',error:error.message||'下载失败。'});}
    finally{job.installing=false;notify();}
  };
  container.onclick=async event=>{
    const begin=event.target.closest('[data-download-start]'),cancel=event.target.closest('[data-download-cancel]'),refresh=event.target.closest('[data-download-refresh]');
    if(cancel){jobs.get(cancel.dataset.downloadCancel)?.controller.abort();cancel.disabled=true;return;}
    if(refresh){remote={...remote,state:'loading',error:''};render();load(true);return;}
    if(begin){const item=(await items()).find(entry=>entry.key===begin.dataset.downloadStart);if(item)start(item);}
  };
  // Re-attach to downloads that were started before the dialog was (re)opened.
  for(const [key,job] of jobs)if(job.state==='running')job.listeners.add(()=>update(key));
  const load=force=>discover(host.transport,{force}).then(result=>{remote={state:'ready',items:result.components,error:'',info:result};},error=>{remote={state:'error',items:[],error:'无法获取组件目录：'+error.message,info:null};}).then(render);
  if(host.native)load(false);else remote={state:'ready',items:[],error:'',info:null};
  render();
  return {render};
}
export const _jobs=jobs;
