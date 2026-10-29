import {editorAction} from './mobile-editor-helper.mjs';
import {selectAppView} from './navigation-helper.mjs';
// A walk through the main pages and popups of the app, shared by tests/style-snapshot.mjs and
// tests/scroll-backgrounds-browser.mjs. `visit(name)` is awaited in each state once the page has settled.
import {createVelaV2,velaText} from '../web/vela.mjs';
import {noMotion,settled,readerReady} from './wait-helpers.mjs';

const text='第一章 航程\n　　清晨，船驶出了港口。远处的灯塔在薄雾中渐渐隐去，航海日志翻开了新的一页。\n\n第二章 灯塔\n　　林舟合上地图，沿着石阶走向灯塔。'+'海风穿过门廊，带来海潮的声音。'.repeat(30)+'\n\n第三章 归港\n　　'+'夜色渐深。'.repeat(40);
const config=createVelaV2('航程');config.reading.items=[{path:'航程.txt'}];
const markdown='# 人物\n\n林舟：航海日志的**记录者**。\n\n| 人物 | 身份 |\n|---|---|\n| 林舟 | 船长 |\n\n```js\nconst sea = "海";\n```\n\n质能方程 $E=mc^2$。\n\n> 引用一段话。\n\n- 列表一\n- 列表二\n';
const glossary=JSON.stringify({version:1,kind:'glossary',entries:[{term:'林舟',note:'主角',aliases:['舟']},{term:'灯塔',note:'地点'}]},null,2);
export const tourSeed=theme=>({version:1,folders:['航程'],activeId:'book',openIds:['book','note','config','terms'],settings:{theme,clientId:''},documents:[{id:'book',name:'航程.txt',path:'航程/航程.txt',text,updatedAt:1},{id:'note',name:'人物.md',path:'航程/人物.md',text:markdown,updatedAt:2},{id:'config',name:'.vela',path:'航程/.vela',text:velaText(config),updatedAt:3},{id:'terms',name:'术语.gly',path:'航程/术语.gly',text:glossary,updatedAt:4}]});
export const tourVariants=[['windows',1440,900],['harmonyos',1280,850],['harmonyos',390,844],['android',390,844]];

/** A fresh context for one profile, size and theme, with motion off, a fixed clock and the tour workspace. */
export async function tourPage(browser,{profile,width,height,theme}){
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme});await noMotion(context);
  await context.addInitScript(seed=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},tourSeed(theme));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await context.newPage();
  await page.addInitScript(()=>{const fixed=new Date('2026-10-01T09:30:00').getTime(),RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};});
  return {context,page};
}

export async function tour(page,{url,profile,width},visit){
  const take=async name=>{await settled(page);await visit(name);},escape=async()=>{await page.keyboard.press('Escape');await settled(page);};
  await page.goto(url+'/?ui='+profile);await page.waitForFunction(()=>window.velaReady===true);await page.locator('#start-page').waitFor();
  if(await page.locator('#start-page').getAttribute('data-panel')!=='recent')await page.locator('[data-start=recent]').click();await take('start');
  await page.locator('[data-recent=book]').click();await page.waitForSelector('.cm-editor');await take('editor');
  await page.locator('#mobile-library').click();if(width>600)await page.locator('#outline-toggle').click();await take('sidebars');
  await page.locator('#mobile-library').click();if(width>600)await page.locator('#outline-toggle').click();await settled(page);
  await page.locator('#more-tools').click();await take('overflow');await escape();
  await page.locator('#more-tools').click();await page.locator('#settings').click();await page.locator('#dialog[open]').waitFor();await take('settings');await page.locator('#dialog-close').click();await settled(page);
  await page.evaluate(()=>{const v=velaEditorView,i=v.state.doc.toString().indexOf('灯塔');v.dispatch({selection:{anchor:i,head:i+2},scrollIntoView:true});v.focus();});await page.waitForSelector('#selection-menu:not([hidden])');await take('selection');await escape();
  await page.keyboard.press('Control+f');await page.locator('.cm-search, .search-panel, #search-panel').first().waitFor().catch(()=>{});await take('search');await escape();
  await page.locator('[data-tab=note]').click();await page.waitForSelector('.cm-editor');await editorAction(page,'[data-display=preview]');await page.locator('#preview .katex').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-line')].some(line=>line.textContent.startsWith('const')&&line.querySelector('span')));await take('markdown');
  await page.locator('[data-tab=config]').click();await page.locator('#vela-form, .vela-preview').first().waitFor();await take('vela');
  await page.locator('[data-tab=terms]').click();await page.locator('#preview .glossary-entry, #preview .glossary-row, #preview table').first().waitFor().catch(()=>{});await take('glossary');
  await editorAction(page,'[data-display=source]').catch(()=>{});await page.locator('[data-tab=book]').click();await settled(page);
  await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').waitFor();await take('commands');await escape();
  await selectAppView(page,'github');await page.locator('#github-view').waitFor();await take('github');
  await selectAppView(page,'subscriptions');await page.locator('#subscriptions-view').waitFor();await take('subscriptions');
  await selectAppView(page,'reader');await page.locator('.reader-library').waitFor();await take('reader-library');
  await page.locator('[data-read=book]').click();await readerReady(page);await take('reader-book');
  await page.locator('.reader-viewport').click({position:{x:Math.round(width/2),y:200}});await take('reader-chrome');
}
