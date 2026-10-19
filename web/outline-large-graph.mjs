import {bindPlane} from './gestures.mjs';
import {fitPlanningPlane} from './planning-viewport.mjs';
import {outlinePositions} from './outline-layout.mjs';
import {outlineNodeSize} from './outline-card.mjs';
import {relationDegrees,relationSize} from './outline-collections.mjs';
import {outlineEdges,outlineEdgeGeometry,createOutlineEdge,updateOutlineEdge} from './outline-edges.mjs';
import {t} from './i18n.mjs';

const models=new Map();let retainedNodes=0,retainedEdges=0;
const intersects=(a,b)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
function edgeBounds(g){return {left:Math.min(g.x1,g.x2)-100,right:Math.max(g.x1,g.x2)+100,top:Math.min(g.y1,g.y2)-100,bottom:Math.max(g.y1,g.y2)+100};}
function graphModel(value,state,relations,revision){
 const collapsed=JSON.stringify([...state.collapsed]),previous=models.get(state);
 if(previous){models.delete(state);retainedNodes-=previous.nodes.length;retainedEdges-=previous.edges.length;}
 let model=previous?.value===value&&previous.revision===revision&&previous.collapsed===collapsed?previous:null;
 if(!model){
  const positions=outlinePositions(value,relations?new Set():state.collapsed,relations?180:100),degrees=relations?relationDegrees(value):{},sizes={},nodes=[];
  const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
  for(const [id,p] of Object.entries(positions)){const size=sizes[id]=relations?relationSize(degrees[id]):outlineNodeSize(value.nodes[id]);nodes.push({id,node:value.nodes[id],p,size});bounds.left=Math.min(bounds.left,p.x);bounds.top=Math.min(bounds.top,p.y);bounds.right=Math.max(bounds.right,p.x+size.width);bounds.bottom=Math.max(bounds.bottom,p.y+size.height);}
  const adjacent=new Map(),edges=[];
  for(const edge of outlineEdges(value,relations)){const geometry=outlineEdgeGeometry(edge,positions,sizes,relations);if(!geometry)continue;const record={edge,geometry,bounds:edgeBounds(geometry)};edges.push(record);for(const id of new Set([edge.from,edge.to])){if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(record);}}
  model={value,revision,collapsed,positions,degrees,sizes,nodes,edges,adjacent,bounds};
 }
 models.set(state,model);retainedNodes+=model.nodes.length;retainedEdges+=model.edges.length;
 // Cache numeric layout data, never a hidden DOM or a running observer.
 while(models.size>12||retainedNodes>20000||retainedEdges>50000){const oldest=models.keys().next().value;retainedNodes-=models.get(oldest).nodes.length;retainedEdges-=models.get(oldest).edges.length;models.delete(oldest);}
 return model;
}
export function renderLargeOutlineGraph({root,value,state,escape:esc,onSelect,onMove,onEdge,onRelation,onParent,onFold,markdown=text=>esc(text),relations=false,revision}){
 root.graphDispose?.();
 const model=graphModel(value,state,relations,revision),{positions,sizes,nodes,edges,degrees}=model;
 state.plane||={x:0,y:0,scale:1};const plane=state.plane;
 root.innerHTML=`<div class="outline-plane outline-large-plane ${relations?'relations-plane':''}" tabindex="0" aria-label="${t('大纲画布')} · ${nodes.length} · ${t('方向键选择节点，回车查看')}"><div class="outline-graph-stage"><svg class="outline-lines" width="1" height="1"><defs><marker id="outline-tip" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0 8 4 0 8" fill="none" stroke="currentColor"/></marker></defs></svg></div><canvas class="outline-overview" aria-hidden="true"></canvas><span class="outline-large-hint"></span></div>`;
 const surface=root.firstElementChild,stage=surface.firstElementChild,svg=stage.firstElementChild,canvas=surface.querySelector('canvas'),ctx=canvas.getContext('2d'),hint=surface.querySelector('.outline-large-hint'),cards=new Map(),edgeViews=new Map();
 let frame=0,disposed=false,level='',clusters=new Map(),drag=null,link=null,press=null,moved=false,colors;
 const readColors=()=>{const css=getComputedStyle(root);colors={accent:css.getPropertyValue('--accent').trim()||'#3b7566',paper:css.getPropertyValue('--paper').trim()||'#fff',text:css.getPropertyValue('--text').trim()||'#263b34'};};readColors();
 const request=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(paint);};
 const box=padding=>({left:(-plane.x-padding)/plane.scale,right:(surface.clientWidth-plane.x+padding)/plane.scale,top:(-plane.y-padding)/plane.scale,bottom:(surface.clientHeight-plane.y+padding)/plane.scale});
 const nodeBounds=record=>({left:record.p.x,top:record.p.y,right:record.p.x+record.size.width,bottom:record.p.y+record.size.height});
 const makeCard=(record,detail)=>{
  const {id,node:n,p,size}=record;
  if(detail&&!relations&&record.detail===undefined){const template=document.createElement('template');template.innerHTML=markdown(n.detail||'');record.detail=template.content.textContent.trim();}
  const card=document.createElement('div');card.className='outline-graph-card'+(relations?' relation-card':'');card.dataset.card=id;card.dataset.degree=degrees[id]||0;card.style.cssText=`left:${p.x}px;top:${p.y}px;width:${size.width}px;height:${size.height}px;--node-color:${n.color||'var(--line)'}`;
  card.innerHTML=`<button data-node="${esc(id)}" aria-selected="${state.selected===id}">${relations?`<span class="relation-monogram" aria-hidden="true" data-user-content>${esc([...n.title].slice(0,2).join(''))}</span><strong data-user-content>${esc(n.title)}</strong><span class="relation-degree">${degrees[id]||0}</span>`:`<strong class="outline-node-title" data-user-content>${esc(n.title)}</strong><span class="outline-node-summary" data-user-content>${esc(n.summary||t('暂无概要'))}</span>${detail?`<span class="outline-node-detail" data-user-content>${esc(record.detail||t('暂无详情'))}</span>`:''}`}</button><button data-edge-handle="${esc(id)}" aria-label="${t('拖出连线')}">＋</button>${!relations&&n.children?.length?`<button data-graph-fold="${esc(id)}" aria-label="${t(state.collapsed.has(id)?'展开':'折叠')}">${state.collapsed.has(id)?'＋':'−'}</button>`:''}`;
  return card;
 };
 function paint(){
  frame=0;if(disposed)return;
  const width=surface.clientWidth,height=surface.clientHeight;if(!width||!height)return;
  stage.style.transform=`translate(${plane.x}px,${plane.y}px) scale(${plane.scale})`;
  if(drag&&level&&level!=='overview')return;
  const bounds=box(100),visible=nodes.filter(record=>intersects(nodeBounds(record),bounds)),overview=plane.scale<.32||visible.length>300,nextLevel=overview?'overview':plane.scale<.7?'summary':'detail';
  root.dataset.graphLevel=nextLevel;root.dataset.graphTotal=nodes.length;
  if(level!==nextLevel){for(const card of cards.values())card.remove();cards.clear();for(const group of edgeViews.values())group.remove();edgeViews.clear();level=nextLevel;}
  canvas.hidden=!overview;hint.hidden=!overview;
  if(overview){
   hint.textContent=t('点击图中区域放大 · 方向键选择节点');
   const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);clusters=new Map();const byNode=new Map();
   for(const record of visible){const x=plane.x+(record.p.x+record.size.width/2)*plane.scale,y=plane.y+(record.p.y+record.size.height/2)*plane.scale,key=Math.floor(x/18)+','+Math.floor(y/18);let cluster=clusters.get(key);if(!cluster){cluster={x:0,y:0,nodes:[]};clusters.set(key,cluster);}cluster.x+=x;cluster.y+=y;cluster.nodes.push(record);byNode.set(record.id,key);}
   for(const c of clusters.values()){c.x/=c.nodes.length;c.y/=c.nodes.length;}
   const drawn=new Set();ctx.beginPath();
   for(const {edge} of edges){const a=byNode.get(edge.from),b=byNode.get(edge.to);if(!a||!b||a===b)continue;const key=a<b?a+'|'+b:b+'|'+a;if(drawn.has(key))continue;drawn.add(key);const from=clusters.get(a),to=clusters.get(b);ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);}
   ctx.strokeStyle=colors.accent;ctx.globalAlpha=.3;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
   for(const c of clusters.values()){const count=c.nodes.length,r=count>1?Math.min(12,5+Math.log2(count)):3;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fillStyle=colors.accent;ctx.fill();if(count>1){ctx.fillStyle=colors.paper;ctx.fillText(String(count),c.x,c.y);}}
   root.dataset.graphRendered=String(clusters.size);return;
  }
  const retained=new Set(visible.map(record=>record.id));if(drag)retained.add(drag.id);
  for(const [id,card] of cards)if(!retained.has(id)){card.remove();cards.delete(id);}
  for(const record of visible)if(!cards.has(record.id)){const card=makeCard(record,level==='detail');cards.set(record.id,card);stage.append(card);}
  for(const [id,card] of cards)card.querySelector('[data-node]').setAttribute('aria-selected',String(state.selected===id));
  const retainedEdges=new Set();
  for(const record of edges){if(!intersects(record.bounds,bounds))continue;retainedEdges.add(record);if(!edgeViews.has(record)){const group=createOutlineEdge(svg,record.edge,record.geometry,relations,onRelation,onParent);edgeViews.set(record,group);svg.append(group);}}
  for(const [record,group] of edgeViews)if(!retainedEdges.has(record)){group.remove();edgeViews.delete(record);}
  root.dataset.graphRendered=String(cards.size);
 }
 const fitBounds=(bounds,maxScale=1)=>{const next=fitPlanningPlane({x:bounds.left,y:bounds.top,width:Math.max(1,bounds.right-bounds.left),height:Math.max(1,bounds.bottom-bounds.top)},surface.clientWidth,surface.clientHeight,{maxScale});if(!next)return false;Object.assign(plane,next);state.initialized=true;paint();return true;};
 const reveal=id=>{const p=positions[id],size=sizes[id];if(!p)return;plane.scale=Math.max(.8,plane.scale);plane.x=surface.clientWidth/2-(p.x+size.width/2)*plane.scale;plane.y=surface.clientHeight/2-(p.y+size.height/2)*plane.scale;state.initialized=true;paint();};
 root.graphFit=()=>fitBounds(model.bounds);root.graphInitialize=()=>{if(!state.initialized){if(state.selected)reveal(state.selected);else root.graphFit();}else paint();};
 function moveNode(id,p){positions[id]=p;const record=nodes.find(n=>n.id===id);record.p=p;const card=cards.get(id);if(card){card.style.left=p.x+'px';card.style.top=p.y+'px';}for(const record of model.adjacent.get(id)||[]){record.geometry=outlineEdgeGeometry(record.edge,positions,sizes,relations);record.bounds=edgeBounds(record.geometry);const group=edgeViews.get(record);if(group)updateOutlineEdge(group,record.geometry);}}
 surface.addEventListener('pointerdown',event=>{if(event.button>0||event.isPrimary===false)return;press={x:event.clientX,y:event.clientY};const handle=event.target.closest('[data-edge-handle]'),node=event.target.closest('[data-node]');if(handle){link=handle.dataset.edgeHandle;surface.setPointerCapture(event.pointerId);event.preventDefault();}else if(node){const id=node.dataset.node;drag={id,x:event.clientX,y:event.clientY,origin:{...positions[id]}};moved=false;surface.setPointerCapture(event.pointerId);}});
 surface.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>8)moved=true;if(moved)moveNode(drag.id,{x:drag.origin.x+dx/plane.scale,y:drag.origin.y+dy/plane.scale});});
 surface.addEventListener('pointerup',event=>{
  if(link){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-card]')?.dataset.card;if(target&&target!==link)onEdge(link,target);link=null;}
  if(drag){const {id}=drag;drag=null;if(moved){if(models.delete(state)){retainedNodes-=model.nodes.length;retainedEdges-=model.edges.length;}onMove(id,positions[id]);}else{onSelect(id);request();}press=null;return;}
  if(level==='overview'&&press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<8){const rect=surface.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let found,distance=16;for(const c of clusters.values()){const next=Math.hypot(c.x-x,c.y-y);if(next<distance){distance=next;found=c;}}if(found){if(found.nodes.length===1){const id=found.nodes[0].id;reveal(id);onSelect(id);}else{const b={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};for(const record of found.nodes){const r=nodeBounds(record);b.left=Math.min(b.left,r.left);b.right=Math.max(b.right,r.right);b.top=Math.min(b.top,r.top);b.bottom=Math.max(b.bottom,r.bottom);}fitBounds(b);}}}
  press=null;
 });
 const cancel=()=>{if(drag)moveNode(drag.id,drag.origin);drag=null;link=null;press=null;request();};surface.addEventListener('pointercancel',cancel);
 surface.addEventListener('click',event=>{const fold=event.target.closest('[data-graph-fold]');if(fold){const id=fold.dataset.graphFold;state.collapsed.has(id)?state.collapsed.delete(id):state.collapsed.add(id);onFold?.();}});
 surface.addEventListener('keydown',event=>{if(event.target!==surface||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Enter'].includes(event.key))return;event.preventDefault();let index=nodes.findIndex(n=>n.id===state.selected);if(event.key!=='Enter'){const direction=['ArrowDown','ArrowRight'].includes(event.key)?1:-1;index=index<0?(direction>0?0:nodes.length-1):(index+direction+nodes.length)%nodes.length;}const id=nodes[Math.max(0,index)]?.id;if(id){reveal(id);onSelect(id);request();}});
 surface.addEventListener('focusin',event=>{const id=event.target.closest('[data-node]')?.dataset.node;if(id&&!intersects(nodeBounds(nodes.find(n=>n.id===id)),box(0)))reveal(id);});
 bindPlane(surface,plane,request,{canPan:event=>!event.target.closest('[data-card]'),onPinch:cancel});
 const observer=new ResizeObserver(()=>{if(!state.initialized)root.graphInitialize();else request();});observer.observe(surface);
 const appearance=new MutationObserver(()=>{readColors();request();});appearance.observe(document.body,{attributes:true,attributeFilter:['class','style']});
 root.graphDispose=()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();appearance.disconnect();};
 if(state.reveal&&state.selected){reveal(state.selected);state.reveal=false;}
}
