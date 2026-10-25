// Condition waits shared by the browser suites, in place of fixed page.waitForTimeout sleeps.

// Test-only switch read by web/motion.mjs: page turns, view entrances and transitions finish at once.
export const noMotion=context=>context.addInitScript(()=>{try{localStorage.setItem('vela.test.motion','off');}catch{}});

// Resolves after no finite CSS/Web animation is running and two frames have been painted.
export async function settled(page,{timeout=5000}={}){
  await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity),null,{timeout,polling:'raf'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

// Polls a Node-side predicate (for example a value the app saves to localStorage after a debounce) until it holds.
// The caller still asserts afterwards, so a timeout ends in the original assertion message.
export async function until(predicate,{timeout=5000,interval=50}={}){
  const end=Date.now()+timeout;
  for(;;){try{if(await predicate())return true;}catch{}if(Date.now()>end)return false;await new Promise(resolve=>setTimeout(resolve,interval));}
}

// Resolves once the reader shows a page number and no page-turn layer is left.
export async function readerReady(page,{timeout=10000}={}){
  await page.waitForFunction(()=>{const v=document.querySelector('.reader-viewport');return document.body.classList.contains('reader-open')&&v&&v.offsetParent!==null&&!document.querySelector('.reader-page-overlay,.reader-page-incoming,.reader-book-leaf')&&/\d/.test(document.querySelector('#reader-position')?.textContent||'');},null,{timeout});
  await settled(page);
}

// readerReady, then no debounced reading-position save pending (web/reader.mjs data-position-pending).
export async function readerIdle(page,{timeout=10000}={}){
  await readerReady(page,{timeout});
  await page.waitForFunction(()=>!document.querySelector('[data-position-pending]'),null,{timeout});
}

// The theme cross-fade (web/motion.mjs crossfadeTheme) is over.
export const themeShiftDone=page=>page.waitForFunction(()=>!document.documentElement.classList.contains('theme-switching'));
