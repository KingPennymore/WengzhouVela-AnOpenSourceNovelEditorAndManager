import {tablesByLine,csvTableMarkup,CSV_TABLE_EXPORT_CSS} from './csv-embed.mjs';
// Formatted export of TXT chapters (.vela v3 formats) as Markdown or HTML. Plain TXT export stays in chapter-export.mjs.
import {inlineSegments,alignedLines,styledLines,imagesByLine} from './rich-text.mjs';
import {styleSheet} from './rich-text-styles.mjs';

const blank=line=>!line.trim();
const lineStarts=text=>{const starts=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)starts.push(i+1);return starts;};

/** Lines of sections[from..to] with blank lines around each chapter trimmed; `heading` marks the chapter title line. */
export function exportLines(text,sections,{from,to=from,includeTitle=true,keepLines=new Set()}={}){
  if(!Array.isArray(sections)||!sections.length)throw new Error('没有可导出的章节。');
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>=sections.length||from>to)throw new Error('章节范围无效。');
  const starts=lineStarts(text),chapters=[];
  const line=row=>{const start=starts[row],end=row+1<starts.length?starts[row+1]-1:text.length;return {row,start,end,text:text.slice(start,end)};};
  for(let at=from;at<=to;at++){
    const section=sections[at],rows=[];for(let row=section.heading&&!includeTitle?section.row+1:section.row;row<section.endRow&&row<starts.length;row++)rows.push(line(row));
    while(rows.length&&blank(rows[0].text)&&!keepLines.has(rows[0].row))rows.shift();while(rows.length&&blank(rows.at(-1).text)&&!keepLines.has(rows.at(-1).row))rows.pop();
    if(rows.length)chapters.push(rows.map(item=>({...item,heading:!!section.heading&&item.row===section.row})));
  }
  return chapters;
}

