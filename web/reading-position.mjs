export function resolveReadingOffset(text,position){
  const offset=Math.max(0,Math.min(text.length,Math.round(position?.offset||0)));
  if(!position?.context||text.slice(offset,offset+position.context.length)===position.context)return offset;
  const start=Math.max(0,offset-5000),near=text.slice(start,offset+5000).indexOf(position.context);
  return near<0?offset:start+near;
}
const indexes=new WeakMap();
export function invalidateTextIndex(root){indexes.delete(root);}
function textIndex(root){let index=indexes.get(root);if(index)return index;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],offsets=[];let node,length=0;while(node=walker.nextNode()){offsets.push(length);nodes.push(node);length+=node.length;}index={nodes,offsets,length};indexes.set(root,index);return index;}
export function textPoint(root,offset){const {nodes,offsets,length}=textIndex(root);if(!nodes.length)return null;offset=Math.max(0,Math.min(length,offset));let low=0,high=nodes.length-1;while(low<high){const middle=Math.ceil((low+high)/2);if(offsets[middle]<=offset)low=middle;else high=middle-1;}return {node:nodes[low],offset:Math.min(nodes[low].length,offset-offsets[low])};}
export function characterRect(root,offset){const point=textPoint(root,offset);if(!point)return null;const range=document.createRange();const from=Math.min(point.offset,Math.max(0,point.node.length-1));range.setStart(point.node,from);range.setEnd(point.node,Math.min(point.node.length,from+1));return range.getBoundingClientRect();}
export function selectionOffsets(root,selection=getSelection()){
  if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
  const prefix=document.createRange();prefix.selectNodeContents(root);prefix.setEnd(range.startContainer,range.startOffset);const from=prefix.toString().length;return {from,to:from+range.toString().length,quote:range.toString()};
}
export function visibleTextOffset(root,viewport,paged){
  const box=viewport.getBoundingClientRect();let low=0,high=textIndex(root).length;
  while(low<high){const middle=(low+high)>>1,rect=characterRect(root,middle);if(!rect)break;
    if(paged?rect.right<=box.left+.5:rect.bottom<=box.top+.5)low=middle+1;else high=middle;
  }return low;
}
