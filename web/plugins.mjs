import {loadMapView,loadOutlineView,loadMapAlgorithms} from './lazy.mjs';
import * as state from '@codemirror/state';
import * as view from '@codemirror/view';
import * as commands from '@codemirror/commands';
import * as language from '@codemirror/language';
import * as search from '@codemirror/search';
import * as autocomplete from '@codemirror/autocomplete';
import {registerDocumentFormat} from './document-components.mjs';
import {registerCompletion,removeCompletions} from './completion.mjs';
import {fromBase64,assetPath,validatePluginStore,checkPluginCompatibility} from './plugin-package.mjs';
import {error as velaError} from './project-contract.mjs';
import {readPluginStore,writePluginStore} from './platform.mjs';
import {isTexPackage,storeTexPackage,removeTexPackage} from './tex-packages.mjs';
import {createUiElement,themeSnapshot} from './extension-services.mjs';

/** Vela plugin API 4: in-page plugins without the former Acode compatibility layer. */
export const PLUGIN_API=4;
const BASE_CAPABILITIES=['ui-slots','commands','pages','assets','completion','editor-extensions','documents','configuration-v2','chapters','local-history','tex','document-formats-v1','document-formats-v2','planning-formats-v1','planning-ui-v1','map-symbols-v1','map-algorithms-v1','sidebar-views-v1','view-context-v1','planning-navigation-v1','planning-transactions-v1','document-navigation-v1','background-tasks-v1','ui-components-v1'];
// Extensions must come from the host's CodeMirror instance; a bundled second copy would be rejected.
const codemirror=Object.freeze({state,view,commands,language,search,autocomplete});
const isComponent=record=>record.manifest.vela?.type==='tex-component';
const mime=name=>/\.css$/i.test(name)?'text/css':/\.(js|mjs)$/i.test(name)?'text/javascript':/\.json$/i.test(name)?'application/json':/\.svg$/i.test(name)?'image/svg+xml':/\.png$/i.test(name)?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':/\.woff2?$/i.test(name)?'font/woff2':/\.wasm$/i.test(name)?'application/wasm':'application/octet-stream';
const stopped=()=>velaError('E_PLUGIN_STOPPED','插件已停用。');
function bounded(task,ms,message){let timer;return Promise.race([Promise.resolve(task),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(message)),ms))]).finally(()=>clearTimeout(timer));}

export class PluginRuntime {
  records=[];running=new Map();commands=new Map();definitions=new Map();settingsPages=new Map();listeners=new Map();
  constructor(host){
    this.host=host;this.ready=new Promise(resolve=>{this.finishBoot=resolve;});this.queue=Promise.resolve();
    // The only global: plugin scripts register themselves while their own package is loading.
    window.VelaPlugins=Object.freeze({api:PLUGIN_API,register:(id,definition)=>{
      if(!this.loadingId||id!==this.loadingId)throw new Error('插件注册 ID 与 plugin.json 不一致，或不在加载期间。');
      if(!definition||typeof definition.activate!=='function')throw new Error('插件需要提供 activate 函数。');
      this.definitions.set(id,definition);
    }});
  }
  capabilities(){return [...BASE_CAPABILITIES,...this.host.projects?.featureNames()||[]];}
  file(doc){if(!doc)return null;const id=doc.id,get=()=>this.host.getFiles().find(item=>item.id===id);return Object.freeze({id,get name(){return get()?.name;},get path(){const d=get();return d?d.path||d.name:undefined;},get text(){return get()?.text;}});}
  get activeFile(){return this.file(this.host.getDoc());}
  enqueue(task){const next=this.queue.then(task);this.queue=next.catch(()=>{});return next;}
  extensions(){return [...this.running.values()].flatMap(item=>[...item.extensions.values()]);}
  emit(event,...args){for(const [owner,listeners] of this.listeners)for(const {event:name,fn} of listeners)if(name===event)try{fn(...args);}catch(error){this.host.fail(Object.assign(error,{plugin:owner}));}}
  bindings(){return [...this.commands.values()].flatMap(command=>{const key=command.shortcut?.replace(/^Ctrl-/i,'Mod-').replace(/-([a-z])$/i,(_,letter)=>'-'+letter.toLowerCase());return key?[{key,run:()=>{this.execute(command.name).catch(this.host.fail);return true;}}]:[];});}
  execute(name,...args){const command=this.commands.get(name);if(!command)return Promise.reject(new Error('命令不存在：'+name));return Promise.resolve().then(()=>command.run(...args));}

