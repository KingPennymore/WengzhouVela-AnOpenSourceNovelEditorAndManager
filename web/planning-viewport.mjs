// Fit the actual content bounds and align their centre with the viewport centre.
// Return null while the host is hidden or its layout is not ready yet.
export function fitPlanningPlane(bounds,width,height,{padding=24,maxScale=1}={}){
  if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height,width,height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0||width<=padding*2||height<=padding*2)return null;
  const scale=Math.min(maxScale,(width-padding*2)/bounds.width,(height-padding*2)/bounds.height);
  return {x:width/2-(bounds.x+bounds.width/2)*scale,y:height/2-(bounds.y+bounds.height/2)*scale,scale};
}
