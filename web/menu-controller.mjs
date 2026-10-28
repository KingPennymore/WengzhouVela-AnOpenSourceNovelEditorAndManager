/** Shared keyboard policy for menus and small selection popovers. */
export function menuKey(event,items,{close,returnFocus,trapTab=false}={}) {
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close?.();returnFocus?.focus({preventScroll:true});return true;}
  const buttons=items.filter(item=>!item.disabled&&!item.closest('[hidden]')&&item.getClientRects().length);
  if(!buttons.length)return false;
  const arrows=['ArrowDown','ArrowUp','Home','End'];
  if(!arrows.includes(event.key)&&!(trapTab&&event.key==='Tab'))return false;
  event.preventDefault();event.stopPropagation();
  const index=buttons.indexOf(document.activeElement),back=event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey;
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index<0?(back?buttons.length-1:0):(index+(back?-1:1)+buttons.length)%buttons.length;
  buttons[next]?.focus({preventScroll:true});return true;
}

/** A transient menu owns its listeners; closing or disposing a view releases them together. */
export function mountMenu(menu,{opener,signal,onClose=()=>{},focus=true}={}) {
  const controller=new AbortController(),options={signal:controller.signal};let closed=false;
  const items=()=>[...menu.querySelectorAll('button:not(:disabled)')];
  const close=(restore=false)=>{if(closed)return;closed=true;controller.abort();signal?.removeEventListener('abort',abort);menu.remove();opener?.setAttribute('aria-expanded','false');onClose();if(restore&&opener?.isConnected)opener.focus({preventScroll:true});};
  const abort=()=>close();
  for(const button of items())button.setAttribute('role','menuitem');
  menu.setAttribute('role','menu');opener?.setAttribute('aria-expanded','true');
  menu.addEventListener('keydown',event=>menuKey(event,items(),{close:()=>close(),returnFocus:opener,trapTab:true}),options);
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!opener?.contains(event.target))close();},{...options,capture:true});
  menu.addEventListener('click',event=>{if(event.target.closest('button:not(:disabled)'))close(true);},options);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)close();else if(focus)items()[0]?.focus({preventScroll:true});
  return close;
}
