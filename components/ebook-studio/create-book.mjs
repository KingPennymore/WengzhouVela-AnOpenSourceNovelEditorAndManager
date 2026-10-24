import epubModule from 'epub-gen-memory';
import {importEpub,escape,TEMPLATES} from './engine.mjs';

const generate=typeof epubModule==='function'?epubModule:epubModule.default;
export function textChapters(text){
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),chapters=[];let current={title:'正文',lines:[]};
 for(const line of lines){if(/^(?:第[零〇一二三四五六七八九十百千万两0-9０-９]+[章回节卷部]|chapter\s+[\wIVX]+)/i.test(line.trim())){if(current.lines.some(v=>v.trim()))chapters.push(current);current={title:line.trim(),lines:[]};}else current.lines.push(line);}
 if(current.lines.some(v=>v.trim())||!chapters.length)chapters.push(current);
 return chapters.map(chapter=>({title:chapter.title,content:chapter.lines.filter(line=>line.trim()).map(line=>'<p>'+escape(line.trim())+'</p>').join('\n')||'<p>开始写作。</p>'}));
}
export async function createBook({title='未命名书籍',author='',text='',language='zh-CN'}={}){
 const blob=await generate({title,author:author||'佚名',lang:language,version:3,css:TEMPLATES.novel.css,prependChapterTitles:true,numberChaptersInTOC:false,verbose:false},textChapters(text));
 const bytes=blob instanceof Blob?new Uint8Array(await blob.arrayBuffer()):new Uint8Array(blob);
 const book=importEpub(bytes);book.template='novel';return book;
}
