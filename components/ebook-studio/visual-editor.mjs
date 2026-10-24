import {Editor,Extension,Node,Mark} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {parseXml,readText,relativePath,imageMime,escape} from './engine.mjs';

// The editable view contains only our own semantic DOM. Original EPUB attributes,
// resource paths and unsupported XML live in the model, never in the host DOM.
const XHTML='http://www.w3.org/1999/xhtml';
const blocks={p:'paragraph',h1:'heading',h2:'heading',h3:'heading',h4:'heading',h5:'heading',h6:'heading',blockquote:'blockquote',ul:'bulletList',ol:'orderedList',li:'listItem',hr:'horizontalRule'};
const marks={strong:'bold',b:'bold',em:'italic',i:'italic',u:'underline',s:'strike',strike:'strike',del:'strike',code:'code',a:'ebookLink',span:'ebookSpan',sub:'ebookSub',sup:'ebookSup'};
const containers=new Set(['div','section','article','aside','figure','figcaption']);
const attrsOf=node=>Object.fromEntries([...node.attributes].map(a=>[a.name,a.value]));
const xml=node=>new XMLSerializer().serializeToString(node);
const metadata=(tag,attributes)=>({ebookTag:tag,ebookAttrs:attributes});
const hidden=defaultValue=>({default:defaultValue,rendered:false,parseHTML:()=>defaultValue});
const inlineTags=new Set([...Object.keys(marks),'br','img','ruby','rt','rp','small','abbr','q','cite','time','wbr']);
const protectedNode=(node,inline)=>({type:inline?'ebookInline':'ebookBlock',attrs:{raw:xml(node),label:node.nodeType===1?node.localName:'XML',summary:(node.textContent||'').trim().slice(0,100)}});

function inlineChildren(parent,active=[]){
 const out=[];
 for(const node of parent.childNodes){
  if(node.nodeType===3){if(node.nodeValue)out.push({type:'text',text:node.nodeValue,...(active.length?{marks:active}:{})});continue;}
  if(node.nodeType!==1||node.namespaceURI!==XHTML){out.push(protectedNode(node,true));continue;}
  const tag=node.localName,attrs=attrsOf(node);
  if(marks[tag]&&!active.some(mark=>mark.type===marks[tag])&&[...node.children].every(child=>inlineTags.has(child.localName))){out.push(...inlineChildren(node,[...active,{type:marks[tag],attrs:metadata(tag,attrs)}]));}
  else if(tag==='br')out.push({type:'hardBreak',attrs:metadata(tag,attrs),...(active.length?{marks:active}:{})});
  else if(tag==='img')out.push({type:'ebookImage',attrs:metadata(tag,attrs),...(active.length?{marks:active}:{})});
  else out.push({...protectedNode(node,true),...(active.length?{marks:active}:{})});
 }
 return out;
}
function blockNode(node){
 if(node.nodeType===3)return node.nodeValue.trim()?{type:'paragraph',content:[{type:'text',text:node.nodeValue}]}:null;
 if(node.nodeType!==1||node.namespaceURI!==XHTML)return protectedNode(node,false);
 const tag=node.localName,attrs=attrsOf(node),type=blocks[tag];
 if(type==='paragraph'||type==='heading'){
  if([...node.children].some(child=>!inlineTags.has(child.localName)))return protectedNode(node,false);
  return {type,attrs:{...metadata(tag,attrs),...(type==='heading'?{level:Number(tag[1])}:{})},content:inlineChildren(node)};
 }
 if(tag==='hr')return {type,attrs:metadata(tag,attrs)};
 if(tag==='img')return {type:'ebookImageBlock',attrs:metadata(tag,attrs)};
 if(type||containers.has(tag)){
  if([...node.childNodes].some(child=>child.nodeType===3&&child.nodeValue.trim()))return protectedNode(node,false);
  const content=[...node.childNodes].map(blockNode).filter(Boolean);
  if(!content.length||type==='listItem'&&content[0].type!=='paragraph'||['bulletList','orderedList'].includes(type)&&content.some(child=>child.type!=='listItem'))return protectedNode(node,false);
  return {type:type||'ebookContainer',attrs:{...metadata(tag,attrs),...(type==='orderedList'?{start:Number(attrs.start)||1}:{})},content};
 }
 return protectedNode(node,false);
}
export function chapterVisualJson(book,chapter){
 const doc=parseXml(readText(book,chapter.path)),body=[...doc.getElementsByTagNameNS('*','body')][0];
 if(!body)throw Error('章节缺少 body。');
 return {type:'doc',content:[...body.childNodes].map(blockNode).filter(Boolean)};
}

