// Test-only world-to-canvas coordinates. Fixtures must work after automatic fit
// and after returning to a manually panned/zoomed map.
export async function installMapCanvasProbe(page){
 function setup(){
  if(window.velaCanvasProbeInstalled)return;window.velaCanvasProbeInstalled=true;
  const prototype=CanvasRenderingContext2D.prototype,clear=prototype.clearRect,scale=prototype.scale;
  prototype.clearRect=function(...args){if(this.canvas.closest('.map-stage'))this.canvas.probeNeedsPlane=true;return clear.apply(this,args);};
  prototype.scale=function(...args){const result=scale.apply(this,args);if(this.canvas.probeNeedsPlane){const m=this.getTransform();this.canvas.testWorldTransform={a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};this.canvas.probeNeedsPlane=false;}return result;};
 }
 await page.addInitScript(setup);await page.evaluate(setup);
}
export function worldToCanvas(canvas,point,{pixels=false}={}){return canvas.evaluate((canvas,{point,pixels})=>{const m=canvas.testWorldTransform;if(!m)throw Error('Map has not painted yet');const dpr=pixels?1:Math.min(devicePixelRatio||1,2);return {x:(m.a*point.x+m.c*point.y+m.e)/dpr,y:(m.b*point.x+m.d*point.y+m.f)/dpr};},{point,pixels});}
