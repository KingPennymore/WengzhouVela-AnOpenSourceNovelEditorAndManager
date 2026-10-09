import {mergeTexts,mergedText} from './sync-merge.mjs';
import {diffMarkup} from './sync-preview.mjs';
import {t} from './i18n.mjs';

// The same resolver is used for single-file and workspace downloads.
export function conflictMarkup(local,remote,escape){return `<div class="sync-conflict-sources"><label>${t('本地内容')}<textarea readonly rows="7">${escape(local)}</textarea></label><label>${t('远端内容')}<textarea readonly rows="7">${escape(remote)}</textarea></label></div><div class="sync-conflict-parts"></div><label>${t('合并结果')}<textarea class="sync-merged" readonly rows="9"></textarea></label><p class="sync-merge-status" role="status"></p>`;}
export function bindConflict(root,{base,local,remote,escape:esc}){
  const parts=mergeTexts(base,local,remote),conflicts=parts.filter(part=>part.conflict),list=root.querySelector('.sync-conflict-parts');
  list.innerHTML=conflicts.map((part,i)=>`<section class="sync-conflict-part" data-conflict="${i}"><h3>${t('冲突')} ${i+1}</h3>${part.base===null?`<p>${t('缺少共同版本，请核对完整文件。')}</p>`:diffMarkup(part.local,part.remote,esc)}<div class="button-row"><button type="button" data-choose="local">${t('保留本地这一段')}</button><button type="button" data-choose="remote">${t('采用远端这一段')}</button></div><label>${t('编辑这一段的合并内容')}<textarea rows="5">${esc(part.local)}</textarea></label><button type="button" data-confirm>${t('确认这一段')}</button></section>`).join('');
  const update=()=>{const pending=conflicts.filter(part=>!part.resolved).length;root.querySelector('.sync-merged').value=parts.map(part=>part.conflict?part.resolution??part.local:part.text).join('');root.querySelector('.sync-merge-status').textContent=pending?`${t('尚待处理的冲突')}：${pending}`:t('冲突已处理，可保存合并结果。');};
  for(const section of list.children){const part=conflicts[Number(section.dataset.conflict)],input=section.querySelector('textarea');const confirm=()=>{part.resolution=input.value;part.resolved=true;section.dataset.resolved='true';update();};section.querySelectorAll('[data-choose]').forEach(button=>button.onclick=()=>{input.value=part[button.dataset.choose];confirm();});input.oninput=()=>{part.resolved=false;delete section.dataset.resolved;update();};section.querySelector('[data-confirm]').onclick=confirm;}
  update();return ()=>mergedText(parts);
}

