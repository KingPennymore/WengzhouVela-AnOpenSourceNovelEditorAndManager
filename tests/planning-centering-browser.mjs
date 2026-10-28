import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {createOutline,outlineText} from '../web/outline.mjs';
import {createMap,mapText} from '../web/map.mjs';
const server=await startSourceAppServer(),browser=await launchBrowser();
const outline=createOutline('偏离原点的大纲');outline.root='a';outline.roots=['a'];outline.nodes={a:{title:'开端',summary:'故事开端',children:['b','c'],layout:{x:4000,y:6000}},b:{title:'冲突',children:[],layout:{x:4500,y:6400}},c:{title:'结局',children:[],layout:{x:4700,y:6900}}};
const relations=createOutline('偏离原点的关系图');relations.view='relations';relations.relations={nodes:structuredClone(outline.nodes),edges:[{id:'ab',from:'a',to:'b'}]};for(const node of Object.values(relations.relations.nodes))node.children=[];
const map=createMap('偏离原点的地图');map.cells={'1000,1000':{type:'draw'},'1010,1010':{type:'draw'}};
map.generated=[{id:'g-drawing-fill',algorithm:'drawing-fill',paths:[],regions:[{id:'land',color:'#8cba9a55',paths:[[[80000,50000],[81000,50000],[81000,51000],[80000,51000],[80000,50000]]]}]}];
const doc=(id,name,text)=>({id,name,path:name,text,updatedAt:1});
const seed={version:1,documents:[doc('guide','操作指南.txt','视口测试'),doc('outline','偏移.pcs',outlineText(outline)),doc('relations','关系.pcs',outlineText(relations)),doc('map','偏移.vlmp',mapText(map)),doc('empty','空地图.vlmp',mapText(createMap()))],activeId:'guide',openIds:['guide','outline','relations','map','empty'],settings:{theme:'light',autoNouns:false}};
const errors=[];
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:850}});
  await context.addInitScript(seed=>{
    localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));localStorage.setItem('vela.test.motion','off');
    const prototype=CanvasRenderingContext2D.prototype,clear=prototype.clearRect,translate=prototype.translate,scale=prototype.scale;
    prototype.clearRect=function(...args){if(this.canvas.closest('.map-stage')){this.canvas.planningPlane={};this.canvas.planningNeedsTranslate=true;}return clear.apply(this,args);};
    prototype.translate=function(x,y){if(this.canvas.planningNeedsTranslate){this.canvas.planningPlane={x,y};this.canvas.planningNeedsTranslate=false;this.canvas.planningNeedsScale=true;}return translate.call(this,x,y);};
    prototype.scale=function(x,y){if(this.canvas.planningNeedsScale){this.canvas.planningPlane.scale=x;this.canvas.planningNeedsScale=false;}return scale.call(this,x,y);};
  },seed);
  const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));await p.goto(server.url);await p.waitForFunction(()=>window.velaReady);
  const open=async id=>{await p.evaluate(id=>document.querySelector(`[data-tab=${id}]`).click(),id);await p.waitForFunction(id=>['outline','relations'].includes(id)?!!document.querySelector('#preview:not([hidden]) .outline-plane'):!!document.querySelector('#preview:not([hidden]) canvas')?.planningPlane?.scale,id);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  for(const id of ['relations','outline']){
   await open(id);
   const centre=await p.evaluate(()=>{const surface=document.querySelector('.outline-plane').getBoundingClientRect(),cards=[...document.querySelectorAll('[data-card]')].map(card=>card.getBoundingClientRect());return {dx:(Math.min(...cards.map(r=>r.left))+Math.max(...cards.map(r=>r.right)))/2-(surface.left+surface.width/2),dy:(Math.min(...cards.map(r=>r.top))+Math.max(...cards.map(r=>r.bottom)))/2-(surface.top+surface.height/2)};});
   assert.ok(Math.abs(centre.dx)<1&&Math.abs(centre.dy)<1,JSON.stringify({id,...centre}));
  }
  const before=await p.evaluate(()=>{const surface=document.querySelector('.outline-plane'),r=surface.getBoundingClientRect();surface.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.x+30,clientY:r.y+40,cancelable:true,bubbles:true}));return document.querySelector('.outline-graph-stage').style.transform;});
  await open('map');
  const mapCentre=await p.evaluate(async()=>{const {mapBounds}=await import('/map-export.mjs'),w=JSON.parse(localStorage.getItem('wenzhou.workspace')),bounds=mapBounds(JSON.parse(w.documents.find(doc=>doc.id==='map').text)),canvas=document.querySelector('.map-stage canvas'),plane=canvas.planningPlane;return {dx:plane.x+(bounds.x+bounds.width/2)*plane.scale-canvas.clientWidth/2,dy:plane.y+(bounds.y+bounds.height/2)*plane.scale-canvas.clientHeight/2};});
  assert.ok(Math.abs(mapCentre.dx)<1&&Math.abs(mapCentre.dy)<1,JSON.stringify(mapCentre));
  const mapPlane=await p.evaluate(async()=>{const canvas=document.querySelector('.map-stage canvas'),r=canvas.getBoundingClientRect();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-50,clientX:r.x+20,clientY:r.y+30,cancelable:true,bubbles:true}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return canvas.planningPlane;});
  await open('outline');assert.equal(await p.locator('.outline-graph-stage').evaluate(node=>node.style.transform),before);
  await open('map');const restored=await p.locator('.map-stage canvas').evaluate(canvas=>canvas.planningPlane);assert.deepEqual(restored,mapPlane);
  await open('empty');const empty=await p.locator('.map-stage canvas').evaluate(canvas=>({plane:canvas.planningPlane,width:canvas.clientWidth,height:canvas.clientHeight}));assert.equal(empty.plane.scale,1);assert.equal(empty.plane.x,empty.width/2);assert.equal(empty.plane.y,empty.height/2);
  const saved=await p.evaluate(()=>{window.wenzhouSave();return JSON.parse(localStorage.getItem('wenzhou.workspace')).documents;});for(const source of seed.documents)assert.equal(saved.find(doc=>doc.id===source.id).text,source.text,'viewport changes must not rewrite file content');
  console.log('PASS '+width+'px 首次居中、填充区域边界、手动缩放与切换恢复、空图中心');await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
