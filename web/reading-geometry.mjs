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
export function readingPageInfo({paged,page=0,pages=1,columns=1,scrollTop=0,scrollHeight=0,height=1}){
  if(paged){const result={page:page+1,pages,ratio:pages<=columns?1:Math.min(1,page/(pages-columns))};if(columns===2)result.end=Math.min(pages,page+columns);return result;}
  const total=Math.max(1,Math.ceil(scrollHeight/Math.max(1,height))),current=Math.min(total,Math.floor(scrollTop/Math.max(1,height))+1);
  return {page:current,pages:total,ratio:scrollTop/Math.max(1,scrollHeight-height)};
}
