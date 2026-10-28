import {informationPoints} from './map-points.mjs';
import {planningSheet} from './planning-sheet.mjs';
import {detailButton} from './planning-ui.mjs';
import {icon} from './icons.mjs';
import {t} from './i18n.mjs';
import {mapSnapshot} from './map-history.mjs';
export function mapDetails({root,value,escape:esc,markdown,commit}){
  root.querySelector('.map-stage').insertAdjacentHTML('beforeend',detailButton());
  const button=root.querySelector('.planning-details-button');
  let active=null;
  const empty=label=>`<p class="map-detail-empty">${t(label)}</p>`,
    fieldRow=(f={},i='')=>`<div data-info-field data-field-index="${i}">
        <input aria-label="${t('字段名称')}" placeholder="${t('字段名称')}" value="${esc(f.label||'')}">
        <input aria-label="${t('字段值')}" placeholder="${t('字段值')}" value="${esc(f.value||'')}">
        <button type="button" data-remove-field aria-label="${t('删除字段')}">${icon('trash')}</button></div>`;
  const dock=()=>{
    const footer=active.body.querySelector('.map-info-actions');
    active.sheet.querySelector('.planning-sheet-surface>.map-info-actions')?.remove();
    active.sheet.querySelector('.planning-sheet-surface').append(footer);
    active.body.scrollTop=0;
  };
  const show=()=>{
    active=planningSheet(
      root,
      {
        title:value.name||t('地图详情'),
        escape:esc,
        opener:button,
        html:`<div class="map-detail-overview">
            <span>${icon('pin')}</span>
            <div>
              <small>${t('地图信息')}</small>
              <p data-user-content>${esc(value.info?.summary||t('暂无简介'))}</p></div>
          </div>
          <dl class="map-detail-counts">${[[Object.values(value.cells).filter(c=>c.type!=='info').length,'绘制点'],[informationPoints(value).length,'信息点'],[value.symbols.length,'元素']].map(([n,label])=>`<div><dt>${t(label)}</dt><dd>${n}</dd></div>`).join('')}</dl>
          <section class="map-detail-card">
            <h3>${t('详情')}</h3>
            <div class="map-detail-markdown">${value.info?.detail?markdown(value.info.detail):empty('尚未填写地图详情')}</div></section>
          <section class="map-detail-card">
            <h3>${t('自定义信息')}</h3>${value.info?.fields?.length
          ?`<table><tbody>${value.info.fields.map(f=>`<tr><th scope="row" data-user-content>${esc(f.label)}</th><td data-user-content>${esc(f.value)}</td></tr>`).join('')}</tbody></table>`
          :empty('可添加地点、气候或创作备注')}</section>
          <div class="map-info-actions">
            <button class="primary" data-info-edit>${icon('write')}${t('编辑地图信息')}</button></div>`
      });
    active.sheet.classList.add('map-details-sheet');
    active.body.querySelector('[data-info-edit]').onclick=edit;
    dock();
  };
  const edit=()=>{
    const fields=value.info?.fields||[];
    active.body.innerHTML=`<form id="map-details-form" class="map-info-form map-details-form">
        <fieldset>
          <legend>${t('地图信息')}</legend>
          <label>${t('地图名称')}<input name="name" value="${esc(value.name||'')}"></label>
          <label>${t('概要')}<textarea name="summary" rows="2">${esc(value.info?.summary||'')}</textarea></label>
        </fieldset>
        <fieldset>
          <legend>${t('详情')}</legend>
          <label>
            <span>${t('支持 Markdown 格式')}</span>
            <textarea name="detail" rows="6">${esc(value.info?.detail||'')}</textarea></label>
        </fieldset>
        <fieldset>
          <legend>${t('自定义信息')}</legend>
          <div data-info-fields>${fields.map(fieldRow).join('')}</div>
          <button type="button" data-add-field>${icon('add')}${t('添加字段')}</button></fieldset>
        <div class="button-row map-info-actions">
          <button class="primary" data-info-save form="map-details-form">${t('保存地图信息')}</button>
          <button type="button" data-info-cancel>${t('取消')}</button></div>
      </form>`;
    const form=active.body.querySelector('form'),box=form.querySelector('[data-info-fields]');
    box.onclick=e=>e.target.closest('[data-remove-field]')?.closest('[data-info-field]').remove();
    form.querySelector('[data-add-field]').onclick=()=>box.insertAdjacentHTML('beforeend',fieldRow());
    form.querySelector('[data-info-cancel]').onclick=show;
    form.onsubmit=e=>{
      e.preventDefault();
      const before=mapSnapshot(value,['name','info']);
      value.name=form.elements.name.value;
      value.info={
        ...value.info,
        summary:form.elements.summary.value,
        detail:form.elements.detail.value,
        fields:[...box.children].map(row=>({...(row.dataset.fieldIndex!==''?fields[Number(row.dataset.fieldIndex)]:{}),label:row.querySelectorAll('input')[0].value,value:row.querySelectorAll('input')[1].value}))
      };
      if(commit(before))show();
    };
    dock();
  };
  button.onclick=()=>active?.sheet.isConnected?active.close():show();
  return {show};
}
