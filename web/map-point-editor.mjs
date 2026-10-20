import {infoFields,infoSymbolSvg} from './map-info.mjs';
import {informationPoints} from './map-points.mjs';
import {planningLinkPicker} from './planning-link-picker.mjs';
import {t} from './i18n.mjs';

export function editMapPoint({root,marker,value,files,escape:esc,sheet,commit}){
 const current=marker.legacyKey?value.cells[marker.legacyKey]:marker;let linkedPath=current.link||'';
 const active=sheet({title:t('信息点'),html:`<form class="map-info-form map-point-form"><label>${t('名称')}<input name="name" value="${esc(current.name||'')}"></label>${infoFields(current,informationPoints(value),esc)}<label>${t('备注')}<textarea name="note" rows="3">${esc(current.note||'')}</textarea></label><div class="relation-glossary-links map-linked-map"><button type="button" data-link-map>${t('链接地图')}</button><div class="relation-glossary-link" data-map-link-row><button type="button" data-edit-map-link data-user-content></button><button type="button" data-remove-map-link aria-label="${t('移除链接')}">×</button></div></div><div class="button-row"><button type="submit" class="primary">${t('保存信息点')}</button><button type="button" data-remove-marker>${t('删除信息点')}</button></div></form>`});
 const form=active.body.querySelector('form');active.sheet.classList.add('map-point-sheet');
 const fields=document.createElement('div');fields.className='map-point-fields';for(const field of [...form.children])if(!field.classList.contains('button-row'))fields.append(field);form.prepend(fields);
 const custom=form.elements.customCategory,category=form.elements.category,updateCategory=()=>{const other=category.value==='其他';custom.closest('label').hidden=!other;custom.disabled=!other;};category.onchange=updateCategory;updateCategory();
 form.elements.symbol.onchange=()=>{active.body.querySelector('[data-info-icon-preview]').innerHTML=infoSymbolSvg(form.elements.symbol.value,esc);};
 const renderLink=()=>{form.querySelector('[data-map-link-row]').hidden=!linkedPath;form.querySelector('[data-edit-map-link]').textContent=linkedPath;};
 const chooseMap=event=>planningLinkPicker(root,{title:t('链接地图'),files:[...files.filter(file=>file.kind==='MAP'),...(linkedPath&&!files.some(file=>file.path===linkedPath)?[{path:linkedPath}]:[])],sourceName:'link',sourceLabel:t('地图'),selected:linkedPath,emptyMessage:t('请先新建地图。'),escape:esc,opener:event.currentTarget,parent:active,overlay:true,onSubmit:({path})=>{linkedPath=path;renderLink();}});
 form.querySelector('[data-link-map]').onclick=chooseMap;form.querySelector('[data-edit-map-link]').onclick=chooseMap;form.querySelector('[data-remove-map-link]').onclick=()=>{linkedPath='';renderLink();};renderLink();
 form.onsubmit=event=>{
  event.preventDefault();const before=structuredClone(value);
  current.category=category.value==='其他'?custom.value.trim()||'其他':category.value;current.symbol=form.elements.symbol.value;
  if(!current.category)delete current.category;if(!current.symbol)delete current.symbol;
  current.name=form.elements.name.value;current.note=form.elements.note.value;if(linkedPath)current.link=linkedPath;else delete current.link;delete current.invalid;
  if(commit(before))active.close();
 };
 form.querySelector('[data-remove-marker]').onclick=()=>{
  const before=structuredClone(value);
  if(marker.legacyKey){delete current.name;delete current.category;delete current.symbol;delete current.note;delete current.link;if(current.type==='info')delete value.cells[marker.legacyKey];}
  else value.markers=value.markers.filter(point=>point.id!==marker.id);
  commit(before);active.close();
 };
 return active;
}
