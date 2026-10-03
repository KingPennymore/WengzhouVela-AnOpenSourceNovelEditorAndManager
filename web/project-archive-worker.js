import {inflateSync,zipSync} from 'fflate';
import {crc32,ARCHIVE_LIMIT} from './project-archive.mjs';
self.onmessage=({data:m})=>{try{
  if(m.action==='extract'){const files=m.entries.map(e=>{if(e.directory)return {path:e.path,directory:true};const compressed=m.data.subarray(e.offset,e.offset+e.compressed),bytes=e.method===0?compressed.slice():inflateSync(compressed,{out:new Uint8Array(e.size+1)});if(bytes.length!==e.size||crc32(bytes)!==e.crc)throw new Error('ZIP 内容长度或 CRC 校验不匹配。');return {path:e.path,directory:false,bytes};});self.postMessage({files});}
  else if(m.action==='export'){const values=Object.create(null);for(const f of m.files)values[f.path+(f.directory?'/':'')]=[f.bytes,{level:0,mtime:new Date('1980-01-01T00:00:00Z'),os:0}];const bytes=zipSync(values,{level:0});if(bytes.length>ARCHIVE_LIMIT)throw new Error('ZIP 输出超过 8 MB。');self.postMessage({bytes},[bytes.buffer]);}
  else throw new Error('ZIP 操作无效。');
}catch(cause){self.postMessage({error:cause.message,code:'E_INVALID_DATA'});}};
