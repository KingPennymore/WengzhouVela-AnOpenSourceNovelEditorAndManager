import {tablesByLine,csvTableMarkup,CSV_TABLE_EXPORT_CSS} from './csv-embed.mjs';
// EPUB 3 export of TXT chapters with their .vela v3 formats. Includes an NCX table of contents for EPUB 2 readers.
// Format reference: EPUB 3.3 (https://www.w3.org/TR/epub-33/): `mimetype` first and uncompressed, OCF container,
// package document with dc:identifier/title/language and dcterms:modified, a nav document, XHTML content.
import {zipSync,strToU8} from 'fflate';
import {COVER_TYPES,MAX_COVER_BYTES,epubFileName} from './epub-names.mjs';
export {COVER_TYPES,MAX_COVER_BYTES,epubFileName};
import {exportLines,htmlLine,lineClass,escapeHtml,FIGURE_CSS,insertExportOptions} from './rich-text-export.mjs';
import {alignedLines,styledLines,imagesByLine} from './rich-text.mjs';
import {styleSheet} from './rich-text-styles.mjs';

const NS={opf:'http://www.idpf.org/2007/opf',dc:'http://purl.org/dc/elements/1.1/',xhtml:'http://www.w3.org/1999/xhtml',epub:'http://www.idpf.org/2007/ops',ncx:'http://www.daisy.org/z3986/2005/ncx/',container:'urn:oasis:names:tc:opendocument:xmlns:container'};
const failure=message=>Error('无法导出 EPUB：'+message);
// XML 1.0 forbids most control characters and lone surrogates; they are dropped rather than failing the export.
const clean=value=>String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,'');
const xml=value=>clean(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]);
const modified=date=>date.toISOString().replace(/\.\d{3}Z$/,'Z');
const pad=index=>String(index).padStart(3,'0');

