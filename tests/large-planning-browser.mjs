import {editorAction} from './mobile-editor-helper.mjs';
import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {createOutline,outlineText} from '../web/outline.mjs';
import {createMap,mapText} from '../web/map.mjs';
import {outlinePositions} from '../web/outline-layout.mjs';
const o=createOutline('大型大纲');o.root='n0';o.roots=['n0'];
for(let i=0;i<5000;i++){o.nodes['n'+i]={title:'节点'+i,summary:'剧情概要',detail:'## 场景\n\n节点的场景详情。',children:[]};if(i)o.nodes['n'+Math.floor((i-1)/4)].children.push('n'+i);}
const lastNode=Object.keys(outlinePositions(o)).at(-1);
const r=createOutline('大型关系图');r.view='relations';for(let i=0;i<400;i++){r.relations.nodes['r'+i]={title:'人物'+i,children:[]};for(let j=1;j<=2;j++)r.relations.edges.push({id:`e${i}-${j}`,from:'r'+i,to:'r'+((i+j)%400)});}
const m=createMap('后台填充');for(let i=0;i<20000;i++)m.cells[(i%200)+','+Math.floor(i/200)]={type:'draw'};
const doc=(id,name,text)=>({id,name,path:name,text,updatedAt:1});
const seed={version:1,activeId:'guide',openIds:['guide','o','r','m'],documents:[doc('guide','操作指南.txt','正文'),doc('o','大型.pcs',outlineText(o)),doc('r','关系.pcs',outlineText(r)),doc('m','地图.vlmp',mapText(m))],settings:{theme:'light',autoNouns:false}};
const server=await startSourceAppServer(),browser=await launchBrowser();
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:850}}),errors=[];
  await context.addInitScript(({seed,mapText})=>{
   localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));localStorage.setItem('vela.test.motion','off');
   window.largeProbe={mapParses:0,live:new Set(),starts:0};const parse=JSON.parse;JSON.parse=function(text,...args){if(text===mapText)largeProbe.mapParses++;return parse.call(this,text,...args);};
   const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);if(String(args[0]).includes('map-fill-worker')){largeProbe.live.add(this);largeProbe.starts++;}}terminate(){largeProbe.live.delete(this);super.terminate();}};
  },{seed,mapText:seed.documents.find(d=>d.id==='m').text});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);
  const open=async id=>{await page.locator(`[data-tab=${id}]`).click();await page.waitForFunction(id=>document.querySelector('#current-name')?.textContent===({o:'大型.pcs',r:'关系.pcs',m:'地图.vlmp',guide:'操作指南.txt'})[id],id);if(id==='o'||id==='r')await page.locator('.outline-large-plane').waitFor();if(id==='m')await page.locator('.map-stage canvas').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  await open('o');assert.equal(await page.locator('.outline-graph').getAttribute('data-graph-level'),'overview');assert.equal(await page.locator('[data-card]').count(),0);assert.equal(await page.locator('#editor .vela-numbered-line').count(),0,'preview must not initialize source gutters');
  const text=await page.evaluate(()=>velaEditorView.state.doc.toString());assert.equal(text,seed.documents.find(d=>d.id==='o').text,'plugins retain access to the full text state');
  await page.locator('.outline-plane').focus();await page.keyboard.press('ArrowUp');await page.waitForSelector(`[data-card=${lastNode}]`);await page.locator('.outline-plane').focus();await page.keyboard.press('ArrowDown');await page.waitForSelector('[data-card=n0]');assert.ok(await page.locator('[data-card]').count()<=300);await page.locator('.outline-detail [data-close]').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const node=page.locator('[data-node=n0]'),box=await node.boundingBox();
  await page.evaluate(()=>{window.edgeMutations=[];window.edgeObserver=new MutationObserver(records=>edgeMutations.push(...records.map(r=>({type:r.type,attribute:r.attributeName}))));edgeObserver.observe(document.querySelector('.outline-lines'),{subtree:true,childList:true,attributes:true});});
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+15,{steps:3});
  const mutations=await page.evaluate(()=>{edgeObserver.disconnect();return edgeMutations;});assert.ok(mutations.some(r=>r.attribute==='d'));assert.ok(mutations.every(r=>r.type==='attributes'),'dragging updates existing incident paths');await page.mouse.up();
  await page.locator('[data-node=n0]').click();await page.locator('.outline-detail input[name=title]').fill('优化后的节点');await page.locator('.outline-detail button[type=submit]').click();
  const title=()=>page.evaluate(()=>JSON.parse(velaEditorView.state.doc.toString()).nodes.n0.title);assert.equal(await title(),'优化后的节点');
  await page.locator('#quick-undo').click();assert.equal(await title(),'节点0');await page.locator('#quick-redo').click();assert.equal(await title(),'优化后的节点');
  await editorAction(page,'[data-display=source]');await page.locator('#editor:not([hidden]) .vela-numbered-line').first().waitFor();assert.equal(await title(),'优化后的节点');
  await editorAction(page,'[data-display=preview]');await page.locator('.outline-large-plane').waitFor();assert.equal(await page.locator('#editor .vela-numbered-line').count(),0);
  await open('r');assert.equal(await page.locator('.outline-graph').getAttribute('data-graph-level'),'overview');await page.locator('.outline-plane').focus();await page.keyboard.press('ArrowDown');await page.locator('[data-card]').first().waitFor();assert.ok(await page.locator('[data-card]').count()<=300);
  await open('m');assert.equal(await page.evaluate(()=>largeProbe.mapParses),1);await open('guide');assert.equal(await page.evaluate(()=>largeProbe.live.size),0,'leaving stops fill workers');
  await open('m');assert.equal(await page.evaluate(()=>largeProbe.mapParses),1,'returning reuses validated map data');await page.waitForFunction(()=>largeProbe.live.size===0&&largeProbe.starts>0,null,{timeout:30000});
  await page.evaluate(()=>wenzhouSave());const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));assert.equal(stored.documents.find(d=>d.id==='m').text,seed.documents.find(d=>d.id==='m').text,'background preview does not write the file');
  await open('guide');assert.equal(await page.evaluate(()=>largeProbe.live.size),0);assert.deepEqual(errors,[]);console.log('PASS '+width+'px 大图分级、键盘、局部连线、编辑撤销、源码与后台填充取消');await context.close();
 }
}finally{await browser.close();await server.close();}
