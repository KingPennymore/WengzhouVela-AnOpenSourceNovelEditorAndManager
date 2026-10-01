import {autocompletion,completionKeymap} from '@codemirror/autocomplete';
import {keymap} from '@codemirror/view';
import {documentKind} from './model.mjs';
export function novelCompletion(context){
  const word=context.matchBefore(/[\p{L}\p{N}_]{1,40}/u);
  if(!word||!context.explicit&&word.text.length<2)return null;
  const text=context.state.doc.sliceString(Math.max(0,context.pos-12000),Math.min(context.state.doc.length,context.pos+12000));
  const words=[...new Set(text.match(/[A-Za-z_][\w]{2,39}|[\u4e00-\u9fff]{2,8}/g)||[])];
  return {from:word.from,options:words.filter(value=>value!==word.text&&value.startsWith(word.text)).slice(0,80).map(label=>({label,type:'text'})),validFor:/^[\p{L}\p{N}_]*$/u};
}
export function completionExtensions(doc){return [autocompletion({defaultKeymap:false,override:['TXT','CSV','MD','VELA'].includes(documentKind(doc))?[novelCompletion]:undefined}),keymap.of(completionKeymap.filter(binding=>binding.key!=='Tab'))];}
