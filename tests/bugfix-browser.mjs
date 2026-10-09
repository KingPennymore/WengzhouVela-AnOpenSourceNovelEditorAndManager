import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {glossaryText} from '../web/glossary.mjs';
import {mkdir} from 'node:fs/promises';
const config=createVelaV2('回归验证');config.editor.glossaries=['词条.gly'];config.reader={mode:'pages',titlePage:false};config.reading.items=[{path:'正文.txt'}];
const text='　　第一章 航程\n'+('海风吹过灯塔，林舟继续远航。\n'.repeat(180))+'\n  第二章 归来\n'+('灯火照亮港湾。\n'.repeat(70));
const entries=Array.from({length:85},(_,i)=>({term:'术语'+i,definition:'解释'.repeat(10),aliases:['Alias'+i]}));entries[0]={term:'林舟',definition:'航海记录者',category:'人物',aliases:['船长']};
const seed={version:1,activeId:'book',openIds:['book'],settings:{glossaryPanel:true,theme:'light'},documents:[{id:'book',name:'正文.txt',text,updatedAt:1},{id:'config',name:'.vela',text:velaText(config),updatedAt:2},{id:'terms',name:'词条.gly',text:glossaryText({version:1,entries}),updatedAt:3},{id:'long',name:'很长的文件名称'.repeat(12)+'.txt',path:'很长的文件夹名称'.repeat(15)+'/长篇小说.txt',text:'正文',updatedAt:4}]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
await mkdir('test-results/bugfix',{recursive:true});
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:850}});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173/');await page.locator('[data-recent=book]').click();
  const search=page.locator('#glossary-panel input');await search.click();await search.pressSequentially('船长');assert.equal(await search.inputValue(),'船长');assert.equal(await page.locator('.glossary-panel-rows>button').count(),1);assert.match(await page.locator('.glossary-panel-rows').textContent(),/林舟/);
  await search.fill('Alias84');assert.equal(await page.locator('.glossary-panel-rows>button').count(),1);await search.fill('不存在');assert.equal(await page.locator('.glossary-panel-rows>button').count(),0);await search.fill('');
  const before=await search.boundingBox();await page.locator('.glossary-panel-rows').evaluate(el=>el.scrollTop=el.scrollHeight);const after=await search.boundingBox();assert.equal(after.y,before.y);assert.ok(await search.isVisible());
  await page.locator('#outline-toggle').click();await page.locator('#outline-list [data-row]').last().click();assert.equal(await page.locator('#outline-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('#mobile-library').click();assert.equal(await page.locator('#outline-toggle').getAttribute('aria-expanded'),'false');await page.locator('#mobile-library').click();await page.locator('#outline-toggle').click();await page.locator('.cm-content').click();await page.keyboard.type('新增');assert.equal(await page.locator('#outline-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#outline-toggle').evaluate(el=>el.parentElement.className),'global-tools');await page.locator('#more-tools').click();assert.ok(await page.locator('#toolbar-overflow #settings').isVisible());await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+h');await page.locator('#mobile-library').click();await page.waitForTimeout(350);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const bounds=await page.locator('.recent-files>button>div').evaluateAll(elements=>elements.map(el=>({right:el.getBoundingClientRect().right,parent:el.parentElement.getBoundingClientRect().right,overflow:getComputedStyle(el).overflow})));assert.ok(bounds.every(b=>b.right<=b.parent+1&&b.overflow==='hidden'));await page.screenshot({path:`test-results/bugfix/home-${width}.png`});
  await page.locator('[data-recent=terms]').click();assert.equal(await page.locator('.glossary-preview textarea').first().evaluate(el=>getComputedStyle(el).resize),'vertical');await page.keyboard.press('Control+Alt+h');await page.locator('[data-recent=config]').click();assert.ok((await page.locator('.vela-preview textarea').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).resize))).every(value=>value==='vertical'));
  await page.locator('[data-view=reader]').click();await page.locator('[data-read=book]').click();await page.waitForTimeout(450);
  assert.equal(await page.locator('.reader-indented-title').count(),2);assert.equal(await page.locator('.reader-indented-title').first().evaluate(el=>getComputedStyle(el).breakAfter),'column');
  await page.locator('.reader-viewport').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.reader-page-overlay').count(),1);await page.waitForTimeout(400);assert.equal(await page.locator('.reader-page-overlay').count(),0);await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.reader-page-incoming').evaluate(el=>el.style.zIndex),'6');await page.waitForTimeout(400);
  await page.locator('#reader-outline-action').click();await page.locator('[data-reader-offset]').last().click();assert.ok(await page.locator('.reader-outline').isVisible());
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.reader-viewport').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.reader-page-overlay').count(),0);
  await page.screenshot({path:`test-results/bugfix/reader-${width}.png`});assert.deepEqual(errors,[]);await context.close();console.log('PASS search, pinned header, outline, menu, clipping, resizing, title page and cover animation at '+width);
 }
}finally{await browser.close();}
