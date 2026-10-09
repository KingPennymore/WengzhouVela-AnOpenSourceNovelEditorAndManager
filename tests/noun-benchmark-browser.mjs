import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {writeCorpus} from '../scripts/noun-corpus.mjs';

const out='test-results/noun-benchmark';await mkdir(out,{recursive:true});
const {text,gold}=await writeCorpus(out,20261011,'han');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const result={browser:browser.version(),length:text.length,hanLength:gold.hanLength,sha256:gold.sha256,profiles:[],errors:[]};
const seed={version:1,documents:[{id:'long',name:'雨后的来信.txt',text,updatedAt:1},{id:'short',name:'另一篇.txt',text:'全新的正文。\n欧阳',updatedAt:2}],openIds:['long','short'],activeId:'long',settings:{theme:'light'}};
try{
  const page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(seed=>{
    localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));
    const Original=Worker;window.nounStats={live:0,pending:0,core:{},transfers:[],options:[]};
    window.Worker=class extends Original{
      constructor(url,opts){super(url,opts);this.noun=String(url).includes('noun-worker');if(this.noun){window.nounStats.live++;this.addEventListener('message',({data})=>{window.nounStats.pending--;window.nounStats.options=data.options;});}}
      postMessage(data,...rest){if(this.noun){const s=window.nounStats;s.pending++;for(const id of data.remove||[])delete s.core[id];for(const b of data.blocks||[])s.core[b.id]=b.end-b.start;s.transfers.push({characters:(data.blocks||[]).reduce((n,b)=>n+b.text.length,0),blocks:data.blocks?.length||0});}return super.postMessage(data,...rest);}
      terminate(){if(this.noun){window.nounStats.live--;this.noun=false;}return super.terminate();}
    };
  },seed);
  const t0=performance.now();await page.goto('http://127.0.0.1:4173/?ui=android');
  if(await page.locator('#start-page').isVisible())await page.locator('[data-recent=long]').click();
  await page.waitForSelector('.cm-editor');result.editorReadyMs=performance.now()-t0;
  const type=()=>page.evaluate(async()=>{const v=editorManager.editor,times=[];for(let i=0;i<30;i++){const t=performance.now();v.dispatch({changes:{from:0,insert:'字'}});await new Promise(requestAnimationFrame);times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {p95Ms:times[28],maxMs:times[29]};});
  result.typingDuringIndex=await type();
  const idle=()=>page.waitForFunction(()=>nounStats.pending===0&&Object.values(nounStats.core).reduce((a,b)=>a+b,0)===editorManager.editor.state.doc.length,{},{timeout:30000});
  await idle();result.indexReadyFromNavigationMs=performance.now()-t0;
  result.names=await page.evaluate(names=>({found:names.filter(n=>nounStats.options.some(o=>o.label===n)).length,total:names.length,candidates:nounStats.options.length}),gold.entities.map(e=>e.name));
  assert.ok(result.names.found>=980,JSON.stringify(result.names));
  await page.evaluate(()=>{nounStats.transfers=[];});result.typingAfterIndex=await type();await idle();
  result.incrementalTransfers=await page.evaluate(()=>nounStats.transfers);
  assert.ok(result.typingDuringIndex.p95Ms<150,JSON.stringify(result.typingDuringIndex));
  assert.ok(result.typingAfterIndex.p95Ms<150,JSON.stringify(result.typingAfterIndex));
  assert.ok(result.incrementalTransfers.every(x=>x.characters<20000),JSON.stringify(result.incrementalTransfers));
  // Exercise the actual completion source after the long document's final batch.
  await page.evaluate(()=>{const v=editorManager.editor;v.dispatch({changes:{from:v.state.doc.length,insert:'\n欧阳'},selection:{anchor:v.state.doc.length+3}});v.focus();});
  await idle();await page.keyboard.press('Control+Space');await page.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('欧阳若水'));
  await page.keyboard.press('Escape');
  await page.locator('[data-tab=short]').click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>nounStats.live),1);
  await page.evaluate(()=>{const v=editorManager.editor;v.dispatch({selection:{anchor:v.state.doc.length}});v.focus();});await page.keyboard.press('Control+Space');await page.waitForTimeout(250);
  assert.ok(!(await page.locator('.cm-tooltip-autocomplete').allTextContents()).join('').includes('欧阳若水'));
  await page.keyboard.press('Escape');
  const longName='艾尔温·塞缪尔·麦金托什';
  await page.evaluate(name=>{const v=editorManager.editor,text=name+'说道。\n'+name.slice(0,-1);v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus();},longName);
  await page.waitForTimeout(300);await page.keyboard.press('Control+Space');await page.waitForFunction(name=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes(name),longName);
  // CodeMirror deliberately ignores acceptance keys just after a popup opens.
  await page.waitForTimeout(250);await page.keyboard.press('Enter');const accepted=await page.evaluate(()=>editorManager.editor.state.doc.toString());assert.ok(accepted.endsWith(longName),accepted);
  result.longPrefixCompletion=true;
  await page.keyboard.press('Escape');await page.locator('#settings').click();await page.locator('[name=autoNouns]').uncheck();await page.locator('#dialog-submit').click();assert.equal(await page.evaluate(()=>nounStats.live),0);
  await page.close();
  // The removed icons must stay absent with the sidebar both expanded and collapsed.
  for(const [profile,width] of [['android',390],['harmonyos',390],['windows',1280],['android',320]]){
    const context=await browser.newContext({viewport:{width,height:850}}),p=await context.newPage();p.on('pageerror',e=>result.errors.push(e.message));
    await p.goto('http://127.0.0.1:4173/?ui='+profile);await p.keyboard.press('Control+Alt+h');await p.waitForSelector('.start-stats');
    for(let toggle=0;toggle<2;toggle++){
      await p.waitForTimeout(500);
      assert.equal(await p.locator('.start-stat').count(),3);assert.equal(await p.locator('.start-stat svg,.start-stat .stat-icon').count(),0);
      for(const el of await p.locator('.start-stat strong').all()){const box=await el.boundingBox();assert.ok(box&&box.width>0&&box.height>0);}
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:`${out}/home-${profile}-${width}-${toggle}.png`,animations:'disabled'});await p.locator('#mobile-library').click();
    }
    result.profiles.push({profile,width,stats:3,icons:0});await context.close();
  }
  assert.deepEqual(result.errors,[]);await writeFile(out+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
