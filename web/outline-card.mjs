const lines=(text,max)=>Math.max(1,Math.min(max,String(text||'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].length/14)),0)));
export const outlineNodeSize=node=>({width:230,height:Math.max(128,lines(node.title,2)*18+20+lines(node.summary,3)*18+16+lines(node.detail,6)*18+16+12)});
