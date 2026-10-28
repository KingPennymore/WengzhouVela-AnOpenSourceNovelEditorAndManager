import {t} from './i18n.mjs';

// The named-style panel of the TXT format toolbar: every style as a sample, applied to the selected characters or to
// the whole paragraph. A popover under the button on wide windows, a bottom sheet on narrow ones and touch screens.
import {styleCss,paragraphStyle} from './rich-text-styles.mjs';
import {menuKey} from './menu-controller.mjs';

/**
 * `getState()` returns {styles, hasSelection, active: {chars, paragraph}} for the open TXT, or null when the panel
 * cannot be used; `apply(id, scope)`, `clear()` and `manage()` run the commands.
 */
export function bindStylePanel({button,getState,apply,clear,manage,escape:esc}){
  const panel=document.createElement('div');
  panel.id='format-style-panel';
  panel.className='format-style-panel';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-label',t('命名样式'));
  panel.hidden=true;
  document.body.append(panel);
  let scope='chars';
  const close=()=>{
    if(panel.hidden)return;
    panel.hidden=true;
    button.setAttribute('aria-expanded','false');
  };
  const sheet=()=>innerWidth<720||matchMedia('(pointer:coarse)').matches;
  function render(){
    panel.setAttribute('aria-label',t('命名样式'));
    const state=getState();
    if(!state){
      close();
      return;
    }
    if(!state.hasSelection&&scope==='chars')scope='paragraph';
    const active=scope==='chars'?state.active.chars:state.active.paragraph;
    panel.innerHTML=(`<header>`+
      `<strong>${t('样式')}</strong>`+
      `<div class="format-style-scope" role="radiogroup" aria-label="${t('作用范围')}">`+
      `<button type="button" role="radio" data-scope="chars" aria-checked="${scope==='chars'}"${state.hasSelection?'':` disabled title="${t('先选中文字')}"`}>${t('选中文字')}</button>`+
      `<button type="button" role="radio" data-scope="paragraph" aria-checked="${scope==='paragraph'}">${t('整段')}</button>`+
      `</div>`+
      `</header>
<p class="format-style-hint">${scope==='chars'?t('只改变选中的字。对齐、缩进只在整段时生效。'):state.hasSelection?t('作用于选区所在的每一段。'):t('作用于光标所在段落。选中文字可只改变这些字。')}</p>
<div class="format-style-chips">${Object.entries(state.styles).map(([id,style])=>`<button type="button" data-style-id="${esc(id)}" aria-pressed="${active===id}" title="${esc(paragraphStyle(style)?t('常用于整段'):t('常用于文字'))}"><span data-user-content style="${esc(styleCss(style,{inline:true}))}">${esc(style.label)}</span></button>`).join('')}</div>
<footer>`+
      `<button type="button" class="secondary" data-style-clear>${t('清除样式')}</button>`+
      `<button type="button" class="secondary" data-style-manage>${t('管理样式…')}</button>`+
      `</footer>`);
  }
  function place(){
    panel.classList.toggle('format-style-sheet',sheet());
    if(sheet()){
      panel.style.left='';
      panel.style.top='';
      return;
    }
    const rect=button.getBoundingClientRect(),width=Math.min(340,innerWidth-24);
    panel.style.width=width+'px';
    panel.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px';
    panel.style.top=(rect.bottom+6)+'px';
  }
  const open=()=>{
    const state=getState();
    if(!state)return;
    scope=state.hasSelection?'chars':'paragraph';
    render();
    panel.hidden=false;
    button.setAttribute('aria-expanded','true');
    place();
  };
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>panel.hidden?open():close());

  // Taps inside keep the editor's selection and focus (and the soft keyboard on phones).
  panel.addEventListener('pointerdown',event=>event.preventDefault());
  panel.addEventListener('mousedown',event=>event.preventDefault());
  panel.addEventListener('click',event=>{
    const target=event.target.closest('button');
    if(!target||target.disabled)return;
    if(target.dataset.scope){
      scope=target.dataset.scope;
      render();
      return;
    }
    if(target.dataset.styleId){
      apply(target.dataset.styleId,scope);
      close();
      return;
    }
    if(target.hasAttribute('data-style-clear')){
      clear();
      close();
      return;
    }
    if(target.hasAttribute('data-style-manage')){
      close();
      manage();
    }
  });
  panel.addEventListener('keydown',event=>menuKey(event,[...panel.querySelectorAll('button')],{close,returnFocus:button,trapTab:true}));
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden&&!panel.contains(event.target)&&!button.contains(event.target))close();
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')close();
  });
  addEventListener('resize',()=>{
    if(!panel.hidden)place();
  });
  return {close,refresh:()=>{
    if(!panel.hidden)render();
  }};
}
