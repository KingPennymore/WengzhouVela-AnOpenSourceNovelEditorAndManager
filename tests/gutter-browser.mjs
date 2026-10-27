import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// The line-number column: in novel mode without line numbers the gutter collapses completely (no empty column, no
// border); with line numbers, and for code files, it keeps its width. Wide and phone layouts.
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const seed=lines=>({version:1,activeId:'book',openIds:['book','code'],settings:{theme:'light',novelLineNumbers:lines},documents:[{id:'book',name:'正文.txt',text:'第一章 风起\n\n　　林舟冷笑一声。',updatedAt:1},{id:'code',name:'script.js',text:'const a=1;\n',updatedAt:1}]});
async function open(ui,viewport,lines){
  const context=await browser.newContext({viewport});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed(lines));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url+'/?ui='+ui);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');await page.waitForTimeout(300);return page;
}
const gutter=page=>page.evaluate(()=>{const g=document.querySelector('.cm-gutters'),style=g&&getComputedStyle(g);return {width:g?Math.round(g.getBoundingClientRect().width):0,border:style?parseFloat(style.borderRightWidth):0,numbers:document.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length};});
try{
  for(const [ui,viewport] of [['harmonyos',{width:1280,height:800}],['android',{width:390,height:800}]]){
    await check(`${ui}: novel mode without line numbers leaves no gutter column`,async()=>{
      const page=await open(ui,viewport,false),g=await gutter(page);
      assert.equal(g.numbers,0);assert.equal(g.width,0,'empty gutter still takes space');assert.equal(g.border,0,'empty gutter still draws its border');
      await page.locator('[data-tab=code]').click();await page.waitForTimeout(200);const code=await gutter(page);assert.ok(code.numbers>0&&code.width>=38,'code files keep their line numbers '+JSON.stringify(code));
      await page.context().close();
    });
    await check(`${ui}: with line numbers on, the gutter keeps its width`,async()=>{
      const page=await open(ui,viewport,true),g=await gutter(page);assert.ok(g.numbers>0&&g.width>=38&&g.border>0,JSON.stringify(g));await page.context().close();
    });
  }
  assert.deepEqual(errors,[]);
  console.log(`gutter checks passed (${checks.length})`);
}finally{await browser.close();await server.close();}