  /** The object a plugin receives in activate(). Every call checks the plugin is still running. */
  api(id){
    const runtime=this,host=this.host,resources=this.running.get(id),record=this.records.find(item=>item.manifest.id===id),name=record?.manifest.name||id;
    const alive=()=>{if(runtime.running.get(id)!==resources||resources.stopping)throw stopped();};
    const own=dispose=>{resources.disposers.push(dispose);return ()=>{resources.disposers=resources.disposers.filter(item=>item!==dispose);dispose();};};
    const doc=fileId=>{const found=host.getFiles().find(item=>item.id===fileId);if(!found)throw velaError('E_NOT_FOUND','文稿不存在。');return found;};
    resources.project||=host.projects?.bind(id,name);
    const ui=host.ui;
    if(!resources.servicesOwned){resources.servicesOwned=true;own(()=>{host.tasks?.dispose(id);host.sidebarViews?.dispose(id);});}
    return Object.freeze({
      version:PLUGIN_API,id,platform:host.projects?.host.platform||window.WenzhouNative?.platform||'browser',capabilities:Object.freeze(this.capabilities()),
      ui:Object.freeze({
        registerSidebarView(spec){alive();const handle=host.sidebarViews.register(id,spec),dispose=own(()=>handle.dispose());return Object.freeze({show(){alive();handle.show();},hide(){alive();handle.hide();},update(patch){alive();handle.update(patch);},dispose});},
        theme(){alive();return themeSnapshot();},
        createElement(kind,options){alive();return createUiElement(kind,options);},
        locations:ui?Object.freeze({buttons:ui.locations,panels:ui.panelLocations}):Object.freeze({buttons:[],panels:[]}),
        addButton(spec){alive();if(!ui)throw velaError('E_UNSUPPORTED','当前界面不支持插件按钮。');const key=ui.addButton(id,name,spec),dispose=own(()=>ui.removeButton(key));return Object.freeze({update(patch){alive();ui.updateButton(key,patch||{});},dispose});},
        addPanel(spec){alive();if(!ui)throw velaError('E_UNSUPPORTED','当前界面不支持插件面板。');const panel=ui.addPanel(id,name,spec),dispose=own(()=>ui.removePanel(panel.key));return Object.freeze({body:panel.body,update(patch){alive();ui.updatePanel(panel.key,patch||{});},dispose});},
        builtins(location){alive();return ui?.builtinList(location)||[];},
        setBuiltin(builtinId,options){alive();if(!ui)throw velaError('E_UNSUPPORTED','当前界面不支持调整内置元素。');return own(ui.overrideBuiltin(id,builtinId,options||{}));},
        createPage(title){alive();return runtime.page(id,title||name);},
        toast(message){alive();host.toast(String(message).slice(0,500));},
        alert:(title,message)=>{alive();return host.message(title,message);},
        confirm:(title,message)=>{alive();return host.confirm(title,message);},
        prompt:(title,value)=>{alive();return host.prompt(title,value);}
      }),
      commands:Object.freeze({
        register({id:commandId,title,shortcut,run}={}){alive();if(typeof commandId!=='string'||!/^[\w.-]{1,120}$/.test(commandId)||typeof title!=='string'||!title.trim()||typeof run!=='function')throw velaError('E_INVALID_DATA','命令需要 id、title 和 run。');if(shortcut!==undefined&&(typeof shortcut!=='string'||shortcut.length>40))throw velaError('E_INVALID_DATA','快捷键无效。');const fullName=id+'.'+commandId;if(runtime.commands.has(fullName))throw velaError('E_CONFLICT','命令已注册：'+fullName);runtime.commands.set(fullName,{name:fullName,title:title.trim().slice(0,80),shortcut,run,owner:id});host.refreshCommands();return own(()=>{runtime.commands.delete(fullName);host.refreshCommands();});},
        execute:(commandId,...args)=>{alive();return runtime.execute(commandId.includes('.')&&runtime.commands.has(commandId)?commandId:id+'.'+commandId,...args);}
      }),
      assets:Object.freeze({
        url(path){alive();const url=runtime.assetUrl(id,path);if(!url)throw velaError('E_NOT_FOUND','插件资源不存在：'+path);return url;},
        async read(path,{encoding='utf-8'}={}){alive();const data=record.files[assetPath(path)];if(data===undefined)throw velaError('E_NOT_FOUND','插件资源不存在：'+path);const bytes=fromBase64(data);return encoding===null?bytes:new TextDecoder().decode(bytes);}
      }),
      settings:Object.freeze({
        get(){alive();return structuredClone(record.settings||{});},
        update(value){alive();if(!value||typeof value!=='object')throw velaError('E_INVALID_DATA','设置必须是对象。');const previous=record.settings;record.settings={...record.settings,...value};try{runtime.save();}catch(error){record.settings=previous;throw error;}},
        page(config){alive();if(!config||!Array.isArray(config.list))throw velaError('E_INVALID_DATA','设置页需要 list。');runtime.settingsPages.set(id,config);return own(()=>runtime.settingsPages.delete(id));}
      }),
      editor:Object.freeze({
        codemirror,
        addCompletion(source,kinds=[]){alive();return own(registerCompletion(id,source,kinds));},
        addExtension(extension){alive();const key=Symbol();resources.extensions.set(key,extension);host.refreshCommands();return own(()=>{resources.extensions.delete(key);host.refreshCommands();});},
        get view(){alive();return host.getView();}
      }),
      documents:Object.freeze({
        async open(fileId,options={}){alive();doc(fileId);const controller=new AbortController(),release=own(()=>controller.abort()),abort=()=>controller.abort();if(options.signal?.aborted)controller.abort();options.signal?.addEventListener('abort',abort,{once:true});try{return await host.openDocument(fileId,{...options,signal:controller.signal});}finally{options.signal?.removeEventListener('abort',abort);release();}},
        active(){alive();return runtime.activeFile;},
        list(){alive();return host.getFiles().map(item=>({id:item.id,name:item.name,path:item.path||item.name}));},
        async readText(fileId){alive();return doc(fileId).text;},
        async writeText(fileId,value){alive();if(typeof value!=='string')throw velaError('E_INVALID_DATA','正文必须为字符串。');doc(fileId);return host.setText(fileId,value);},
        info(fileId){alive();return structuredClone(host.documentInfo(doc(fileId)));},
        history(fileId){alive();return (host.documentHistory?.(doc(fileId))||[]).map(entry=>({revision:entry.revision,createdAt:entry.createdAt,characters:entry.text.length}));},
        config(fileId){alive();return JSON.parse(JSON.stringify(host.configuration(doc(fileId))||{}));},
        chapters(fileId){alive();return structuredClone(host.chapters(doc(fileId)));},
        create(fileName,value=''){alive();return runtime.file(host.addFile(fileName,value));}
      }),
      project:resources.project?.api||null,
      tex:Object.freeze({async compile(fileId,options={}){alive();if(runtime.loadingId===id)throw velaError('E_INVALID_DATA','请在初始化完成后的用户操作中编译。');const target=doc(fileId),controller=new AbortController(),cancel=()=>controller.abort();resources.disposers.push(cancel);options.signal?.addEventListener('abort',cancel,{once:true});try{return await host.compileTex(target,{engine:options.engine||'xetex',onLog:options.onLog,signal:controller.signal});}finally{options.signal?.removeEventListener('abort',cancel);resources.disposers=resources.disposers.filter(fn=>fn!==cancel);}}}),
      planning:Object.freeze({
        navigate(spec){alive();return host.navigatePlanning(spec);},
        snapshot(){alive();return host.planningSnapshot();},
        async applyChanges({fileId,expectedText,changes}){alive();doc(fileId);if(typeof expectedText!=='string')throw velaError('E_INVALID_DATA','需要读取时的 expectedText。');const module=await import('./planning-transactions.mjs');alive();const target=doc(fileId);if(target.text!==expectedText)throw velaError('E_CONFLICT','文稿已变化，请重新读取。');const kind=host.documentKind(target),next=module.applyPlanningChanges(kind,expectedText,changes);return host.applyPlanning(fileId,next,expectedText);},
        async parse(kind,text){alive();const module=kind==='OUTLINE'?await loadOutlineView():kind==='MAP'?await loadMapView():null;alive();if(!module)throw velaError('E_INVALID_DATA','规划格式无效。');return structuredClone((module.parseOutline||module.parseMap)(text));},
        async serialize(kind,value){alive();const module=kind==='OUTLINE'?await loadOutlineView():kind==='MAP'?await loadMapView():null;alive();if(!module)throw velaError('E_INVALID_DATA','规划格式无效。');return (module.outlineText||module.mapText)(structuredClone(value));},
        async registerMapSymbol(spec){alive();const module=await loadMapView();alive();const handle=module.registerMapSymbol(id,spec),dispose=own(handle.dispose);return Object.freeze({type:handle.type,dispose});},
        async registerMapAlgorithm(spec){alive();if(!spec||typeof spec.run!=='function')throw velaError('E_INVALID_DATA','插件算法定义无效。');const module=await loadMapAlgorithms();alive();const handle=module.registerMapAlgorithm(id,{...spec,run:async(...args)=>{alive();const result=await spec.run(...args);alive();return result;}}),dispose=own(handle.dispose);return Object.freeze({id:handle.id,dispose});}
      }),
      formats:Object.freeze({register(provider){alive();return own(registerDocumentFormat(id,provider));}}),
      context:Object.freeze({get(){alive();return host.context.get();},subscribe(fn){alive();if(typeof fn!=='function')throw velaError('E_INVALID_DATA','需要监听函数。');return own(host.context.subscribe(context=>{if(runtime.running.get(id)===resources&&!resources.stopping)fn(context);}));}}),
      tasks:Object.freeze({run(spec){alive();const task=host.tasks.run(id,spec),release=own(()=>task.cancel());task.result.then(release,release);return task;},runWorker(spec){alive();const url=runtime.assetUrl(id,assetPath(spec.path));if(!url)throw velaError('E_NOT_FOUND','Worker 资源不存在。');const task=host.tasks.worker(id,{...spec,url}),release=own(()=>task.cancel());task.result.then(release,release);return task;}}),
      on(event,fn){alive();if(typeof fn!=='function')throw velaError('E_INVALID_DATA','事件监听器必须是函数。');const entry={event,fn},list=runtime.listeners.get(id)||[];list.push(entry);runtime.listeners.set(id,list);return own(()=>{const current=runtime.listeners.get(id)||[];runtime.listeners.set(id,current.filter(item=>item!==entry));});},
      dispose(fn){alive();if(typeof fn!=='function')throw velaError('E_INVALID_DATA','清理器必须是函数。');resources.disposers.push(fn);return fn;}
    });
  }
  assetUrl(id,path){let normalised;try{normalised=assetPath(String(path).replace(/^\.\//,''));}catch{return null;}return this.running.get(id)?.assets.get(normalised)||null;}

  /** A full-screen plugin page using the existing page chrome (back button, title). */
  page(owner,title){
    const resources=this.running.get(owner);if(!resources||resources.stopping)throw stopped();const host=this.host;
    const page=document.createElement('section');page.className='plugin-page';page.hidden=true;page.setAttribute('aria-label',title);const heading=document.createElement('header'),close=document.createElement('button');close.setAttribute('aria-label','返回文舟');close.title='返回文舟';close.innerHTML='<svg width=24 height=24 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 aria-hidden=true><path d="m14 6-6 6 6 6"/></svg>';const h=document.createElement('h2');h.textContent=title;heading.append(close,h);const body=document.createElement('div');body.className='plugin-page-body';page.append(heading,body);
    const visible=new Set(),hidden=new Set(),beforeClose=new Set(),pointers=new Set(),notify=set=>{for(const fn of set)try{fn();}catch(cause){host.fail(cause);}},on=(set,fn)=>{if(resources.stopping)throw stopped();if(typeof fn!=='function')throw velaError('E_INVALID_DATA','页面监听器无效。');set.add(fn);return ()=>set.delete(fn);};
    const api={body,show(){if(resources.stopping)throw stopped();if(page.hidden){page.hidden=false;notify(visible);}},hide(){if(!page.hidden){page.hidden=true;for(const [target,id] of pointers)try{target.releasePointerCapture(id);}catch{}pointers.clear();notify(hidden);}},setTitle(value){h.textContent=String(value).slice(0,80);},onVisible:fn=>on(visible,fn),onHide:fn=>on(hidden,fn),onBeforeClose:fn=>on(beforeClose,fn),
      async close(){if(resources.stopping)throw stopped();close.disabled=true;try{const allow=await bounded((async()=>{for(const fn of beforeClose)if(await fn()===false)return false;return true;})(),5000,'页面关闭检查超时');if(!allow)return false;api.hide();return true;}catch(cause){host.fail(cause);return false;}finally{close.disabled=false;}}};
    close.onclick=()=>api.close();const visibility=()=>{if(!page.hidden)notify(document.hidden?hidden:visible);};document.addEventListener('visibilitychange',visibility);page.addEventListener('gotpointercapture',event=>pointers.add([event.target,event.pointerId]));
    resources.disposers.push(()=>{api.hide();document.removeEventListener('visibilitychange',visibility);visible.clear();hidden.clear();beforeClose.clear();});document.body.append(page);resources.nodes.push(page);return Object.freeze(api);
  }

  save(){writePluginStore(this.records.filter(record=>!isComponent(record)));}
  async boot(){
    try{const raw=readPluginStore();this.records=raw?validatePluginStore(JSON.parse(raw)):[];for(const record of this.records)delete record.hostSettings;if(this.host.components)this.records.push(...await this.host.components().records());
      for(const record of this.records.filter(item=>item.enabled)){try{await this.load(record);}catch(error){record.error=error.message;record.enabled=false;}}if(this.records.length)this.save();}
    finally{this.finishBoot();}
  }
  installComponent(bytes){return this.enqueue(async()=>{await this.host.beforeComponentChange();const status=await this.host.components().install(bytes);await this.syncComponents();return this.records.find(record=>isComponent(record)&&record.componentGroup===status.installedGroup);});}
  async syncComponents(){for(const record of this.records.filter(isComponent))await this.unload(record.manifest.id);this.records=this.records.filter(record=>!isComponent(record));const records=await this.host.components().records();this.records.push(...records);for(const record of records.filter(item=>item.enabled))await this.load(record);}
  install(record){return this.enqueue(()=>this.installNow(record));}
  async installNow(record){
    if(isTexPackage(record))await storeTexPackage(record);const old=this.records.find(item=>item.manifest.id===record.manifest.id);if(old){await this.unload(old.manifest.id);this.records=this.records.filter(item=>item!==old);}this.records.push(record);
    try{await this.load(record);}catch(error){record.enabled=false;record.error=error.message;}
    try{this.save();}catch(error){await this.unload(record.manifest.id);this.records=this.records.filter(item=>item!==record);if(isTexPackage(record))await removeTexPackage(record);if(old){this.records.push(old);if(old.enabled)await this.load(old);}throw error;}
    if(old&&isTexPackage(old))await removeTexPackage(old);return record;
  }
  async load(record){
    const id=record.manifest.id;if(this.running.has(id))return;
    if(!isComponent(record)&&!isTexPackage(record)){if(!record.manifest.vela?.api)throw Object.assign(new Error('此插件使用旧版 Acode 接口，文舟已不再支持。请安装声明 vela.api ">=4" 的新版插件。'),{code:'E_UNSUPPORTED'});checkPluginCompatibility(record.manifest,PLUGIN_API,this.capabilities());}
    const resources={assets:new Map(),urls:[],nodes:[],extensions:new Map(),disposers:[]};this.running.set(id,resources);this.loadingId=id;
    try{
      if(isComponent(record)||isTexPackage(record)){record.enabled=true;record.error='';return;}
      for(const [name,data] of Object.entries(record.files)){if(/\.css$/i.test(name))continue;const url=URL.createObjectURL(new Blob([fromBase64(data)],{type:mime(name)}));resources.urls.push(url);resources.assets.set(name,url);}
      // Package CSS may reference sibling assets; rewrite only relative url() values to the package's own blob URLs.
      for(const [name,data] of Object.entries(record.files).filter(([file])=>/\.css$/i.test(file))){const parent=name.includes('/')?name.slice(0,name.lastIndexOf('/')+1):'';const css=new TextDecoder().decode(fromBase64(data)).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,(all,_quote,path)=>{if(/^(data:|https?:|\/|#)/.test(path))return all;try{return 'url("'+(resources.assets.get(assetPath(parent+path.replace(/^\.\//,'')))||'')+'")';}catch{return 'url("")';}});const url=URL.createObjectURL(new Blob([css],{type:'text/css'}));resources.urls.push(url);resources.assets.set(name,url);}
      const entry=resources.assets.get(assetPath(record.manifest.main));if(!entry)throw new Error('插件入口文件不存在。');const script=document.createElement('script');script.src=entry;resources.nodes.push(script);let scriptError;
      const captureError=event=>{if(resources.urls.some(url=>event.filename===url||event.error?.stack?.includes(url))){scriptError=event.error||new Error(event.message);event.preventDefault();}};window.addEventListener('error',captureError);
      try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('插件入口加载超时。')),5000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(new Error('插件入口无法运行。'));};document.head.append(script);});}finally{window.removeEventListener('error',captureError);}
      if(scriptError)throw scriptError;const definition=this.definitions.get(id);if(!definition)throw new Error('插件没有调用 VelaPlugins.register 注册，或入口执行失败。');
      await bounded(definition.activate(this.api(id)),15000,'插件初始化超时');record.error='';record.enabled=true;
    }catch(error){await this.unload(id);throw error;}finally{this.loadingId=null;}
  }
  async unload(id){
    const resources=this.running.get(id);if(!resources)return;resources.stopping=true;
    try{await resources.project?.stop();}catch(error){this.host.fail(error);}
    try{await bounded(this.definitions.get(id)?.deactivate?.(),5000,'插件停用超时');}catch(error){this.host.fail(error);}
    finally{
      for(const dispose of [...resources.disposers].reverse())try{dispose();}catch(error){this.host.fail(error);}
      this.host.ui?.dispose(id);this.listeners.delete(id);removeCompletions(id);for(const node of resources.nodes)node.remove();for(const url of resources.urls)URL.revokeObjectURL(url);
      this.definitions.delete(id);this.settingsPages.delete(id);this.running.delete(id);for(const [name,command] of this.commands)if(command.owner===id)this.commands.delete(name);this.host.refreshCommands();
    }
  }
  enable(record,enabled){return this.enqueue(async()=>{if(isComponent(record)){await this.host.beforeComponentChange();await this.host.components().setEnabled(record.componentGroup,enabled);}if(enabled)await this.load(record);else await this.unload(record.manifest.id);record.enabled=enabled;record.error='';this.save();});}
  remove(record){return this.enqueue(async()=>{if(isComponent(record)){await this.host.beforeComponentChange();await this.host.components().remove(record.componentGroup);const sources=record.componentGroup==='all'?[record.manifest.id,'vela.component.tex.chinese']:[record.manifest.id];for(const derived of this.records.filter(item=>sources.includes(item.sourceComponent))){await this.unload(derived.manifest.id);if(isTexPackage(derived))await removeTexPackage(derived);this.records=this.records.filter(item=>item!==derived);}}await this.unload(record.manifest.id);this.records=this.records.filter(item=>item!==record);this.save();if(isTexPackage(record))await removeTexPackage(record);});}
}
