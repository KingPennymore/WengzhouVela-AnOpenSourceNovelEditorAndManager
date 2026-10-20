import {t} from './i18n.mjs';
export function mountPlanningChrome(root){
 root.planningChromeDispose?.();
 const bar=root.querySelector('.planning-toolbar'),primary=bar.querySelector('.planning-primary'),more=bar.querySelector('.planning-overflow'),menu=bar.querySelector('.planning-menu'),list=menu.firstElementChild,bottom=root.querySelector('.planning-bottom-actions'),buttons=[...primary.children],anchor=document.querySelector('#quick-git'),slots=[...root.querySelectorAll('[data-planning-slot="planning-bottom"]')];
 let disposed=false,frame=0;
 const map=bar.classList.contains('map-toolbar');bar.classList.toggle('outline-toolbar',!map);primary.setAttribute('role','group');primary.setAttribute('aria-label',t(map?'地图工具':'视图切换'));
 const group=title=>{const box=document.createElement('div');box.className='planning-menu-group';box.setAttribute('role','group');box.setAttribute('aria-label',t(title));const heading=document.createElement('div');heading.className='toolbar-menu-heading';heading.textContent=t(title);box.append(heading);list.append(box);return box;};
 const original=[...list.children],overflow=group(map?'绘图工具':'视图切换');overflow.hidden=true;
 const groups=map?[['导航与侧栏','[data-info-directory],[data-info-labels]'],['地图显示','[data-hide-points],[data-show-grid]'],['导出','[data-export-map]'],['删除范围','[data-delete-scope]']]:[['大纲操作','[data-review]']];
 for(const [title,selector] of groups){const box=group(title);for(const button of original.filter(el=>el.matches(selector)))box.append(button);}
 for(const node of original)if(node.parentElement===list){const box=group('扩展功能');box.append(node);}
 if(anchor&&bottom){for(const old of anchor.parentElement.querySelectorAll('.planning-quick-actions'))if(old!==bottom)old.remove();anchor.before(bottom);bottom.classList.add('planning-quick-actions');root.planningBottomActions=bottom;for(const slot of slots)bottom.append(slot);}
 const close=()=>{menu.hidden=true;more.setAttribute('aria-expanded','false');};
 const resize=()=>{
  frame=0;if(disposed)return;
  for(const b of buttons)primary.append(b);
  if(map)more.style.flexBasis='44px';
  for(let i=buttons.length-1;i>=0&&primary.scrollWidth>primary.clientWidth+1;i--)overflow.insertBefore(buttons[i],overflow.children[1]||null);
  overflow.hidden=overflow.children.length===1;
  if(map){bar.style.setProperty('--map-slots',String(1+[...primary.children].filter(b=>b.getClientRects().length>0).length));more.style.removeProperty('flex-basis');}
 };
 const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(resize);};root.planningRefreshTools=schedule;
 const observer=new ResizeObserver(schedule);observer.observe(bar);
 const items=()=>[...menu.querySelectorAll('button:not(:disabled)')].filter(b=>!b.closest('[hidden]')&&b.getClientRects().length);
 more.onclick=()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)items()[0]?.focus();};
 menu.addEventListener('click',e=>{if(e.target.closest('button'))close();});
 const outside=e=>{if(!menu.hidden&&!menu.contains(e.target)&&!more.contains(e.target))close();};
 const keys=e=>{if(menu.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();more.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=items(),at=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}};
 document.addEventListener('pointerdown',outside);menu.addEventListener('keydown',keys);more.title=t('更多操作');resize();
 root.planningChromeDispose=()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);menu.removeEventListener('keydown',keys);bottom?.remove();root.planningBottomActions=null;root.planningRefreshTools=null;root.planningChromeDispose=null;};
}
