import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[],errors=[],samples=[];
await mkdir('test-results',{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
function attached(frames){
  assert.ok(frames.length>0);
  for(const frame of frames){assert.ok(Math.abs(frame.paperLeft-frame.libraryRight)<.8,JSON.stringify(frame));assert.ok(Math.abs(frame.paperRight-frame.outlineLeft)<.8,JSON.stringify(frame));const minimum=frame.width<=600?Math.min(frame.width,Math.max(160,frame.width*.4)):Math.min(240,Math.max(96,frame.width*.25));assert.ok(frame.paperWidth>=minimum-1,JSON.stringify(frame));assert.ok(frame.scrollWidth<=frame.width+1,JSON.stringify(frame));}
  samples.push(...frames);
}
async function animate(id){const frames=await page.evaluate(async id=>{
  const frames=[];document.querySelector('#'+id).click();frames.push(window.__sidebarGeometry());
  do{await new Promise(requestAnimationFrame);frames.push(window.__sidebarGeometry());}while(document.querySelector('#app').dataset.sidebarsAnimating==='true');
  return frames;
},id);attached(frames);assert.ok(frames.length>=3,'动画必须覆盖多个可见帧');return frames;}
try{
  await page.addInitScript(()=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'book',name:'航程.txt',path:'航程.txt',text:'第一章 航程\n正文。',updatedAt:1}],activeId:null,openIds:[],settings:{theme:'light'}}));});await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
  await page.evaluate(()=>{window.__sidebarGeometry=()=>{const paper=document.querySelector('.paper').getBoundingClientRect(),left=document.querySelector('#library').getBoundingClientRect(),right=document.querySelector('#outline').getBoundingClientRect();return {paperLeft:paper.left,paperRight:paper.right,paperWidth:paper.width,libraryRight:left.right,outlineLeft:right.left,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,time:performance.now()};};});
  for(const width of [1440,800])await check(`${width}px 下左右侧栏展开、同时显示和收起的每帧边界与正文贴合`,async()=>{
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await animate('mobile-library');
    await animate('outline-toggle');
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('show-library')&&el.classList.contains('show-outline')),true);
    const header=await page.locator('#mobile-library').boundingBox();assert.ok(header.x>=0&&header.x+header.width<=width);
    await page.screenshot({path:`test-results/sidebars-042-${width}.png`});
    await animate('mobile-library');
    await animate('close-outline');
    assert.equal(await page.locator('#library').isVisible(),false);assert.equal(await page.locator('#outline').isVisible(),false);
  });
  await check('动画中途反向切换不跳动，连续点击后状态、边界与焦点恢复正确',async()=>{
    for(const id of ['mobile-library','outline-toggle']){
      const result=await page.evaluate(async id=>{
        const frames=[],button=document.querySelector('#'+id);button.click();
        for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);frames.push(window.__sidebarGeometry());}
        const before=window.__sidebarGeometry();button.click();const after=window.__sidebarGeometry();
        do{await new Promise(requestAnimationFrame);frames.push(window.__sidebarGeometry());}while(document.querySelector('#app').dataset.sidebarsAnimating==='true');
        return {before,after,frames};
      },id);
      attached(result.frames);assert.equal(result.before.paperLeft,result.after.paperLeft);assert.equal(result.before.paperRight,result.after.paperRight);
    }
    await page.evaluate(()=>{const button=document.querySelector('#mobile-library');button.click();button.click();button.click();});await page.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');
    assert.equal(await page.locator('#mobile-library').getAttribute('aria-expanded'),'true');attached([await page.evaluate(()=>window.__sidebarGeometry())]);
    await page.locator('#new-doc').focus();await animate('mobile-library');assert.equal(await page.locator('#library-shell').evaluate(el=>el.inert),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#library-shell')),false);
  });
  await check('窗口尺寸变化和沉浸模式切换保持两侧贴合，文件侧栏状态不受影响',async()=>{
    await animate('mobile-library');await animate('outline-toggle');
    for(const width of [1440,1000,800]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');attached([await page.evaluate(()=>window.__sidebarGeometry())]);}
    await animate('focus-toggle');assert.equal(await page.locator('#outline').isVisible(),false);assert.equal(await page.locator('#library').isVisible(),true);
    await animate('focus-toggle');assert.equal(await page.locator('#outline').isVisible(),true);
    await animate('close-outline');await animate('mobile-library');
  });
  await check('减少动态效果时即时完成两侧布局，不启动滑动动画',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const id of ['mobile-library','outline-toggle','close-outline','mobile-library']){await page.evaluate(id=>document.querySelector('#'+id).click(),id);assert.equal(await page.locator('#app').getAttribute('data-sidebars-animating'),'false');attached([await page.evaluate(()=>window.__sidebarGeometry())]);}
    assert.equal(await page.locator('#library').isVisible(),false);assert.equal(await page.locator('#outline').isVisible(),false);
  });
  assert.deepEqual(errors,[]);await writeFile('test-results/sidebars-042-results.json',JSON.stringify({passed:checks.length,checks,sampledFrames:samples.length,maxLeftGap:Math.max(...samples.map(s=>Math.abs(s.paperLeft-s.libraryRight))),maxRightGap:Math.max(...samples.map(s=>Math.abs(s.paperRight-s.outlineLeft))),pageErrors:errors},null,2));
}catch(error){await page.screenshot({path:'test-results/sidebars-042-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();await server.close();}
