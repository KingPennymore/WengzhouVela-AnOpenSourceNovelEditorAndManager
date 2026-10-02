export const displayChapterTitle=value=>String(value||'').replace(/[\p{P}\p{Z}\s]+$/gu,'');
export function lineOffsets(text){const offsets=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)offsets.push(i+1);return offsets;}
export function chapterOffset(text,row,offsets){return (offsets||lineOffsets(text))[row]??text.length;}
export function renderPlainChapters(root,text,sections){
  root.replaceChildren();let cursor=0;const offsets=lineOffsets(text),fragment=document.createDocumentFragment();
  for(const section of sections.filter(section=>section.heading)){
    const start=chapterOffset(text,section.row,offsets),end=text.indexOf('\n',start),stop=end<0?text.length:end+1;
    if(start>cursor)fragment.append(document.createTextNode(text.slice(cursor,start)));
    const heading=document.createElement('h2');heading.className='reader-section-title';heading.textContent=text.slice(start,stop);fragment.append(heading);cursor=stop;
  }
  if(cursor<text.length)fragment.append(document.createTextNode(text.slice(cursor)));root.append(fragment);
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