export function insertExportOptions(text,entries,options){const starts=lineStarts(text),keepLines=new Set();
  for(const entry of entries.filter(item=>item.group==='inserts')){let row=0;while(row+1<starts.length&&starts[row+1]<=entry.from)row++;keepLines.add(row);}
  return {...options,keepLines};
}
export const escapeHtml=value=>value.replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]);
const punctuation=/^[\p{P}\p{S}]|[\p{P}\p{S}]$/u;
// CommonMark delimiter rules fail next to CJK punctuation (**“他”**说), so such runs use inline HTML instead.
const markdownRun=(value,types)=>{
  let out=value.replace(/([\\`*_[\]<>~|])/g,'\\$1');if(!types.length)return out;
  const html=punctuation.test(value)||/^\s|\s$/.test(value);
  if(types.includes('emphasis'))out=html?'<em>'+out+'</em>':'*'+out+'*';
  if(types.includes('strong'))out=html?'<strong>'+out+'</strong>':'**'+out+'**';
  return out;
};
const markdownInline=(text,from,to,entries)=>inlineSegments(text,from,to,entries).map(item=>item.ruby===undefined?markdownRun(item.text,item.types):'<ruby>'+item.runs.map(run=>markdownRun(run.text,run.types)).join('')+'<rt>'+escapeHtml(item.ruby)+'</rt></ruby>').join('');
const markdownLine=(text,line,entries)=>markdownInline(text,line.start,line.end,entries).replace(/^(\s*)([#>+=-]|\d+[.)])(?=\s|$)/u,'$1\\$2');
const markdownImage=image=>'!['+(image.alt||'').replace(/([\\[\]])/g,'\\$1')+']('+encodeURI(image.src).replace(/[()]/g,char=>char==='('?'%28':'%29')+')';

/**
 * Markdown for a chapter range. Every non-blank line becomes a paragraph, chapter titles become `##` headings.
 * Markdown has no emphasis dots, alignment or named styles: emphasis is exported as italics, aligned and styled
 * lines as ordinary paragraphs. Ruby uses inline HTML; illustrations become images with their relative paths.
 */
export function chapterMarkdown(text,sections,entries,options,{tables=new Map()}={}){
  const chapters=exportLines(text,sections,insertExportOptions(text,entries,options)),images=imagesByLine(text,entries),linked=tablesByLine(text,entries),missing=[];
  const out=chapters.map(lines=>lines.flatMap(line=>{const parts=[];if(!blank(line.text))parts.push(line.heading?'## '+markdownLine(text,{...line,start:line.start+line.text.match(/^\s*/)[0].length},entries).trim():markdownLine(text,line,entries));for(const image of images.get(line.end)||[])parts.push(markdownImage(image));for(const entry of linked.get(line.end)||[]){const table=tables.get(entry.src);if(!table||table.error)missing.push(entry.src);parts.push('<div class="csv-table">'+csvTableMarkup(table,entry)+'</div>');}return parts;}).join('\n\n')).filter(Boolean).join('\n\n');
  return {text:out?out+'\n':'',chapters:chapters.length,missing};
}

const htmlRun=(value,types)=>{let out=escapeHtml(value);for(const type of types.filter(type=>type.startsWith('style:')))out=`<span class="style-${type.slice(6)}">${out}</span>`;if(types.includes('emphasis'))out='<em class="emphasis">'+out+'</em>';if(types.includes('strong'))out='<strong>'+out+'</strong>';return out;};
/** One exported line as (X)HTML-safe markup with its inline formats and ruby. */
export const htmlLine=(text,line,entries)=>inlineSegments(text,line.start,line.end,entries).map(item=>item.ruby===undefined?htmlRun(item.text,item.types):'<ruby>'+item.runs.map(run=>htmlRun(run.text,run.types)).join('')+'<rp>（</rp><rt>'+escapeHtml(item.ruby)+'</rt><rp>）</rp></ruby>').join('');
/** class attribute for a line's alignment and paragraph style. */
export const lineClass=(line,aligned,styled)=>{const names=[aligned.get(line.start),styled.has(line.start)?'style-'+styled.get(line.start):null].filter(Boolean);return names.length?` class="${names.join(' ')}"`:'';};
/**
 * HTML body for a chapter range: one paragraph per non-blank line, `h2` titles, aligned and styled lines, and
 * illustrations whose URL `imageUrl(src)` returns (others are listed in `missing`).
 */
export function chapterHtmlBody(text,sections,entries,options,{imageUrl=()=>null,tables=new Map()}={}){
  const aligned=alignedLines(entries),styled=styledLines(entries),images=imagesByLine(text,entries),chapters=exportLines(text,sections,insertExportOptions(text,entries,options)),linked=tablesByLine(text,entries),missing=[];
  const figure=image=>{const url=imageUrl(image.src);if(!url){missing.push(image.src);return [];}return [`<figure class="illustration"><img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt||'')}"/>${image.alt?`<figcaption>${escapeHtml(image.alt)}</figcaption>`:''}</figure>`];};
  const body=chapters.map(lines=>'<section>\n'+lines.flatMap(line=>{const parts=[];if(!blank(line.text)){const attribute=lineClass(line,aligned,styled);parts.push(line.heading?`<h2${attribute}>${htmlLine(text,line,entries).trim()}</h2>`:`<p${attribute}>${htmlLine(text,line,entries)}</p>`);}for(const image of images.get(line.end)||[])parts.push(...figure(image));for(const entry of linked.get(line.end)||[]){const table=tables.get(entry.src);if(!table||table.error)missing.push(entry.src);parts.push('<div class="csv-table">'+csvTableMarkup(table,entry)+'</div>');}return parts;}).join('\n')+'\n</section>').join('\n');
  return {html:body,chapters:chapters.length,missing};
}
export const FIGURE_CSS='figure.illustration{margin:1em auto;text-align:center;break-inside:avoid;page-break-inside:avoid}\nfigure.illustration img{max-width:100%;max-height:90vh;height:auto}\nfigure.illustration figcaption{font-size:.85em;color:#666;margin-top:.3em}\nruby rt{font-size:.55em}';
/** A standalone, offline HTML file (no scripts or external resources). `images` maps src → data URL. */
export function chapterHtml(text,sections,entries,options,{title='文稿',styles={},images=new Map(),tables=new Map()}={}){
  const {html,chapters,missing}=chapterHtmlBody(text,sections,entries,options,{imageUrl:src=>images.get(src)||null,tables});
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
${FIGURE_CSS}
${CSV_TABLE_EXPORT_CSS}
${styleSheet(styles)}
@media (prefers-color-scheme:dark){body{color:#ddd;background:#1b1b1b}}
</style>
</head>
<body>
${html}
</body>
</html>
`;
  return {text:page,html,chapters,missing};
}
