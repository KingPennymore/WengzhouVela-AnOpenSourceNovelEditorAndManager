import {unzipSync} from 'fflate';
export function isTexComponentArchive(bytes){let component=false;unzipSync(bytes,{filter:file=>{if(['busytex.wasm','core.data','vela-tex-cjk.zip'].includes(file.name))component=true;return false;}});return component;}
async function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vela.tex-components',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('无法打开离线排版组件存储。'));});}
async function transaction(mode,run){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);let value;run(tx.objectStore('files'),result=>value=result);tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('离线排版组件保存失败，请检查可用空间。'));});}finally{db.close();}}
export class TexAssets {
  constructor(){this.urls=new Map();this.loading=null;}
  async descriptor(){return this.info??=await fetch(new URL('./tex/components.json',location.href)).then(response=>{if(!response.ok)throw Error('缺少排版组件清单，请重新安装应用。');return response.json();});}
  async install(bytes){
    if(this.installing)throw Error('请等待当前组件安装结束。');
    this.installing=true;
    try{
    const descriptor=await this.descriptor();
    const files=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./tex-component-worker.js',location.href));worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.files);};worker.onerror=()=>{worker.terminate();reject(Error('排版组件无法读取。'));};worker.postMessage({bytes,descriptor},[bytes.buffer]);});
    const group=Object.keys(descriptor.groups).find(group=>descriptor.groups[group].every(name=>files[name]));
    await transaction('readwrite',store=>{for(const [name,data] of Object.entries(files))store.put(data,descriptor.id+'/'+name);store.put({enabled:true},this.stateKey(descriptor,group));});
    this.dispose();return {...await this.status(),installedGroup:group};
    }finally{this.installing=false;}
  }
  stateKey(descriptor,group){return descriptor.id+'/state/'+group;}
  async groups(){
    const descriptor=await this.descriptor();
    return transaction('readonly',(store,done)=>{
      const states=Object.fromEntries(Object.keys(descriptor.groups).map(group=>[group,{installed:descriptor.builtin,enabled:true}])),found=new Set();
      for(const name of Object.keys(descriptor.files)){const request=store.getKey(descriptor.id+'/'+name);request.onsuccess=()=>{if(request.result)found.add(name);};}
      for(const [group,names] of Object.entries(descriptor.groups)){const request=store.get(this.stateKey(descriptor,group));request.onsuccess=()=>{states[group]={installed:descriptor.builtin||names.every(name=>found.has(name)),enabled:request.result?.enabled!==false};done(states);};}
    });
  }
  async records(){const descriptor=await this.descriptor(),groups=await this.groups();return Object.entries(groups).filter(([,state])=>state.installed).map(([group,state])=>({manifest:{id:'vela.component.tex.'+group,name:group==='engine'?'LaTeX 离线引擎':'LaTeX 中文支持',version:descriptor.version,vela:{type:'tex-component'}},componentGroup:group,componentId:descriptor.id,builtin:descriptor.builtin,enabled:state.enabled,files:{}}));}
  async setEnabled(group,enabled){const descriptor=await this.descriptor(),groups=await this.groups();if(!groups[group]?.installed)throw Error('组件尚未安装。');await transaction('readwrite',store=>store.put({enabled:!!enabled},this.stateKey(descriptor,group)));this.dispose();}
  async remove(group){const descriptor=await this.descriptor();if(descriptor.builtin)throw Error('内置组件可停用，不能卸载；需要节省安装空间请使用轻量版。');if(!descriptor.groups[group])throw Error('未知组件。');await transaction('readwrite',store=>{for(const name of descriptor.groups[group])store.delete(descriptor.id+'/'+name);store.delete(this.stateKey(descriptor,group));});this.dispose();}
  async status(){const descriptor=await this.descriptor(),states=await this.groups(),groups=Object.fromEntries(Object.entries(states).map(([name,state])=>[name,state.installed&&state.enabled]));return {...groups,ready:Object.values(groups).every(Boolean),builtin:descriptor.builtin};}
  async load(){
    if(this.loading)return this.loading;
    this.loading=(async()=>{const status=await this.status();if(!status.ready)throw Error('请在插件与组件列表中导入并启用离线排版引擎包和中文包，再编译 PDF。');const descriptor=await this.descriptor(),inventory=await fetch(new URL('./tex/manifest.json',location.href)).then(r=>r.json()),base=new URL('./tex/',location.href);
      if(descriptor.builtin)return {inventory,base,locateAsset:undefined,chinese:new URL('vela-tex-cjk.zip',base).href};
      const files=await transaction('readonly',(store,done)=>{const files={};for(const name of Object.keys(descriptor.files)){const request=store.get(descriptor.id+'/'+name);request.onsuccess=()=>{if(request.result)files[name]=request.result;done(files);};}});
      if(Object.keys(files).length!==Object.keys(descriptor.files).length)throw Error('请先导入离线排版引擎包和中文包，再编译 PDF。');
      for(const [name,data] of Object.entries(files)){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.files[name].sha256)throw Error('离线排版组件损坏，请重新导入。');this.urls.set(name,URL.createObjectURL(new Blob([data],{type:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'})));}
      return {inventory,base,locateAsset:name=>this.urls.get(name),chinese:this.urls.get('vela-tex-cjk.zip')};
    })().catch(error=>{this.dispose();throw error;});return this.loading;
  }
  dispose(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.loading=null;}
}
