import {mapSamples} from './map-samples.mjs';
import {updateDrawingFill} from './map-fill.mjs';
import {mapText} from './map.mjs';

export const isTerrain=layer=>layer?.algorithm==='terrain';
export function terrainBounds(layer){
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const paths of [layer.paths,...(layer.regions||[]).map(r=>r.paths)])for(const path of paths)for(const [x,y] of path){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return {left,top,right,bottom,x:(left+right)/2,y:(top+bottom)/2};
}
export function hitTerrain(layer,p){
 // Match the renderer's evenodd rule, including holes and disconnected islands.
 return (layer.regions||[]).some(region=>{let inside=false;for(const path of region.paths)for(let i=0,j=path.length-1;i<path.length;j=i++){
  const [x,y]=path[i],[a,b]=path[j];if((y>p.y)!==(b>p.y)&&p.x<(a-x)*(p.y-y)/(b-y)+x)inside=!inside;
 }return inside;});
}
export function moveTerrain(target,original,dx,dy){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('地形位置无效。');if(dx===0&&dy===0)return;
 const shift=paths=>paths.map(path=>path.map(([x,y])=>[Math.round((x+dx)*10000)/10000,Math.round((y+dy)*10000)/10000]));
 target.paths=shift(original.paths);target.regions=(original.regions||[]).map(region=>({...region,paths:shift(region.paths)}));
}
export function convertDrawingTerrain(source,settings={},id='terrain-1'){
 if(!id||source.generated.some(g=>g.id===id))throw Error('地形 ID 无效或重复。');
 const next=structuredClone(source),graph=mapSamples(next.cells,next.drawing?.distance??settings.neighborDistance??3,next.grid),closed=graph.keys.filter(key=>graph.closed.has(graph.find(key)));
 if(!closed.length)throw Error('没有可转换的封闭地形，请先闭合绘制点。');
 let fill=next.generated.find(g=>g.id==='g-drawing-fill');if(!fill){updateDrawingFill(next,settings);fill=next.generated.find(g=>g.id==='g-drawing-fill');}
 if(!fill?.regions?.some(region=>region.paths.some(path=>path.length>=3)))throw Error('没有可转换的填充区域，原绘制点已保留。');
 const referenced=new Set(next.arrows.flatMap(a=>a.path));let removed=0,kept=0;
 for(const key of closed){const cell=next.cells[key];if(cell.type==='draw'&&Object.keys(cell).every(field=>field==='type')&&!referenced.has(key)){delete next.cells[key];removed++;}else{cell.drawingBaked=true;kept++;}}
 const terrain={...structuredClone(fill),id,algorithm:'terrain',label:'地形',paths:fill.paths||[]};delete terrain.params;
 // Keep an empty drawing layer for older readers; future drawing regenerates only new samples.
 next.generated=next.generated.filter(g=>g.id!=='g-drawing-fill');next.generated.push({id:'g-drawing-fill',algorithm:'drawing-fill',paths:[],regions:[]},terrain);
 const bytes=text=>new TextEncoder().encode(text).length;
 return {value:next,removed,kept,beforeBytes:bytes(mapText(source)),afterBytes:bytes(mapText(next))};
}
