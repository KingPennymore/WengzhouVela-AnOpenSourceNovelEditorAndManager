import {Direction,EditorView,RectangleMarker,drawSelection,layer} from '@codemirror/view';

// Keep CodeMirror's range, wrapping and bidi geometry, but use the same
// horizontal bounds as the active paragraph instead of the content padding.
export function paragraphSelection(){
  return [EditorView.editorAttributes.of(view=>({class:view.state.selection.ranges.some(range=>!range.empty)?'has-selection':''})),drawSelection(),layer({
    above:false,
    class:'wenzhou-selection-layer',
    markers(view){
      const line=view.contentDOM.querySelector('.cm-line');
      if(!line)return [];
      const bounds=line.getBoundingClientRect(),scroll=view.scrollDOM.getBoundingClientRect();
      const origin=(view.textDirection===Direction.LTR?scroll.left:scroll.right-view.scrollDOM.clientWidth*view.scaleX)-view.scrollDOM.scrollLeft*view.scaleX;
      const left=bounds.left-origin,right=bounds.right-origin,markers=[];
      for(const range of view.state.selection.ranges){
        if(range.empty)continue;
        for(const marker of RectangleMarker.forRange(view,'cm-selectionBackground',range)){
          const start=Math.max(left,marker.left),end=Math.min(right,marker.left+marker.width);
          if(end>start)markers.push(new RectangleMarker('cm-selectionBackground',start,marker.top,end-start,marker.height));
        }
      }
      return markers;
    },
    update:update=>update.docChanged||update.selectionSet||update.viewportChanged
  })];
}
