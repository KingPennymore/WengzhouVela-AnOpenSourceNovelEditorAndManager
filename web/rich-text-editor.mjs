// CodeMirror layer for TXT formatting (.vela v3 sidecars). Entries live in editor state, follow every text
// change, and are part of undo history; the TXT itself is never changed by formatting.
import {StateEffect,StateField,RangeSetBuilder,MapMode} from '@codemirror/state';
import {EditorView,Decoration} from '@codemirror/view';
import {invertedEffects} from '@codemirror/commands';
import {newEntryId} from './rich-text.mjs';

const mapEntries=(entries,changes,doc)=>{
  const next=[];
  for(const entry of entries){
    if(entry.group==='inserts'){const at=changes.mapPos(entry.from,-1);next.push({...entry,from:at,to:at});continue;}
    if(entry.group==='blocks'){
      // A paragraph format stays with its line. When the line is deleted or joined to the previous one
      // (Backspace at its start), the format goes with it, as in common word processors.
      if(entry.to>entry.from&&changes.mapPos(entry.from,1,MapMode.TrackDel)===null&&changes.mapPos(entry.to,-1,MapMode.TrackDel)===null)continue;
      const at=changes.mapPos(entry.from,-1),line=doc.lineAt(at);if(at!==line.from)continue;
      if(!next.some(item=>item.group==='blocks'&&item.type===entry.type&&item.from===line.from))next.push({...entry,from:line.from,to:line.to});continue;
    }
    // Inline: text typed at the end continues the format, text typed at the start does not.
    const from=changes.mapPos(entry.from,1),to=changes.mapPos(entry.to,1);if(to>from)next.push({...entry,from,to});
  }
  return next.sort((a,b)=>a.from-b.from||a.to-b.to);
};
const mapState=(value,changes,doc)=>({entries:mapEntries(value.entries,changes,doc),review:value.review,source:value.source});

/** Replaces the whole format state. Positions are in the document after the transaction's changes. */
export const setFormats=StateEffect.define({map:(value,mapping)=>({...value,entries:value.entries.map(entry=>entry.group==='inserts'?{...entry,from:mapping.mapPos(entry.from,-1),to:mapping.mapPos(entry.from,-1)}:{...entry,from:mapping.mapPos(entry.from,1),to:mapping.mapPos(entry.to,1)}).filter(entry=>entry.group==='inserts'||entry.to>entry.from||entry.group==='blocks')})});

export const formatField=StateField.define({
  create:()=>({entries:[],review:[],source:null}),
  update(value,tr){
    let next=tr.docChanged?mapState(value,tr.changes,tr.newDoc):value;
    for(const effect of tr.effects)if(effect.is(setFormats))next={...next,...effect.value,entries:[...effect.value.entries].sort((a,b)=>a.from-b.from||a.to-b.to)};
    return next;
  }
});
const lost=tr=>{if(!tr.docChanged)return false;const before=tr.startState.field(formatField).entries;let touched=false;tr.changes.iterChangedRanges((from,to)=>{if(!touched&&to>from)touched=before.some(entry=>entry.from<to&&entry.to>from||entry.group==='blocks'&&entry.from>=from&&entry.from<=to);});return touched;};
// Undo restores the formats that a change or a format command replaced, including formats lost with deleted text.
const undoFormats=invertedEffects.of(tr=>tr.effects.some(effect=>effect.is(setFormats))||lost(tr)?[setFormats.of({entries:tr.startState.field(formatField).entries})]:[]);

const inline={strong:Decoration.mark({class:'vela-format-strong',inclusiveEnd:true}),emphasis:Decoration.mark({class:'vela-format-emphasis',inclusiveEnd:true})};
const lines={center:Decoration.line({class:'vela-format-center'}),right:Decoration.line({class:'vela-format-right'})};
const decorations=EditorView.decorations.compute([formatField],state=>{
  const builder=new RangeSetBuilder(),items=[];
  for(const entry of state.field(formatField).entries){
    if(entry.group==='marks'&&inline[entry.type]&&entry.to>entry.from)items.push([entry.from,entry.to,inline[entry.type]]);
    else if(entry.group==='blocks'&&entry.type==='align'&&lines[entry.value])items.push([entry.from,entry.from,lines[entry.value]]);
  }
  // Line decorations must come before marks starting at the same position.
  items.sort((a,b)=>a[0]-b[0]||(a[1]===a[0]?-1:0)-(b[1]===b[0]?-1:0));
  for(const [from,to,decoration] of items)builder.add(from,to,decoration);
  return builder.finish();
});
const theme=EditorView.baseTheme({
  '.vela-format-strong':{fontWeight:'700'},
  '.vela-format-emphasis':{textEmphasis:'filled dot',textEmphasisPosition:'under right',WebkitTextEmphasis:'filled dot',WebkitTextEmphasisPosition:'under right'},
  '.vela-format-center':{textAlign:'center'},
  '.vela-format-right':{textAlign:'right'}
});

