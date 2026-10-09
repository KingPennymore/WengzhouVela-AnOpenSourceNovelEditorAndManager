async function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vela.tex-components',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('无法打开离线排版组件存储。'));});}
async function transaction(mode,run){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);let value;run(tx.objectStore('files'),result=>value=result);tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('离线排版组件保存失败，请检查可用空间。'));});}finally{db.close();}}
export class TexAssets {
  constructor(){this.urls=new Map();this.loading=null;}
  async descriptor(){return this.info??=await fetch(new URL('./tex/components.json',location.href)).then(response=>{if(!response.ok)throw Error('缺少排版组件清单，请重新安装应用。');return response.json();});}
  async install(bytes){
    const descriptor=await this.descriptor();
    const files=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./tex-component-worker.js',location.href));worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.files);};worker.onerror=()=>{worker.terminate();reject(Error('排版组件无法读取。'));};worker.postMessage({bytes,descriptor},[bytes.buffer]);});
    await transaction('readwrite',store=>{for(const [name,data] of Object.entries(files))store.put(data,descriptor.id+'/'+name);});
    this.dispose();return this.status();
  }
  async status(){const descriptor=await this.descriptor();if(descriptor.builtin)return {ready:true,engine:true,chinese:true,builtin:true};const found=await transaction('readonly',(store,done)=>{const found=new Set();for(const name of Object.keys(descriptor.files)){const request=store.getKey(descriptor.id+'/'+name);request.onsuccess=()=>{if(request.result)found.add(name);done(found);};}});const groups=Object.fromEntries(Object.entries(descriptor.groups).map(([name,files])=>[name,files.every(file=>found.has(file))]));return {...groups,ready:Object.values(groups).every(Boolean),builtin:false};}
  async load(){
    if(this.loading)return this.loading;
    this.loading=(async()=>{const descriptor=await this.descriptor(),inventory=await fetch(new URL('./tex/manifest.json',location.href)).then(r=>r.json()),base=new URL('./tex/',location.href);
      if(descriptor.builtin)return {inventory,base,locateAsset:undefined,chinese:new URL('vela-tex-cjk.zip',base).href};
      const files=await transaction('readonly',(store,done)=>{const files={};for(const name of Object.keys(descriptor.files)){const request=store.get(descriptor.id+'/'+name);request.onsuccess=()=>{if(request.result)files[name]=request.result;done(files);};}});
      if(Object.keys(files).length!==Object.keys(descriptor.files).length)throw Error('请先导入离线排版引擎包和中文包，再编译 PDF。');
      for(const [name,data] of Object.entries(files)){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.files[name].sha256)throw Error('离线排版组件损坏，请重新导入。');this.urls.set(name,URL.createObjectURL(new Blob([data],{type:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'})));}
      return {inventory,base,locateAsset:name=>this.urls.get(name),chinese:this.urls.get('vela-tex-cjk.zip')};
    })().catch(error=>{this.dispose();throw error;});return this.loading;
  }
  dispose(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.loading=null;}
}
