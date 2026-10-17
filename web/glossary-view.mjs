import {parseGlossary,glossaryText} from './glossary.mjs';
import {t} from './i18n.mjs';
import {glossaryKeywords,matchesGlossary} from './glossary-search.mjs';

// The .gly page: a dense list (term, category, first line of the definition, aliases) with search and category
// filters; tapping a row opens the entry, a long press copies its term. Every change is saved on its own: creating
// and deleting at once, edits shortly after typing stops. The page keeps its place (list or entry, search, filter,
// scroll) across re-renders, so saving never interrupts typing.
const pages=new Map();
export function selectGlossaryEntry(id,entry){const state=pages.get(id)||{query:'',category:'',scroll:0};state.entry=entry;pages.set(id,state);}
const LONG_PRESS=500,EDIT_DELAY=700;

/** onSave(text) writes the file without redrawing this page; onCopy(text) copies; notify(message) shows a toast. */
export function renderGlossary({root,doc,escape:esc,onSave,onCopy=()=>{},notify=()=>{}}){
  // The scrolling root stays transparent; .glossary-surface paints the page (ArkWeb repaints it during theme fades).
  root.className='glossary-preview';let value;
  try{value=parseGlossary(doc.text);}catch(error){root.innerHTML=`<div class="glossary-surface"><section class="glossary-error"><h2>${t('术语库')}</h2><p class="error">${esc(error.message)}</p><p>${t('配置无效，请切换源码修复。')}</p></section></div>`;return;}
  const state=pages.get(doc.id)||{entry:null,query:'',category:'',scroll:0};pages.set(doc.id,state);
  let entries=structuredClone(value.entries),name=value.name||doc.name.replace(/\.(gly|glossary)$/i,''),timer=null,draft=null;
  if(state.entry&&state.entry!=='new'&&!entries.some(entry=>entry.id===state.entry))state.entry=null;
  const categories=()=>[...new Set(entries.map(entry=>entry.category?.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const visible=()=>{const query=glossaryKeywords(state.query);return entries.filter(entry=>(!state.category||(entry.category||'').trim()===state.category)&&matchesGlossary(entry,query));};
  const status=(text,error=false)=>{const node=root.querySelector('.glossary-status');if(node){node.textContent=text;node.classList.toggle('error',error);}};
  // Saves the current entries; a draft without a term is not part of the file yet.
  async function persist(){
    clearTimeout(timer);timer=null;const list=entries.filter(entry=>entry!==draft||entry.term.trim());
    let text;try{text=glossaryText({...value,name,entries:list});}catch(error){status(error.message,true);return false;}
    if(draft&&draft.term.trim()){if(state.entry==='new')state.entry=draft.id;draft=null;}
    try{await onSave(text);status(t('已自动保存'));return true;}catch(error){status(error.message,true);return false;}
  }
  const later=()=>{status(t('正在保存…'));clearTimeout(timer);timer=setTimeout(persist,EDIT_DELAY);};

  function renderList(){
    const shown=visible(),all=categories();
    root.innerHTML=`<div class="glossary-surface"><section class="glossary-page"><header class="glossary-head"><span class="glossary-kind">GLY</span><input class="glossary-name" name="name" maxlength="160" value="${esc(name)}" aria-label="${t('术语库名称')}"><small class="glossary-status">${t('修改会自动保存')}</small></header>
<div class="glossary-tools"><input type="search" id="glossary-search" value="${esc(state.query)}" placeholder="${t('搜索词条、别名或释义…')}" aria-label="${t('搜索词条')}"><button type="button" class="primary" id="glossary-add">＋ ${t('新建词条')}</button></div>
${all.length?`<div class="glossary-filters" role="radiogroup" aria-label="${t('按分类筛选')}"><button type="button" role="radio" data-category="" aria-checked="${!state.category}">${t('全部')} ${entries.length}</button>${all.map(category=>`<button type="button" role="radio" data-category="${esc(category)}" aria-checked="${state.category===category}">${esc(category)} ${entries.filter(entry=>(entry.category||'').trim()===category).length}</button>`).join('')}</div>`:''}
<p class="glossary-count">${shown.length===entries.length?entries.length+' '+t('个词条'):shown.length+' / '+entries.length+' '+t('个词条')} · <span>${t('点按查看，长按复制词条')}</span></p>
<ul class="glossary-list" role="list">${shown.map(entry=>`<li><button type="button" class="glossary-row" data-entry="${esc(entry.id)}"><strong data-user-content>${esc(entry.term)}</strong>${entry.category?`<span class="glossary-tag" data-user-content>${esc(entry.category)}</span>`:''}<span class="glossary-gist" data-user-content>${esc((entry.definition||'').split('\n')[0])||`<em>${t('无释义')}</em>`}</span>${entry.aliases.length?`<small>${t('别名')} ${entry.aliases.length}</small>`:''}</button></li>`).join('')}</ul>
${shown.length?'':`<p class="blank">${entries.length?t('没有匹配的词条'):t('还没有词条。点“新建词条”添加人物、地名、设定等。')}</p>`}</section></div>`;
    const list=root.querySelector('.glossary-list');list.scrollTop=0;root.scrollTop=state.scroll;
    const search=root.querySelector('#glossary-search');search.oninput=search.onsearch=()=>{state.query=search.value;const caret=search.selectionStart;renderList();const next=root.querySelector('#glossary-search');next.focus();next.setSelectionRange(caret,caret);};
    root.querySelector('.glossary-name').onchange=event=>{name=event.target.value.trim()||name;persist();};
    root.querySelector('#glossary-add').onclick=()=>{draft={id:crypto.randomUUID(),term:'',definition:'',category:state.category||'',aliases:[]};entries.unshift(draft);open('new');};
    root.querySelector('.glossary-filters')?.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(button){state.category=button.dataset.category;renderList();}});
    bindRows(list);
  }
  // Tap opens, a long press (or the context menu) copies the term; a press that turns into a scroll does nothing.
  function bindRows(list){
    let press=null;
    const clear=()=>{if(press){clearTimeout(press.timer);press=null;}};
    list.addEventListener('pointerdown',event=>{const row=event.target.closest('.glossary-row');if(!row||event.button>0)return;clear();press={row,x:event.clientX,y:event.clientY,copied:false,timer:setTimeout(()=>{press.copied=true;copy(row);},LONG_PRESS)};});
    list.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)clear();});
    for(const type of ['pointerup','pointercancel','pointerleave'])list.addEventListener(type,()=>{if(press&&!press.copied)clearTimeout(press.timer);});
    list.addEventListener('click',event=>{const row=event.target.closest('.glossary-row');if(!row)return;if(press?.copied&&press.row===row){press=null;event.preventDefault();return;}press=null;state.scroll=root.scrollTop;open(row.dataset.entry);});
    list.addEventListener('contextmenu',event=>{const row=event.target.closest('.glossary-row');if(!row)return;event.preventDefault();copy(row);});
  }
  async function copy(row){const entry=entries.find(item=>item.id===row.dataset.entry);if(!entry)return;row.classList.add('copied');setTimeout(()=>row.classList.remove('copied'),600);try{await onCopy(entry.term);notify(t('已复制')+'“'+entry.term+'”');}catch(error){notify(t('复制失败：')+error.message);}}

  function open(id){state.entry=id;renderEntry();}
  function back(){
    if(draft&&!draft.term.trim()){entries=entries.filter(entry=>entry!==draft);draft=null;}
    if(timer)persist();state.entry=null;renderList();
  }
  function renderEntry(){
    const entry=state.entry==='new'?draft:entries.find(item=>item.id===state.entry);if(!entry){state.entry=null;renderList();return;}
    const shown=visible(),at=shown.indexOf(entry),prev=at>0?shown[at-1]:null,next=at>=0&&at<shown.length-1?shown[at+1]:null;
    root.innerHTML=`<div class="glossary-surface"><section class="glossary-page glossary-detail"><header class="glossary-head"><button type="button" class="secondary" id="glossary-back">← ${t('全部词条')}</button><small class="glossary-status">${entry===draft?t('填写词条后自动保存'):t('修改会自动保存')}</small><span class="glossary-nav"><button type="button" class="secondary" data-go="${esc(prev?.id||'')}" ${prev?'':'disabled'} aria-label="${t('上一条')}">‹</button><button type="button" class="secondary" data-go="${esc(next?.id||'')}" ${next?'':'disabled'} aria-label="${t('下一条')}">›</button></span></header>
<form class="glossary-fields" autocomplete="off"><label class="glossary-term">${t('词条')}<input name="term" maxlength="120" value="${esc(entry.term)}" required placeholder="${t('人物、地名、设定…')}"></label>
<div class="glossary-pair"><label>${t('分类')}<input name="category" maxlength="120" value="${esc(entry.category||'')}" list="glossary-categories"></label><label>${t('别名')}<input name="aliases" value="${esc(entry.aliases.join('，'))}" placeholder="${t('多个别名用逗号分隔')}"></label></div>
<datalist id="glossary-categories">${categories().map(category=>`<option value="${esc(category)}">`).join('')}</datalist>
<label class="glossary-definition">${t('释义')}<textarea name="definition" maxlength="4000" rows="10">${esc(entry.definition||'')}</textarea></label>
<div class="glossary-actions"><button type="button" class="secondary" id="glossary-copy">${t('复制词条')}</button><button type="button" class="danger" id="glossary-delete">${t('删除词条')}</button></div></form></section></div>`;
    const form=root.querySelector('form');root.scrollTop=0;if(entry===draft)form.elements.term.focus();
    form.oninput=event=>{const field=event.target.name;if(!field)return;entry[field]=field==='aliases'?event.target.value.split(/[,，、]/).map(item=>item.trim()).filter(Boolean):field==='term'?event.target.value.trim():event.target.value;if(entry===draft&&!entry.term){status(t('填写词条后自动保存'));return;}later();};
    form.onsubmit=event=>event.preventDefault();
    root.querySelector('#glossary-back').onclick=back;
    root.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{if(timer)persist();if(button.dataset.go)open(button.dataset.go);});
    root.querySelector('#glossary-copy').onclick=async()=>{if(!entry.term)return;try{await onCopy(entry.term);notify(t('已复制')+'“'+entry.term+'”');}catch(error){notify(t('复制失败：')+error.message);}};
    const remove=root.querySelector('#glossary-delete');
    remove.onclick=async()=>{
      if(entry===draft){entries=entries.filter(item=>item!==draft);draft=null;state.entry=null;renderList();return;}
      if(remove.dataset.confirm!=='1'){remove.dataset.confirm='1';remove.textContent=t('确认删除');setTimeout(()=>{if(remove.isConnected){remove.dataset.confirm='';remove.textContent=t('删除词条');}},4000);return;}
      const index=entries.indexOf(entry);entries.splice(index,1);
      if(await persist()){state.entry=null;renderList();notify(t('已删除')+'“'+entry.term+'”');}else{entries.splice(index,0,entry);}
    };
  }
  if(state.entry==='new')state.entry=null;
  if(state.entry)renderEntry();else renderList();
}
