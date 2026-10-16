import {parseVela} from './vela.mjs';
import {t} from './i18n.mjs';
import {renderVelaV2} from './vela-view-v2.mjs';

export function renderVelaEditor({root,doc,workspace,escape:esc,onSave}){
  root.className='vela-preview';
  let config;try{config=parseVela(doc.text);}catch(error){root.innerHTML=`<p class="error">${esc(error.message)}</p><p>${t('配置无效，请切换源码修复。')}</p>${workspace.configLastGood?.[doc.id]?`<p>${t('阅读与编辑仍使用上一次有效配置。')}</p><button class="secondary" id="restore-valid-config">${t('恢复上次有效配置')}</button>`:''}`;const restore=root.querySelector('#restore-valid-config');if(restore)restore.onclick=()=>onSave(workspace.configLastGood[doc.id]);return;}
  if(config.kind==='document'){renderSidecar(root,config,esc);return;}
  renderVelaV2({root,doc,workspace,escape:esc,onSave});
}
/** A format sidecar (.vela v3, kind: document) is managed from the TXT; here it is only summarised. */
function renderSidecar(root,config,esc){
  const count=group=>(config[group]||[]).length,types=[...new Set(['marks','blocks','inserts'].flatMap(group=>(config[group]||[]).map(entry=>entry.type)))];
  root.innerHTML=`<section class="vela-sidecar"><header class="vela-config-header"><span class="vela-config-mark">.vela v3</span><div><h2>${t('格式旁注')}</h2><small data-user-content>${esc(config.target)}</small></div></header><p>${t('此文件保存同名 TXT 的格式。打开 TXT 即可编辑格式；正文在文舟外改动后，格式会按原文自动重新定位。')}</p><dl><dt>${t('行内格式')}</dt><dd>${count('marks')}</dd><dt>${t('段落格式')}</dt><dd>${count('blocks')}</dd><dt>${t('插入内容')}</dt><dd>${count('inserts')}</dd><dt>${t('待确认')}</dt><dd>${(config.review||[]).length}</dd><dt>${t('类型')}</dt><dd>${esc(types.join('、')||'—')}</dd></dl><p><small>${t('切换到“源码”可直接查看 JSON。')}</small></p></section>`;
}
