import {pointHex,hexVertices} from './map-geometry.mjs';
import {MB} from './text-utils.mjs';

// A rectangular period contains two hexagons. Share small raster tiles across
// documents; a canvas retains only its most recently used pattern.
const tiles=new Map(),patterns=new WeakMap();let tileBytes=0;
const MAX_BYTES=8*MB,MAX_TILES=12;
export function clearHexGridCache(){tiles.clear();tileBytes=0;}
export function hexGridCacheInfo(){return {tiles:tiles.size,bytes:tileBytes};}
function gridTile(ctx,orientation,radius,dpr,color){
 const key=[orientation,radius,dpr,color].join('|');let tile=tiles.get(key);
 if(tile){tiles.delete(key);tiles.set(key,tile);return tile;}
 const canvas=ctx.canvas?.ownerDocument?.createElement('canvas');if(!canvas)return null;
 const flat=orientation==='flat',width=flat?3:Math.sqrt(3),height=flat?Math.sqrt(3):3;
 canvas.width=Math.ceil(width*radius*dpr);canvas.height=Math.ceil(height*radius*dpr);
 const c=canvas.getContext('2d');if(!c)return null;
 c.scale(canvas.width/width,canvas.height/height);c.beginPath();
 for(let r=-3;r<=3;r++)for(let q=-3;q<=3;q++){
  const vertices=hexVertices(q,r,1,orientation);
  // Each shared edge belongs to exactly one cell.
  for(let i=0;i<3;i++){c.moveTo(...vertices[i]);c.lineTo(...vertices[i+1]);}
 }
 c.lineWidth=1/radius;c.strokeStyle=color;c.stroke();
 tile={canvas,width,height,bytes:canvas.width*canvas.height*4};tiles.set(key,tile);tileBytes+=tile.bytes;
 while(tiles.size>MAX_TILES||tileBytes>MAX_BYTES){const oldest=tiles.keys().next().value;tileBytes-=tiles.get(oldest).bytes;tiles.delete(oldest);}
 return tile;
}
export function drawHexGrid(ctx,grid,bounds,scale,color='#3b7566',dpr=1){
 const radius=grid.size*scale;if(radius<=8)return;
 ctx.save();ctx.globalAlpha*=.16*Math.min(1,(radius-8)/6);
 // Large hexagons are few and vector strokes stay sharp at any magnification.
 const tile=radius<=128&&gridTile(ctx,grid.orientation,Math.max(8,Math.round(radius*2)/2),Math.min(2,Math.max(1,dpr)),color);
 let cached=patterns.get(ctx);
 if(tile&&(!cached||cached.tile!==tile)){const pattern=ctx.createPattern(tile.canvas,'repeat');cached={tile,pattern};patterns.set(ctx,cached);}
 if(tile&&cached?.pattern?.setTransform){
  cached.pattern.setTransform({a:tile.width*grid.size/tile.canvas.width,b:0,c:0,d:tile.height*grid.size/tile.canvas.height,e:0,f:0});
  ctx.fillStyle=cached.pattern;ctx.fillRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);
 }else{
  ctx.beginPath();for(const path of hexGridPaths(grid,bounds,scale)){ctx.moveTo(...path[0]);for(let i=1;i<6;i++)ctx.lineTo(...path[i]);ctx.closePath();}
  ctx.strokeStyle=color;ctx.lineWidth=1/scale;ctx.stroke();
 }
 ctx.restore();
}
export function hexGridPaths(grid,bounds,scale=1){if(grid.size*scale<10)return [];const corners=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>pointHex(x,y,grid.size,grid.orientation)),q0=Math.min(...corners.map(p=>p.q))-1,q1=Math.max(...corners.map(p=>p.q))+1,r0=Math.min(...corners.map(p=>p.r))-1,r1=Math.max(...corners.map(p=>p.r))+1;if((q1-q0+1)*(r1-r0+1)>12000)return [];const paths=[];for(let r=r0;r<=r1;r++)for(let q=q0;q<=q1;q++){const p=hexVertices(q,r,grid.size,grid.orientation);if(Math.max(...p.map(p=>p[0]))<bounds.left||Math.min(...p.map(p=>p[0]))>bounds.right||Math.max(...p.map(p=>p[1]))<bounds.top||Math.min(...p.map(p=>p[1]))>bounds.bottom)continue;paths.push(p);}return paths;}
