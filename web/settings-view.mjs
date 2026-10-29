// A settings view owns its bindings and async work. Storage and editor effects stay in the host adapter.
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {switchControl,segmented,stepper,settingRow,bindSteppers} from './ui-components.mjs';
import {beginViewSession} from './view-session.mjs';
import {mountFontSettings} from './app-core/font-settings.mjs';
import {preset} from './ai-providers.mjs';
import {privacyMarkup} from './settings-privacy.mjs';
import {mountAiSettings} from './ai-settings.mjs';

const groups=()=>[
  ['appearance',t('外观'),'◐'],['editing',t('编辑'),'Aa'],['terms',t('补全与术语'),'≡'],
  ['chapters',t('章节与字数'),'#'],['reading',t('阅读'),'▤'],['ai',t('AI 助手'),'✦'],
  ['storage',t('存储与同步'),'▣'],['about',t('备份与关于'),'ⓘ']
];
const options=entries=>entries.map(([value,label])=>({value,label:t(label)}));
export function mountSettings(root,host,{group}={}){
  const dialog=root.closest('dialog'),owner=root.viewSession,small=()=>matchMedia('(max-width:899px)').matches;
  let active=group||'appearance',detail=!!group,view=null,listScroll=0,lastCategory=active;
  const scrolls=new Map(),drafts=new Map();
  let settings=host.workspace.settings;
  const item=(group,name,type,label,help='',extra={})=>({group,name,type,label,help,...extra,
    get:()=>name==='fontSize'?host.fontSize():name==='globalVelaOverride'?host.globalReader().appearancePolicy==='personal':name==='countMode'||name==='includeHeading'?settings.writer[name]:settings[name],
    set:value=>host.changed(name,value)});
  const items=()=>[
    item('appearance','theme','segmented',t('主题'),'',{options:options([['system','跟随系统'],['light','浅色模式'],['dark','深色模式']])}),
    item('appearance','palette','palette',t('配色方案')),
    item('appearance','fontFamily','font',t('界面与正文字体')),
    item('appearance','language','segmented',t('语言'),'',{options:[{value:'zh-CN',label:t('简体中文')},{value:'en',label:'English'}]}),
    item('editing','immersiveWriting','switch',t('沉浸写作'),t('连续输入时收起操作栏，滑动或点按屏幕边缘恢复。'),{default:true}),
    item('editing','fontSize','number',t('文字字号'),'',{min:10,max:40}),
    item('editing','richText','switch',t('TXT 格式工具'),t('粗体、着重号、注音、插图和样式；格式保存在作品配置 .vela 中，TXT 正文不变')),
    item('editing','novelLineNumbers','switch',t('小说模式显示行号')),
    item('terms','autoNouns','switch',t('正文名词候选补全'),t('本地推测人名、地名等候选，不自动加入术语库。'),{default:true}),
    item('terms','highlightTerms','switch',t('正文术语高亮与释义'),say('显示术语库中的释义。','Show definitions from the glossary.')),
    item('terms','glossaryPanel','switch',t('正文与术语库同屏'),say('在正文旁显示关联的术语库。','Show the linked glossary beside the manuscript.')),
    item('chapters','countMode','segmented',t('字数规则'),'',{options:options([['nonspace','非空白字符（含标点）'],['letters','仅文字与数字']])}),
    item('chapters','includeHeading','switch',t('字数包含章节标题')),
    item('reading','readingMode','reading',t('阅读方式'),'',{options:options([['scroll','上下滑动'],['pages','左右翻页'],['double','双页阅读']])}),
    item('reading','globalVelaOverride','switch',t('统一使用我的阅读排版')),
    ...(host.native?[item('about','updateChecks','switch',t('自动检查更新'),'',{default:true})]:[])
  ];
  const summary=id=>{
    if(id==='appearance'){const palette=host.palettes().find(p=>p.id===settings.palette);return [t({system:'跟随系统',light:'浅色模式',dark:'深色模式'}[settings.theme]||'跟随系统'),palette&&(palette.custom?palette.name:t(palette.name))].filter(Boolean).join(' · ');}
    if(id==='editing')return host.fontSize()+' px';
    if(id==='chapters')return t(settings.writer.countMode==='letters'?'仅文字与数字':'非空白字符（含标点）');
    if(id==='reading')return t({scroll:'上下滑动',pages:'左右翻页',double:'双页阅读'}[settings.readingMode]||'上下滑动');
    if(id==='terms'){const count=[settings.autoNouns!==false,settings.highlightTerms,settings.glossaryPanel].filter(Boolean).length;return say(`${count} 项已开启`,`${count} enabled`);}
    if(id==='storage')return say(`${host.workspace.documents.length} 个文件`,`${host.workspace.documents.length} files`);
    if(id==='ai')return settings.ai?.enabled?[t(preset(settings.ai.provider).name),settings.ai.models?.extract].filter(Boolean).join(' · '):say('未启用','Disabled');
    if(id==='about')return host.version;
    return '';
  };
  const selectControl=entry=>{
    const value=entry.get(),attrs={label:entry.label,describedBy:entry.help?entry.name+'-help':undefined};
    if(entry.type==='switch')return switchControl(entry.name,value??entry.default??false,entry.label,{...attrs,hideLabel:true});
    if(entry.type==='number')return stepper(entry.name,value,{...attrs,min:entry.min,max:entry.max});
    if(entry.type==='segmented'||entry.type==='reading')return segmented(entry.name,entry.options,value,attrs);
    if(entry.type==='palette')return `<fieldset class="palette-options" aria-label="${entry.label}">${host.palettes().map(p=>`<label class="palette-choice${p.custom?' custom':''}"><input type="radio" name="palette" value="${esc(p.id)}" ${p.id===value?'checked':''}><span class="palette-swatches"><i style="background:${p.light.accent}"></i><i style="background:${p.light.soft}"></i><i style="background:${p.dark.paper}"></i></span><span>${esc(p.custom?p.name:t(p.name))}</span>${p.custom?`<button type="button" class="ui-button ui-button--text" data-edit-palette="${esc(p.id)}">${t('编辑')}</button>`:''}</label>`).join('')}${host.customPalettes().length<host.maxPalettes?`<button type="button" class="ui-button ui-button--secondary" id="new-palette">${t('＋ 自定义')}</button>`:''}</fieldset>`;
    return '<div data-font-settings></div>';
  };
  const action=(id,label)=>`<button type="button" class="ui-button ui-button--secondary" id="${id}">${esc(label)}</button>`;
  const extras=id=>{
    if(id==='chapters')return settingRow({name:say('章节识别','Chapter recognition'),help:t('自动识别标准中英章节标题；额外模板保存在工作区 .vela 配置中。'),control:action('edit-chapter-templates',t('标题模板'))});
    if(id==='reading')return `<details><summary>${say('高级','Advanced')}</summary>${action('edit-global-vela',t('编辑全局 .vela'))}</details>`;
    if(id==='ai')return `<div class="ai-settings" id="ai-settings">${t('正在读取…')}</div>`;
    if(id==='storage')return settingRow({name:t('创建 .vela 配置'),help:say('保存当前作品的阅读列表与排版配置。','Save reading order and layout for this work.'),control:action('create-vela',t('创建 .vela 配置'))})+settingRow({name:t('清除冗余文件'),help:say('检查并确认后清理同步产生的冗余文件。','Review redundant sync files before removing them.'),control:action('cleanup-redundant',t('清除冗余文件'))});
    if(id==='about')return `<div class="settings-backups">${action('backup-all',t('导出全部文稿备份'))}${action('restore-backup',t('恢复文稿备份'))}</div><div class="ui-list-row"><strong>Vela ${esc(host.version)}</strong><span>${t('开源小说创作 / 阅读工具')}</span></div>${host.native?action('check-updates',t('检查更新')):''}${action('show-licenses',t('开源许可'))}${action('show-guide',t('使用指南'))}${action('show-privacy',t('隐私政策'))}`;
    return '';
  };
  function remember(){
    if(!view||!view.alive())return;
    const content=root.querySelector('.settings-content');if(content)scrolls.set(active,content.scrollTop);
    for(const input of root.querySelectorAll('.settings-content input,.settings-content select')){
      if(input.name==='aiFormat'&&input.checked)drafts.set(input.name,input.value);
      if(input.name&&input.type!=='radio'&&input.type!=='checkbox')drafts.set(input.name,input.value);
    }
  }
  function render(){
    settings=host.workspace.settings;view?.dispose();
    dialog.classList.add('settings-dialog');
    const title=groups().find(g=>g[0]===active)?.[1]||t('设置');
    root.innerHTML=`<nav class="settings-navigation" aria-label="${t('设置分类')}">${groups().map(([id,label,icon])=>`<button type="button" class="ui-list-row" data-settings-group="${id}" aria-controls="settings-detail" ${active===id?'aria-current="location"':''}><span aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${esc(summary(id))}</small></span><span aria-hidden="true">›</span></button>`).join('')}</nav><div class="settings-content" id="settings-detail"><section class="settings-section" id="settings-section-${active}" aria-label="${title}"><h3 tabindex="-1">${title}</h3>${items().filter(e=>e.group===active).map(entry=>`<div data-setting="${entry.name}">${entry.type==='font'?selectControl(entry):settingRow({name:entry.label,help:entry.help,helpId:entry.name+'-help',control:selectControl(entry)})}<p class="settings-error" id="${entry.name}-error" role="alert"></p></div>`).join('')}${extras(active)}</section></div>`;
    view=beginViewSession(root.querySelector('.settings-content'));const mounted=view;
    root.dataset.settingsDetail=String(detail);dialog.querySelector('#dialog-title').textContent=t('设置');
    for(const el of root.querySelectorAll('input,select'))if(drafts.has(el.name)&&el.type!=='radio'&&el.type!=='checkbox'&&el.type!=='password')el.value=drafts.get(el.name);
    for(const entry of items().filter(e=>e.group===active)){
      const row=root.querySelector(`[data-setting="${entry.name}"]`);
      if(entry.type==='number')row.querySelector('input').required=true;
      row.addEventListener('change',async event=>{
        const input=event.target;if(input.name!==entry.name)return;
        const error=row.querySelector('.settings-error');
        if(entry.type==='number'&&!input.checkValidity()){
          input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);error.textContent=say(`请输入 ${entry.min} 至 ${entry.max} 之间的整数。`,`Enter a whole number from ${entry.min} to ${entry.max}.`);return;
        }
        const value=entry.type==='switch'?input.checked:entry.type==='number'?input.valueAsNumber:input.value;
        try{
          await entry.set(value);if(!mounted.alive()){if(owner.alive()&&entry.name==='language'){remember();render();}return;}
          input.removeAttribute('aria-invalid');error.textContent='';drafts.delete(entry.name);
          if(entry.name==='language'||entry.name==='theme'){remember();render();root.querySelector(`[name="${entry.name}"][value="${value}"]`)?.focus({preventScroll:true});}else updateNavigation();
        }catch(cause){if(mounted.alive())error.textContent=t(cause.message);}
      },{signal:mounted.signal});
    }
    for(const input of root.querySelectorAll('input[type=number]'))if(!input.checkValidity())input.dispatchEvent(new Event('change',{bubbles:true}));
    const font=root.querySelector('[data-font-settings]');
    if(font){mountFontSettings(font,settings.fontFamily,{native:host.native,transport:host.transport,window},mounted.alive);font.querySelectorAll('button').forEach(b=>b.className='ui-button ui-button--secondary');}
    mounted.onDispose(bindSteppers(root));
    root.querySelectorAll('[data-settings-group]').forEach(b=>b.onclick=()=>{
      listScroll=root.querySelector('.settings-navigation').scrollTop;remember();active=b.dataset.settingsGroup;lastCategory=active;detail=true;render();root.querySelector('h3')?.focus({preventScroll:true});
    });
    updateNavigation();host.bindActions(root);
    root.querySelector('#show-privacy')?.addEventListener('click',()=>host.openModal(t('隐私政策'),privacyMarkup(),null,{noSubmit:true}),{signal:mounted.signal});
    const create=root.querySelector('#create-vela');if(create)create.disabled=!host.canCreateVela();
    root.querySelector('.settings-content').scrollTop=scrolls.get(active)||0;
    if(active==='ai')mountAiSettings(root.querySelector('#ai-settings'),{workspace:host.workspace,toast:host.toast,changed:()=>{host.aiChanged();updateNavigation();},session:mounted,draft:drafts}).catch(cause=>{if(mounted.alive())root.querySelector('#ai-settings').textContent=t(cause.message);});
  }
  function updateNavigation(){for(const b of root.querySelectorAll('[data-settings-group]')){b.querySelector('small').textContent=summary(b.dataset.settingsGroup);if((!small()||detail)&&b.dataset.settingsGroup===active)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');}}
  const back=()=>{
    if(small()&&detail){remember();detail=false;root.dataset.settingsDetail='false';updateNavigation();const nav=root.querySelector('.settings-navigation');nav.scrollTop=listScroll;nav.querySelector(`[data-settings-group="${lastCategory}"]`)?.focus({preventScroll:true});return true;}return false;
  };
  window.addEventListener('resize',updateNavigation,{signal:owner.signal});
  root.settingsController={back,resume:()=>{remember();render();}};
  owner.onDispose(()=>{drafts.clear();view?.dispose();delete root.settingsController;backButton.remove();});
  const backButton=document.createElement('button');backButton.type='button';backButton.className='ui-icon-button settings-back';backButton.setAttribute('aria-label',t('返回'));backButton.textContent='‹';backButton.onclick=()=>back()||host.close();dialog.querySelector('.dialog-heading').prepend(backButton);
  render();
}
