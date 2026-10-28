import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildRecord} from '../web/rich-text.mjs';

// Reader feedback: jumping to a chapter from the preview switched back to the source view. In the TXT and Markdown
// previews, chapter and position jumps now scroll the preview; the source view still jumps as before.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const lines=[];for(let c=1;c<=30;c++){lines.push('第'+c+'章 第'+c+'夜');for(let p=0;p<8;p++)lines.push('　　风雪夜归人（'+c+'-'+p+'），灯火在远处摇晃，林舟缓缓抬起头。');}
const novel=lines.join('\n\n'),bold=novel.indexOf('林舟');
const markdown=Array.from({length:12},(_,i)=>'# 第'+(i+1)+'章\n\n'+Array.from({length:6},(_,p)=>'段落 '+(i+1)+'-'+p+'，'.repeat(1)+'夜色渐深。'.repeat(8)).join('\n\n')).join('\n\n');
try{
  const context=await browser.newContext({viewport:{width:1366,height:820}});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'book',openIds:['book','md'],settings:{theme:'light'},documents:[{id:'book',name:'正文.txt',text:novel,updatedAt:1},{id:'config',name:'.vela',text:JSON.stringify({version:3,kind:'workspace',id:'jump',project:{name:'跳转'},richText:{documents:{'正文.txt':buildRecord(novel,[{group:'marks',type:'strong',from:bold,to:bold+2}])}}}),updatedAt:1},{id:'md',name:'大纲.md',text:markdown,updatedAt:2}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady===true);await openRecentFile(page,page.locator('[data-recent="book"]'));await page.waitForFunction(()=>!!window.velaEditorView);
  const preview=async()=>{await page.keyboard.press('Control+Shift+P');await page.locator('#preview').waitFor();};
  const inPreview=()=>page.evaluate(()=>!document.querySelector('#preview').hidden&&document.querySelector('#editor').hidden);
  const offsetOf=selector=>page.evaluate(selector=>{const root=document.querySelector('#preview'),element=[...root.querySelectorAll(selector.tag)].find(item=>item.textContent.trim().startsWith(selector.text));return element?Math.round(element.getBoundingClientRect().top-root.getBoundingClientRect().top):null;},selector);
  const chapter=async title=>{if(!await page.locator('#outline-list').isVisible())await page.locator('#outline-toggle').click();await page.locator('#outline-list .chapter',{hasText:title}).first().click();};
  await check('the TXT preview shows chapter headings and formats while keeping the text',async()=>{
    await preview();assert.equal(await inPreview(),true);
    assert.equal(await page.locator('#preview .reader-section-title').count(),30);assert.equal(await page.locator('#preview .reader-format-strong').first().textContent(),'林舟');
    assert.equal(await page.evaluate(()=>document.querySelector('#preview').textContent),novel);
  });
  await check('choosing a chapter in the preview scrolls the preview to it and stays there',async()=>{
    await chapter('第20章 第20夜');assert.equal(await inPreview(),true,'still the preview');
    const top=await offsetOf({tag:'h2',text:'第20章 第20夜'});assert.ok(top>=0&&top<80,'chapter heading at the top, got '+top);
    assert.equal(await page.locator('#current-chapter').textContent(),'第20章 第20夜');
    await chapter('第3章 第3夜');const third=await offsetOf({tag:'h2',text:'第3章 第3夜'});assert.ok(third>=0&&third<80);assert.equal(await inPreview(),true);
  });
  await check('top, bottom and chapter-end jumps also stay in the preview',async()=>{
    await page.locator('#quick-bottom').click();assert.equal(await inPreview(),true);
    assert.ok(await page.evaluate(()=>{const root=document.querySelector('#preview');return root.scrollTop+root.clientHeight>=root.scrollHeight-2;}));
    await page.locator('#quick-top').click();assert.equal(await page.evaluate(()=>document.querySelector('#preview').scrollTop),0);
    await chapter('第5章 第5夜');await page.locator('#quick-chapter-bottom').click();assert.equal(await inPreview(),true);
    const next=await offsetOf({tag:'h2',text:'第6章 第6夜'});assert.ok(next!==null&&next>0&&next<820,'the end of chapter 5 is in view, next heading at '+next);
  });
  await check('the Markdown preview jumps to the rendered heading',async()=>{
    await page.locator('[data-tab="md"]').click();if(!await inPreview())await preview();
    await chapter('第9章');assert.equal(await inPreview(),true);const top=await offsetOf({tag:'h1',text:'第9章'});assert.ok(top>=0&&top<80,'heading at '+top);
  });
  await check('the source view still jumps to the chapter line',async()=>{
    await page.locator('[data-tab="book"]').click();if(await inPreview())await page.keyboard.press('Control+Shift+P');
    await chapter('第12章 第12夜');assert.equal(await inPreview(),false);
    assert.equal(await page.evaluate(()=>{const view=velaEditorView;return view.state.doc.lineAt(view.state.selection.main.head).text;}),'第12章 第12夜');
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/preview-jump.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
