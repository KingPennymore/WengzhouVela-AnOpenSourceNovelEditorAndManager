import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {readPluginZip} from '../web/plugin-package.mjs';
import {packageEbookStudio} from '../scripts/package-ebook-studio.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const {bytes:pluginBytes}=await packageEbookStudio(),record=readPluginZip(pluginBytes),server=await startSourceAppServer();
const browser=await launchBrowser(),errors=[];
const chapter=(title,text)=>'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+title+'</title><link rel="stylesheet" href="../styles/book.css"/></head><body><h1>'+title+'</h1><p>'+text+'</p><img src="../images/cover.png" alt="封面"/><script>parent.BOOK_ATTACK=true</script></body></html>';
const cover=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082','hex');
const originalFiles={mimetype:[strToU8('application/epub+zip'),{level:0}],
 'META-INF/container.xml':strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="Book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
 'Book/package.opf':strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:test-book</dc:identifier><dc:title>测试书籍</dc:title><dc:creator>原作者</dc:creator><dc:language>zh-CN</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles/book.css" media-type="text/css"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'),
 'Book/nav.xhtml':strToU8('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol><li><a href="text/one.xhtml">第一章</a><ol><li><a href="text/two.xhtml">第二章</a></li></ol></li></ol></nav></body></html>'),
 'Book/text/one.xhtml':strToU8(chapter('第一章','原来的正文。')),'Book/text/two.xhtml':strToU8(chapter('第二章','第二章正文。')),
 'Book/styles/book.css':strToU8('body{line-height:1.7}p{color:#123456}'),'Book/images/cover.png':cover,'Book/fonts/preserved.bin':new Uint8Array([0,1,2,255])};
