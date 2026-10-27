export function bindTextZoom(target,getSize,setSize,finish) {
  let start=0,size=0;
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  target.addEventListener('touchstart',event=>{if(event.target.closest('.planning-preview'))return;if(event.touches.length===2){start=distance(event.touches);size=getSize();event.preventDefault();}},{passive:false});
  target.addEventListener('touchmove',event=>{if(event.target.closest('.planning-preview'))return;if(event.touches.length===2&&start){event.preventDefault();setSize(size*distance(event.touches)/start);}},{passive:false});
  const end=event=>{if(start&&event.touches.length<2){start=0;finish();}};
  target.addEventListener('touchend',end);target.addEventListener('touchcancel',end);
  target.addEventListener('wheel',event=>{if(event.target.closest('.planning-preview'))return;if(event.ctrlKey||event.metaKey){event.preventDefault();setSize(getSize()*Math.exp(-event.deltaY*.01));finish();}},{passive:false});
  let gestureSize=0;target.addEventListener('gesturestart',event=>{event.preventDefault();gestureSize=getSize();},{passive:false});target.addEventListener('gesturechange',event=>{event.preventDefault();if(gestureSize)setSize(gestureSize*event.scale);},{passive:false});target.addEventListener('gestureend',event=>{event.preventDefault();gestureSize=0;finish();},{passive:false});
}
export function bindPlane(target,state,paint,{canPan=()=>true,onPinch=()=>{},wheel='zoom',minScale=.00000001,maxScale=6,onStart=()=>{},onFinish=()=>{}}={}){
 const points=new Map();let pan=null,pinch=null,wheelTimer=0;
 const local=e=>{const r=target.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};},distance=()=>{const [a,b]=[...points.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
 const zoom=(scale,x,y)=>{const next=Math.max(minScale,Math.min(maxScale,scale)),ratio=next/state.scale;state.x=x-(x-state.x)*ratio;state.y=y-(y-state.y)*ratio;state.scale=next;paint();};
 target.addEventListener('wheel',e=>{e.preventDefault();onStart();const p=local(e);if(wheel==='pan'&&!e.ctrlKey&&!e.metaKey){const unit=e.deltaMode===1?16:e.deltaMode===2?target.clientHeight:1;state.x-=(e.shiftKey?(e.deltaX||e.deltaY):e.deltaX)*unit;state.y-=(e.shiftKey?0:e.deltaY)*unit;paint();}else zoom(state.scale*Math.exp(-e.deltaY*.002),p.x,p.y);clearTimeout(wheelTimer);wheelTimer=setTimeout(onFinish,120);},{passive:false});
 target.addEventListener('pointerdown',e=>{if(e.button>0&&!(wheel==='pan'&&e.button===1))return;const p=local(e);points.set(e.pointerId,p);if(points.size===2){onStart();onPinch();pan=null;pinch={distance:distance(),scale:state.scale};}else if(canPan(e)){onStart();target.setPointerCapture(e.pointerId);pan={id:e.pointerId,x:p.x,y:p.y,tx:state.x,ty:state.y};}});
 target.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;const p=local(e);points.set(e.pointerId,p);if(points.size===2&&pinch){const [a,b]=[...points.values()];zoom(pinch.scale*distance()/Math.max(1,pinch.distance),(a.x+b.x)/2,(a.y+b.y)/2);}else if(pan?.id===e.pointerId){state.x=pan.tx+p.x-pan.x;state.y=pan.ty+p.y-pan.y;paint();}});
 const end=e=>{const active=pan||pinch;points.delete(e.pointerId);pan=null;pinch=null;if(active)onFinish();};target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);return {zoom,cancel:()=>{pan=null;pinch=null;points.clear();},forget:id=>{points.delete(id);if(pan?.id===id)pan=null;if(points.size<2)pinch=null;}};
}
