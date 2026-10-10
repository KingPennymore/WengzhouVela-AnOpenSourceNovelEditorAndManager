// Shared registry: optional document engines live entirely in plugin bundles.
import {flatOdfText,parseFlatOdf} from './odf-base.mjs';
export const ODF_ID='vela.component.odf';
export const ODF_PACKED=/\.(odt|ott|ods|ots|odp|otp|odg|otg)$/i;
export const ODF_FLAT=/\.(velaodt|vodt|fodt|fods|fodp|fodg)$/i;
const providers=new Map(),listeners=new Set(),mounts=new Set();
export function onDocumentFormatsChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
export function registerDocumentFormat(owner,provider){
 if(!provider||typeof provider.id!=='string'||!Array.isArray(provider.extensions)||!provider.extensions.length||provider.extensions.some(ext=>!/^\.[a-z0-9]+$/.test(ext))||typeof provider.render!=='function'||typeof provider.importBytes!=='function'||typeof provider.toHtml!=='function'||typeof provider.plainText!=='function')throw Error('文档组件缺少有效的格式、导入、预览或纯文本接口。');
 if([...providers.values()].some(item=>item.provider.id===provider.id||item.provider.extensions.some(ext=>provider.extensions.includes(ext))))throw Error('文档格式已由其他组件注册。');
 const key=Symbol(owner);providers.set(key,{owner,provider});for(const fn of listeners)fn();
 return ()=>{if(!providers.delete(key))return;for(const mount of [...mounts])if(mount.owner===owner)mount.dispose();for(const fn of listeners)fn();};
}
export function documentProvider(name){const ext='.'+String(name).split('.').pop().toLowerCase();return [...providers.values()].find(item=>item.provider.extensions.includes(ext))?.provider;}
export function importOdfBytes(bytes,name){const provider=documentProvider(name);if(!provider)throw Error('请在“插件与组件”中安装并启用 ODF 文档组件后导入 '+name+'。');return provider.importBytes(bytes,name);}
export function odfText(source,name){return documentProvider(name)?.plainText(source)||flatOdfText(source);}
export function validateFlatOdf(source,name){return documentProvider(name)?.validate?.(source)||parseFlatOdf(source);}
export function odfReadingHtml(source,name){const provider=documentProvider(name);if(provider)return provider.toHtml(source);const pre=document.createElement('pre');pre.textContent=flatOdfText(source);return pre.outerHTML;}
export function renderOdfDocument(options){
 const {root,doc,manage}=options;root.odfDispose?.();root.odfDispose=null;
 const provider=documentProvider(doc.name);
 if(!provider){root.classList.remove('velaodt-preview');root.replaceChildren();const note=document.createElement('p');note.textContent='ODF 文档组件未安装或已停用。可阅读纯文本、查看源码或安装组件恢复富文本编辑。';const button=document.createElement('button');button.textContent='管理 ODF 组件';button.onclick=manage;const text=document.createElement('pre');try{text.textContent=flatOdfText(doc.text);}catch(e){text.textContent=e.message;}root.append(note,button,text);return;}
 try{provider.render(options);}catch(error){root.textContent='ODF 预览失败：'+error.message;return;}const old=root.odfDispose;const owner=[...providers.values()].find(item=>item.provider===provider).owner;
 const mount={owner,dispose(){mounts.delete(mount);old?.();if(root.odfDispose===mount.dispose)root.odfDispose=null;}};mounts.add(mount);root.odfDispose=mount.dispose;
}
