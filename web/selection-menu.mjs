import {SearchQuery,setSearchQuery,openSearchPanel} from '@codemirror/search';
import {native,transport} from './platform.mjs';
import {inlineMarkup,lineMarkup} from './markdown-tools.mjs';
/**
 * Where the horizontal bar goes: centred above the selection, kept inside `bounds` (whose top is the bottom of the
 * editor's toolbar). `pinned` when there is no room above the selection, so the bar sits just below that toolbar.
 */
export function menuPlacement(rect,width,height,bounds,gap=8){
 const left=Math.max(bounds.left+gap,Math.min((rect.left+rect.right)/2-width/2,bounds.right-width-gap)),above=rect.top-height-gap;
 return above>=bounds.top+gap?{left,top:above,pinned:false}:{left,top:bounds.top+gap,pinned:true};
}
export function bindSelectionMenu({getView,getDoc,addGlossary,extraItems=()=>[],fail}){
 const menu=document.createElement('div');menu.id='selection-menu';menu.className='selection-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','选中文字操作');menu.hidden=true;document.body.append(menu);let snapshot=null,timer,pressing=false,performing=false;
 const hide=()=>{menu.hidden=true;document.documentElement.style.setProperty('--selection-dock-height','0px');snapshot=null;};
 const write=async text=>{if(native)await transport('clipboardWrite',{text});else await navigator.clipboard.writeText(text);};
 const read=async()=>native?await transport('clipboardRead'):await navigator.clipboard.readText();
 const activeSurface=node=>node?.nodeType===1?node:node?.parentElement;
 function capture(){
  const s=getSelection(),el=activeSurface(s?.anchorNode),view=getView(),input=document.activeElement;
  if(input?.matches('input:not([type=password]),textarea')){if(typeof input.selectionStart!=='number'||input.selectionStart===input.selectionEnd)return null;return {input,from:input.selectionStart,to:input.selectionEnd,text:input.value.slice(input.selectionStart,input.selectionEnd),rect:input.getBoundingClientRect(),editable:!input.readOnly&&!input.disabled};}
  if(input?.matches('input,select,textarea'))return null;
  if(el?.closest('.odf-paper,.reader-content,#preview')&&s.rangeCount&&!s.isCollapsed){const range=s.getRangeAt(0).cloneRange(),surface=el.closest('.odf-paper,.reader-content,#preview');if(!surface.contains(s.focusNode))return null;const r=range.getBoundingClientRect();return {text:s.toString(),rect:r,range,surface,area:surface.getBoundingClientRect(),editable:surface.contentEditable==='true'||!!el.closest('[contenteditable=true]')&&el.closest('[contenteditable=true]')===activeSurface(s.focusNode)?.closest('[contenteditable=true]')};}
  if(view&&!document.querySelector('#write-view').hidden&&!document.querySelector('#editor').hidden){const r=view.state.selection.main;if(!r.empty){const clip=view.scrollDOM.getBoundingClientRect();if(r.to<view.viewport.from||r.from>view.viewport.to)return null;const from=view.coordsAtPos(Math.max(r.from,view.viewport.from))||{left:clip.left,right:clip.left,top:clip.top,bottom:clip.top},to=view.coordsAtPos(Math.min(r.to,view.viewport.to))||{left:clip.right,right:clip.right,top:clip.bottom,bottom:clip.bottom};const rect={left:r.from===r.to?from.left:Math.min(from.left,to.left),right:Math.max(from.right,to.right),top:Math.max(clip.top,Math.min(from.top,to.top)),bottom:Math.min(clip.bottom,Math.max(from.bottom,to.bottom))};if(view.state.doc.lineAt(r.from).number!==view.state.doc.lineAt(r.to).number){rect.left=clip.left;rect.right=clip.right;}if(rect.bottom<=rect.top)return null;return {text:view.state.sliceDoc(r.from,r.to),rect,area:clip,view,doc:view.state.doc,from:r.from,to:r.to,editable:!view.state.readOnly};}}
  return null;
 }
 const restore=s=>{if(s.input){if(!s.input.isConnected)throw Error('输入框已关闭。');s.input.focus();s.input.setSelectionRange(s.from,s.to);}else if(s.view){if(getView()!==s.view||s.doc!==s.view.state.doc)throw Error('文稿已变化，请重新选择。');s.view.dispatch({selection:{anchor:s.from,head:s.to}});s.view.focus();}else{if(!s.surface.isConnected)throw Error('选区已关闭。');const selection=getSelection();selection.removeAllRanges();selection.addRange(s.range);s.surface.focus();}};
 const replace=(s,text)=>{restore(s);if(s.input){s.input.setRangeText(text,s.from,s.to,'end');s.input.dispatchEvent(new Event('input',{bubbles:true}));}else if(s.view)s.view.dispatch({changes:{from:s.from,to:s.to,insert:text},selection:{anchor:s.from+text.length},userEvent:'input.selection'});else{document.execCommand('insertText',false,text);s.surface.odfSync?.();}};
 function show(){
  clearTimeout(timer);if(pressing||performing||document.querySelector('dialog[open]'))return;const s=capture();if(!s||!s.text.trim()){hide();return;}snapshot=s;menu.replaceChildren();
  // Cut, copy and paste stay on the bar; everything else (search, glossary, Markdown/TeX/ODF formats, plugin items) is under “更多”.
  const basic=[],more=[];
  const item=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','menuitem');b.onpointerdown=e=>e.preventDefault();b.onclick=async()=>{const selected=snapshot;if(!selected)return;performing=true;try{await action(selected);hide();}catch(e){fail(e);}finally{performing=false;}};return b;};
  const add=(label,action,primary=false)=>(primary?basic:more).push(item(label,action));
  if(s.editable)add('剪切',async s=>{restore(s);await write(s.text);replace(s,'');},true);
  add('复制',s=>write(s.text),true);if(s.editable)add('粘贴',async s=>replace(s,await read()),true);
  if(!s.input)add('搜索',s=>{if(s.view){restore(s);s.view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(s.view);}else{addSearch(s);}});
  if(!s.input)add('加入词库',s=>addGlossary(s.text));for(const extra of extraItems(s))add(extra.label,()=>extra.run());
  // Formatting commands already on a visible toolbar are not repeated here.
  const toolbar=!document.querySelector('#markdown-tools')?.hidden;
  if(s.view&&!toolbar&&getDoc()?.name.match(/\.(md|markdown)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'**');});add('斜体',s=>{restore(s);inlineMarkup(s.view,'*');});add('引用',s=>{restore(s);lineMarkup(s.view,'> ');});}
  if(s.view&&!toolbar&&getDoc()?.name.match(/\.(tex|latex)$/i)){add('加粗',s=>{restore(s);inlineMarkup(s.view,'\\textbf{','}');});add('行内公式',s=>{restore(s);inlineMarkup(s.view,'$');});}
  if(s.surface?.odfCommand&&s.editable){add('加粗',s=>{restore(s);s.surface.odfCommand('bold');});add('斜体',s=>{restore(s);s.surface.odfCommand('italic');});add('下划线',s=>{restore(s);s.surface.odfCommand('underline');});}
  menu.append(...basic);
  if(more.length){
   const list=document.createElement('div');list.className='selection-more';list.setAttribute('role','menu');list.setAttribute('aria-label','更多操作');list.hidden=true;list.append(...more);
   const toggle=document.createElement('button');toggle.type='button';toggle.className='selection-more-toggle';toggle.textContent='更多';toggle.setAttribute('aria-haspopup','menu');toggle.setAttribute('aria-expanded','false');toggle.onpointerdown=e=>e.preventDefault();
   toggle.onclick=()=>{list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));if(!list.hidden)placeMore(list);};
   menu.append(toggle,list);
  }
  menu.hidden=false;menu.classList.remove('selection-pinned');document.documentElement.style.setProperty('--selection-dock-height','0px');
  const visual=window.visualViewport,root=getComputedStyle(document.documentElement),safeTop=parseFloat(root.getPropertyValue('--safe-top'))||0;
  // The bar sits above the selection; when the selection starts above the visible editor (or there is no room above
  // it), the bar is pinned just below the editor's toolbar instead of covering the toolbar.
  const top=Math.max(safeTop,s.area?.top??safeTop),bounds={left:0,top,right:innerWidth,bottom:Math.min(innerHeight,visual?.height||innerHeight)-(parseFloat(root.getPropertyValue('--safe-bottom'))||0)};
  menu.style.width='';menu.style.maxHeight='';menu.style.maxWidth=(bounds.right-16)+'px';const size=menu.getBoundingClientRect(),position=menuPlacement(s.rect,size.width,size.height,bounds);
  menu.style.left=position.left+'px';menu.style.top=position.top+'px';menu.classList.toggle('selection-pinned',position.pinned);
 }
 // “更多” opens below the bar when there is room, otherwise above it; it lines up with the bar's right edge.
 function placeMore(list){
  list.classList.remove('selection-more-up');const bar=menu.getBoundingClientRect(),height=list.getBoundingClientRect().height,bottom=Math.min(innerHeight,window.visualViewport?.height||innerHeight);
  if(bar.bottom+height+8>bottom&&bar.top-height-8>=0)list.classList.add('selection-more-up');
 }
 function addSearch(s){const reader=document.querySelector('#reader-tools');if(s.surface.closest('#reader-view')&&reader){reader.click();const input=document.querySelector('.reader-tools-panel input');if(input){input.value=s.text;input.dispatchEvent(new Event('input',{bubbles:true}));}}else{const view=getView();if(view){document.querySelector('[data-display=source]')?.click();view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:s.text}))});openSearchPanel(view);}}}
 const schedule=(delay=180)=>{clearTimeout(timer);timer=setTimeout(show,delay);};
 document.addEventListener('selectionchange',()=>schedule());document.addEventListener('pointerup',()=>{pressing=false;schedule();});document.addEventListener('pointercancel',()=>{pressing=false;schedule();});
 document.addEventListener('pointerdown',e=>{if(menu.contains(e.target))return;pressing=true;hide();});
 document.addEventListener('contextmenu',e=>{if(e.target.closest('.cm-content,.odf-paper,.reader-content,#preview,input,textarea')){e.preventDefault();pressing=false;show();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 window.addEventListener('resize',hide);// Scrolling hides the bar; it comes back where the selection now is once scrolling stops.
 document.addEventListener('scroll',e=>{if(menu.contains(e.target))return;const had=!menu.hidden||!!snapshot;hide();if(had||capture())schedule(320);},true);
 window.wenzhouShowSelectionMenu=()=>{pressing=false;schedule();};window.wenzhouOwnsSelectionMenu=()=>!!capture();
 return {changed:()=>schedule(),hide};
}
