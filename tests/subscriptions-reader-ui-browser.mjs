import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {noMotion,readerReady} from './wait-helpers.mjs';

// UI redesign phase 6: the subscriptions page (header, filter, selection mode, localized errors) and the
// reader's chapter / search / notes panels share one layout on phones and desktops.
const out='test-results/ui-redesign/phase-6';
await mkdir(out,{recursive:true});
const server=process.env.VELA_TEST_URL?{url:process.env.VELA_TEST_URL}:await startSourceAppServer();
const browser=await launchBrowser();
const snapshot=(name,extra={})=>({name,description:'',branch:'main',vela:false,configs:[],watched:{},files:[],releases:[{name:'第二卷',tag:'v2.0',body:'新增三章。',published:'2026-10-28T10:00:00Z'}],changelog:null,signature:'s',checkedAt:Date.parse('2026-10-30T08:00:00Z'),...extra});
const text=Array.from({length:6},(_,i)=>`第${i+1}章 航程${i+1}\n`+'海风吹过港湾，灯塔照亮了航路。\n'.repeat(40)).join('');
const seed={version:1,activeId:'book',openIds:['book'],documents:[{id:'book',name:'航程.txt',path:'航程.txt',text,updatedAt:1}],
  subscriptions:[
    {repo:'writer/voyage',snapshot:snapshot('writer/voyage'),unread:true,pageSeen:true},
    {repo:'writer/notes',snapshot:snapshot('writer/notes',{releases:[],vela:true}),unread:false,pageSeen:true},
    {repo:'writer/archive',snapshot:snapshot('writer/archive',{releases:[]}),unread:false,pageSeen:true}]};
const targets=page=>page.evaluate(()=>[...document.querySelectorAll('#subscriptions-view button,#subscriptions-view label:has(input),#reader-view .reader-outline button,#reader-view .reader-tools-panel button')]
  .filter(el=>el.checkVisibility()&&!el.closest('.subscription-list .subscription-open'))
  .map(el=>{const r=el.getBoundingClientRect();return {html:el.outerHTML.slice(0,90),w:r.width,h:r.height};})
  .filter(r=>r.w<43.9||r.h<43.9));
