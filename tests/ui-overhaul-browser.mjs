import {launchBrowser} from './browser-launch.mjs';
import {selectAppView} from './navigation-helper.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {readerReady,settled} from './wait-helpers.mjs';

const out='test-results/ui-overhaul';await mkdir(out,{recursive:true});
const browser=await launchBrowser(),errors=[],checks=[];
const text='第一章 航程\n　　清晨，船驶出了港口。远处的灯塔在薄雾中渐渐隐去，航海日志翻开了新的一页。\n\n第二章 灯塔\n　　林舟合上地图，沿着石阶走向灯塔。'+ '海风穿过门廊，带来海潮的声音。'.repeat(22);
const config=createVelaV2('航程');config.chapters.templates=['幕 {序号} — {title}'];config.reading.items=[{path:'航程.txt'}];
const seed={version:1,documents:[{id:'book',name:'航程.txt',path:'航程/航程.txt',text,updatedAt:1},{id:'note',name:'人物.md',path:'航程/人物.md',text:'# 人物\n林舟：航海日志的记录者。',updatedAt:2},{id:'config',name:'.vela',path:'航程/.vela',text:velaText(config),updatedAt:1}],openIds:['book','note'],activeId:'book',settings:{theme:'system',readingMode:'pages'}};
try{
 for(const [profile,width,height] of [['windows',1440,960],['harmonyos',1280,850],['android',390,844]]){
  const context=await browser.newContext({viewport:{width,height},colorScheme:'light'});
  await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto((process.env.VELA_TEST_URL||'http://127.0.0.1:4173')+'/?ui='+profile);await page.waitForFunction(()=>window.velaReady===true);if(await page.locator('#start-page').isVisible())await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
  assert.equal(await page.locator('body').getAttribute('data-ui'),profile);
  await page.locator('#mobile-library').click();if(width>600)await page.locator('#outline-toggle').click();await settled(page);
  await page.screenshot({path:`${out}/${profile}-editor.png`});
  await page.locator('#more-tools').click();
  for(const id of ['mobile-library','settings','search-editor','outline-toggle']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,id);assert.ok(box.height>=32,id);}
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#more-tools').click();await page.locator('#settings').click();assert.equal(await page.locator('.settings-section').count(),6);await settled(page);await page.screenshot({path:`${out}/${profile}-settings.png`});
  await page.locator('[name=language]').selectOption('en');await page.locator('#dialog-submit').click();await page.locator('#more-tools').click();await page.locator('#settings').click();assert.equal(await page.locator('.settings-navigation button').first().textContent(),'Appearance and language');await page.locator('#dialog-cancel').click();
  await page.keyboard.press('Control+Alt+h');await page.screenshot({path:`${out}/${profile}-home-en.png`});
  await selectAppView(page,'reader');await page.locator('.reader-library').waitFor();/* the reader is a lazy chunk */await page.screenshot({path:`${out}/${profile}-library-en.png`});assert.equal(await page.locator('[data-read=book] strong').textContent(),'航程');await page.locator('[data-read=book]').click();assert.equal(await page.locator('#reader-title').textContent(),'航程');assert.equal(await page.locator('#preview-toggle').count(),0);await readerReady(page);await page.screenshot({path:`${out}/${profile}-reader-en.png`});
  await page.locator('#reader-back').click();await selectAppView(page,'write');
  await page.keyboard.press('Control+Alt+h');await openRecentFile(page,page.locator('[data-recent=config]'));await page.locator('[data-display=preview]').click();await page.screenshot({path:`${out}/${profile}-vela-en.png`});assert.equal(await page.locator('.vela-config-actions').evaluate(el=>getComputedStyle(el).position),'static');
  {await page.locator('#more-tools').click();await page.evaluate(()=>window.dispatchEvent(new Event('resize')));assert.equal(await page.locator('#toolbar-overflow').isVisible(),true);for(const id of ['focus-toggle','theme','commands','plugins'])assert.equal(await page.locator('#toolbar-overflow #'+id).isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#more-tools').getAttribute('aria-expanded'),'false');await page.locator('#toolbar-overflow').waitFor({state:'hidden'});assert.equal(await page.locator('#toolbar-overflow').isVisible(),false);assert.equal(await page.locator('#more-tools').evaluate(el=>el===document.activeElement),true);}
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:`${out}/${profile}-vela-dark.png`});
  checks.push(profile+' navigation, settings, English, home, library, reader, VELA, dark mode and bounds');await context.close();
 }
 // An empty paragraph and inserted ASCII spaces must keep the actual caret on the text baseline.
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();await page.goto((process.env.VELA_TEST_URL||'http://127.0.0.1:4173')+'/?ui=harmonyos');await page.waitForSelector('.cm-editor');await page.keyboard.press('Control+n');await page.locator('#dialog [name=name]').fill('光标测试.txt');await page.locator('#dialog-submit').click();await page.waitForSelector('.cm-editor');
 const set=async text=>{await page.evaluate(text=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus();},text);await settled(page);};
 const caret=()=>page.evaluate(()=>{const v=velaEditorView,p=v.state.selection.main.head,r=v.coordsAtPos(p),cursor=v.dom.querySelector('.cm-cursor')?.getBoundingClientRect(),line=v.contentDOM.querySelector('.cm-line:last-child'),rect=line.getBoundingClientRect();return {position:p,text:v.state.doc.toString(),x:r.left,drawn:cursor?.left,start:rect.left+parseFloat(getComputedStyle(line).paddingLeft)+parseFloat(getComputedStyle(line).textIndent||0)};});
 await set('第一章 航程\n正文\n');const empty=await caret();assert.ok(Math.abs(empty.x-empty.start)<2,JSON.stringify(empty));
 await page.keyboard.press('Space');await settled(page);const space=await caret();assert.equal(space.position,empty.position+1);assert.ok(space.x>empty.x,'ASCII space must advance the caret');assert.ok(Math.abs(space.x-space.drawn)<2);
 await page.keyboard.press('Space');await settled(page);const second=await caret();assert.ok(second.x>space.x);
 await page.keyboard.press('Enter');await settled(page);const next=await caret();assert.equal(next.position,next.text.length);assert.ok(next.x>=next.start);assert.ok(Math.abs(next.x-next.drawn)<2);
 await page.keyboard.press('Tab');await settled(page);const indent=await caret();assert.ok(indent.x>next.x+20);assert.ok(indent.text.endsWith('　　'));
 await set('中文正文\n');await page.locator('.cm-content').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''})));await page.keyboard.insertText('中文');await page.locator('.cm-content').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'})));await settled(page);const composed=await caret();assert.ok(composed.text.endsWith('\n中文'));assert.ok(Math.abs(composed.x-composed.drawn)<2);
 await page.screenshot({path:`${out}/caret-fixed.png`});checks.push('Empty line, Enter, spaces, full-width indent and composition caret geometry');await context.close();
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log('PASS '+checks.join('\nPASS '));
}finally{await browser.close();}
