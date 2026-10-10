import {NS,parseOdf} from './engine.mjs';
export function preserveDocumentSettings(previous,next){
 const old=parseOdf(previous),xml=parseOdf(next),root=xml.documentElement;let auto=xml.getElementsByTagNameNS(NS.office,'automatic-styles')[0];
 for(const n of [...old.documentElement.children])if(n.namespaceURI===NS.office&&['meta','settings','master-styles'].includes(n.localName))root.insertBefore(xml.importNode(n,true),xml.getElementsByTagNameNS(NS.office,'body')[0]);
 for(const n of old.getElementsByTagNameNS(NS.style,'page-layout'))if(n.parentNode.localName==='automatic-styles')auto.append(xml.importNode(n,true));
 const order=['meta','settings','scripts','font-face-decls','styles','automatic-styles','master-styles','body'];root.replaceChildren(...[...root.children].sort((a,b)=>order.indexOf(a.localName)-order.indexOf(b.localName)));return new XMLSerializer().serializeToString(xml);
}
export function configurePage(source,size,margin){
 const sizes={A4:['21cm','29.7cm'],A5:['14.8cm','21cm'],Letter:['21.59cm','27.94cm']};if(!sizes[size]||!Number.isFinite(margin)||margin<0||margin>5)throw Error('无效纸张或边距。');const xml=parseOdf(source),root=xml.documentElement;
 let auto=xml.getElementsByTagNameNS(NS.office,'automatic-styles')[0];if(!auto){auto=xml.createElementNS(NS.office,'office:automatic-styles');root.insertBefore(auto,xml.getElementsByTagNameNS(NS.office,'body')[0]);}
 let page=[...auto.children].find(n=>n.namespaceURI===NS.style&&n.localName==='page-layout'&&n.getAttributeNS(NS.style,'name')==='VelaPage');if(!page){page=xml.createElementNS(NS.style,'style:page-layout');page.setAttributeNS(NS.style,'style:name','VelaPage');auto.append(page);}page.replaceChildren();const props=xml.createElementNS(NS.style,'style:page-layout-properties');props.setAttributeNS(NS.fo,'fo:page-width',sizes[size][0]);props.setAttributeNS(NS.fo,'fo:page-height',sizes[size][1]);props.setAttributeNS(NS.fo,'fo:margin',margin+'cm');page.append(props);
 let masters=xml.getElementsByTagNameNS(NS.office,'master-styles')[0];if(!masters){masters=xml.createElementNS(NS.office,'office:master-styles');root.insertBefore(masters,xml.getElementsByTagNameNS(NS.office,'body')[0]);}let master=masters.getElementsByTagNameNS(NS.style,'master-page')[0];if(!master){master=xml.createElementNS(NS.style,'style:master-page');master.setAttributeNS(NS.style,'style:name','Standard');masters.append(master);}master.setAttributeNS(NS.style,'style:page-layout-name','VelaPage');return new XMLSerializer().serializeToString(xml);
}
