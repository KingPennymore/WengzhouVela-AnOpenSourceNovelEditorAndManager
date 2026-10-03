import {error,relativePath,within,mime,sha256} from './project-contract.mjs';
import {fromBase64,toBase64} from './plugin-package.mjs';

export const ARCHIVE_LIMIT=8*1024*1024;
/** Validate the central directory before allocating any expanded file buffers. */
export function inspectZip(data){
  if(data.byteLength>ARCHIVE_LIMIT||data.byteLength<22)throw error('E_LIMIT','此平台 ZIP 限制为 8 MB。');
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength);let end=-1;
  for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===data.length){end=p;break;}
  if(end<0)throw error('E_INVALID_DATA','ZIP 目录无效。');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
  if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count||count>1000||start+size!==end||start===0xffffffff)throw error('E_INVALID_DATA','不支持多卷或 ZIP64 归档。');
  const entries=[],seen=new Set();let p=start,total=0;
  for(let i=0;i<count;i++){
    if(p+46>end||v.getUint32(p,true)!==0x02014b50)throw error('E_INVALID_DATA','ZIP 项无效。');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),expanded=v.getUint32(p+24,true),nameLength=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),attributes=v.getUint32(p+38,true),offset=v.getUint32(p+42,true),next=p+46+nameLength+extra+comment;
    if(next>end||flags&1||![0,8].includes(method)||(attributes>>>16&0xf000)&&![0x4000,0x8000].includes(attributes>>>16&0xf000)||offset+30>start||compressed>ARCHIVE_LIMIT||expanded>ARCHIVE_LIMIT)throw error('E_INVALID_DATA','ZIP 包含不支持的加密、链接、大小或格式。');
    let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(p+46,p+46+nameLength));}catch{throw error('E_INVALID_DATA','ZIP 文件名不是 UTF-8。');}
    if(/[\u0080-\uffff]/.test(name)&&!(flags&2048))throw error('E_INVALID_DATA','非 ASCII ZIP 文件名必须声明 UTF-8。');
    const directory=name.endsWith('/');if(directory&&expanded)throw error('E_INVALID_DATA','ZIP 目录不能携带正文。');const path=relativePath(directory?name.slice(0,-1):name),key=path.toLowerCase();
    if(seen.has(key)||entries.some(e=>!e.directory&&within(e.path.toLowerCase(),key)||!directory&&within(key,e.path.toLowerCase())))throw error('E_INVALID_DATA','ZIP 中有重复路径或父路径是文件。');seen.add(key);
    if(v.getUint32(offset,true)!==0x04034b50||v.getUint16(offset+6,true)!==flags||v.getUint16(offset+8,true)!==method)throw error('E_INVALID_DATA','ZIP 本地记录不匹配。');
    const localName=v.getUint16(offset+26,true),localExtra=v.getUint16(offset+28,true),body=offset+30+localName+localExtra;
    if(body+compressed>start||new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(offset+30,offset+30+localName))!==name)throw error('E_INVALID_DATA','ZIP 内容越界。');
    total+=expanded;if(total>ARCHIVE_LIMIT)throw error('E_LIMIT','此平台 ZIP 展开后限制为 8 MB。');
    entries.push({path,directory,size:expanded,compressed,offset:body,method,crc:v.getUint32(p+16,true)});p=next;
  }
  if(p!==end)throw error('E_INVALID_DATA','ZIP 目录长度不匹配。');return {entries,totalBytes:total};
}
export function crc32(data){let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=c>>>1^(c&1?0xedb88320:0);}return (c^0xffffffff)>>>0;}

