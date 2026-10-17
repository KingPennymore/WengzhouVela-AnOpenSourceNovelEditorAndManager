import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {tour,tourPage,tourVariants} from './app-tour.mjs';

// HarmonyOS ArkWeb does not repaint a scrolling container that paints its own background while colors cross-fade
// (theme switches), so the page shows stale colors there. Rule: no visible element that scrolls (overflow auto or
// scroll) has an opaque background color or image; the background belongs to a non-scrolling ancestor. Checked on
// every page and popup of tests/app-tour.mjs, for all four profile sizes, light and dark.
// Exempt: popups that are never open while the theme fades — dialogs (the theme setting applies when the dialog
// closes), completion tooltips, the selection menu and its list, and the toolbar overflow menu (pressing its theme
// button closes it first).
const exempt=['dialog','.cm-tooltip','.selection-menu','.selection-more','#toolbar-overflow'];
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const failures=[],scanned=[],errors=[];
const scan=exempt=>[...document.querySelectorAll('body *')].filter(element=>{
  const style=getComputedStyle(element);if(!/(auto|scroll)/.test(style.overflowX+style.overflowY)||!element.checkVisibility())return false;
  if(exempt.some(selector=>element.closest(selector)))return false;
  return style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.backgroundImage!=='none';
}).map(element=>{const style=getComputedStyle(element);return (element.id?'#'+element.id:element.localName+'.'+[...element.classList].join('.'))+' '+style.backgroundColor+(style.backgroundImage!=='none'?' '+style.backgroundImage.slice(0,40):'');});
try{
  for(const [profile,width,height] of tourVariants)for(const theme of ['light','dark']){
    const {context,page}=await tourPage(browser,{profile,width,height,theme});page.on('pageerror',error=>errors.push(error.message));
    await tour(page,{url:server.url,profile,width},async name=>{const state=`${profile} ${width} ${theme} ${name}`,found=await page.evaluate(scan,exempt);scanned.push(state);if(found.length)failures.push({state,found});});
    await context.close();
  }
  await mkdir('test-results',{recursive:true});await writeFile('test-results/scroll-backgrounds.json',JSON.stringify({scanned,failures,errors},null,2));
  assert.deepEqual(failures,[],'scrolling containers with their own background:\n'+failures.map(item=>item.state+': '+item.found.join(', ')).join('\n'));
  assert.deepEqual(errors,[]);
  console.log(`PASS no scrolling container paints its own background (${scanned.length} states)`);
}finally{await browser.close();await server.close();}
