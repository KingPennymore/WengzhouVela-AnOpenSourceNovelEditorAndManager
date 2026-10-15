import {inlineRuns,alignedLines} from './rich-text.mjs';
export const displayChapterTitle=value=>String(value||'').replace(/[\p{P}\p{Z}\s]+$/gu,'');
export function lineOffsets(text){const offsets=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)offsets.push(i+1);return offsets;}
export function chapterOffset(text,row,offsets){return (offsets||lineOffsets(text))[row]??text.length;}
/**
 * Plain text with chapter headings as blocks. TXT formats (`formats`: sidecar entries with offsets in the whole
 * document, `base`: where `text` starts in it) become spans and aligned line blocks. The rendered textContent
 * always equals `text`, so reading positions, bookmarks and search offsets are unaffected.
 */
export function renderPlainChapters(root,text,sections,{formats=[],base=0}={}){
  root.replaceChildren();let cursor=0;const offsets=lineOffsets(text),fragment=document.createDocumentFragment();
  const local=formats.length?formats.filter(entry=>entry.to>=base&&entry.from<=base+text.length).map(entry=>({...entry,from:entry.from-base,to:entry.to-base})):[],aligned=alignedLines(local);
  const inline=(parent,from,to)=>{for(const run of inlineRuns(text,from,to,local)){if(!run.types.length){parent.append(document.createTextNode(run.text));continue;}const span=document.createElement('span');span.className=run.types.map(type=>'reader-format-'+type).join(' ');span.textContent=run.text;parent.append(span);}};
  const lineEnd=start=>{const end=text.indexOf('\n',start);return end<0?text.length:end+1;};
  const blocks=sections.filter(section=>section.heading).map(section=>{const start=chapterOffset(text,section.row,offsets);return {start,stop:lineEnd(start),heading:true,value:aligned.get(start)};});
  for(const [start,value] of aligned)if(start>=0&&start<text.length&&!blocks.some(block=>block.start===start))blocks.push({start,stop:lineEnd(start),value});
  for(const block of blocks.sort((a,b)=>a.start-b.start)){
    if(block.start<cursor)continue;inline(fragment,cursor,block.start);let element;
    if(block.heading){element=document.createElement('h2');element.className='reader-section-title';if(/^[^\S\r\n]/u.test(text.slice(block.start,block.stop)))element.classList.add('reader-indented-title');}
    else{element=document.createElement('span');element.className='reader-format-block';}
    if(block.value)element.classList.add('reader-format-'+block.value);
    inline(element,block.start,block.stop);fragment.append(element);cursor=block.stop;
  }
  inline(fragment,cursor,text.length);root.append(fragment);
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
