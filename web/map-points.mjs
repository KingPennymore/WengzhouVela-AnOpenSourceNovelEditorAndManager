import {hexPoint} from './map-geometry.mjs';
export const drawingRadius=(value,settings={})=>value.grid.size*Math.sqrt(3)*(value.drawing?.distance??settings.neighborDistance??1.25);
export const drawingCells=value=>Object.fromEntries(Object.entries(value.cells).filter(([,c])=>c.type!=='info'));
let cache=new WeakMap();
export const clearPointCache=value=>{if(value)cache.delete(value);else cache=new WeakMap();};
export function informationPoints(value){if(!cache.has(value))cache.set(value,[...(value.markers||[]),...Object.entries(value.cells).filter(([,c])=>c.type==='info'||c.name||c.link).map(([key,c])=>({...c,id:'cell:'+key,...hexPoint(...key.split(',').map(Number),value.grid.size,value.grid.orientation),legacyKey:key}))]);return cache.get(value);}
export function hitInformationPoint(value,p,tolerance=18){return informationPoints(value).reverse().find(m=>Math.hypot(m.x-p.x,m.y-p.y)<=tolerance);}
