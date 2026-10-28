/** Shared by the host preview and the optional reader, bundled into each without a runtime dependency. */
export function canvasDensity(width,height,density=1,maxPixels=16000000) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('PDF 页面尺寸无效。');
  return Math.min(2,Math.max(1,density||1),Math.sqrt(maxPixels/(width*height)),16384/width,16384/height);
}
const dimensions=new WeakMap();
export function pdfPageSizes(pdf) {
  let pending=dimensions.get(pdf);
  if(!pending){
    pending=(async()=>{const sizes=[];for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),size=page.getViewport({scale:1});sizes.push({width:size.width,height:size.height});if(number%16===0)await new Promise(resolve=>setTimeout(resolve,0));}return sizes;})();
    dimensions.set(pdf,pending);pending.catch(()=>dimensions.delete(pdf));
  }
  return pending;
}
