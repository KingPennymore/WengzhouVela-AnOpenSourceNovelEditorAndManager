import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),p=await browser.newPage({viewport:{width:1280,height:800}});
await p.addInitScript(()=>{
 const NativeWorker=Worker;window.nounTransfers=[];window.nounLive=0;
 window.Worker=class extends NativeWorker{constructor(url,opts){super(url,opts);this.noun=String(url).includes('noun-worker');if(this.noun)window.nounLive++;}postMessage(data,...args){if(this.noun)window.nounTransfers.push({bytes:(data.blocks||[]).reduce((n,b)=>n+b.text.length,0),blocks:(data.blocks||[]).length});return super.postMessage(data,...args);}terminate(){if(this.noun){window.nounLive--;this.noun=false;}return super.terminate();}};
 const text='\n'+('长文性能检查，保存完整正文。\n'.repeat(140000)).slice(0,1999970)+'\n星澜值守着灯塔。青岚港。';
 localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'long',name:'操作指南.txt',text,updatedAt:1},{id:'other',name:'另一篇.txt',text:'星',updatedAt:1}],openIds:['long','other'],activeId:'long',settings:{theme:'light'}}));
});
try{
 const start=performance.now();await p.goto('http://127.0.0.1:4173');await p.waitForSelector('.cm-editor');
 await p.evaluate(()=>{const v=editorManager.editor;v.dispatch({selection:{anchor:0}});v.focus();});await p.keyboard.insertText('星');
 // Index the distant last block before querying it. Keep user-visible typing independent.
 await p.waitForFunction(()=>window.nounTransfers.reduce((n,v)=>n+v.bytes,0)>2000000,{},{timeout:30000});await p.waitForTimeout(250);
 await p.keyboard.press('Control+Space');await p.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('星澜'),{},{timeout:30000});const indexedMs=performance.now()-start;await p.keyboard.press('Escape');
 const measure=await p.evaluate(async()=>{window.nounTransfers=[];const v=editorManager.editor,times=[];for(let n=0;n<20;n++){const t=performance.now();v.dispatch({changes:{from:30,insert:'字'}});await new Promise(requestAnimationFrame);times.push(performance.now()-t);}await new Promise(r=>setTimeout(r,500));times.sort((a,b)=>a-b);return {inputP95:times[19],incrementalTransfers:window.nounTransfers,liveWorkers:window.nounLive,length:v.state.doc.length};});
 assert.ok(measure.inputP95<150,JSON.stringify(measure));assert.ok(measure.incrementalTransfers.every(x=>x.bytes<20000),JSON.stringify(measure));assert.equal(measure.liveWorkers,1);
 await p.locator('[data-tab=other]').click();await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>window.nounLive),1);await p.evaluate(()=>editorManager.editor.focus());await p.keyboard.press('Control+End');await p.keyboard.press('Control+Space');await p.waitForTimeout(250);assert.ok(!(await p.locator('.cm-tooltip-autocomplete').allTextContents()).join('').includes('星澜'));
 await p.keyboard.press('Escape');await p.locator('#settings').click();await p.locator('[name=autoNouns]').uncheck();await p.locator('#dialog-submit').click();assert.equal(await p.evaluate(()=>window.nounLive),0);
 await writeFile('test-results/storyboard/noun-performance.json',JSON.stringify({indexedMs,...measure},null,2));console.log(JSON.stringify({indexedMs,...measure}));
}finally{await browser.close();}
