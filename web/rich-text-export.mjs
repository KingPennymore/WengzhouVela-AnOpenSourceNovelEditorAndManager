// Formatted export of TXT chapters (.vela v3 formats) as Markdown or HTML. Plain TXT export stays in chapter-export.mjs.
import {inlineRuns,alignedLines} from './rich-text.mjs';

const blank=line=>!line.trim();
const lineStarts=text=>{const starts=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)starts.push(i+1);return starts;};

/** Lines of sections[from..to] with blank lines around each chapter trimmed; `heading` marks the chapter title line. */
export function exportLines(text,sections,{from,to=from,includeTitle=true}={}){
  if(!Array.isArray(sections)||!sections.length)throw new Error('没有可导出的章节。');
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>=sections.length||from>to)throw new Error('章节范围无效。');
  const starts=lineStarts(text),chapters=[];
  const line=row=>{const start=starts[row],end=row+1<starts.length?starts[row+1]-1:text.length;return {row,start,end,text:text.slice(start,end)};};
  for(let at=from;at<=to;at++){
    const section=sections[at],rows=[];for(let row=section.heading&&!includeTitle?section.row+1:section.row;row<section.endRow&&row<starts.length;row++)rows.push(line(row));
    while(rows.length&&blank(rows[0].text))rows.shift();while(rows.length&&blank(rows.at(-1).text))rows.pop();
    if(rows.length)chapters.push(rows.map(item=>({...item,heading:!!section.heading&&item.row===section.row})));
  }
  return chapters;
}

const escapeHtml=value=>value.replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]);
const punctuation=/^[\p{P}\p{S}]|[\p{P}\p{S}]$/u;
// CommonMark delimiter rules fail next to CJK punctuation (**“他”**说), so such runs use inline HTML instead.
const markdownRun=(value,types)=>{
  let out=value.replace(/([\\`*_[\]<>~|])/g,'\\$1');if(!types.length)return out;
  const html=punctuation.test(value)||/^\s|\s$/.test(value);
  if(types.includes('emphasis'))out=html?'<em>'+out+'</em>':'*'+out+'*';
  if(types.includes('strong'))out=html?'<strong>'+out+'</strong>':'**'+out+'**';
  return out;
};
const markdownLine=(text,line,entries)=>{const value=inlineRuns(text,line.start,line.end,entries).map(run=>markdownRun(run.text,run.types)).join('');return value.replace(/^(\s*)([#>+=-]|\d+[.)])(?=\s|$)/u,'$1\\$2');};

/**
 * Markdown for a chapter range. Every non-blank line becomes a paragraph, chapter titles become `##` headings.
 * Markdown has no emphasis dots or alignment: emphasis is exported as italics, aligned lines as ordinary paragraphs.
 */
export function chapterMarkdown(text,sections,entries,options){
  const chapters=exportLines(text,sections,options);
  const out=chapters.map(lines=>lines.filter(line=>!blank(line.text)).map(line=>line.heading?'## '+markdownLine(text,{...line,start:line.start+line.text.match(/^\s*/)[0].length},entries).trim():markdownLine(text,line,entries)).join('\n\n')).filter(Boolean).join('\n\n');
  return {text:out?out+'\n':'',chapters:chapters.length};
}

const htmlLine=(text,line,entries)=>inlineRuns(text,line.start,line.end,entries).map(run=>{let out=escapeHtml(run.text);if(run.types.includes('emphasis'))out='<em class="emphasis">'+out+'</em>';if(run.types.includes('strong'))out='<strong>'+out+'</strong>';return out;}).join('');
/** HTML body for a chapter range: one paragraph per non-blank line, `h2` titles, aligned lines keep their alignment. */
export function chapterHtmlBody(text,sections,entries,options){
  const aligned=alignedLines(entries),chapters=exportLines(text,sections,options);
  const body=chapters.map(lines=>'<section>\n'+lines.filter(line=>!blank(line.text)).map(line=>{const align=aligned.get(line.start),attribute=align?` class="${align}"`:'';return line.heading?`<h2${attribute}>${htmlLine(text,line,entries).trim()}</h2>`:`<p${attribute}>${htmlLine(text,line,entries)}</p>`;}).join('\n')+'\n</section>').join('\n');
  return {html:body,chapters:chapters.length};
}
/** A standalone, offline HTML file (no scripts or external resources). */
export function chapterHtml(text,sections,entries,options,{title='文稿'}={}){
  const {html,chapters}=chapterHtmlBody(text,sections,entries,options);
  const page=`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{max-width:42em;margin:0 auto;padding:2em 1.25em;font:18px/1.9 "Songti SC","Noto Serif CJK SC","Source Han Serif SC",serif;color:#222;background:#fff}
p{margin:0 0 .5em;white-space:pre-wrap}
h2{font-size:1.4em;margin:2em 0 1em;white-space:pre-wrap}
section:first-child h2{margin-top:0}
.center{text-align:center}.right{text-align:right}
em.emphasis{font-style:normal;text-emphasis:filled dot;text-emphasis-position:under right;-webkit-text-emphasis:filled dot;-webkit-text-emphasis-position:under right}
@media (prefers-color-scheme:dark){body{color:#ddd;background:#1b1b1b}}
</style>
</head>
<body>
${html}
</body>
</html>
`;
  return {text:page,html,chapters};
}