const original=zipSync(originalFiles),seed={version:1,documents:[{id:'plain',name:'正文.txt',text:'第一章 开始\n第一段正文。\n\n第二章 归航\n第二段正文。',updatedAt:1}],activeId:'plain',openIds:['plain'],settings:{theme:'light',libraryOpen:true}};
try{
 const page=await browser.newPage({viewport:{width:1400,height:950}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({seed,record})=>{if(window.top!==window)return;if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));if(!localStorage.getItem('wenzhou.plugins'))localStorage.setItem('wenzhou.plugins',JSON.stringify([record]));},{seed,record});
 await page.goto(server.url);await openRecentFile(page,page.locator('[data-recent="plain"]'));await page.waitForFunction(()=>document.querySelector('#file-input').accept.includes('.epub'),null,{timeout:5000}).catch(async error=>{console.log('PLUGIN DIAGNOSTICS',await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.plugins'))?.map(p=>({id:p.manifest.id,error:p.error}))),errors);throw error;});
 const engine=await build({entryPoints:['components/ebook-studio/engine.mjs'],bundle:true,write:false,format:'iife',globalName:'StudioEngine'});
 const reader=await build({entryPoints:['components/ebook-reader/engine.mjs'],bundle:true,write:false,format:'iife',globalName:'BookReader'});
 await page.route(server.url+'/test-engine.js',route=>route.fulfill({contentType:'text/javascript',body:engine.outputFiles[0].text}));await page.route(server.url+'/test-reader.js',route=>route.fulfill({contentType:'text/javascript',body:reader.outputFiles[0].text}));
 await page.addScriptTag({url:server.url+'/test-engine.js'});await page.addScriptTag({url:server.url+'/test-reader.js'});
 await page.locator('#file-input').setInputFiles({name:'测试书籍.epub',mimeType:'application/epub+zip',buffer:Buffer.from(original)});
 await page.locator('.ebook-studio').waitFor();assert.equal(await page.locator('[data-chapters] option').count(),2);
 await page.frameLocator('iframe[title="电子书制作预览"]').locator('p').filter({hasText:'原来的正文'}).waitFor();
 assert.equal(await page.evaluate(()=>window.BOOK_ATTACK),undefined);
 await page.waitForFunction(()=>document.querySelector('iframe[title="电子书制作预览"]'));
 assert.ok(await page.frameLocator('iframe[title="电子书制作预览"]').locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
 let exported=page.waitForEvent('download');await page.locator('[data-action="epub"]').click();let download=await exported,files=unzipSync(new Uint8Array(await readFile(await download.path())));
 assert.deepEqual(files['Book/images/cover.png'],new Uint8Array(cover));assert.deepEqual(files['Book/fonts/preserved.bin'],new Uint8Array([0,1,2,255]));assert.equal(strFromU8(files['Book/nav.xhtml']),strFromU8(originalFiles['Book/nav.xhtml']));
 console.log('PASS EPUB import and original CSS, image, font and nested TOC preservation');

 await page.locator('[data-mode="source"]').click();await page.locator('[data-source]').fill('<h1>第一章</h1><p>修改后的中文正文。</p><img src="../images/cover.png" alt="封面"/>');await page.locator('[data-action="save"]').click();
 await page.locator('.es-metadata summary').click();await page.locator('[data-meta="author"]').fill('新作者');await page.locator('[data-meta="title"]').click();
 await page.locator('[data-template]').selectOption('novel');
 await page.locator('[data-action="down"]').click();assert.equal(await page.locator('[data-chapters] option').first().textContent(),'第二章');
 exported=page.waitForEvent('download');await page.locator('[data-action="epub"]').click();download=await exported;files=unzipSync(new Uint8Array(await readFile(await download.path())));
 assert.match(strFromU8(files['Book/package.opf']),/新作者/);assert.match(strFromU8(files['Book/text/one.xhtml']),/修改后的中文正文/);assert.match(strFromU8(files['Book/styles/vela-layout.css']),/text-indent:2em/);
 const info=await page.evaluate(files=>{const opf=StudioEngine.parseXml(files.opf);return {spine:[...opf.getElementsByTagNameNS('*','itemref')].map(n=>n.getAttribute('idref')),errors:Object.values(files.xml).map(s=>{try{StudioEngine.parseXml(s);return null;}catch(e){return e.message;}}).filter(Boolean)};},{opf:strFromU8(files['Book/package.opf']),xml:Object.fromEntries(Object.entries(files).filter(([name])=>/\.(opf|xml|xhtml)$/.test(name)).map(([name,bytes])=>[name,strFromU8(bytes)]))});
 assert.deepEqual(info.spine,['c2','c1']);assert.deepEqual(info.errors,[]);
 console.log('PASS metadata, chapter editing, reordering, template CSS and well-formed EPUB export');

 exported=page.waitForEvent('download');await page.locator('[data-action="mobi"]').click();download=await exported;const mobi=await readFile(await download.path());
 assert.equal(mobi.subarray(60,68).toString(),'BOOKMOBI');
 const readBack=await page.evaluate(bytes=>{const book=BookReader.readBook(Uint8Array.from(bytes),'book.mobi');return {text:BookReader.chapterDocument(book,0),format:book.format};},[...mobi]);
 assert.equal(readBack.format,'MOBI7');assert.match(readBack.text,/修改后的中文正文/);assert.match(readBack.text,/第二章正文/);
 console.log('PASS directly reused iepub WASM exports MOBI readable by an independent parser');

 await page.locator('[data-action="paged"]').click();await page.frameLocator('iframe[title="电子书制作预览"]').locator('.pagedjs_page').first().waitFor({timeout:8000}).catch(async error=>{console.log('PAGED DIAGNOSTICS',await page.locator('[data-status]').textContent(),await page.frameLocator('iframe[title="电子书制作预览"]').locator('body').innerText(),errors);throw error;});
 await page.frameLocator('iframe[title="电子书制作预览"]').locator('#status').filter({hasText:'共'}).waitFor();
 assert.equal(await page.evaluate(()=>window.BOOK_ATTACK),undefined);
 assert.ok(!(await page.locator('iframe[title="电子书制作预览"]').getAttribute('sandbox')).includes('allow-scripts'));
 await page.locator('[data-action="preview"]').click();await page.locator('.es-metadata summary').click();
 await page.setViewportSize({width:390,height:850});assert.equal(await page.locator('.ebook-studio').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await page.setViewportSize({width:1400,height:950});
 await mkdir('test-results/ebook-studio',{recursive:true});await page.screenshot({path:'test-results/ebook-studio/editor.png',fullPage:true});
 console.log('PASS directly reused Paged.js pagination, sandboxed preview and mobile width');

 await page.locator('[data-source]').fill('<p>尚未完成的草稿');await page.locator('[data-action="save"]').click();await page.waitForTimeout(700);await page.locator('#quick-save').click();
 const draft=await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('wenzhou.workspace'));return {id:w.activeId,book:JSON.parse(w.documents.find(d=>d.id===w.activeId).text)};});assert.equal(Object.values(draft.book.drafts)[0],'<p>尚未完成的草稿');
 await page.reload();await openRecentFile(page,page.locator('[data-recent="'+draft.id+'"]'));await page.locator('[data-chapters]').selectOption('1');assert.equal(await page.locator('[data-source]').inputValue(),'<p>尚未完成的草稿');
 await page.locator('[data-source]').fill('<h1>第一章</h1><p>已恢复的草稿。</p>');await page.locator('[data-action="save"]').click();
 console.log('PASS malformed XHTML draft survives save and restart without corrupting the EPUB');

 await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('电子书制作：新建书籍');await page.locator('.command-item').first().click();await page.waitForFunction(()=>document.querySelector('#current-name')?.textContent==='未命名书籍.vepub');
 await page.locator('.ebook-studio').waitFor();assert.ok(await page.locator('[data-source]').inputValue());
 exported=page.waitForEvent('download');await page.locator('[data-action="epub"]').click();download=await exported;const newFiles=unzipSync(new Uint8Array(await readFile(await download.path())));assert.ok(newFiles['OEBPS/content.opf']);
 assert.equal(await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('wenzhou.workspace'));return w.documents.find(d=>d.id===w.activeId).kind;}),'PLUGIN');
 assert.deepEqual(errors,[]);console.log('PASS directly reused epub-gen-memory creates and exports a new editable EPUB book');
}finally{await browser.close();await server.close();}
