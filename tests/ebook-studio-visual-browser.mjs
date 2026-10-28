import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {readPluginZip} from '../web/plugin-package.mjs';
import {packageEbookStudio} from '../scripts/package-ebook-studio.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const {bytes}=await packageEbookStudio(),record=readPluginZip(bytes),server=await startSourceAppServer();
const browser=await launchBrowser(),errors=[];
const cover=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082','hex');
const chapter='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>江边的清晨</title><link rel="stylesheet" href="book.css"/></head><body epub:type="bodymatter"><h1 id="chapter-one">第一章 · 江边的清晨</h1><p id="opening" class="novel" style="line-height:1.9" lang="zh-CN">清晨的瓯江还笼着一层薄雾。渡船从对岸驶来，船头划开银灰色的水面。</p><p>林舟推开书店的木门，檐下的风铃响了一声。<a href="#note" epub:type="noteref" id="ref">注一</a></p><p>书页上写着<ruby>归航<rt>guī háng</rt></ruby>二字。</p><div class="notes"><p id="note" epub:type="footnote">注一：故事发生在一间江边书店。</p></div><p><img src="cover.png" alt="书籍插图" width="24"/></p><table class="special"><tbody><tr><td>保留的表格</td></tr></tbody></table><!-- 保留批注 --><svg xmlns="http://www.w3.org/2000/svg" onload="parent.BOOK_ATTACK=true"><text>矢量内容</text></svg><script>window.BOOK_ATTACK=true</script></body></html>';
const original=zipSync({mimetype:[strToU8('application/epub+zip'),{level:0}],
 'META-INF/container.xml':strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
 'Book/package.opf':strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:visual</dc:identifier><dc:title>沿江而行</dc:title><dc:creator>林舟</dc:creator><dc:language>zh-CN</dc:language></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="css" href="book.css" media-type="text/css"/><item id="cover" href="cover.png" media-type="image/png"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>'),
 'Book/one.xhtml':strToU8(chapter),'Book/two.xhtml':strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章 · 旧船票</title></head><body><h1>第二章 · 旧船票</h1><p>书页中夹着一张泛黄的船票。</p></body></html>'),
 'Book/book.css':strToU8('body{font-family:serif;line-height:1.9;color:#263c36}p{text-indent:2em}h1{text-align:center;font-size:1.6em}'),
 'Book/cover.png':cover});
