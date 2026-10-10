import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {NS,parseOdf,createVelaOdt,xmlEscape} from './engine.mjs';
import {bytesToBase64,imageMime} from './images.mjs';
const MANIFEST='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';
export const ODF_MIMES={odt:'application/vnd.oasis.opendocument.text',ott:'application/vnd.oasis.opendocument.text-template',ods:'application/vnd.oasis.opendocument.spreadsheet',ots:'application/vnd.oasis.opendocument.spreadsheet-template',odp:'application/vnd.oasis.opendocument.presentation',otp:'application/vnd.oasis.opendocument.presentation-template',odg:'application/vnd.oasis.opendocument.graphics',otg:'application/vnd.oasis.opendocument.graphics-template'};
const XML_PARTS=['content.xml','styles.xml','meta.xml','settings.xml'];
const serialize=xml=>new XMLSerializer().serializeToString(xml);
const decode=s=>Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0));
export function safePackagePath(name){if(!name||name.startsWith('/')||name.includes('\\')||/[\x00-\x1f]/.test(name)||name.replace(/\/$/,'').split('/').some(s=>!s||s==='.'||s==='..'))throw Error('ODF 包含无效附件路径。');return name;}
function xmlPart(bytes){const source=strFromU8(bytes);if(source.length>8*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('ODF XML 超出限制或含 DTD/实体。');const xml=new DOMParser().parseFromString(source,'application/xml');if(xml.querySelector('parsererror'))throw Error('ODF XML 损坏。');return xml;}
function validateEntries(entries){
 const type=entries.mimetype&&strFromU8(entries.mimetype);if(!Object.values(ODF_MIMES).includes(type)||!entries['content.xml']||!entries['META-INF/manifest.xml'])throw Error('不是支持的 ODF 文档包，或缺少 content.xml / manifest.xml。');
 const manifest=xmlPart(entries['META-INF/manifest.xml']);if(manifest.documentElement.namespaceURI!==MANIFEST||manifest.getElementsByTagNameNS(MANIFEST,'encryption-data').length||manifest.getElementsByTagNameNS(MANIFEST,'encrypted-key').length)throw Error('不支持加密 ODF；请先使用原编辑器解密。');
 const root=[...manifest.getElementsByTagNameNS(MANIFEST,'file-entry')].find(e=>e.getAttributeNS(MANIFEST,'full-path')==='/');if(!root||root.getAttributeNS(MANIFEST,'media-type')!==type)throw Error('ODF 清单与 mimetype 不一致。');return type;
}
function flatFromEntries(entries){
 const type=validateEntries(entries),content=xmlPart(entries['content.xml']);parseOdf(serialize(content));const expected=type.replace('application/vnd.oasis.opendocument.','').replace('-template',''),body=content.getElementsByTagNameNS(NS.office,'body')[0];if(![...body.children].some(n=>n.namespaceURI===NS.office&&n.localName===(expected==='graphics'?'drawing':expected)))throw Error('ODF 正文结构与 mimetype 不一致。');
 const flat=parseOdf(createVelaOdt());flat.documentElement.removeAttributeNS(NS.vela,'profile');flat.documentElement.setAttributeNS(NS.office,'office:mimetype',type);flat.documentElement.setAttributeNS(NS.office,'office:version',content.documentElement.getAttributeNS(NS.office,'version')||'1.3');flat.documentElement.replaceChildren();
 for(const name of ['styles.xml','content.xml','meta.xml','settings.xml'])if(entries[name]){const part=xmlPart(entries[name]);for(const child of part.documentElement.children){const clone=flat.importNode(child,true);if(['automatic-styles','font-face-decls'].includes(child.localName))for(const n of clone.children)n.setAttributeNS(NS.vela,'vela:origin',name);flat.documentElement.append(clone);}}
 for(const name of ['automatic-styles','font-face-decls']){const siblings=[...flat.documentElement.children].filter(e=>e.namespaceURI===NS.office&&e.localName===name);for(const extra of siblings.slice(1)){siblings[0].append(...extra.childNodes);extra.remove();}}
 const order=['meta','settings','scripts','font-face-decls','styles','automatic-styles','master-styles','body'];flat.documentElement.replaceChildren(...[...flat.documentElement.children].sort((a,b)=>order.indexOf(a.localName)-order.indexOf(b.localName)));return flat;
}
export function odfToFlat(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>8*1024*1024)throw Error('ODF 安装文档限制为 8 MB。');let total=0,count=0;const seen=new Set();
 const entries=unzipSync(bytes,{filter:file=>{safePackagePath(file.name);if(seen.has(file.name))throw Error('ODF 包含重复附件路径。');seen.add(file.name);if(++count>2048||(total+=file.originalSize)>32*1024*1024)throw Error('ODF 解压内容超过 32 MB / 2048 个文件。');return !file.name.endsWith('/');}});
 const flat=flatFromEntries(entries),envelope=flat.createElementNS(NS.vela,'vela:package');
 // Preserve every entry, including charts, objects, fonts, scripts and manifests.
 // They remain inert: the renderer never executes or dereferences these bytes.
 for(const [name,bytes] of Object.entries(entries)){const entry=flat.createElementNS(NS.vela,'vela:entry');entry.setAttribute('path',name);entry.textContent=bytesToBase64(bytes);envelope.append(entry);}
 flat.documentElement.append(envelope);const source=serialize(flat);parseOdf(source);return source;
}
export const odtToFlat=odfToFlat;
export function packageEntries(xml){
 const envelope=[...xml.documentElement.children].find(e=>e.namespaceURI===NS.vela&&e.localName==='package');if(!envelope)return null;const entries={};let total=0;
 if(envelope.children.length>2048)throw Error('ODF 附件过多。');for(const entry of envelope.children){if(entry.namespaceURI!==NS.vela||entry.localName!=='entry')throw Error('ODF 附件容器损坏。');const name=safePackagePath(entry.getAttribute('path'));if(Object.hasOwn(entries,name)||entry.textContent.length>44*1024*1024)throw Error('ODF 附件容器损坏或过大。');const bytes=decode(entry.textContent);total+=bytes.length;if(total>32*1024*1024)throw Error('ODF 附件超过 32 MB。');entries[name]=bytes;}validateEntries(entries);return entries;
}
export function packageInfo(source){const xml=typeof source==='string'?parseOdf(source):source,entries=packageEntries(xml),type=xml.documentElement.getAttributeNS(NS.office,'mimetype')||ODF_MIMES.odt;return {mime:type,extension:Object.keys(ODF_MIMES).find(ext=>ODF_MIMES[ext]===type)||'odt',resources:entries?Object.keys(entries).filter(n=>!XML_PARTS.includes(n)&&!['mimetype','META-INF/manifest.xml'].includes(n)):[],signed:!!entries&&Object.keys(entries).some(n=>/^META-INF\/.*signatures\.xml$/i.test(n))};}
function canonical(node){
 if(node.nodeType===9)return canonical(node.documentElement);
 if(node.nodeType!==1)return [node.nodeType,node.nodeValue];
 return [node.namespaceURI,node.localName,[...node.attributes].filter(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/').map(a=>[a.namespaceURI||'',a.localName,a.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),[...node.childNodes].map(canonical)];
}
function withoutEnvelope(xml){const copy=xml.cloneNode(true);for(const n of [...copy.documentElement.children])if(n.namespaceURI===NS.vela&&n.localName==='package')n.remove();return copy;}
function makePart(flat,name,children,original){
 const part=original?xmlPart(original):flat.implementation.createDocument(NS.office,'office:document-'+name,null);part.documentElement.setAttributeNS(NS.office,'office:version',flat.documentElement.getAttributeNS(NS.office,'version')||'1.3');part.documentElement.replaceChildren(...children.map(n=>part.importNode(n,true)));for(const n of part.querySelectorAll('*'))n.removeAttributeNS(NS.vela,'origin');return strToU8(serialize(part));
}
export function flatToOdfPackage(source){
 const xml=parseOdf(source),original=packageEntries(xml),info=packageInfo(xml),flat=withoutEnvelope(xml);let entries=original?{...original}:{mimetype:strToU8(info.mime)};
 if(original){const baseline=flatFromEntries(original);if(JSON.stringify(canonical(baseline))===JSON.stringify(canonical(flat)))return packageZip(entries);if(info.signed)throw Error('该文档带有数字签名，修改会使签名失效。请使用原编辑器移除签名后重新导入。');}
 // Preserve all package resources and original style-part ownership. New automatic
 // styles go into content.xml; master styles, metadata and settings retain their parts.
 const children=[...flat.documentElement.children],find=name=>children.filter(n=>n.namespaceURI===NS.office&&n.localName===name),autos=find('automatic-styles')[0];
 const styleOriginal=original?.['styles.xml']&&xmlPart(original['styles.xml']);const styleAuto=styleOriginal?.getElementsByTagNameNS(NS.office,'automatic-styles')[0];
 const styleKeys=new Set([...(styleAuto?.children||[])].map(n=>n.namespaceURI+'|'+n.localName+'|'+n.getAttributeNS(NS.style,'name')));
 let contentAuto=autos?.cloneNode(true),exportStyleAuto=autos?.cloneNode(true);
 if(contentAuto)for(const n of [...contentAuto.children])if(n.getAttributeNS(NS.vela,'origin')==='styles.xml'||!n.hasAttributeNS(NS.vela,'origin')&&n.namespaceURI===NS.style&&n.localName==='page-layout')n.remove();
 if(exportStyleAuto)for(const n of [...exportStyleAuto.children])if(n.getAttributeNS(NS.vela,'origin')!=='styles.xml'&&!(!n.hasAttributeNS(NS.vela,'origin')&&n.namespaceURI===NS.style&&n.localName==='page-layout'))n.remove();
 entries['content.xml']=makePart(flat,'content',[...find('scripts'),...find('font-face-decls'),...(contentAuto?[contentAuto]:[]),...find('body')],original?.['content.xml']);
 entries['styles.xml']=makePart(flat,'styles',[...find('font-face-decls'),...find('styles'),...(exportStyleAuto?[exportStyleAuto]:[]),...find('master-styles')],original?.['styles.xml']);
 for(const name of ['meta','settings'])if(find(name).length)entries[name+'.xml']=makePart(flat,name,find(name),original?.[name+'.xml']);
 const manifest=original?xmlPart(original['META-INF/manifest.xml']):new DOMParser().parseFromString(`<manifest:manifest xmlns:manifest="${MANIFEST}" manifest:version="1.3"/>`,'application/xml');
 const ensure=(name,type)=>{let entry=[...manifest.getElementsByTagNameNS(MANIFEST,'file-entry')].find(e=>e.getAttributeNS(MANIFEST,'full-path')===name);if(!entry){entry=manifest.createElementNS(MANIFEST,'manifest:file-entry');manifest.documentElement.append(entry);}entry.setAttributeNS(MANIFEST,'manifest:full-path',name);entry.setAttributeNS(MANIFEST,'manifest:media-type',type);};ensure('/',info.mime);
 let number=0;for(const image of flat.getElementsByTagNameNS(NS.draw,'image')){const binary=image.getElementsByTagNameNS(NS.office,'binary-data')[0];if(!binary)continue;const bytes=decode(binary.textContent),type=imageMime(bytes);if(bytes.length>2*1024*1024)throw Error('单张图片超过 2 MB。');let path;do{path='Pictures/image'+(++number)+'.'+({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[type]);}while(entries[path]);entries[path]=bytes;image.setAttributeNS(NS.xlink,'xlink:href',path);image.setAttributeNS(NS.xlink,'xlink:type','simple');binary.remove();ensure(path,type);}
 // Rebuild content after assigning package paths to newly embedded images.
 if(number){entries['styles.xml']=makePart(flat,'styles',[...find('font-face-decls'),...find('styles'),...(exportStyleAuto?[exportStyleAuto]:[]),...find('master-styles')],original?.['styles.xml']);entries['content.xml']=makePart(flat,'content',[...find('scripts'),...find('font-face-decls'),...(contentAuto?[contentAuto]:[]),...find('body')],original?.['content.xml']);}
 for(const name of XML_PARTS)if(entries[name])ensure(name,'text/xml');entries['META-INF/manifest.xml']=strToU8(serialize(manifest));return packageZip(entries);
}
function packageZip(entries){return zipSync({mimetype:[entries.mimetype,{level:0}],...Object.fromEntries(Object.entries(entries).filter(([n])=>n!=='mimetype'))},{level:6});}
export const flatToOdt=flatToOdfPackage;
export function exportFlatOdf(source){
 const xml=parseOdf(source),entries=packageEntries(xml);if(entries){const unsupported=Object.keys(entries).filter(name=>!XML_PARTS.includes(name)&&!['mimetype','META-INF/manifest.xml'].includes(name)&&!name.startsWith('Pictures/')&&!name.startsWith('Thumbnails/'));if(unsupported.length)throw Error('该文档含嵌入对象、字体、签名或其他包附件，标准 Flat ODF 无法完整承载。请导出原格式包或 VODT 保存全部资源。');
 for(const image of xml.getElementsByTagNameNS(NS.draw,'image')){const href=(image.getAttributeNS(NS.xlink,'href')||'').replace(/^\.\//,'');if(!href||!entries[href])continue;const binary=xml.createElementNS(NS.office,'office:binary-data');binary.textContent=bytesToBase64(entries[href]);image.append(binary);for(const n of ['href','type','show','actuate'])image.removeAttributeNS(NS.xlink,n);}}
 for(const n of [...xml.documentElement.children])if(n.namespaceURI===NS.vela&&n.localName==='package')n.remove();for(const n of xml.querySelectorAll('*'))n.removeAttributeNS(NS.vela,'origin');xml.documentElement.removeAttributeNS(NS.vela,'profile');return serialize(xml);
}
