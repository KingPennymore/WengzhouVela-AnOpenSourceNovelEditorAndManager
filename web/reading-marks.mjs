import {textPoint,characterRect} from './reading-position.mjs';
import {t} from './i18n.mjs';
// Geometry overlays leave the text DOM (selection, pagination and anchors) untouched.
export function renderReadingMarks(reader){
  const viewport=reader.root.querySelector('.reader-viewport'),content=reader.root.querySelector('.reader-content');if(!viewport||!content||reader.kind==='HTML')return;
  let layer=viewport.querySelector('.reader-mark-layer');if(!layer){layer=document.createElement('div');layer.className='reader-mark-layer';viewport.append(layer);}
  layer.replaceChildren();layer.style.top=(reader.paged?0:viewport.scrollTop)+'px';layer.style.height=viewport.clientHeight+'px';layer.style.width=viewport.clientWidth+'px';
  const base=reader.windowModel?.chunks[reader.paged?reader.chunk:reader.scrollFrom??reader.chunk]?.from||0,length=content.textContent.length,box=viewport.getBoundingClientRect();let count=0,bookmark=false;
  const marks=[...(reader.workspace().annotations?.[reader.id]||[])];if(reader.searchHit)marks.push({...reader.searchHit,kind:'search'});
  for(const mark of marks){if(mark.needsReview)continue;if(reader.pdfPane){if(mark.pdfPage!==reader.pdfPane.page)continue;if(mark.kind==='bookmark')bookmark=true;continue;}
    if(mark.offset>=base+length||(mark.end??mark.offset)<base)continue;
    const from=Math.max(0,mark.offset-base),to=Math.min(length,(mark.end??mark.offset)-base),rects=[];
    if(to>from){const start=textPoint(content,from),end=textPoint(content,to);if(start&&end){const range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);rects.push(...range.getClientRects());}}
    else{const rect=characterRect(content,from);if(rect)rects.push(rect);}
    let visible=false,first;
    for(const r of rects){const left=Math.max(0,r.left-box.left),top=Math.max(0,r.top-box.top),right=Math.min(box.width,r.right-box.left),bottom=Math.min(box.height,r.bottom-box.top);if(right<=left||bottom<=top)continue;visible=true;first||={left,top,bottom};if(to>from&&count++<200){const highlight=document.createElement('span');highlight.className='reader-inline-highlight'+(mark.kind==='search'?' search-hit':'');highlight.style.cssText=`left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px`;layer.append(highlight);}}
    if(!visible)continue;if(mark.kind==='bookmark')bookmark=true;
    if(mark.kind==='note'&&first&&count++<200){const button=document.createElement('button');button.className='reader-note-anchor';button.setAttribute('aria-label',t('批注')+'：'+(mark.note||mark.quote||''));button.textContent='✎';button.style.cssText=`left:${Math.min(box.width-30,first.left)}px;top:${Math.max(0,first.top-18)}px`;button.onclick=e=>{e.stopPropagation();layer.querySelector('.reader-note-bubble')?.remove();const bubble=document.createElement('button');bubble.className='reader-note-bubble';bubble.textContent=mark.note||mark.quote||t('批注');bubble.setAttribute('aria-label',t('关闭'));bubble.onclick=()=>bubble.remove();layer.append(bubble);};layer.append(button);}
  }
  if(bookmark){const flag=document.createElement('button');flag.className='reader-bookmark-ribbon';flag.title=t('书签');flag.setAttribute('aria-label',t('书签'));flag.onclick=()=>reader.root.querySelector('#reader-notes').click();layer.append(flag);}
}
