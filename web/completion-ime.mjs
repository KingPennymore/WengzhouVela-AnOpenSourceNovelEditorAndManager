import {ViewPlugin} from '@codemirror/view';
import {closeCompletion,startCompletion} from '@codemirror/autocomplete';

// Windows IMEs first expose Latin pre-edit text, then replace it with Han text.
// Do not retain a Latin result through that replacement, even when validFor
// accepts both scripts. Query again after CodeMirror has read the final DOM edit.
export const completionIme=ViewPlugin.fromClass(class{
 constructor(view){this.view=view;this.timer=null;this.before=null;}
 start(){clearTimeout(this.timer);this.before=this.view.state.doc;closeCompletion(this.view);}
 end(){clearTimeout(this.timer);this.timer=setTimeout(()=>{
  this.timer=null;const view=this.view,selection=view.state.selection.main;
  if(!view.hasFocus||view.compositionStarted||!selection.empty||!this.before||this.before.eq(view.state.doc))return;
  if(/[\p{L}\p{N}_]$/u.test(view.state.doc.sliceString(Math.max(0,selection.head-2),selection.head)))startCompletion(view);
 },50);}
 destroy(){clearTimeout(this.timer);this.before=null;}
},{eventHandlers:{compositionstart(){this.start();},compositionend(){this.end();}}});

export function afterComposition(source){
 return context=>{
  if(context.view?.compositionStarted)return null;
  const result=source(context);
  return result?.then?result.then(value=>context.view?.compositionStarted?null:value):result;
 };
}
