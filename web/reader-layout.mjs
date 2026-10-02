export const displayChapterTitle=value=>String(value||'').replace(/[\p{P}\p{Z}\s]+$/gu,'');
export function chapterOffset(text,row){return text.split('\n').slice(0,row).join('\n').length+(row?1:0);}
export function renderPlainChapters(root,text,sections){
  root.replaceChildren();let cursor=0;
  for(const section of sections.filter(section=>section.heading)){
    const start=chapterOffset(text,section.row),end=text.indexOf('\n',start),stop=end<0?text.length:end+1;
    if(start>cursor)root.append(document.createTextNode(text.slice(cursor,start)));
    const heading=document.createElement('h2');heading.className='reader-section-title';heading.textContent=text.slice(start,stop);root.append(heading);cursor=stop;
  }
  if(cursor<text.length)root.append(document.createTextNode(text.slice(cursor)));
}
export function fitReadingLayout(layout,width,height){
  const result={...layout},horizontal=Math.max(0,width-80),vertical=Math.max(0,height-80);
  for(const [first,second,budget] of [['marginLeft','marginRight',horizontal],['marginTop','marginBottom',vertical]]){
    const sum=result[first]+result[second];if(sum>budget){result[first]=sum?result[first]*budget/sum:0;result[second]=sum?result[second]*budget/sum:0;}
  }
  return result;
}
export function swipeDirection(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<60)return 0;return Math.abs(dx)>=Math.abs(dy)?(dx<0?1:-1):(dy<0?1:-1);}
export function readingPageInfo({paged,page=0,pages=1,scrollTop=0,scrollHeight=0,height=1}){
  if(paged)return {page:page+1,pages,ratio:pages<=1?1:page/(pages-1)};
  const total=Math.max(1,Math.ceil(scrollHeight/Math.max(1,height))),current=Math.min(total,Math.floor(scrollTop/Math.max(1,height))+1);
  return {page:current,pages:total,ratio:scrollTop/Math.max(1,scrollHeight-height)};
}
