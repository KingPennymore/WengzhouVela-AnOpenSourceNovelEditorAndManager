import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {settingsSection,setSetting,closeSettings} from './settings-helper.mjs';
import {selectAppView} from './navigation-helper.mjs';
import {readerReady} from './wait-helpers.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {createVelaV2,velaText,GLOBAL_VELA_PATH} from '../web/vela.mjs';
import {settled,noMotion} from './wait-helpers.mjs';
const server=process.env.VELA_TEST_URL?{url:process.env.VELA_TEST_URL}:await startSourceAppServer();
const browser=await launchBrowser(),out='test-results/ui-redesign/phase-2',checks=[];
await mkdir(out,{recursive:true});
const groups=['appearance','editing','terms','chapters','reading','ai','storage','about'];
const globalConfig=createVelaV2('Global',{global:true});globalConfig.extensions={retained:{value:42}};globalConfig.customField={keep:true};globalConfig.reader.layout={fontSize:16};
const seed={version:1,activeId:'book',openIds:['book'],settings:{theme:'light',language:'zh-CN'},documents:[{id:'book',name:'book.txt',path:'book.txt',text:'第一章 海风\n林舟踏上旅途。',updatedAt:1},{id:'global',name:'.global.vela',path:GLOBAL_VELA_PATH,text:velaText(globalConfig),updatedAt:1}]};
try{
 for(const width of [1280,390])for(const theme of ['light','dark']){
  const mobile=width===390,profile=`${width}-${theme}`,errors=[];
  const context=await browser.newContext({viewport:{width,height:mobile?844:850},hasTouch:mobile,isMobile:mobile,colorScheme:theme});await noMotion(context);
  await context.addInitScript(data=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(data));},{...seed,settings:{...seed.settings,theme}});
  await context.route('https://settings-ai.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[{id:'model-a'},{id:'model-b'}]})}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
  const open=async()=>{await page.locator('#more-tools').click();await page.locator('#settings').click();await page.locator('[data-settings-group]').first().waitFor();};
  const shot=async name=>{await settled(page);await page.screenshot({path:`${out}/${profile}-${name}.png`});};
  const persisted=async(name,value)=>{await page.waitForFunction(({name,value})=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings[name]===value,{name,value});};
  const checkLayout=async()=>{
   const issues=await page.locator('#dialog').evaluate(dialog=>{
    const shown=e=>!!e.getClientRects().length&&!e.closest('[hidden]'),issues=[];
    for(const el of dialog.querySelectorAll('button,label,strong,small,p,summary,h3,h4,span,input,select')){
     if(!shown(el))continue;
     if(Number.parseFloat(getComputedStyle(el).fontSize)<12)issues.push('small text: '+el.outerHTML.slice(0,120));
    }
    if(matchMedia('(pointer:coarse)').matches)for(const el of dialog.querySelectorAll('button,summary,select,input')){
     if(!shown(el)||el.disabled)continue;
     const target=['radio','checkbox'].includes(el.type)?el.closest('label'):el;
     const r=target?.getBoundingClientRect();if(r&&(r.width<43.9||r.height<43.9))issues.push('small target: '+target.outerHTML.slice(0,150));
    }
    for(const track of dialog.querySelectorAll('.ui-switch-track'))if(shown(track)&&track.getBoundingClientRect().width<=track.getBoundingClientRect().height)issues.push('switch must be horizontal');
    const r=dialog.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)issues.push('dialog outside viewport');
    if(dialog.scrollWidth>dialog.clientWidth+1)issues.push('horizontal overflow');return issues;
   });assert.deepEqual(issues,[]);
  };
  try{
   await page.goto(server.url+'/?ui='+(mobile?'android':'windows'));await page.waitForFunction(()=>window.velaReady);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-content');await open();
   assert.equal(await page.locator('#dialog-title').textContent(),'设置');assert.equal(await page.locator('#dialog-submit').isHidden(),true);assert.equal(await page.locator('.dialog-actions').isHidden(),true);
   if(mobile){assert.equal(await page.locator('.settings-navigation [aria-current]').count(),0);assert.equal(await page.locator('.settings-content').isVisible(),false);await shot('categories');}
   for(const group of groups){await settingsSection(page,group);await checkLayout();await shot(group);}
   await settingsSection(page,'appearance');await setSetting(page,'theme',theme==='light'?'dark':'light');await persisted('theme',theme==='light'?'dark':'light');await setSetting(page,'theme',theme);
   await setSetting(page,'palette','jade');await persisted('palette','jade');await setSetting(page,'fontFamily','system-ui');await persisted('fontFamily','system-ui');
   await setSetting(page,'language','en');assert.equal(await page.locator('.settings-section').getAttribute('id'),'settings-section-appearance');assert.equal(await page.locator('#dialog-title').textContent(),'Settings');await setSetting(page,'language','zh-CN');
   await settingsSection(page,'editing');const original=(await state()).settings.fontSize;
   for(const value of ['999','','15.5']){await setSetting(page,'fontSize',value);assert.equal((await state()).settings.fontSize,original);assert.equal(await page.locator('[name=fontSize]').getAttribute('aria-invalid'),'true');}
   await setSetting(page,'fontSize',21);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.cm-content')).fontSize==='21px');
   for(const name of ['richText','novelLineNumbers','autoNouns','highlightTerms','glossaryPanel']){const value=name!=='autoNouns';await setSetting(page,name,value);await persisted(name,value);}
   await setSetting(page,'countMode','letters');await setSetting(page,'includeHeading',true);assert.equal((await state()).settings.writer.countMode,'letters');assert.equal((await state()).settings.writer.includeHeading,true);
   await setSetting(page,'readingMode','double');await setSetting(page,'globalVelaOverride',true);
   const global=JSON.parse((await state()).documents.find(d=>d.path==='.global.vela').text);assert.equal(global.reader.mode,'double');assert.equal(global.reader.appearancePolicy,'personal');assert.equal(global.extensions.retained.value,42);assert.deepEqual(global.customField,{keep:true});assert.equal(global.reader.layout.fontSize,16);
   await settingsSection(page,'ai');await page.locator('[name=aiEnabled]').check();await page.locator('.ai-consent-dialog[open]').waitFor();await shot('ai-consent');
   await page.evaluate(()=>wenzhouBack());await page.waitForFunction(()=>!document.querySelector('[name=aiEnabled]').checked);assert.equal(await page.locator('[name=aiEnabled]').isChecked(),false);assert.equal((await state()).settings.ai.enabled,false);
   await page.locator('[name=aiEnabled]').check();await page.locator('.ai-consent-dialog button[value=agree]').click();await persisted('language','zh-CN');
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.ai.consented);
   await page.locator('[name=aiProvider]').selectOption('custom');await page.locator('[name=aiEndpoint]').fill('https://settings-ai.test/v1');await page.locator('[name=aiKey]').fill('sk-settings-test');
   assert.notEqual((await state()).settings.ai.endpoint,'https://settings-ai.test/v1');
   await settingsSection(page,'about');await settingsSection(page,'ai');assert.equal(await page.locator('[name=aiEndpoint]').inputValue(),'https://settings-ai.test/v1');assert.equal(await page.locator('[name=aiKey]').inputValue(),'sk-settings-test');
   await page.locator('[data-ai-verify]').click();await page.locator('.ai-key-status').filter({hasText:'test'}).waitFor();await page.locator('[name=aiSuggestModel]').selectOption('model-b');
   for(const [field,value,key] of [['ContextTokens','16384','contextTokens'],['ConfirmChars','1234','confirmChars'],['DailyChars','5678','dailyChars']]){const el=page.locator(`[name=ai${field}]`);await el.fill(value);await el.dispatchEvent('change');assert.equal((await state()).settings.ai[key],Number(value));await el.fill('');await el.dispatchEvent('change');assert.equal((await state()).settings.ai[key],Number(value));await el.fill(value);await el.dispatchEvent('change');}
   await page.locator('[name=aiFormat][value=azure]').check({force:true});await page.locator('[name=aiApiVersion]').fill('invalid?');assert.equal((await state()).settings.ai.format,'openai');
   await page.locator('[name=aiKey]').fill('sk-settings-test');await page.locator('[data-ai-verify]').click();await page.locator('[data-ai-error]').filter({hasText:'API 版本格式不正确'}).waitFor();assert.equal((await state()).settings.ai.format,'openai');
   await page.locator('[name=aiApiVersion]').fill('2024-10-21');await page.locator('[data-ai-verify]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.ai.format==='azure');assert.equal((await state()).settings.ai.apiVersion,'2024-10-21');
   await page.locator('[name=aiFormat][value=openai]').check({force:true});await page.locator('[name=aiKey]').fill('sk-settings-test');await page.locator('[data-ai-verify]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).settings.ai.format==='openai');
   assert.equal((await state()).settings.ai.models.suggest,'model-b');assert.ok(!JSON.stringify(await state()).includes('sk-settings-test'));await checkLayout();await page.locator('.settings-content').evaluate(el=>el.scrollTop=0);await shot('ai-connected');await page.locator('.settings-content').evaluate(el=>el.scrollTop=el.scrollHeight);await shot('ai-usage');
   await page.locator('[name=aiEnabled]').uncheck();await page.locator('[name=aiEnabled]').check();assert.equal(await page.locator('.ai-consent-dialog[open]').count(),0);
   if(mobile){await page.evaluate(()=>wenzhouBack());assert.equal(await page.locator('.settings-navigation').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.dataset.settingsGroup),'ai');}
   await settingsSection(page,'about');await page.locator('#show-privacy').click();await page.locator('#dialog-body article').waitFor();assert.match(await page.locator('#dialog-body').textContent(),/renyuzhou2@gmail.com/);await page.evaluate(()=>wenzhouBack());await page.locator('#show-licenses').click();await page.locator('#license-text').waitFor();await page.evaluate(()=>wenzhouBack());assert.equal(await page.locator('#settings-section-about').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'show-licenses');
   await closeSettings(page);await page.reload();await page.waitForFunction(()=>window.velaReady);const reloaded=await state();
   assert.equal(reloaded.settings.theme,theme);assert.equal(reloaded.settings.fontFamily,'system-ui');for(const name of ['richText','novelLineNumbers','autoNouns','highlightTerms','glossaryPanel'])assert.equal(reloaded.settings[name],name!=='autoNouns');assert.equal(reloaded.settings.writer.includeHeading,true);assert.equal(reloaded.settings.ai.consented,true);assert.equal(reloaded.settings.ai.endpoint,'https://settings-ai.test/v1');assert.equal(reloaded.settings.ai.models.suggest,'model-b');assert.equal(reloaded.settings.writer.countMode,'letters');assert.equal(reloaded.settings.ai.contextTokens,16384);assert.equal(reloaded.settings.readingMode,'double');assert.equal(reloaded.settings.palette,'jade');
   await openRecentFile(page,page.locator('[data-recent=book]'));await open();await settingsSection(page,'editing');assert.equal(await page.locator('[name=fontSize]').inputValue(),'21');await closeSettings(page);
   await selectAppView(page,'reader');await page.locator('[data-read=book]').click();await readerReady(page);
   await page.evaluate(()=>document.querySelector('#settings').click());await setSetting(page,'readingMode','scroll');await page.waitForFunction(()=>!document.querySelector('#reader-view').classList.contains('reader-paged'));await setSetting(page,'readingMode','double');await page.waitForFunction(()=>document.querySelector('#reader-view').classList.contains('reader-paged'));await closeSettings(page);
   await page.evaluate(()=>document.querySelector('#settings').click());await settingsSection(page,'chapters');await page.locator('#edit-chapter-templates').click();await page.locator('#vela-form [name=titleTemplates]').waitFor();assert.notEqual(await page.locator('#current-name').textContent(),'.global.vela');
   assert.deepEqual(errors,[]);checks.push(profile);console.log('PASS settings immediate persistence, validation, drafts, return stack and layout '+profile);
  }catch(error){await shot('failure');throw error;}finally{await context.close();}
 }
 await writeFile(out+'/results.json',JSON.stringify({checks},null,2));
}finally{await browser.close();await server.close?.();}
