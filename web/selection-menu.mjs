import {SearchQuery,setSearchQuery,openSearchPanel} from '@codemirror/search';
import {native,transport} from './platform.mjs';
import {inlineMarkup,lineMarkup} from './markdown-tools.mjs';
// Placements never overlap the selected rectangle: above or below it first (below leaves room for touch selection
// handles), then beside it; null means the selection fills the screen and the caller docks the bar instead.
export function menuPlacement(rect,width,height,bounds,{prefer='above',handle=0,anchor}={}){
 const gap=10,center=anchor??(rect.left+rect.right)/2,x=Math.max(bounds.left+gap,Math.min(center-width/2,bounds.right-width-gap)),y=Math.max(bounds.top+gap,Math.min(rect.top,bounds.bottom-height-gap));
 const above={left:x,top:rect.top-height-gap,side:'above'},below={left:x,top:rect.bottom+gap+handle,side:'below'};
 const positions=[...(prefer==='below'?[below,above]:[above,below]),{left:rect.right+gap,top:y,side:'right'},{left:rect.left-width-gap,top:y,side:'left'}];
 return positions.find(p=>p.left>=bounds.left+gap&&p.top>=bounds.top+gap&&p.left+width<=bounds.right-gap&&p.top+height<=bounds.bottom-gap)||null;
}
export function bindSelectionMenu({getView,getDoc,addGlossary,extraItems=()=>[],fail}){
 const menu=document.createElement('div');menu.id='selection-menu';menu.className='selection-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','选中文字操作');menu.hidden=true;document.body.append(menu);let snapshot=null,timer,pressing=false,performing=false,dismissed=false;
 const hide=()=>{clearTimeout(timer);menu.hidden=true;dock(0);snapshot=null;};
 // Closing (button, Escape, a finished action) keeps the bar away from that selection until the next pointer, key or
 // native menu request; a different selection (e.g. after a format action reselects) may show it again.
 const dismiss=()=>{dismissed=capture()||true;hide();};
 const touch=()=>matchMedia('(pointer: coarse)').matches;
 const write=async text=>{if(native)await transport('clipboardWrite',{text});else await navigator.clipboard.writeText(text);};
 const read=async()=>native?await transport('clipboardRead'):await navigator.clipboard.readText();
 const activeSurface=node=>node?.nodeType===1?node:node?.parentElement;
 function capture(){
  const s=getSelection(),el=activeSurface(s?.anchorNode),view=getView(),input=document.activeElement;
  if(input?.matches('input:not([type=password]),textarea')){if(typeof input.selectionStart!=='number'||input.selectionStart===input.selectionEnd)return null;return {input,from:input.selectionStart,to:input.selectionEnd,text:input.value.slice(input.selectionStart,input.selectionEnd),rect:input.getBoundingClientRect(),editable:!input.readOnly&&!input.disabled};}
  if(input?.matches('input,select,textarea'))return null;
  if(el?.closest('.odf-paper,.reader-content,#preview')&&s.rangeCount&&!s.isCollapsed){const range=s.getRangeAt(0).cloneRange(),surface=el.closest('.odf-paper,.reader-content,#preview');if(!surface.contains(s.focusNode))return null;const r=range.getBoundingClientRect();return {text:s.toString(),rect:r,range,surface,editable:surface.contentEditable==='true'||!!el.closest('[contenteditable=true]')&&el.closest('[contenteditable=true]')===activeSurface(s.focusNode)?.closest('[contenteditable=true]')};}
  if(view&&!document.querySelector('#write-view').hidden&&!document.querySelector('#editor').hidden){const r=view.state.selection.main;if(!r.empty){const clip=view.scrollDOM.getBoundingClientRect();if(r.to<view.viewport.from||r.from>view.viewport.to)return null;const from=view.coordsAtPos(Math.max(r.from,view.viewport.from))||{left:clip.left,right:clip.left,top:clip.top,bottom:clip.top},to=view.coordsAtPos(Math.min(r.to,view.viewport.to))||{left:clip.right,right:clip.right,top:clip.bottom,bottom:clip.bottom};const rect={left:r.from===r.to?from.left:Math.min(from.left,to.left),right:Math.max(from.right,to.right),top:Math.max(clip.top,Math.min(from.top,to.top)),bottom:Math.min(clip.bottom,Math.max(from.bottom,to.bottom))};if(view.state.doc.lineAt(r.from).number!==view.state.doc.lineAt(r.to).number){rect.left=clip.left;rect.right=clip.right;}if(rect.bottom<=rect.top)return null;const head=r.head>=view.viewport.from&&r.head<=view.viewport.to?view.coordsAtPos(r.head,r.head===r.to?-1:1):null;return {text:view.state.sliceDoc(r.from,r.to),rect,view,doc:view.state.doc,from:r.from,to:r.to,anchor:head?.left,atEnd:r.head===r.to,multiline:view.state.doc.lineAt(r.from).number!==view.state.doc.lineAt(r.to).number,editable:!view.state.readOnly};}}
  return null;
 }
 // Cheap checks used on every selection change; capture() measures layout and only runs once the selection settles.
 const quick=()=>{const input=document.activeElement;if(input?.matches('input:not([type=password]),textarea'))return input.selectionStart!==input.selectionEnd;const view=getView();return !!view&&!view.state.selection.main.empty||!getSelection()?.isCollapsed;};
 const same=(s=snapshot)=>{if(!s)return false;if(s.input)return document.activeElement===s.input&&s.input.selectionStart===s.from&&s.input.selectionEnd===s.to;if(s.view){const r=s.view.state.selection.main;return getView()===s.view&&s.view.state.doc===s.doc&&r.from===s.from&&r.to===s.to;}const selection=getSelection();if(!selection?.rangeCount)return false;const range=selection.getRangeAt(0);try{return range.compareBoundaryPoints(Range.START_TO_START,s.range)===0&&range.compareBoundaryPoints(Range.END_TO_END,s.range)===0;}catch{return false;}};
 const restore=s=>{if(s.input){if(!s.input.isConnected)throw Error('输入框已关闭。');s.input.focus();s.input.setSelectionRange(s.from,s.to);}else if(s.view){if(getView()!==s.view||s.doc!==s.view.state.doc)throw Error('文稿已变化，请重新选择。');s.view.dispatch({selection:{anchor:s.from,head:s.to}});s.view.focus();}else{if(!s.surface.isConnected)throw Error('选区已关闭。');const selection=getSelection();selection.removeAllRanges();selection.addRange(s.range);s.surface.focus();}};
 const replace=(s,text)=>{restore(s);if(s.input){s.input.setRangeText(text,s.from,s.to,'end');s.input.dispatchEvent(new Event('input',{bubbles:true}));}else if(s.view)s.view.dispatch({changes:{from:s.from,to:s.to,insert:text},selection:{anchor:s.from+text.length},userEvent:'input.selection'});else{document.execCommand('insertText',false,text);s.surface.odfSync?.();}};
 // Built once per settled selection; scrolling, resizing and the keyboard only move it (see place()).
 function show(){
  clearTimeout(timer);if(pressing||performing||document.querySelector('dialog[open]'))return;const s=capture();if(!s||!s.text.trim()){hide();return;}if(dismissed){if(dismissed===true||same(dismissed))return;dismissed=false;}
  if(!menu.hidden&&snapshot&&same()){snapshot=s;place(s);return;}
  snapshot=s;menu.replaceChildren();
  const add=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','menuitem');b.onpointerdown=e=>e.preventDefault();b.onclick=async()=>{const selected=snapshot;if(!selected)return;performing=true;try{await action(selected);dismiss();}catch(e){fail(e);}finally{performing=false;}};menu.append(b);};
  add('复制',s=>write(s.text));if(s.editable){add('粘贴',async s=>replace(s,await read()));add('剪切',async s=>{restore(s);await write(s.text);replace(s,'');});}
  if(!s.input)add('搜索',s=>{if(s.view){restore(s);s.view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(s.view);}else{addSearch(s);}});
  if(!s.input)add('加入词库',s=>addGlossary(s.text));for(const item of extraItems(s))add(item.label,()=>item.run());
  if(s.view&&getDoc()?.name.match(/\.(md|markdown)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'**');});add('斜体',s=>{restore(s);inlineMarkup(s.view,'*');});add('引用',s=>{restore(s);lineMarkup(s.view,'> ');});}
  if(s.view&&getDoc()?.name.match(/\.(tex|latex)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'\\textbf{','}');});add('行内公式',s=>{restore(s);inlineMarkup(s.view,'$');});}
  if(s.surface?.odfCommand&&s.editable){add('加粗',s=>{restore(s);s.surface.odfCommand('bold');});add('斜体',s=>{restore(s);s.surface.odfCommand('italic');});add('下划线',s=>{restore(s);s.surface.odfCommand('underline');});}
  add('关闭',dismiss);menu.hidden=false;place(s);
 }
 function place(s){
  const root=document.documentElement,style=getComputedStyle(root),visual=window.visualViewport,height=Math.min(innerHeight,visual?.height||innerHeight),bounds={left:0,top:parseFloat(style.getPropertyValue('--safe-top'))||0,right:innerWidth,bottom:height-(parseFloat(style.getPropertyValue('--safe-bottom'))||0)};
  menu.classList.remove('selection-docked');menu.style.left='0';menu.style.top='0';menu.style.width='';menu.style.maxHeight='';
  const w=Math.min(menu.scrollWidth+2,bounds.right-20),h=Math.min(menu.offsetHeight,bounds.bottom-20);menu.style.width=w+'px';
  const position=menuPlacement(s.rect,w,h,bounds,{prefer:touch()?'above':s.atEnd&&s.multiline?'below':'above',handle:touch()?28:0,anchor:s.anchor});
  if(position){menu.style.left=position.left+'px';menu.style.top=position.top+'px';menu.dataset.side=position.side;dock(0);}
  else{menu.classList.add('selection-docked');menu.dataset.side='dock';menu.style.width='100%';const size=menu.offsetHeight;menu.style.top=(height-size)+'px';dock(size);}
 }
 // The docked bar shortens #app so it never covers text; only a changed height is written to avoid relayout loops.
 const dock=size=>{const value=size+'px';if(document.documentElement.style.getPropertyValue('--selection-dock-height')!==value)document.documentElement.style.setProperty('--selection-dock-height',value);};

 function addSearch(s){const reader=document.querySelector('#reader-tools');if(s.surface.closest('#reader-view')&&reader){reader.click();const input=document.querySelector('.reader-tools-panel input');if(input){input.value=s.text;input.dispatchEvent(new Event('input',{bubbles:true}));}}else{const view=getView();if(view){document.querySelector('[data-display=source]')?.click();view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(view);}}}
 // Selection changes hide the bar at once (no stale bar while dragging handles or Shift-extending) and show it again
 // when the selection has been still for a moment; touch handles need a longer pause than a mouse release.
 const settle=()=>touch()?320:180;
 const schedule=()=>{clearTimeout(timer);if(performing)return;const s=quick();if(!s){hide();return;}if(!menu.hidden&&!same())hide();timer=setTimeout(show,settle());};
 // Scrolling or a viewport change moves the open bar after the movement settles instead of closing it for good.
 let follow=0;const reflow=()=>{if(menu.hidden&&!snapshot)return;if(!menu.hidden&&menu.classList.contains('selection-docked'))return;menu.hidden=true;clearTimeout(follow);follow=setTimeout(()=>{snapshot=null;if(!pressing)show();},140);};
 document.addEventListener('selectionchange',schedule);document.addEventListener('pointerup',()=>{pressing=false;schedule();});document.addEventListener('pointercancel',()=>{pressing=false;schedule();});
 document.addEventListener('pointerdown',e=>{if(menu.contains(e.target))return;pressing=true;dismissed=false;hide();});
 document.addEventListener('contextmenu',e=>{if(e.target.closest('.cm-content,.odf-paper,.reader-content,#preview,input,textarea')){e.preventDefault();pressing=false;dismissed=false;show();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!menu.hidden)dismiss();}else if(!['Shift','Control','Alt','Meta'].includes(e.key))dismissed=false;},true);
 window.addEventListener('resize',reflow);window.visualViewport?.addEventListener('resize',reflow);document.addEventListener('scroll',e=>{if(!menu.contains(e.target))reflow();},true);
 window.wenzhouShowSelectionMenu=()=>{pressing=false;dismissed=false;schedule();};window.wenzhouOwnsSelectionMenu=()=>!!capture();
 return {changed:schedule,hide};
}