/** Small mobile ZIPs run off the UI thread; native file tokens never become public paths. */
export class NativeArchiveBackend {
  constructor(native){this.native=native;this.archives=new Map();this.workers=new Map();this.outputs=new Map();this.cancelled=new Set();}
  own(map,id,owner){const r=map.get(id);if(!r||r.owner!==owner)throw error('E_NOT_FOUND','归档会话不存在。');return r;}
  check(owner,id){if(id&&this.cancelled.has(owner+':'+id))throw error('E_CANCELLED','任务已取消。');}
  work(owner,taskId,message){this.check(owner,taskId);return new Promise((resolve,reject)=>{const worker=new Worker('project-archive-worker.js'),key=owner+':'+(taskId||crypto.randomUUID()),record={worker,reject};this.workers.set(key,record);const timer=setTimeout(()=>{worker.terminate();this.workers.delete(key);reject(error('E_LIMIT','ZIP 处理超过时间限制。'));},30000);const finish=()=>{clearTimeout(timer);worker.terminate();this.workers.delete(key);};record.clear=()=>clearTimeout(timer);worker.onmessage=e=>{finish();e.data.error?reject(error(e.data.code||'E_INVALID_DATA',e.data.error)):resolve(e.data);};worker.onerror=()=>{finish();reject(error('E_INVALID_DATA','ZIP 工作线程失败。'));};worker.postMessage(message);});}
  async readAll(owner,action,args,size){if(size>ARCHIVE_LIMIT)throw error('E_LIMIT','此平台 ZIP 文件限制为 8 MB。');const data=new Uint8Array(size);let at=0;while(at<size){this.check(owner,args.taskId);const part=await this.native.call(action,owner,{...args,offset:at,length:Math.min(256*1024,size-at)}),bytes=fromBase64(part.data);if(!bytes.length||bytes.length>size-at)throw error('E_CONFLICT','归档读取不完整。');data.set(bytes,at);at+=bytes.length;}return data;}
  async stage(owner,a,data){const start=await this.native.call('begin',owner,{root:a.root,size:data.length,mime:mime(a.path),sha256:await sha256(data)});try{let sequence=0;for(let at=0;at<data.length;at+=256*1024){this.check(owner,a.taskId);await this.native.call('chunk',owner,{blobId:start.blobId,sequence:sequence++,data:toBase64(data.subarray(at,at+256*1024))});}return await this.native.call('finish',owner,start);}catch(cause){await this.native.call('abort',owner,start).catch(()=>{});throw cause;}}
  async call(action,owner,a){
    if(action==='capabilities'){const c=await this.native.call(action,owner,a);if(c.features.filesystem&&!c.features.archives){this.enabled=true;c.features.archives=true;c.limits.archiveExpandedBytes=ARCHIVE_LIMIT;c.limits.archiveEntries=1000;c.limits.archiveFileBytes=ARCHIVE_LIMIT;}return c;}
    if(!this.enabled)return this.native.call(action,owner,a);
    if(action==='cancel'||action==='stop'){for(const [key,r] of this.workers)if(key.startsWith(owner+':')&&(action==='stop'||key===owner+':'+a.taskId)){r.clear?.();r.worker.terminate();r.reject(error('E_CANCELLED','ZIP 任务已取消。'));this.workers.delete(key);}if(action==='cancel')this.cancelled.add(owner+':'+a.taskId);else{for(const [id,r] of this.archives)if(r.owner===owner)this.archives.delete(id);for(const [id,r] of this.outputs)if(r.owner===owner)this.outputs.delete(id);}return this.native.call(action,owner,a);}
    if(action==='archiveInspect'){const first=await this.native.call('selectionRead',owner,{token:a.selectionToken,offset:0,length:0}),data=await this.readAll(owner,'selectionRead',{token:a.selectionToken,taskId:a.taskId},first.totalSize),parsed=inspectZip(data),archiveToken=crypto.randomUUID();this.archives.set(archiveToken,{owner,data,...parsed});return {archiveToken,entries:parsed.entries.map(({path,directory,size})=>({path,directory,size})),totalBytes:parsed.totalBytes};}
    if(action==='archiveRead'){const r=this.own(this.archives,a.archiveToken,owner),e=r.entries.find(e=>e.path===a.path&&!e.directory);if(!e)throw error('E_NOT_FOUND','归档文件不存在。');if(e.size>a.maxBytes)throw error('E_LIMIT','归档文本超过限制。');const result=await this.work(owner,a.taskId,{action:'extract',data:r.data,entries:[e]});return {data:toBase64(result.files[0].bytes)};}
    if(action==='archiveStage'){const r=this.own(this.archives,a.archiveToken,owner),result=await this.work(owner,a.taskId,{action:'extract',data:r.data,entries:r.entries}),entries=[],created=[];try{for(const file of result.files){this.check(owner,a.taskId);if(file.directory)entries.push(file);else{const staged=await this.stage(owner,{...a,path:file.path},file.bytes);created.push(staged.blobId);entries.push({...staged,path:file.path,directory:false});}}return {entries};}catch(cause){for(const blobId of created)await this.native.call('abort',owner,{blobId}).catch(()=>{});throw cause;}}
    if(action==='archiveExport'){const record=await this.native.call('snapshotEntries',owner,a),prefix=relativePath(a.root||'',true),full=p=>(prefix?prefix+'/':'')+relativePath(p),paths=a.paths.map(full),entries=record.entries.filter(e=>paths.some(p=>within(p,e.path)));for(const p of paths)if(!entries.some(e=>e.path===p))throw error('E_NOT_FOUND','快照中没有白名单文件。');if(entries.reduce((n,e)=>n+e.size,0)>ARCHIVE_LIMIT||entries.length>1000)throw error('E_LIMIT','此平台 ZIP 导出超过限制。');const files=[];for(const e of entries.sort((x,y)=>x.path.localeCompare(y.path))){this.check(owner,a.taskId);files.push({path:e.path.slice(prefix?prefix.length+1:0),directory:e.kind==='directory',bytes:e.kind==='directory'?new Uint8Array(0):await this.readAll(owner,'read',{snapshotId:a.snapshotId,pluginId:a.pluginId,path:e.path,expectedRevision:e.revision,taskId:a.taskId},e.size)});}const result=await this.work(owner,a.taskId,{action:'export',files}),staged=await this.stage(owner,{root:record.root,path:'export.zip',taskId:a.taskId},result.bytes),outputToken=crypto.randomUUID();this.outputs.set(outputToken,{owner,...staged});return {outputToken,sha256:staged.sha256,bytes:staged.size};}
    if(action==='discardOutput'){const r=this.outputs.get(a.outputToken);if(r?.owner===owner){await this.native.call('abort',owner,{blobId:r.blobId}).catch(()=>{});this.outputs.delete(a.outputToken);}return true;}
    if(action==='deliver'){const r=this.own(this.outputs,a.outputToken,owner);try{return await this.native.call('deliverBlob',owner,{...a,blobId:r.blobId});}finally{this.outputs.delete(a.outputToken);await this.native.call('abort',owner,{blobId:r.blobId}).catch(()=>{});}}
    return this.native.call(action,owner,a);
  }
}
