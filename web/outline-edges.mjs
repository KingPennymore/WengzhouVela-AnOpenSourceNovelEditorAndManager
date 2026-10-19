import {t} from './i18n.mjs';
export function outlineEdges(value,relations=false){return [...(relations?[]:Object.entries(value.nodes).flatMap(([id,node])=>(node.children||[]).map(child=>({...value.nodes[child]?.parentEdge,from:id,to:child,tree:true})))),...value.edges];}
export function outlineEdgeGeometry(edge,positions,sizes,relations=false){
 const a=positions[edge.from],b=positions[edge.to];if(!a||!b)return null;
 const sa=sizes[edge.from],sb=sizes[edge.to],forward=b.x>=a.x,ac={x:a.x+sa.width/2,y:a.y+sa.height/2},bc={x:b.x+sb.width/2,y:b.y+sb.height/2},angle=Math.atan2(bc.y-ac.y,bc.x-ac.x),x1=relations?ac.x+Math.cos(angle)*sa.width/2:a.x+(forward?sa.width:0),y1=relations?ac.y+Math.sin(angle)*sa.height/2:ac.y,x2=relations?bc.x-Math.cos(angle)*sb.width/2:b.x+(forward?0:sb.width),y2=relations?bc.y-Math.sin(angle)*sb.height/2:bc.y,bend=forward?60:-60;
 return {x1,y1,x2,y2,d:relations?`M${x1} ${y1} Q${(x1+x2)/2-Math.sin(angle)*22} ${(y1+y2)/2+Math.cos(angle)*22} ${x2} ${y2}`:`M${x1} ${y1} C${x1+bend} ${y1} ${x2-bend} ${y2} ${x2} ${y2}`};
}
export function updateOutlineEdge(group,geometry){for(const path of group.querySelectorAll('path'))path.setAttribute('d',geometry.d);const text=group.querySelector('text');if(text){text.setAttribute('x',(geometry.x1+geometry.x2)/2);text.setAttribute('y',(geometry.y1+geometry.y2)/2-6);}}
export function createOutlineEdge(svg,edge,geometry,relations,onRelation,onParent){
 const make=tag=>document.createElementNS(svg.namespaceURI,tag),group=make('g'),line=make('path'),direction=edge.direction||(relations?'none':'forward');
 line.setAttribute('class',edge.tree?'outline-tree-edge':'outline-relation-edge');if(edge.style==='dashed')line.setAttribute('stroke-dasharray','6 4');
 if(['forward','both'].includes(direction))line.setAttribute('marker-end','url(#outline-tip)');if(['backward','both'].includes(direction))line.setAttribute('marker-start','url(#outline-tip)');line.style.pointerEvents='stroke';
 if(edge.tree){group.dataset.treeEdge=edge.to;group.onclick=()=>onParent?.(edge.to);}else{group.dataset.relation=edge.id;group.onclick=()=>onRelation(edge.id);}
 const title=make('title');title.textContent=edge.description||edge.label||t('连线');group.append(title,line);
 const hit=make('path');hit.setAttribute('class','outline-edge-hit');hit.style.stroke='transparent';hit.style.strokeWidth='18';group.append(hit);
 group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',edge.label||t('连线'));group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();group.onclick();}};
 if(edge.label){const text=make('text');text.textContent=edge.label;group.append(text);}updateOutlineEdge(group,geometry);return group;
}
