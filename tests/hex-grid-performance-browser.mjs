import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
const server=await startSourceAppServer(),browser=await launchBrowser();
try{
 const page=await browser.newPage();page.on('console',message=>console.log(message.text()));await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);
 const result=await page.evaluate(async()=>{
  const {drawHexGrid,hexGridPaths,hexGridCacheInfo,clearHexGridCache}=await import('/map-grid.mjs'),{hexVertices}=await import('/map-geometry.mjs');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),results=[];document.body.append(canvas);
  const summary=a=>{a.sort((x,y)=>x-y);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
  for(const [width,height] of [[1280,720],[2560,1440],[3840,2160]])for(const dpr of [1,2])for(const orientation of ['pointy','flat'])for(const scale of [1,.4]){
   canvas.width=width*dpr;canvas.height=height*dpr;const grid={size:32,orientation},samples={legacy:[],texture:[]};let legacyPaths=0;
   for(const mode of ['legacy','texture'])for(let i=0;i<10;i++){
    const plane={x:-127+i*3.25,y:-83+i*.75},bounds={left:-plane.x/scale,right:(width-plane.x)/scale,top:-plane.y/scale,bottom:(height-plane.y)/scale};ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.translate(plane.x,plane.y);ctx.scale(scale,scale);const start=performance.now();
    if(mode==='texture')drawHexGrid(ctx,grid,bounds,scale,'#123456',dpr);
    else{ctx.beginPath();const paths=hexGridPaths(grid,bounds,scale);legacyPaths=paths.length;for(const path of paths){ctx.moveTo(...path[0]);for(const p of path.slice(1))ctx.lineTo(...p);ctx.closePath();}ctx.strokeStyle='#123456';ctx.globalAlpha=.16;ctx.lineWidth=1/scale;ctx.stroke();ctx.globalAlpha=1;}
    if(i>=2)samples[mode].push(performance.now()-start);
    await new Promise(requestAnimationFrame);
   }
   console.log([width,height,dpr,orientation,scale].join(' '));results.push({width,height,dpr,orientation,scale,legacyVisible:legacyPaths>0,legacy:summary(samples.legacy),texture:summary(samples.texture),cache:hexGridCacheInfo()});
  }
  // World-coordinate alignment at both orientations, fractional pans, DPR 1/2.
  const alignment=[];
  for(const orientation of ['pointy','flat'])for(const dpr of [1,2]){
   canvas.width=640*dpr;canvas.height=480*dpr;const scale=.8,x=137.25,y=113.75,bounds={left:-x/scale,right:(640-x)/scale,top:-y/scale,bottom:(480-y)/scale};ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,640,480);ctx.translate(x,y);ctx.scale(scale,scale);drawHexGrid(ctx,{size:32,orientation},bounds,scale,'#123456',dpr);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let hits=0,total=0;for(let r=0;r<3;r++)for(let q=0;q<3;q++){const vertices=hexVertices(q,r,32,orientation);for(let i=0;i<6;i++){const a=vertices[i],b=vertices[(i+1)%6],px=Math.round((x+(a[0]+b[0])/2*scale)*dpr),py=Math.round((y+(a[1]+b[1])/2*scale)*dpr);if(px<2||px>=canvas.width-2||py<2||py>=canvas.height-2)continue;total++;let found=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(pixels[((py+dy)*canvas.width+px+dx)*4+3]>5)found=true;if(found)hits++;}}
   alignment.push({orientation,dpr,hits,total});
  }
  clearHexGridCache();const bounds={left:-200,right:200,top:-200,bottom:200};for(let i=0;i<80;i++)drawHexGrid(ctx,{size:32,orientation:'pointy'},bounds,.4+i*.02,'#123456',2);const cache=hexGridCacheInfo();canvas.remove();return {results,alignment,cache,note:'CPU submission times; frame presentation and GPU completion are not included'};
 });
 await mkdir('test-results/planning',{recursive:true});await writeFile('test-results/planning/hex-grid-performance.json',JSON.stringify(result,null,2));
 for(const sample of result.alignment)assert.equal(sample.hits,sample.total,JSON.stringify(sample));assert.ok(result.cache.bytes<=8*1024*1024&&result.cache.tiles<=12);
 console.log('PASS 格线两朝向世界坐标对齐、DPR 1/2、纹理缓存上限；24 组 720p/2K/4K 性能对照');
}finally{await browser.close();await server.close();}
