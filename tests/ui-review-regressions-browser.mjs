import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';
import { openRecentFile } from './start-page-helper.mjs';
const server = await startSourceAppServer();
const browser = await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results = {};
const seed = {version:1,activeId:'csv',openIds:['csv','gly','txt'],settings:{},documents:[
 {id:'csv',name:'audit.csv',path:'audit.csv',text:'z,v\na,w\nm,t',updatedAt:1},
 {id:'gly',name:'audit.gly',path:'audit.gly',text:JSON.stringify({version:1,entries:[{id:'entry',term:'term',definition:'old',aliases:[]}]}),updatedAt:1},
 {id:'txt',name:'audit.txt',path:'audit.txt',text:'KEEP THIS TEXT',updatedAt:1}
]};
try {
 const context = await browser.newContext({viewport:{width:1100,height:900}});
 await context.addInitScript(seed=>{localStorage.setItem('vela.test.motion','off');localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
 const page = await context.newPage(); await page.goto(server.url);
 await openRecentFile(page,page.locator('[data-recent=csv]')); await page.locator('.csv-grid-cell').first().click();
 await page.locator('#csv-zoom').click();await page.keyboard.press('End');assert.equal(await page.locator('.csv-zoom-menu button').last().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Home');assert.equal(await page.locator('.csv-zoom-menu button').first().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.csv-zoom-menu').count(),0);
 await page.locator('.csv-plane').focus();
 const before = await page.locator('#csv-zoom').textContent();
 const beforeFont = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size'));
 await page.keyboard.press('Control+-');
 results.zoomShortcut = {before,after:await page.locator('#csv-zoom').textContent(),beforeFont,afterFont:await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size'))};
 assert.notEqual(await page.locator('#csv-zoom').textContent(),before);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size')),beforeFont);await page.keyboard.press('Control+0');
 await page.locator('[data-csv-column="0"]').click({button:'right'});
 await page.locator('.csv-menu button').getByText('升序 · 仅显示',{exact:true}).click();
 await page.locator('[data-csv-row="1"]').first().click({button:'right'});
 await page.locator('.csv-menu button').getByText('在下方插入行',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.csv-grid-host')?.getAttribute('aria-rowcount')==='4');
 results.sortInsertion = await page.evaluate(()=>({rows:document.querySelector('.csv-grid-host').getAttribute('aria-rowcount'),visibleRows:[...new Set([...document.querySelectorAll('[data-cell-row]')].map(e=>e.dataset.cellRow))],source:velaEditorView.state.doc.toString()}));
 assert.equal(results.sortInsertion.visibleRows.length,4);
 results.multilineMetric = await page.evaluate(async()=>{try{const {csvMetrics}=await import('/csv-grid.mjs');csvMetrics([['x\n'.repeat(150000)]],1);return 'ok';}catch(error){return error.name+': '+error.message;}});
 assert.equal(results.multilineMetric,'ok');
 await page.locator('[data-display=source]').click();
 await page.evaluate(()=>velaEditorView.dispatch({changes:{from:0,to:velaEditorView.state.doc.length,insert:Array.from({length:300},(_,i)=>i===299?'OFFSCREEN_NEEDLE,b':i+',b').join('\n')}}));
 await page.locator('[data-view=reader]').click(); await page.locator('[data-read=csv]').click();
 await page.locator('#reader-tools').click(); await page.locator('.reader-tools-panel [data-book-query]').fill('OFFSCREEN_NEEDLE');
 await page.locator('[data-reader-hit]').waitFor();
 results.readerSearch = {matches:await page.locator('[data-reader-hit]').count(),hasNeedleInSource:await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(d=>d.id==='csv').text.includes('OFFSCREEN_NEEDLE'))};
 assert.equal(results.readerSearch.matches,1);await page.locator('[data-reader-hit]').click();await page.locator('[data-cell-row="299"][data-cell-column="0"]').waitFor();assert.equal(await page.locator('.csv-reader-hit').count(),1);
 await page.locator('#reader-notes').click();await page.locator('.reader-notes-section textarea').fill('cell note');await page.locator('[data-reader-note]').click();await page.locator('[data-reader-mark]').click();assert.equal(await page.locator('[data-cell-row="299"][data-cell-column="0"]').textContent(),'OFFSCREEN_NEEDLE');
 await context.close();
 const terms = await browser.newContext({viewport:{width:1100,height:900}});
 await terms.addInitScript(seed=>{localStorage.setItem('vela.test.motion','off');localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
 const q = await terms.newPage(); await q.goto(server.url); await openRecentFile(q,q.locator('[data-recent=gly]'));
 await q.locator('.glossary-row').click(); await q.locator('[name=definition]').fill('new draft');
 await q.locator('[data-tab=txt]').click(); await q.waitForTimeout(900); // Observe past the former 700 ms delayed-save window after switching files.
 results.glossarySwitch = await q.evaluate(()=>({activeName:document.querySelector('#current-name').textContent,text:velaEditorView.state.doc.toString()}));
 assert.equal(results.glossarySwitch.text,'KEEP THIS TEXT');await q.locator('[data-tab=gly]').click();assert.equal(await q.locator('[name=definition]').inputValue(),'new draft');
 await q.locator('[data-display=source]').click();await q.evaluate(()=>velaEditorView.dispatch({changes:{from:0,to:velaEditorView.state.doc.length,insert:JSON.stringify({version:1,entries:Array.from({length:2000},(_,i)=>({id:'t'+i,term:'term'+i,definition:'entry',aliases:[]}))})}}));await q.locator('[data-display=preview]').click();await q.locator('#glossary-search').waitFor();assert.ok(await q.locator('.glossary-row').count()<200);await q.evaluate(()=>window.__searchField=document.querySelector('#glossary-search'));await q.locator('#glossary-search').fill('term1999');assert.equal(await q.locator('.glossary-row').count(),1);assert.equal(await q.evaluate(()=>document.querySelector('#glossary-search')===window.__searchField),true);
 await terms.close();
 const html=await browser.newContext({viewport:{width:320,height:700}});
 await html.addInitScript(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);window.readerShadow=root;return root;};});
 const h=await html.newPage();const config={path:'review.html',readerTheme:JSON.stringify({panel:'#abcdef',text:'#112233'}),layout:{},fontSize:16};
 await h.route('**/review-reader',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Reader</h1><p>Text</p><script src="/html-reader.js?config=${encodeURIComponent(JSON.stringify(config))}"></script></body></html>`}));
 await h.goto(server.url+'/review-reader');await h.waitForFunction(()=>window.readerShadow);
 const chrome=await h.evaluate(()=>{const header=readerShadow.querySelector('header');return {color:getComputedStyle(header).backgroundColor,buttons:[...header.querySelectorAll('button')].map(button=>{const rect=button.getBoundingClientRect();return {width:rect.width,height:rect.height,right:rect.right};})};});
 assert.equal(chrome.color,'rgb(171, 205, 239)');for(const button of chrome.buttons){assert.ok(button.width>=44&&button.height>=44);assert.ok(button.right<=321);}
 await html.close();
 console.log('PASS review regressions: document ownership, CSV zoom/sort/metrics/full search and cell notes');
 await writeFile('test-results/ui-review-fixed-results.json',JSON.stringify(results,null,2));
} finally {await browser.close();await server.close();}
