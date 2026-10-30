import {launchBrowser} from './browser-launch.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const seed={version:1,documents:[{id:'book',name:'正文.txt',text:'章前引言\n第一章 这是用于检验窄屏单行显示的很长很长章节标题\n正文。',updatedAt:1,remote:{repo:'writer/book',branch:'main',path:'正文.txt',sha:'a'.repeat(40),lastSyncedText:'旧正文'}}],activeId:'book',openIds:['book'],settings:{theme:'light'}};
await mkdir('test-results/mobile-status',{recursive:true});
const browser=await launchBrowser();
try{
 for(const platform of ['android','harmonyos'])for(const width of [320,360,390,411,600]){
  const context=await browser.newContext({viewport:{width,height:844}});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.VELA_TEST_URL||'http://127.0.0.1:4173')+'/?ui='+platform);await openRecentFile(page,page.locator('[data-recent=book]'));
  assert.equal(await page.locator('.statusbar #sync-state').count(),0);assert.equal(await page.locator('#sync-state').isVisible(),false);assert.equal(await page.locator('#save-state').isVisible(),false);
  assert.match(await page.locator('#word-count').textContent(),/本章.*全文/);assert.match(await page.locator('#cursor-position').textContent(),/行.*列/);
  for(const large of [false,true]){
   if(large)await page.evaluate(()=>{document.querySelector('#current-chapter').textContent='第一千章 这是非常长的章节名称，窄屏不截断而是缩字后滚动';document.querySelector('#word-count').textContent='本章 123,456 / 全文 2,000,000 字';document.querySelector('#cursor-position').textContent='行 12345，列 123';});await page.waitForTimeout(200);
   const stats=await page.evaluate(()=>{const bar=document.querySelector('.statusbar'),ids=['current-chapter','word-count','cursor-position'],chapter=document.getElementById('current-chapter');return {bar:bar.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(bar).fontSize),chapterFits:chapter.scrollWidth<=chapter.clientWidth+1,overflow:document.documentElement.scrollWidth>innerWidth,items:ids.map(id=>{const el=document.getElementById(id),range=document.createRange();range.selectNodeContents(el);return {id,rect:el.getBoundingClientRect().toJSON(),full:el.scrollWidth<=el.clientWidth+1,ellipsis:getComputedStyle(el).textOverflow,lines:new Set([...range.getClientRects()].map(rect=>Math.round(rect.top*10))).size,whiteSpace:getComputedStyle(el).whiteSpace};})};});
   // One row, never an ellipsis: counts and position always in full; the type shrinks to 10px at most, then a long title scrolls.
   assert.equal(stats.overflow,false);assert.ok(stats.items[0].rect.left>=12);assert.ok(stats.items.at(-1).rect.right<=width-12);assert.ok(stats.font>=10&&stats.font<=12,String(stats.font));
   for(const item of stats.items){assert.notEqual(item.ellipsis,'ellipsis',item.id);if(item.id!=='current-chapter')assert.ok(item.full,item.id+' shows in full');}
   if(!stats.chapterFits)assert.equal(stats.font,10,'shrink before scrolling');for(let i=0;i<3;i++){const item=stats.items[i];assert.equal(item.lines,1,item.id);assert.equal(item.whiteSpace,'nowrap');assert.ok(item.rect.height<=28);assert.ok(Math.abs(item.rect.top-stats.items[0].rect.top)<1);if(i)assert.ok(item.rect.left>=stats.items[i-1].rect.right+7);}
   if(width===390)await page.screenshot({path:`test-results/mobile-status/${platform}-${large?'long':'normal'}.png`});
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${platform} ${width}px one-row chapter/count/cursor without ellipsis, hidden sync text and no wrapping`);
 }
}finally{await browser.close();}
