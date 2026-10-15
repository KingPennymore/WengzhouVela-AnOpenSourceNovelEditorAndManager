import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {buildSidecar,sidecarText} from '../web/rich-text.mjs';

// TXT formatting (.vela v3): toolbar, shortcuts, undo, sidecar saving and reload, re-anchoring after an
// outside edit with review, and the sidecar following rename, trash and restore. The TXT never gains markup.
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const novel='第一章 风起\n\n　　林舟冷笑一声，转身离去。\n\n　　苏晚心中暗道不好。\n\n——完——';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
const byPath=(workspace,path)=>workspace.documents.find(doc=>(doc.path||doc.name)===path);
async function open(documents,settings={}){
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  // Seed once; later reloads keep what the app saved.
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:documents[0].id,openIds:documents.map(doc=>doc.id),settings:{theme:'light',...settings},documents});
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
  await check('saving writes a v3 sidecar beside the TXT; the TXT stays plain and the sidecar is not listed',async()=>{
    await save(page);const workspace=await stored(page),sidecar=byPath(workspace,'正文.txt.vela');
    assert.equal(byPath(workspace,'正文.txt').text,novel);assert.ok(sidecar);
    const value=JSON.parse(sidecar.text);assert.equal(value.version,3);assert.equal(value.kind,'document');assert.equal(value.target,'正文.txt');
    assert.deepEqual(value.marks.map(mark=>[mark.type,mark.quote]),[['strong','林舟冷笑'],['emphasis','不好']]);assert.deepEqual(value.blocks.map(block=>[block.value,block.quote]),[['center','——完——']]);
    await page.locator('#mobile-library').click().catch(()=>{});
    assert.equal(await page.locator('#doc-list').getByText('正文.txt.vela').count(),0);assert.ok(await page.locator('#doc-list').getByText('正文.txt',{exact:true}).count()>=1);
  });
  await check('formats come back after a reload',async()=>{
    await page.reload();await enter(page,'book');
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);assert.deepEqual(await rendered(page,'.vela-format-emphasis'),['不好']);assert.equal(await page.locator('.cm-line.vela-format-center').count(),1);
  });
  await check('renaming the TXT moves its sidecar and updates the target',async()=>{
    await page.locator('#current-name').dblclick();await page.locator('#dialog-body [name=name]').fill('航程.txt');await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>(doc.path||doc.name)==='航程.txt.vela'));
    const workspace=await stored(page);assert.equal(byPath(workspace,'正文.txt.vela'),undefined);assert.equal(JSON.parse(byPath(workspace,'航程.txt.vela').text).target,'航程.txt');
    assert.deepEqual(await rendered(page,'.vela-format-strong'),['林舟冷笑']);
  });
  await check('moving the TXT to the trash takes the sidecar; restoring brings both back',async()=>{
    await page.locator('[data-menu="book"]').click();await page.locator('#delete-doc').click();await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>/^航程\.txt/.test(doc.path||doc.name)));
    await page.locator('#open-trash').click();await page.locator('.trash-row',{hasText:/^航程\.txt(?!\.vela)/}).locator('[data-restore]').first().click();
    await page.waitForFunction(()=>{const docs=JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.map(doc=>doc.path||doc.name);return docs.includes('航程.txt')&&docs.includes('航程.txt.vela');});
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
    await outside.waitForFunction(()=>document.querySelector('#toast').textContent.includes('1 处格式待确认'));
  });
  await check('a review entry is applied to the selected text and saved',async()=>{
    await selectText(outside,'糟糕');await outside.locator('#format-review').click();await outside.locator('[data-apply]').click();
    assert.deepEqual(await rendered(outside,'.vela-format-emphasis'),['糟糕']);assert.equal(await outside.locator('#format-review').isVisible(),false);
    await save(outside);const value=JSON.parse(byPath(await stored(outside),'正文.txt.vela').text);
    assert.equal(value.review,undefined);assert.deepEqual(value.marks.map(mark=>mark.quote),['林舟冷笑','糟糕']);assert.equal(byPath(await stored(outside),'正文.txt').text,edited);
  });
  await outside.context().close();
  const summary=await open([{id:'side',name:'正文.txt.vela',text:sidecarText(buildSidecar('正文.txt',original,marks)),updatedAt:1},{id:'book',name:'正文.txt',text:original,updatedAt:1}]);
  await check('opening the sidecar shows a summary instead of the workspace settings form',async()=>{
    await summary.locator('#preview .vela-sidecar').waitFor();const text=await summary.locator('#preview .vela-sidecar').textContent();
    assert.match(text,/格式旁注/);assert.match(text,/行内格式2/);assert.match(text,/段落格式1/);assert.equal(await summary.locator('#vela-form').count(),0);
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/rich-text.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
