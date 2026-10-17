import {t} from './i18n.mjs';
export function renderPlanningSource({root,doc,escape:esc,parse}){root.className='planning-preview';let error='';try{parse(doc.text);}catch(e){error=e.message;}root.innerHTML=`<section><h2>${t('源码预览')}</h2>${error?`<p role="alert" class="error">${esc(t(error))}</p>`:''}<p>${t('配置无效，请切换源码修复。')}</p><pre data-user-content>${esc(doc.text)}</pre></section>`;}