const defaultTags={paragraph:'p',heading:'h1',blockquote:'blockquote',bulletList:'ul',orderedList:'ol',listItem:'li',horizontalRule:'hr',hardBreak:'br',ebookImage:'img',ebookImageBlock:'img',ebookContainer:'div',bold:'strong',italic:'em',underline:'u',strike:'s',code:'code',ebookLink:'a',ebookSpan:'span',ebookSub:'sub',ebookSup:'sup'};
function tagFor(node){if(node.type==='heading')return 'h'+node.attrs.level;const original=node.attrs?.ebookTag;return (node.type==='ebookContainer'&&containers.has(original)||blocks[original]===node.type||marks[original]===node.type)?original:defaultTags[node.type];}
function element(node,content){
 const tag=tagFor(node);if(!tag)throw Error('不支持的编辑节点：'+node.type);
 const attrs={...(node.attrs?.ebookAttrs||{})};
 if(node.type==='orderedList'){if(node.attrs.start!==1)attrs.start=String(node.attrs.start);else delete attrs.start;}
 const attributes=Object.entries(attrs).map(([key,value])=>' '+key+'="'+escape(value)+'"').join('');
 return '<'+tag+attributes+(['img','br','hr'].includes(tag)?' />':('>'+content+'</'+tag+'>'));
}
export function visualXhtml(json){
 const visit=node=>{
  let text;if(node.type==='text')text=escape(node.text);else if(node.type==='ebookBlock'||node.type==='ebookInline')text=node.attrs.raw;else if(node.type==='doc')text=(node.content||[]).map(visit).join('');else text=element(node,(node.content||[]).map(visit).join(''));
  for(const mark of [...(node.marks||[])].reverse())text=element(mark,text);return text;
 };
 return visit(json);
}

export function createVisualEditor({element,book,chapter,onUpdate,onSave,onError,onSelection}){
 const metadataTypes=[...new Set([...Object.values(blocks),...Object.values(marks),'hardBreak','ebookImage','ebookImageBlock','ebookContainer'])];
 const preservation=Extension.create({name:'ebookPreservation',addGlobalAttributes(){return [{types:metadataTypes,attributes:{ebookTag:hidden(null),ebookAttrs:hidden(null)}}];}});
 const protectedTypes=[false,true].map(inline=>Node.create({name:inline?'ebookInline':'ebookBlock',group:inline?'inline':'block',inline,atom:true,selectable:true,draggable:false,
  addAttributes(){return {raw:hidden(''),label:hidden('XML'),summary:hidden('')};},parseHTML(){return [];},renderHTML({node}){return [inline?'span':'div',{'class':'es-protected',contenteditable:'false',title:'受保护内容，请在源码模式编辑'},'〔'+node.attrs.label+' · '+(node.attrs.summary||'受保护内容')+'〕'];}}));
 const imageTypes=[true,false].map(inline=>Node.create({name:inline?'ebookImage':'ebookImageBlock',group:inline?'inline':'block',inline,atom:true,draggable:false,
  parseHTML(){return [];},renderHTML({node}){let src='';try{const path=relativePath(chapter.path,node.attrs.ebookAttrs?.src||'');if(/^image\/(png|jpeg|gif|webp)$/.test(imageMime(path))&&Object.hasOwn(book.files,path))src='data:'+imageMime(path)+';base64,'+book.files[path];}catch{}
   return src?['img',{src,alt:node.attrs.ebookAttrs?.alt||'书籍插图',class:'es-book-image'}]:['span',{class:'es-protected'},'〔插图：'+(node.attrs.ebookAttrs?.alt||'请在预览查看')+'〕'];}}));
 const container=Node.create({name:'ebookContainer',group:'block',content:'block*',defining:true,parseHTML(){return [];},renderHTML(){return ['div',{class:'es-book-container'},0];}});
 const preservedMarks=['ebookLink','ebookSpan','ebookSub','ebookSup'].map(name=>Mark.create({name,inclusive:false,parseHTML(){return [];},renderHTML(){return [name==='ebookSub'?'sub':name==='ebookSup'?'sup':'span',name==='ebookLink'?{class:'es-book-link'}:{},0];}}));
 const editor=new Editor({element,extensions:[StarterKit.configure({link:false,trailingNode:false,codeBlock:false}),preservation,...protectedTypes,...imageTypes,container,...preservedMarks],content:chapterVisualJson(book,chapter),injectCSS:false,
  editorProps:{attributes:{class:'es-prose',role:'textbox','aria-label':'电子书可视化正文','aria-multiline':'true'},handleKeyDown(_view,event){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();onSave();return true;}return false;}},
  onUpdate({editor}){try{onUpdate(visualXhtml(editor.getJSON()),editor.view.composing);}catch(error){onError(error);}},onSelectionUpdate({editor}){onSelection?.(editor);},onTransaction({editor}){onSelection?.(editor);}});
 // Catch unsupported content before a save can normalize it away.
 try{editor.state.doc.check();}catch(error){editor.destroy();throw error;}
 return editor;
}
