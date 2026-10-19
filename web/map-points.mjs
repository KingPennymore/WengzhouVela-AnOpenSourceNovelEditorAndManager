import {hexPoint} from './map-geometry.mjs';
export const drawingRadius=(value,settings={})=>value.grid.size*Math.sqrt(3)*(value.drawing?.distance??settings.neighborDistance??3);
export const drawingCells=value=>Object.fromEntries(Object.entries(value.cells).filter(([,c])=>c.type!=='info'));
let cache=new WeakMap(),drawingCache=new WeakMap();
export const clearPointCache=value=>{if(value){cache.delete(value);drawingCache.delete(value);}else{cache=new WeakMap();drawingCache=new WeakMap();}};
function cellGeometry(value,refresh=false){
 let result=drawingCache.get(value);
 if(refresh||!result||result.cells!==value.cells||result.size!==value.grid.size||result.orientation!==value.grid.orientation){
  const points=[],info=[];let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const [key,cell] of Object.entries(value.cells)){
   const p=hexPoint(...key.split(',').map(Number),value.grid.size,value.grid.orientation);
   left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);
   if(cell.type!=='info')points.push(p.x,p.y);
   if(cell.type==='info'||cell.name||cell.link)info.push({...cell,id:'cell:'+key,...p,legacyKey:key});
  }
  const flat=value.grid.orientation==='flat',dx=value.grid.size*(flat?1:Math.sqrt(3)/2),dy=value.grid.size*(flat?Math.sqrt(3)/2:1);
  result={cells:value.cells,size:value.grid.size,orientation:value.grid.orientation,points:new Float64Array(points),info,levels:new Map(),bounds:left===Infinity?null:{left:left-dx,right:right+dx,top:top-dy,bottom:bottom+dy}};
  drawingCache.set(value,result);
 }
 return result;
}
export const mapCellBounds=(value,refresh=false)=>cellGeometry(value,refresh).bounds;
export function drawingPointPositions(value,step=0){
 const result=cellGeometry(value);if(!step)return result.points;
 let level=result.levels.get(step);
 if(!level){
  const buckets=new Map();
  for(let i=0;i<result.points.length;i+=2){const x=result.points[i],y=result.points[i+1],key=Math.floor(x/step)+','+Math.floor(y/step);let bucket=buckets.get(key);if(!bucket){bucket={x:0,y:0,n:0};buckets.set(key,bucket);}bucket.x+=x;bucket.y+=y;bucket.n++;}
  level=new Float64Array(buckets.size*2);let i=0;for(const b of buckets.values()){level[i++]=b.x/b.n;level[i++]=b.y/b.n;}
  result.levels.set(step,level);if(result.levels.size>4)result.levels.delete(result.levels.keys().next().value);
 }
 return level;
}
export function informationPoints(value){const geometry=cellGeometry(value);let stored=cache.get(value);if(!stored||stored.geometry!==geometry||stored.markers!==value.markers){stored={geometry,markers:value.markers,points:[...(value.markers||[]),...geometry.info]};cache.set(value,stored);}return stored.points;}
export function hitInformationPoint(value,p,tolerance=18){return informationPoints(value).reverse().find(m=>Math.hypot(m.x-p.x,m.y-p.y)<=tolerance);}
