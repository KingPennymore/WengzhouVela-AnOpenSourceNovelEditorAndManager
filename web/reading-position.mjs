export function resolveReadingOffset(text,position){
  const offset=Math.max(0,Math.min(text.length,Math.round(position?.offset||0)));
  if(!position?.context||text.slice(offset,offset+position.context.length)===position.context)return offset;
  const start=Math.max(0,offset-5000),near=text.slice(start,offset+5000).indexOf(position.context);
  return near<0?offset:start+near;
}
export function textPoint(root,offset){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,last;
  while(node=walker.nextNode()){last=node;if(offset<node.length)return {node,offset};offset-=node.length;}
  return last?{node:last,offset:last.length}:null;
}
export function characterRect(root,offset){const point=textPoint(root,offset);if(!point)return null;const range=document.createRange();const from=Math.min(point.offset,Math.max(0,point.node.length-1));range.setStart(point.node,from);range.setEnd(point.node,Math.min(point.node.length,from+1));return range.getBoundingClientRect();}
export function visibleTextOffset(root,viewport,paged){
  const box=viewport.getBoundingClientRect();let low=0,high=root.textContent.length;
  while(low<high){const middle=(low+high)>>1,rect=characterRect(root,middle);if(!rect)break;
    if(paged?rect.right<=box.left+.5:rect.bottom<=box.top+.5)low=middle+1;else high=middle;
  }return low;
}
