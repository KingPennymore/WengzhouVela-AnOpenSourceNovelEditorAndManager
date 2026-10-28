import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const config=createVelaV2('输入验证');config.editor.glossaries=['人物.gly'];
const doc=(id,name,text)=>({id,name,path:'Book/'+name,text,updatedAt:1});
const seed={version:1,documents:[doc('book','正文.txt','林舟站在港口。\n林舟前往青岚港。\nlinzhou linear\n'),doc('config','.vela',velaText(config)),doc('terms','人物.gly',JSON.stringify({version:1,entries:[{id:'lin',term:'林舟',definition:'航海记录者',aliases:[]}]}))],activeId:'book',openIds:['book'],settings:{theme:'dark',highlightTerms:true}};
const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||undefined});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(seed=>{localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));localStorage.setItem('vela.test.motion','off');Object.defineProperty(navigator,'platform',{get:()=> 'Win32'});window.nounMessages=[];const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.options)window.nounOptions=data.options;});}postMessage(data,...args){if((data.blocks||[]).length)window.nounMessages.push(data);return super.postMessage(data,...args);}};},seed);
 await page.goto(server.url+'/?ui=windows');await page.waitForFunction(()=>window.velaReady);
 if(await page.locator('#start-page').isVisible())await openRecentFile(page,page.locator('[data-recent=book]'));
 await page.waitForSelector('#editor .cm-editor');
 await page.evaluate(()=>{const v=velaEditorView;v.dispatch({selection:{anchor:v.state.doc.length}});v.focus();window.nounMessages=[];});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'lin',selectionStart:3,selectionEnd:3});
 await page.waitForTimeout(400);
 assert.equal(await page.locator('.cm-tooltip-autocomplete').count(),0,'no Latin candidates during IME pre-edit');
 assert.equal(await page.evaluate(()=>nounMessages.length),0,'pre-edit pinyin is not indexed');
 await cdp.send('Input.insertText',{text:'林'});
 await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>velaEditorView.composing),false);
 assert.ok(!(await page.evaluate(()=>velaEditorView.state.doc.toString())).endsWith('lin'),'pinyin is replaced by the committed Han character');
 await page.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('林舟'),null,{timeout:3000});
 await page.waitForTimeout(200);await page.keyboard.press('Enter');
 assert.ok((await page.evaluate(()=>velaEditorView.state.doc.toString())).endsWith('林舟'));
 console.log('PASS Windows IME: no pre-edit completion/indexing; committed Han candidates and insertion');
 // A non-glossary noun uses the worker-backed source after composition too.
 await page.keyboard.insertText('\n');
 await cdp.send('Input.imeSetComposition',{text:'qing',selectionStart:4,selectionEnd:4});
 await page.waitForTimeout(300);assert.equal(await page.locator('.cm-tooltip-autocomplete').count(),0);
 await cdp.send('Input.insertText',{text:'青岚'});
 try{await page.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('青岚港'),null,{timeout:5000});}catch(error){console.log('noun diagnostic',await page.evaluate(()=>({text:velaEditorView.state.doc.toString(),composing:velaEditorView.compositionStarted,popup:document.querySelector('.cm-tooltip-autocomplete')?.textContent,options:window.nounOptions,messages:window.nounMessages})));throw error;}
 await page.keyboard.press('Escape');
 await page.locator('.vela-term').first().hover();await page.locator('.vela-term-tip').waitFor();
 const tooltipColors=()=>page.locator('.vela-term-tip').evaluate(el=>{const ref=document.createElement('div');ref.style.cssText='background:var(--paper);color:var(--text)';document.body.append(ref);const a=getComputedStyle(el),b=getComputedStyle(ref),out={background:a.backgroundColor,paper:b.backgroundColor,color:a.color,text:b.color};ref.remove();return out;});
 let colors=await tooltipColors();assert.equal(colors.background,colors.paper);assert.equal(colors.color,colors.text);
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),true);
 await page.keyboard.press('Control+Alt+T');await page.waitForFunction(()=>!document.body.classList.contains('dark'));
 await page.locator('.vela-term').first().hover();await page.locator('.vela-term-tip').waitFor();
 colors=await tooltipColors();assert.equal(colors.background,colors.paper);assert.equal(colors.color,colors.text);
 console.log('PASS term hover follows dark/light colors');
 await page.evaluate(()=>{const form=document.createElement('form');form.id='checkbox-probe';form.style.cssText='position:fixed;bottom:10px;left:10px;z-index:10000;background:var(--paper)';form.innerHTML='<label><input type="checkbox" name="a">A</label><label><input type="checkbox" name="b">B</label><input type="checkbox" name="disabled" disabled>';document.body.append(form);});
 const first=page.locator('#checkbox-probe [name=a]'),second=page.locator('#checkbox-probe [name=b]');
 await first.focus();await page.keyboard.press('Space');await second.check();assert.equal(await first.isChecked(),true);assert.equal(await second.isChecked(),true);
 for(const [profile,width] of [['windows',1280],['harmonyos',390],['android',390]]){
  await page.setViewportSize({width,height:850});await page.evaluate(profile=>{document.body.dataset.ui=profile;document.body.style.setProperty('--accent','#bb55cc');},profile);
  const style=await first.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,width:s.width,height:s.height,fill:s.backgroundColor,appearance:s.appearance,clip:s.backgroundClip};});
  assert.equal(style.radius,'50%');assert.equal(style.width,style.height);assert.equal(style.fill,'rgb(187, 85, 204)');assert.equal(style.appearance,'none');assert.equal(style.clip,'content-box');
 }
 await first.uncheck();assert.equal(await first.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await second.isChecked(),true,'checkboxes stay independent');
 assert.deepEqual(await page.locator('#checkbox-probe').evaluate(el=>[...new FormData(el).keys()]),['b']);
 console.log('PASS circular checkboxes: keyboard, multiple selection, hollow/fill, custom accent and three profiles');
 await page.locator('#checkbox-probe').evaluate(el=>el.remove());
 await page.setViewportSize({width:1280,height:850});
 await page.evaluate(()=>{document.body.dataset.ui='windows';const v=velaEditorView,text='普通正文。'.repeat(15000)+'\n星澜值守着灯塔。\n星';v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length},userEvent:'input.type'});v.focus();});
 await page.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('星澜'),null,{timeout:15000});
 console.log('PASS completion waits for all batches of the large-document noun index');
 // Replacing a selection that starts right after "，"/"。" (a <wbr> wrap opportunity) through an IME must not keep the pinyin.
 for(const punct of ['，','。','']){
  await page.evaluate(punct=>{const v=velaEditorView,text='前文'+punct+'你好后文';v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text}});v.focus();v.dispatch({selection:{anchor:2+punct.length,head:4+punct.length}});},punct);
  await page.waitForTimeout(150);
  for(const pre of ['t','ta'])await cdp.send('Input.imeSetComposition',{text:pre,selectionStart:pre.length,selectionEnd:pre.length});
  await cdp.send('Input.insertText',{text:'他'});
  await page.waitForFunction(()=>!velaEditorView.composing);
  assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),'前文'+punct+'他后文',`IME selection replacement after "${punct}"`);
 }
 console.log('PASS IME replaces a selection after full-width punctuation without leftover pinyin');
 assert.deepEqual(errors,[]);

}finally{await browser.close();await server.close();}
