import {mapSymbols} from './map-symbols.mjs';
import {labelHalo} from './map-labels.mjs';
import {t} from './i18n.mjs';
// i18n-data: Stable category value stored in map files.
const OTHER='其他';
export const infoCategory=point=>point.category?.trim()||'';
export const categoryTitle=category=>defaultInfoCategories.includes(category)?t(category):category||t('未分类');

export const defaultInfoCategories=['城市','自然地理','设施','事件','资源','人物','其他']; // i18n-data: Stable category values are stored in map files; translate labels when rendering.

const groups={unit:'部队',facility:'军事设施',terrain:'自然地形',building:'建筑',event:'事件'}; // i18n-data: Group labels are translated by infoFields at render time.

export function infoSymbolSvg(type,esc){
  const definition=Object.hasOwn(mapSymbols,type||'')&&mapSymbols[type];
  return definition
    ?`<svg viewBox="-36 -36 72 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(definition.path)}"/></svg>`
    :'';
}
export function infoFields(point,points,esc){

  const categories=[...new Set([...defaultInfoCategories,...points.map(infoCategory),infoCategory(point)].filter(c=>c&&c!==OTHER))],
    definitions=Object.entries(mapSymbols),
    keys=[...new Set(definitions.map(([id])=>groups[id.split('.')[0]]?id.split('.')[0]:'plugin'))];

  return (`<label>${t('类别')}<select name="category">`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `<option value="">${t('未分类')}</option>${categories.map(c=>`<option value="${esc(c)}" ${c===infoCategory(point)?'selected':''} data-user-content>${esc(defaultInfoCategories.includes(c)?t(c):c)}</option>`).join('')}<option value="${OTHER}" ${infoCategory(point)===OTHER?'selected':''}>${t('其他')}</option>`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `</select>`+
    `</label>`+
    `<label data-custom-category ${infoCategory(point)===OTHER?'':'hidden'}>${t('自定义类别')}<input name="customCategory" maxlength="80" placeholder="${t('输入类别名称')}" ${infoCategory(point)===OTHER?'':'disabled'}>`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `</label>`+
    `<label>${t('元素图标')}<select name="symbol">`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `<option value="">${t('无图标')}</option>${keys.map(group=>`<optgroup label="${t(groups[group]||'插件元素')}">${definitions.filter(([id])=>(groups[id.split('.')[0]]?id.split('.')[0]:'plugin')===group).map(([id,s])=>`<option value="${esc(id)}" ${id===point.symbol?'selected':''}>${esc(t(s.label))}</option>`).join('')}</optgroup>`).join('')}${point.symbol&&!Object.hasOwn(mapSymbols,point.symbol)?`<option value="${esc(point.symbol)}" selected>${esc(point.symbol)} · ${t('暂不可用')}</option>`:''}</select>`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `</label>`+
    `<div class="map-info-icon-preview" data-info-icon-preview>${infoSymbolSvg(point.symbol,esc)}<span>${t('圆点标记位置，图标显示在上方')}</span>`+ // i18n-data: Option values and comparisons use stored category values; visible labels use t().
    `</div>`);

}
const paths=new Map();
export function drawInfoSymbol(ctx,point,scale,color){
  const def=Object.hasOwn(mapSymbols,point.symbol||'')&&mapSymbols[point.symbol];
  if(!def||typeof Path2D!=='function')return;
  let path=paths.get(def.path);
  if(!path){
    path=new Path2D(def.path);
    if(paths.size>128)paths.clear();
    paths.set(def.path,path);
  }
  ctx.save();
  ctx.translate(point.x,point.y-22/scale);
  ctx.scale(.36/scale,.36/scale);
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.strokeStyle=labelHalo(color);
  ctx.lineWidth=10;
  ctx.stroke(path);
  ctx.strokeStyle=color;
  ctx.lineWidth=4;
  ctx.stroke(path);
  ctx.restore();
}
