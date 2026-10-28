import {t} from './i18n.mjs';
import {unzipSync} from 'fflate';
export function isTexComponentArchive(bytes){
  let component=false;
  unzipSync(bytes,{
    filter:file=>{
      if(['busytex.wasm','core.data','vela-tex-cjk.zip'].includes(file.name)) component=true;
      return false;
    }
  });
  return component;
}
async function database(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('vela.tex-components',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(Error(t('无法打开离线排版组件存储。')));
  });
}
async function transaction(mode,run){
  const db=await database();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('files',mode);
      let value;
      run(tx.objectStore('files'),result=>value=result);
      tx.oncomplete=()=>resolve(value);
      tx.onabort=tx.onerror=()=>reject(Error(t('离线排版组件保存失败，请检查可用空间。')));
    });
  }finally{
    db.close();
  }
}
export class TexAssets {
  constructor(){
    this.urls=new Map();
    this.loading=null;
  }
  async descriptor(){
    return this.info??=await fetch(new URL('./tex/components.json',location.href)).then(response=>{
      if(!response.ok) throw Error(t('缺少排版组件清单，请重新安装应用。'));
      return response.json();
    });
  }
  async install(bytes){
    if(this.installing) throw Error(t('请等待当前组件安装结束。'));
    this.installing=true;
    try{
      const descriptor=await this.descriptor();
      const files=await new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./tex-component-worker.js',location.href));
        worker.onmessage=({data})=>{
          worker.terminate();
          data.error?reject(Error(t(data.error))):resolve(data.files);
        };
        worker.onerror=()=>{
          worker.terminate();
          reject(Error(t('排版组件无法读取。')));
        };
        worker.postMessage({bytes,descriptor},[bytes.buffer]);
      });
      // One package carries every group; the two legacy ZIPs (engine / Chinese) still install their own group.
      const installed=Object.keys(descriptor.groups).filter(group=>descriptor.groups[group].every(name=>files[name]));
      await transaction('readwrite',store=>{
        for(const [name,data] of Object.entries(files)) store.put(data,descriptor.id+'/'+name);
        for(const group of installed) store.put({enabled:true},this.stateKey(descriptor,group));
      });
      this.dispose();
      const groups=await this.groups();
      return {...await this.status(),installedGroup:Object.values(groups).every(state=>state.installed)?'all':installed[0]};
    }finally{
      this.installing=false;
    }
  }
  stateKey(descriptor,group){
    return descriptor.id+'/state/'+group;
  }
  async groups(){
    const descriptor=await this.descriptor();
    return transaction('readonly',(store,done)=>{
      const states=Object.fromEntries(Object.keys(descriptor.groups).map(group=>[group,{installed:descriptor.builtin,enabled:true}])),found=new Set();
      for(const name of Object.keys(descriptor.files)){
        const request=store.getKey(descriptor.id+'/'+name);
        request.onsuccess=()=>{
          if(request.result) found.add(name);
        };
      }
      for(const [group,names] of Object.entries(descriptor.groups)){
        const request=store.get(this.stateKey(descriptor,group));
        request.onsuccess=()=>{
          states[group]={installed:descriptor.builtin||names.every(name=>found.has(name)),enabled:request.result?.enabled!==false};
          done(states);
        };
      }
    });
  }
  /** A complete install is one card, `vela.component.tex`. Half of a legacy two-part install keeps its old card so it can be removed. */
  async records(){
    const descriptor=await this.descriptor(),groups=await this.groups(),entries=Object.entries(groups);
    const record=(id,name,group,enabled)=>({
      manifest:{
        id,
        get name(){
          return t(name)+(group==='all'?'':t('（旧版分包，建议安装完整组件包）'));
        },
        version:descriptor.version,
        vela:{type:'tex-component'}
      },
      componentGroup:group,componentId:descriptor.id,builtin:descriptor.builtin,enabled,files:{}
    });
    if(entries.every(([,state])=>state.installed)) return [record('vela.component.tex','LaTeX 排版组件','all',entries.every(([,state])=>state.enabled))];
    return entries.filter(([,state])=>state.installed).map(([group,state])=>record('vela.component.tex.'+group,group==='engine'?'LaTeX 离线引擎':'LaTeX 中文支持',group,state.enabled));
  }
  async targets(group){
    const descriptor=await this.descriptor();
    if(group==='all') return Object.keys(descriptor.groups);
    if(!descriptor.groups[group]) throw Error(t('未知组件。'));
    return [group];
  }
  async setEnabled(group,enabled){
    const descriptor=await this.descriptor(),groups=await this.groups(),targets=await this.targets(group);
    if(!targets.every(name=>groups[name]?.installed)) throw Error(t('组件尚未安装。'));
    await transaction('readwrite',store=>{
      for(const name of targets) store.put({enabled:!!enabled},this.stateKey(descriptor,name));
    });
    this.dispose();
  }
  async remove(group){
    const descriptor=await this.descriptor();
    if(descriptor.builtin) throw Error(t('内置组件可停用，不能卸载；需要节省安装空间请使用轻量版。'));
    const targets=await this.targets(group);
    await transaction('readwrite',store=>{
      for(const target of targets){
        for(const name of descriptor.groups[target]) store.delete(descriptor.id+'/'+name);
        store.delete(this.stateKey(descriptor,target));
      }
    });
    this.dispose();
  }
  async status(){
    const descriptor=await this.descriptor(),states=await this.groups(),groups=Object.fromEntries(Object.entries(states).map(([name,state])=>[name,state.installed&&state.enabled]));
    return {...groups,ready:Object.values(groups).every(Boolean),builtin:descriptor.builtin};
  }
  async load(){
    if(this.loading) return this.loading;
    this.loading=(async ()=>{
      const status=await this.status();
      if(!status.ready) throw Error(t('请在“插件与组件”中安装并启用 LaTeX 排版组件，再编译 PDF。'));
      const descriptor=await this.descriptor(),inventory=await fetch(new URL('./tex/manifest.json',location.href)).then(r=>r.json()),base=new URL('./tex/',location.href);
      if(descriptor.builtin) return {inventory,base,locateAsset:undefined,chinese:new URL('vela-tex-cjk.zip',base).href};
      const files=await transaction('readonly',(store,done)=>{
        const files={};
        for(const name of Object.keys(descriptor.files)){
          const request=store.get(descriptor.id+'/'+name);
          request.onsuccess=()=>{
            if(request.result) files[name]=request.result;
            done(files);
          };
        }
      });
      if(Object.keys(files).length!==Object.keys(descriptor.files).length) throw Error(t('请先安装 LaTeX 排版组件，再编译 PDF。'));
      for(const [name,data] of Object.entries(files)){
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==descriptor.files[name].sha256) throw Error(t('离线排版组件损坏，请重新导入。'));
        this.urls.set(name,URL.createObjectURL(new Blob([data],{type:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'})));
      }
      return {inventory,base,locateAsset:name=>this.urls.get(name),chinese:this.urls.get('vela-tex-cjk.zip')};
    })().catch(error=>{
      this.dispose();
      throw error;
    });
    return this.loading;
  }
  dispose(){
    for(const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.loading=null;
  }
}
