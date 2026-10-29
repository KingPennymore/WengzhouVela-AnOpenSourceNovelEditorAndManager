import {escapeHtml as esc} from './text-utils.mjs';

// Text/attribute arguments are already translated. Only control/content slots accept trusted markup.
const flag=(name,value)=>value?' '+name:'';
const attr=(name,value)=>value==null?'':` ${name}="${esc(value)}"`;
export const button=(label,{variant='secondary',compact=false,disabled=false}={})=>`<button type="button" class="ui-button ui-button--${esc(variant)}${compact?' ui-button--compact':''}"${flag('disabled',disabled)}>${esc(label)}</button>`;
export const iconButton=(label,icon,{disabled=false}={})=>`<button type="button" class="ui-icon-button" aria-label="${esc(label)}" title="${esc(label)}"${flag('disabled',disabled)}><span aria-hidden="true">${esc(icon)}</span></button>`;
export const switchControl=(name,checked,label,{disabled=false,invalid=false,describedBy}={})=>`<label class="ui-switch"><input type="checkbox" role="switch" name="${esc(name)}" value="on" aria-label="${esc(label)}"${flag('checked',checked)}${flag('disabled',disabled)}${invalid?' aria-invalid="true"':''}${attr('aria-describedby',describedBy)}><span class="ui-switch-track" aria-hidden="true"></span><span>${esc(label)}</span></label>`;
export const segmented=(name,options,value,{label=name,disabled=false,invalid=false,describedBy}={})=>`<fieldset class="ui-segmented" aria-label="${esc(label)}"${flag('disabled',disabled)}${invalid?' aria-invalid="true"':''}${attr('aria-describedby',describedBy)}>${options.map(option=>`<label class="ui-segmented-option"><input type="radio" name="${esc(name)}" value="${esc(option.value)}"${flag('checked',String(option.value)===String(value))}${flag('disabled',option.disabled)}><span>${esc(option.label)}</span></label>`).join('')}</fieldset>`;
export const stepper=(name,value,{label=name,min,max,step=1,disabled=false,invalid=false,decreaseLabel,increaseLabel,describedBy}={})=>`<span class="ui-stepper"><button type="button" data-ui-step="-1" aria-label="${esc(decreaseLabel??'− '+label)}"${flag('disabled',disabled)}>−</button><input type="number" name="${esc(name)}" value="${esc(value)}" aria-label="${esc(label)}"${attr('min',min)}${attr('max',max)}${attr('step',step)}${flag('disabled',disabled)}${invalid?' aria-invalid="true"':''}${attr('aria-describedby',describedBy)}><button type="button" data-ui-step="1" aria-label="${esc(increaseLabel??'+ '+label)}"${flag('disabled',disabled)}>+</button></span>`;
export const settingRow=({name,help='',control,helpId})=>`<div class="ui-setting-row"><div class="ui-setting-copy"><strong>${esc(name)}</strong>${help?`<span class="ui-setting-help"${attr('id',helpId)}>${esc(help)}</span>`:''}</div><div class="ui-setting-control">${control}</div></div>`;

const bound=new WeakMap();
// Native radios/checkboxes need no script. Number inputs retain validation, form values and arrow keys.
export function bindSteppers(root=document){
  const cleanups=[];
  for(const element of [...(root.matches?.('.ui-stepper')?[root]:[]),...root.querySelectorAll('.ui-stepper')]){
    if(bound.has(element))continue;
    const input=element.querySelector('input[type=number]'),buttons=[...element.querySelectorAll('[data-ui-step]')];
    if(!input)continue;
    const update=()=>{
      const value=input.valueAsNumber;
      for(const button of buttons)button.disabled=input.matches(':disabled')||input.readOnly||(Number.isFinite(value)&&(Number(button.dataset.uiStep)<0?input.min!==''&&value<=Number(input.min):input.max!==''&&value>=Number(input.max)));
    };
    const click=event=>{
      const button=event.target.closest('[data-ui-step]');
      if(!buttons.includes(button)||button.disabled||input.matches(':disabled')||input.readOnly)return;
      const previous=input.value;
      if(Number(button.dataset.uiStep)<0)input.stepDown();else input.stepUp();
      if(input.value!==previous){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      update();
    };
    const form=input.form,reset=()=>queueMicrotask(update),observer=new MutationObserver(update);
    observer.observe(input,{attributes:true,attributeFilter:['disabled','readonly','min','max','step','value']});
    for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.matches('fieldset'))observer.observe(parent,{attributes:true,attributeFilter:['disabled']});
    element.addEventListener('click',click);input.addEventListener('input',update);input.addEventListener('change',update);form?.addEventListener('reset',reset);
    const cleanup=()=>{observer.disconnect();element.removeEventListener('click',click);input.removeEventListener('input',update);input.removeEventListener('change',update);form?.removeEventListener('reset',reset);bound.delete(element);};
    bound.set(element,cleanup);cleanups.push(cleanup);update();
  }
  return ()=>cleanups.forEach(cleanup=>cleanup());
}
