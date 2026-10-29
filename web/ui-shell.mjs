import {reducedMotion} from './motion.mjs';
import {menuKey} from './menu-controller.mjs';
import {t} from './i18n.mjs';
import {EditorChrome} from './app-core/editor-chrome.mjs';
import {ChromeMotion,MenuMotion} from './app-core/chrome-motion.mjs';

export function platformProfile(environment,search='') {
  const platform=environment?.platform;
  if (['android','windows','harmonyos'].includes(platform))
    return platform;
  if (environment && platform!=='browser')
    return 'harmonyos';
  const preview=new URLSearchParams(search).get('ui');
  return ['android','windows','harmonyos'].includes(preview)?preview:'windows';
}

export class UIShell {
  constructor(environment) {
    this.editorChrome=new EditorChrome();
    this.chromeMotion=new ChromeMotion(reducedMotion);
    this.toolbar=document.querySelector('.toolbar');
    this.menu=document.createElement('div');
    this.menu.id='toolbar-overflow';
    this.menu.hidden=true;
    this.menu.setAttribute('role','menu');
    this.menu.setAttribute('aria-label',t('更多操作'));
    this.groups={};
    for(const [id,title] of [['document','文稿操作'],['layout','外观与布局'],['extensions','扩展功能'],['app','应用']]){
      const group=document.createElement('div');
      group.className='toolbar-menu-group';
      group.dataset.menuGroup=id;
      group.setAttribute('role','group');
      group.setAttribute('aria-label',t(title));
      const heading=document.createElement('div');
      heading.className='toolbar-menu-heading';
      heading.setAttribute('role','presentation');
      heading.textContent=t(title);
      group.append(heading);
      this.groups[id]=group;
      this.menu.append(group);
    }
    document.body.append(this.menu);
    this.menuMotion=new MenuMotion(this.menu,reducedMotion);
    const global=document.createElement('div');
    global.className='global-tools';
    this.globalTools=global;
    global.append(document.querySelector('#outline-toggle'));
    this.toggle=document.createElement('button');
    this.toggle.id='more-tools';
    this.toggle.title=t('更多操作');
    this.toggle.setAttribute('aria-label',t('更多操作'));
    this.toggle.setAttribute('aria-expanded','false');
    this.toggle.setAttribute('aria-controls',this.menu.id);
    this.toggle.setAttribute('aria-haspopup','menu');
    this.toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
    global.append(this.toggle);
    document.querySelector('.topbar').append(global);
    this.secondary=['home-button','focus-toggle','theme','commands','add-glossary','plugins','check-update','export-doc','settings'].map(id=>document.getElementById(id));
    this.contextual=['search-editor'].map(id=>document.getElementById(id));
    this.allTools=[...this.contextual,...this.secondary];
    for(const button of this.allTools){
      const label=document.createElement('span');
      label.className='menu-label';
      label.textContent=t(button.getAttribute('aria-label'));
      button.append(label);
    }
    for(const [id,key] of [['search-editor','Ctrl F'],['commands','Ctrl Shift K']]){
      const hint=document.createElement('kbd');
      hint.className='menu-shortcut';
      hint.textContent=key;
      hint.setAttribute('aria-hidden','true');
      document.getElementById(id).append(hint);
    }
    this.toggle.onclick=()=>this.menuOpen?this.close(true):this.open();
    this.menu.addEventListener('click',event=>{
      if(event.target.closest('button'))
        this.close();
    });
    document.addEventListener('pointerdown',event=>{
      if(!this.menu.contains(event.target)&&!this.toggle.contains(event.target))
        this.close();
    });
    document.addEventListener('keydown',event=>{
      if(!this.menuOpen)
        return;
      if(menuKey(event,this.menuItems(),{close:()=>this.close(),returnFocus:this.toggle})&&event.key==='Escape')
        event.stopImmediatePropagation();
    },true);
    window.addEventListener('resize',()=>this.layout());
    this.environment(environment);
  }
  environment(value){
    this.value=value;
    document.body.dataset.ui=platformProfile(value,location.search);
    this.layout();
  }
  get menuOpen(){
    return this.toggle.getAttribute('aria-expanded')==='true';
  }
  editorContext(page,home){
    if(this.editorChrome.context(page,home))
      this.layout({animate:innerWidth<900});
  }
  toggleEditorChrome(){
    if(innerWidth<900&&this.editorChrome.toggle())
      this.layout({animate:true});
  }
  // Plugin top-toolbar buttons: the first two stay visible on wide screens, the rest use the existing overflow menu.
  setPluginActions(buttons){
    if(this.pluginActions?.length===buttons.length&&buttons.every((button,i)=>button===this.pluginActions[i]))
      return;
    this.pluginActions=buttons;
    this.layout();
  }
  layout({animate=false}={}){
    const before=animate
      ?this.chromeMotion.capture([...document.querySelectorAll('.page-navigation [data-view],.global-tools>button,#search-editor,#add-glossary,#export-doc')])
      :null;
    this.chromeMotion.cancel();
    const focused=this.menu.contains(document.activeElement)||(this.pluginActions||[]).includes(document.activeElement)?document.activeElement:null;
    const groupFor=id=>['search-editor','add-glossary','export-doc'].includes(id)
      ?this.groups.document
      :['focus-toggle','theme'].includes(id)?this.groups.layout:id==='plugins'?this.groups.extensions:this.groups.app;
    const wide=innerWidth>=900,compact=!wide&&this.editorChrome.compact;
    const pinnedActions=this.editorChrome.active&&(wide||compact);
    document.body.dataset.editorChrome=wide&&this.editorChrome.active?'wide':compact?'compact':'expanded';
    for(const button of this.allTools){
      const pinned=pinnedActions&&['search-editor','add-glossary','export-doc'].includes(button.id);
      if(pinned){
        this.globalTools.insertBefore(button,document.getElementById('outline-toggle'));
        button.removeAttribute('role');
      }
      else{
        groupFor(button.id).append(button);
        button.setAttribute('role','menuitem');
      }
    }
    this.groups.document.hidden=pinnedActions||document.body.classList.contains('start-open')||document.body.dataset.page!=='write';
    for(const button of document.querySelectorAll('.page-navigation [data-view]')){
      if(button.dataset.view==='write'){
        button.classList.toggle('editor-emphasis',compact);
        if(wide){
          button.removeAttribute('aria-expanded');
          button.removeAttribute('aria-controls');
        }
        else{
          button.setAttribute('aria-expanded',String(!compact));
          button.setAttribute('aria-controls','nav-github nav-subscriptions nav-reader');
        }
      }
      else{
        button.id='nav-'+button.dataset.view;
        button.hidden=compact;
      }
    }
    for(const [index,button] of (this.pluginActions||[]).entries()){
      const overflow=innerWidth<=900||index>=2||document.body.classList.contains('start-open'),target=overflow?this.groups.extensions:this.toolbar;
      target.append(button);
      if(overflow)
        button.setAttribute('role','menuitem');
      else
        button.removeAttribute('role');
    }
    const sync=document.querySelector('#sync-state');
    if(sync)
      this.toolbar.prepend(sync);
    this.toggle.hidden=false;
    this.readingInsets();
    if(focused?.isConnected&&!focused.disabled&&!focused.closest('[hidden]'))
      focused.focus({preventScroll:true});
    document.querySelector('#app').style.setProperty('--shell-top',document.querySelector('.topbar').offsetHeight+'px');
    this.chromeMotion.play(before);
  }
  readingInsets(){
    const style=document.documentElement.style,left=Number(this.value?.left)||0,right=Number(this.value?.right)||0,width=innerWidth-left-right;
    const cutout=this.value?.cutouts?.find(rect=>rect.top<80&&rect.right>left&&rect.left<innerWidth-right);
    let gap=innerWidth<=600?48:0,start=(width-gap)/2,padding=0;
    if(cutout){
      start=Math.max(0,cutout.left-left-12);
      gap=cutout.right-cutout.left+24;
      if(start<90||width-start-gap<132){
        padding=Math.max(0,cutout.bottom)+4;
        gap=0;
        start=width/2;
      }
    }
    style.setProperty('--reader-left-width',start+'px');
    style.setProperty('--reader-notch-width',gap+'px');
    style.setProperty('--reader-header-padding',padding+'px');
    style.setProperty('--reader-header-height',Math.max(44,Number(this.value?.top)||0,padding+44,cutout?cutout.bottom+4:0)+'px');
  }
  menuItems(){
    return [...this.menu.querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden&&!button.closest('[hidden]')&&button.getClientRects().length);
  }
  open(){
    this.groups.document.hidden=(this.editorChrome.active&&(innerWidth>=900||this.editorChrome.compact))||document.body.classList.contains('start-open')||document.body.dataset.page!=='write';
    this.menuMotion.setVisible(true);
    this.toggle.setAttribute('aria-expanded','true');
    this.menuItems()[0]?.focus();
  }
  close(focus=false){
    this.toggle.setAttribute('aria-expanded','false');
    this.menuMotion.setVisible(false);
    if(focus)
      this.toggle.focus();
  }
}

