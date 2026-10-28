import {t,say} from './i18n.mjs';
// Shared registry: optional document engines live entirely in plugin bundles.
import {flatOdfText,parseFlatOdf} from './odf-base.mjs';
import {textBytes,MB} from './text-utils.mjs';
export const ODF_ID='vela.component.odf';
export const ODF_PACKED=/\.(odt|ott|ods|ots|odp|otp|odg|otg)$/i;
export const ODF_FLAT=/\.(velaodt|vodt|fodt|fods|fodp|fodg)$/i;
const providers=new Map(),listeners=new Set(),mounts=new Set(),imports=new Set();
const extension=name=>'.'+String(name).split('.').pop().toLowerCase();

export const MAX_FORMAT_IMPORT_BYTES=32*MB;
export function onDocumentFormatsChange(fn){
  listeners.add(fn);
  return ()=>listeners.delete(fn);
}
export function registerDocumentFormat(owner,provider){
  if(!provider||typeof provider.id!=='string'||!Array.isArray(provider.extensions)||!provider.extensions.length||provider.extensions.some(ext=>!/^\.[a-z0-9]+$/.test(ext))||typeof provider.render!=='function'||typeof provider.importBytes!=='function'||typeof provider.toHtml!=='function'||typeof provider.plainText!=='function') throw Error(t('文档组件缺少有效的格式、导入、预览或纯文本接口。'));
  const sources=provider.sourceExtensions??provider.extensions;
  if(!Array.isArray(sources)||!sources.length||sources.some(ext=>!/^\.[a-z0-9]+$/.test(ext))||provider.validate!==undefined&&typeof provider.validate!=='function'||provider.maxImportBytes!==undefined&&(!Number.isSafeInteger(provider.maxImportBytes)||provider.maxImportBytes<1||provider.maxImportBytes>MAX_FORMAT_IMPORT_BYTES)) throw Error(t('文档组件的编辑源扩展名、校验方法或导入大小限制无效。'));
  const extensions=[...new Set([...provider.extensions,...sources])];
  if([...providers.values()].some(item=>item.provider.id===provider.id||item.extensions.some(ext=>extensions.includes(ext)))) throw Error(t('文档格式已由其他组件注册。'));
  provider=Object.freeze({
    ...provider,
    id:provider.id,
    extensions:Object.freeze([...provider.extensions]),
    sourceExtensions:Object.freeze([...sources]),
    importBytes:provider.importBytes.bind(provider),
    render:provider.render.bind(provider),
    plainText:provider.plainText.bind(provider),
    toHtml:provider.toHtml.bind(provider),
    validate:provider.validate?.bind(provider)
  });
  const key=Symbol(owner);
  providers.set(key,{owner,provider,extensions});
  for(const fn of listeners) fn();
  return ()=>{
    if(!providers.delete(key)) return;
    for(const pending of imports) if(pending.provider===provider) pending.controller.abort(Object.assign(Error(t('文档插件已停用，请重新导入。')),{code:'E_PLUGIN_STOPPED'}));
    for(const mount of [...mounts]) if(mount.provider===provider) mount.dispose();
    for(const fn of listeners) fn();
  };
}
export function documentProvider(name){
  const ext='.'+String(name).split('.').pop().toLowerCase();
  return [...providers.values()].find(item=>item.provider.extensions.includes(ext))?.provider;
}
export function documentSourceProvider(name){
  return [...providers.values()].find(item=>item.provider.sourceExtensions.includes(extension(name)))?.provider;
}
export function documentImportExtensions(){
  return [...new Set([...providers.values()].flatMap(item=>item.extensions))];
}
export function isComponentDocument(doc){
  return doc?.kind==='PLUGIN'||ODF_FLAT.test(doc?.name||'')||!!documentSourceProvider(doc?.name);
}
export async function importDocumentBytes(bytes,name,{signal}={}){
  const provider=documentProvider(name);
  if(!provider) throw Error(say(`请先安装并启用支持 ${extension(name)} 的文档插件。`,`Install and enable a document plugin for ${extension(name)} first.`));
  if(!(bytes instanceof Uint8Array)||bytes.length>(provider.maxImportBytes??8*MB)) throw Error(t('文件超过文档插件的导入大小限制。'));
  signal?.throwIfAborted();
  const controller=new AbortController(),pending={provider,controller},abort=()=>controller.abort(signal.reason);
  let onAbort,result;
  signal?.addEventListener('abort',abort,{once:true});
  imports.add(pending);
  try{
    const stopped=new Promise((_,reject)=>{
      onAbort=()=>reject(controller.signal.reason);
      controller.signal.addEventListener('abort',onAbort,{once:true});
    });
    result=await Promise.race([Promise.resolve().then(()=>{
      controller.signal.throwIfAborted();
      return provider.importBytes(bytes,name,{signal:controller.signal});
    }),stopped]);
  }
  finally{
    imports.delete(pending);
    signal?.removeEventListener('abort',abort);
    controller.signal.removeEventListener('abort',onAbort);
  }
  controller.signal.throwIfAborted();
  if(documentProvider(name)!==provider) throw Object.assign(Error(t('文档插件已停用，请重新导入。')),{code:'E_PLUGIN_STOPPED'});
  if(!result||typeof result.name!=='string'||!result.name.trim()||result.name.length>160||/[\\/\x00-\x1f]/.test(result.name)||typeof result.text!=='string'||textBytes(result.text)>8*MB) throw Error(t('文档插件返回了无效的编辑源文件。'));
  if(documentSourceProvider(result.name)!==provider) throw Error(t('编辑源文件必须使用此插件声明的 sourceExtensions。'));
  if(/\.(epub|mobi|azw|azw3|azw4|pdf|zip|odt|ott|ods|ots|odp|otp|odg|otg)$/i.test(result.name)) throw Error(t('请使用独立的文本编辑源扩展名，不能将编辑源写入二进制书籍。'));
  provider.validate?.(result.text);
  return {name:result.name,text:result.text,kind:ODF_FLAT.test(result.name)?'VODT':'PLUGIN',formatId:provider.id};
}
export function componentText(source,name){
  const provider=documentSourceProvider(name);
  return provider?provider.plainText(source):ODF_FLAT.test(name)?flatOdfText(source):source;
}
export function validateComponentSource(source,name){
  const provider=documentSourceProvider(name);
  if(provider) return provider.validate?.(source);
  if(ODF_FLAT.test(name)) return parseFlatOdf(source);
}
export function componentReadingHtml(source,name){
  const provider=documentSourceProvider(name);
  if(provider) return provider.toHtml(source);
  const pre=document.createElement('pre');
  pre.textContent=componentText(source,name);
  return pre.outerHTML;
}
export function importOdfBytes(bytes,name){
  const provider=documentProvider(name);
  if(!provider) throw Error(say(`请在“插件与组件”中安装并启用 ODF 文档组件后导入 ${name}。`,
    `Install and enable the ODF document component in Plugins and components before importing ${name}.`));
  return provider.importBytes(bytes,name);
}
export function odfText(source,name){
  return documentProvider(name)?.plainText(source)||flatOdfText(source);
}
export function validateFlatOdf(source,name){
  return documentProvider(name)?.validate?.(source)||parseFlatOdf(source);
}
export function odfReadingHtml(source,name){
  const provider=documentProvider(name);
  if(provider) return provider.toHtml(source);
  const pre=document.createElement('pre');
  pre.textContent=flatOdfText(source);
  return pre.outerHTML;
}
export function renderComponentDocument(options){
  const {root,doc,manage}=options;
  root.odfDispose?.();
  root.odfDispose=null;
  const provider=documentSourceProvider(doc.name);
  if(!provider){
    root.classList.remove('velaodt-preview');
    root.replaceChildren();
    const note=document.createElement('p');
    note.textContent=t('文档插件未安装或已停用。编辑源已保留，可查看源码或安装插件恢复编辑。');
    const button=document.createElement('button');
    button.textContent=t('管理插件与组件');
    button.onclick=manage;
    const text=document.createElement('pre');
    try{
      text.textContent=componentText(doc.text,doc.name);
    }catch(e){
      text.textContent=e.message;
    }
    root.append(note,button,text);
    return;
  }
  const controller=new AbortController();
  let cleanup;
  const owner=[...providers.values()].find(item=>item.provider===provider).owner;
  let old;
  const mount={
    owner,provider,dispose(){
      if(!mounts.delete(mount)) return;
      controller.abort();
      if(root.odfDispose===mount.dispose) root.odfDispose=null;
      try{
        old?.();
      }finally{
        if(typeof cleanup==='function') cleanup();
      }
    }
  };
  const alive=()=>{
    if(controller.signal.aborted) throw Object.assign(Error(t('文档预览已关闭。')),{code:'E_PLUGIN_STOPPED'});
  };
  const checkedSource=text=>{
    if(typeof text!=='string'||textBytes(text)>8*MB) throw Error(t('编辑源超过 8 MB 或内容无效。'));
    provider.validate?.(text);
  };
  mounts.add(mount);
  root.replaceChildren();
  try{
    cleanup=provider.render({
      ...options,
      signal:controller.signal,
      onChange(text){
        if(controller.signal.aborted) return;
        checkedSource(text);
        options.onChange(text);
      },
      onCopy(text){
        alive();
        checkedSource(text);
        return options.onCopy(text);
      },
      exportText(...args){
        alive();
        return options.exportText(...args);
      },
      exportBinary(...args){
        alive();
        return options.exportBinary(...args);
      }
    });
    old=root.odfDispose;
    root.odfDispose=mount.dispose;
  }catch(error){
    old=root.odfDispose;
    mount.dispose();
    root.textContent=say(`文档预览失败：${error.message}`,`Document preview failed: ${error.message}`);
  }
}
export const renderOdfDocument=renderComponentDocument;
