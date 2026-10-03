import * as state from '@codemirror/state';
import * as view from '@codemirror/view';
import * as commands from '@codemirror/commands';
import * as language from '@codemirror/language';
import * as search from '@codemirror/search';
import * as autocomplete from '@codemirror/autocomplete';
import {registerCompletion,removeCompletions} from './completion.mjs';
import {fromBase64,toBase64,assetPath,validatePluginStore,checkPluginCompatibility,MAX_PLUGIN_BYTES} from './plugin-package.mjs';
import {error as velaError} from './project-contract.mjs';
import {readPluginStore,writePluginStore} from './platform.mjs';
import {isTexPackage,storeTexPackage,removeTexPackage} from './tex-packages.mjs';

const mime=name=>/\.css$/i.test(name)?'text/css':/\.js$/i.test(name)?'text/javascript':/\.json$/i.test(name)?'application/json':/\.svg$/i.test(name)?'image/svg+xml':/\.png$/i.test(name)?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':/\.woff2?$/i.test(name)?'font/woff2':'text/plain';
class Events {
  listeners=new Map();
  owned=[];
  on(event,fn){if(typeof fn!=='function')throw new Error('事件监听器必须是函数');if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);const owner=this.owner?.();if(owner)this.owned.push({owner,event,fn});}
  off(event,fn){this.listeners.get(event)?.delete(fn);}
  removeListener(event,fn){this.off(event,fn);}
  cleanup(owner){for(const item of this.owned.filter(item=>item.owner===owner))this.off(item.event,item.fn);this.owned=this.owned.filter(item=>item.owner!==owner);}
  emit(event,...args){for(const fn of this.listeners.get(event)||[])try{fn(...args);}catch(error){this.fail?.(error);}}
}
export class PluginRuntime {
  records=[];running=new Map();commands=new Map();modules=new Map();moduleOwners=new Map();initializers=new Map();unmounts=new Map();settingsPages=new Map();assetUrls=new Map();fileObjects=new Map();manager=new Events();settings=new Events();
  constructor(host) {
    this.host=host;
    this.queue=Promise.resolve();for(const events of [this.manager,this.settings]){events.owner=()=>this.loadingId;events.fail=host.fail;}
    Object.defineProperties(this.manager,{
      editor:{get:()=>host.getView()},activeFile:{get:()=>this.file(host.getDoc())},
      files:{get:()=>host.getFiles().map(d=>this.file(d))},container:{get:()=>document.querySelector('#editor')}
    });
    this.settings.value={lang:'zh-CN',fontSize:16,theme:'system'};
    this.settings.get=key=>this.settings.value[key];
    this.settings.update=async changes=>{if(changes&&typeof changes==='object')Object.assign(this.settings.value,changes);this.save();this.settings.emit('update',this.settings.value);};
    const commandApi={
      addCommand:descriptor=>{if(!descriptor?.name||typeof descriptor.exec!=='function')throw new Error('插件命令需要 name 和 exec。');this.commands.set(descriptor.name,{...descriptor,owner:this.loadingId||descriptor.name.split('.').slice(0,-1).join('.')});host.refreshCommands();return descriptor;},
      removeCommand:name=>{this.commands.delete(name);host.refreshCommands();},
      exec:(name,...args)=>this.commands.get(name)?.exec(host.getView(),...args),
      execute:(name,...args)=>this.commands.get(name)?.exec(host.getView(),...args),
      getCommand:name=>this.commands.get(name),get commands(){return [...runtime.commands.values()];}
    };
    const runtime=this;
    class Page {
      constructor(title,owner=runtime.loadingId){const resources=runtime.running.get(owner);if(!resources||resources.stopping)throw velaError('E_PLUGIN_STOPPED','插件已停用。');const page=document.createElement('section');page.className='plugin-page';page.hidden=true;page.setAttribute('aria-label',title||'插件');const heading=document.createElement('header');const close=document.createElement('button');close.setAttribute('aria-label','返回文舟');close.title='返回文舟';close.innerHTML='<svg width=24 height=24 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 aria-hidden=true><path d="m14 6-6 6 6 6"/></svg>';const h=document.createElement('h2');h.textContent=title||'插件';heading.append(close,h);const body=document.createElement('div');body.className='plugin-page-body';page.append(heading,body);const visible=new Set(),hidden=new Set(),beforeClose=new Set(),pointers=new Set();const notify=set=>{for(const fn of set)try{fn();}catch(cause){host.fail(cause);}};const on=(set,fn)=>{if(resources.stopping)throw velaError('E_PLUGIN_STOPPED','插件已停用。');if(typeof fn!=='function')throw velaError('E_INVALID_DATA','页面监听器无效。');set.add(fn);return ()=>set.delete(fn);};Object.assign(page,{container:page,body,content:body,show(){if(resources.stopping)throw velaError('E_PLUGIN_STOPPED','插件已停用。');if(page.hidden){page.hidden=false;notify(visible);}},hide(){if(!page.hidden){page.hidden=true;for(const [target,id] of pointers)try{target.releasePointerCapture(id);}catch{}pointers.clear();notify(hidden);}},settitle(value){h.textContent=value;},onVisible:fn=>on(visible,fn),onHide:fn=>on(hidden,fn),onBeforeClose:fn=>on(beforeClose,fn)});const requestClose=async()=>{if(resources.stopping)throw velaError('E_PLUGIN_STOPPED','插件已停用。');close.disabled=true;try{const allow=await bounded((async()=>{for(const fn of beforeClose)if(await fn()===false)return false;return true;})(),5000,'页面关闭检查超时');if(!allow)return false;page.hide();return true;}catch(cause){host.fail(cause);return false;}finally{close.disabled=false;}};page.close=requestClose;page.destroy=()=>{page.hide();document.removeEventListener('visibilitychange',visibility);page.remove();visible.clear();hidden.clear();beforeClose.clear();};close.onclick=requestClose;const visibility=()=>{if(!page.hidden)notify(document.hidden?hidden:visible);};document.addEventListener('visibilitychange',visibility);page.addEventListener('gotpointercapture',e=>pointers.add([e.target,e.pointerId]));resources.disposers.push(()=>{page.hide();document.removeEventListener('visibilitychange',visibility);visible.clear();hidden.clear();beforeClose.clear();});document.body.append(page);resources.nodes.push(page);return page;}
    }
    const codemirror=Object.freeze({state,view,commands,language,search,autocomplete});
    this.modules=new Map(Object.entries({codemirror,commands:commandApi,settings:this.settings,page:Page,
      '@codemirror/state':state,'@codemirror/view':view,'@codemirror/commands':commands,'@codemirror/language':language,'@codemirror/search':search,'@codemirror/autocomplete':autocomplete,
      toast:host.toast,alert:async(title,message)=>host.message(title,message),confirm:async(title,message)=>host.confirm(title,message),prompt:async(title,value)=>host.prompt(title,value),
      actionStack:{push:()=>{},pop:()=>{},remove:()=>{}},
      helpers:{getText:()=>host.getDoc()?.text||'',toInternalUri:url=>this.resolve(url)},
      Url:{join:(...parts)=>parts.map((p,i)=>i?p.replace(/^\/+|\/+$/g,''):p.replace(/\/+$/,'')).join('/')},
      fs:uri=>this.fs(uri),fsOperation:uri=>this.fs(uri),
      EditorFile:class {constructor(name,options={}){const doc=host.addFile(name,options.text||'');return runtime.file(doc);}}
    }));
    const register=(map,id,fn)=>{if(id!==this.loadingId)throw new Error('插件注册 id 与 plugin.json 不一致。');if(typeof fn!=='function')throw new Error('插件生命周期必须是函数。');map.set(id,fn);};
    window.editorManager=this.manager;
    window.acode={
      require:name=>{if(name==='vela')return this.service(this.loadingId);if(name==='page'){const owner=this.loadingId;return class extends Page{constructor(title){super(title,owner);}};}if(!this.modules.has(name))throw new Error(`文舟尚未支持 Acode 模块：${name}。`);return this.modules.get(name);},
      define:(name,module)=>{if(!this.loadingId||typeof name!=='string'||!name||name.length>160)throw Error('请在插件初始化期间注册有效模块名称。');if(this.modules.has(name)&&this.moduleOwners.get(name)!==this.loadingId)throw Error('模块已由宿主或其他插件提供：'+name);this.modules.set(name,module);this.moduleOwners.set(name,this.loadingId);},
      setPluginInit:(id,fn,settings)=>{register(this.initializers,id,fn);if(settings)this.settingsPages.set(id,settings);},
      setPluginUnmount:(id,fn)=>register(this.unmounts,id,fn),
      addCommand:commandApi.addCommand,exec:commandApi.exec,
      get activeFile(){return runtime.manager.activeFile;},
      toInternalUrl:url=>this.resolve(url),
      addIcon:(name,src)=>this.assetUrls.set(`icon:${name}`,this.resolve(src)),
      newFile:(name,options={})=>this.file(host.addFile(name,options.text||'')),
      getPlugin:id=>this.records.find(p=>p.manifest.id===id)?.manifest,
      execute:commandApi.exec
    };
    this.installAssetResolver();
  }
  file(doc) {
    if(!doc)return null;
    const id=doc.id,runtime=this,get=()=>runtime.host.getFiles().find(item=>item.id===id);
    if(!this.fileObjects.has(id))this.fileObjects.set(id,{id,get filename(){return get()?.name;},get name(){return get()?.name;},get uri(){return `wenzhou-file://${id}`;},get isUnsaved(){return false;},get text(){return get()?.text;},get session(){return null;}});
    return this.fileObjects.get(doc.id);
  }
  enqueue(task){const next=this.queue.then(task);this.queue=next.catch(()=>{});return next;}
  extensions(){return [...this.running.values()].flatMap(item=>[...item.extensions.values()]);}
  service(id){if(!id||!this.running.has(id))throw new Error('请在插件初始化期间获取 vela API');const runtime=this,resources=this.running.get(id),alive=()=>{if(runtime.running.get(id)!==resources||resources.stopping)throw velaError('E_PLUGIN_STOPPED','插件已停用。');};
    resources.project||=this.host.projects?.bind(id,this.records.find(p=>p.manifest.id===id)?.manifest.name||id);
    return Object.freeze({...resources.project?.api,version:3,platform:this.host.projects?.host.platform||window.WenzhouNative?.platform||'browser',capabilities:Object.freeze(['editor-extensions','completion','documents','configuration-v2','chapters','local-history','tex',...(this.host.projects?.featureNames()||[])]),
      addExtension(extension){alive();const key=Symbol();resources.extensions.set(key,extension);runtime.host.refreshCommands();return ()=>{resources.extensions.delete(key);runtime.host.refreshCommands();};},
      addCompletion(source,kinds=[]){alive();const dispose=registerCompletion(id,source,kinds);resources.disposers.push(dispose);return dispose;},
      on(event,fn){alive();runtime.manager.on(event,fn);const dispose=()=>runtime.manager.off(event,fn);resources.disposers.push(dispose);return dispose;},
      getFiles:()=>{alive();return runtime.host.getFiles().map(doc=>({id:doc.id,name:doc.name,path:doc.path||doc.name}));},
      readText:async id=>{alive();const doc=runtime.host.getFiles().find(doc=>doc.id===id);if(!doc)throw new Error('文稿不存在');return doc.text;},
      writeText:async(id,text)=>{alive();if(typeof text!=='string')throw new Error('正文必须为字符串');return runtime.host.setText(id,text);},
      getDocumentInfo(fileId){alive();const doc=runtime.host.getFiles().find(doc=>doc.id===fileId);if(!doc)throw Error('文稿不存在');return structuredClone(runtime.host.documentInfo(doc));},
      getHistory(fileId){alive();const doc=runtime.host.getFiles().find(doc=>doc.id===fileId);if(!doc)throw Error('文稿不存在');return (runtime.host.documentHistory?.(doc)||[]).map(entry=>({revision:entry.revision,createdAt:entry.createdAt,characters:entry.text.length}));},
      getConfig(fileId){alive();const doc=runtime.host.getFiles().find(doc=>doc.id===fileId);if(!doc)throw Error('文稿不存在');return JSON.parse(JSON.stringify(runtime.host.configuration(doc)||{}));},
      getChapters(fileId){alive();const doc=runtime.host.getFiles().find(doc=>doc.id===fileId);if(!doc)throw Error('文稿不存在');return structuredClone(runtime.host.chapters(doc));},
      compileTex:async(fileId,options={})=>{alive();if(runtime.loadingId===id)throw new Error('请在初始化完成后的用户操作中编译');const doc=runtime.host.getFiles().find(doc=>doc.id===fileId);if(!doc)throw new Error('文稿不存在');const controller=new AbortController(),cancel=()=>controller.abort();resources.disposers.push(cancel);options.signal?.addEventListener('abort',cancel,{once:true});try{return await runtime.host.compileTex(doc,{engine:options.engine||'xetex',onLog:options.onLog,signal:controller.signal});}finally{options.signal?.removeEventListener('abort',cancel);resources.disposers=resources.disposers.filter(fn=>fn!==cancel);}},
      getSettings:()=>{alive();return structuredClone(runtime.records.find(record=>record.manifest.id===id)?.settings||{});},
      updateSettings(value){alive();const record=runtime.records.find(record=>record.manifest.id===id),previous=record.settings;record.settings={...record.settings,...value};try{runtime.save();}catch(error){record.settings=previous;throw error;}},
      dispose(fn){alive();if(typeof fn!=='function')throw new Error('清理器必须是函数');resources.disposers.push(fn);return fn;}
    });
  }
  resolve(value) {return typeof value==='string'?(this.assetUrls.get(value)||value):value;}
  installAssetResolver() {
    const runtime=this,originalFetch=window.fetch.bind(window);
    window.fetch=(input,options)=>originalFetch(typeof input==='string'?runtime.resolve(input):input,options);
    const originalSet=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name,value){return originalSet.call(this,name,['src','href'].includes(name)?runtime.resolve(value):value);};
    for(const [Class,key] of [[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],[HTMLImageElement,'src']]) {
      const original=Object.getOwnPropertyDescriptor(Class.prototype,key);
      if(original?.set)Object.defineProperty(Class.prototype,key,{...original,set(value){original.set.call(this,runtime.resolve(value));}});
    }
  }
  fs(uri) {
    if(uri.startsWith('wenzhou-file://')){const id=uri.slice('wenzhou-file://'.length),get=()=>this.host.getFiles().find(doc=>doc.id===id);return {exists:async()=>!!get(),readFile:async(encoding='utf-8')=>{const doc=get();if(!doc)throw new Error('文稿不存在');return encoding===null?new TextEncoder().encode(doc.text):doc.text;},writeFile:async text=>{if(!get())throw new Error('文稿不存在');return this.host.setText(id,typeof text==='string'?text:new TextDecoder('utf-8',{fatal:true}).decode(text));}};}
    const record=this.records.find(p=>uri.startsWith(`wenzhou-plugin://${p.manifest.id}/`));
    const prefix=record?`wenzhou-plugin://${record.manifest.id}/`:'';
    const path=prefix?assetPath(uri.slice(prefix.length)):'';
    return {readFile:async(encoding='utf-8')=>{if(!record?.files[path])throw new Error('插件资源不存在。');const bytes=fromBase64(record.files[path]);return encoding===null?bytes:new TextDecoder().decode(bytes);},writeFile:async text=>{if(!record||!path.startsWith('cache/'))throw new Error('插件只能写入自身 cache 目录。');const bytes=typeof text==='string'?new TextEncoder().encode(text):new Uint8Array(text);if(bytes.length>MAX_PLUGIN_BYTES)throw new Error('缓存文件超过 8 MB');const previous=record.files[path];record.files[path]=toBase64(bytes);try{this.save();}catch(error){if(previous===undefined)delete record.files[path];else record.files[path]=previous;throw error;}const base=prefix+path,old=this.assetUrls.get(base),url=URL.createObjectURL(new Blob([bytes],{type:mime(path)}));if(old?.startsWith('blob:'))URL.revokeObjectURL(old);this.assetUrls.set(base,url);this.running.get(record.manifest.id)?.urls.push(url);},exists:async()=>!!record?.files[path]};
  }
  save(){if(this.records[0])this.records[0].hostSettings={...this.settings.value};writePluginStore(this.records);}
  async boot() {
    const raw=readPluginStore();this.records=raw?validatePluginStore(JSON.parse(raw)):[];
    if(this.records[0]?.hostSettings)Object.assign(this.settings.value,this.records[0].hostSettings);
    for(const record of this.records.filter(p=>p.enabled)){try{await this.load(record);}catch(e){record.error=e.message;record.enabled=false;}}
    if(this.records.length)this.save();
  }
  bindings(){return [...this.commands.values()].flatMap(c=>{let key=typeof c.bindKey==='string'?c.bindKey:c.bindKey?.win;key=key?.replace(/^Ctrl-/i,'Mod-').replace(/-([a-z])$/i,(_,s)=>'-'+s.toLowerCase());return key?[{key,run:v=>{Promise.resolve(c.exec(v)).catch(this.host.fail);return true;}}]:[];});}
  install(record){return this.enqueue(()=>this.installNow(record));}
  async installNow(record) {
    if(isTexPackage(record))await storeTexPackage(record);
    const old=this.records.find(p=>p.manifest.id===record.manifest.id);
    if(old){await this.unload(old.manifest.id);this.records=this.records.filter(p=>p!==old);}
    this.records.push(record);
    try{await this.load(record);}catch(e){record.enabled=false;record.error=e.message;}
    try{this.save();}catch(error){await this.unload(record.manifest.id);this.records=this.records.filter(item=>item!==record);if(isTexPackage(record))await removeTexPackage(record);if(old){this.records.push(old);if(old.enabled)await this.load(old);}throw error;}
    if(old&&isTexPackage(old))await removeTexPackage(old);return record;
  }
  async load(record) {
    const id=record.manifest.id;if(this.running.has(id))return;
    checkPluginCompatibility(record.manifest,3,['editor-extensions','completion','documents','configuration-v2','chapters','local-history','tex',...(this.host.projects?.featureNames()||[])]);
    const resources={urls:[],nodes:[],page:null,extensions:new Map(),disposers:[]};this.running.set(id,resources);this.loadingId=id;
    try {
      if(isTexPackage(record)){record.enabled=true;record.error='';return;}
      const base=`wenzhou-plugin://${id}/`;
      for(const [name,data] of Object.entries(record.files)){
        if(/\.css$/i.test(name))continue;
        const url=URL.createObjectURL(new Blob([fromBase64(data)],{type:mime(name)}));resources.urls.push(url);this.assetUrls.set(base+name,url);
      }
      for(const [name,data] of Object.entries(record.files).filter(([name])=>/\.css$/i.test(name))){
        const parent=name.includes('/')?name.slice(0,name.lastIndexOf('/')+1):'';
        const css=new TextDecoder().decode(fromBase64(data)).replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/g,(all,quote,path)=>{if(/^(data:|https?:|\/|#)/.test(path))return all;try{return `url("${this.resolve(base+assetPath(parent+path.replace(/^\.\//,'')))}")`;}catch{return 'url("")';}});
        const url=URL.createObjectURL(new Blob([css],{type:'text/css'}));resources.urls.push(url);this.assetUrls.set(base+name,url);
      }
      const script=document.createElement('script');script.src=this.resolve(base+record.manifest.main);resources.nodes.push(script);
      let scriptError;
      const captureError=event=>{if(resources.urls.some(url=>event.filename===url||event.error?.stack?.includes(url))){scriptError=event.error||new Error(event.message);event.preventDefault();}};
      window.addEventListener('error',captureError);
      try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('插件入口加载超时。')),5000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(new Error('插件入口无法运行。'));};document.head.append(script);});}finally{window.removeEventListener('error',captureError);}
      if(scriptError)throw scriptError;
      if(!this.initializers.has(id))throw new Error('插件未注册 acode.setPluginInit，或入口执行失败。');
      const page=new (this.modules.get('page'))(record.manifest.name);resources.page=page;
      await bounded(this.initializers.get(id)(base,page,{cacheFile:this.fs(base+'cache/data.json'),cacheFileUrl:base+'cache/data.json',wenzhou:true,vela:this.service(id)}),15000,'插件初始化超时');
      record.error='';record.enabled=true;
    } catch(error) {await this.unload(id);throw error;}finally{this.loadingId=null;}
  }
  async unload(id) {
    const resources=this.running.get(id);if(!resources)return;
    resources.stopping=true;try{await resources.project?.stop();}catch(error){this.host.fail(error);}
    try{await bounded(this.unmounts.get(id)?.(),5000,'插件卸载超时');}catch(error){this.host.fail(error);}finally{
      for(const dispose of resources.disposers)try{dispose();}catch(error){this.host.fail(error);}this.manager.cleanup(id);this.settings.cleanup(id);removeCompletions(id);
      for(const node of resources.nodes)node.remove();for(const url of resources.urls)URL.revokeObjectURL(url);
      for(const key of this.assetUrls.keys())if(key.startsWith(`wenzhou-plugin://${id}/`))this.assetUrls.delete(key);
      this.initializers.delete(id);this.unmounts.delete(id);this.settingsPages.delete(id);this.running.delete(id);
      for(const [name,owner] of this.moduleOwners)if(owner===id){this.modules.delete(name);this.moduleOwners.delete(name);}
      for(const [name,command] of this.commands)if(command.owner===id||name.startsWith(id+'.'))this.commands.delete(name);
      this.host.refreshCommands();
    }
  }
  enable(record,enabled){return this.enqueue(async()=>{if(enabled)await this.load(record);else await this.unload(record.manifest.id);record.enabled=enabled;record.error='';this.save();});}
  remove(record){return this.enqueue(async()=>{await this.unload(record.manifest.id);this.records=this.records.filter(p=>p!==record);this.save();if(isTexPackage(record))await removeTexPackage(record);});}
  emit(event,...args){try{this.manager.emit(event,...args);}catch(e){this.host.fail(e);}}
}

function bounded(task,ms,message){let timer;return Promise.race([Promise.resolve(task),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(message)),ms))]).finally(()=>clearTimeout(timer));}
