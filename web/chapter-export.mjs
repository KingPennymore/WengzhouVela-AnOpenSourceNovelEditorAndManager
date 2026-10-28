import {t} from './i18n.mjs';

// Chapter text for export or copying. Sections come from EditorIndex (row/endRow are 0-based line numbers).
const blank=line=>!line.trim();

/** Remove Markdown marks a reader would see as noise; the words themselves stay unchanged. */
export function markdownToPlain(text){
  let fenced=false;
  return text.split('\n').flatMap(line=>{
    if(/^\s*(```|~~~)/.test(line)){
      fenced=!fenced;
      return [];
    }
    if(fenced)return [line];
    return [line
      .replace(/^\s{0,3}#{1,6}\s+/,'').replace(/\s+#+\s*$/,'')
      .replace(/^\s*>\s?/,'')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/\*\*(.+?)\*\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/~~(.+?)~~/g,'$1')
      .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g,'$1$2')
      .replace(/`([^`]+)`/g,'$1')];
  }).join('\n');
}

/** Text of sections[from..to]; blank lines around each chapter are trimmed and chapters are separated by one empty line. */
export function chapterExport(text,sections,{from,to=from,includeTitle=true,stripMarkdown=false}={}){
  if(!Array.isArray(sections)||!sections.length)throw new Error(t('没有可导出的章节。'));
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>=sections.length||from>to)throw new Error(t('章节范围无效。'));
  const lines=text.split(/\r\n|\r|\n/),blocks=[];
  for(let at=from;at<=to;at++){
    const section=sections[at],start=section.heading&&!includeTitle?section.row+1:section.row,body=lines.slice(start,section.endRow);
    while(body.length&&blank(body[0]))body.shift();
    while(body.length&&blank(body.at(-1)))body.pop();
    if(body.length)blocks.push(body.join('\n'));
  }
  let result=blocks.join('\n\n');
  if(stripMarkdown)result=markdownToPlain(result);
  return {text:result?result+'\n':'',chapters:to-from+1};
}

/** A safe .txt name such as “书名 - 第三章 风起.txt” or “书名 - 第一章 至 第五章.txt”. */
export function chapterFileName(documentName,sections,from,to=from){
  const book=String(documentName||t('文稿')).replace(/\.[^./\\]+$/,''),title=from===to?sections[from].title:sections[from].title+t(' 至 ')+sections[to].title;
  const name=(book+' - '+title).replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120).trim();
  return (name||t('章节'))+'.txt';
}