try{
  for(const [width,height,theme] of [[390,844,'light'],[390,844,'dark'],[1280,850,'light']]){
    const phone=width<600,profile=`${width}-${theme}`,errors=[];
    const context=await browser.newContext({viewport:{width,height},hasTouch:phone,isMobile:phone,colorScheme:theme});await noMotion(context);
    await context.addInitScript(data=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(data));},{...seed,settings:{theme}});
    let release;const gate=new Promise(resolve=>release=resolve);
    await context.route(/api\.github\.com/,route=>gate.then(()=>route.abort()));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const shot=name=>page.screenshot({path:`${out}/${profile}-${name}.png`});
    await page.goto(server.url+'/?ui='+(phone?'android':'windows'));await page.waitForFunction(()=>window.velaReady);
    await page.locator('[data-view=subscriptions]').click();await page.locator('.subscription-card').first().waitFor();

    // Refreshing: the icon button is busy and the progress row offers cancel.
    assert.equal(await page.locator('#subscription-refresh').isDisabled(),true);
    assert.equal(await page.locator('#subscription-refresh').getAttribute('aria-label'),'刷新');
    assert.ok(await page.locator('.subscription-progress #subscription-cancel').isVisible());
    await shot('subscriptions-refreshing');
    release();await page.waitForFunction(()=>!document.querySelector('#subscription-refresh').disabled);

    // The title and its actions share one row; nothing scrolls sideways.
    const header=await page.evaluate(()=>{const top=s=>document.querySelector(s).getBoundingClientRect();return {title:top('.subscription-header h1'),add:top('#subscription-add'),overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(header.overflow,false);assert.ok(header.add.top<header.title.bottom&&header.add.bottom>header.title.top,'actions beside the title');
    assert.equal(await page.locator('.subscription-bulk').count(),0,'bulk actions wait for selection mode');
    assert.equal(await page.locator('[data-select-subscription]').count(),0);
    // Network failures read as a sentence with a retry, not the browser's English message.
    assert.equal(await page.locator('.subscription-error').count(),3);
    assert.equal(await page.locator('.subscription-error .error').first().textContent(),'网络连接失败，请检查网络后重试。');
    assert.equal(await page.locator('.subscription-card .subscription-badge').count(),1);
    if(phone)assert.deepEqual(await targets(page),[]);
    await shot('subscriptions');

    // Filters are a segmented control.
    await page.locator('[name=subscription-filter][value=unread]').check({force:true});
    assert.equal(await page.locator('.subscription-card').count(),1);
    await page.locator('[name=subscription-filter][value=errors]').check({force:true});
    assert.equal(await page.locator('.subscription-card').count(),3);
    await page.locator('[name=subscription-filter][value=all]').check({force:true});

    // Selection mode: tapping a card selects it; bulk actions follow the selection.
    await page.locator('#subscription-select').click();
    assert.equal(await page.locator('#subscription-select').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#subscription-delete').isDisabled(),true);
    await page.locator('[data-subscription-open="writer/notes"]').click();
    assert.equal(await page.locator('[data-select-subscription="writer/notes"]').isChecked(),true);
    assert.equal(await page.locator('.subscription-count').textContent(),'1 / 3');
    assert.equal(await page.locator('#subscription-delete').isDisabled(),false);
    if(phone)assert.deepEqual(await targets(page),[]);
    await shot('subscriptions-select');
    await page.locator('#subscription-select-all').check();assert.equal(await page.locator('.subscription-count').textContent(),'3 / 3');
    await page.locator('#subscription-ignore').click();
    assert.equal(await page.locator('.subscription-badge').count(),0);
    await page.locator('#subscription-select').click();
    assert.equal(await page.locator('.subscription-bulk').count(),0);

    // Detail headings are translated and the back control is a text button.
    await page.locator('[data-subscription-open="writer/voyage"]').click();await page.locator('#subscription-back').waitFor();
    assert.deepEqual(await page.locator('.subscription-scroll h2').allTextContents(),['发布版本','更新日志']);
    await shot('subscription-detail');
    await page.locator('#subscription-back').click();

    // Reader panels: one geometry, labelled note actions, a shared close button.
    await page.locator('[data-view=reader]').click();await page.locator('[data-read=book]').click();await readerReady(page);
    const panelWidth=async selector=>{
      // The panel runs under the page bar: no strip of page text between them.
      const gap=await page.evaluate(selector=>document.querySelector('.reader-pagebar').getBoundingClientRect().top-document.querySelector(selector).getBoundingClientRect().bottom,selector);
      assert.ok(gap<=0,`${selector} leaves ${gap}px above the page bar`);
      return (await page.locator(selector).boundingBox()).width;
    };
    await page.locator('#reader-outline-action').click();await page.locator('.reader-outline').waitFor();
    const outline=await panelWidth('.reader-outline');assert.ok(phone?Math.abs(outline-width)<1:Math.abs(outline-360)<1,`chapters ${outline}`);
    assert.equal(await page.locator('.reader-outline [data-reader-close]').getAttribute('class'),'ui-icon-button');
    if(phone)assert.deepEqual(await targets(page),[]);
    await shot('reader-chapters');
    await page.locator('.reader-outline [data-reader-close]').click();
    await page.locator('#reader-notes').click();await page.locator('.reader-notes-section').waitFor();
    assert.equal(await panelWidth('.reader-tools-panel'),outline);
    assert.deepEqual(await page.locator('.reader-notes-section .button-row button').allTextContents(),['添加书签','添加批注']);
    assert.equal(await page.locator('.reader-notes-section textarea').getAttribute('aria-label'),'批注');
    if(phone)assert.deepEqual(await targets(page),[]);
    await shot('reader-notes');
    await page.locator('[data-tools-close]').click();
    assert.deepEqual(errors,[]);
    console.log('PASS subscriptions and reader panels '+profile);
    await context.close();
  }
}finally{await browser.close();await server.close?.();}
