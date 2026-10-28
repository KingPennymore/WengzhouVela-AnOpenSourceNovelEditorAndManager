import {mountIncrementalList} from './incremental-list.mjs';
import {icon} from './icons.mjs';
import {t} from './i18n.mjs';

/** The writing dialog and reading drawer share filtering, selection and batch deletion. */
export function mountAnnotationList(root,{entries,escape:esc,onOpen,onRemove,signal,openAttribute='reader-mark',deleteAttribute='reader-delete'}){
  const selected=new Set(),indices=new Map(entries.map((entry,i)=>[entry,i]));let visible=entries;
  root.innerHTML=`<input data-note-query type="search" placeholder="${t('搜索批注或原文')}" aria-label="${t('搜索批注或原文')}"><div class="annotation-bulk"><label><input type="checkbox" data-note-all>${t('全选当前列表')}</label><button type="button" data-note-remove disabled>${t('删除所选')}</button></div><div class="annotation-rows"></div>`;
  const list=mountIncrementalList(root.querySelector('.annotation-rows'),{items:entries,signal,empty:t('暂无批注'),renderItem:entry=>{
    const i=indices.get(entry);return `<article><input type="checkbox" data-note-select="${i}" aria-label="${t('选择')}" ${selected.has(entry)?'checked':''}><button type="button" data-${openAttribute}="${i}" data-user-content>${esc(entry.note||entry.quote||t('书签'))}${entry.pdfPage?' · '+entry.pdfPage:''}${entry.needsReview?' · '+t('位置待确认'):''}</button><button type="button" data-${deleteAttribute}="${i}" aria-label="${t('删除')}">${icon('trash')}</button></article>`;
  }});
  const refresh=()=>{const all=root.querySelector('[data-note-all]'),n=visible.filter(entry=>selected.has(entry)).length;all.checked=!!visible.length&&n===visible.length;all.indeterminate=n>0&&n<visible.length;all.disabled=!visible.length;root.querySelector('[data-note-remove]').disabled=!selected.size;};
  root.querySelector('[data-note-query]').oninput=e=>{const q=e.target.value.toLocaleLowerCase();visible=entries.filter(entry=>((entry.note||'')+' '+(entry.quote||'')).toLocaleLowerCase().includes(q));list.setItems(visible);refresh();};
  root.onchange=e=>{if(e.target.matches('[data-note-all]'))for(const entry of visible)e.target.checked?selected.add(entry):selected.delete(entry);if(e.target.matches('[data-note-select]')){const entry=entries[Number(e.target.dataset.noteSelect)];e.target.checked?selected.add(entry):selected.delete(entry);}for(const input of root.querySelectorAll('[data-note-select]'))input.checked=selected.has(entries[Number(input.dataset.noteSelect)]);refresh();};
  root.onclick=e=>{const open=e.target.closest(`[data-${openAttribute}]`),del=e.target.closest(`[data-${deleteAttribute}]`);if(open)onOpen(entries[Number(open.getAttribute('data-'+openAttribute))]);else if(del||e.target.closest('[data-note-remove]'))onRemove(del?[entries[Number(del.getAttribute('data-'+deleteAttribute))]]:[...selected]);};
  refresh();return {dispose:()=>{list.dispose();root.onclick=root.onchange=null;}};
}
