import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {startSourceAppServer} from './source-app-server.mjs';

// Chapter sidebar → 导出章节: a chapter range downloads as TXT and a chapter copies to the clipboard; the document is unchanged.
const server=await startSourceAppServer();
const origin=server.url,browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n山雨欲来。\n\n第二章 云涌\n\n风满楼。\n\n第三章 落幕\n\n终了。';
// The Windows clipboard returns CRLF line endings for text written with LF.
const clipboard=async()=>(await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n');
const openDialog=async()=>{if(!await page.locator('#export-chapters').isVisible())await page.locator('#outline-toggle').click();await page.locator('#export-chapters').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='导出章节');};
try{
  await page.goto(origin);await page.waitForFunction(()=>window.velaReady===true&&!!window.velaEditorView);
  await page.evaluate(text=>{const view=velaEditorView;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},selection:{anchor:text.indexOf('风满楼')}});view.focus();},novel);
  await check('the dialog lists every chapter and defaults to the chapter at the cursor',async()=>{await openDialog();assert.equal(await page.locator('#dialog-body [name=from] option').count(),3);assert.equal(await page.locator('#dialog-body [name=from]').inputValue(),'1');assert.equal(await page.locator('#dialog-body [name=to]').inputValue(),'1');assert.equal(await page.locator('#dialog-submit').textContent(),'导出 TXT');});
  await check('a chapter range exports as a TXT file named after the document and chapters',async()=>{await page.locator('#dialog-body [name=from]').selectOption('0');await page.locator('#dialog-body [name=to]').selectOption('1');const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();const file=await download;assert.match(file.suggestedFilename(),/ - 第一章 风起 至 第二章 云涌\.txt$/);assert.equal(await readFile(await file.path(),'utf8'),'第一章 风起\n\n山雨欲来。\n\n第二章 云涌\n\n风满楼。\n');await page.waitForFunction(()=>!document.querySelector('#dialog').open);});
  await check('copying without titles puts only the body on the clipboard',async()=>{await openDialog();await page.locator('#dialog-body [name=title]').uncheck();await page.locator('#copy-chapters').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(await clipboard(),'风满楼。\n');});
  await check('an inverted range is refused with a reason and nothing is exported',async()=>{await openDialog();await page.locator('#dialog-body [name=from]').selectOption('2');await page.locator('#dialog-body [name=to]').selectOption('0');let downloaded=false;page.once('download',()=>downloaded=true);await page.locator('#dialog-submit').click();await page.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('结束章节'));assert.equal(downloaded,false);await page.locator('#dialog-cancel').click();});
  await check('the command palette copies the current chapter',async()=>{await page.evaluate(()=>navigator.clipboard.writeText(''));await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('复制本章');await page.locator('.command-item').click();await page.waitForFunction(async()=>(await navigator.clipboard.readText()).replace(/\r\n/g,'\n')==='第二章 云涌\n\n风满楼。\n');});
  assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),novel,'the document is unchanged');
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/chapter-export.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();server.close();}
