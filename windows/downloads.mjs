import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';

// Release downloads: only the two code hosts and their file servers, HTTPS, no credentials, every redirect re-checked.
export const DOWNLOAD_HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','gitee.com','foruda.gitee.com']);
export const COMPONENT_LIMIT=96*1024*1024,UPDATE_LIMIT=256*1024*1024;
const SAFE_NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
export function allowedDownload(value){
  let url;try{url=new URL(value);}catch{return false;}
  return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&DOWNLOAD_HOSTS.has(url.hostname);
}
const fail=(message,code)=>Object.assign(new Error(message),code?{code}:{});

/** Downloads into a private cache folder; the editor reads finished component ZIPs from vela://editor/imports/<token>. */
export class Downloads{
  constructor({fetch,directory,version,notify}){
    this.fetch=fetch;this.directory=directory;this.version=version;this.notify=notify;this.active=new Map();this.files=new Map();
    // Leftovers from an earlier run; an installer that is still running stays locked and is skipped.
    try{fs.rmSync(directory,{recursive:true,force:true});}catch{}fs.mkdirSync(directory,{recursive:true});
  }
  validate(data,limit){
    if(typeof data.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(data.id))throw fail('下载标识无效。');
    if(typeof data.name!=='string'||!SAFE_NAME.test(data.name))throw fail('文件名无效。');
    if(!allowedDownload(data.url))throw fail('不允许的下载地址。');
    const size=Number(data.size)||0,max=Math.min(limit,Number(data.limit)||limit);
    if(!Number.isSafeInteger(size)||size<0||size>max)throw fail('文件超过大小上限。','E_LIMIT');
    if(data.sha256&&!/^[0-9a-f]{64}$/.test(data.sha256))throw fail('校验信息无效。');
    return {size,max};
  }
  async open(url,signal){
    let target=url;
    for(let hop=0;hop<6;hop++){
      if(!allowedDownload(target))throw fail('下载被重定向到不允许的地址。');
      const response=await this.fetch(target,{redirect:'manual',signal,headers:{'User-Agent':'Vela-Windows/'+this.version,Accept:'application/octet-stream'},bypassCustomProtocolHandlers:true});
      if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');response.body?.cancel?.().catch?.(()=>{});if(!next)throw fail('下载重定向无效。');target=new URL(next,target).href;continue;}
      if(response.status!==200)throw fail(response.status===404?'发布中没有这个文件（HTTP 404）。':'下载失败（HTTP '+response.status+'）。');
      return response;
    }
    throw fail('下载重定向次数过多。');
  }
  async fetchToFile(data,limit){
    const {size,max}=this.validate(data,limit);
    if(this.active.size)throw fail('已有下载正在进行，请稍后。');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30*60*1000);this.active.set(data.id,controller);
    const token=randomUUID(),file=path.join(this.directory,token);let received=0,last=0;
    try{
      const response=await this.open(data.url,controller.signal),declared=Number(response.headers.get('content-length'))||0;
      if(declared>max||size&&declared&&declared!==size)throw fail('文件大小与发布信息不符。','E_LIMIT');
      const hash=createHash('sha256'),out=fs.openSync(file,'w');
      try{
        for await(const chunk of response.body){
          received+=chunk.byteLength;if(received>max)throw fail('文件超过大小上限。','E_LIMIT');
          hash.update(chunk);fs.writeSync(out,chunk);
          const now=Date.now();if(now-last>150){last=now;this.notify({id:data.id,received,total:size||declared});}
        }
        fs.fsyncSync(out);
      }finally{fs.closeSync(out);}
      if(size&&received!==size)throw fail('下载内容不完整。');
      const sha256=hash.digest('hex');if(data.sha256&&sha256!==data.sha256)throw fail('文件的 SHA-256 与发布信息不符。','E_INTEGRITY');
      this.notify({id:data.id,received,total:received});
      this.files.set(token,{file,name:data.name});
      return {token,size:received,sha256,name:data.name};
    }catch(error){
      fs.rmSync(file,{force:true});
      if(controller.signal.aborted)throw fail('下载已取消。','E_CANCELLED');
      if(error.code)throw error;
      throw fail('无法连接下载服务器，请检查网络后重试。');
    }finally{clearTimeout(timeout);this.active.delete(data.id);}
  }
  async component(data){
    const result=await this.fetchToFile(data,COMPONENT_LIMIT);
    return {name:result.name,size:result.size,sha256:result.sha256,importToken:result.token,url:'vela://editor/imports/'+result.token};
  }
  async update(data){
    if(!/\.exe$/i.test(data.name||''))throw fail('只能下载 Windows 安装程序。');
    if(!/^[0-9a-f]{64}$/.test(data.sha256||''))throw fail('安装包缺少 SHA-256，已拒绝下载。');
    const result=await this.fetchToFile(data,UPDATE_LIMIT);
    return {token:result.token,size:result.size,sha256:result.sha256,name:result.name};
  }
  /** A ZIP picked by the user, copied into the cache and read by the editor through the same imports URL. */
  stage(source,name,image=false){
    if(this.files.size>=4)throw fail('请先完成当前组件导入。');if(image?!/\.(png|jpe?g|webp)$/i.test(name):!/\.zip$/i.test(name))throw fail(image?'只支持静态 PNG、JPEG 或 WebP 图片。':'请选择 ZIP 安装包。');if(fs.statSync(source).size>(image?20:96)*1024*1024)throw fail(image?'原图不能超过 20 MB。':'安装包不能超过 96 MB。');
    const token=randomUUID(),file=path.join(this.directory,token);let size;try{fs.copyFileSync(source,file);size=fs.statSync(file).size;if(size>(image?20:96)*1024*1024)throw fail(image?'原图不能超过 20 MB。':'安装包不能超过 96 MB。');}catch(error){fs.rmSync(file,{force:true});throw error;}this.files.set(token,{file,name:image?'picked.image':'picked.zip'});
    return {name,size,importToken:token,url:'vela://editor/imports/'+token};
  }
  cancel(id){this.active.get(id)?.abort();return true;}
  release(token){const entry=this.files.get(token);this.files.delete(token);if(entry)fs.rmSync(entry.file,{force:true});return true;}
  response(url){
    const entry=this.files.get(url.pathname.slice('/imports/'.length));
    if(!entry||!/\.zip$|\.txt$|\.image$/i.test(entry.name))return new Response('',{status:404});
    const stat=fs.statSync(entry.file);
    return new Response(Readable.toWeb(fs.createReadStream(entry.file)),{headers:{'Content-Type':/\.txt$/i.test(entry.name)?'text/plain; charset=utf-8':/\.image$/i.test(entry.name)?'application/octet-stream':'application/zip','Content-Length':String(stat.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  /** Starts the verified NSIS installer detached; the caller then closes Vela so files can be replaced. */
  install(token){
    const entry=this.files.get(token);if(!entry||!/\.exe$/i.test(entry.name))throw fail('安装包不存在，请重新下载。');
    const target=path.join(this.directory,entry.name);fs.renameSync(entry.file,target);this.files.delete(token);
    spawn(target,[],{detached:true,stdio:'ignore',windowsHide:false}).unref();
    return true;
  }
  close(){for(const controller of this.active.values())controller.abort();for(const entry of this.files.values())fs.rmSync(entry.file,{force:true});}
}
