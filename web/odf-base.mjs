// Core fallback contains no renderer, image pipeline or ZIP converter.
export const OFFICE_NS='urn:oasis:names:tc:opendocument:xmlns:office:1.0';
export const TEXT_NS='urn:oasis:names:tc:opendocument:xmlns:text:1.0';
export function parseFlatOdf(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>8*1024*1024)throw Error('文档超过 8 MB。');
 if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('不允许 XML 外部实体或 DTD。');
 const xml=new DOMParser().parseFromString(source,'application/xml');
 if(xml.querySelector('parsererror')||xml.documentElement.namespaceURI!==OFFICE_NS||!['document','document-content'].includes(xml.documentElement.localName)||!xml.getElementsByTagNameNS(OFFICE_NS,'body').length)throw Error('ODF XML 格式错误。');
 const stack=[[xml.documentElement,0]];let count=0;while(stack.length){const [node,depth]=stack.pop();if(depth>80||++count>100000)throw Error('ODF XML 结构超出限制。');for(const child of node.children)stack.push([child,depth+1]);}return xml;
}
export function flatOdfText(source){
 const xml=parseFlatOdf(source),body=xml.getElementsByTagNameNS(OFFICE_NS,'body')[0];
 const visit=n=>{if(n.nodeType===3)return n.nodeValue||'';if(n.namespaceURI===OFFICE_NS&&['binary-data','scripts'].includes(n.localName))return '';if(n.namespaceURI===TEXT_NS){if(n.localName==='s')return ' '.repeat(Math.min(10000,Math.max(1,Number(n.getAttributeNS(TEXT_NS,'c'))||1)));if(n.localName==='tab')return '\t';if(n.localName==='line-break')return '\n';}if(n.localName==='frame')return '[图片/对象]';return [...n.childNodes].map(visit).join('');};
 return [...body.getElementsByTagNameNS(TEXT_NS,'p'),...body.getElementsByTagNameNS(TEXT_NS,'h')].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1).map(visit).join('\n');
}
export const NS={draw:'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',svg:'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',office:'urn:oasis:names:tc:opendocument:xmlns:office:1.0',text:'urn:oasis:names:tc:opendocument:xmlns:text:1.0',style:'urn:oasis:names:tc:opendocument:xmlns:style:1.0',fo:'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',table:'urn:oasis:names:tc:opendocument:xmlns:table:1.0',xlink:'http://www.w3.org/1999/xlink',vela:'urn:wenzhou:velaodt:1'};
const mime='application/vnd.oasis.opendocument.text';
export const xmlEscape=s=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'\ufffd').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const namespaces=Object.entries(NS).map(([k,v])=>`xmlns:${k}="${v}"`).join(' ');
export function createVelaOdt(headings=[]){return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document ${namespaces} office:version="1.3" office:mimetype="${mime}" vela:profile="1"><office:styles/><office:automatic-styles/><office:body><office:text>${headings.length?headings.map(h=>`<text:h text:outline-level="1">${xmlEscape(h)}</text:h><text:p/>`).join(''):'<text:p/>'}</office:text></office:body></office:document>\n`;}
