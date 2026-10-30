import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';

const out='test-results/startup-content';await mkdir(out,{recursive:true});
const server=await startSourceAppServer(),browser=await launchBrowser(),checks=[],errors=[];
try{
 for(const width of [320,390,1280])for(const home of [false,true]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(({home,width})=>{
   localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'book',name:home?'航程.txt':'操作指南.txt',path:home?'航程.txt':'操作指南.txt',text:'第一章 起航\n\n海风吹过港湾。',updatedAt:1}],activeId:'book',openIds:['book'],settings:{theme:'dark',palette:'wheat',autoNouns:false,libraryOpen:true}}));
   window.contentBeforeLogoGone=false;window.startupSnapshots=[];window.continueStartup=()=>{for(const animation of document.getAnimations())if(/^vela-(layout|logo)/.test(animation.animationName))animation.play();};
   const state=()=>{const phase=document.documentElement.dataset.startup;
    if(document.querySelector('#startup-screen')&&(document.querySelector('.cm-editor')||document.querySelector('#start-page')?.children.length))window.contentBeforeLogoGone=true;
    if(!['assembling','finishing'].includes(phase)||startupSnapshots.some(item=>item.phase===phase))return;
    const selector=phase==='assembling'?'.topbar':'.startup-brand',name=phase==='assembling'?'vela-layout-top':'vela-logo-exit';
    for(const animation of document.querySelector(selector).getAnimations())if(animation.animationName===name){animation.pause();animation.currentTime=phase==='assembling'?260:60;}
    const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
    window.startupSnapshots.push({phase,paper:getComputedStyle(document.querySelector('#editor')).visibility,skipped:getComputedStyle(document.querySelector('#editor')).contentVisibility,sidebar:getComputedStyle(document.querySelector('#library-shell')).visibility,tabs:getComputedStyle(document.querySelector('.file-rowbar')).visibility,top:rect('.topbar'),footer:rect('#writing-footer'),topVisible:getComputedStyle(document.querySelector('.topbar')).visibility,footerVisible:getComputedStyle(document.querySelector('#writing-footer')).visibility,themeShift:document.documentElement.classList.contains('theme-shift'),editors:document.querySelectorAll('.cm-editor').length,homeChildren:document.querySelector('#start-page').children.length});
   };new MutationObserver(state).observe(document,{subtree:true,attributes:true,childList:true,attributeFilter:['data-startup']});
  },{home,width});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url+'/?ui=android');
  await page.waitForFunction(()=>startupSnapshots.some(item=>item.phase==='assembling'));
  const chrome=await page.evaluate(()=>startupSnapshots[0]);assert.equal(chrome.themeShift,false);assert.equal(chrome.paper,'hidden');assert.equal(chrome.skipped,'hidden');assert.equal(chrome.sidebar,width>600?'visible':'hidden');const stages=await page.evaluate(()=>['.topbar','.file-rowbar','#writing-footer>.quickbar','.statusbar'].map(selector=>{const style=getComputedStyle(document.querySelector(selector));return {delay:parseFloat(style.animationDelay)||0,duration:parseFloat(style.animationDuration)||0};}));assert.equal(stages[0].delay,0);assert.ok(stages[1].delay>stages[0].delay);if(!home){assert.ok(stages[2].delay>stages[1].delay);if(await page.locator('#writing-footer>.statusbar').count())assert.ok(stages[3].delay>stages[2].delay);else{assert.equal(await page.locator('.statusbar').evaluate(el=>el.parentElement.id),'write-view');assert.equal(stages[3].duration,0);}}assert.equal(chrome.tabs,'visible');assert.ok(await page.locator('#doc-list').evaluate(el=>el.children.length)>0);assert.equal(chrome.topVisible,'visible');assert.equal(chrome.editors,0);assert.equal(chrome.homeChildren,0);if(!home)assert.equal(chrome.footerVisible,'visible');
  await page.screenshot({path:`${out}/${width}-${home?'home':'document'}-logo-chrome.png`});await page.evaluate(()=>continueStartup());
  await page.waitForFunction(()=>startupSnapshots.some(item=>item.phase==='finishing'));
  const finishing=await page.evaluate(()=>startupSnapshots.at(-1));assert.equal(finishing.paper,'hidden');assert.equal(finishing.editors,0);assert.equal(finishing.homeChildren,0);await page.screenshot({path:`${out}/${width}-${home?'home':'document'}-logo-exit.png`});await page.evaluate(()=>continueStartup());
  await page.waitForFunction(()=>window.velaReady);assert.equal(await page.locator('#startup-screen').count(),0);if(width<=600)assert.equal(await page.evaluate(()=>document.body.classList.contains('show-library')),false,'narrow startup must not auto-open the file sidebar');assert.equal(await page.evaluate(()=>contentBeforeLogoGone),false);assert.equal(await page.locator('.writing-layout').evaluate(el=>getComputedStyle(el).visibility),'visible');
  if(home)assert.ok(await page.locator('#start-page').evaluate(el=>el.children.length)>0);else assert.equal(await page.locator('.cm-editor').count(),1);
  const final=await page.evaluate(()=>({top:document.querySelector('.topbar').getBoundingClientRect().toJSON(),footer:document.querySelector('#writing-footer').getBoundingClientRect().toJSON()}));
  for(const key of ['x','y','width','height']){assert.ok(Math.abs(chrome.top[key]-final.top[key])<1,'topbar '+key);if(!home)assert.ok(Math.abs(chrome.footer[key]-final.footer[key])<1,'footer '+key);}
  await page.screenshot({path:`${out}/${width}-${home?'home':'document'}-content.png`});checks.push(`${width}px ${home?'home':'document'}: document chrome visible through logo exit, deferred body creation, stable geometry`);console.log('PASS '+checks.at(-1));await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
