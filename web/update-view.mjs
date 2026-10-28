import {checkUpdates,downloadInstaller} from './updates.mjs';
import {beginViewSession} from './view-session.mjs';
import {formatBytes} from './component-downloads.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {t,say} from './i18n.mjs';

let pending=null,currentView=null;

/**
 * Checks Gitee, then GitHub, for a newer stable release. Windows and Android download the installer natively,
 * verify its SHA-256 and hand it to the system installer; HarmonyOS (no side-loading) and the browser open the release page.
 * host: {openModal, transport, native, platform, current, lite, installed: Map, openPlugins, toast, remember(result)}
 */
export async function checkAppUpdates(host,{visible=false}={}){
  let mounted=null;
  const open=(...args)=>{mounted=host.openModal(...args)||beginViewSession(document.querySelector('#dialog-body'));return mounted;};
  const body=()=>mounted?.alive()?mounted.root:null;
  const error=message=>{
    if(!body())return;
    const node=document.querySelector('#dialog-error');
    if(node)node.textContent=message;
  };
  let display=visible;
  if(display)open(t('检查更新'),`<p>${t('正在从 Gitee / GitHub 检查新版本…')}</p>`,null,{noSubmit:true});
  let result;
  try{
    result=await checkUpdates(host.transport,host.current,{platform:host.platform,lite:host.lite,installed:host.installed});
    host.remember?.(result);
  }catch(failure){
    if(visible)error(failure.message);
    return null;
  }
  if(!display){
    if(result.available&&!host.dialogOpen?.()){
      display=true;
      open(t('发现新版本'),`<p>${t('正在整理更新信息…')}</p>`,null,{noSubmit:true});
    }else{
      if(result.available)host.toast(say(`发现新版本 ${result.version}，可在“更多 → 检查更新”中查看。`,`Version ${result.version} is available; see More → Check for updates.`));
      else if(result.components.length)host.toast(say(`有 ${result.components.length} 个组件可更新。`,`${result.components.length} components can be updated.`));
      return result;
    }
  }
  const installable=host.native&&!!result.installer,mobile=['android','harmonyos'].includes(host.platform);
  const components=result.components.length
    ?`<h3>${t('组件更新')}</h3><ul class="update-components">${result.components.map(item=>`<li>${esc(item.title)}${say('：',': ')}${esc(host.installed.get(item.id))} → ${esc(item.version)}</li>`).join('')}</ul><div class="button-row"><button type="button" class="secondary" id="update-components">${t('在插件与组件中更新')}</button></div>`
    :'';
  const node=body();
  if(!node)return result;
  currentView={session:mounted,host,result};
  mounted.onDispose(()=>{if(currentView?.session===mounted)currentView=null;});
  const signature=result.signed===true
    ?`<br><small>${t('发布清单签名已验证。')}</small>`
    :result.signed===false?`<br><small>${t('签名机制启用前的旧版发布，校验值只采信 GitHub。')}</small>`:'';
  const size=result.installer?.bytes?formatBytes(result.installer.bytes):t('大小未知');
  const install=installable
    ?`<p><small>${say(`安装包 ${esc(result.installer.name)} · ${esc(size)}。下载后先核对 SHA-256，再交给系统安装程序${host.platform==='android'?'；安卓会检查签名与当前应用一致':''}。`,`Installer ${esc(result.installer.name)} · ${esc(size)}. Its SHA-256 is checked before it is handed to the system installer${host.platform==='android'?'; Android also checks that the signature matches this app':''}.`)}</small></p>${mobile?`<p><small class="download-hint">${t('安装包较大，建议在 Wi‑Fi 下下载。')}</small></p>`:''}<div id="update-progress"></div>`
    :`<p><small>${t(host.platform==='harmonyos'?'鸿蒙版不能在应用内安装，请在发布页或应用市场获取新版本。':host.native?'未找到适用于此设备的安装包，请在发布页下载。':'浏览器预览版请在发布页下载对应平台的安装包。')}</small></p>`;
  node.innerHTML=result.available
    ?`<p>${say(`新版本 <strong>${esc(result.version)}</strong>（当前 ${esc(host.current)}，来源 ${esc(result.source)}）`,`New version <strong>${esc(result.version)}</strong> (current ${esc(host.current)}, from ${esc(result.source)})`)}${signature}</p><pre class="history-diff">${esc(result.notes)}</pre>
      ${install}
      <div class="button-row">${installable?`<button type="button" class="primary" id="download-update">${t('下载并安装')}</button>`:''}<button type="button" class="secondary" id="open-release">${t('打开发布页')}</button></div>${components}`
    :`<p>${say(`当前已是最新版本（${esc(host.current)}）。`,`You have the latest version (${esc(host.current)}).`)}</p>${components}`;
  const release=node.querySelector('#open-release');
  if(release)release.onclick=()=>(host.native?host.transport('openRelease',{url:result.url}):Promise.resolve(window.open(result.url,'_blank','noopener,noreferrer'))).catch(failure=>error(failure.message));
  const plugins=node.querySelector('#update-components');
  if(plugins)plugins.onclick=()=>host.openPlugins();
  const start=node.querySelector('#download-update');
  if(start)start.onclick=()=>downloadAndInstall(host,result);
  if(pending?.version===result.version)renderProgress(host,result,mounted);
  return result;
}

