// visualViewport handles keyboards that overlay the WebView. Hosts that already
// resize their WebView report the smaller innerHeight and are not reduced twice.
export function viewportGeometry(layoutHeight,visual){
  const zoomed=visual&&Math.abs((visual.scale||1)-1)>.05;
  const height=visual&&!zoomed?Math.min(layoutHeight,visual.height):layoutHeight;
  return {height:Math.max(120,height),top:0,keyboard:!zoomed&&layoutHeight-height>80};
}
export function bindViewport(changed){
  let previous,focusFrame=0;
  const revealFocus=()=>{cancelAnimationFrame(focusFrame);focusFrame=requestAnimationFrame(()=>{
    const field=document.activeElement;if(!field?.matches('input:not([type=hidden]),textarea,select')||!field.closest('#dialog,.planning-sheet,.map-tools-panel,.outline-detail,.sidebar-view-body,#library,#outline'))return;
    const rect=field.getBoundingClientRect();let pane=field.parentElement;
    while(pane&&pane!==document.body){if(/auto|scroll/.test(getComputedStyle(pane).overflowY)&&pane.scrollHeight>pane.clientHeight){const bounds=pane.getBoundingClientRect(),top=Math.max(0,bounds.top)+12,bottom=Math.min(bounds.bottom,Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-height'))||innerHeight)-12;if(rect.bottom>bottom)pane.scrollTop+=rect.bottom-bottom;else if(rect.top<top)pane.scrollTop+=rect.top-top;break;}pane=pane.parentElement;}
  });};
  const update=()=>{const value=viewportGeometry(innerHeight,window.visualViewport),key=[innerWidth,value.height,value.top,value.keyboard].join();if(window.scrollX||window.scrollY)window.scrollTo(0,0);if(key===previous)return;previous=key;document.documentElement.style.setProperty('--app-height',value.height+'px');document.documentElement.style.setProperty('--visual-top',value.top+'px');document.body.dataset.keyboard=String(value.keyboard);changed?.();revealFocus();};
  window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);update();
  document.addEventListener('focusin',revealFocus);
}
