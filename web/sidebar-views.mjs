import {icon,iconNames} from './icons.mjs';
import {t} from './i18n.mjs';
const invalid=message=>Object.assign(Error(message),{code:'E_INVALID_DATA'});
export class SidebarViews {
  constructor({context,open,onLayout=()=>{},onError=()=>{}}){
    this.context=context;
    this.open=open;
    this.onLayout=onLayout;
    this.onError=onError;
    this.views=new Map();
    this.selected={left:'builtin',right:'builtin'};
    this.preferred={};
    try{
      const saved=JSON.parse(localStorage.getItem('vela.sidebar-views')||'{}');
      if(saved&&typeof saved==='object'&&!Array.isArray(saved))this.preferred=saved;
    }catch{}
    this.regions={};
    for(const [side,id] of [['left','library'],['right','outline']]){
      const builtin=document.getElementById(id),shell=document.getElementById(id+'-shell'),parent=side==='left'?shell.querySelector('.library-panel'):shell;
      const bar=document.createElement('header');
      bar.className='sidebar-view-bar';
      bar.setAttribute('aria-label',t(side==='left'?'左栏视图':'右栏视图'));
      const glyph=document.createElement('span');
      glyph.className='sidebar-view-icon';
      glyph.setAttribute('aria-hidden','true');
      const title=document.createElement('h2');
      title.className='sidebar-view-title';
      title.textContent=t(side==='left'?'文件':'章节目录');
      const select=document.createElement('select');
      select.setAttribute('aria-label',t(side==='left'?'左栏视图':'右栏视图'));
      select.onchange=()=>this.select(side,select.value);
      bar.addEventListener('keydown',e=>{
        if(e.key==='Escape'){
          e.stopPropagation();
          this.close(side);
        }
      });
      const actions=document.createElement('span');
      actions.className='sidebar-builtin-actions';
      if(side==='left')actions.append(document.getElementById('new-doc'));

      else actions.append(document.getElementById('chapter-count'));
      const close=side==='right'?document.getElementById('close-outline'):document.createElement('button');
      close.type='button';
      close.innerHTML=icon('close');
      close.setAttribute('aria-label',t('收起侧栏'));
      close.onclick=()=>this.close(side);
      bar.append(glyph,title,select,actions,close);
      parent.append(bar);
      parent.classList.add('has-sidebar-views');
      this.regions[side]={builtin,shell,parent,bar,select,glyph,title,actions};
      shell.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&!e.defaultPrevented){
          e.stopPropagation();
          this.close(side);
        }
      });
    }
    document.getElementById('app').addEventListener('sidebar-layout-settled',()=>this.refresh());
    document.addEventListener('pointerdown',event=>{
      if(innerWidth>600||event.target.closest('dialog,#toolbar-overflow,.topbar,.app-choice-menu'))return;
      for(const [side,region] of Object.entries(this.regions))if(document.body.classList.contains(side==='left'?'show-library':'show-outline')&&!region.shell.contains(event.target))this.open(side,false);
    });
  }
  close(side){
    this.open(side,false);
    document.getElementById(side==='left'?'mobile-library':'outline-toggle')?.focus({preventScroll:true});
  }
  available(view){
    const c=this.context();
    return c.page==='write'&&!!c.file&&(!view.documentKinds||view.documentKinds.includes(c.kind))&&(!view.modes||view.modes.includes(c.mode));
  }
  call(fn,...args){
    try{
      const result=fn?.(...args);
      if(result&&typeof result.catch==='function')result.catch(this.onError);
    }catch(error){
      this.onError(error);
    }
  }
  register(owner,spec){
    if(!spec||!['left','right'].includes(spec.side)||!/^[\w.-]{1,120}$/.test(spec.id)||typeof spec.title!=='string'||!spec.title.trim()||spec.title.length>80||typeof spec.mount!=='function'||['onShow','onHide','onContextChange'].some(key=>spec[key]!==undefined&&typeof spec[key]!=='function')||spec.icon&&!iconNames.includes(spec.icon)||spec.documentKinds&&(!Array.isArray(spec.documentKinds)||spec.documentKinds.some(k=>typeof k!=='string'))||spec.modes&&(!Array.isArray(spec.modes)||spec.modes.some(k=>!['source','preview'].includes(k))))throw invalid(t('侧栏视图声明无效。'));
    const key=owner+'/'+spec.id;
    if(this.views.has(key))throw invalid(t('侧栏视图 ID 重复。'));
    const view={...spec,documentKinds:spec.documentKinds?.slice(),modes:spec.modes?.slice(),key,owner,mounted:false,visible:false};
    this.views.set(key,view);
    this.refresh();
    return Object.freeze({show:()=>{
      if(!this.views.has(key))throw invalid(t('侧栏视图已移除。'));
      if(!this.available(view))throw Object.assign(Error(t('当前文件不适用此视图。')),{code:'E_UNSUPPORTED'});
      this.select(view.side,key);
      this.open(view.side,true);
      this.refresh();
      this.regions[view.side].select.focus({preventScroll:true});
    },hide:()=>{
      if(this.selected[view.side]===key){
        this.open(view.side,false);
        this.refresh();
      }
    },update:patch=>{
      if(patch.title!==undefined){
        if(typeof patch.title!=='string'||!patch.title.trim()||patch.title.length>80)throw invalid(t('侧栏标题无效。'));
        view.title=patch.title;
      }
      this.refresh();
    },dispose:()=>this.remove(key)});
  }
  select(side,key,remember=true){
    const view=this.views.get(key);
    if(key!=='builtin'&&(!view||view.side!==side||!this.available(view)))return;
    this.selected[side]=key;
    if(remember){
      this.preferred[side]=key;
      try{
        localStorage.setItem('vela.sidebar-views',JSON.stringify(this.preferred));
      }catch{}
    }
    this.refresh();
  }
  refresh(){
    const context=this.context();
    let needsLayout=false;
    for(const [side,region] of Object.entries(this.regions)){
      const eligible=[...this.views.values()].filter(view=>view.side===side&&this.available(view)),preferred=this.preferred[side];
      let key=this.selected[side];
      if(key!=='builtin'&&!eligible.some(v=>v.key===key))key='builtin';
      if(preferred&&eligible.some(v=>v.key===preferred))key=preferred;
      this.selected[side]=key;
      const signature=JSON.stringify(eligible.map(v=>[v.key,v.title]));
      if(region.signature!==signature){
        region.signature=signature;
        region.select.replaceChildren();
        for(const [id,title] of [['builtin',t(side==='left'?'文件':'章节目录')],...eligible.map(v=>[v.key,v.title])])region.select.add(new Option(title,id));
      }
      region.select.value=key;
      region.select.hidden=!eligible.length;
      region.title.hidden=!!eligible.length;
      region.actions.hidden=key!=='builtin';
      const glyph=this.views.get(key)?.icon||(side==='left'?'files':'outline');
      if(region.glyphName!==glyph){
        region.glyphName=glyph;
        region.glyph.innerHTML=icon(glyph);
      }
      region.builtin.hidden=key!=='builtin';
      const custom=String(key!=='builtin'),layoutChanged=region.shell.dataset.sidebarCustom!==custom;
      region.shell.dataset.sidebarCustom=custom;
      if(layoutChanged)needsLayout=true;
      const open=document.body.classList.contains(side==='left'?'show-library':'show-outline');
      for(const view of [...this.views.values()].filter(v=>v.side===side)){
        const visible=key===view.key&&open&&this.available(view)&&!document.hidden&&(side!=='right'||!document.body.classList.contains('focus'));
        if(visible&&!view.mounted){
          const body=document.createElement('section');
          body.className='sidebar-view-body';
          body.dataset.sidebarView=view.key;
          body.setAttribute('aria-label',view.title);
          region.parent.append(body);
          view.body=body;
          view.controller=new AbortController();
          view.mounted=true;
          body.addEventListener('keydown',e=>{
            if(e.key==='Escape'&&!e.defaultPrevented){
              e.stopPropagation();
              this.close(side);
            }
          });
          try{
            view.cleanup=view.mount({body,context:structuredClone(context),signal:view.controller.signal});
            if(view.cleanup&&typeof view.cleanup!=='function')throw invalid(t('mount 应同步返回清理函数。'));
          }catch(error){
            this.onError(error);
            this.remove(view.key);
            break;
          }
        }
        if(view.body){
          view.body.hidden=!visible&&!(key===view.key&&region.shell.dataset.drawerClosing==='true');
          view.body.setAttribute('aria-label',view.title);
        }
        if(visible!==view.visible){
          view.visible=visible;
          this.call(visible?view.onShow:view.onHide,structuredClone(context));
        }
        if(visible)this.call(view.onContextChange,structuredClone(context));
      }
    }
    if(needsLayout)this.onLayout();
  }
  remove(key){
    const view=this.views.get(key);
    if(!view)return;
    this.views.delete(key);
    view.controller?.abort();
    if(view.visible)this.call(view.onHide,this.context());
    this.call(view.cleanup);
    view.body?.remove();
    if(this.selected[view.side]===key)this.selected[view.side]='builtin';
    this.refresh();
  }
  dispose(owner){
    for(const view of [...this.views.values()])if(view.owner===owner)this.remove(view.key);
  }
}
