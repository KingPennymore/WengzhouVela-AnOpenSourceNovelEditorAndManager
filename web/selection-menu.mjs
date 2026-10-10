import {SearchQuery,setSearchQuery,openSearchPanel} from '@codemirror/search';
import {native,transport} from './platform.mjs';
import {inlineMarkup,lineMarkup} from './markdown-tools.mjs';
// Try four non-overlapping placements; large selections get a separate scrollable rail.
export function menuPlacement(rect,width,height,bounds){
 const gap=10,x=Math.max(bounds.left+gap,Math.min(rect.left,bounds.right-width-gap));
 const positions=[{left:x,top:rect.top-height-gap},{left:x,top:rect.bottom+gap},{left:rect.right+gap,top:Math.max(bounds.top+gap,Math.min(rect.top,bounds.bottom-height-gap))},{left:rect.left-width-gap,top:Math.max(bounds.top+gap,Math.min(rect.top,bounds.bottom-height-gap))}];
 return positions.find(p=>p.left>=bounds.left+gap&&p.top>=bounds.top+gap&&p.left+width<=bounds.right-gap&&p.top+height<=bounds.bottom-gap)||null;
}
export function bindSelectionMenu({getView,getDoc,addGlossary,fail}){
 const menu=document.createElement('div');menu.id='selection-menu';menu.className='selection-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','选中文字操作');menu.hidden=true;document.body.append(menu);let snapshot=null,timer,pressing=false,performing=false;
 const hide=()=>{menu.hidden=true;document.documentElement.style.setProperty('--selection-dock-height','0px');snapshot=null;};
 const write=async text=>{if(native)await transport('clipboardWrite',{text});else await navigator.clipboard.writeText(text);};
 const read=async()=>native?await transport('clipboardRead'):await navigator.clipboard.readText();
 const activeSurface=node=>node?.nodeType===1?node:node?.parentElement;
 function capture(){
  const s=getSelection(),el=activeSurface(s?.anchorNode),view=getView(),input=document.activeElement;
  if(input?.matches('input:not([type=password]),textarea')){if(typeof input.selectionStart!=='number'||input.selectionStart===input.selectionEnd)return null;return {input,from:input.selectionStart,to:input.selectionEnd,text:input.value.slice(input.selectionStart,input.selectionEnd),rect:input.getBoundingClientRect(),editable:!input.readOnly&&!input.disabled};}
  if(input?.matches('input,select,textarea'))return null;
  if(el?.closest('.odf-paper,.reader-content,#preview')&&s.rangeCount&&!s.isCollapsed){const range=s.getRangeAt(0).cloneRange(),surface=el.closest('.odf-paper,.reader-content,#preview');if(!surface.contains(s.focusNode))return null;const r=range.getBoundingClientRect();return {text:s.toString(),rect:r,range,surface,editable:surface.contentEditable==='true'||!!el.closest('[contenteditable=true]')&&el.closest('[contenteditable=true]')===activeSurface(s.focusNode)?.closest('[contenteditable=true]')};}
  if(view&&!document.querySelector('#write-view').hidden&&!document.querySelector('#editor').hidden){const r=view.state.selection.main;if(!r.empty){const clip=view.scrollDOM.getBoundingClientRect();if(r.to<view.viewport.from||r.from>view.viewport.to)return null;const from=view.coordsAtPos(Math.max(r.from,view.viewport.from))||{left:clip.left,right:clip.left,top:clip.top,bottom:clip.top},to=view.coordsAtPos(Math.min(r.to,view.viewport.to))||{left:clip.right,right:clip.right,top:clip.bottom,bottom:clip.bottom};const rect={left:r.from===r.to?from.left:Math.min(from.left,to.left),right:Math.max(from.right,to.right),top:Math.max(clip.top,Math.min(from.top,to.top)),bottom:Math.min(clip.bottom,Math.max(from.bottom,to.bottom))};if(view.state.doc.lineAt(r.from).number!==view.state.doc.lineAt(r.to).number){rect.left=clip.left;rect.right=clip.right;}if(rect.bottom<=rect.top)return null;return {text:view.state.sliceDoc(r.from,r.to),rect,view,doc:view.state.doc,from:r.from,to:r.to,editable:!view.state.readOnly};}}
  return null;
 }
 const restore=s=>{if(s.input){if(!s.input.isConnected)throw Error('输入框已关闭。');s.input.focus();s.input.setSelectionRange(s.from,s.to);}else if(s.view){if(getView()!==s.view||s.doc!==s.view.state.doc)throw Error('文稿已变化，请重新选择。');s.view.dispatch({selection:{anchor:s.from,head:s.to}});s.view.focus();}else{if(!s.surface.isConnected)throw Error('选区已关闭。');const selection=getSelection();selection.removeAllRanges();selection.addRange(s.range);s.surface.focus();}};
 const replace=(s,text)=>{restore(s);if(s.input){s.input.setRangeText(text,s.from,s.to,'end');s.input.dispatchEvent(new Event('input',{bubbles:true}));}else if(s.view)s.view.dispatch({changes:{from:s.from,to:s.to,insert:text},selection:{anchor:s.from+text.length},userEvent:'input.selection'});else{document.execCommand('insertText',false,text);s.surface.odfSync?.();}};
 function show(){
  clearTimeout(timer);if(pressing||performing||document.querySelector('dialog[open]'))return;const s=capture();if(!s||!s.text.trim()){hide();return;}snapshot=s;menu.replaceChildren();
  const add=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','menuitem');b.onpointerdown=e=>e.preventDefault();b.onclick=async()=>{const selected=snapshot;if(!selected)return;performing=true;try{await action(selected);hide();}catch(e){fail(e);}finally{performing=false;}};menu.append(b);};
  add('复制',s=>write(s.text));if(s.editable){add('粘贴',async s=>replace(s,await read()));add('剪切',async s=>{restore(s);await write(s.text);replace(s,'');});}
  if(!s.input)add('搜索',s=>{if(s.view){restore(s);s.view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(s.view);}else{addSearch(s);}});
  if(!s.input)add('加入词库',s=>addGlossary(s.text));
  if(s.view&&getDoc()?.name.match(/\.(md|markdown)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'**');});add('斜体',s=>{restore(s);inlineMarkup(s.view,'*');});add('引用',s=>{restore(s);lineMarkup(s.view,'> ');});}
  if(s.view&&getDoc()?.name.match(/\.(tex|latex)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'\\textbf{','}');});add('行内公式',s=>{restore(s);inlineMarkup(s.view,'$');});}
  if(s.surface?.odfCommand&&s.editable){add('加粗',s=>{restore(s);s.surface.odfCommand('bold');});add('斜体',s=>{restore(s);s.surface.odfCommand('italic');});add('下划线',s=>{restore(s);s.surface.odfCommand('underline');});}
  add('关闭',hide);menu.hidden=false;menu.classList.remove('selection-docked');document.documentElement.style.setProperty('--selection-dock-height','0px');
  const visual=window.visualViewport,bounds={left:0,top:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top'))||0,right:innerWidth,bottom:Math.min(innerHeight,visual?.height||innerHeight)-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'))||0)};const h=Math.min(menu.scrollHeight,bounds.bottom-20),w=Math.min(160,bounds.right-20);menu.style.width=w+'px';menu.style.maxHeight=h+'px';const position=menuPlacement(s.rect,w,h,bounds);
  if(position){menu.style.left=position.left+'px';menu.style.top=position.top+'px';}else{const dock=Math.min(240,Math.floor(bounds.bottom/3));menu.classList.add('selection-docked');menu.style.left='0';menu.style.top=(bounds.bottom-dock)+'px';menu.style.width='100%';menu.style.maxHeight=dock+'px';document.documentElement.style.setProperty('--selection-dock-height',(dock+Math.min(innerHeight,visual?.height||innerHeight)-bounds.bottom)+'px');}
 }
 function addSearch(s){const reader=document.querySelector('#reader-tools');if(s.surface.closest('#reader-view')&&reader){reader.click();const input=document.querySelector('.reader-tools-panel input');if(input){input.value=s.text;input.dispatchEvent(new Event('input',{bubbles:true}));}}else{const view=getView();if(view){document.querySelector('[data-display=source]')?.click();view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(view);}}}
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(show,180);};
 document.addEventListener('selectionchange',schedule);document.addEventListener('pointerup',()=>{pressing=false;schedule();});document.addEventListener('pointercancel',()=>{pressing=false;schedule();});
 document.addEventListener('pointerdown',e=>{if(menu.contains(e.target))return;pressing=true;hide();});
 document.addEventListener('contextmenu',e=>{if(e.target.closest('.cm-content,.odf-paper,.reader-content,#preview,input,textarea')){e.preventDefault();pressing=false;show();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 window.addEventListener('resize',hide);document.addEventListener('scroll',e=>{if(!menu.contains(e.target))hide();},true);
 window.wenzhouShowSelectionMenu=()=>{pressing=false;schedule();};window.wenzhouOwnsSelectionMenu=()=>!!capture();
 return {changed:schedule,hide};
}
