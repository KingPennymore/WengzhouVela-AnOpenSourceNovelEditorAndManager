import assert from 'node:assert/strict';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {selectAppView} from './navigation-helper.mjs';

// Switching the language in Settings must leave no text of the other language on screen, without a reload.
const server=await startSourceAppServer(),browser=await launchBrowser(),errors=[];
const visibleText=()=>{
  // Same user-content areas as the skip list in web/i18n.mjs, plus file names in the recent list.
  const skip='.cm-editor,#preview:not(.vela-preview),[data-user-content],#license-text,.plugin-page-body,.doc-info strong,.tab-open strong,.reader-book strong,.reader-book small,#current-name,#current-chapter,.chapter,.repo-card strong,.repo-card p,.reader-content,.csv-grid-stage,.outline-node-title,.outline-node-summary,.outline-node-detail,.outline-lines,.recent-files strong,script,style,textarea,option';
  const shown=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  const found=new Set(),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){const parent=node.parentElement,text=node.textContent.trim();if(text&&parent&&!parent.closest(skip)&&shown(parent))found.add(text);}
  for(const el of document.body.querySelectorAll('[title],[aria-label],[placeholder]'))if(!el.closest(skip)&&shown(el))for(const name of ['title','aria-label','placeholder'])if(el.getAttribute(name))found.add(el.getAttribute(name));
  return [...found];
};
try{
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  await context.addInitScript(()=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,activeId:null,openIds:[],settings:{theme:'light',language:'zh-CN'},documents:[{id:'book',name:'book.txt',path:'book.txt',text:'第一章 启程\n\n正文。',updatedAt:1}]})));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const switchTo=async language=>{
    await page.locator('#more-tools').click();await page.locator('#settings').click();
    await page.locator('#dialog-body [name=language]').selectOption(language);await page.locator('#dialog-submit').click();
    await page.waitForTimeout(400);
  };
  const views=async check=>{
    await check('editor');
    await page.locator('#more-tools').click();await page.waitForTimeout(200);await check('more tools menu');await page.keyboard.press('Escape');
    for(const view of ['reader','subscriptions','github']){await selectAppView(page,view);await page.waitForTimeout(400);await check(view+' view');}
    await selectAppView(page,'write');
    await page.keyboard.press('Control+Alt+h');await page.locator('#start-page').waitFor();await page.waitForTimeout(200);await check('start page');
    await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
  };
  await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);
  await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');
  const kept=new Set();
  await views(async()=>(await page.evaluate(visibleText)).forEach(item=>kept.add(item)));

  await switchTo('en');
  const english=new Set();
  await views(async view=>{
    const text=await page.evaluate(visibleText);text.forEach(item=>english.add(item));
    assert.deepEqual(text.filter(item=>/[㐀-鿿]/.test(item)),[],`Chinese left in English mode (${view})`);
  });
  console.log('PASS 中文切换到英文后，编辑器、更多菜单、阅读/订阅/仓库视图与启动页没有中文残留');

  await switchTo('zh-CN');
  // Text shown in English that is not also shown in Chinese mode (file names, numbers, shortcuts) is a leftover.
  await views(async view=>{
    const text=await page.evaluate(visibleText);
    assert.deepEqual(text.filter(item=>english.has(item)&&!kept.has(item)&&/[a-z]{3}/.test(item)&&!/[㐀-鿿]/.test(item)),[],`English left in Chinese mode (${view})`);
  });
  console.log('PASS 英文切换回中文后，同样没有英文残留');
  assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close?.();}
