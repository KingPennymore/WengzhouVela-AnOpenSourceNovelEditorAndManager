import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const source=String.raw`\documentclass{ctexart}\begin{document}文舟轻量版离线编译。\end{document}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(source=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'tex',name:'main.tex',text:source,updatedAt:1}],settings:{theme:'light'},activeId:'tex',openIds:['tex']}));},source);
await mkdir('test-results/improvements',{recursive:true});
const open=async()=>{await page.goto(process.env.VELA_TEST_URL||'http://127.0.0.1:4173');await page.locator('[data-recent=tex]').click();await page.locator('[data-display=preview]').click();await page.waitForSelector('.tex-component-controls:not([hidden])');};
try{
 await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route=>route.abort());await open();
 await page.locator('.tex-compile').click();await page.waitForFunction(()=>document.querySelector('.tex-status').textContent==='编译失败');assert.match(await page.locator('#toast').textContent(),/导入离线排版/);console.log('PASS lite build clearly requests components without downloading anything');
 await page.locator('.tex-component-input').setInputFiles('dist/tex-components/Vela-TeX-0.1.1-engine.zip');await page.waitForFunction(()=>/引擎 ✓.*中文 —/.test(document.querySelector('.tex-component-note').textContent),{},{timeout:90000});await open();await page.waitForFunction(()=>/引擎 ✓.*中文 —/.test(document.querySelector('.tex-component-note').textContent));console.log('PASS verified engine component persists across restart');
 await page.locator('.tex-component-input').setInputFiles('dist/tex-components/Vela-TeX-0.1.1-chinese.zip');await page.waitForFunction(()=>document.querySelector('.tex-component-note').textContent.includes('已就绪'),{},{timeout:90000});await open();await page.waitForFunction(()=>document.querySelector('.tex-component-note').textContent.includes('已就绪'));
 await page.locator('.tex-compile').click();await page.waitForFunction(()=>!document.querySelector('.tex-compile').disabled,{},{timeout:180000});await writeFile('test-results/improvements/lite-tex.log',await page.locator('.tex-log pre').textContent());assert.equal(await page.locator('.tex-status').textContent(),'编译完成');assert.ok(await page.locator('.pdf-canvas canvas').evaluate(canvas=>canvas.width>0));await page.screenshot({path:'test-results/improvements/lite-tex.png'});assert.deepEqual(errors,[]);console.log('PASS imported components compile and render real Chinese PDF with external networking blocked');
}finally{await browser.close();}
