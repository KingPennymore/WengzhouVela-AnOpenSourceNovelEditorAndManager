import {checkUpdates,downloadInstaller} from './updates.mjs';
import {formatBytes} from './component-downloads.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pending=null;

/**
 * Checks Gitee, then GitHub, for a newer stable release. Windows and Android download the installer natively,
 * verify its SHA-256 and hand it to the system installer; HarmonyOS (no side-loading) and the browser open the release page.
 * host: {openModal, transport, native, platform, current, lite, installed: Map, openPlugins, toast, remember(result)}
 */
export async function checkAppUpdates(host,{visible=false}={}){
  const body=()=>document.querySelector('#dialog-body'),error=message=>{const node=document.querySelector('#dialog-error');if(node)node.textContent=message;};
  let display=visible;
  if(display)host.openModal('检查更新','<p>正在从 Gitee / GitHub 检查新版本…</p>',null,{noSubmit:true});
  let result;
  try{result=await checkUpdates(host.transport,host.current,{platform:host.platform,lite:host.lite,installed:host.installed});host.remember?.(result);}
  catch(failure){if(visible)error(failure.message);return null;}
  if(!display){
    if(result.available&&!host.dialogOpen?.()){
      display=true;
      host.openModal('发现新版本','<p>正在整理更新信息…</p>',null,{noSubmit:true});
    }else{if(result.available)host.toast('发现新版本 '+result.version+'，可在“更多 → 检查更新”中查看。');else if(result.components.length)host.toast('有 '+result.components.length+' 个组件可更新。');return result;}
  }
  const installable=host.native&&!!result.installer,mobile=['android','harmonyos'].includes(host.platform);
  const components=result.components.length?`<h3>组件更新</h3><ul class="update-components">${result.components.map(item=>`<li>${esc(item.title)}：${esc(host.installed.get(item.id))} → ${esc(item.version)}</li>`).join('')}</ul><div class="button-row"><button type="button" class="secondary" id="update-components">在插件与组件中更新</button></div>`:'';
  const node=body();if(!node)return result;
  node.innerHTML=result.available
    ?`<p>新版本 <strong>${esc(result.version)}</strong>（当前 ${esc(host.current)}，来源 ${esc(result.source)}）${result.signed===true?'<br><small>发布清单签名已验证。</small>':result.signed===false?'<br><small>签名机制启用前的旧版发布，校验值只采信 GitHub。</small>':''}</p><pre class="history-diff">${esc(result.notes)}</pre>
      ${installable?`<p><small>安装包 ${esc(result.installer.name)} · ${esc(result.installer.bytes?formatBytes(result.installer.bytes):'大小未知')}。下载后先核对 SHA-256，再交给系统安装程序${host.platform==='android'?'；安卓会检查签名与当前应用一致':''}。</small></p>${mobile?'<p><small class="download-hint">安装包较大，建议在 Wi‑Fi 下下载。</small></p>':''}<div id="update-progress"></div>`
        :`<p><small>${host.platform==='harmonyos'?'鸿蒙版不能在应用内安装，请在发布页或应用市场获取新版本。':host.native?'未找到适用于此设备的安装包，请在发布页下载。':'浏览器预览版请在发布页下载对应平台的安装包。'}</small></p>`}
      <div class="button-row">${installable?'<button type="button" class="primary" id="download-update">下载并安装</button>':''}<button type="button" class="secondary" id="open-release">打开发布页</button></div>${components}`
    :`<p>当前已是最新版本（${esc(host.current)}）。</p>${components}`;
  const release=document.querySelector('#open-release');if(release)release.onclick=()=>(host.native?host.transport('openRelease',{url:result.url}):Promise.resolve(window.open(result.url,'_blank','noopener,noreferrer'))).catch(failure=>error(failure.message));
  const plugins=document.querySelector('#update-components');if(plugins)plugins.onclick=()=>host.openPlugins();
  const start=document.querySelector('#download-update');if(start)start.onclick=()=>downloadAndInstall(host,result);
  if(pending?.version===result.version)renderProgress(host,result);
  return result;
}
function renderProgress(host,result){
  const node=document.querySelector('#update-progress'),start=document.querySelector('#download-update');if(!node)return;
  const job=pending;if(!job){node.innerHTML='';return;}
  if(start)start.hidden=job.state==='running'||job.state==='ready';
  if(job.state==='running'){const percent=job.total?Math.min(100,Math.floor(job.received/job.total*100)):0;
    if(!node.querySelector('progress'))node.innerHTML='<progress max="100" value="0" aria-label="下载进度"></progress><small class="download-progress"></small><div class="button-row"><button type="button" class="secondary" id="cancel-update">取消</button></div>';
    node.querySelector('progress').value=percent;node.querySelector('.download-progress').textContent=`${job.source||''} · ${formatBytes(job.received)} / ${job.total?formatBytes(job.total):'?'}`;
    document.querySelector('#cancel-update').onclick=event=>{event.currentTarget.disabled=true;job.controller.abort();};return;}
  if(job.state==='ready'){node.innerHTML=`<p>安装包已下载并通过校验（${esc(job.source)}）。</p><p><small>${host.platform==='windows'?'点击“立即安装”会保存文稿、关闭文舟并启动安装程序。':'点击“立即安装”打开系统安装器；首次使用需要允许文舟安装应用。'}</small></p><div class="button-row"><button type="button" class="primary" id="install-update">立即安装</button></div>`;
    document.querySelector('#install-update').onclick=async event=>{event.currentTarget.disabled=true;try{if(window.wenzhouSave&&!window.wenzhouSave())throw Error('当前文稿尚未保存，已取消更新安装。');await host.transport('installUpdate',{token:job.token});}catch(failure){event.currentTarget.disabled=false;const error=document.querySelector('#dialog-error');if(error)error.textContent=failure.message;}};return;}
  node.innerHTML=job.state==='cancelled'?'<p class="blank">下载已取消。</p>':`<p class="error" role="alert">${esc(job.error)}</p>`;
  if(start){start.hidden=false;start.textContent='重试';}
}
async function downloadAndInstall(host,result){
  if(pending?.state==='running')return;
  const job=pending={version:result.version,state:'running',received:0,total:result.installer.bytes||0,source:'',controller:new AbortController()};
  const refresh=()=>{if(pending===job)renderProgress(host,result);};refresh();
  try{const value=await downloadInstaller({transport:host.transport,tag:result.version,installer:result.installer,signal:job.controller.signal,onProgress:progress=>{Object.assign(job,progress);refresh();}});Object.assign(job,{state:'ready',token:value.token,source:value.source});}
  catch(failure){Object.assign(job,failure.code==='E_CANCELLED'?{state:'cancelled'}:{state:'error',error:failure.message});}
  refresh();
}
