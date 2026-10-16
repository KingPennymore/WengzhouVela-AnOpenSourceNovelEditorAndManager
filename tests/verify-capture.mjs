// Preloaded by scripts/verify.mjs (`node --import`) into every browser suite. It wraps Playwright's chromium.launch so
// that, when the browser is closed (normally in the suite's `finally`), every page still open is captured in memory:
// a screenshot plus URL, title, visible dialog/toast text, localStorage sizes and recent page errors. The captures
// are written to $VELA_VERIFY_ARTIFACTS only when the suite exits with a failure, so passing runs cost one
// screenshot per open page and write nothing.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const dir=process.env.VELA_VERIFY_ARTIFACTS;
const captures=[],logs=new WeakMap();let failed=false;
const log=page=>{let list=logs.get(page);if(!list){list=[];logs.set(page,list);}return list;};
const watched=new WeakSet();
const watch=page=>{if(watched.has(page))return;watched.add(page);const push=text=>{const list=log(page);list.push(text);if(list.length>80)list.shift();};page.on('pageerror',error=>push('pageerror: '+error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))push(message.type()+': '+message.text());});page.on('crash',()=>push('crash'));};
const watchContext=context=>{for(const page of context.pages())watch(page);context.on('page',watch);return context;};

async function capture(pages,reason){
  for(const page of pages){
    if(page.isClosed())continue;
    const index=captures.length,entry={reason,url:page.url(),log:log(page).slice()};
    try{entry.screenshot=await page.screenshot({timeout:3000,fullPage:false});}catch(error){entry.screenshotError=error.message;}
    try{entry.state=await page.evaluate(()=>{
      const visible=selector=>[...document.querySelectorAll(selector)].filter(el=>el.checkVisibility?.()??true).map(el=>el.innerText.slice(0,2000));
      const storage={};try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);storage[key]=localStorage.getItem(key).length;}}catch{}
      return {title:document.title,viewport:[innerWidth,innerHeight],bodyClass:document.body?.className,ui:document.body?.dataset.ui,dialogs:visible('dialog[open]'),toasts:visible('#toast,.toast'),active:document.activeElement?.outerHTML.slice(0,300),localStorage:storage,text:document.body?.innerText.slice(0,4000)};
    });}catch(error){entry.stateError=error.message;}
    captures[index]=entry;
  }
}

if(dir){
  const launch=playwright.chromium.launch.bind(playwright.chromium);
  playwright.chromium.launch=async(...args)=>{
    const browser=await launch(...args),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser),close=browser.close.bind(browser);
    browser.newContext=async(...a)=>watchContext(await newContext(...a));
    browser.newPage=async(...a)=>{const page=await newPage(...a);watch(page);return page;};
    browser.close=async(...a)=>{await capture(browser.contexts().flatMap(context=>context.pages()),'open at browser.close').catch(()=>{});return close(...a);};
    return browser;
  };
  process.on('uncaughtExceptionMonitor',error=>{failed=true;captures.push({reason:'uncaught',error:String(error?.stack||error)});});
  // No 'unhandledRejection' listener: adding one would stop Node from failing the suite on an unhandled rejection.
  process.on('exit',code=>{
    if(!failed&&!code)return;
    mkdirSync(dir,{recursive:true});
    const summary=captures.map((entry,i)=>{const {screenshot,...rest}=entry;if(screenshot){rest.screenshot=`page-${i}.png`;writeFileSync(path.join(dir,rest.screenshot),screenshot);}return rest;});
    writeFileSync(path.join(dir,'state.json'),JSON.stringify({exitCode:code,captures:summary},null,2));
  });
}
