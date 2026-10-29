import {closeSettings} from './settings-helper.mjs';
import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// Custom palettes: create from settings with a live preview and readability notes, apply, persist, edit and delete.
const server=await startSourceAppServer();
const browser=await launchBrowser();
const checks=[],errors=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
try{
  const context=await browser.newContext({viewport:{width:1280,height:860}});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},{version:1,activeId:'book',openIds:['book'],settings:{theme:'light',palette:'pine'},documents:[{id:'book',name:'正文.txt',text:'第一章\n\n正文',updatedAt:1}]});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const enter=async()=>{await page.waitForFunction(()=>window.velaReady===true);await openRecentFile(page,page.locator('[data-recent="book"]'));await page.waitForFunction(()=>!!window.velaEditorView);};
  await page.goto(server.url);await enter();
  const token=name=>page.evaluate(name=>document.body.style.getPropertyValue('--'+name),name);
  const settings=async()=>{await page.locator('#more-tools').click();await page.locator('#settings').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='设置');};
  await check('a new palette starts from the current one and previews derived colours',async()=>{
    await settings();await page.locator('#new-palette').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='自定义配色');
    assert.equal(await page.locator('#dialog-body [name=light-accent]').inputValue(),'#23744e');
    await page.locator('#dialog-body [name=light-accent]').fill('#9c2f6b');
    assert.equal(await page.evaluate(()=>document.querySelector('[data-preview="light"]').style.getPropertyValue('--p-accent')),'#9c2f6b');
    assert.notEqual(await page.evaluate(()=>document.querySelector('[data-preview="light"]').style.getPropertyValue('--p-soft')),'');
  });
  await check('low contrast is pointed out while editing',async()=>{
    await page.locator('#dialog-body [name=light-text]').fill('#e0e0e0');
    assert.match(await page.locator('[data-warnings="light"]').textContent(),/正文与纸张对比度 .*低于 4\.5:1/);
    await page.locator('#dialog-body [name=light-text]').fill('#2a2a2a');assert.equal(await page.locator('[data-warnings="light"]').textContent(),'');
  });
  await check('saving applies the palette and lists it in settings',async()=>{
    await page.locator('#dialog-body [name=name]').fill('海棠');await page.locator('#dialog-submit').click();await page.locator('.settings-section').waitFor();await closeSettings(page);
    // A colour change is painted once the cross-fade starts, a moment after the dialog closes.
    await page.waitForFunction(()=>document.body.style.getPropertyValue('--accent')==='#9c2f6b');
    assert.equal(await token('accent'),'#9c2f6b');assert.equal(await token('text'),'#2a2a2a');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings);assert.equal(saved.customPalettes.length,1);assert.equal(saved.palette,saved.customPalettes[0].id);assert.equal(saved.customPalettes[0].name,'海棠');
    await settings();assert.equal(await page.locator('#dialog-body label.palette-choice.custom').count(),1);assert.equal(await page.locator('#dialog-body [name=palette]:checked').inputValue(),saved.palette);
    await page.keyboard.press('Escape');
  });
  // One press flips the look, but the class changes only once the cross-fade starts: wait for it instead of pressing again.
  const setDark=async dark=>{
    if(await page.evaluate(()=>document.body.classList.contains('dark'))===dark)return;
    await page.keyboard.press('Control+Alt+T');await page.waitForFunction(dark=>document.body.classList.contains('dark')===dark,dark);
  };
  await check('dark mode uses the palette’s own dark colours, and the palette survives a reload',async()=>{
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.customPalettes[0]);
    await setDark(true);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('dark')),true);assert.equal(await token('accent'),saved.dark.accent);assert.equal(await token('paper'),saved.dark.paper);
    // The theme switch is saved asynchronously; reloading before it lands would bring back the light look.
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.dark===true);
    await page.reload();await page.waitForFunction(()=>window.velaReady===true);
    assert.equal(await token('accent'),saved.dark.accent,'still the custom palette after reload');
    await setDark(false);
    assert.equal(await token('accent'),'#9c2f6b');
  });
  await check('editing and deleting a palette; deleting the active one falls back to 青松',async()=>{
    await settings();await page.locator('[data-edit-palette]').click();await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='编辑配色');
    assert.equal(await page.locator('#dialog-body [name=name]').inputValue(),'海棠');await page.locator('#delete-palette').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.customPalettes.length===0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.palette),'pine');
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/palette.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await server.close();}
