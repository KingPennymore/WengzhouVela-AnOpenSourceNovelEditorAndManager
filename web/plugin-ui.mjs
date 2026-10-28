import {t,say} from './i18n.mjs';
import {icon,iconNames} from './icons.mjs';

/** Locations where plugins may add buttons. Each maps to an existing Vela region; no new app chrome is created. */
export const BUTTON_LOCATIONS=Object.freeze(['top-toolbar','document-toolbar','bottom-toolbar','library-sidebar','outline-sidebar','selection-menu','planning-toolbar','planning-bottom','planning-sidebar']);
export const PANEL_LOCATIONS=Object.freeze(['library-sidebar','outline-sidebar','planning-sidebar']);

const fail=(message,code='E_INVALID_DATA')=>Object.assign(Error(message),{code});
const text=(value,max,label)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max) throw fail(say(`${t(label)}无效。`,`${t(label)} is invalid.`));
  return value.trim();
};

/** Validate a plugin button declaration; returns a normalised copy. */
export function normaliseButton(spec){
  if(!spec||typeof spec!=='object') throw fail(t('按钮声明无效。'));
  const id=text(spec.id,120,t('按钮 ID'));
  if(!/^[\w.-]+$/.test(id)) throw fail(t('按钮 ID 只能包含字母、数字、点、下划线和连字符。'));
  const locations=[...new Set(Array.isArray(spec.locations)?spec.locations:[spec.location])];
  if(!locations.length||locations.some(location=>!BUTTON_LOCATIONS.includes(location))) throw fail(say(`按钮位置无效，可用位置：${BUTTON_LOCATIONS.join('、')}。`,`Invalid button location. Available locations: ${BUTTON_LOCATIONS.join(', ')}.`));
  if(spec.icon!==undefined&&!iconNames.includes(spec.icon)) throw fail(t('按钮图标必须是文舟内置图标名称。'));
  if(spec.order!==undefined&&(!Number.isInteger(spec.order)||Math.abs(spec.order)>1000)) throw fail(t('按钮顺序必须是 -1000 到 1000 的整数。'));
  if(typeof spec.run!=='function') throw fail(t('按钮需要 run 函数。'));
  return {id,title:text(spec.title,80,t('按钮标题')),locations,icon:spec.icon||'plugins',order:spec.order||0,toggle:spec.toggle===true,checked:spec.checked===true,disabled:spec.disabled===true,hidden:spec.hidden===true,tooltip:typeof spec.tooltip==='string'?spec.tooltip.slice(0,200):'',run:spec.run};
}

/**
 * Renders plugin buttons and sidebar panels into existing regions, and applies
 * plugin overrides (hidden/order) to built-in controls. Overrides are undone when
 * the owning plugin stops, so the default interface always comes back.
 */
