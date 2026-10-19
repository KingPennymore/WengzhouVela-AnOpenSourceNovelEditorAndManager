import {documentProvider,documentSourceProvider,importDocumentBytes,validateComponentSource,ODF_FLAT} from './document-components.mjs';

export const BINARY_DOCUMENT_EXTENSIONS=['.epub','.mobi','.azw','.azw3','.azw4','.pdf','.zip','.odt','.ott','.ods','.ots','.odp','.otp','.odg','.otg'];
export const binaryDocumentName=name=>BINARY_DOCUMENT_EXTENSIONS.some(ext=>String(name).toLowerCase().endsWith(ext));
export const documentImportLimit=name=>documentProvider(name)?.maxImportBytes??8*1024*1024;

// The persisted document is text. Binary books always become separate source files.
export async function prepareDocumentImport(bytes,name,decode,options={}){
 if(documentProvider(name))return importDocumentBytes(bytes,name,options);
 if(binaryDocumentName(name))throw Error('请先安装并启用支持此格式的文档插件，原始文件已保留。');
 if(!(bytes instanceof Uint8Array)||bytes.length>8*1024*1024)throw Error('请选择 8 MB 以内的编辑源文件。');
 const text=decode(bytes),provider=documentSourceProvider(name);
 validateComponentSource(text,name);
 return {name,text,...(provider?{kind:ODF_FLAT.test(name)?'VODT':'PLUGIN',formatId:provider.id}:{})};
}

export async function readDocumentBytes(read,path,limit,{signal}={}){
 const chunks=[];let offset=0,total=null,revision;
 do{
  signal?.throwIfAborted();
  const part=await read({path,offset,length:total===null?Math.min(262144,limit):Math.min(262144,total-offset),expectedRevision:revision});
  signal?.throwIfAborted();
  if(!Number.isSafeInteger(part.totalSize)||part.totalSize<0||part.totalSize>limit||total!==null&&part.totalSize!==total||typeof part.revision!=='string'||revision!==undefined&&part.revision!==revision||!(part.bytes instanceof Uint8Array)||part.bytes.length>Math.min(262144,part.totalSize-offset)||!part.bytes.length&&offset<part.totalSize)throw Error('文件超过大小限制或读取期间发生变化，原始文件已保留。');
  total=part.totalSize;revision=part.revision;chunks.push(part.bytes);offset+=part.bytes.length;
 }while(offset<total);
 const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 return {bytes,revision};
}
