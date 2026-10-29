import {launchBrowser} from './browser-launch.mjs';
import {selectAppView} from './navigation-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {createOutline,outlineText} from '../web/outline.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// Code-split bundle (web/lazy.mjs): startup fetches none of the on-demand feature chunks; each
// loads when its feature is first used; a chunk that fails to load leaves a clear message with a retry in place of
// the view instead of a blank page.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const docs=[{id:'outline',name:'大纲.pcs',path:'书/大纲.pcs',text:outlineText(createOutline()),updatedAt:1},{id:'book',name:'正文.txt',path:'书/正文.txt',text:'第一章 起航\n\n　　船离开港口。\n',updatedAt:1},{id:'math',name:'公式.md',path:'书/公式.md',text:'# 公式\n\n质能方程 $E=mc^2$。\n\n$$\\int_0^1 x\\,dx$$\n',updatedAt:1},{id:'paper',name:'论文.tex',path:'书/论文.tex',text:'\\documentclass{article}\n\\begin{document}\n\\section{引言}\n正文\n\\end{document}\n',updatedAt:1}];
docs.push({id:'terms',name:'术语.gly',path:'书/术语.gly',text:JSON.stringify({version:1,entries:[{id:'port',term:'港口',definition:'出发地'}]}),updatedAt:1},{id:'html',name:'页面.html',path:'书/页面.html',text:'<h1>安全预览</h1><script>window.untrusted=true</script>',updatedAt:1});
const seed={version:1,activeId:'book',openIds:['book','math','paper'],folders:['书'],settings:{theme:'light'},documents:docs};
const features=['pdf-preview','katex','reader','epub-export','latex-editor','latex-language','markdown-preview','html-preview','guide','subscriptions','update-view','component-download-view','glossary-view','project-archive'];
async function open({block=[],language='zh',empty=false,ready=true,items=[]}={}){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),requested=[];
  await context.addInitScript(seed=>{if(seed&&window===window.top&&!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},empty?null:{...seed,subscriptions:items,settings:{...seed.settings,language}});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route=>route.abort());
  const blocked=new Set(block);await context.route(/\/chunks\/[^?]*\.js(\?.*)?$/,route=>{const name=new URL(route.request().url()).pathname.split('/').pop().replace(/-[A-Z0-9]+\.js$/,'');requested.push(name);return blocked.has(name)?route.abort():route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);if(ready)await page.waitForFunction(()=>window.velaReady===true);
  return {context,page,requested,unblock:name=>blocked.delete(name)};
}
const preview=async page=>{await page.keyboard.press('Control+Shift+P');await page.locator('#preview').waitFor();};
try{
  await check('outline load failure and retry are translated in English',async()=>{const {context,page,unblock}=await open({block:['outline-view'],language:'en'});await openRecentFile(page,page.locator('[data-recent=outline]'));await page.getByRole('heading',{name:'Module failed to load'}).waitFor();unblock('outline-view');await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.outline-plane').waitFor();await context.close();});
  await check('startup loads none of the lazy feature chunks',async()=>{
    const {context,page,requested}=await open();await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
    assert.deepEqual(requested.filter(name=>features.includes(name)),[]);await context.close();
  });
  await check('Markdown load failures identify the feature and retry preserves rendering and sanitization',async()=>{
    const {context,page,requested,unblock}=await open({block:['markdown-preview'],language:'en'});
    await openRecentFile(page,page.locator('[data-recent=math]'));await preview(page);
    await page.locator('#preview .chunk-failure').waitFor();assert.match(await page.locator('#preview').textContent(),/Markdown preview/);
    unblock('markdown-preview');await page.locator('#preview [data-chunk-retry]').click();
    await page.locator('#preview h1').waitFor();await page.locator('#preview .katex').first().waitFor();
    assert.ok(requested.filter(name=>name==='markdown-preview').length>=2);await context.close();
  });
  await check('the guide loads on demand and retries without adding a document after failure',async()=>{
    const {context,page,unblock,requested}=await open({block:['guide']});
    await page.locator('[data-start=guide]').click();await page.locator('#toast').filter({hasText:'无法加载'}).waitFor();
    assert.equal(await page.locator('#start-page').isVisible(),true);
    unblock('guide');await page.locator('[data-start=guide]').click();await page.locator('.cm-editor').waitFor();
    assert.match(await page.locator('.cm-content').textContent(),/文舟操作指南/);assert.ok(requested.includes('guide'));await context.close();
  });
  await check('a new workspace retries a missing guide chunk without losing its initial document',async()=>{
    const {context,page,unblock}=await open({empty:true,ready:false,block:['guide']});
    await page.locator('#editor .chunk-failure').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('wenzhou.workspace')),null);
    unblock('guide');await page.locator('#editor [data-chunk-retry]').click();
    await page.waitForFunction(()=>window.velaReady===true);await page.locator('.cm-editor').waitFor();
    assert.match(await page.locator('.cm-content').textContent(),/文舟操作指南/);await context.close();
  });
  await check('subscriptions load on first entry and retry recovers the page',async()=>{
    const {context,page,unblock}=await open({block:['subscriptions'],items:[{repo:'sample/novel',unread:true,pageSeen:false,snapshot:{name:'sample/novel',checkedAt:1,releases:[]}}]});
    await selectAppView(page,'subscriptions');
    assert.equal(await page.locator('[data-view=subscriptions] .update-dot').evaluate(element=>element.hidden),true);
    await page.locator('#subscriptions-view .chunk-failure').waitFor();
    unblock('subscriptions');await page.locator('#subscriptions-view [data-chunk-retry]').click();
    await page.locator('#subscription-add').waitFor();await context.close();
  });
  await check('glossary and HTML previews load on demand and recover from missing chunks',async()=>{
    for(const [id,chunk,selector] of [['terms','glossary-view','.glossary-page'],['html','html-preview','iframe']]){
      const {context,page,unblock}=await open({block:[chunk]});
      await openRecentFile(page,page.locator(`[data-recent=${id}]`));
      if(id==='html')await preview(page);
      await page.locator('#preview .chunk-failure').waitFor();unblock(chunk);
      await page.locator('#preview [data-chunk-retry]').click();await page.locator('#preview '+selector).waitFor();
      if(id==='html'){assert.match(await page.locator('#preview iframe').getAttribute('srcdoc'),/安全预览/);assert.doesNotMatch(await page.locator('#preview iframe').getAttribute('srcdoc'),/<script/);}
      await context.close();
    }
  });
  await check('HTML reading reports a missing preview chunk inside the reader and retries',async()=>{
    const {context,page,unblock}=await open({block:['html-preview']});
    await selectAppView(page,'reader');await page.locator('[data-read=html]').click();
    await page.locator('.reader-content .chunk-failure').waitFor();unblock('html-preview');
    await page.locator('.reader-content [data-chunk-retry]').click();await page.locator('.reader-content iframe').waitFor();
    assert.match(await page.locator('.reader-content iframe').getAttribute('srcdoc'),/安全预览/);await context.close();
  });
  await check('downloads and updates show chunk failures in their dialogs and allow retry',async()=>{
    let {context,page,unblock}=await open({block:['component-download-view']});
    await page.locator('[data-start=plugins]').click();await page.locator('#component-downloads .chunk-failure').waitFor();
    unblock('component-download-view');await page.locator('#component-downloads [data-chunk-retry]').click();
    await page.locator('#component-downloads h3').waitFor();await context.close();
    ({context,page,unblock}=await open({block:['update-view'],language:'en'}));
    await page.locator('#more-tools').click();await page.locator('#check-update').click();
    await page.locator('#dialog-body .chunk-failure').waitFor();assert.match(await page.locator('#dialog-body').textContent(),/App updates/);
    unblock('update-view');await page.locator('#dialog-body [data-chunk-retry]').click();
    await page.locator('#dialog-body .chunk-failure').waitFor({state:'detached'});
    await page.locator('#dialog-cancel').click();await context.close();
  });
  await check('leaving Markdown while its chunk is pending keeps the new document intact',async()=>{
    const {context,page}=await open();let release;
    const gate=new Promise(resolve=>release=resolve);
    await page.route(/\/chunks\/markdown-preview-.*\.js$/,async route=>{await gate;await route.continue();});
    await openRecentFile(page,page.locator('[data-recent=math]'));await preview(page);
    await page.locator('#preview [role=status]').waitFor();await page.keyboard.press('Control+Alt+h');
    await openRecentFile(page,page.locator('[data-recent=book]'));release();
    await page.locator('.cm-content').filter({hasText:'船离开港口'}).waitFor();
    assert.equal(await page.locator('#preview').isVisible(),false);await context.close();
  });
  await check('formulas render through the KaTeX chunk, and a failed load shows the source as an error, not a blank',async()=>{
    let {context,page,requested}=await open();await openRecentFile(page,page.locator('[data-recent=math]'));await page.waitForSelector('.cm-editor');await preview(page);
    await page.locator('#preview .katex').first().waitFor();assert.equal(await page.locator('#preview .vela-math-pending').count(),0);assert.equal(await page.locator('#preview .katex-display').count(),1);assert.ok(requested.includes('katex'));await context.close();
    ({context,page}=await open({block:['katex']}));await openRecentFile(page,page.locator('[data-recent=math]'));await page.waitForSelector('.cm-editor');await preview(page);
    await page.locator('#preview .latex-error').first().waitFor();assert.match(await page.locator('#preview').textContent(),/E=mc\^2/);assert.match(await page.locator('#preview .latex-error').first().getAttribute('title'),/公式排版/);await context.close();
  });
  await check('the reader chunk loads on entering the reading page; a failure shows a message and retry recovers',async()=>{
    const {context,page,requested,unblock}=await open({block:['reader']});await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
    await selectAppView(page,'reader');await page.locator('#reader-view .chunk-failure').waitFor();assert.match(await page.locator('#reader-view .chunk-failure').textContent(),/阅读/);
    unblock('reader');await page.locator('#reader-view [data-chunk-retry]').click();await page.locator('#reader-view [data-read=book]').waitFor();await page.locator('[data-read=book]').click();await page.locator('.reader-content').waitFor();
    assert.match(await page.locator('.reader-content').textContent(),/船离开港口/);assert.ok(requested.filter(name=>name==='reader').length>=2);await context.close();
  });
  await check('opening a .tex file loads LaTeX editing and its preview loads pdf.js; a failed preview chunk is reported in place',async()=>{
    let {context,page,requested}=await open({block:['pdf-preview']});await openRecentFile(page,page.locator('[data-recent=paper]'));await page.waitForSelector('.cm-editor');
    await page.locator('.cm-editor .cm-foldGutter').first().waitFor();assert.ok(requested.includes('latex-language'));
    await preview(page);await page.locator('#preview .chunk-failure').waitFor();assert.match(await page.locator('#preview .chunk-failure').textContent(),/PDF 与 LaTeX 预览/);await context.close();
    ({context,page,requested}=await open());await openRecentFile(page,page.locator('[data-recent=paper]'));await page.waitForSelector('.cm-editor');await preview(page);
    await page.locator('#preview .tex-compile').first().waitFor();assert.ok(requested.includes('pdf-preview'));await context.close();
  });
  await check('EPUB export loads its builder only when exporting',async()=>{
    const {context,page,requested}=await open();await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
    assert.ok(!requested.includes('epub-export'));
    await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('导出 EPUB');await page.locator('.command-item').first().click();await page.locator('#dialog[open]').waitFor();
    const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();await download;assert.ok(requested.includes('epub-export'));await context.close();
  });
  assert.deepEqual(errors.filter(message=>!/Failed to fetch dynamically imported module|无法加载/.test(message)),[]);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/lazy-chunks.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
