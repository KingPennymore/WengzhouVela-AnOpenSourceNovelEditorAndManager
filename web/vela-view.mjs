import {parseVela} from './vela.mjs';
import {t} from './i18n.mjs';
import {renderVelaV2} from './vela-view-v2.mjs';

export function renderVelaEditor({root,doc,workspace,escape:esc,onSave}){
  root.className='vela-preview';
  try{parseVela(doc.text);}catch(error){root.innerHTML=`<p class="error">${esc(error.message)}</p><p>${t('配置无效，请切换源码修复。')}</p>${workspace.configLastGood?.[doc.id]?`<p>${t('阅读与编辑仍使用上一次有效配置。')}</p><button class="secondary" id="restore-valid-config">${t('恢复上次有效配置')}</button>`:''}`;const restore=root.querySelector('#restore-valid-config');if(restore)restore.onclick=()=>onSave(workspace.configLastGood[doc.id]);return;}
  renderVelaV2({root,doc,workspace,escape:esc,onSave});
}