// Keep every control in one form, so category navigation never discards unsaved settings.

export function organizeSettings(root) {
  document.querySelector('#dialog').classList.add('settings-dialog');
  const groups=[
    ['外观与语言',['language','theme','fontFamily','palette']],
    ['编辑',['fontSize','autoNouns','glossaryPanel','highlightTerms','novelLineNumbers','richText','countMode','includeHeading']],
    ['阅读',['readingMode','globalVelaOverride','edit-global-vela']],
    ['AI 助手',['ai-settings']],
    ['工作区配置',['create-vela','cleanup-redundant']],
    ['备份与应用',['backup-all','show-licenses','check-updates','updateChecks']]
  ];
  const original=[...root.children],nav=document.createElement('nav');
  nav.className='settings-navigation';
  nav.setAttribute('aria-label',t('设置分类'));
  const content=document.createElement('div');
  content.className='settings-content';
  const activate=index=>{
    [...nav.children].forEach((button,i)=>{
      if(i===index)
        button.setAttribute('aria-current','location');
      else
        button.removeAttribute('aria-current');
    });
  };
  groups.forEach(([title,names],index)=>{
    const section=document.createElement('section');
    section.className='settings-section';
    section.id='settings-section-'+index;
    const heading=document.createElement('h3');
    heading.id=section.id+'-heading';
    heading.textContent=t(title);
    section.setAttribute('aria-labelledby',heading.id);
    section.append(heading);
    const link=document.createElement('button');
    link.type='button';
    link.textContent=t(title);
    link.setAttribute('aria-controls',section.id);
    link.onclick=()=>{
      activate(index);
      content.scrollTo({top:content.scrollTop+section.getBoundingClientRect().top-content.getBoundingClientRect().top,behavior:reducedMotion()?'instant':'smooth'});
    };
    nav.append(link);
    for(const name of names){
      const control=root.querySelector(`[name="${name}"],#${name}`);
      if(!control)
        continue;
      const container=control.closest('fieldset')||control.closest('label');
      section.append(container||control);
    }
    content.append(section);
  });
  for(const item of original)
    if(item.isConnected&&item.parentElement===root&&item.textContent.trim())
      content.lastElementChild.append(item);
  root.replaceChildren(nav,content);
  activate(0);
  let frame=0;
  content.addEventListener('scroll',()=>{
    if(frame)
      return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      const top=content.getBoundingClientRect().top;
      let current=0;
      [...content.children].forEach((section,index)=>{
        if(section.getBoundingClientRect().top<=top+24)
          current=index;
      });
      if(content.scrollTop>0&&content.scrollTop+content.clientHeight>=content.scrollHeight-2)
        current=content.children.length-1;
      activate(current);
    });
  },{passive:true});
}
