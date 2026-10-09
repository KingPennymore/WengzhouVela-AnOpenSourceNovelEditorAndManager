// Presentation-only motion for the shell. Nothing here changes layout geometry or app state;
// every effect is skipped when the system asks for reduced motion.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const views=['write','github','subscriptions','reader'];
const staggerTargets='#start-page .start-stat,#start-page .recent-files>button,.repo-grid>*,.reader-books>*,.subscription-card,.vela-card,.glossary-entry,.empty-state';
const staggerLimit=14;

function replay(element,...names){
  element.classList.remove(...names);void element.offsetWidth;element.classList.add(...names);
  element.addEventListener('animationend',function done(event){if(event.target!==element)return;element.classList.remove(...names);element.removeEventListener('animationend',done);});
}

export function stagger(root){
  if(reduced.matches||!root)return;
  [...root.querySelectorAll(staggerTargets)].filter(item=>item.offsetParent!==null).slice(0,staggerLimit).forEach((item,index)=>{
    item.style.setProperty('--stagger',index);replay(item,'stagger-in');
  });
}

function navIndicator(){
  const nav=document.querySelector('.page-navigation');if(!nav)return;
  const indicator=document.createElement('i');indicator.className='nav-indicator';indicator.setAttribute('aria-hidden','true');nav.prepend(indicator);
  let last='';
  const place=()=>{
    const active=nav.querySelector('.nav-item.active');
    if(!active||!active.offsetWidth){if(last){last='';indicator.classList.remove('ready');indicator.style.opacity='0';}return;}
    const inset=innerWidth<=600?4:3,width=active.offsetWidth-inset*2,height=active.offsetHeight-inset*2,x=active.offsetLeft+inset,y=active.offsetTop+inset,key=[width,height,x,y].join();
    if(key===last)return;
    const first=!last;last=key;
    indicator.style.opacity='';indicator.style.width=width+'px';indicator.style.height=height+'px';indicator.style.transform=`translate(${x}px,${y}px)`;
    // The first placement must not slide in from the corner.
    if(first&&!indicator.classList.contains('ready'))requestAnimationFrame(()=>requestAnimationFrame(()=>indicator.classList.add('ready')));
  };
  // Only the page buttons' active state matters; the indicator's own mutations are ignored.
  new MutationObserver(records=>{if(records.some(record=>record.target!==indicator))place();}).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  if(window.ResizeObserver)new ResizeObserver(place).observe(nav);
  addEventListener('resize',place);place();
}

function viewTransitions(){
  for(const name of views){
    const view=document.getElementById(name+'-view');if(!view)continue;
    let wasHidden=view.hidden;
    new MutationObserver(()=>{
      if(wasHidden&&!view.hidden&&!reduced.matches){
        // The editor keeps exact horizontal edges against the sidebars, so it only fades.
        if(name==='write')replay(view,'view-enter','view-enter-fade');else replay(view,'view-enter');
        requestAnimationFrame(()=>stagger(view));
      }
      wasHidden=view.hidden;
    }).observe(view,{attributes:true,attributeFilter:['hidden']});
  }
  const start=document.getElementById('start-page');
  if(start){
    let wasHidden=start.hidden;
    new MutationObserver(()=>{if(wasHidden&&!start.hidden)requestAnimationFrame(()=>stagger(start));wasHidden=start.hidden;}).observe(start,{attributes:true,attributeFilter:['hidden']});
  }
}

function tabEntrances(){
  const tabs=document.getElementById('document-tabs');if(!tabs)return;
  let known=new Set();
  const read=()=>new Set([...tabs.querySelectorAll('.document-tab')].map(tab=>tab.dataset.id||tab.dataset.tab||tab.textContent));
  known=read();
  new MutationObserver(()=>{
    const next=read();
    if(!reduced.matches)for(const tab of tabs.querySelectorAll('.document-tab')){const key=tab.dataset.id||tab.dataset.tab||tab.textContent;if(!known.has(key))replay(tab,'tab-enter');}
    known=next;
  }).observe(tabs,{childList:true});
}

function savedPulse(){
  const state=document.getElementById('save-state');if(!state)return;
  let dirty=state.classList.contains('dirty');
  new MutationObserver(()=>{
    const now=state.classList.contains('dirty');
    if(dirty&&!now&&!reduced.matches)replay(state,'saved-flash');
    dirty=now;
  }).observe(state,{attributes:true,attributeFilter:['class']});
}

function themeCrossfade(){
  let timer,last=document.body.classList.contains('dark');
  new MutationObserver(()=>{
    const dark=document.body.classList.contains('dark');
    if(dark===last||reduced.matches){last=dark;return;}
    last=dark;
    document.documentElement.classList.add('theme-shift');clearTimeout(timer);
    timer=setTimeout(()=>document.documentElement.classList.remove('theme-shift'),480);
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
}

export function initMotion(){
  navIndicator();viewTransitions();tabEntrances();savedPulse();themeCrossfade();
  document.body.classList.add('motion-ready');
}
