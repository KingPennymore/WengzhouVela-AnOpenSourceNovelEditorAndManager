import * as state from '@codemirror/state';
import * as view from '@codemirror/view';
import * as commands from '@codemirror/commands';
import * as language from '@codemirror/language';
import * as search from '@codemirror/search';
import {fromBase64,assetPath,validatePluginStore} from './plugin-package.mjs';
import {readPluginStore,writePluginStore} from './platform.mjs';

const mime=name=>/\.css$/i.test(name)?'text/css':/\.js$/i.test(name)?'text/javascript':/\.json$/i.test(name)?'application/json':/\.svg$/i.test(name)?'image/svg+xml':/\.png$/i.test(name)?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':/\.woff2?$/i.test(name)?'font/woff2':'text/plain';
class Events {
  listeners=new Map();
  on(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);}
  off(event,fn){this.listeners.get(event)?.delete(fn);}
  removeListener(event,fn){this.off(event,fn);}
  emit(event,...args){for(const fn of this.listeners.get(event)||[])fn(...args);}
}
export class PluginRuntime {
  records=[];running=new Map();commands=new Map();modules=new Map();initializers=new Map();unmounts=new Map();settingsPages=new Map();assetUrls=new Map();fileObjects=new Map();manager=new Events();settings=new Events();
  constructor(host) {
    this.host=host;
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
      constructor(title){const page=document.createElement('section');page.className='plugin-page';page.hidden=true;page.setAttribute('aria-label',title||'插件');const heading=document.createElement('header');const close=document.createElement('button');close.textContent='← 返回文舟';close.onclick=()=>page.hide();const h=document.createElement('h2');h.textContent=title||'插件';heading.append(close,h);const body=document.createElement('div');body.className='plugin-page-body';page.append(heading,body);Object.assign(page,{body,content:body,show(){page.hidden=false;},hide(){page.hidden=true;},settitle(value){h.textContent=value;}});document.body.append(page);runtime.running.get(runtime.loadingId)?.nodes.push(page);return page;}
    }
    const codemirror=Object.freeze({state,view,commands,language,search});
    this.modules=new Map(Object.entries({codemirror,commands:commandApi,settings:this.settings,page:Page,
      '@codemirror/state':state,'@codemirror/view':view,'@codemirror/commands':commands,'@codemirror/language':language,'@codemirror/search':search,
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
      require:name=>{if(!this.modules.has(name))throw new Error(`文舟尚未支持 Acode 模块：${name}。`);return this.modules.get(name);},
      define:(name,module)=>this.modules.set(name,module),
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
    if(!this.fileObjects.has(doc.id))this.fileObjects.set(doc.id,{id:doc.id,get filename(){return doc.name;},get name(){return doc.name;},get uri(){return `wenzhou-file://${doc.id}`;},get isUnsaved(){return false;},get text(){return doc.text;},get session(){return null;}});
    return this.fileObjects.get(doc.id);
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
    const record=this.records.find(p=>uri.startsWith(`wenzhou-plugin://${p.manifest.id}/`));
    const prefix=record?`wenzhou-plugin://${record.manifest.id}/`:'';
    const path=prefix?assetPath(uri.slice(prefix.length)):'';
    return {readFile:async(encoding='utf-8')=>{if(!record?.files[path])throw new Error('插件资源不存在。');const bytes=fromBase64(record.files[path]);return encoding===null?bytes:new TextDecoder().decode(bytes);},writeFile:async text=>{if(!record||!path.startsWith('cache/'))throw new Error('插件只能写入自身 cache 目录。');const bytes=new TextEncoder().encode(text);let s='';for(const b of bytes)s+=String.fromCharCode(b);record.files[path]=btoa(s);this.save();},exists:async()=>!!record?.files[path]};
  }
  save(){if(this.records[0])this.records[0].hostSettings={...this.settings.value};writePluginStore(this.records);}
  async boot() {
    const raw=readPluginStore();this.records=raw?validatePluginStore(JSON.parse(raw)):[];
    if(this.records[0]?.hostSettings)Object.assign(this.settings.value,this.records[0].hostSettings);
    for(const record of this.records.filter(p=>p.enabled)){try{await this.load(record);}catch(e){record.error=e.message;record.enabled=false;}}
    if(this.records.length)this.save();
  }
  bindings(){return [...this.commands.values()].flatMap(c=>{let key=typeof c.bindKey==='string'?c.bindKey:c.bindKey?.win;key=key?.replace(/^Ctrl-/i,'Mod-').replace(/-([a-z])$/i,(_,s)=>'-'+s.toLowerCase());return key?[{key,run:v=>{Promise.resolve(c.exec(v)).catch(this.host.fail);return true;}}]:[];});}
  async install(record) {
    const old=this.records.find(p=>p.manifest.id===record.manifest.id);
    if(old){await this.unload(old.manifest.id);this.records=this.records.filter(p=>p!==old);}
    this.records.push(record);
    try{await this.load(record);}catch(e){record.enabled=false;record.error=e.message;}
    this.save();return record;
  }
  async load(record) {
    const id=record.manifest.id;if(this.running.has(id))return;
    const resources={urls:[],nodes:[],page:null};this.running.set(id,resources);this.loadingId=id;
    try {
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
      await this.initializers.get(id)(base,page,{cacheFile:this.fs(base+'cache/data.json'),cacheFileUrl:base+'cache/data.json',wenzhou:true});
      record.error='';record.enabled=true;
    } catch(error) {await this.unload(id);throw error;}finally{this.loadingId=null;}
  }
  async unload(id) {
    const resources=this.running.get(id);if(!resources)return;
    try{await this.unmounts.get(id)?.();}finally{
      for(const node of resources.nodes)node.remove();for(const url of resources.urls)URL.revokeObjectURL(url);
      for(const key of this.assetUrls.keys())if(key.startsWith(`wenzhou-plugin://${id}/`))this.assetUrls.delete(key);
      this.initializers.delete(id);this.unmounts.delete(id);this.settingsPages.delete(id);this.running.delete(id);
      for(const [name,command] of this.commands)if(command.owner===id||name.startsWith(id+'.'))this.commands.delete(name);
      this.host.refreshCommands();
    }
  }
  async enable(record,enabled){if(enabled)await this.load(record);else await this.unload(record.manifest.id);record.enabled=enabled;record.error='';this.save();}
  async remove(record){await this.unload(record.manifest.id);this.records=this.records.filter(p=>p!==record);this.save();}
  emit(event,...args){try{this.manager.emit(event,...args);}catch(e){this.host.fail(e);}}
}
