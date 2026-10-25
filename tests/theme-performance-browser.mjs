import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {themeShiftDone,settled} from './wait-helpers.mjs';
const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[];
const workspace=JSON.stringify({version:1,documents:[{id:'b',name:'正文.txt',text:'第一章\n\n林舟望着远处的灯塔。',updatedAt:1}],activeId:null,openIds:[],settings:{theme:'light'}});
async function open(snapshots){
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  await context.addInitScript(({workspace,snapshots})=>{
    window.themeSnapshots=0;
    const start=document.startViewTransition?.bind(document);
    document.startViewTransition=snapshots&&start?update=>{window.themeSnapshots++;return start(update);}:undefined;
    localStorage.setItem('wenzhou.workspace',workspace);
  },{workspace,snapshots});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);await openRecentFile(p,p.locator('[data-recent=b]'));await settled(p);return {context,p};
}
try{
  {const {context,p}=await open(true);
    // One snapshot cross-fade; element transitions (including pseudo-elements) are off underneath it.
    const first=await p.evaluate(()=>{document.querySelector('#theme').click();const line=document.querySelector('.cm-line');return {switching:document.documentElement.classList.contains('theme-switching'),line:getComputedStyle(line).transitionProperty,snapshots:themeSnapshots};});
    assert.equal(first.switching,true);assert.equal(first.snapshots,1);assert.match(first.line,/^(all|none)$/);
    await themeShiftDone(p);assert.equal(await p.evaluate(()=>document.body.classList.contains('dark')),true);
    // Rapid presses settle on the last look and leave no switching state behind.
    await p.evaluate(()=>{for(let i=0;i<2;i++)document.querySelector('#theme').click();});await themeShiftDone(p);assert.equal(await p.evaluate(()=>document.body.classList.contains('dark')),true);
    await p.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('#theme').click();});await themeShiftDone(p);assert.equal(await p.evaluate(()=>document.body.classList.contains('dark')),false);
    // Saving settings that do not change colours must not start a fade (it would block input for its duration).
    const before=await p.evaluate(()=>themeSnapshots);await p.evaluate(()=>window.dispatchEvent(new CustomEvent('wenzhouEnvironment',{detail:{dark:false}})));await settled(p);
    assert.equal(await p.evaluate(()=>themeSnapshots),before);
    // The next cold start paints the startup screen from the cached colours.
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('vela.appearance')).theme),'system');
    await context.close();}
  {const {context,p}=await open(false);
    // Without View Transitions the switch is immediate rather than a per-element fade.
    const fallback=await p.evaluate(()=>{document.querySelector('#theme').click();return {dark:document.body.classList.contains('dark'),switching:document.documentElement.classList.contains('theme-switching')};});
    assert.deepEqual(fallback,{dark:true,switching:false});
    await context.close();}
  assert.deepEqual(errors,[]);console.log('PASS 外观切换：整页快照淡化、连按收敛、颜色不变不淡化、不支持时瞬间切换');
}finally{await browser.close();await server.close();}
