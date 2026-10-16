import {inlineSegments,alignedLines,styledLines,imagesByLine} from './rich-text.mjs';
import {styleCss} from './rich-text-styles.mjs';
export const displayChapterTitle=value=>String(value||'').replace(/[\p{P}\p{Z}\s]+$/gu,'');
export function lineOffsets(text){const offsets=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)offsets.push(i+1);return offsets;}
export function chapterOffset(text,row,offsets){return (offsets||lineOffsets(text))[row]??text.length;}
/**
 * Plain text with chapter headings as blocks. TXT formats (`formats`: sidecar entries with offsets in the whole
 * document, `base`: where `text` starts in it) become spans, aligned or styled line blocks and illustrations.
 * `styles` are named style definitions, `loadImage(src)` returns a Promise of an image URL or null. Readings,
 * captions and placeholders are drawn by CSS, so the rendered textContent always equals `text` and reading
 * positions, bookmarks and search offsets are unaffected.
 */
export function renderPlainChapters(root,text,sections,{formats=[],base=0,styles={},loadImage=null}={}){
  root.replaceChildren();let cursor=0;const offsets=lineOffsets(text),fragment=document.createDocumentFragment();
  const local=formats.length?formats.filter(entry=>entry.to>=base&&entry.from<=base+text.length).map(entry=>({...entry,from:entry.from-base,to:entry.to-base})):[],aligned=alignedLines(local),styled=styledLines(local),images=imagesByLine(text,local.filter(entry=>entry.from>=0&&entry.from<=text.length));
  const run=(parent,item)=>{if(!item.types.length){parent.append(document.createTextNode(item.text));return;}const span=document.createElement('span');span.className=item.types.map(type=>type.startsWith('style:')?'reader-style':'reader-format-'+type).join(' ');const style=item.types.find(type=>type.startsWith('style:'))?.slice(6);if(style&&styles[style]){span.dataset.style=style;span.style.cssText=styleCss(styles[style]);}span.textContent=item.text;parent.append(span);};
  const inline=(parent,from,to)=>{for(const item of inlineSegments(text,from,to,local)){if(item.ruby===undefined){run(parent,item);continue;}const ruby=document.createElement('span');ruby.className='reader-format-ruby';ruby.dataset.ruby=item.ruby;for(const part of item.runs)run(ruby,part);parent.append(ruby);}};
  const lineEnd=start=>{const end=text.indexOf('\n',start);return end<0?text.length:end+1;};
  const blocks=sections.filter(section=>section.heading).map(section=>{const start=chapterOffset(text,section.row,offsets);return {start,stop:lineEnd(start),heading:true};});
  for(const start of new Set([...aligned.keys(),...styled.keys()]))if(start>=0&&start<text.length&&!blocks.some(block=>block.start===start))blocks.push({start,stop:lineEnd(start)});
  // Illustrations go after the line they follow; a zero-length "block" places them between lines.
  for(const [at,list] of images)blocks.push({start:Math.min(text.length,at+1),stop:Math.min(text.length,at+1),images:list});
  for(const block of blocks.sort((a,b)=>a.start-b.start||(a.images?-1:1))){
    if(block.start<cursor)continue;inline(fragment,cursor,block.start);
    if(block.images){for(const image of block.images)fragment.append(illustration(image,loadImage));cursor=block.start;continue;}
    let element;
    if(block.heading){element=document.createElement('h2');element.className='reader-section-title';if(/^[^\S\r\n]/u.test(text.slice(block.start,block.stop)))element.classList.add('reader-indented-title');}
    else{element=document.createElement('span');element.className='reader-format-block';}
    const align=aligned.get(block.start),style=styled.get(block.start);if(align)element.classList.add('reader-format-'+align);
    if(style&&styles[style]){element.classList.add('reader-style-block');element.dataset.style=style;element.style.cssText=styleCss(styles[style]);}
    inline(element,block.start,block.stop);fragment.append(element);cursor=block.stop;
  }
  inline(fragment,cursor,text.length);root.append(fragment);
}
function illustration(entry,loadImage){
  const box=document.createElement('span');box.className='reader-format-image';box.dataset.caption=entry.alt||'';box.dataset.src=entry.src;box.setAttribute('role','img');box.setAttribute('aria-label',entry.alt||entry.src);
  const pending=loadImage?.(entry.src);
  if(pending)pending.then(url=>{const image=document.createElement('img');image.alt='';image.src=url;box.prepend(image);box.classList.add('loaded');}).catch(()=>box.classList.add('missing'));else box.classList.add('missing');
  return box;
}
export function fitReadingLayout(layout,width,height){
  const result={...layout},horizontal=Math.max(0,width-80),vertical=Math.max(0,height-80);
  for(const [first,second,budget] of [['marginLeft','marginRight',horizontal],['marginTop','marginBottom',vertical]]){
    const sum=result[first]+result[second];if(sum>budget){result[first]=sum?result[first]*budget/sum:0;result[second]=sum?result[second]*budget/sum:0;}
  }
  return result;
}
export function swipeDirection(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<60)return 0;return Math.abs(dx)>=Math.abs(dy)?(dx<0?1:-1):(dy<0?1:-1);}
export function readingGeometry(mode,width){const columns=mode==='double'&&width>=760?2:1,gap=columns===2?32:48,pageWidth=(width-(columns-1)*gap)/columns;return {paged:mode==='pages'||mode==='double',columns,gap,pageWidth,stride:pageWidth+gap};}
export function spreadStart(page,pages,columns=1){return Math.max(0,Math.min(Math.floor((pages-1)/columns)*columns,Math.floor(page/columns)*columns));}
export function paginatedPages(content,geometry){
  let pages=Math.max(1,Math.ceil((content.scrollWidth+geometry.gap-.5)/geometry.stride));
  if(geometry.columns===2&&pages<=2){const range=document.createRange();range.selectNodeContents(content);const left=content.getBoundingClientRect().left;let right=left;for(const rect of range.getClientRects())if(rect.width&&rect.height)right=Math.max(right,rect.right);pages=Math.max(1,Math.floor((right-left-.5)/geometry.stride)+1);}
  return pages;
}
export function readingPageInfo({paged,page=0,pages=1,columns=1,scrollTop=0,scrollHeight=0,height=1}){
  if(paged){const result={page:page+1,pages,ratio:pages<=columns?1:Math.min(1,page/(pages-columns))};if(columns===2)result.end=Math.min(pages,page+columns);return result;}
  const total=Math.max(1,Math.ceil(scrollHeight/Math.max(1,height))),current=Math.min(total,Math.floor(scrollTop/Math.max(1,height))+1);
  return {page:current,pages:total,ratio:scrollTop/Math.max(1,scrollHeight-height)};
}
