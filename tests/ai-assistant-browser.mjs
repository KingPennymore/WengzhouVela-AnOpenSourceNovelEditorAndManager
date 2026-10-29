import assert from 'node:assert/strict';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

// AI assistant, phase 1 (docs/AI-ASSIST.md): settings, key verification in the browser preview, the floating button
// and its panel. The AI service is a mocked HTTPS endpoint.
const server=await startSourceAppServer(),browser=await launchBrowser(),errors=[];
const checks=[];const check=async(name,run)=>{await run();checks.push(name);console.log('PASS',name);};
try{
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  await context.addInitScript(()=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,activeId:null,openIds:[],settings:{theme:'light',language:'zh-CN'},documents:[{id:'book',name:'book.txt',path:'book.txt',text:'第一章 启程\n\n林舟走出城门。',updatedAt:1}]}));});
  const seen=[];
  await context.route('https://mock-ai.test/**',route=>{
    const request=route.request();seen.push({url:request.url(),auth:request.headers().authorization||''});
    if(request.headers().authorization!=='Bearer sk-good-1234')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{message:'Incorrect API key provided'}})});
    return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({data:[{id:'model-b'},{id:'model-a'}]})});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);
  await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
  const openAiSettings=async()=>{await page.locator('#more-tools').click();await page.locator('#settings').click();await page.locator('#ai-settings').click();await page.locator('#dialog-title').filter({hasText:'AI 助手'}).waitFor();};

  await check('AI is off by default: no button and no AI module loaded',async()=>{
    assert.equal(await page.locator('#ai-button').count(),0);
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/ai-panel/.test(entry.name))),false);
  });

  await check('enabling needs the data notice to be accepted',async()=>{
    await openAiSettings();
    assert.equal(await page.locator('.ai-consent').isHidden(),true);
    await page.locator('#dialog-body [name=enabled]').check();
    assert.equal(await page.locator('.ai-consent').isVisible(),true);
    await page.locator('#dialog-body [name=extractModel]').fill('model-a');
    await page.locator('#dialog-submit').click();
    await page.locator('#dialog-error').filter({hasText:'数据发送说明'}).waitFor();
  });

  await check('a wrong key shows the service error; a good key is verified, saved and fills the model list',async()=>{
    await page.locator('#dialog-body [name=provider]').selectOption('custom');
    assert.equal(await page.locator('#dialog-body [data-ai-format]').isVisible(),true);
    await page.locator('#dialog-body [name=endpoint]').fill('https://mock-ai.test/v1');
    await page.locator('#dialog-body [name=key]').fill('sk-wrong');await page.locator('#ai-verify').click();
    await page.locator('#dialog-error').filter({hasText:'Incorrect API key'}).waitFor();
    assert.match(await page.locator('.ai-key-status').textContent(),/尚未保存/);
    await page.locator('#dialog-body [name=key]').fill('sk-good-1234');await page.locator('#ai-verify').click();
    await page.locator('.ai-key-status').filter({hasText:'1234'}).waitFor();
    assert.equal(await page.locator('#dialog-body [name=key]').inputValue(),'','the key field is cleared after saving');
    assert.deepEqual(await page.locator('#ai-models option').evaluateAll(options=>options.map(option=>option.value)),['model-a','model-b']);
    assert.ok(seen.some(item=>item.url==='https://mock-ai.test/v1/models'&&item.auth==='Bearer sk-good-1234'));
  });

  await check('saving keeps the settings but never the key',async()=>{
    await page.locator('#dialog-body [name=consent]').check();
    await page.locator('#dialog-body [name=suggestModel]').fill('model-b');
    await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
    const stored=await page.evaluate(()=>localStorage.getItem('wenzhou.workspace'));
    const ai=JSON.parse(stored).settings.ai;
    assert.equal(ai.enabled,true);assert.equal(ai.consented,true);assert.equal(ai.endpoint,'https://mock-ai.test/v1');assert.equal(ai.models.extract,'model-a');assert.equal(ai.models.suggest,'model-b');
    assert.ok(!stored.includes('sk-good-1234'),'the key must not reach localStorage');
  });

  await check('the button floats over the editor; the panel names where content goes and closes with Escape',async()=>{
    const button=page.locator('#ai-button');await button.waitFor();
    const [editor,box]=await Promise.all([page.locator('#editor').boundingBox(),button.boundingBox()]);
    assert.ok(box.x+box.width<=editor.x+editor.width&&box.x>editor.x+editor.width-80&&box.y<editor.y+60,'top-right corner of the editor');
    await button.click();
    const panel=page.locator('#ai-panel');await panel.waitFor();
    await page.locator('.ai-destination').filter({hasText:'mock-ai.test · model-a'}).waitFor();
    assert.equal(await button.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
    assert.equal(await button.getAttribute('aria-expanded'),'false');
  });

  await check('the button is hidden in preview and on the start page',async()=>{
    await page.locator('[data-display=preview]').click();await page.waitForFunction(()=>document.querySelector('#ai-button').hidden);
    await page.locator('[data-display=source]').click();await page.waitForFunction(()=>!document.querySelector('#ai-button').hidden);
    await page.keyboard.press('Control+Alt+h');await page.locator('#start-page').waitFor();
    assert.equal(await page.locator('#ai-button').isHidden(),true);
  });
  assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close?.();}
