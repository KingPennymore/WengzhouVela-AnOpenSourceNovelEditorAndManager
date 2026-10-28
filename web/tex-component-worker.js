import {unzipSync} from 'fflate';
import {MB} from './text-utils.mjs';
export async function verifyComponent(bytes,descriptor){
  if(bytes.length>96*MB)throw Error('排版组件包不能超过 96 MB。');
  const seen=new Set(),files=unzipSync(bytes,{filter:file=>{const expected=descriptor.files[file.name];if(!expected||file.originalSize!==expected.bytes||seen.has(file.name))throw Error('组件包含未知、重复或大小不符的文件。');seen.add(file.name);return true;}});
  // Accept the single package (every group) or one whole legacy group; never a partial group.
  const covered=Object.values(descriptor.groups).filter(names=>names.every(name=>seen.has(name))),count=covered.reduce((sum,names)=>sum+names.length,0);if(!covered.length||count!==seen.size)throw Error('组件不完整，请安装完整的 LaTeX 排版组件包。');
  for(const [name,data] of Object.entries(files)){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.files[name].sha256)throw Error('组件校验失败：'+name);}
  return files;
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{try{const files=await verifyComponent(data.bytes,data.descriptor);self.postMessage({files},Object.values(files).map(bytes=>bytes.buffer));}catch(error){self.postMessage({error:error.message});}};
