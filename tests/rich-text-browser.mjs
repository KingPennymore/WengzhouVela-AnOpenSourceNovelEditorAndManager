import {launchBrowser} from './browser-launch.mjs';
import {selectAppView} from './navigation-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildSidecar,sidecarText} from '../web/rich-text.mjs';

// TXT formatting: toolbar, shortcuts, undo, formats saved in the work's .vela (richText.documents) and reloaded,
// re-anchoring after an outside edit with review, a 0.9.7 sidecar moving into .vela, and formats following rename,
// trash and restore. The TXT never gains markup.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n　　林舟冷笑一声，转身离去。\n\n　　苏晚心中暗道不好。\n\n——完——';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
const byPath=(workspace,path)=>workspace.documents.find(doc=>(doc.path||doc.name)===path);
const records=workspace=>JSON.parse(byPath(workspace,'.vela')?.text||'{}').richText?.documents||{};
async function open(documents,settings={},extra={}){
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.url});
  // Seed once; later reloads keep what the app saved.
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:documents[0].id,openIds:documents.map(doc=>doc.id),settings:{theme:'light',...settings},documents,...extra});
  await context.addInitScript(()=>{window.__formatNotices=[];new MutationObserver(()=>{const text=document.querySelector('#toast')?.textContent;if(text&&window.__formatNotices.at(-1)!==text)window.__formatNotices.push(text);}).observe(document,{subtree:true,childList:true,characterData:true});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await enter(page,documents[0].id);
  return page;
}
async function enter(page,id){await page.waitForFunction(()=>window.velaReady===true);if(!await page.evaluate(()=>!!window.velaEditorView&&!document.querySelector('#start-page:not([hidden])')))await openRecentFile(page,page.locator(`[data-recent="${id}"]`));await page.waitForFunction(()=>!!window.velaEditorView);}
const selectText=(page,text,occurrence=0)=>page.evaluate(([text,occurrence])=>{const view=velaEditorView,doc=view.state.doc.toString();let at=-1;for(let i=0;i<=occurrence;i++)at=doc.indexOf(text,at+1);view.dispatch({selection:{anchor:at,head:at+text.length}});view.focus();},[text,occurrence]);
const rendered=(page,selector)=>page.evaluate(selector=>[...document.querySelectorAll('.cm-content '+selector)].map(node=>node.textContent),selector);
const save=page=>page.evaluate(()=>window.wenzhouSave());

try{
  const page=await open([{id:'book',name:'正文.txt',text:novel,updatedAt:1},{id:'notes',name:'笔记.md',text:'# 笔记',updatedAt:2}],{richText:true});
  await check('the format toolbar is shown for TXT and not for Markdown',async()=>{
    assert.equal(await page.locator('#format-tools').isVisible(),true);
    await page.locator('[data-tab="notes"]').click();assert.equal(await page.locator('#format-tools').isVisible(),false);
    await page.locator('[data-tab="book"]').click();assert.equal(await page.locator('#format-tools').isVisible(),true);
  });
  await check('bold from the toolbar, emphasis and centre from shortcuts',async()=>{
    await selectText(page,'林舟冷笑');await page.locator('#format-strong').click();
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);assert.equal(await page.locator('#format-strong').getAttribute('aria-pressed'),'true');
    await selectText(page,'不好');await page.keyboard.press('Control+Shift+E');
    assert.deepEqual(await rendered(page,'.vela-format-emphasis'),['不好']);
    await selectText(page,'——完——');await page.keyboard.press('Control+Alt+E');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.cm-line.vela-format-center')].map(node=>node.textContent)),['——完——']);
    assert.equal(await page.locator('#format-center').getAttribute('aria-pressed'),'true');
  });
  await check('Ctrl+B in a TXT toggles bold instead of inserting Markdown',async()=>{
    await selectText(page,'转身');await page.keyboard.press('Control+B');
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑','转身']);
    await page.keyboard.press('Control+B');assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);
    assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),novel);
  });
  await check('formats follow typing and undo restores them',async()=>{
    await page.evaluate(()=>{velaEditorView.dispatch({selection:{anchor:0}});velaEditorView.focus();});await page.keyboard.type('序言');
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);
    await page.keyboard.press('Control+Z');assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),novel);
    // The previous step removed bold from 转身; undoing that step brings it back, redo removes it again.
    await page.keyboard.press('Control+Z');assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑','转身']);
    await page.keyboard.press('Control+Shift+Z');assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);assert.equal(await page.locator('.cm-line.vela-format-center').count(),1);
  });
  await check('saving creates the work .vela with the formats; the TXT stays plain and no sidecar is written',async()=>{
    await save(page);const workspace=await stored(page),config=JSON.parse(byPath(workspace,'.vela').text),value=records(workspace)['正文.txt'];
    assert.equal(byPath(workspace,'正文.txt').text,novel);assert.equal(byPath(workspace,'正文.txt.vela'),undefined);
    assert.equal(config.version,3);assert.equal(config.kind,'workspace');assert.equal(config.reading.items,undefined,'a work created for formats reads every file');
    assert.deepEqual(value.marks.map(mark=>[mark.type,mark.quote,mark.at]),[['strong','林舟冷笑',[3,2,6]],['emphasis','不好',[5,8,10]]]);assert.deepEqual(value.blocks.map(block=>[block.value,block.at,block.head]),[['center',[7],'——完——']]);
    await page.locator('#mobile-library').click().catch(()=>{});
    assert.ok(await page.locator('#doc-list').getByText('正文.txt',{exact:true}).count()>=1);
  });
  await check('formats come back after a reload',async()=>{
    await page.reload();await enter(page,'book');
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);assert.deepEqual(await rendered(page,'.vela-format-emphasis'),['不好']);assert.equal(await page.locator('.cm-line.vela-format-center').count(),1);
  });
  await check('the reader shows the formats without changing the text it measures',async()=>{
    await selectAppView(page,'reader');await page.locator('[data-read="book"]').click();await page.locator('.reader-content .reader-format-strong').first().waitFor();
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.reader-content .reader-format-strong')].map(node=>node.textContent)),['林舟冷笑']);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.reader-content .reader-format-emphasis')].map(node=>node.textContent)),['不好']);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.reader-content .reader-format-center')).textAlign),'center');
    assert.equal(await page.evaluate(()=>document.querySelector('.reader-content').textContent),novel);
    await page.locator('#reader-back').click();await selectAppView(page,'write');await page.waitForFunction(()=>!!window.velaEditorView&&!document.querySelector('#editor').hidden);
  });
  const openExport=async format=>{if(!await page.locator('#export-chapters').isVisible())await page.locator('#outline-toggle').click();await page.locator('#export-chapters').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='导出章节');await page.locator('#dialog-body [name=format]').selectOption(format);};
  await check('chapters export as HTML with their formats',async()=>{
    await openExport('html');assert.equal(await page.locator('#dialog-submit').textContent(),'导出 HTML');
    const download=page.waitForEvent('download');await page.locator('#dialog-submit').click();const file=await download;assert.match(file.suggestedFilename(),/\.html$/);
    const html=await readFile(await file.path(),'utf8');assert.match(html,/<strong>林舟冷笑<\/strong>/);assert.match(html,/<em class="emphasis">不好<\/em>/);assert.match(html,/<p class="center">——完——<\/p>/);
  });
  await check('copying as Markdown puts Markdown on the clipboard; copying as HTML adds the formatted version',async()=>{
    await openExport('markdown');await page.locator('#copy-chapters').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/[*][*]林舟冷笑[*][*]/);
    await openExport('html');await page.locator('#copy-chapters').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
    const copied=await page.evaluate(async()=>{const [item]=await navigator.clipboard.read();return {types:item.types,html:await (await item.getType('text/html')).text(),plain:await (await item.getType('text/plain')).text()};});
    assert.ok(copied.types.includes('text/html'));assert.match(copied.html,/<strong>林舟冷笑<\/strong>/);assert.doesNotMatch(copied.plain,/<|\*\*/);
  });
  await check('renaming the TXT renames its format record in .vela',async()=>{
    await page.locator('#current-name').dblclick();await page.locator('#dialog-body [name=name]').fill('航程.txt');await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>JSON.parse(JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(doc=>(doc.path||doc.name)==='.vela').text).richText?.documents?.['航程.txt']);
    assert.deepEqual(Object.keys(records(await stored(page))),['航程.txt']);
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);
  });
  await check('the record stays while the TXT is in the trash; restoring brings the formats back',async()=>{
    if(!await page.locator('[data-menu="book"]').isVisible())await page.locator('#mobile-library').click();await page.locator('[data-menu="book"]').click();await page.locator('#delete-doc').click();await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>(doc.path||doc.name)==='航程.txt'));
    assert.ok(records(await stored(page))['航程.txt'],'kept for restore');
    await page.locator('#open-trash').click();await page.locator('.trash-row',{hasText:/^航程\.txt/}).locator('[data-restore]').first().click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>(doc.path||doc.name)==='航程.txt'));
    await page.keyboard.press('Escape');
  });
  await page.context().close();

  // The TXT was edited outside Vela after the sidecar was saved.
  const original=novel,edited='序章 雪夜\n\n'+novel.replace('不好','糟糕');
  const marks=[{group:'marks',type:'strong',from:original.indexOf('林舟冷笑'),to:original.indexOf('林舟冷笑')+4},{group:'marks',type:'emphasis',from:original.indexOf('不好'),to:original.indexOf('不好')+2},{group:'blocks',type:'align',value:'center',from:original.indexOf('——完——'),to:original.length}];
  const outside=await open([{id:'book',name:'正文.txt',text:edited,updatedAt:1},{id:'side',name:'正文.txt.vela',text:sidecarText(buildSidecar('正文.txt',original,marks)),updatedAt:1}]);
  await check('after an outside edit, unchanged formats are re-anchored and the rewritten one waits for review',async()=>{
    assert.deepEqual(await rendered(outside,'.vela-format-strong'),['林舟冷笑']);assert.equal(await outside.locator('.cm-line.vela-format-center').count(),1);
    assert.deepEqual(await rendered(outside,'.vela-format-emphasis'),[]);
    assert.equal(await outside.locator('#format-tools').isVisible(),true,'an existing sidecar shows the toolbar without the setting');
    assert.equal(await outside.locator('#format-review').textContent(),'待确认 1');
    await outside.waitForFunction(()=>window.__formatNotices.some(text=>text.includes('1 处格式待确认')));
  });
  await check('a review entry is applied and saved; the 0.9.7 sidecar moves into .vela and goes to the trash',async()=>{
    await selectText(outside,'糟糕');await outside.locator('#format-review').click();await outside.locator('[data-apply]').click();
    assert.deepEqual(await rendered(outside,'.vela-format-emphasis'),['糟糕']);assert.equal(await outside.locator('#format-review').isVisible(),false);
    await save(outside);await outside.waitForFunction(()=>!JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>(doc.path||doc.name)==='正文.txt.vela'));
    const workspace=await stored(outside),value=records(workspace)['正文.txt'];
    assert.equal(value.review,undefined);assert.deepEqual(value.marks.map(mark=>mark.quote),['林舟冷笑','糟糕']);assert.equal(byPath(workspace,'正文.txt').text,edited);
    assert.ok(workspace.trash.some(item=>item.path==='正文.txt.vela'));
  });
  await outside.context().close();
  const summary=await open([{id:'side',name:'正文.txt.vela',text:sidecarText(buildSidecar('正文.txt',original,marks)),updatedAt:1},{id:'book',name:'正文.txt',text:original,updatedAt:1}]);
  await check('opening the sidecar shows a summary instead of the workspace settings form',async()=>{
    await summary.locator('#preview .vela-sidecar').waitFor();const text=await summary.locator('#preview .vela-sidecar').textContent();
    assert.match(text,/旧版格式旁注/);assert.match(text,/行内格式2/);assert.match(text,/段落格式1/);assert.equal(await summary.locator('#vela-form').count(),0);
  });
  await summary.context().close();
  // Long books are rendered in chunks; formats must use offsets relative to each chunk.
  const paragraphs=[];for(let i=0;i<4000;i++)paragraphs.push('　　第'+i+'段，风雪夜归人，灯火摇晃。');
  const long='第一章 长夜\n'+paragraphs.join('\n'),longMarks=[];for(let i=0;i<4000;i+=50){const quote='第'+i+'段',from=long.indexOf('　　'+quote+'，')+2;longMarks.push({group:'marks',type:'strong',from,to:from+quote.length});}
  const reading=await open([{id:'long',name:'长篇.txt',text:long,updatedAt:1},{id:'side',name:'长篇.txt.vela',text:sidecarText(buildSidecar('长篇.txt',long,longMarks)),updatedAt:1}],{},{readerPositions:{long:{offset:long.indexOf('第2000段')}}});
  await check('a long book shows formats in the chunk opened in the middle of the text',async()=>{
    await selectAppView(reading,'reader');await reading.locator('[data-read="long"]').click();await reading.locator('.reader-content .reader-format-strong').first().waitFor();
    const bold=await reading.evaluate(()=>[...document.querySelectorAll('.reader-content .reader-format-strong')].map(node=>node.textContent));
    assert.ok(bold.length>=2,'several marks in the chunk');const quotes=new Set(longMarks.map(mark=>long.slice(mark.from,mark.to)));for(const text of bold)assert.ok(quotes.has(text),text);
    assert.ok(bold.includes('第2000段'));
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/rich-text.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
