import {unzipSync,zipSync,strToU8} from 'fflate';

export const MAX_SOURCE_BYTES=8*1024*1024;
const MAX_EXPANDED=32*1024*1024,MAX_FILES=2048;
const utf8=new TextDecoder('utf-8',{fatal:true});
const NS={opf:'http://www.idpf.org/2007/opf',dc:'http://purl.org/dc/elements/1.1/',html:'http://www.w3.org/1999/xhtml'};
export const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const encode64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
export const decode64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const elements=(root,name)=>[...root.getElementsByTagNameNS('*',name)];
const first=(root,name)=>elements(root,name)[0];
export function parseXml(source){
 if(/<!ENTITY|<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC|\[)/i.test(source))throw Error('书籍包含不支持的 XML 实体。');
 const doc=new DOMParser().parseFromString(source,'application/xml');if(first(doc,'parsererror'))throw Error('书籍 XML 格式错误，请检查章节或包文件。');return doc;
}
export function relativePath(base,href){
 if(typeof href!=='string'||/^[a-z][\w+.-]*:|^\/|\\|[\x00-\x1f]/i.test(href))throw Error('书籍资源路径无效。');
 let value;try{value=decodeURIComponent(href.split(/[?#]/)[0]);}catch{throw Error('书籍资源路径编码无效。');}
 if(/^[a-z][\w+.-]*:|^\/|\\|[\x00-\x1f]/i.test(value))throw Error('书籍资源路径无效。');
 const parts=base.split('/').slice(0,-1);for(const part of value.split('/')){if(part==='..'){if(!parts.length)throw Error('书籍资源越过包根目录。');parts.pop();}else if(part&&part!=='.')parts.push(part);}return parts.join('/');
}
function archivePath(path){if(!path||path.startsWith('/')||path.includes('\\')||/[\x00-\x1f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('书籍包含无效资源路径。');return path;}
export const readText=(book,path)=>utf8.decode(decode64(book.files[path]??''));
export function writeText(book,path,text){archivePath(path);book.files[path]=encode64(strToU8(text));}
const serialize=doc=>new XMLSerializer().serializeToString(doc);
function packageInfo(book){
 const opf=parseXml(readText(book,book.packagePath)),manifest=first(opf,'manifest'),spine=first(opf,'spine');
 if(!manifest||!spine)throw Error('EPUB 缺少资源清单或阅读顺序。');
 const items=new Map(elements(manifest,'item').map(item=>[item.getAttribute('id'),{node:item,path:relativePath(book.packagePath,item.getAttribute('href')||''),type:item.getAttribute('media-type'),properties:item.getAttribute('properties')||''}]));
 return {opf,manifest,spine,items};
}
export function importEpub(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>32*1024*1024)throw Error('EPUB 文件限 32 MB。');
 let total=0,count=0;const seen=new Set();
 const files=unzipSync(bytes,{filter:file=>{if(file.name.endsWith('/'))return false;archivePath(file.name);if(seen.has(file.name))throw Error('EPUB 包含重复资源。');seen.add(file.name);total+=file.originalSize;if(++count>MAX_FILES||total>MAX_EXPANDED||file.originalSize>MAX_EXPANDED)throw Error('EPUB 展开超过 32 MB / 2048 文件。');return true;}});
 if(Object.values(files).reduce((sum,value)=>sum+value.length,0)>MAX_EXPANDED)throw Error('EPUB 展开超过 32 MB。');
 if(utf8.decode(files.mimetype||new Uint8Array()).trim()!=='application/epub+zip'||!files['META-INF/container.xml'])throw Error('不是有效的 EPUB 文件。');
 if(files['META-INF/encryption.xml'])throw Error('首版不支持加密或字体混淆的 EPUB，原书已保留。');
 const container=parseXml(utf8.decode(files['META-INF/container.xml'])),root=elements(container,'rootfile').find(node=>node.getAttribute('media-type')==='application/oebps-package+xml');
 const packagePath=relativePath('',root?.getAttribute('full-path')||'');if(!files[packagePath])throw Error('EPUB 包文件缺失。');
 const book={version:1,kind:'vela-ebook',packagePath,files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,encode64(value)])),chapters:[],metadata:{},template:'original'};
 const {opf,spine,items}=packageInfo(book),nav=[...items.values()].find(item=>item.properties.split(/\s+/).includes('nav')),labels=new Map();
 if(nav&&files[nav.path])for(const a of elements(parseXml(readText(book,nav.path)),'a')){try{labels.set(relativePath(nav.path,a.getAttribute('href')||''),a.textContent.trim());}catch{}}
 for(const ref of elements(spine,'itemref')){
  const id=ref.getAttribute('idref'),item=items.get(id);if(!item||!files[item.path])throw Error('EPUB 阅读顺序引用了缺失资源。');
  if(!['application/xhtml+xml','text/html'].includes(item.type))throw Error('首版支持 HTML 正文 EPUB，暂不支持 SVG 等固定版面正文。');
  const html=new DOMParser().parseFromString(readText(book,item.path),'text/html');
  book.chapters.push({id,path:item.path,title:labels.get(item.path)||html.querySelector('h1,h2,title')?.textContent.trim()||'第 '+(book.chapters.length+1)+' 章'});
 }
 if(!book.chapters.length)throw Error('EPUB 没有可编辑的章节。');
 book.metadata={title:first(opf,'title')?.textContent||'未命名书籍',author:elements(opf,'creator').map(n=>n.textContent).join('、'),language:first(opf,'language')?.textContent||'zh-CN',identifier:first(opf,'identifier')?.textContent||'urn:uuid:'+crypto.randomUUID(),description:first(opf,'description')?.textContent||''};
 sourceText(book);return book;
}
export function validateBook(book){
 if(!book||book.version!==1||book.kind!=='vela-ebook'||!book.files||Array.isArray(book.files)||!Array.isArray(book.chapters)||!book.chapters.length||!book.metadata||typeof book.metadata.title!=='string'||!book.metadata.title.trim())throw Error('电子书编辑源格式无效。');
 if(!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(book.metadata.language))throw Error('书籍语言代码无效，例如 zh-CN。');
 for(const field of ['author','identifier','description'])if(typeof book.metadata[field]!=='string')throw Error('电子书元数据无效。');
 let total=0;const names=Object.keys(book.files);if(names.length>MAX_FILES)throw Error('电子书资源过多。');
 for(const name of names){archivePath(name);const value=book.files[name];if(typeof value!=='string'||value.length>MAX_EXPANDED*4/3+4||value.length%4||/[^A-Za-z0-9+/]/.test(value.replace(/={1,2}$/,'')))throw Error('电子书资源数据无效。');total+=value.length;if(total>MAX_EXPANDED*4/3+MAX_FILES*4)throw Error('电子书资源超过大小限制。');}
 if(!Object.hasOwn(book.files,archivePath(book.packagePath)))throw Error('电子书包文件缺失。');
 const ids=new Set(),paths=new Set();for(const chapter of book.chapters){if(typeof chapter.id!=='string'||!chapter.id||typeof chapter.title!=='string'||!Object.hasOwn(book.files,archivePath(chapter.path))||ids.has(chapter.id)||paths.has(chapter.path))throw Error('章节引用无效或重复。');ids.add(chapter.id);paths.add(chapter.path);}
 if(book.drafts!==undefined){if(!book.drafts||Array.isArray(book.drafts)||typeof book.drafts!=='object')throw Error('章节草稿无效。');for(const [path,text] of Object.entries(book.drafts))if(!Object.hasOwn(book.files,path)||typeof text!=='string')throw Error('章节草稿引用无效。');}
 if(!Object.hasOwn(TEMPLATES,book.template))throw Error('排版模板无效。');return book;
}
export function sourceText(book){validateBook(book);const text=JSON.stringify(book);if(strToU8(text).length>MAX_SOURCE_BYTES)throw Error('此书的编辑源超过宿主 8 MB 限制，请先缩小图片或拆分书籍。');return text;}
export function parseBook(source){if(typeof source!=='string'||strToU8(source).length>MAX_SOURCE_BYTES)throw Error('编辑源超过 8 MB。');return validateBook(JSON.parse(source));}
export const TEMPLATES={original:{name:'保留原书',css:''},novel:{name:'中文小说',css:'body{font-family:serif;line-height:1.85;text-align:justify}p{text-indent:2em;margin:.35em 0}h1,h2,h3{text-align:center;text-indent:0;break-after:avoid}img{max-width:100%;height:auto}'},compact:{name:'紧凑阅读',css:'body{font-family:sans-serif;line-height:1.6}p{margin:.3em 0;text-indent:2em}h1,h2,h3{break-after:avoid}img{max-width:100%;height:auto}'},print:{name:'纸书预览',css:'@page{size:A5;margin:18mm 15mm;@bottom-center{content:counter(page)}}body{font-family:serif;line-height:1.8;font-size:11pt}p{text-indent:2em;orphans:2;widows:2}h1,h2{break-before:page;text-align:center;break-after:avoid}img{max-width:100%;height:auto}'}};
export function chapterBody(book,chapter){return new DOMParser().parseFromString(readText(book,chapter.path),'text/html').body.innerHTML;}
export function setChapterBody(book,chapter,body){
 const doc=parseXml(readText(book,chapter.path)),target=first(doc,'body');if(!target)throw Error('章节缺少 body。');
 const namespaces=new Map([['xmlns',NS.html]]);for(const node of [doc.documentElement,target])for(const attr of node.attributes)if(attr.name==='xmlns'||attr.name.startsWith('xmlns:'))namespaces.set(attr.name,attr.value);
 const fragment=parseXml('<body '+[...namespaces].map(([key,value])=>key+'="'+escape(value)+'"').join(' ')+'>'+body+'</body>');target.replaceChildren(...[...fragment.documentElement.childNodes].map(node=>doc.importNode(node,true)));writeText(book,chapter.path,serialize(doc));
}
export function plainText(book){return book.chapters.map(chapter=>{const doc=new DOMParser().parseFromString(readText(book,chapter.path),'text/html');doc.querySelectorAll('script,style').forEach(n=>n.remove());return doc.body.textContent;}).join('\n\n');}
function hrefFrom(base,path){const from=base.split('/').slice(0,-1),to=path.split('/');while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}return [...from.map(()=> '..'),...to.map(encodeURIComponent)].join('/');}
export function addChapter(book,title='新章节'){
 const {opf,manifest,spine}=packageInfo(book),id='vela-'+crypto.randomUUID(),path=relativePath(book.packagePath,'text/'+id+'.xhtml');
 writeText(book,path,'<?xml version="1.0" encoding="utf-8"?><html xmlns="'+NS.html+'"><head><title>'+escape(title)+'</title></head><body><h1>'+escape(title)+'</h1><p>正文</p></body></html>');
 const item=opf.createElementNS(NS.opf,'item');item.setAttribute('id',id);item.setAttribute('href',hrefFrom(book.packagePath,path));item.setAttribute('media-type','application/xhtml+xml');manifest.append(item);
 const ref=opf.createElementNS(NS.opf,'itemref');ref.setAttribute('idref',id);spine.append(ref);writeText(book,book.packagePath,serialize(opf));const chapter={id,path,title};book.chapters.push(chapter);return chapter;
}
export function removeChapter(book,index){if(book.chapters.length<2)throw Error('至少保留一个章节。');book.chapters.splice(index,1);}
function updatePackage(book){
 const {opf,spine,items,manifest}=packageInfo(book),metadata=first(opf,'metadata');if(!metadata)throw Error('EPUB 缺少元数据。');
 for(const [name,key] of [['title','title'],['creator','author'],['language','language'],['description','description']]){if(name==='creator'&&elements(metadata,name).map(node=>node.textContent).join('、')===book.metadata.author)continue;let node=elements(metadata,name)[0];if(!node){node=opf.createElementNS(NS.dc,'dc:'+name);metadata.append(node);}node.textContent=book.metadata[key];if(name==='creator')for(const extra of elements(metadata,name).slice(1))extra.remove();}
 let identifier=elements(metadata,'identifier').find(n=>n.getAttribute('id')===opf.documentElement.getAttribute('unique-identifier'));if(!identifier){identifier=opf.createElementNS(NS.dc,'dc:identifier');identifier.setAttribute('id','vela-book-id');metadata.append(identifier);opf.documentElement.setAttribute('unique-identifier','vela-book-id');}identifier.textContent=book.metadata.identifier;
 let modified=elements(metadata,'meta').find(n=>n.getAttribute('property')==='dcterms:modified');if(opf.documentElement.getAttribute('version')?.startsWith('3')){if(!modified){modified=opf.createElementNS(NS.opf,'meta');modified.setAttribute('property','dcterms:modified');metadata.append(modified);}modified.textContent=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');}
 const refs=new Map(elements(spine,'itemref').map(ref=>[ref.getAttribute('idref'),ref]));spine.replaceChildren(...book.chapters.map(chapter=>{const ref=refs.get(chapter.id);if(!ref||!items.has(chapter.id))throw Error('章节资源与阅读顺序不一致。');return ref;}));
 if(book.template!=='original'){
  const stylePath=relativePath(book.packagePath,'styles/vela-layout.css');writeText(book,stylePath,TEMPLATES[book.template].css);
  if(![...items.values()].some(item=>item.path===stylePath)){const item=opf.createElementNS(NS.opf,'item');item.setAttribute('id','vela-layout');item.setAttribute('href',hrefFrom(book.packagePath,stylePath));item.setAttribute('media-type','text/css');manifest.append(item);}
  for(const chapter of book.chapters){const doc=parseXml(readText(book,chapter.path)),head=first(doc,'head');if(!head)throw Error('章节缺少 head。');let link=elements(head,'link').find(node=>node.getAttribute('id')==='vela-layout-link');if(!link){link=doc.createElementNS(NS.html,'link');link.setAttribute('rel','stylesheet');link.setAttribute('type','text/css');link.setAttribute('id','vela-layout-link');head.append(link);}link.setAttribute('href',hrefFrom(chapter.path,stylePath));writeText(book,chapter.path,serialize(doc));}
 }else{
  for(const chapter of book.chapters){const doc=parseXml(readText(book,chapter.path)),links=elements(doc,'link').filter(node=>node.getAttribute('id')==='vela-layout-link');if(links.length){links.forEach(node=>node.remove());writeText(book,chapter.path,serialize(doc));}}
 }
 const nav=[...items.values()].find(item=>item.properties.split(/\s+/).includes('nav'));
 if(nav&&book.navigationDirty){const doc=parseXml(readText(book,nav.path)),node=elements(doc,'nav').find(n=>(n.getAttributeNS('http://www.idpf.org/2007/ops','type')||n.getAttribute('epub:type')||'').split(/\s+/).includes('toc'));if(node){node.replaceChildren(doc.importNode(parseXml('<ol xmlns="'+NS.html+'">'+book.chapters.map(c=>'<li><a href="'+escape(hrefFrom(nav.path,c.path))+'">'+escape(c.title)+'</a></li>').join('')+'</ol>').documentElement,true));writeText(book,nav.path,serialize(doc));}}
 const ncx=items.get(spine.getAttribute('toc'));if(ncx&&book.files[ncx.path]&&book.navigationDirty){const doc=parseXml(readText(book,ncx.path)),map=first(doc,'navMap');if(map){map.replaceChildren(...book.chapters.map((c,i)=>doc.importNode(parseXml('<navPoint xmlns="http://www.daisy.org/z3986/2005/ncx/" id="vela-nav-'+i+'" playOrder="'+(i+1)+'"><navLabel><text>'+escape(c.title)+'</text></navLabel><content src="'+escape(hrefFrom(ncx.path,c.path))+'"/></navPoint>').documentElement,true)));writeText(book,ncx.path,serialize(doc));}}
 writeText(book,book.packagePath,serialize(opf));
}
export function exportEpub(book){
 book=structuredClone(validateBook(book));if(Object.keys(book.drafts||{}).length)throw Error('请先修正并保存章节草稿，再导出 EPUB。');for(const chapter of book.chapters)parseXml(readText(book,chapter.path));updatePackage(book);
 const files={mimetype:[strToU8('application/epub+zip'),{level:0}]};for(const [name,data] of Object.entries(book.files))if(name!=='mimetype')files[name]=decode64(data);
 return zipSync(files,{level:6});
}
export function imageMime(path){return /\.png$/i.test(path)?'image/png':/\.jpe?g$/i.test(path)?'image/jpeg':/\.gif$/i.test(path)?'image/gif':/\.webp$/i.test(path)?'image/webp':/\.svg$/i.test(path)?'image/svg+xml':/\.woff2?$/i.test(path)?'font/woff2':/\.otf$/i.test(path)?'font/otf':/\.ttf$/i.test(path)?'font/ttf':'application/octet-stream';}
export function previewChapter(book,chapter,{urls=new Map(),createUrl}={}){
 const doc=new DOMParser().parseFromString(readText(book,chapter.path),'text/html');
 doc.querySelectorAll('script,iframe,object,embed,form,input,button,meta,base,link:not([rel="stylesheet"])').forEach(node=>node.remove());
 const resource=(base,href)=>{try{const path=relativePath(base,href);if(!Object.hasOwn(book.files,path))return '';if(!urls.has(path))urls.set(path,createUrl?createUrl(new Blob([decode64(book.files[path])],{type:imageMime(path)})):'data:'+imageMime(path)+';base64,'+book.files[path]);return urls.get(path);}catch{return '';}};
 const css=(text,path)=>text.replace(/@import\s+[^;]+;?/gi,'').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_all,_q,href)=>'url("'+resource(path,href)+'")');
 let styles='';for(const link of doc.querySelectorAll('link')){try{const path=relativePath(chapter.path,link.getAttribute('href')||'');if(book.files[path])styles+=css(readText(book,path),path)+'\n';}catch{}link.remove();}for(const style of doc.querySelectorAll('style')){styles+=css(style.textContent,chapter.path)+'\n';style.remove();}
 for(const node of doc.querySelectorAll('*')){for(const attr of [...node.attributes]){if(/^on/i.test(attr.name)||['srcdoc','srcset','action','formaction','xlink:href'].includes(attr.name))node.removeAttribute(attr.name);else if(attr.name==='style')node.setAttribute('style',css(attr.value,chapter.path));}if(node.hasAttribute('src')){const value=resource(chapter.path,node.getAttribute('src'));if(value)node.setAttribute('src',value);else node.removeAttribute('src');}if(node.hasAttribute('href'))node.removeAttribute('href');}
 styles+=TEMPLATES[book.template].css;return {html:doc.body.innerHTML,css:styles,urls};
}
export function previewDocument(book,chapter,options){const {html,css}=previewChapter(book,chapter,options);return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; font-src blob: data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;overflow-wrap:anywhere}img{max-width:100%}'+css.replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+html+'</body></html>';}
export function readingHtml(book){return book.chapters.map(c=>{const {html}=previewChapter(book,c,{createUrl:()=>''});return '<section>'+html+'</section>';}).join('\n');}
export function mobiPayload(book){
 const assets=[],names=new Map();for(const [path,data] of Object.entries(book.files))if(/\.(png|jpe?g|gif)$/i.test(path)){const name='image-'+assets.length+path.slice(path.lastIndexOf('.'));names.set(path,name);assets.push({name,data});}
 const chapters=book.chapters.map(chapter=>{const doc=new DOMParser().parseFromString(chapterBody(book,chapter),'text/html');doc.querySelectorAll('script,style,iframe,object,embed,link').forEach(n=>n.remove());for(const image of doc.querySelectorAll('img')){let name;try{name=names.get(relativePath(chapter.path,image.getAttribute('src')||''));}catch{}if(name)image.setAttribute('src',name);else image.remove();}return {title:chapter.title,html:doc.body.innerHTML};});
 const {items}=packageInfo(book),cover=[...items.values()].find(item=>item.properties.split(/\s+/).includes('cover-image'));
 return {...book.metadata,chapters,assets,cover:cover&&/\.(png|jpe?g|gif)$/i.test(cover.path)?book.files[cover.path]:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='};
}