export class PluginUiHost {
  constructor({roots,shell,selectionItems,builtins,onError=()=>{}}){
    Object.assign(this,{roots,shell,builtins,onError});
    this.buttons=new Map();
    this.elements=new Map();
    this.panels=new Map();
    this.overrides=new Map();
    this.planningSlots={};
    for(const location of ['planning-toolbar','planning-bottom','planning-sidebar','planning-sidebar-panels']){
      const slot=document.createElement('div');
      slot.dataset.planningSlot=location;
      slot.className=location.endsWith('-panels')?'plugin-panels planning-plugin-panels':'plugin-action-strip';
      this.planningSlots[location]=slot;
      this.roots[location]=slot;
    }
    selectionItems?.(context=>this.selectionItems(context));
  }
  get locations(){
    return BUTTON_LOCATIONS;
  }
  get panelLocations(){
    return PANEL_LOCATIONS;
  }
  /** Built-in controls a plugin may hide or reorder, grouped by location. */
  controls(){
    return {...this.builtins(),...this.planningControls};
  }
  builtinList(location){
    return Object.entries(this.controls()).filter(([,item])=>!location||item.location===location).map(([id,item])=>({id,title:item.title,location:item.location}));
  }
  mountPlanning(root,kind){
    if(!root&&this.activePlanningRoot){
      this.activePlanningRoot.planningSummary=null;
      this.activePlanningRoot.planningToggleDetails=null;
    }
    this.activePlanningRoot=root;
    this.planningControls={};
    this.planningKind=kind;
    for(const location of ['planning-toolbar','planning-bottom','planning-sidebar']){
      const selector={'planning-toolbar':'.planning-primary','planning-bottom':'.planning-surface','planning-sidebar':'.outline-body,.map-stage'}[location],parent=root?.querySelector(selector);
      for(const suffix of ['',...(location==='planning-sidebar'?['-panels']:[])]){
        const key=location+suffix,slot=this.planningSlots[key];
        if(parent) parent.append(slot); else slot.remove();
        this.roots[key]=slot;
      }
    }
    if(root) for(const element of root.querySelectorAll('.planning-toolbar button:not([data-plugin-button]),.planning-bottom-actions button:not([data-plugin-button]),.planning-details-button')){
      const attr=[...element.attributes].find(a=>a.name.startsWith('data-')),name=attr?attr.name.slice(5)+(attr.value?'-'+attr.value:''):'details',id=kind.toLowerCase()+'-'+name;
      this.planningControls[id]={location:element.matches('.planning-details-button')||element.closest('.planning-bottom-actions')?'planning-bottom':'planning-toolbar',title:element.getAttribute('aria-label')||element.title||element.textContent,element:()=>element};
    }
    for(const panel of this.panels.values()) if(panel.location==='planning-sidebar'&&this.roots['planning-sidebar-panels']){
      panel.root=this.roots['planning-sidebar-panels'];
      panel.root.append(panel.section);
    }
    this.render();
    this.applyOverrides();
  }
  addButton(owner,pluginName,spec){
    const button={...normaliseButton(spec),owner,pluginName,key:owner+'/'+spec.id};
    if(this.buttons.has(button.key)) throw fail(say(`按钮 ID 已被本插件使用：${button.id}`,`This plugin already uses button ID: ${button.id}`));
    this.buttons.set(button.key,button);
    this.render();
    return button.key;
  }
  updateButton(key,patch){
    const button=this.buttons.get(key);
    if(!button) throw fail(t('按钮已移除。'),'E_NOT_FOUND');
    const next=normaliseButton({...button,...patch,id:button.id,run:patch.run||button.run});
    Object.assign(button,next);
    this.render();
  }
  removeButton(key){
    if(this.buttons.delete(key)) this.render();
  }
  render(){
    const items=[...this.buttons.values()].map((button,index)=>({button,index})).sort((a,b)=>a.button.order-b.button.order||a.index-b.index),retained=new Set(),top=[],positions=new Map();
    for(const {button} of items) for(const location of button.locations){
      if(location==='selection-menu'||button.hidden) continue;
      const root=this.roots[location];
      if(location!=='top-toolbar'&&!root) continue;
      const key=location+':'+button.key;
      retained.add(key);
      let element=this.elements.get(key);
      if(!element){
        element=document.createElement('button');
        element.type='button';
        element.className='plugin-action';
        element.dataset.pluginButton=button.key;
        element.dataset.pluginLocation=location;
        const glyph=document.createElement('span');
        glyph.className='plugin-action-icon';
        const label=document.createElement('span');
        label.className='plugin-action-label menu-label';
        element.append(glyph,label);
        element.onclick=()=>this.run(button.key,{location,documentKind:this.planningKind});
        this.elements.set(key,element);
      }
      element.querySelector('.plugin-action-icon').innerHTML=icon(button.icon);
      element.querySelector('.plugin-action-label').textContent=button.title;
      element.disabled=button.disabled;
      element.title=(button.tooltip||button.title)+' · '+button.pluginName;
      element.setAttribute('aria-label',button.title+' · '+button.pluginName);
      if(button.toggle){
        element.setAttribute('aria-pressed',String(button.checked));
        element.classList.toggle('active-tool',button.checked);
      }else{
        element.removeAttribute('aria-pressed');
        element.classList.remove('active-tool');
      }
      if(location==='top-toolbar') top.push(element); else{
        const at=positions.get(location)||0;
        positions.set(location,at+1);
        if(element.parentElement!==root||root.children[at]!==element) root.insertBefore(element,root.children[at]||null);
      }
    }
    for(const [key,element] of this.elements) if(!retained.has(key)){
      element.remove();
      this.elements.delete(key);
    }
    for(const [location,root] of Object.entries(this.roots)) if(root&&location!=='top-toolbar') root.hidden=!root.childElementCount;
    this.roots['bottom-toolbar']?.parentElement?.classList.toggle('has-plugin-actions',!!this.roots['bottom-toolbar']?.childElementCount);
    this.shell?.setPluginActions(top);
    this.activePlanningRoot?.planningRefreshTools?.();
  }
  run(key,context){
    const button=this.buttons.get(key);
    if(!button||button.disabled) return;
    Promise.resolve().then(()=>button.run(context)).catch(this.onError);
  }
  selectionItems(selection){
    return [...this.buttons.values()].filter(button=>button.locations.includes('selection-menu')&&!button.hidden&&!button.disabled).sort((a,b)=>a.order-b.order).map(button=>({label:button.title,run:()=>button.run({location:'selection-menu',selection:{text:selection.text,from:selection.from,to:selection.to,editable:selection.editable}})}));
  }
  /** Sidebar panel: a titled, collapsible section whose body the plugin fills. */
  addPanel(owner,pluginName,spec){
    if(!spec||typeof spec!=='object') throw fail(t('面板声明无效。'));
    const id=text(spec.id,120,t('面板 ID')),title=text(spec.title,80,t('面板标题')),location=spec.location;
    if(!PANEL_LOCATIONS.includes(location)) throw fail(say(`面板位置只能是：${PANEL_LOCATIONS.join('、')}。`,`Panel location must be one of: ${PANEL_LOCATIONS.join(', ')}.`));
    const key=owner+'/'+id;
    if(this.panels.has(key)) throw fail(say(`面板 ID 已被本插件使用：${id}`,`This plugin already uses panel ID: ${id}`));
    const root=this.roots[location+'-panels'];
    if(!root) throw fail(t('当前界面没有此面板位置。'),'E_UNSUPPORTED');
    const section=document.createElement('section');
    section.className='plugin-panel';
    section.dataset.pluginPanel=key;
    const header=document.createElement('button');
    header.type='button';
    header.className='plugin-panel-header';
    header.setAttribute('aria-expanded','true');
    const label=document.createElement('span');
    label.textContent=title;
    header.append(label);
    const body=document.createElement('div');
    body.className='plugin-panel-body';
    body.setAttribute('aria-label',title+' · '+pluginName);
    section.append(header,body);
    header.onclick=()=>{
      const open=header.getAttribute('aria-expanded')!=='true';
      header.setAttribute('aria-expanded',String(open));
      body.hidden=!open;
    };
    root.append(section);
    root.hidden=false;
    this.panels.set(key,{section,body,label,root,owner,location});
    return {key,body};
  }
  updatePanel(key,{title,collapsed}={}){
    const panel=this.panels.get(key);
    if(!panel) throw fail(t('面板已移除。'),'E_NOT_FOUND');
    if(title!==undefined) panel.label.textContent=text(title,80,t('面板标题'));
    if(collapsed!==undefined){
      panel.section.querySelector('.plugin-panel-header').setAttribute('aria-expanded',String(!collapsed));
      panel.body.hidden=!!collapsed;
    }
  }
  removePanel(key){
    const panel=this.panels.get(key);
    if(!panel) return;
    panel.section.remove();
    this.panels.delete(key);
    panel.root.hidden=!panel.root.childElementCount;
  }
  /** Hide or reorder a built-in control; returns a function restoring the default. */
  overrideBuiltin(owner,id,{hidden,order}={}){
    const item=this.controls()[id];
    if(!item) throw fail(say(`没有此内置界面元素：${id}`,`No such built-in UI element: ${id}`),'E_NOT_FOUND');
    if(order!==undefined&&(!Number.isInteger(order)||Math.abs(order)>1000)) throw fail(t('顺序必须是 -1000 到 1000 的整数。'));
    const key=owner+'/'+id;
    this.overrides.set(key,{id,owner,hidden:hidden===true,order});
    this.applyOverrides();
    return ()=>{
      if(this.overrides.delete(key)) this.applyOverrides();
    };
  }
  applyOverrides(){
    const builtins=this.controls();
    for(const [id,item] of Object.entries(builtins)){
      const applied=[...this.overrides.values()].filter(override=>override.id===id),element=item.element();
      if(!element) continue;
      element.classList.toggle('plugin-hidden',applied.some(override=>override.hidden));
      const order=applied.findLast(override=>override.order!==undefined)?.order;
      if(order===undefined) element.style.removeProperty('order'); else element.style.order=String(order);
    }
    this.activePlanningRoot?.planningRefreshTools?.();
  }
  /** Remove everything one plugin added or changed. */
  dispose(owner){
    for(const [key,button] of this.buttons) if(button.owner===owner) this.buttons.delete(key);
    for(const [key,panel] of this.panels) if(panel.owner===owner) this.removePanel(key);
    for(const [key,override] of this.overrides) if(override.owner===owner) this.overrides.delete(key);
    this.render();
    this.applyOverrides();
  }
}
