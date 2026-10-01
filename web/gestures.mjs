export function bindTextZoom(target,getSize,setSize,finish) {
  let start=0,size=0;
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  target.addEventListener('touchstart',event=>{if(event.touches.length===2){start=distance(event.touches);size=getSize();event.preventDefault();}},{passive:false});
  target.addEventListener('touchmove',event=>{if(event.touches.length===2&&start){event.preventDefault();setSize(size*distance(event.touches)/start);}},{passive:false});
  const end=event=>{if(start&&event.touches.length<2){start=0;finish();}};
  target.addEventListener('touchend',end);target.addEventListener('touchcancel',end);
  target.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();setSize(getSize()*Math.exp(-event.deltaY*.01));finish();}},{passive:false});
  let gestureSize=0;target.addEventListener('gesturestart',event=>{event.preventDefault();gestureSize=getSize();},{passive:false});target.addEventListener('gesturechange',event=>{event.preventDefault();if(gestureSize)setSize(gestureSize*event.scale);},{passive:false});target.addEventListener('gestureend',event=>{event.preventDefault();gestureSize=0;finish();},{passive:false});
}