function renderProgress(host,result,session){
  if(!session?.alive())return;
  const root=session.root,node=root.querySelector('#update-progress'),start=root.querySelector('#download-update');
  if(!node)return;
  const job=pending;
  if(!job){node.innerHTML='';return;}
  if(start)start.hidden=job.state==='running'||job.state==='ready';
  if(job.state==='running'){
    const percent=job.total?Math.min(100,Math.floor(job.received/job.total*100)):0;
    if(!node.querySelector('progress'))node.innerHTML=`<progress max="100" value="0" aria-label="${t('下载进度')}"></progress><small class="download-progress"></small><div class="button-row"><button type="button" class="secondary" id="cancel-update">${t('取消')}</button></div>`;
    node.querySelector('progress').value=percent;
    node.querySelector('.download-progress').textContent=`${job.source||''} · ${formatBytes(job.received)} / ${job.total?formatBytes(job.total):'?'}`;
    root.querySelector('#cancel-update').onclick=event=>{event.currentTarget.disabled=true;job.controller.abort();};
    return;
  }
  if(job.state==='ready'){
    node.innerHTML=`<p>${say(`安装包已下载并通过校验（${esc(job.source)}）。`,`The installer was downloaded and verified (${esc(job.source)}).`)}</p><p><small>${t(host.platform==='windows'?'点击“立即安装”会保存文稿、关闭文舟并启动安装程序。':'点击“立即安装”打开系统安装器；首次使用需要允许文舟安装应用。')}</small></p><div class="button-row"><button type="button" class="primary" id="install-update">${t('立即安装')}</button></div>`;
    root.querySelector('#install-update').onclick=async event=>{
      event.currentTarget.disabled=true;
      try{
        if(window.wenzhouSave&&!window.wenzhouSave())throw Error(t('当前文稿尚未保存，已取消更新安装。'));
        await host.transport('installUpdate',{token:job.token});
      }catch(failure){
        if(!session.alive())return;
        root.querySelector('#install-update').disabled=false;
        const error=document.querySelector('#dialog-error');
        if(error)error.textContent=failure.message;
      }
    };
    return;
  }
  node.innerHTML=job.state==='cancelled'?`<p class="blank">${t('下载已取消。')}</p>`:`<p class="error" role="alert">${esc(job.error)}</p>`;
  if(start){start.hidden=false;start.textContent=t('重试');}
}

async function downloadAndInstall(host,result){
  if(pending?.state==='running')return;
  const job=pending={version:result.version,state:'running',received:0,total:result.installer.bytes||0,source:'',controller:new AbortController()};
  const refresh=()=>{if(pending===job&&currentView?.result.version===job.version)renderProgress(currentView.host,currentView.result,currentView.session);};
  refresh();
  try{
    const value=await downloadInstaller({transport:host.transport,tag:result.version,installer:result.installer,signal:job.controller.signal,onProgress:progress=>{Object.assign(job,progress);refresh();}});
    Object.assign(job,{state:'ready',token:value.token,source:value.source});
  }catch(failure){
    Object.assign(job,failure.code==='E_CANCELLED'?{state:'cancelled'}:{state:'error',error:failure.message});
  }
  refresh();
}