function chapterXhtml({title,lines,text,entries,aligned,styled,images,figure,tableEntries,tableFigure,language,id}){
  const body=lines.flatMap(line=>{const parts=[];if(line.text.trim()){const attribute=lineClass(line,aligned,styled),markup=clean(htmlLine(text,line,entries));parts.push(line.heading?`<h1${attribute}>${markup.trim()}</h1>`:`<p${attribute}>${markup}</p>`);}for(const image of images.get(line.end)||[])parts.push(...figure(image));for(const entry of tableEntries.get(line.end)||[])parts.push(tableFigure(entry));return parts;}).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${NS.xhtml}" xmlns:epub="${NS.epub}" lang="${xml(language)}" xml:lang="${xml(language)}">
<head>
<meta charset="utf-8"/>
<title>${xml(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/>
</head>
<body>
<section epub:type="chapter" id="${id}">
${body}
</section>
</body>
</html>
`;
}
const STYLE=`body{margin:0 4%;line-height:1.8;text-align:justify}
p{margin:0 0 .45em}
h1{font-size:1.4em;font-weight:bold;text-align:center;margin:1.6em 0 1.2em;line-height:1.5}
.center{text-align:center}
.right{text-align:right}
strong{font-weight:bold}
em.emphasis{font-style:normal;text-emphasis:filled dot;text-emphasis-position:under right;-webkit-text-emphasis:filled dot;-webkit-text-emphasis-position:under right;-epub-text-emphasis:filled dot;-epub-text-emphasis-position:under right}
.cover{margin:0;padding:0;text-align:center}
.cover img{max-width:100%;max-height:100%}
`+FIGURE_CSS+'\n'+CSV_TABLE_EXPORT_CSS+'\n';

/**
 * Builds an EPUB from sections[from..to] of a TXT. `entries` are placed sidecar formats; `cover` is optional
 * {bytes, type}. Chapters without text are skipped. Returns the archive bytes and the files it contains.
 */
export function buildEpub({text,sections,entries=[],from=0,to=sections.length-1,includeTitle=true,metadata={},cover=null,styles={},images=new Map(),tables=new Map(),clock=()=>new Date()}){
  const title=clean(metadata.title||'').trim(),language=metadata.language||'zh-CN',identifier=metadata.identifier||'urn:uuid:'+crypto.randomUUID();
  if(!title||title.length>1000)throw failure('请填写书名（最多 1000 字）。');
  if(!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(language))throw failure('语言代码无效，例如 zh-CN。');
  if(cover){if(!COVER_TYPES[cover.type])throw failure('封面须为 JPEG、PNG、GIF 或 WebP 图片。');if(!(cover.bytes instanceof Uint8Array)||!cover.bytes.length||cover.bytes.length>MAX_COVER_BYTES)throw failure('封面图片不能超过 5 MB。');}
  const aligned=alignedLines(entries),styled=styledLines(entries),byLine=imagesByLine(text,entries),tableEntries=tablesByLine(text,entries),chapters=[],illustrations=new Map(),missing=[];
  // Each distinct illustration is stored once; ones that could not be read are left out and reported.
  const figure=image=>{const data=images.get(image.src);if(!data||!COVER_TYPES[data.type]||!(data.bytes instanceof Uint8Array)){missing.push(image.src);return [];}if(!illustrations.has(image.src))illustrations.set(image.src,{...data,file:'images/illustration-'+pad(illustrations.size+1)+'.'+COVER_TYPES[data.type]});const alt=escapeHtml(clean(image.alt||''));return [`<figure class="illustration"><img src="../${illustrations.get(image.src).file}" alt="${alt}"/>${alt?`<figcaption>${alt}</figcaption>`:''}</figure>`];};
  const tableFigure=entry=>{const snapshot=tables.get(entry.src);if(!snapshot||snapshot.error)missing.push(entry.src);return '<div class="csv-table">'+clean(csvTableMarkup(snapshot,entry))+'</div>';};
  for(let at=from;at<=to;at++){
    const [lines]=exportLines(text,sections,insertExportOptions(text,entries,{from:at,to:at,includeTitle}));if(!lines?.some(line=>line.text.trim()||tableEntries.has(line.end)||byLine.has(line.end)))continue;
    const id='chapter-'+pad(chapters.length+1),name=sections[at].title.trim()||'第 '+(chapters.length+1)+' 部分';
    chapters.push({id,file:'text/'+id+'.xhtml',title:name,xhtml:chapterXhtml({title:name,lines,text,entries,aligned,styled,images:byLine,figure,tableEntries,tableFigure,language,id})});
  }
  if(!chapters.length)throw failure('所选章节没有正文。');
  const files=new Map(),add=(path,value)=>files.set(path,value);
  add('mimetype','application/epub+zip');
  add('META-INF/container.xml',`<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="${NS.container}" version="1.0">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`);
  const coverFile=cover?'images/cover.'+COVER_TYPES[cover.type]:null;
  if(cover){add('OEBPS/'+coverFile,cover.bytes);add('OEBPS/text/cover.xhtml',`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${NS.xhtml}" xmlns:epub="${NS.epub}" lang="${xml(language)}" xml:lang="${xml(language)}">
<head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body class="cover"><section epub:type="cover" class="cover"><img src="../${coverFile}" alt="${xml(title)}"/></section></body>
</html>
`);}
  for(const chapter of chapters)add('OEBPS/'+chapter.file,chapter.xhtml);
  for(const item of illustrations.values())add('OEBPS/'+item.file,item.bytes);
  add('OEBPS/styles/book.css',STYLE+styleSheet(styles)+'\n');
  add('OEBPS/nav.xhtml',`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${NS.xhtml}" xmlns:epub="${NS.epub}" lang="${xml(language)}" xml:lang="${xml(language)}">
<head><meta charset="utf-8"/><title>目录</title><link rel="stylesheet" type="text/css" href="styles/book.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>目录</h1>
<ol>
${chapters.map(chapter=>`<li><a href="${chapter.file}">${xml(chapter.title)}</a></li>`).join('\n')}
</ol>
</nav>
</body>
</html>
`);
  add('OEBPS/toc.ncx',`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="${NS.ncx}" version="2005-1" xml:lang="${xml(language)}">
<head><meta name="dtb:uid" content="${xml(identifier)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xml(title)}</text></docTitle>
<navMap>
${chapters.map((chapter,index)=>`<navPoint id="nav-${chapter.id}" playOrder="${index+1}"><navLabel><text>${xml(chapter.title)}</text></navLabel><content src="${chapter.file}"/></navPoint>`).join('\n')}
</navMap>
</ncx>
`);
  const optional=[['creator',metadata.author],['description',metadata.description],['publisher',metadata.publisher]].filter(([,value])=>clean(value||'').trim()).map(([key,value])=>`<dc:${key}>${xml(value.trim())}</dc:${key}>`).join('\n');
  add('OEBPS/content.opf',`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="${NS.opf}" version="3.0" unique-identifier="book-id" xml:lang="${xml(language)}">
<metadata xmlns:dc="${NS.dc}">
<dc:identifier id="book-id">${xml(identifier)}</dc:identifier>
<dc:title>${xml(title)}</dc:title>
<dc:language>${xml(language)}</dc:language>
${optional?optional+'\n':''}<meta property="dcterms:modified">${modified(clock())}</meta>
${cover?'<meta name="cover" content="cover-image"/>\n':''}</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="style" href="styles/book.css" media-type="text/css"/>
${cover?`<item id="cover-image" href="${coverFile}" media-type="${cover.type}" properties="cover-image"/>\n<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>\n`:''}${[...illustrations.values()].map((item,index)=>`<item id="illustration-${pad(index+1)}" href="${item.file}" media-type="${item.type}"/>\n`).join('')}${chapters.map(chapter=>`<item id="${chapter.id}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${cover?'<itemref idref="cover" linear="yes"/>\n':''}${chapters.map(chapter=>`<itemref idref="${chapter.id}"/>`).join('\n')}
</spine>
</package>
`);
  const archive={};for(const [path,value] of files)archive[path]=path==='mimetype'?[strToU8(value),{level:0}]:typeof value==='string'?strToU8(value):value;
  return {bytes:zipSync(archive,{level:6}),files,chapters:chapters.length,identifier,missing:[...new Set(missing)]};
}
/** “书名.epub” with characters file systems reject replaced. */
