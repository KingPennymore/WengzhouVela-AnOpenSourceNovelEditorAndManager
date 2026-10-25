import {selectAppView} from './navigation-helper.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildRecord} from '../web/rich-text.mjs';
import {settled,until,themeShiftDone} from './wait-helpers.mjs';

// 0.9.8.1 fixes: the theme button changes the look on the first press, theme switches fade (the GitHub page lets
// the non-scrolling workspace paint its background), the selection menu's “更多” list stays open, “清除格式”
// clears the cursor's paragraph and says when there is nothing to clear, and documents reopen where they were left
// (stored in the work .vela).
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const lines=['第一章 风起',''];for(let i=1;i<=120;i++)lines.push(`　　第${i}段，林舟望着远处的灯塔。`);
const novel=lines.join('\n'),bold=novel.indexOf('林舟',novel.indexOf('第3段'));
const config={version:3,kind:'workspace',id:'voyage',project:{name:'航程'},richText:{enabled:true,documents:{'正文.txt':buildRecord(novel,[{group:'marks',type:'strong',from:bold,to:bold+2}])}}};
const seed={version:1,activeId:'book',openIds:['book','notes','config'],settings:{theme:'light',richText:true},documents:[{id:'book',name:'正文.txt',path:'航程/正文.txt',text:novel,updatedAt:1},{id:'notes',name:'笔记.txt',path:'航程/笔记.txt',text:'笔记',updatedAt:1},{id:'config',name:'.vela',path:'航程/.vela',text:JSON.stringify(config,null,2),updatedAt:1}]};
const stored=page=>page.evaluate(async()=>{const {readWorkspaceAsync}=await import('/platform.mjs');return JSON.parse(await readWorkspaceAsync());});
const velaOf=async page=>JSON.parse((await stored(page)).documents.find(doc=>doc.path==='航程/.vela').text);
async function open(options={viewport:{width:1280,height:800}}){
  const context=await browser.newContext(options);
  await context.addInitScript(seed=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');await settled(page);return page;
}
const dark=page=>page.evaluate(()=>document.body.classList.contains('dark'));
try{
  const page=await open();
  await check('the theme button changes the look on the first press and returns to following the system',async()=>{
    assert.equal(await dark(page),false);await page.evaluate(()=>document.querySelector('#theme').click());await page.waitForFunction(()=>document.body.classList.contains('dark'));assert.equal(await dark(page),true,'first press did nothing');
    assert.equal((await stored(page)).settings.theme,'dark');await page.evaluate(()=>document.querySelector('#theme').click());await page.waitForFunction(()=>!document.body.classList.contains('dark'));assert.equal(await dark(page),false);
    assert.equal((await stored(page)).settings.theme,'system','back to the system look means following the system');
  });
  await check('a theme switch starts the cross-fade in the same update and the GitHub page background fades with the workspace',async()=>{
    const shift=await page.evaluate(()=>{document.querySelector('#theme').click();return document.documentElement.classList.contains('theme-switching');});assert.equal(shift,true);
    await themeShiftDone(page);await page.evaluate(()=>document.querySelector('#theme').click());await themeShiftDone(page);
    await selectAppView(page,'github');await page.locator('#github-view').waitFor();
    assert.equal(await page.locator('#github-view').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    // No visible scrolling container paints its own background (ArkWeb does not repaint those during the fade).
    const scrollers=()=>page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);return /(auto|scroll)/.test(c.overflowY+c.overflowX)&&c.backgroundColor!=='rgba(0, 0, 0, 0)'&&e.checkVisibility()&&!e.closest('dialog,.cm-tooltip,.selection-menu,.selection-more');}).map(e=>e.id||e.className));
    assert.deepEqual(await scrollers(),[],'GitHub page');
    await selectAppView(page,'write');await page.waitForSelector('.cm-editor');assert.deepEqual(await scrollers(),[],'editor page');
    await selectAppView(page,'reader');await page.locator('.reader-library').waitFor();assert.deepEqual(await scrollers(),[],'reader library');
    await selectAppView(page,'write');await page.waitForSelector('.cm-editor');
  });
  await check('the “更多” list of the selection menu stays open',async()=>{
    await page.evaluate(()=>{const v=velaEditorView,i=v.state.doc.toString().indexOf('望着远处');v.dispatch({selection:{anchor:i,head:i+4},scrollIntoView:true});v.focus();});
    await page.waitForSelector('#selection-menu:not([hidden])');await page.locator('.selection-more-toggle').click();await page.waitForTimeout(800); // observation window: the list must still be open afterwards
    assert.equal(await page.locator('.selection-more').isVisible(),true,'the list closed by itself');
    await page.locator('.selection-more button',{hasText:'搜索'}).waitFor();await page.keyboard.press('Escape');
  });
  await check('清除格式 without a selection clears the inline formats of the cursor paragraph, and says when there is nothing',async()=>{
    await page.evaluate(at=>{const v=velaEditorView;v.dispatch({selection:{anchor:at+5}});v.focus();},bold);await settled(page);
    assert.equal(await page.locator('.cm-content strong, .cm-content .vela-strong, .cm-content [class*=strong]').count()>0,true,'fixture shows bold');
    await page.locator('#format-clear').click();await page.waitForFunction(()=>!document.querySelector('.cm-content strong, .cm-content .vela-strong, .cm-content [class*=strong]')).catch(()=>{});
    assert.equal(await page.locator('.cm-content strong, .cm-content .vela-strong, .cm-content [class*=strong]').count(),0,'bold in the cursor paragraph not cleared');
    await page.locator('#format-clear').click();await page.locator('#toast',{hasText:'没有格式可清除'}).waitFor();
    await page.keyboard.press('Control+z');await settled(page);
  });
  await check('a document reopens where it was left: the position is stored in the work .vela when leaving it',async()=>{
    const target=novel.indexOf('第80段');
    await page.evaluate(at=>{const v=velaEditorView;v.dispatch({selection:{anchor:at},scrollIntoView:true});v.focus();},target);
    await page.locator('[data-tab=notes]').click();await until(async()=>(await velaOf(page)).positions?.['正文.txt']);
    const vela=await velaOf(page);assert.deepEqual(vela.positions['正文.txt'],{at:[82,2],head:'　　第80段，林舟望着远'});
    assert.equal(vela.richText.enabled,true,'other settings are kept');assert.equal(vela.project.name,'航程');
    await page.reload();await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');await settled(page);
    const again=page;
    assert.equal(await again.evaluate(()=>velaEditorView.state.selection.main.head),target,'cursor not restored');
    const visible=await again.evaluate(at=>{const v=velaEditorView,box=v.coordsAtPos(at),editor=v.scrollDOM.getBoundingClientRect();return !!box&&box.top>=editor.top&&box.bottom<=editor.bottom;},target);assert.equal(visible,true,'restored line not scrolled into view');

  });
  await check('the .vela editor keeps the stored positions when it saves the form',async()=>{
    await page.evaluate(()=>document.querySelector('[data-tab=config]').click());await page.locator('#vela-form').waitFor();
    await page.locator('#vela-form [name=description]').fill('简介');await page.locator('#vela-form footer .primary').click();await page.locator('#toast',{hasText:'工作区配置已保存'}).waitFor();
    const vela=await velaOf(page);assert.equal(vela.project.description,'简介');assert.ok(vela.positions?.['正文.txt'],'form save dropped positions');
    await page.context().close();
  });
  assert.deepEqual(errors,[]);
  console.log(`0.9.8.1 fix checks passed (${checks.length})`);
}finally{await browser.close();await server.close();}
