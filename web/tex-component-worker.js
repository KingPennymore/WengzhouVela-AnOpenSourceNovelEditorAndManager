import {unzipSync} from 'fflate';
export async function verifyComponent(bytes,descriptor){
  if(bytes.length>64*1024*1024)throw Error('单个排版组件不能超过 64 MB。');
  const seen=new Set(),files=unzipSync(bytes,{filter:file=>{const expected=descriptor.files[file.name];if(!expected||file.originalSize!==expected.bytes||seen.has(file.name))throw Error('组件包含未知、重复或大小不符的文件。');seen.add(file.name);return true;}});
  const group=Object.values(descriptor.groups).find(names=>names.length===seen.size&&names.every(name=>seen.has(name)));if(!group)throw Error('组件不完整，请导入完整的引擎包或中文包。');
  for(const [name,data] of Object.entries(files)){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.files[name].sha256)throw Error('组件校验失败：'+name);}
  return files;
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{try{const files=await verifyComponent(data.bytes,data.descriptor);self.postMessage({files},Object.values(files).map(bytes=>bytes.buffer));}catch(error){self.postMessage({error:error.message});}};
