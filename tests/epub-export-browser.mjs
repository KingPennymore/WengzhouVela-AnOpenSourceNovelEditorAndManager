import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildRecord} from '../web/rich-text.mjs';

// 导出 EPUB: book information from the workspace, chapter range, formats, cover, well-formed XML and a stable identifier.
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n　　林舟冷笑一声，转身离去。\n\n　　苏晚心中暗道不好 & <好>。\n\n——完——\n\n第二章 云涌\n\n　　风满楼。';
const at=quote=>[novel.indexOf(quote),novel.indexOf(quote)+quote.length];
const marks=[{group:'marks',type:'strong',from:at('林舟冷笑')[0],to:at('林舟冷笑')[1]},{group:'marks',type:'emphasis',from:at('不好')[0],to:at('不好')[1]},{group:'blocks',type:'align',value:'center',from:at('——完——')[0],to:at('——完——')[1]}];
// The formats live in the work's .vela, as written since 0.9.8.
const vela=JSON.stringify({version:3,kind:'workspace',id:'voyage',project:{name:'航程',author:'某作者',description:'雪夜的故事。'},reading:{items:[{path:'正文.txt'}]},richText:{documents:{'正文.txt':buildRecord(novel,marks)}}});
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082','hex');
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'book',openIds:['book'],settings:{theme:'light'},documents:[{id:'book',name:'正文.txt',path:'航程/正文.txt',text:novel,updatedAt:1},{id:'config',name:'.vela',path:'航程/.vela',text:vela,updatedAt:1}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady===true);await openRecentFile(page,page.locator('[data-recent="book"]'));await page.waitForFunction(()=>!!window.velaEditorView);
  const openEpub=async()=>{await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('导出 EPUB');await page.locator('.command-item').first().click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='导出 EPUB');};
  const exportEpub=async()=>{const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();const file=await download;return {name:file.suggestedFilename(),files:unzipSync(new Uint8Array(await readFile(await file.path())))};};
  let first;
  await check('the dialog takes book information from the workspace and covers every chapter',async()=>{
    await openEpub();
    assert.equal(await page.locator('#dialog-body [name=book]').inputValue(),'航程');assert.equal(await page.locator('#dialog-body [name=author]').inputValue(),'某作者');
    assert.equal(await page.locator('#dialog-body [name=description]').inputValue(),'雪夜的故事。');assert.equal(await page.locator('#dialog-body [name=language]').inputValue(),'zh-CN');
    assert.equal(await page.locator('#dialog-body [name=from]').inputValue(),'0');assert.equal(await page.locator('#dialog-body [name=to]').inputValue(),'1');
  });
  await check('the EPUB has the chapters, formats, metadata and cover',async()=>{
    await page.locator('#dialog-body [name=cover]').setInputFiles({name:'封面.png',mimeType:'image/png',buffer:png});
    first=await exportEpub();assert.equal(first.name,'航程.epub');
    const opf=strFromU8(first.files['OEBPS/content.opf']),chapter=strFromU8(first.files['OEBPS/text/chapter-001.xhtml']);
    assert.match(opf,/<dc:title>航程<\/dc:title>/);assert.match(opf,/<dc:creator>某作者<\/dc:creator>/);assert.match(opf,/properties="cover-image"/);
    assert.deepEqual([...first.files['OEBPS/images/cover.png']],[...png]);
    assert.match(chapter,/<strong>林舟冷笑<\/strong>/);assert.match(chapter,/<em class="emphasis">不好<\/em> &amp; &lt;好&gt;/);assert.match(chapter,/<p class="center">——完——<\/p>/);
    assert.match(strFromU8(first.files['OEBPS/text/chapter-002.xhtml']),/<h1>第二章 云涌<\/h1>/);
  });
  await check('every XML file in the EPUB is well-formed',async()=>{
    const sources=Object.entries(first.files).filter(([path])=>/\.(xhtml|opf|ncx|xml)$/.test(path)).map(([path,bytes])=>[path,strFromU8(bytes)]);
    const broken=await page.evaluate(sources=>sources.filter(([path,text])=>{const doc=new DOMParser().parseFromString(text,path.endsWith('.xhtml')?'application/xhtml+xml':'application/xml');return doc.getElementsByTagName('parsererror').length>0;}).map(([path])=>path),sources);
    assert.deepEqual(broken,[]);assert.equal(sources.length,7);
  });
  await check('exporting again keeps the book identifier, so readers see the same book',async()=>{
    await openEpub();const second=await exportEpub();const id=files=>strFromU8(files['OEBPS/content.opf']).match(/<dc:identifier id="book-id">([^<]+)</)[1];
    assert.equal(id(second.files),id(first.files));assert.match(id(first.files),/^urn:uuid:[0-9a-f-]{36}$/);
    assert.ok(!second.files['OEBPS/images/cover.png'],'no cover chosen this time');
  });
  await check('the chapter dialog opens the EPUB export with its chapter range',async()=>{
    if(!await page.locator('#export-chapters').isVisible())await page.locator('#outline-toggle').click();await page.locator('#export-chapters').click();
    await page.locator('#dialog-body [name=from]').selectOption('1');await page.locator('#dialog-body [name=to]').selectOption('1');await page.locator('#chapter-epub').click();
    await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='导出 EPUB');
    assert.equal(await page.locator('#dialog-body [name=from]').inputValue(),'1');
    const only=await exportEpub();assert.deepEqual(Object.keys(only.files).filter(path=>path.startsWith('OEBPS/text/')),['OEBPS/text/chapter-001.xhtml']);
    assert.match(strFromU8(only.files['OEBPS/text/chapter-001.xhtml']),/风满楼/);
  });
  await check('the TXT is unchanged by exporting',async()=>{
    assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),novel);
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/epub-export.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
