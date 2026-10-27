import {selectAppView} from './navigation-helper.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// Editor chrome after docs/FRONTEND-PROPOSAL.md levels A and B: one document bar and status-bar actions on wide
// windows, a tools row and the bottom quick bar on narrow ones; novel line numbers, no formats repeated in the selection menu,
// grouped commands, palette-tinted shadows and the aligned library.
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const text='第一章 风起\n\n　　林舟冷笑一声，转身离去。';
try{
  const context=await browser.newContext({viewport:{width:1366,height:820}});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'book',openIds:['book','notes'],settings:{theme:'light',richText:true},documents:[{id:'book',name:'正文.txt',text,updatedAt:1},{id:'notes',name:'笔记.md',text:'# 笔记',updatedAt:2}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady===true);await openRecentFile(page,page.locator('[data-recent="book"]'));await page.waitForFunction(()=>!!window.velaEditorView);
  const parent=(selector,container)=>page.evaluate(([selector,container])=>!!document.querySelector(selector)?.closest(container),[selector,container]);
  await check('wide windows: tabs, formats and view switch share one bar; quick actions sit in the status bar',async()=>{
    assert.equal(await parent('#format-tools','.file-rowbar'),true);assert.equal(await parent('#display-options','.file-rowbar #document-tools'),true);
    assert.equal(await page.locator('#format-tools').isVisible(),true);assert.equal(await page.locator('.quickbar').isVisible(),false);
    assert.equal(await page.locator('.status-actions [id^="quick-"]').count(),8);assert.equal(await page.locator('#quick-undo').isVisible(),true);
    const ratio=await page.evaluate(()=>document.querySelector('#editor').getBoundingClientRect().height/innerHeight);assert.ok(ratio>=.84,'editor takes '+Math.round(ratio*100)+'% of the height');
    await page.locator('[data-tab="notes"]').click();assert.equal(await page.locator('#markdown-tools').isVisible(),true);assert.equal(await page.locator('#format-tools').isVisible(),false);
    await page.locator('[data-tab="book"]').click();
  });
  await check('toolbar buttons have names, tooltips and grouped faces',async()=>{
    const unnamed=await page.evaluate(()=>[...document.querySelectorAll('#format-tools button:not([hidden]),#markdown-tools button')].filter(button=>!button.getAttribute('aria-label')||!button.title).map(button=>button.id));
    assert.deepEqual(unnamed,[]);assert.equal(await page.locator('#format-tools .tool-separator').count(),3);assert.ok(await page.locator('#format-center svg').count());
    assert.match(await page.locator('#format-emphasis').getAttribute('title'),/Ctrl\+Shift\+E/);
  });
  await check('novel TXT hides line numbers by default and the setting brings them back',async()=>{
    assert.equal(await page.locator('.cm-lineNumbers').count(),0);
    await page.locator('#more-tools').click();await page.locator('#settings').click();await page.locator('#dialog-body [name=novelLineNumbers]').check();await page.locator('#dialog-submit').click();
    await page.locator('.cm-lineNumbers').waitFor();
    await page.locator('#more-tools').click();await page.locator('#settings').click();await page.locator('#dialog-body [name=novelLineNumbers]').uncheck();await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>!document.querySelector('.cm-lineNumbers'));
  });
  await check('the TXT format tools can be switched off and on in settings',async()=>{
    const toggle=async on=>{await page.locator('#more-tools').click();await page.locator('#settings').click();const box=page.locator('#dialog-body [name=richText]');assert.equal(await box.isChecked(),!on);await box.setChecked(on);await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);};
    await toggle(false);assert.equal(await page.locator('#format-tools').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.richText),false);
    await toggle(true);assert.equal(await page.locator('#format-tools').isVisible(),true);
  });
  await check('the selection menu leaves formatting to the toolbar',async()=>{
    await page.evaluate(()=>{const view=velaEditorView,at=view.state.doc.toString().indexOf('林舟');view.dispatch({selection:{anchor:at,head:at+2},userEvent:'select.pointer'});view.focus();});
    await page.locator('.selection-menu button',{hasText:/^复制$/}).waitFor();assert.equal(await page.locator('.selection-menu button',{hasText:/^粗体$/}).count(),0);
    await page.locator('#format-strong').click();
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.cm-content .vela-format-strong')].map(node=>node.textContent)),['林舟']);
  });
  await check('the command palette is grouped and shows the group when searching',async()=>{
    await page.locator('#more-tools').click();await page.locator('#commands').click();
    const groups=await page.evaluate(()=>[...document.querySelectorAll('#command-list .command-group')].map(node=>node.textContent));
    assert.deepEqual(groups.slice(0,3),['文稿与导出','TXT 格式','外观']);assert.ok(groups.includes('界面与快捷键'));
    await page.locator('#command-search').fill('EPUB');assert.equal(await page.locator('#command-list .command-group').count(),0);assert.equal(await page.locator('.command-item .command-group-tag').first().textContent(),'文稿与导出');
    await page.keyboard.press('Escape');
  });
  await check('light-mode shadows take the palette’s text colour',async()=>{
    assert.match(await page.evaluate(()=>document.body.style.getPropertyValue('--elev-2')),/#28372f38/);
  });
  await check('narrow windows: a tools row above the text and the bottom quick bar, switching live',async()=>{
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.body.dataset.shell==='narrow');
    assert.equal(await parent('#document-tools','.paper'),true);assert.equal(await parent('#display-options','.file-rowbar'),true);
    const toolWidths=await page.evaluate(()=>{const tools=document.querySelector('#document-tools').getBoundingClientRect(),scroll=document.querySelector('.document-tools-scroll').getBoundingClientRect();return {tools:tools.width,scroll:scroll.width};});
    assert.ok(toolWidths.scroll>=toolWidths.tools-1,'the toolbar scroll area spans the whole row');
    assert.equal(await page.locator('.quickbar').isVisible(),true);assert.equal(await page.locator('.quickbar [id^="quick-"]').count(),8);
    const order=await page.evaluate(()=>{const tools=document.querySelector('#document-tools').getBoundingClientRect(),editor=document.querySelector('#editor').getBoundingClientRect(),tabs=document.querySelector('.file-rowbar').getBoundingClientRect();return {toolsBelowTabs:tools.top>=tabs.bottom-1,toolsAboveEditor:tools.bottom<=editor.top+1};});
    assert.deepEqual(order,{toolsBelowTabs:true,toolsAboveEditor:true});
    await page.setViewportSize({width:1366,height:820});await page.waitForFunction(()=>document.body.dataset.shell==='wide');
    assert.equal(await page.locator('.status-actions [id^="quick-"]').count(),8);assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),text);
  });
  await check('the reading library heading and books share one left edge',async()=>{
    await selectAppView(page,'reader');await page.locator('.reader-book').first().waitFor();
    const edges=await page.evaluate(()=>[document.querySelector('.reader-library header').getBoundingClientRect().left,document.querySelector('.reader-books').getBoundingClientRect().left].map(Math.round));
    assert.equal(edges[0],edges[1]);
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/shell-layout.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
