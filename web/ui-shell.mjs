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
    this.secondary=['home-button','commands','add-glossary','plugins','export-doc'].map(id=>document.getElementById(id));
    for(const button of this.secondary){const label=document.createElement('span');label.className='menu-label';label.textContent=button.getAttribute('aria-label');button.append(label);}
    for(const button of document.querySelectorAll('.page-navigation button')) {
      const label=document.createElement('span');label.className='nav-label';label.textContent=button.dataset.view==='github'?'GitHub':button.title;button.append(label);
    }
    this.toggle.onclick=()=>this.menu.hidden?this.open():this.close(true);
    this.menu.addEventListener('click',event=>{if(event.target.closest('button'))this.close();});
    document.addEventListener('pointerdown',event=>{if(!this.menu.contains(event.target)&&!this.toggle.contains(event.target))this.close();});
    document.addEventListener('keydown',event=>{
      if(this.menu.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close(true);return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const items=this.secondary.filter(button=>!button.disabled),index=items.indexOf(document.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[next]?.focus();
      }
    },true);
    window.addEventListener('resize',()=>this.layout());
    this.environment(environment);
  }
  environment(value){document.body.dataset.ui=platformProfile(value,location.search);this.layout();}
  layout(){
    this.close();const compact=innerWidth<=900;
    for(const button of this.secondary){(compact?this.menu:this.toolbar).append(button);if(compact)button.setAttribute('role','menuitem');else button.removeAttribute('role');}
    this.toggle.hidden=!compact;
    document.querySelector('#app').style.setProperty('--shell-top',document.querySelector('.topbar').offsetHeight+'px');
  }
  open(){this.menu.hidden=false;this.toggle.setAttribute('aria-expanded','true');this.secondary[0]?.focus();}
  close(focus=false){this.menu.hidden=true;this.toggle.setAttribute('aria-expanded','false');if(focus)this.toggle.focus();}
}

// Keep every control in one form, so category navigation never discards unsaved settings.
export function organizeSettings(root) {
  document.querySelector('#dialog').classList.add('settings-dialog');
  const groups=[['外观与语言',['language','theme','palette']],['编辑',['fontSize','countMode','includeHeading']],['阅读',['readingMode','globalVelaOverride','edit-global-vela']],['工作区配置',['create-vela']],['GitHub',['clientId']],['备份与应用',['backup-all','show-licenses','check-updates','updateChecks']]];
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
