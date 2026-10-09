import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createVelaV2,velaText} from '../web/vela.mjs';
const out='test-results/mobile-shell';await mkdir(out,{recursive:true});
const config=createVelaV2('航程');config.reading.items=[{path:'航程.txt'}];
const seed={version:1,documents:[{id:'book',name:'航程.txt',path:'航程/航程.txt',text:'第一章 航程\n'+('海风吹过港湾，远处的灯塔照亮航路。\n'.repeat(80)),updatedAt:1},{id:'config',name:'.vela',path:'航程/.vela',text:velaText(config),updatedAt:1}],activeId:'book',openIds:['book','config'],settings:{theme:'system',readingMode:'pages'}};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[],errors=[];
try{
 for(const width of [320,360,390,411]){
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:'light'});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173/?ui=android');if(await page.locator('#start-page').isVisible())await page.locator('[data-recent=book]').click();
  const metrics=await page.evaluate(()=>{const bar=document.querySelector('.quickbar'),top=document.querySelector('.topbar');return {top:top.getBoundingClientRect().height,scroll:bar.scrollWidth,width:bar.clientWidth,buttons:[...bar.querySelectorAll('button')].map(b=>({rect:b.getBoundingClientRect().toJSON(),icon:!!b.querySelector('svg'),label:b.getAttribute('aria-label')}))};});
  assert.ok(metrics.top<=56);assert.ok(metrics.scroll<=metrics.width);assert.equal(metrics.buttons.length,8);for(const b of metrics.buttons){assert.ok(b.rect.left>=0&&b.rect.right<=width);assert.ok(b.icon&&b.label);}
  await page.locator('#more-tools').click();for(const id of ['search-editor','outline-toggle','theme','focus-toggle'])assert.ok(await page.locator('#toolbar-overflow #'+id).isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#preview-toggle').count(),0);
  await page.locator('#more-tools').click();assert.ok(await page.locator('#theme .menu-label').isVisible());await page.locator('#theme').click();await page.locator('#more-tools').click();assert.ok(await page.locator('#theme .menu-label').isVisible());await page.keyboard.press('Escape');await page.locator('#settings').click();await page.waitForTimeout(420);const sheet=await page.locator('#dialog').boundingBox();assert.ok(Math.abs(sheet.height-844*2/3)<2);assert.ok(Math.abs(sheet.y+sheet.height-844)<2);
  assert.equal(await page.locator('#dialog').evaluate(e=>getComputedStyle(e).animationName),'settings-rise');await page.locator('[name=language]').selectOption('en');await page.locator('#dialog-submit').click();await page.locator('#settings').click();await page.locator('[name=language]').selectOption('zh-CN');await page.locator('#dialog-submit').click();
  if(width===390){await page.locator('#settings').click();await page.waitForTimeout(220);await page.screenshot({path:out+'/settings.png'});await page.locator('#dialog-cancel').click();}
  await page.keyboard.press('Control+Alt+h');assert.ok(!(await page.locator('#start-page').textContent()).includes('开源小说创作'));await page.locator('[data-recent=config]').click();await page.waitForSelector('#vela-form');await page.keyboard.press('Control+Shift+p');assert.ok(await page.locator('#editor').isVisible());await page.keyboard.press('Control+Shift+p');await page.waitForSelector('#vela-form');
  const before=await page.locator('.vela-sections').boundingBox();await page.locator('.vela-config-grid').evaluate(e=>e.scrollTop=500);const after=await page.locator('.vela-sections').boundingBox();assert.ok(Math.abs(after.y-before.y)<1);
  assert.ok(await page.locator('.vela-sections').evaluate(e=>document.elementFromPoint(e.getBoundingClientRect().left+12,e.getBoundingClientRect().top+12).closest('.vela-sections')===e));
  await page.locator('[data-vela-section="阅读排版"]').click();await page.locator('#vela-form [name=fontSize]').fill('20');await page.locator('#vela-form footer button.primary').click();assert.equal(await page.locator('#vela-error').textContent(),'');
  if(width===390)await page.screenshot({path:out+'/config.png'});
  await page.locator('[data-view=reader]').click();assert.ok(!(await page.locator('.reader-library header').textContent()).includes('开源小说创作'));await page.locator('[data-read=book]').click();await page.waitForTimeout(250);
  await page.evaluate(width=>window.dispatchEvent(new CustomEvent('wenzhouEnvironment',{detail:{platform:'android',top:32,bottom:24,left:0,right:0,cutouts:[{left:width/2-16,top:0,right:width/2+16,bottom:32}]}})),width);await page.waitForTimeout(200);
  assert.equal(await page.locator('#reader-title').textContent(),'航程');assert.ok(await page.locator('.reader-header').isVisible());
  for(const id of ['reader-back','reader-title','reader-outline-action','reader-tools','reader-notes']){const b=await page.locator('#'+id).boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width);assert.ok(b.x+b.width<=width/2-16||b.x>=width/2+16,'camera overlap: '+id);}
  await page.locator('#reader-tools').click();assert.ok(await page.locator('.reader-search-section').isVisible());assert.equal(await page.locator('.reader-notes-section').isVisible(),false);await page.locator('.reader-tools-panel input').fill('灯塔');await page.waitForSelector('[data-reader-hit]');await page.locator('[data-tools-close]').click();
  await page.locator('#reader-notes').click();assert.ok(await page.locator('.reader-notes-section').isVisible());assert.equal(await page.locator('.reader-search-section').isVisible(),false);await page.locator('.reader-tools-panel textarea').fill('测试批注');await page.locator('[data-reader-note]').click();assert.match(await page.locator('[data-reader-mark]').textContent(),/测试批注/);await page.locator('[data-tools-close]').click();
  await page.locator('#reader-outline-action').click();await page.waitForSelector('.reader-outline');await page.locator('[data-reader-close]').click();
  if(width===390){await page.screenshot({path:out+'/reader-camera.png'});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:out+'/reader-dark.png'});}
  await page.locator('#reader-back').click();await page.locator('[data-view=write]').click();if(width===390)await page.screenshot({path:out+'/editor.png'});
  checks.push(width+'px: one-row toolbar, eight quick actions, bounded settings, config scrolling, camera-safe reader, separate search and notes');await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log('PASS '+checks.join('\nPASS '));
}finally{await browser.close();}
