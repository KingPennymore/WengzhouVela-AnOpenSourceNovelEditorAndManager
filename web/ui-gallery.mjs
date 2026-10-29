// Development fixture only: neither this entry nor its HTML is in the build copy list.
import {escapeHtml as esc} from './text-utils.mjs';
import {t,setLanguage} from './i18n.mjs';
import {button,iconButton,switchControl,segmented,stepper,settingRow,bindSteppers} from './ui-components.mjs';
import {bindAppChoices} from './app-choices.mjs';

const query=new URLSearchParams(location.search);
await setLanguage(query.get('lang'));
document.body.classList.toggle('dark',query.get('theme')==='dark');
const choices=[{value:'system',label:t('跟随系统')},{value:'light',label:t('浅色模式')},{value:'dark',label:t('深色模式')}];
const section=(name,content)=>`<section class="gallery-stack" aria-label="${esc(name)}"><h2>${esc(name)}</h2>${content}</section>`;
const samples=content=>`<div class="gallery-samples">${content}</div>`;
const number=(name,value,options={})=>stepper(name,value,{label:t('文字字号'),min:12,max:24,step:2,...options});
const select=(extra='')=>`<select class="ui-select" name="palette${extra?'-'+extra:''}" aria-label="${esc(t('配色方案'))}" ${extra==='error'?'aria-invalid="true"':extra==='disabled'?'disabled':''}><option value="pine">${esc(t('青松'))}</option><option value="jade">${esc(t('玉石'))}</option></select>`;
const names=['text-xs','text-sm','text-md','text-lg','text-xl','leading-tight','leading','leading-loose','weight-regular','weight-medium','weight-bold',...Array.from({length:6},(_,i)=>'space-'+(i+1)),'radius-sm','radius-md','radius-lg','radius-full','control-h'];
document.querySelector('#gallery').innerHTML=`<h1>Vela · Phase 1 component gallery</h1><p>Native controls · normal / selected / disabled / error. Use Tab for focus, pointer for hover. Add ?theme=dark or ?lang=en.</p>
${section('Design tokens',`<div class="gallery-tokens">${names.map(name=>`<code>--${name}: <span data-token="${name}"></span></code>`).join('')}</div>`)}
<form id="gallery-form" class="gallery-stack">
${section('Buttons', ['primary','secondary','text','danger'].map(variant=>samples(`<span class="gallery-caption">${variant}</span>${[false,true].map(compact=>[false,true].map(disabled=>button(t(variant==='danger'?'删除':'保存'),{variant,compact,disabled})).join('')).join('')}`)).join(''))}
${section('Switch',samples(switchControl('switch',false,t('自动补全'))+switchControl('switch-on',true,t('启用'))+switchControl('switch-off-disabled',false,t('停用'),{disabled:true})+switchControl('switch-on-disabled',true,t('启用'),{disabled:true})+switchControl('switch-error',false,t('自动补全'),{invalid:true,describedBy:'switch-error-help'}))+`<span id="switch-error-help" class="gallery-caption">Error fixture · check this setting.</span>`)}
${section('Segmented radios',samples(segmented('theme',choices,'system',{label:t('外观')}))+samples(segmented('theme-disabled',choices,'light',{disabled:true}))+samples(segmented('theme-error',choices,'dark',{invalid:true}))+samples(segmented('theme-option-disabled',choices.map((option,i)=>({...option,disabled:i===1})),'system')))}
${section('Stepper',samples(number('font',16)+number('font-min',12)+number('font-max',24)+number('font-disabled',16,{disabled:true})+number('font-error',25,{invalid:true,describedBy:'font-error-help'})+number('decimal',.2,{min:0,max:1,step:.1}))+`<span id="font-error-help" class="gallery-caption">Error fixture · enter 12–24, step 2.</span>`)}
${section('Select · app-choices',samples(select()+select('disabled')+select('error')))}
${section('Setting row',`<div class="ui-card">${settingRow({name:t('文字字号'),help:t('文稿正文'),helpId:'size-help',control:number('setting-font',16,{describedBy:'size-help'})})}${settingRow({name:t('自动补全'),help:t('跟随系统'),control:switchControl('setting-switch',true,t('自动补全'))})}</div>`)}
${section('Card and list row',`<article class="ui-card gallery-stack"><strong>${esc(t('最近文件'))}</strong><button type="button" class="ui-list-row"><span>${esc(t('空白文件'))}</span><span aria-hidden="true">→</span></button><button type="button" class="ui-list-row" disabled>${esc(t('只读'))}</button></article>`)}
${section('Empty / loading / failure',`<div class="ui-empty"><strong>${esc(t('暂无文件'))}</strong>${button(t('导入文件'))}</div><div class="ui-loading" role="status" aria-live="polite">${esc(t('正在读取…'))}</div><div class="ui-failure" role="alert"><span>${esc(t('连接检测未通过。'))}</span>${button(t('检测连接'))}</div>`)}
${section('Notice',`<div class="ui-notice" role="status">${esc(t('工作区配置已保存'))}</div><div class="ui-notice ui-notice--error" role="alert">${esc(t('配置无效，请切换源码修复。'))}${button(t('源码'),{variant:'text'})}</div>`)}
${section('Icon button',samples(iconButton(t('关闭'),'×')+iconButton(t('关闭'),'×',{disabled:true})))}
${section('Dialog / mobile sheet',samples(`<button type="button" class="ui-button ui-button--secondary" data-open="sheet">${esc(t('设置'))}</button><button type="button" class="ui-button ui-button--secondary" data-open="fullscreen">${esc(t('独立预览'))}</button>`))}
</form>
${['sheet','fullscreen'].map(id=>`<dialog id="${id}" class="ui-dialog${id==='fullscreen'?' ui-dialog--fullscreen':''}" aria-labelledby="${id}-title"><form method="dialog" class="gallery-stack"><h2 id="${id}-title">${esc(t('设置'))}</h2>${settingRow({name:t('文字字号'),help:t('文稿正文'),control:number(id+'-font',16)})}<button class="ui-button ui-button--primary" autofocus>${esc(t('关闭'))}</button></form></dialog>`).join('')}`;
for(const element of document.querySelectorAll('[data-token]'))element.textContent=getComputedStyle(element).getPropertyValue('--'+element.dataset.token).trim();
bindSteppers();bindAppChoices();
for(const button of document.querySelectorAll('[data-open]'))button.addEventListener('click',()=>document.getElementById(button.dataset.open).showModal());
document.body.dataset.galleryReady='true';
