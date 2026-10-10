import {NS,parseOdf} from './engine.mjs';
import {packageEntries} from './package.mjs';
import {imageMime,bytesToBase64} from './images.mjs';
export const paragraphNodes=xml=>[...xml.getElementsByTagNameNS(NS.office,'body')[0].querySelectorAll('*')].filter(e=>e.namespaceURI===NS.text&&['p','h'].includes(e.localName));
const length=/^-?\d+(\.\d+)?(cm|mm|in|pt|px|em|%)$/;
const safeColor=v=>/^(#[a-f\d]{3,8}|transparent)$/i.test(v);
export function canEditParagraph(node){
 const allowed=new Set(['p','h','span','a','s','tab','line-break']);
 for(const n of [node,...node.querySelectorAll('*')]){
  if(n.namespaceURI!==NS.text||!allowed.has(n.localName))return false;
  for(const a of n.attributes){if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;if(a.namespaceURI===NS.text&&['style-name','outline-level','c'].includes(a.localName)||a.namespaceURI===NS.xlink&&['href','type'].includes(a.localName))continue;return false;}
 }return true;
}
export function odfToHtml(xml,options={}){
 if(typeof xml==='string')xml=parseOdf(xml);const entries=packageEntries(xml),body=xml.getElementsByTagNameNS(NS.office,'body')[0],paragraphs=paragraphNodes(xml),keys=new Map(paragraphs.map((p,i)=>[p,String(i)]));
 const styles=new Map(),defaults=new Map(),listStyles=new Map();
 for(const n of xml.getElementsByTagNameNS(NS.style,'style'))styles.set(n.getAttributeNS(NS.style,'family')+'|'+n.getAttributeNS(NS.style,'name'),n);
 for(const n of xml.getElementsByTagNameNS(NS.style,'default-style'))defaults.set(n.getAttributeNS(NS.style,'family'),n);
 for(const n of xml.getElementsByTagNameNS(NS.text,'list-style'))listStyles.set(n.getAttributeNS(NS.style,'name'),n);
 let rendered=0;const max=30000;
 function applyProperties(style,el){
  for(const props of style?.children||[]){const attr=(ns,name)=>props.getAttributeNS(NS[ns],name)||'';
   for(const [name,property] of [['font-weight','fontWeight'],['font-style','fontStyle']]){const value=attr('fo',name)||attr('style',name+'-asian');if(/^(bold|normal|italic|oblique|[1-9]00)$/.test(value))el.style[property]=value;}
   for(const [name,property] of [['color','color'],['background-color','backgroundColor']]){const value=attr('fo',name);if(safeColor(value))el.style[property]=value;}
   for(const [name,property] of [['font-size','fontSize'],['text-indent','textIndent'],['margin-left','marginLeft'],['margin-right','marginRight'],['margin-top','marginTop'],['margin-bottom','marginBottom'],['padding','padding'],['width','width'],['min-height','minHeight']]){const value=attr('fo',name)||attr('style',name);if(length.test(value))el.style[property]=value;}
   const align=attr('fo','text-align');if(/^(left|right|center|justify|start|end)$/.test(align))el.style.textAlign=align;
   const vertical=attr('style','vertical-align');if(/^(top|middle|bottom)$/.test(vertical))el.style.verticalAlign=vertical;
   const line=attr('fo','line-height');if(length.test(line)||line==='normal')el.style.lineHeight=line;
   const font=attr('fo','font-family');if(font&&font.length<160&&!/[;{}<>]/.test(font))el.style.fontFamily=font;
   const position=attr('style','text-position');if(/^(super|sub)/.test(position)){el.style.verticalAlign=position.startsWith('super')?'super':'sub';el.style.fontSize='smaller';}
   const decorations=[];if(attr('style','text-underline-style')&&attr('style','text-underline-style')!=='none')decorations.push('underline');if(attr('style','text-line-through-style')&&attr('style','text-line-through-style')!=='none')decorations.push('line-through');if(decorations.length)el.style.textDecoration=decorations.join(' ');
   for(const name of ['border','border-top','border-bottom','border-left','border-right']){const value=attr('fo',name);if(/^(none|\d+(\.\d+)?(pt|px|cm) (solid|dashed|dotted|double) #[a-f\d]{3,8})$/i.test(value))el.style.setProperty(name,value);}
   if(attr('fo','break-before')==='page')el.style.breakBefore='page';if(attr('fo','break-after')==='page')el.style.breakAfter='page';
  }
 }
 function styling(node,el,family){
  applyProperties(defaults.get(family),el);let name=node.getAttributeNS(NS.text,'style-name')||node.getAttributeNS(NS.table,'style-name')||node.getAttributeNS(NS.draw,'style-name'),chain=[],seen=new Set();
  while(name&&!seen.has(name)&&chain.length<32){seen.add(name);const style=styles.get(family+'|'+name);if(!style)break;chain.unshift(style);name=style.getAttributeNS(NS.style,'parent-style-name');}for(const style of chain)applyProperties(style,el);
 }
 function placeholder(label){const el=document.createElement('span');el.className='odf-protected';el.textContent=label;el.contentEditable='false';return el;}
 function image(node){const imgNode=node.getElementsByTagNameNS(NS.draw,'image')[0];if(!imgNode){const box=node.getElementsByTagNameNS(NS.draw,'text-box')[0];if(box){const el=document.createElement('section');el.className='odf-text-box';for(const c of box.childNodes)el.append(render(c));return el;}return placeholder('[嵌入对象/公式：资源已保留]');}
  const binary=imgNode.getElementsByTagNameNS(NS.office,'binary-data')[0],href=(imgNode.getAttributeNS(NS.xlink,'href')||'').replace(/^\.\//,'');
  try{const bytes=binary?Uint8Array.from(atob(binary.textContent.replace(/\s/g,'')),c=>c.charCodeAt(0)):entries?.[href];if(!bytes||bytes.length>2*1024*1024)throw Error();const type=imageMime(bytes),img=document.createElement('img');img.src='data:'+type+';base64,'+bytesToBase64(bytes);img.alt=node.getElementsByTagNameNS(NS.svg,'title')[0]?.textContent||'图片';const size=key=>{const v=node.getAttributeNS(NS.svg,key)||'',n=parseFloat(v);return v.endsWith('cm')?n*96/2.54:v.endsWith('mm')?n*96/25.4:v.endsWith('in')?n*96:v.endsWith('pt')?n*96/72:v.endsWith('px')?n:0;};for(const key of ['width','height']){const n=size(key);if(n>0)img[key]=Math.min(10000,Math.round(n));}return img;}catch{return placeholder('[外部/未支持图片：原引用保留]');}
 }
 function render(node){
  if(++rendered>max)throw Error('预览结构超过 30000 个节点，请查看源码或使用外部编辑器。');
  if(node.nodeType===3)return document.createTextNode(node.nodeValue||'');if(node.nodeType!==1)return document.createTextNode('');const ns=node.namespaceURI,name=node.localName;
  if(ns===NS.office&&['binary-data','scripts','forms'].includes(name)||ns===NS.vela)return document.createTextNode('');
  if(ns===NS.draw&&name==='frame')return image(node);
  if(ns===NS.draw&&['object','object-ole','plugin','applet'].includes(name))return placeholder('[嵌入对象：资源已保留]');
  if(ns===NS.text&&name==='s')return document.createTextNode(' '.repeat(Math.min(10000,Math.max(1,Number(node.getAttributeNS(NS.text,'c'))||1))));
  if(ns===NS.text&&name==='tab')return document.createTextNode('\t');if(ns===NS.text&&name==='line-break')return document.createElement('br');
  let tag='span',family='text';
  if(ns===NS.text){if(name==='p'){tag='p';family='paragraph';}else if(name==='h'){tag='h'+Math.max(1,Math.min(6,Number(node.getAttributeNS(NS.text,'outline-level'))||1));family='paragraph';}else if(name==='list'){const style=listStyles.get(node.getAttributeNS(NS.text,'style-name'));tag=style?.getElementsByTagNameNS(NS.text,'list-level-style-number').length?'ol':'ul';}else if(name==='list-item')tag='li';else if(name==='a')tag='a';else if(name==='note'){tag='aside';}else if(name==='section')tag='section';else if(['tracked-changes','soft-page-break','bookmark','bookmark-start','bookmark-end','change','change-start','change-end'].includes(name))return document.createTextNode('');}
  if(ns===NS.table){tag=({table:'table','table-row':'tr','table-cell':'td','covered-table-cell':'td','table-header-rows':'thead','table-rows':'tbody','table-row-group':'tbody'})[name]||'span';family=name==='table-cell'?'table-cell':'table';if(name==='table-column')return document.createTextNode('');if(name==='covered-table-cell')return document.createTextNode('');}
  if(ns===NS.draw&&name==='page')tag='section';if(ns===NS.office&&name==='annotation')tag='aside';
  const el=document.createElement(tag);styling(node,el,family);
  if(ns===NS.draw&&name==='page'){el.className='odf-slide';const h=document.createElement('h2');h.textContent=node.getAttributeNS(NS.draw,'name')||'页面';el.append(h);}
  if(tag==='a'){const href=node.getAttributeNS(NS.xlink,'href')||'';if(/^(https?:|mailto:|#)/i.test(href))el.setAttribute('href',href);el.rel='noopener noreferrer';}
  if(tag==='table'){const caption=document.createElement('caption');caption.textContent=node.getAttributeNS(NS.table,'name');el.append(caption);}
  if(tag==='td'){for(const [name,prop] of [['number-columns-spanned','colSpan'],['number-rows-spanned','rowSpan']]){const count=Number(node.getAttributeNS(NS.table,name));if(count>1&&count<=1000)el[prop]=count;}if(node.hasAttributeNS(NS.table,'formula'))el.title=node.getAttributeNS(NS.table,'formula')+'（显示缓存值，不重新计算）';}
  for(const child of node.childNodes){const repeated=child.nodeType===1&&child.namespaceURI===NS.table?(Number(child.getAttributeNS(NS.table,child.localName==='table-row'?'number-rows-repeated':'number-columns-repeated'))||1):1;const copies=Math.min(200,Math.max(1,repeated));for(let i=0;i<copies;i++)el.append(render(child));if(repeated>copies)el.append(placeholder('[重复行/列预览已截断，原数据保留]'));}
  if(tag==='td'&&!el.textContent&&!el.childElementCount)el.textContent=node.getAttributeNS(NS.office,'string-value')||node.getAttributeNS(NS.office,'value')||node.getAttributeNS(NS.office,'date-value')||node.getAttributeNS(NS.office,'boolean-value')||'';
  if(keys.has(node)){el.dataset.odfKey=keys.get(node);if(options.editing){const safe=canEditParagraph(node);el.contentEditable=String(safe);if(!safe)el.title='包含字段、注释、书签、对象或特殊属性；保留原 XML，仅阅读。';}}
  return el;
 }
 const root=document.createElement('div');
 // Header/footer are previewed once; browser is not a paginated office layout engine.
 for(const master of xml.getElementsByTagNameNS(NS.style,'master-page'))for(const n of master.children)if(n.namespaceURI===NS.style&&['header','footer'].includes(n.localName)){const section=document.createElement('aside');section.className='odf-header-footer';section.dataset.label=n.localName==='header'?'页眉':'页脚';for(const c of n.childNodes)section.append(render(c));root.append(section);}
 for(const child of body.childNodes)root.append(render(child));return root.innerHTML;
}
