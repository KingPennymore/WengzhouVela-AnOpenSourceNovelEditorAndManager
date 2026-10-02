import {createTypesetter} from 'wasmtex';
import {texPackageFiles} from './tex-packages.mjs';
import {readPluginZip,fromBase64,toBase64} from './plugin-package.mjs';
import {documentPath} from './workspace.mjs';
import {native,transport} from './platform.mjs';

export class TexCompiler {
  constructor(host){this.host=host;this.initializing=null;this.active=new Set();}
  async engine(){
    if(!this.initializing)this.initializing=(async()=>{const base=new URL('./tex/',location.href),inventory=await fetch(new URL('manifest.json',base)).then(response=>{if(!response.ok)throw new Error('缺少 TeX 引擎资源');return response.json();});return createTypesetter({assetsBaseUrl:base.href,workerUrl:new URL('worker.js',base).href,inventory,bundles:{preload:['core'],onDemand:[]},expectAssetsVersion:'0.1.1'});})().catch(error=>{this.initializing=null;throw error;});
    return this.initializing;
  }
  async installChinese(){const runtime=this.host.plugins();if(runtime.records.some(record=>record.manifest.id==='vela.tex.cjk'&&record.enabled))return;const response=await fetch(new URL('./tex/vela-tex-cjk.zip',location.href));if(!response.ok)throw new Error('中文宏包资源不存在');await runtime.install(await readPluginZip(new Uint8Array(await response.arrayBuffer())));}
  async project(doc){
    const workspace=this.host.workspace(),path=documentPath(doc),config=this.host.project(doc),folder=config?.folder||path.split('/').slice(0,-1).join('/'),prefix=folder?folder+'/':'',entry=path.slice(prefix.length);
    const files=await texPackageFiles(this.host.plugins().records);let total=Object.values(files).reduce((size,data)=>size+data.byteLength,0);
    const add=(name,data)=>{total+=typeof data==='string'?new TextEncoder().encode(data).length:data.byteLength;if(total>160*1024*1024)throw new Error('TeX 工程和宏包超过 160 MB');files[name]=data;};
    for(const item of workspace.documents.filter(item=>!prefix||documentPath(item).startsWith(prefix))){if(/\.(tex|ltx|latex|sty|cls|bib|bst|def|cfg|clo|fd|ist|csv|txt|tsv|dat)$/i.test(item.name))add(documentPath(item).slice(prefix.length),item.text);}
    if(native)for(const item of (workspace.entries||[]).filter(item=>!item.directory&&(!prefix||item.path.startsWith(prefix))&&/\.(png|jpe?g|pdf|eps|svg|otf|ttf|woff|sty|cls|bib|bst|def|cfg|clo|fd|ist|tex|dat)$/i.test(item.path))){if(files[item.path.slice(prefix.length)]!==undefined)continue;add(item.path.slice(prefix.length),fromBase64(await transport('readWorkspaceFile',{path:item.path})));}
    const main=config?.config?.formats?.latex?.main||entry.replace(/\.(tex|ltx|latex)$/i,'.tex');if(main===entry||!config?.config?.formats?.latex?.main)files[main]=doc.text;if(files[main]===undefined)throw Error('配置中的 LaTeX 主文件不存在：'+main);return {files,entry:main};
  }
  async compile(doc,{engine='xetex',onLog=()=>{},signal}={}){
    if(signal?.aborted)throw new Error('编译已取消');await this.installChinese();const project=await this.project(doc),typesetter=await this.engine();if(signal?.aborted)throw new Error('编译已取消');
    const job=typesetter.typeset({engine,...project,passes:'auto',bibliography:'auto',index:'auto'});this.active.add(job);job.onLog(onLog);const cancel=()=>job.cancel();signal?.addEventListener('abort',cancel,{once:true});
    try{return await job.done;}finally{this.active.delete(job);signal?.removeEventListener('abort',cancel);}
  }
  async dispose(){for(const job of this.active)job.cancel();if(this.initializing)(await this.initializing).dispose();this.initializing=null;}
}
export async function exportPdf(name,data){
  if(!(data instanceof Uint8Array)||data.length>32*1024*1024||new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw new Error('PDF 无效或超过 32 MB');
  name=name.replace(/\.(tex|ltx|latex)$/i,'')+'.pdf';
  if(native)return transport('exportPdf',{name,data:toBase64(data)});
  const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;
}
