import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// The line-number column: in novel mode without line numbers the gutter collapses completely (no empty column, no
// border); with line numbers, and for code files, numbers occupy a metadata lane above each logical line. Wide and phone layouts.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const seed=lines=>({version:1,activeId:'book',openIds:['book','code'],settings:{theme:'light',novelLineNumbers:lines},documents:[{id:'book',name:'正文.txt',text:'第一章 风起\n\n　　林舟冷笑一声。',updatedAt:1},{id:'code',name:'script.js',text:'const a=1;\n',updatedAt:1}]});
async function open(ui,viewport,lines){
  const context=await browser.newContext({viewport});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed(lines));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url+'/?ui='+ui);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');await page.waitForTimeout(300);return page;
}
const gutter=page=>page.evaluate(()=>{const g=document.querySelector('.cm-gutters'),style=g&&getComputedStyle(g);return {width:g?Math.round(g.getBoundingClientRect().width):0,border:style?parseFloat(style.borderRightWidth):0,numbers:document.querySelectorAll('.vela-numbered-line').length};});
try{
  for(const [ui,viewport] of [['harmonyos',{width:1280,height:800}],['android',{width:390,height:800}]]){
    await check(`${ui}: novel mode without line numbers leaves no gutter column`,async()=>{
      const page=await open(ui,viewport,false),g=await gutter(page);
      assert.equal(g.numbers,0);assert.equal(g.width,0,'empty gutter still takes space');assert.equal(g.border,0,'empty gutter still draws its border');
      await page.locator('[data-tab=code]').click();await page.waitForTimeout(200);const code=await gutter(page);assert.ok(code.numbers>0&&code.width===0,'code files keep their line numbers '+JSON.stringify(code));
      await page.context().close();
    });
    await check(`${ui}: with line numbers on, inline line numbers never reserve a gutter column`,async()=>{
      const page=await open(ui,viewport,true);
      await page.evaluate(()=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'line\n'.repeat(1000)}});});
      await page.waitForTimeout(100);
      const positions=[];
      for(const row of [1,9,10,99,100,999,1000]){
        await page.evaluate(row=>{const v=velaEditorView;v.dispatch({selection:{anchor:v.state.doc.line(row).from},scrollIntoView:true});v.focus();},row);
        await page.keyboard.type('x');await page.waitForTimeout(80);
        positions.push(await page.evaluate(()=>({width:document.querySelector('.cm-gutters')?.getBoundingClientRect().width||0,x:document.querySelector('.cm-content').getBoundingClientRect().x})));
      }
      await page.evaluate(()=>{velaEditorView.scrollDOM.scrollTop=0;});await page.waitForTimeout(100);
      positions.push(await page.evaluate(()=>({width:document.querySelector('.cm-gutters')?.getBoundingClientRect().width||0,x:document.querySelector('.cm-content').getBoundingClientRect().x})));
      assert.ok(positions.every(p=>p.width===0),JSON.stringify(positions));
      assert.equal(new Set(positions.map(p=>p.x)).size,1,'selection and offscreen caret must not shift the gutter/content');
      await page.context().close();
    });
  }
  assert.deepEqual(errors,[]);
  console.log(`gutter checks passed (${checks.length})`);
}finally{await browser.close();await server.close();}
