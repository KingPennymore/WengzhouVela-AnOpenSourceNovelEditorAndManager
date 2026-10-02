import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
try{
  for(const length of [60000,600000,2000000]){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.addInitScript(length=>{const part='正文保持完整，输入和保存不能阻塞。\n'.repeat(80),text=Array.from({length:Math.ceil(length/part.length)},(_,i)=>`第${i+1}章 航程\n${part}`).join('').slice(0,length);localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'bench',name:'性能样例.txt',text,updatedAt:1,remote:null}],activeId:'bench',openIds:['bench'],settings:{theme:'light',readingMode:'pages'}}));},length);
    const start=performance.now();await page.goto('http://127.0.0.1:4173');if(await page.locator('[data-recent=bench]').count())await page.locator('[data-recent=bench]').click();await page.waitForSelector('.cm-editor',{timeout:90000});const openMs=performance.now()-start;
    const measured=await page.evaluate(async()=>{const view=editorManager.editor,inputs=[];for(let i=0;i<20;i++){const start=performance.now();view.dispatch({changes:{from:10,insert:'字'}});await new Promise(requestAnimationFrame);inputs.push(performance.now()-start);}const save=performance.now();window.wenzhouSave();const saveMs=performance.now()-save;inputs.sort((a,b)=>a-b);return {inputP95:inputs[Math.floor(inputs.length*.95)],saveMs,characters:view.state.doc.length};});
    assert.equal(measured.characters,length+20);await page.locator('[data-view=reader]').click();const reading=performance.now();await page.locator('[data-read=bench]').click();await page.waitForSelector('.reader-paged');await page.waitForTimeout(100);const readingOpenMs=performance.now()-reading;
    const turns=await page.evaluate(async()=>{const el=document.querySelector('.reader-viewport'),times=[];for(let i=0;i<10;i++){const start=performance.now();el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await new Promise(requestAnimationFrame);times.push(performance.now()-start);await new Promise(r=>setTimeout(r,240));}times.sort((a,b)=>a-b);return {turnP95:times[Math.floor(times.length*.95)],nodes:document.querySelectorAll('*').length,heap:performance.memory?.usedJSHeapSize};});
    results.push({length,openMs,readingOpenMs,...measured,...turns});console.log(JSON.stringify(results.at(-1)));await page.close();
  }
  await mkdir('test-results',{recursive:true});await writeFile(process.env.VELA_PERF_OUTPUT||'test-results/performance-current.json',JSON.stringify({measuredAt:new Date().toISOString(),results},null,2));
}finally{await browser.close();}
