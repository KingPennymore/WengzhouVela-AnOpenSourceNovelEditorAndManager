import assert from 'node:assert/strict';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {noMotion} from './wait-helpers.mjs';
import {createMap,mapText} from '../web/map.mjs';

// Brush strokes, erasing and range changes take partial snapshots; undo and redo must still restore the drawing fill they recompute.
const doc=(id,name,text)=>({id,name,path:name,text,updatedAt:1}),seed={version:1,documents:[doc('map','北境.vlmp',mapText(createMap('北境'))),doc('book','a.txt','正文')],activeId:'book',openIds:['book'],settings:{theme:'light'}};
const server=process.env.VELA_TEST_URL?null:await startSourceAppServer(),browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1280,height:850}}),errors=[];
await noMotion(context);await context.addInitScript(seed=>{if(window===window.top&&!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(d=>d.id==='map').text));
const fill=s=>JSON.stringify(s.generated.find(g=>g.id==='g-drawing-fill')||null),settle=()=>p.waitForTimeout(400),cells=s=>Object.keys(s.cells).length;
const drag=async(box,from,to)=>{await p.mouse.move(box.x+from,box.y+100);await p.mouse.down();for(let x=from+10;x<=to;x+=10)await p.mouse.move(box.x+x,box.y+100+(x-from)/3);await p.mouse.up();await settle();};
const undo=async()=>{await p.locator('#quick-undo').click();await settle();return state();},redo=async()=>{await p.locator('#quick-redo').click();await settle();return state();};
try{
 await p.goto((server?.url||process.env.VELA_TEST_URL)+'/?ui=harmonyos');await p.waitForSelector('#start-page:visible, .cm-editor');
 if(!await p.locator('#start-page').isVisible()){await p.locator('#current-name').click();await p.keyboard.press('Control+Alt+h');}
 await openRecentFile(p,p.locator('[data-recent="map"]'));await p.waitForSelector('.map-stage canvas');
 const canvas=p.locator('.map-stage canvas'),box=await canvas.boundingBox();
 await p.locator('[data-tool=draw]').click();await canvas.click({position:{x:150,y:100}});await p.locator('.planning-sheet [name=distance]').waitFor();await p.locator('.planning-sheet button.primary').click();await settle();
 const one=await state();await drag(box,200,360);
 const stroked=await state();assert.ok(cells(stroked)>cells(one)+3,'stroke draws cells');assert.notEqual(fill(stroked),fill(one),'fill follows the stroke');
 let s=await undo();assert.deepEqual(s.cells,one.cells);assert.equal(fill(s),fill(one),'undoing a stroke restores the fill');
 s=await redo();assert.deepEqual(s.cells,stroked.cells);assert.equal(fill(s),fill(stroked));
 const distance=p.locator('.planning-sheet [name=distance]');await p.locator('[data-range]').click();await distance.waitFor();await distance.fill('1.5');await distance.dispatchEvent('input');await p.locator('.planning-sheet button.primary').click();await settle();
 const ranged=await state();assert.notEqual(ranged.drawing?.distance,stroked.drawing?.distance);assert.notEqual(fill(ranged),fill(stroked),'fill follows the range');
 s=await undo();assert.equal(s.drawing?.distance,stroked.drawing?.distance);assert.equal(fill(s),fill(stroked),'undoing a range change restores the fill');
 s=await redo();assert.equal(fill(s),fill(ranged));
 await p.locator('[data-tool=delete]').click();await drag(box,200,300);
 assert.ok(cells(await state())<cells(ranged),'erasing removes cells');
 s=await undo();assert.deepEqual(s.cells,ranged.cells);assert.equal(fill(s),fill(ranged),'undoing an erase restores the fill');
 await p.locator('[data-tool=draw]').click();await p.mouse.move(box.x+500,box.y+300);await p.mouse.down();await p.mouse.move(box.x+540,box.y+320);await p.mouse.move(box.x+580,box.y+340);
 await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await p.mouse.up();await settle();
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('*')].find(e=>e.mapHistoryDepth).mapHistoryDepth()),{undo:3,redo:1},'a cancelled stroke records nothing');
 await canvas.click({position:{x:900,y:600}});await settle();assert.equal(Object.keys((await state()).cells).filter(key=>!ranged.cells[key]).length,1,'a cancelled stroke leaves no cells behind');
 assert.deepEqual(errors,[]);console.log('PASS 笔刷绘制/擦除/取消与绘制范围的部分快照撤销重做（含填充）');
}finally{await browser.close();await server?.close?.();}
