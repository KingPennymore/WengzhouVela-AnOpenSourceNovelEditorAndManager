import {fromBase64} from './plugin-package.mjs';
export async function readImportedArchive(result,release=async()=>{}){
  if(!result)return null;
  if(!result.url)return fromBase64(result.data);
  try{
    const url=new URL(result.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/imports/')||!Number.isSafeInteger(result.size)||result.size<0||result.size>64*1024*1024)throw Error('安装包地址或大小无效。');
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('安装包读取失败，请重新选择文件。');
    const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==result.size)throw Error('安装包读取不完整，请重新选择文件。');return bytes;
  }finally{if(result.importToken)await release(result.importToken).catch(()=>{});}
}
