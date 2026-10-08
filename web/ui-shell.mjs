import {t} from './i18n.mjs';

export function platformProfile(environment,search='') {
  const platform=environment?.platform;
  if (['android','windows','harmonyos'].includes(platform)) return platform;
  if (environment && platform!=='browser') return 'harmonyos';
  const preview=new URLSearchParams(search).get('ui');
  return ['android','windows','harmonyos'].includes(preview)?preview:'windows';
}

export class UIShell {
  constructor(environment) {
    this.toolbar=document.querySelector('.toolbar');
    this.menu=document.createElement('div');
    this.menu.id='toolbar-overflow';this.menu.hidden=true;
    this.menu.setAttribute('role','menu');this.menu.setAttribute('aria-label','更多操作');
    document.body.append(this.menu);
    const global=document.createElement('div');global.className='global-tools';
    global.append(document.querySelector('#settings'));
    this.toggle=document.createElement('button');this.toggle.id='more-tools';
    this.toggle.title='更多操作';this.toggle.setAttribute('aria-label','更多操作');
    this.toggle.setAttribute('aria-expanded','false');this.toggle.setAttribute('aria-controls',this.menu.id);
    this.toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
    global.append(this.toggle);document.querySelector('.topbar').append(global);
    this.secondary=['home-button','focus-toggle','theme','commands','add-glossary','plugins','export-doc'].map(id=>document.getElementById(id));
    this.contextual=['search-editor','outline-toggle'].map(id=>document.getElementById(id));
    this.allTools=[...this.contextual,...this.secondary];
    for(const button of this.allTools){const label=document.createElement('span');label.className='menu-label';label.textContent=button.getAttribute('aria-label');button.append(label);}
    this.toggle.onclick=()=>this.menu.hidden?this.open():this.close(true);
    this.menu.addEventListener('click',event=>{if(event.target.closest('button'))this.close();});
    document.addEventListener('pointerdown',event=>{if(!this.menu.contains(event.target)&&!this.toggle.contains(event.target))this.close();});
    document.addEventListener('keydown',event=>{
      if(this.menu.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close(true);return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const items=[...this.menu.querySelectorAll('button')].filter(button=>!button.disabled),index=items.indexOf(document.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[next]?.focus();
      }
    },true);
    window.addEventListener('resize',()=>this.layout());
    this.environment(environment);
  }
  environment(value){this.value=value;document.body.dataset.ui=platformProfile(value,location.search);this.layout();}
  layout(){
    const focused=this.menu.contains(document.activeElement)?document.activeElement:null;
    for(const button of this.secondary){this.menu.append(button);button.setAttribute('role','menuitem');}
    for(const button of this.contextual){(innerWidth<=600?this.menu:this.toolbar).append(button);if(innerWidth<=600)button.setAttribute('role','menuitem');else button.removeAttribute('role');}
    this.toggle.hidden=false;
    this.readingInsets();
    if(!this.menu.hidden&&focused&&this.menu.contains(focused))focused.focus();
    document.querySelector('#app').style.setProperty('--shell-top',document.querySelector('.topbar').offsetHeight+'px');
  }
  readingInsets(){
    const style=document.documentElement.style,left=Number(this.value?.left)||0,right=Number(this.value?.right)||0,width=innerWidth-left-right;
    const cutout=this.value?.cutouts?.find(rect=>rect.top<80&&rect.right>left&&rect.left<innerWidth-right);
    let gap=innerWidth<=600?48:0,start=(width-gap)/2,padding=0;
    if(cutout){
      start=Math.max(0,cutout.left-left-12);gap=cutout.right-cutout.left+24;
      if(start<90||width-start-gap<132){padding=Math.max(0,cutout.bottom)+4;gap=0;start=width/2;}
    }
    style.setProperty('--reader-left-width',start+'px');style.setProperty('--reader-notch-width',gap+'px');
    style.setProperty('--reader-header-padding',padding+'px');
    style.setProperty('--reader-header-height',Math.max(44,Number(this.value?.top)||0,padding+44,cutout?cutout.bottom+4:0)+'px');
  }
  open(){this.menu.hidden=false;this.toggle.setAttribute('aria-expanded','true');this.menu.querySelector('button:not(:disabled)')?.focus();}
  close(focus=false){this.menu.hidden=true;this.toggle.setAttribute('aria-expanded','false');if(focus)this.toggle.focus();}
}

// Keep every control in one form, so category navigation never discards unsaved settings.
export function organizeSettings(root) {
  document.querySelector('#dialog').classList.add('settings-dialog');
  const groups=[['外观与语言',['language','theme','palette']],['编辑',['fontSize','autoNouns','glossaryPanel','highlightTerms','countMode','includeHeading']],['阅读',['readingMode','globalVelaOverride','edit-global-vela']],['工作区配置',['create-vela']],['GitHub',['clientId']],['备份与应用',['backup-all','show-licenses','check-updates','updateChecks']]];
  const original=[...root.children],nav=document.createElement('nav');nav.className='settings-navigation';nav.setAttribute('aria-label',t('设置分类'));
  const content=document.createElement('div');content.className='settings-content';
  groups.forEach(([title,names],index)=>{
    const section=document.createElement('section');section.className='settings-section';section.id='settings-section-'+index;
    const heading=document.createElement('h3');heading.textContent=t(title);section.append(heading);
    const link=document.createElement('button');link.type='button';link.textContent=t(title);link.onclick=()=>section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});nav.append(link);
    for(const name of names){const control=root.querySelector(`[name="${name}"],#${name}`);if(!control)continue;const container=control.closest('fieldset')||control.closest('label');section.append(container||control);}
    content.append(section);
  });
  for(const item of original)if(item.isConnected&&item.parentElement===root&&item.textContent.trim())content.lastElementChild.append(item);
  root.replaceChildren(nav,content);
}
