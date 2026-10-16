import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// Ruby, named styles and illustrations: toolbar, style panel (characters or paragraphs), dialogs, style management,
// saving into the work's .vela, reader and exports.
// The browser preview cannot read workspace images, so illustrations show placeholders and are left out of exports.
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n　　林舟冷笑一声。\n\n【叮！任务完成】\n\n　　她低声说道：“走。”';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
const byPath=(workspace,path)=>workspace.documents.find(doc=>(doc.path||doc.name)===path);
const velaOf=workspace=>JSON.parse(byPath(workspace,'.vela').text);
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'book',openIds:['book'],settings:{theme:'light',richText:true},documents:[{id:'book',name:'正文.txt',text:novel,updatedAt:1}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const enter=async()=>{await page.waitForFunction(()=>window.velaReady===true);await openRecentFile(page,page.locator('[data-recent="book"]'));await page.waitForFunction(()=>!!window.velaEditorView);};
  await page.goto(server.url);await enter();
  const selectText=text=>page.evaluate(text=>{const view=velaEditorView,at=view.state.doc.toString().indexOf(text);view.dispatch({selection:{anchor:at,head:at+text.length}});view.focus();},text);
  const cursorAt=text=>page.evaluate(text=>{const view=velaEditorView,at=view.state.doc.toString().indexOf(text);view.dispatch({selection:{anchor:at}});view.focus();},text);
  const nodes=(selector)=>page.evaluate(selector=>[...document.querySelectorAll(selector)].map(node=>node.textContent),selector);
  const applyStyle=async(id,scope)=>{await page.locator('#format-style').click();await page.locator('#format-style-panel').waitFor();if(scope)await page.locator(`#format-style-panel [data-scope="${scope}"]`).click();await page.locator(`#format-style-panel [data-style-id="${id}"]`).click();assert.equal(await page.locator('#format-style-panel').isVisible(),false,'the panel closes after applying');};
  await check('ruby is added from the toolbar and drawn above the text without adding text',async()=>{
    await selectText('林舟');await page.locator('#format-ruby').click();await page.locator('#dialog-body [name=reading]').fill('lín zhōu');await page.locator('#dialog-submit').click();
    assert.deepEqual(await nodes('.cm-content .vela-format-ruby'),['林舟']);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cm-content .vela-format-ruby'),'::before').content),'"lín zhōu"');
    assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),novel);
  });
  await check('the style panel applies a style to the paragraph without a selection and to the selected characters with one',async()=>{
    await cursorAt('【叮');await page.locator('#format-style').click();
    assert.equal(await page.locator('#format-style-panel [data-scope="chars"]').isDisabled(),true,'characters need a selection');assert.equal(await page.locator('#format-style-panel [data-scope="paragraph"]').getAttribute('aria-checked'),'true');
    assert.equal(await page.locator('#format-style-panel [data-style-id]').count(),4,'all built-in styles are listed');await page.locator('#format-style-panel [data-style-id="system"]').click();
    assert.deepEqual(await nodes('.cm-line.vela-style-block[data-style="system"]'),['【叮！任务完成】']);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cm-line.vela-style-block')).textAlign),'center');
    assert.equal(await page.locator('#format-style-label').textContent(),'系统提示','the button names the style under the cursor');
    await selectText('低声说道');await applyStyle('aside');
    assert.deepEqual(await nodes('.cm-content .vela-style[data-style="aside"]'),['低声说道']);assert.equal(await page.locator('#format-style-label').textContent(),'旁注');
  });
  await check('a paragraph style can be applied to just the selected characters',async()=>{
    await selectText('冷笑');await applyStyle('memory');
    assert.deepEqual(await nodes('.cm-content .vela-style[data-style="memory"]'),['冷笑']);assert.equal(await page.locator('.cm-line.vela-style-block[data-style="memory"]').count(),0);
    // The same style again on the same characters removes it.
    await selectText('冷笑');await applyStyle('memory');assert.deepEqual(await nodes('.cm-content .vela-style[data-style="memory"]'),[]);
    await selectText('冷笑');await applyStyle('system','chars');const style=await page.locator('.cm-content .vela-style[data-style="system"]').getAttribute('style');
    assert.match(style,/border/);assert.doesNotMatch(style,/text-align/,'alignment only applies to whole paragraphs');
  });
  await check('right alignment and clear formatting are on the toolbar; the selection menu does not repeat them',async()=>{
    await cursorAt('她低声');await page.locator('#format-right').click();assert.equal(await page.locator('.cm-line.vela-format-right').count(),1);assert.equal(await page.locator('#format-right').getAttribute('aria-pressed'),'true');
    // Without a selection 清除格式 clears the whole paragraph: the alignment and the 旁注 style on 低声说道 (since 0.9.8.1).
    await page.locator('#format-clear').click();assert.equal(await page.locator('.cm-line.vela-format-right').count(),0);assert.deepEqual(await nodes('.cm-content .vela-style[data-style="aside"]'),[]);
    await selectText('冷笑');await page.locator('#format-strong').click();await selectText('林舟冷笑一声');await page.locator('#format-clear').click();
    assert.deepEqual(await nodes('.cm-content .vela-format-strong'),[]);assert.deepEqual(await nodes('.cm-content .vela-style[data-style="system"]'),[]);assert.deepEqual(await nodes('.cm-content .vela-format-ruby'),[],'ruby in the selection is cleared too');
    await page.keyboard.press('Control+Z');assert.deepEqual(await nodes('.cm-content .vela-format-ruby'),['林舟'],'undo brings the cleared formats back');
    await page.evaluate(()=>window.wenzhouShowSelectionMenu());await page.locator('#selection-menu:not([hidden])').waitFor();
    const items=await page.locator('#selection-menu button').allTextContents();assert.ok(items.includes('复制'));for(const label of ['粗体','着重号','注音…'])assert.ok(!items.includes(label),label);
    await page.keyboard.press('Escape');
  });
  await check('a new style is saved to the work .vela under richText.styles and becomes available',async()=>{
    await page.evaluate(()=>window.wenzhouSave());
    await page.locator('#format-style').click();await page.locator('#format-style-panel [data-style-manage]').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='管理样式');
    await page.locator('#dialog-body [name=id]').fill('whisper');await page.locator('#dialog-body [name=label]').fill('耳语');await page.locator('#dialog-body [name=block]').selectOption('inline');await page.locator('#dialog-body [name=size]').selectOption('small');await page.locator('#dialog-body [name=color]').selectOption('muted');
    await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
    const config=velaOf(await stored(page));assert.equal(config.version,3);assert.deepEqual(config.richText.styles.whisper,{label:'耳语',block:false,size:'small',color:'muted'});assert.equal(config.styles,undefined);
    await selectText('走');await applyStyle('whisper');assert.deepEqual(await nodes('.cm-content .vela-style[data-style="whisper"]'),['走']);
  });
  await check('an illustration is inserted after the paragraph, shown as a placeholder here, and can be edited',async()=>{
    await cursorAt('林舟冷笑');await page.locator('#format-image').click();await page.locator('#dialog-body [name=src]').fill('插图/雪夜.png');await page.locator('#dialog-body [name=alt]').fill('雪夜');await page.locator('#dialog-submit').click();
    await page.locator('.cm-content .vela-format-image').waitFor();assert.match(await page.locator('.vela-format-image').textContent(),/插图\/雪夜\.png.*雪夜/);
    await page.locator('.vela-format-image').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='编辑插图');
    await page.locator('#dialog-body [name=alt]').fill('雪夜山门');await page.locator('#dialog-submit').click();await page.waitForFunction(()=>document.querySelector('.vela-format-image figcaption')?.textContent==='雪夜山门');
    await page.locator('#format-image').click();await page.locator('#dialog-body [name=src]').fill('../外面.png');await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('相对路径'));await page.keyboard.press('Escape');
  });
  await check('everything is saved in the work .vela and comes back after a reload',async()=>{
    await page.evaluate(()=>window.wenzhouSave());const workspace=await stored(page),record=velaOf(workspace).richText.documents['正文.txt'];assert.equal(byPath(workspace,'正文.txt.vela'),undefined);
    // Bold and the character style on 冷笑 are back from the undo above.
    assert.deepEqual(record.marks.map(mark=>[mark.type,mark.value??null,mark.quote]).sort(),[['ruby','lín zhōu','林舟'],['strong',null,'冷笑'],['style','system','冷笑'],['style','whisper','走']].sort());
    assert.deepEqual(record.blocks.map(block=>[block.type,block.value]),[['style','system']]);assert.deepEqual(record.inserts.map(item=>[item.src,item.alt]),[['插图/雪夜.png','雪夜山门']]);
    assert.equal(byPath(workspace,'正文.txt').text,novel);
    await page.reload();await enter();
    assert.deepEqual(await nodes('.cm-content .vela-format-ruby'),['林舟']);assert.equal(await page.locator('.cm-line.vela-style-block').count(),1);assert.equal(await page.locator('.vela-format-image').count(),1);
  });
  await check('the reader shows ruby, styles and the illustration box while its text stays the TXT',async()=>{
    await page.locator('[data-view="reader"]').click();await page.locator('[data-read="book"]').click();await page.locator('.reader-content .reader-format-ruby').waitFor();
    assert.equal(await page.locator('.reader-content .reader-format-ruby').getAttribute('data-ruby'),'lín zhōu');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.reader-content .reader-style-block[data-style="system"]')).textAlign),'center');
    assert.equal(await page.locator('.reader-content .reader-style[data-style="whisper"]').textContent(),'走');
    assert.equal(await page.locator('.reader-content .reader-format-image.missing').getAttribute('data-caption'),'雪夜山门');
    assert.equal(await page.evaluate(()=>document.querySelector('.reader-content').textContent),novel);
    await page.locator('#reader-back').click();await page.locator('[data-view="write"]').click();await page.waitForFunction(()=>!!window.velaEditorView&&!document.querySelector('#editor').hidden);
  });
  await check('HTML export has ruby and style classes and reports the unreadable illustration',async()=>{
    if(!await page.locator('#export-chapters').isVisible())await page.locator('#outline-toggle').click();await page.locator('#export-chapters').click();await page.locator('#dialog-body [name=format]').selectOption('html');
    const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();const html=await readFile(await (await download).path(),'utf8');
    assert.match(html,/<ruby>林舟<rp>（<\/rp><rt>lín zhōu<\/rt><rp>）<\/rp><\/ruby>/);assert.match(html,/<p class="style-system">/);assert.match(html,/span\.style-whisper\{font-size:\.85em;color:#6b6b6b\}/);assert.doesNotMatch(html,/<figure/);
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('1 张插图无法读取'));
  });
  await check('EPUB export carries ruby and style rules',async()=>{
    await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('导出 EPUB');await page.locator('.command-item').first().click();
    const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();const files=unzipSync(new Uint8Array(await readFile(await (await download).path())));
    assert.match(strFromU8(files['OEBPS/text/chapter-001.xhtml']),/<rt>lín zhōu<\/rt>/);assert.match(strFromU8(files['OEBPS/styles/book.css']),/\.style-whisper\{/);
    assert.ok(!Object.keys(files).some(path=>path.includes('illustration')));
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/rich-text-formats.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
