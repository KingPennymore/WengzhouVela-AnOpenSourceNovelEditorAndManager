import {NS,parseOdf,htmlToOdf} from './engine.mjs';
import {paragraphNodes,canEditParagraph} from './renderer.mjs';
export function captureParagraphs(paper){return new Map([...paper.querySelectorAll('[data-odf-key]')].map(el=>[el.dataset.odfKey,el.outerHTML]));}
export function patchParagraphs(source,paper,before){
 const xml=parseOdf(source),original=paragraphNodes(xml),elements=[...paper.querySelectorAll('[data-odf-key]')],keys=elements.map(e=>e.dataset.odfKey);
 if(keys.length!==before.size||new Set(keys).size!==keys.length||keys.some((key,i)=>key!==[...before.keys()][i]))throw Error('兼容编辑不能删除、合并或重排原段落。请使用简化副本做结构编辑。');
 let auto=[...xml.documentElement.children].find(n=>n.namespaceURI===NS.office&&n.localName==='automatic-styles');if(!auto){auto=xml.createElementNS(NS.office,'office:automatic-styles');xml.documentElement.insertBefore(auto,xml.getElementsByTagNameNS(NS.office,'body')[0]);}
 let serial=0;const used=new Set([...xml.getElementsByTagNameNS(NS.style,'style')].map(e=>e.getAttributeNS(NS.style,'name')));
 for(const el of elements){if(el.outerHTML===before.get(el.dataset.odfKey))continue;const target=original[Number(el.dataset.odfKey)];if(!target||!canEditParagraph(target)||el.getAttribute('contenteditable')!=='true')throw Error('该段包含受保护内容，修改未保存。');
  // Convert this paragraph only. Keep every surrounding node and attribute.
  const converted=parseOdf(htmlToOdf(el.outerHTML)),p=paragraphNodes(converted)[0];if(!p||paragraphNodes(converted).length!==1)throw Error('请在同一原段落内编辑，结构编辑请创建简化副本。');
  const renamed=new Map();for(const style of converted.getElementsByTagNameNS(NS.style,'style')){let name;do{name='VelaEdit'+(++serial);}while(used.has(name));used.add(name);renamed.set(style.getAttributeNS(NS.style,'name'),name);style.setAttributeNS(NS.style,'style:name',name);if(style.getAttributeNS(NS.style,'family')==='paragraph'&&target.getAttributeNS(NS.text,'style-name'))style.setAttributeNS(NS.style,'style:parent-style-name',target.getAttributeNS(NS.text,'style-name'));auto.append(xml.importNode(style,true));}
  for(const node of [p,...p.querySelectorAll('*')]){const old=node.getAttributeNS(NS.text,'style-name');if(renamed.has(old))node.setAttributeNS(NS.text,'text:style-name',renamed.get(old));}
  target.replaceChildren(...[...p.childNodes].map(node=>xml.importNode(node,true)));if(p.hasAttributeNS(NS.text,'style-name'))target.setAttributeNS(NS.text,'text:style-name',p.getAttributeNS(NS.text,'style-name'));
 }
 const result=new XMLSerializer().serializeToString(xml);parseOdf(result);return result;
}
