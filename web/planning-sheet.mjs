import {icon} from './icons.mjs';
import {t} from './i18n.mjs';
const closing=new WeakMap();
export function cancelPlanningClose(element){if(!element||!closing.has(element))return;closing.delete(element);delete element.dataset.closing;element.style.pointerEvents='';element.getAnimations().forEach(a=>a.cancel());}
export function closePlanningPanel(element,done){if(!element||element.dataset.closing)return;const token={};closing.set(element,token);element.dataset.closing='true';element.style.pointerEvents='none';const finish=()=>{if(closing.get(element)!==token)return;closing.delete(element);delete element.dataset.closing;element.style.pointerEvents='';done();};if(document.documentElement.classList.contains('vela-no-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches)return finish();element.animate([{opacity:1,transform:'translate(0,0)'},{opacity:0,transform:element.classList.contains('map-tools-panel')?'translateX(24px)':'translateY(16px)'}],{duration:160,easing:'ease-in',fill:'forwards'}).finished.then(finish,finish);}
export function planningSheet(root,{title,html,escape:esc,opener,onClose,parent,overlay=false}={}){
 root.querySelector('.map-tools-panel:not(.map-algorithm-dialog)')?.planningClose?.();root.querySelector('.map-algorithm-dialog')?.planningClose?.();
 for(const old of root.querySelectorAll('.planning-sheet'))if(old!==parent?.sheet){old.planningClose?.(true);old.remove();}
 if(parent?.sheet.isConnected&&!overlay){parent.sheet.hidden=true;parent.sheet.inert=true;}
 const sheet=document.createElement('section');sheet.className='planning-sheet'+(overlay?' planning-sheet-overlay':'');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label',title);sheet.innerHTML=`<div class="planning-sheet-surface"><header><strong>${esc(title)}</strong><button data-sheet-close aria-label="${t('关闭')}">${icon('close')}</button></header><div class="planning-sheet-scroll">${html}</div></div>`;root.append(sheet);opener?.setAttribute('aria-expanded','true');
 const close=immediate=>{opener?.setAttribute('aria-expanded','false');const finish=()=>{sheet.remove();if(!overlay&&parent?.sheet.isConnected){parent.sheet.hidden=false;parent.sheet.inert=false;}if(!immediate)opener?.focus({preventScroll:true});onClose?.();};if(immediate)finish();else closePlanningPanel(sheet,finish);};
 sheet.planningClose=close;sheet.querySelector('[data-sheet-close]').onclick=()=>close();sheet.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.stopPropagation();close();}});sheet.querySelector('[data-sheet-close]').focus({preventScroll:true});return {sheet,body:sheet.querySelector('.planning-sheet-scroll'),close:()=>close()};
}
/** Overlay sheets are appended after the sheet they cover; the last visible one is the topmost. */
export function planningTopSheet(root){
 const sheets=[...root.querySelectorAll('.planning-sheet:not([hidden]):not([data-closing])')];
 return sheets.filter(sheet=>sheet.getClientRects().length&&sheet.planningClose).at(-1)||null;
}
