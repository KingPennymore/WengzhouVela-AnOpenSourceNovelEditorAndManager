import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
const server=await startSourceAppServer(),browser=await launchBrowser();
const errors=[],checks=[],timings=[];
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const text=Array.from({length:1400},(_,i)=>i%70===0?`第${i/70+1}章 风起`:`　　林舟望着远处的灯塔，风吹过书页。这是第${i}段。`).join('\n');
const seed={version:1,activeId:null,openIds:Array.from({length:8},(_,i)=>'book'+i),folders:['小说','笔记'],settings:{theme:'light',autoNouns:false},documents:[...Array.from({length:8},(_,i)=>({id:'book'+i,name:`正文${i}.txt`,path:`小说/正文${i}.txt`,text,updatedAt:1})),{id:'config',name:'.vela',path:'小说/.vela',text:JSON.stringify({version:3,kind:'workspace',id:'novel',project:{name:'小说'}}),updatedAt:1},{id:'note',name:'记录.txt',path:'笔记/记录.txt',text:'笔记',updatedAt:1}]};
try{
 const context=await browser.newContext({viewport:{width:1280,height:850}});
 await context.addInitScript(seed=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));window.workspaceWrites=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='wenzhou.workspace'){window.workspaceWrites++;if(window.rejectWorkspaceSave)throw Error('模拟保存失败');}return set.call(this,key,value);};},seed);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);await openRecentFile(p,p.locator('[data-recent=book0]'));await p.waitForSelector('.cm-editor');await p.waitForFunction(async()=>JSON.parse(await (await import('/platform.mjs')).readWorkspaceAsync()).activeId==='book0');
 await check('已有标签切换只更新选中态，复用全部标签与文件节点且不在点击中写盘',async()=>{
  const result=await p.evaluate(async()=>{
   const tabs=[...document.querySelectorAll('.document-tab')],files=[...document.querySelectorAll('#doc-list .doc-item')],durations=[];let syncWrites=0;
   for(const id of ['book1','book2','book0','book1','book2','book0']){const before=workspaceWrites,start=performance.now();document.querySelector(`[data-tab=${id}]`).click();durations.push(performance.now()-start);syncWrites+=workspaceWrites-before;await new Promise(requestAnimationFrame);}
   return {durations,writes:syncWrites,tabs:tabs.every((node,i)=>node===document.querySelectorAll('.document-tab')[i]),files:files.every((node,i)=>node===document.querySelectorAll('#doc-list .doc-item')[i]),selected:document.querySelector('[role=tab][aria-selected=true]').dataset.tab};
  });timings.push(result.durations);assert.equal(result.tabs,true);assert.equal(result.files,true);assert.equal(result.writes,0);assert.equal(result.selected,'book0');
 });
 for(const width of [1280,390])await check(`${width}px 首帧前阻塞280ms及无尺寸变化的viewport事件不吞掉侧栏动画`,async()=>{
  await p.setViewportSize({width,height:850});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const result=await p.evaluate(async()=>{
   const app=document.querySelector('#app'),button=document.querySelector('#mobile-library');if(button.getAttribute('aria-expanded')==='true'){button.click();await new Promise(resolve=>setTimeout(resolve,400));}
   button.click();const end=performance.now()+280;while(performance.now()<end){}window.visualViewport?.dispatchEvent(new Event('scroll'));
   const samples=[];do{await new Promise(requestAnimationFrame);samples.push(parseFloat(app.style.getPropertyValue('--left-size')));}while(app.dataset.sidebarsAnimating==='true');
   return samples;
  });if(width>600){assert.ok(result.length>=5,JSON.stringify(result));assert.equal(result[0],0);assert.ok(result.some(n=>n>0&&n<result.at(-1)));}else{assert.ok(result.every(n=>n===0),'phone drawer does not squeeze the editor');assert.equal(await p.locator('#library-shell').evaluate(el=>el.inert),false);}await p.evaluate(()=>document.querySelector('#mobile-library').click());await p.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');
 });
 await check('关闭再打开侧栏复用文件节点并保留文件夹折叠状态',async()=>{
  const result=await p.evaluate(async()=>{const folder=document.querySelector('summary[data-folder="小说"]').parentElement,tab=document.querySelector('[data-tab=book0]'),file=document.querySelector('[data-doc=book0]');folder.open=false;document.querySelector('#mobile-library').click();await new Promise(resolve=>setTimeout(resolve,400));document.querySelector('#mobile-library').click();return {folder:folder===document.querySelector('summary[data-folder="小说"]').parentElement,open:folder.open,tab:tab===document.querySelector('[data-tab=book0]'),file:file===document.querySelector('[data-doc=book0]')};});assert.deepEqual(result,{folder:true,open:false,tab:true,file:true});
 });
 await check('修改标记不触发标签入场动画；保存失败阻止切换并保留正文',async()=>{
  const result=await p.evaluate(()=>{const v=velaEditorView,tab=document.querySelector('[data-tab=book0]').closest('.document-tab');v.dispatch({changes:{from:0,insert:'修改内容\n'},userEvent:'input'});window.rejectWorkspaceSave=true;document.querySelector('[data-tab=book1]').click();return {active:document.querySelector('[role=tab][aria-selected=true]').dataset.tab,text:v.state.doc.toString().startsWith('修改内容'),animated:tab.classList.contains('tab-enter'),message:document.querySelector('#save-state').textContent};});assert.equal(result.active,'book0');assert.equal(result.text,true);assert.equal(result.animated,false);assert.match(result.message,/保存失败/);await p.evaluate(()=>{window.rejectWorkspaceSave=false;window.wenzhouSave();});
 });
 await check('关闭当前标签移除节点，其余标签保持身份；pagehide及时保存导航与位置',async()=>{
  const result=await p.evaluate(()=>{const other=document.querySelector('[data-tab=book2]');document.querySelector('[data-close=book0]').click();const selected=document.querySelector('[role=tab][aria-selected=true]').dataset.tab;velaEditorView.dispatch({selection:{anchor:100}});document.querySelector('[data-tab=book2]').click();window.dispatchEvent(new Event('pagehide'));const saved=JSON.parse(localStorage.getItem('wenzhou.workspace'));return {removed:!document.querySelector('[data-tab=book0]'),same:other===document.querySelector('[data-tab=book2]'),selected,saved:saved.activeId,open:saved.openIds,positions:saved.documents.some(d=>d.name==='.vela'&&d.text.includes('positions'))};});assert.equal(result.removed,true);assert.equal(result.same,true);assert.equal(result.selected,'book1');assert.equal(result.saved,'book2');assert.ok(!result.open.includes('book0'));assert.equal(result.positions,true);
 });
 await check('重启恢复已有标签时初始化页面状态并显示桌面底栏',async()=>{await p.setViewportSize({width:1280,height:850});await p.evaluate(()=>{window.wenzhouSave();const saved=JSON.parse(localStorage.getItem('wenzhou.workspace'));saved.documents.push({id:'guide',name:'操作指南.txt',path:'操作指南.txt',text:'用户保留的说明',updatedAt:1});localStorage.setItem('wenzhou.workspace',JSON.stringify(saved));});await p.reload();await p.waitForSelector('.cm-editor');assert.equal(await p.locator('body').getAttribute('data-page'),'write');await p.locator('#quick-git').waitFor({state:'visible'});assert.equal(await p.locator('[role=tab][aria-selected=true]').getAttribute('data-tab'),'book2');});
 await check('减少动态效果时侧栏立即到达终态',async()=>{await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.evaluate(()=>{document.querySelector('#mobile-library').click();return document.querySelector('#app').dataset.sidebarsAnimating;}),'false');});
 assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/navigation-performance.json',JSON.stringify({checks,timings,errors},null,2));
}finally{await browser.close();await server.close();}
