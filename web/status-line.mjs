// Narrow-screen status line: one row that never hides text. The chapter, counts and position first get smaller
// type (12 → 10 px); a chapter title that still does not fit scrolls once to its end and back. With reduced
// motion it stays put and a tap shows the whole title instead.
import {reducedMotion} from './motion.mjs';

const SIZES=[12,11,10],SPEED=36,HOLD=1200;

export function mountStatusLine(bar,{toast}){
  const chapter=bar.querySelector('#current-chapter');
  let frame=0,run=0,lastKey='',lastTitle='';
  const narrow=()=>!document.body.classList.contains('wide-shell')&&bar.getClientRects().length>0;
  const overflow=()=>chapter.scrollWidth-chapter.clientWidth;
  function stop(){cancelAnimationFrame(run);run=0;chapter.scrollLeft=0;}
  function scrollOnce(){
    stop();const distance=overflow();if(distance<=1)return;
    const travel=distance/SPEED*1000,start=performance.now();
    const step=now=>{
      const t=now-start;
      chapter.scrollLeft=t<HOLD?0:t<HOLD+travel?distance*(t-HOLD)/travel:t<2*HOLD+travel?distance:0;
      run=t<2*HOLD+travel?requestAnimationFrame(step):0;
    };
    run=requestAnimationFrame(step);
  }
  function fit(){
    frame=0;
    if(!narrow()){bar.style.removeProperty('font-size');stop();lastKey='';return;}
    const title=chapter.textContent,key=bar.textContent+'|'+bar.clientWidth;
    if(key===lastKey)return;
    lastKey=key;
    for(const size of SIZES){bar.style.fontSize=size+'px';if(overflow()<=1)break;}
    if(title!==lastTitle){lastTitle=title;stop();if(overflow()>1&&!reducedMotion())scrollOnce();}
  }
  const update=()=>{if(!frame)frame=requestAnimationFrame(fit);};
  // updateStats rewrites the spans on every edit; the observers cover every caller and every resize.
  new MutationObserver(update).observe(bar,{subtree:true,childList:true,characterData:true});
  new ResizeObserver(update).observe(bar);
  chapter.addEventListener('click',()=>{
    if(!narrow()||overflow()<=1)return;
    if(reducedMotion())toast(chapter.textContent);else scrollOnce();
  });
  update();
  return {update};
}
