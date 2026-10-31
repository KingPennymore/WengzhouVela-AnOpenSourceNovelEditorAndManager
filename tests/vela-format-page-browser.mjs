import {editorAction} from './mobile-editor-helper.mjs';
import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildRecord} from '../web/rich-text.mjs';

// The .vela editor shows the work configuration and the TXT formats as two pages of one file: format records per
// TXT (with missing files marked and removable), styles, the format-tools switch, and an automatic reading list.
// On a phone the pages and the style panel use full-width controls.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n　　林舟冷笑一声。\n\n——完——';
const strong={group:'marks',type:'strong',from:novel.indexOf('林舟'),to:novel.indexOf('林舟')+2};
const config={version:3,kind:'workspace',id:'voyage',project:{name:'航程'},reading:{items:[{path:'正文.txt'}]},richText:{documents:{'正文.txt':buildRecord(novel,[strong]),'旧章.txt':buildRecord('旧的正文',[{group:'marks',type:'strong',from:0,to:2}])}}};
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
const velaOf=async page=>JSON.parse((await stored(page)).documents.find(doc=>(doc.path||doc.name)==='航程/.vela').text);
async function open(viewport){
  const context=await browser.newContext({viewport});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'config',openIds:['config','book'],settings:{theme:'light'},documents:[{id:'book',name:'正文.txt',path:'航程/正文.txt',text:novel,updatedAt:1},{id:'notes',name:'笔记.txt',path:'航程/笔记.txt',text:'笔记',updatedAt:1},{id:'config',name:'.vela',path:'航程/.vela',text:JSON.stringify(config),updatedAt:1}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady===true);
  if(!await page.evaluate(()=>!!window.velaEditorView&&!document.querySelector('#start-page:not([hidden])')))await openRecentFile(page,page.locator('[data-recent="config"]'));
  await page.locator('#vela-form').waitFor();return page;
}
try{
  const page=await open({width:1280,height:800});
  await check('the .vela editor has a configuration page and a TXT format page',async()=>{
    assert.deepEqual(await page.locator('[data-vela-page]').allTextContents(),['作品配置','TXT 格式']);
    assert.equal(await page.locator('[data-page="config"]').isVisible(),true);assert.equal(await page.locator('[data-page="format"]').isHidden(),true);
    await page.locator('[data-vela-page="format"]').click();assert.equal(await page.locator('[data-page="config"]').isHidden(),true);
    assert.match(await page.locator('.vela-config-mark').textContent(),/v3/);
  });
  await check('format records are listed per TXT; a missing TXT is marked',async()=>{
    const rows=page.locator('.vela-record-list li');assert.equal(await rows.count(),2);
    assert.match(await rows.filter({hasText:'正文.txt'}).textContent(),/文字格式 1/);assert.match(await rows.filter({hasText:'旧章.txt'}).textContent(),/文件不存在/);
    assert.equal(await rows.filter({hasText:'旧章.txt'}).locator('[data-record-open]').count(),0);
    assert.equal(await page.locator('.vela-style-list li').count(),4,'built-in styles are shown');
  });
  await check('removing a record asks once more, then saves the .vela without it and stays on the format page',async()=>{
    const remove=page.locator('[data-record-remove="旧章.txt"]');await remove.click();assert.equal(await remove.textContent(),'确认移除');await remove.click();
    await page.waitForFunction(()=>!JSON.parse(JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(doc=>(doc.path||doc.name)==='航程/.vela').text).richText.documents['旧章.txt']);
    assert.deepEqual(Object.keys((await velaOf(page)).richText.documents),['正文.txt']);
    await page.locator('.vela-record-list').waitFor();assert.equal(await page.locator('[data-page="format"]').isVisible(),true);
  });
  await check('the format-tools switch and an automatic reading list are saved with the configuration',async()=>{
    await page.locator('[name=richTextEnabled]').selectOption('true');
    await page.locator('[data-vela-page="config"]').click();await page.locator('[data-vela-section="阅读清单"]').click();
    const auto=page.locator('[name=readingAuto]');assert.equal(await auto.isChecked(),false);await auto.check();
    assert.equal(await page.locator('[name=readingFiles][value="笔记.txt"]').isChecked(),true,'every file is shown as included');
    await page.locator('#vela-form [data-vela-save]').click();await page.waitForFunction(()=>JSON.parse(JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(doc=>(doc.path||doc.name)==='航程/.vela').text).richText.enabled===true);
    const saved=await velaOf(page);assert.equal(saved.reading.items,undefined);assert.ok(saved.richText.documents['正文.txt'],'records are kept by a configuration save');
  });
  await check('“打开” opens the TXT with its formats',async()=>{
    await page.locator('[data-vela-page="format"]').click();await page.locator('[data-record-open="正文.txt"]').click();
    await page.waitForFunction(()=>document.querySelector('#current-name')?.textContent==='正文.txt');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.cm-content .vela-format-strong')].map(node=>node.textContent)),['林舟']);
  });
  await page.context().close();

  const phone=await open({width:375,height:812});
  await check('on a phone the page switch spans the width and the style panel is a bottom sheet',async()=>{
    const box=await phone.locator('.vela-pages').boundingBox(),form=await phone.locator('.vela-config-header').boundingBox();assert.ok(box.width>=form.width-2,'full width');
    for(const button of await phone.locator('.vela-pages button').all())assert.ok((await button.boundingBox()).height>=40);
    await phone.locator('[data-vela-page="format"]').click();await phone.locator('[data-record-open="正文.txt"]').click();await phone.waitForFunction(()=>!!window.velaEditorView&&!!document.querySelector('#format-tools:not([hidden])'));
    await phone.evaluate(()=>{const view=velaEditorView,at=view.state.doc.toString().indexOf('冷笑');view.dispatch({selection:{anchor:at,head:at+2}});view.focus();});
    await phone.locator('#format-style').scrollIntoViewIfNeeded();await editorAction(phone,'#format-style');
    const panel=phone.locator('#format-style-panel');await panel.waitFor();assert.match(await panel.getAttribute('class'),/format-style-sheet/);
    const sheet=await panel.boundingBox();assert.ok(Math.abs(sheet.x)<1&&Math.abs(sheet.width-375)<1&&Math.abs(sheet.y+sheet.height-812)<1,'docked to the bottom edge');
    for(const chip of await panel.locator('[data-style-id]').all())assert.ok((await chip.boundingBox()).height>=44);
    await panel.locator('[data-style-id="memory"]').click();assert.deepEqual(await phone.evaluate(()=>[...document.querySelectorAll('.cm-content .vela-style')].map(node=>node.textContent)),['冷笑']);
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/vela-format-page.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
