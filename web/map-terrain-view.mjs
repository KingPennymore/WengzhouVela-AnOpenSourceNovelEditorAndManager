import {isTerrain,terrainBounds,moveTerrain} from './map-terrain.mjs';
import {hitMapLayer} from './map-layers.mjs';
import {hitInformationPoint} from './map-points.mjs';
import {t} from './i18n.mjs';

export function bindMapTerrain({root,canvas,value,state,request,commit,sheet}){
 let gesture=null;
 const selected=()=>state.layerSelection?.layer==='generated'?value.generated.find(g=>g.id===state.layerSelection.id&&isTerrain(g)):null;
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-state.plane.x)/state.plane.scale,y:(e.clientY-r.top-state.plane.y)/state.plane.scale};};
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function edit(layer){
  const bounds=terrainBounds(layer),active=sheet({title:t('地形元素'),html:`<form class="map-info-form"><label>${t('名称')}<input name="label"></label><div class="map-panel-grid"><label>X<input name="x" type="number" step="any"></label><label>Y<input name="y" type="number" step="any"></label></div>${(layer.regions||[]).map((_,i)=>`<fieldset><legend>${t('填充区域')} ${i+1}</legend><div class="map-panel-grid"><label>${t('颜色')}<input data-terrain-color="${i}" type="color"></label><label>${t('不透明度')}<input data-terrain-opacity="${i}" type="number" min="0" max="100" step="any"></label></div></fieldset>`).join('')}<div class="button-row"><button class="primary">${t('保存地形')}</button><button type="button" data-remove-terrain>${t('删除地形')}</button></div></form>`});
  const form=active.body.querySelector('form');form.elements.label.value=layer.label||t('地形');form.elements.x.value=bounds.x;form.elements.y.value=bounds.y;
  for(const [i,region] of (layer.regions||[]).entries()){form.querySelector(`[data-terrain-color="${i}"]`).value=region.color.slice(0,7);form.querySelector(`[data-terrain-opacity="${i}"]`).value=Math.round(parseInt(region.color.slice(7)||'ff',16)/255*10000)/100;}
  form.onsubmit=e=>{e.preventDefault();if(!value.generated.includes(layer))return;const before=structuredClone(value),current=terrainBounds(layer);moveTerrain(layer,layer,Number(form.elements.x.value)-current.x,Number(form.elements.y.value)-current.y);layer.label=form.elements.label.value;for(const [i,region] of (layer.regions||[]).entries()){const alpha=Math.round(Math.max(0,Math.min(100,Number(form.querySelector(`[data-terrain-opacity="${i}"]`).value)))*255/100);region.color=form.querySelector(`[data-terrain-color="${i}"]`).value+alpha.toString(16).padStart(2,'0');}if(commit(before))active.close();};
  form.querySelector('[data-remove-terrain]').onclick=()=>{if(!value.generated.includes(layer))return;const before=structuredClone(value);value.generated=value.generated.filter(g=>g!==layer);state.layerSelection=null;commit(before);active.close();};
 }
 function down(e){
  if(gesture){if(e.pointerId!==gesture.id)stop(e);return;}
  if(state.tool!=='select'||e.button>0||e.shiftKey||e.isPrimary===false)return;
  const p=point(e);if(hitInformationPoint(value,p,18/state.plane.scale))return;
  const hit=hitMapLayer(value,p,'all',8/state.plane.scale);if(hit?.layer!=='generated'||!isTerrain(hit.object))return;
  root.querySelector('.planning-sheet')?.planningClose?.(true);root.querySelector('.map-tools-panel:not(.map-algorithm-dialog)')?.planningClose?.();state.layerSelection={layer:'generated',id:hit.object.id};
  gesture={id:e.pointerId,layer:hit.object,before:structuredClone(value),original:structuredClone(hit.object),origin:p,moved:false};
  canvas.setPointerCapture(e.pointerId);request();stop(e);
 }
 function move(e){if(gesture?.id!==e.pointerId)return;const p=point(e),g=gesture,dx=p.x-g.origin.x,dy=p.y-g.origin.y;if(g.moved||Math.hypot(dx,dy)*state.plane.scale>8){g.moved=true;moveTerrain(g.layer,g.original,dx,dy);request();}stop(e);}
 function up(e){if(gesture?.id!==e.pointerId)return;const g=gesture;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(g.moved)commit(g.before);else edit(g.layer);request();stop(e);}
 function cancel(e){if(!gesture)return;const g=gesture;gesture=null;Object.assign(g.layer,g.original);if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);request();if(e)stop(e);}
 function key(e){if(state.tool!=='select'||!selected())return;if(e.key==='Escape'){cancel();state.layerSelection=null;root.querySelector('.planning-sheet')?.planningClose?.();request();stop(e);}else if(e.key==='Delete'||e.key==='Backspace'){const before=structuredClone(value),layer=selected();value.generated=value.generated.filter(g=>g!==layer);state.layerSelection=null;commit(before);root.querySelector('.planning-sheet')?.planningClose?.();stop(e);}else if(e.key==='Enter'){edit(selected());stop(e);}}
 for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['keydown',key]])canvas.addEventListener(type,fn,true);
 return {dispose(){cancel();for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['keydown',key]])canvas.removeEventListener(type,fn,true);}};
}