const seed={version:1,documents:[{id:'plain',name:'创作笔记.txt',text:'示例文稿',updatedAt:1}],activeId:'plain',openIds:['plain'],settings:{theme:'light',libraryOpen:false}};
const activeBook=page=>page.evaluate(()=>{const workspace=JSON.parse(localStorage.getItem('wenzhou.workspace'));return JSON.parse(workspace.documents.find(doc=>doc.id===workspace.activeId).text);});
const exportBook=async page=>{const pending=page.waitForEvent('download');await page.locator('[data-action="epub"]').click();return unzipSync(new Uint8Array(await readFile(await (await pending).path())));};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},hasTouch:true});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({seed,record})=>{if(window.top!==window)return;if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));if(!localStorage.getItem('wenzhou.plugins'))localStorage.setItem('wenzhou.plugins',JSON.stringify([record]));},{seed,record});
 await page.goto(server.url);await openRecentFile(page,page.locator('[data-recent="plain"]'));
 await page.waitForFunction(()=>document.querySelector('#file-input').accept.includes('.epub'));
 await page.locator('#file-input').setInputFiles({name:'沿江而行.epub',mimeType:'application/epub+zip',buffer:Buffer.from(original)});
 const prose=page.locator('.es-prose');await prose.waitFor();
 assert.equal(await page.locator('[data-mode="visual"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>window.BOOK_ATTACK),undefined);
 assert.equal(await prose.locator('script,svg,table,a[href],[onload],#opening,.novel').count(),0);
 assert.ok(await prose.locator('.es-protected').count()>=4);
 await prose.locator('.es-book-image').evaluate(image=>image.decode());
 const untouched=await exportBook(page);assert.equal(strFromU8(untouched['Book/one.xhtml']),chapter);
 console.log('PASS visual view isolates EPUB markup, preserves protected content and leaves untouched chapter bytes unchanged');

 await prose.locator('p').first().click();await page.keyboard.press('End');await page.keyboard.press('Control+b');await page.keyboard.insertText('可视化新增文字');await page.keyboard.press('Control+b');
 await page.locator('[data-action="save"]').click();
 let files=await exportBook(page),edited=strFromU8(files['Book/one.xhtml']);
 assert.match(edited,/<strong>可视化新增文字<\/strong>/);assert.match(edited,/id="opening"/);assert.match(edited,/class="novel"/);assert.match(edited,/style="line-height:1.9"/);assert.match(edited,/href="#note"/);assert.match(edited,/epub:type="noteref"/);assert.match(edited,/<ruby/);assert.match(edited,/<table/);assert.match(edited,/保留批注/);assert.match(edited,/src="cover.png"/);assert.ok(!edited.includes('src="data:'));
 assert.deepEqual(files['Book/cover.png'],new Uint8Array(cover));
 await page.locator('[data-format="undo"]').click();assert.ok(!(await prose.innerText()).includes('可视化新增文字'));
 await page.locator('[data-format="redo"]').click();assert.ok((await prose.innerText()).includes('可视化新增文字'));
 await page.locator('[data-mode="source"]').click();assert.match(await page.locator('[data-source]').inputValue(),/可视化新增文字/);
 await page.locator('[data-mode="visual"]').click();assert.match(await prose.innerText(),/可视化新增文字/);
 await prose.locator('h1').click();await page.locator('[data-block]').selectOption('p');
 files=await exportBook(page);assert.match(strFromU8(files['Book/one.xhtml']),/<p id="chapter-one">/);
 console.log('PASS native formatting shortcuts, local undo/redo, visual/source switching, namespaces, anchors, images and block conversion');

 // A composition update must not recreate the editor or rewrite its DOM.
 await prose.locator('p').first().click();await page.keyboard.press('End');
 await prose.dispatchEvent('compositionstart',{data:''});await page.keyboard.insertText('中文输入');
 await page.waitForTimeout(650);assert.ok(await prose.evaluate(node=>node===document.activeElement));
 await prose.dispatchEvent('compositionend',{data:'中文输入'});await page.locator('[data-action="save"]').click();
 assert.match(strFromU8((await exportBook(page))['Book/one.xhtml']),/中文输入/);
 await prose.locator('p').first().click();await page.keyboard.press('End');await page.keyboard.insertText('立即切章');
 await page.locator('[data-chapters]').selectOption('1');await page.locator('[data-chapters]').selectOption('0');assert.match(await prose.innerText(),/立即切章/);
 await page.locator('#quick-save').click();const saved=await activeBook(page),savedId=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).activeId);
 await page.reload();await openRecentFile(page,page.locator('[data-recent="'+savedId+'"]'));await prose.waitFor();assert.match(await prose.innerText(),/立即切章/);assert.ok(saved.files['Book/one.xhtml']);
 console.log('PASS composition stability, rapid chapter switching and restart persistence');

 await mkdir('test-results/ebook-studio/visual',{recursive:true});
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:width===390?844:1050});
  assert.equal(await page.locator('.ebook-studio').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  assert.equal(await prose.isVisible(),true);
  if(width===390){
   assert.equal(await page.locator('.es-preview').isVisible(),false);
   const tools=page.locator('.es-rich-tools');assert.equal(await tools.evaluate(node=>node.scrollWidth>node.clientWidth),true);
   assert.equal(await tools.locator('button').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=40)),true);
   await page.locator('[data-format="bold"]').tap();await page.locator('[data-format="bold"]').tap();
   await page.screenshot({path:'test-results/ebook-studio/visual/mobile-390.png',fullPage:true});
   await page.locator('[data-action="toggle-preview"]').tap();assert.equal(await page.locator('.es-preview').isVisible(),true);
   await page.locator('[data-action="toggle-preview"]').tap();
  }else await page.screenshot({path:'test-results/ebook-studio/visual/desktop-'+width+'.png',fullPage:true});
 }
 // Shrinking the viewport approximates keyboard space; actual IME/device testing is separate.
 await page.setViewportSize({width:390,height:480});await prose.locator('p').first().tap();await page.keyboard.press('End');await page.keyboard.insertText('窄屏继续写作');await page.locator('[data-action="save"]').click();
 assert.match(strFromU8((await exportBook(page))['Book/one.xhtml']),/窄屏继续写作/);
 assert.deepEqual(errors,[]);
 console.log('PASS 390/768/1440 widths, touch toolbar, optional mobile preview and reduced-height editing');
}finally{await browser.close();await server.close();}
