import {editorAction} from './mobile-editor-helper.mjs';
import {settingsSection,closeSettings} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {settled} from './wait-helpers.mjs';

// Exercise the shared Settings form and app dialog on desktop and Android phone layouts.
// The HTTPS service is mocked; no manuscript or real credential leaves the browser.
const server=process.env.VELA_TEST_URL?{url:process.env.VELA_TEST_URL}:await startSourceAppServer();
const browser=await launchBrowser(),out='test-results/ai-assistant';
await mkdir(out,{recursive:true});
const seed={version:1,activeId:null,openIds:[],settings:{theme:'light',language:'zh-CN'},documents:[{id:'book',name:'book.txt',path:'book.txt',text:'第一章 启程：穿过漫长的海岸线直到远方灯塔亮起\n\n'+('林舟走出城门。\n'.repeat(100)),updatedAt:1}]};
try{
 for(const [width,height,theme] of [[1280,850,'light'],[390,844,'light'],[390,844,'dark'],[320,640,'light'],[844,390,'light']]){
  const profile=`${width}-${height}-${theme}`,mobile=width<900,errors=[],seen=[];
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:width<=600});
  await context.addInitScript(seed=>{
    if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));
    let visualHeight=null;const visual=new EventTarget();
    Object.defineProperties(visual,{height:{get:()=>visualHeight??innerHeight},width:{get:()=>innerWidth},scale:{value:1},offsetTop:{value:0},offsetLeft:{value:0}});
    Object.defineProperty(window,'visualViewport',{value:visual,configurable:true});
    window.setTestKeyboardHeight=value=>{visualHeight=value;visual.dispatchEvent(new Event('resize'));};
  },{...seed,settings:{...seed.settings,theme}});
  await context.route('https://mock-ai.test/**',route=>{
    const request=route.request();seen.push({url:request.url(),auth:request.headers().authorization||''});
    return route.fulfill({status:request.headers().authorization==='Bearer sk-good-1234'?200:401,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(request.headers().authorization==='Bearer sk-good-1234'?{data:[{id:'model-b'},{id:'model-a'}]}:{error:{message:'Incorrect API key provided'}})});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  const check=async(name,run)=>{await run();console.log('PASS',profile,name);};
  const field=name=>page.locator(`#ai-settings [name=ai${name}]`);
  const shot=async name=>{await settled(page);await page.screenshot({path:`${out}/${profile}-${name}.png`});};
  const openSettings=async()=>{
    await page.locator('#more-tools').click();await page.locator('#settings').click();
    await settingsSection(page,'ai');
    await field('Enabled').waitFor();
  };
  const closeAiSettings=async()=>{const other=field('ExtractModelOther');if(await other.isVisible())await other.dispatchEvent('change');await closeSettings(page);};
  const bounds=async()=>{
    await settled(page);
    const box=await page.locator('#dialog').evaluate(dialog=>{
      const r=dialog.getBoundingClientRect(),button=dialog.classList.contains('settings-dialog')?dialog.querySelector('#dialog-close'):dialog.querySelector('#dialog-cancel'),b=button.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:visualViewport.height,overflow:dialog.scrollWidth>dialog.clientWidth+1,reachable:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')===button};
    });
    assert.ok(box.left>=0&&box.right<=box.width+1&&box.top>=0&&box.bottom<=box.height+1&&!box.overflow&&box.reachable,JSON.stringify(box));
  };
  const clearOfText=async()=>{
    await settled(page);
    const boxes=await page.evaluate(()=>{
      const button=document.querySelector('#ai-button').getBoundingClientRect(),scroller=document.querySelector('#editor .cm-scroller').getBoundingClientRect(),editor=document.querySelector('#editor').getBoundingClientRect();
      const overlap=[...document.querySelectorAll('#editor .cm-line')].some(line=>{const range=document.createRange();range.selectNodeContents(line);return [...range.getClientRects()].some(r=>r.top<button.bottom&&r.bottom>button.top&&r.right>button.left&&r.left<button.right);});
      return {overlap,editorPadding:getComputedStyle(document.querySelector('#editor')).paddingTop,buttonRight:button.right,scrollBottom:scroller.bottom,editorBottom:editor.bottom,editorRight:editor.right};
    });
    assert.ok(boxes.editorPadding==='0px'&&boxes.buttonRight<=boxes.editorRight&&boxes.scrollBottom<=boxes.editorBottom+1,JSON.stringify(boxes));
  };
  try{
    await page.goto(server.url+'/?ui='+(mobile?'android':'harmonyos'));await page.waitForFunction(()=>window.velaReady);
    await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
    await check('AI is off by default and its panel is not loaded',async()=>{
      assert.equal(await page.locator('#ai-button').count(),0);
      assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/ai-panel/.test(entry.name))),false);
    });
    await check('Settings includes AI; enabling requires consent',async()=>{
      await openSettings();assert.equal(await page.locator('.ai-consent-dialog').count(),0);
      await field('Enabled').check();await page.locator('.ai-consent-dialog[open]').waitFor();
      await page.locator('.ai-consent-dialog button[value=cancel]').click();await page.waitForFunction(()=>!document.querySelector('[name=aiEnabled]').checked);
      await field('Enabled').check();await page.locator('.ai-consent-dialog button[value=agree]').click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.ai?.consented);
      await bounds();
    });
    await check('wrong key fails; Enter verifies a good key without submitting Settings',async()=>{
      await field('Provider').selectOption('custom');assert.equal(await page.locator('[data-ai-format]').isVisible(),true);
      await field('Endpoint').fill('https://mock-ai.test/v1');await field('Key').fill('sk-wrong');await page.locator('[data-ai-verify]').click();
      await page.locator('[data-ai-error]').filter({hasText:'Incorrect API key'}).waitFor();assert.match(await page.locator('.ai-key-status').textContent(),/尚未保存/);
      await field('Key').fill('sk-good-1234');await field('Key').press('Enter');
      await page.locator('.ai-key-status').filter({hasText:'1234'}).waitFor();assert.equal(await field('Key').inputValue(),'');
      assert.equal(await page.locator('#dialog').evaluate(el=>el.open),true);
      assert.deepEqual(await field('ExtractModel').locator('option').evaluateAll(options=>options.map(o=>o.value)),['model-a','model-b','\ufffdother']);
      assert.ok(seen.some(item=>item.url==='https://mock-ai.test/v1/models'&&item.auth==='Bearer sk-good-1234'));
      await field('SuggestModel').selectOption('model-b');
    });
    if(mobile)await check('keyboard viewport settles, keeps endpoint visible and preserves entered values',async()=>{
      await field('Endpoint').focus();
      // Observe an IME animation frame before the existing 100 ms coalescing timer commits.
      await page.evaluate(()=>setTestKeyboardHeight(130));await page.waitForTimeout(40);
      assert.ok(parseFloat(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--app-height')))>height*.5);
      await page.evaluate(value=>setTestKeyboardHeight(value),Math.min(430,height-130));
      await page.waitForFunction(()=>document.body.dataset.keyboard==='true');await bounds();
      assert.ok(await field('Endpoint').evaluate(input=>{const r=input.getBoundingClientRect(),p=input.closest('.settings-content').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1;}));
      assert.equal(await field('Endpoint').inputValue(),'https://mock-ai.test/v1');assert.equal(await page.evaluate(()=>scrollY),0);
      await shot('keyboard');await page.evaluate(()=>setTestKeyboardHeight(null));await page.waitForFunction(()=>document.body.dataset.keyboard==='false');
    });
    await check('model choices survive category navigation and save; key never enters workspace',async()=>{
      await settingsSection(page,'appearance');await settingsSection(page,'ai');await field('Endpoint').scrollIntoViewIfNeeded();
      await field('SuggestModel').waitFor();assert.equal(await field('SuggestModel').inputValue(),'model-b');await closeAiSettings();
      const stored=await page.evaluate(()=>localStorage.getItem('wenzhou.workspace')),ai=JSON.parse(stored).settings.ai;
      assert.equal(ai.enabled,true);assert.equal(ai.consented,true);assert.equal(ai.endpoint,'https://mock-ai.test/v1');assert.equal(ai.models.extract,'model-a');assert.equal(ai.models.suggest,'model-b');assert.ok(!stored.includes('sk-good-1234'));
    });
    await check('floating button preserves content space; action menu closes with Escape',async()=>{
      const button=page.locator('#ai-button');await button.waitFor();await clearOfText();await shot('editor');
      await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop=300;});await clearOfText();
      await button.click();await page.locator('#ai-actions:not([hidden])').waitFor();assert.equal(await page.locator('#dialog[open]').count(),0);
      assert.equal(await button.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#ai-actions button').count(),3);await shot('panel');
      if(mobile)assert.equal(await page.evaluate(()=>wenzhouBack()),true);else await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('#dialog').open);
      // Native dialog close events dispose the session on the next event turn.
      await page.waitForFunction(()=>document.querySelector('#ai-button').getAttribute('aria-expanded')==='false');
      await button.click();await page.locator('[data-ai-settings]').click();await field('Enabled').waitFor();await bounds();
      await field('ExtractModel').selectOption('\ufffdother');await field('ExtractModelOther').fill('manual-model');await closeAiSettings();
      await button.click();await page.locator('[data-ai-extract]').click();await page.locator('.ai-destination').filter({hasText:'manual-model'}).waitFor();await page.locator('#dialog-cancel').click();
    });
    await check('preview and home hide the button; disabling releases its reserved space',async()=>{
      await editorAction(page,'[data-display=preview]');await page.waitForFunction(()=>document.querySelector('#ai-button').hidden);
      await editorAction(page,'[data-display=source]');await page.waitForFunction(()=>!document.querySelector('#ai-button').hidden);
      await page.keyboard.press('Control+Alt+h');await page.locator('#start-page').waitFor();assert.equal(await page.locator('#ai-button').isHidden(),true);
      await openRecentFile(page,page.locator('[data-recent=book]'));await openSettings();await field('Enabled').uncheck();await closeAiSettings();
      assert.equal(await page.locator('#ai-button').isHidden(),true);assert.equal(await page.locator('#editor').evaluate(el=>getComputedStyle(el).paddingTop),'0px');
    });
    assert.deepEqual(errors,[]);
  }catch(error){await shot('failure');throw error;}finally{await context.close();}
 }
}finally{await browser.close();await server.close?.();}
