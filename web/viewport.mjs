// visualViewport handles keyboards that overlay the WebView. Hosts that already
// resize their WebView report the smaller innerHeight and are not reduced twice.
export function viewportGeometry(layoutHeight,visual){
  const zoomed=visual&&Math.abs((visual.scale||1)-1)>.05;
  const height=visual&&!zoomed?Math.min(layoutHeight,visual.height):layoutHeight;
  return {height:Math.max(120,height),top:0,keyboard:!zoomed&&layoutHeight-height>80};
}
export function bindViewport(changed){
  const update=()=>{const value=viewportGeometry(innerHeight,window.visualViewport);document.documentElement.style.setProperty('--app-height',value.height+'px');document.documentElement.style.setProperty('--visual-top',value.top+'px');document.body.dataset.keyboard=String(value.keyboard);if(window.scrollX||window.scrollY)window.scrollTo(0,0);changed?.();};
  window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);update();
}
