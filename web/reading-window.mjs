const cache=new Map();
export class ReadingWindow{
  constructor(text,size=12000){this.text=text;this.chunks=[];this.layouts=new Map();let from=0;while(from<text.length){let to=Math.min(text.length,from+size);if(to<text.length){const line=text.lastIndexOf('\n',to-1);if(line>from+size/2)to=line+1;else if(/[\uD800-\uDBFF]/.test(text[to-1]))to--;}this.chunks.push({from,to});from=to;}if(!this.chunks.length)this.chunks=[{from:0,to:0}];}
  at(offset){let low=0,high=this.chunks.length-1;while(low<high){const middle=Math.ceil((low+high)/2);if(this.chunks[middle].from<=offset)low=middle;else high=middle-1;}return low;}
  textAt(index){const chunk=this.chunks[index];return this.text.slice(chunk.from,chunk.to);}
  layout(key){if(!this.layouts.has(key)){this.layouts.set(key,new Array(this.chunks.length).fill(null));while(this.layouts.size>3)this.layouts.delete(this.layouts.keys().next().value);}return this.layouts.get(key);}
  info(index,page,counts){const complete=counts.every(Number.isFinite),prefix=counts.slice(0,index).reduce((sum,value)=>sum+(value||0),0),total=complete?counts.reduce((sum,value)=>sum+value,0):null;return {page:prefix+page+1,pages:total,complete,prefixKnown:counts.slice(0,index).every(Number.isFinite)};}
}
export function readingWindow(doc){let record=cache.get(doc.id);if(!record||record.text!==doc.text){record=new ReadingWindow(doc.text);cache.delete(doc.id);cache.set(doc.id,record);while(cache.size>4||[...cache.values()].reduce((sum,item)=>sum+item.text.length,0)>8*1024*1024){if(cache.size===1)break;cache.delete(cache.keys().next().value);}}return record;}
export class ReadingScrollWindow{
  constructor(model,{width,fontSize,lineHeight}){this.model=model;const columns=Math.max(4,Math.floor(width/fontSize)),linePixels=fontSize*lineHeight;this.heights=model.chunks.map((_,index)=>{let lines=0;for(const line of model.textAt(index).split('\n'))lines+=Math.max(1,Math.ceil(line.length/columns));return Math.max(linePixels,lines*linePixels);});this.rebuild();}
  rebuild(){this.prefix=[0];for(const height of this.heights)this.prefix.push(this.prefix.at(-1)+height);this.total=this.prefix.at(-1);}
  measured(index,height){if(height>0&&Number.isFinite(height)&&Math.abs(this.heights[index]-height)>.5){this.heights[index]=height;this.rebuild();}}
  at(top){let low=0,high=this.heights.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(this.prefix[mid]<=top)low=mid;else high=mid-1;}return low;}
}