/** Editor extensions with the initial entries (already placed in `doc`) and review list. */
export function richTextExtensions({entries=[],review=[],source=null}={}){
  return [formatField.init(()=>({entries:[...entries].sort((a,b)=>a.from-b.from||a.to-b.to),review,source})),undoFormats,decorations,theme];
}
export const formatsOf=state=>state.field(formatField,false);

const covered=(entries,type,from,to)=>{let at=from;for(const entry of entries.filter(entry=>entry.group==='marks'&&entry.type===type).sort((a,b)=>a.from-b.from)){if(entry.from>at)break;at=Math.max(at,entry.to);if(at>=to)return true;}return false;};
/** Toggles an inline format over the selection: removes it when the whole selection has it, otherwise adds it. */
export function toggleInline(view,type){
  const value=formatsOf(view.state);if(!value)return false;
  const ranges=view.state.selection.ranges.filter(range=>!range.empty);if(!ranges.length)return false;
  const remove=ranges.every(range=>covered(value.entries,type,range.from,range.to));
  let entries=value.entries;
  for(const {from,to} of ranges){
    const same=entries.filter(entry=>entry.group==='marks'&&entry.type===type),others=entries.filter(entry=>!same.includes(entry)),kept=[];
    if(remove){for(const entry of same){if(entry.to<=from||entry.from>=to){kept.push(entry);continue;}if(entry.from<from)kept.push({...entry,to:from});if(entry.to>to)kept.push({...entry,id:newEntryId(),from:to});}}
    else{let start=from,end=to,id=null;for(const entry of same){if(entry.to<from||entry.from>to){kept.push(entry);continue;}start=Math.min(start,entry.from);end=Math.max(end,entry.to);id||=entry.id;}kept.push({id:id||newEntryId(),group:'marks',type,from:start,to:end});}
    entries=[...others,...kept];
  }
  view.dispatch({effects:setFormats.of({entries}),userEvent:'format'});return true;
}
/** Sets (or clears, when the lines already have it) paragraph alignment for every line in the selection. */
export function toggleAlign(view,value){
  const state=formatsOf(view.state);if(!state)return false;
  const lineStarts=new Set();for(const range of view.state.selection.ranges){for(let line=view.state.doc.lineAt(range.from);;line=view.state.doc.line(line.number+1)){lineStarts.add(line.from);if(line.to>=range.to||line.number===view.state.doc.lines)break;}}
  const current=state.entries.filter(entry=>entry.group==='blocks'&&entry.type==='align'&&lineStarts.has(entry.from));
  const clear=lineStarts.size===current.length&&current.every(entry=>entry.value===value);
  const entries=state.entries.filter(entry=>!(entry.group==='blocks'&&entry.type==='align'&&lineStarts.has(entry.from)));
  if(!clear)for(const from of lineStarts){const line=view.state.doc.lineAt(from),old=current.find(entry=>entry.from===from);entries.push({id:old?.id||newEntryId(),group:'blocks',type:'align',value,from:line.from,to:line.to});}
  view.dispatch({effects:setFormats.of({entries}),userEvent:'format'});return true;
}
/** Applies a review entry to the current selection, or drops it; the review list is not part of undo. */
export function settleReview(view,id,{apply=false}={}){
  const state=formatsOf(view.state);if(!state)return false;const item=state.review.find(entry=>entry.id===id);if(!item)return false;
  const review=state.review.filter(entry=>entry!==item),range=view.state.selection.main,entries=[...state.entries];
  if(apply){if(item.group==='blocks'){const line=view.state.doc.lineAt(range.head);entries.push({...item,reason:undefined,from:line.from,to:line.to});}else if(item.group==='inserts')entries.push({...item,reason:undefined,from:range.head,to:range.head});else{if(range.empty)throw Error('请先选中要应用此格式的文字。');entries.push({...item,reason:undefined,from:range.from,to:range.to});}}
  view.dispatch({effects:setFormats.of({entries,review}),userEvent:'format'});return true;
}
export const isFormatActive=(state,type)=>{const value=formatsOf(state);if(!value)return false;const range=state.selection.main;return !range.empty&&covered(value.entries,type,range.from,range.to);};
