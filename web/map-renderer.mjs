import {drawInfoSymbol,infoCategory} from './map-info.mjs';
import {drawMapLabel} from './map-labels.mjs';
import {drawHexGrid} from './map-grid.mjs';
import {hexPoint,pointHex,hexVertices} from './map-geometry.mjs';
import {informationPoints,drawingPointPositions} from './map-points.mjs';
export function drawMap(ctx,value,plane,width,height,palette,{selected='',selectedInfo='',drawLayers=()=>{},accent='#3b7566',text='#263b34',guide=null,showPoints=true,showGrid=false,dpr=1,lod=true}={}){
 const {size,orientation}=value.grid,scale=plane.scale,left=-plane.x/scale,top=-plane.y/scale,right=(width-plane.x)/scale,bottom=(height-plane.y)/scale,corners=[[left,top],[right,top],[left,bottom],[right,bottom]].map(([x,y])=>pointHex(x,y,size,orientation)),minQ=Math.min(...corners.map(p=>p.q))-1,maxQ=Math.max(...corners.map(p=>p.q))+1,minR=Math.min(...corners.map(p=>p.r))-1,maxR=Math.max(...corners.map(p=>p.r))+1;let count=0;ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(plane.x,plane.y);ctx.scale(scale,scale);drawLayers(ctx,{left,top,right,bottom,scale,lod});if(showGrid)drawHexGrid(ctx,value.grid,{left,top,right,bottom},scale,accent,dpr);ctx.beginPath();if(showPoints){const compact=lod&&size*scale<8;
 const point=(x,y)=>{if(x<left-8/scale||x>right+8/scale||y<top-8/scale||y>bottom+8/scale)return;const radius=(compact?1.5:3)/scale;ctx.moveTo(x+radius,y);ctx.arc(x,y,radius,0,Math.PI*2);count++;};
 if(compact||(maxQ-minQ+1)*(maxR-minR+1)>200000){const points=drawingPointPositions(value,compact?2**Math.ceil(Math.log2(8/scale)):0);for(let i=0;i<points.length;i+=2)point(points[i],points[i+1]);}else for(let r=minR;r<=maxR;r++)for(let q=minQ;q<=maxQ;q++){const c=value.cells[q+','+r];if(c&&c.type!=='info'){const p=hexPoint(q,r,size,orientation);point(p.x,p.y);}}}ctx.fillStyle=accent;ctx.fill();ctx.font=`${12/scale}px sans-serif`;ctx.textAlign='center';
 const labels=[],hidden=new Set(value.labels?.hiddenCategories||[]);
 for(const m of informationPoints(value)){
  if(m.x<left-100/scale||m.x>right+100/scale||m.y<top-45/scale||m.y>bottom+40/scale)continue;
  const active=selectedInfo===m.id||selected===m.id||selected===m.legacyKey;
  ctx.beginPath();ctx.arc(m.x,m.y,(active?10:7)/scale,0,Math.PI*2);ctx.fillStyle=accent;ctx.globalAlpha=.16;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=accent;ctx.lineWidth=(active?2.5:1.5)/scale;ctx.stroke();ctx.beginPath();ctx.arc(m.x,m.y,2/scale,0,Math.PI*2);ctx.fill();drawInfoSymbol(ctx,m,scale,accent);
  if(m.name&&(!lod||!hidden.has(infoCategory(m))||active))labels.push({m,active});
 }
 // Keep type readable at every zoom. A screen grid avoids quadratic overlap checks.
 const occupied=new Map();
 for(const {m,active} of labels.sort((a,b)=>Number(b.active)-Number(a.active))){
  const width=Math.min(180,(ctx.measureText?.(m.name).width||m.name.length*12)*scale)+8,x=m.x*scale,y=m.y*scale+25,box={left:x-width/2,right:x+width/2,top:y-14,bottom:y+4},keys=[];
  for(let gx=Math.floor(box.left/64);gx<=Math.floor(box.right/64);gx++)for(let gy=Math.floor(box.top/32);gy<=Math.floor(box.bottom/32);gy++)keys.push(gx+','+gy);
  if(lod&&!active&&keys.some(key=>(occupied.get(key)||[]).some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top)))continue;
  drawMapLabel(ctx,m.name,m.x,m.y+25/scale,{color:text,scale,maxWidth:180/scale});for(const key of keys){if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(box);}
 }

 if(selected&&value.cells[selected]){const p=hexVertices(...selected.split(',').map(Number),size,orientation);ctx.beginPath();ctx.moveTo(...p[0]);p.slice(1).forEach(pt=>ctx.lineTo(...pt));ctx.closePath();ctx.strokeStyle=accent;ctx.lineWidth=1/scale;ctx.globalAlpha=.4;ctx.stroke();ctx.globalAlpha=1;}if(guide){ctx.beginPath();ctx.arc(guide.x,guide.y,guide.radius,0,Math.PI*2);ctx.globalAlpha=.08;ctx.fillStyle=accent;ctx.fill();ctx.globalAlpha=.7;ctx.strokeStyle=accent;ctx.lineWidth=1/scale;ctx.setLineDash([5/scale,4/scale]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}ctx.restore();return count;
}
