// CodeMirror layer for TXT formatting (.vela v3 sidecars). Entries live in editor state, follow every text
// change, and are part of undo history; the TXT itself is never changed by formatting.
import {StateEffect,StateField,MapMode,Facet} from '@codemirror/state';
import {EditorView,Decoration,WidgetType} from '@codemirror/view';
import {invertedEffects} from '@codemirror/commands';
import {newEntryId,MAX_RUBY} from './rich-text.mjs';
import {styleCss} from './rich-text-styles.mjs';

/** Named style definitions (ID → definition) used to draw `style` entries. */
export const formatStyles=Facet.define({combine:values=>values.at(-1)||{}});
/** src → Promise<URL> for illustrations, or null where workspace images cannot be read. */
export const imageLoader=Facet.define({combine:values=>values.at(-1)||null});

const sameKind=(a,b)=>a.group===b.group&&a.type===b.type&&(a.value??null)===(b.value??null);
const mapEntries=(entries,changes,doc)=>{
  const next=[];
  for(const entry of entries){
    // An illustration stays after its paragraph: typing extends the line, Enter at its end leaves it in place.
    if(entry.group==='inserts'){const line=doc.lineAt(changes.mapPos(entry.from,-1));next.push({...entry,from:line.to,to:line.to});continue;}
    if(entry.group==='blocks'){
      // A paragraph format stays with its line. When the line is deleted or joined to the previous one
      // (Backspace at its start), the format goes with it, as in common word processors.
      if(entry.to>entry.from&&changes.mapPos(entry.from,1,MapMode.TrackDel)===null&&changes.mapPos(entry.to,-1,MapMode.TrackDel)===null)continue;
      const at=changes.mapPos(entry.from,-1),line=doc.lineAt(at);if(at!==line.from)continue;
      if(!next.some(item=>item.group==='blocks'&&item.type===entry.type&&item.from===line.from))next.push({...entry,from:line.from,to:line.to});continue;
    }
    // Inline: text typed at the end continues the format, text typed at the start does not. A reading (ruby)
    // belongs to its base characters and does not grow.
    const from=changes.mapPos(entry.from,1),to=changes.mapPos(entry.to,entry.type==='ruby'?-1:1);if(to>from)next.push({...entry,from,to});
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
const lost=tr=>{if(!tr.docChanged)return false;const before=tr.startState.field(formatField).entries;let touched=false;tr.changes.iterChangedRanges((from,to)=>{if(!touched&&to>from)touched=before.some(entry=>entry.from<to&&entry.to>from||entry.group!=='marks'&&entry.from>=from&&entry.from<=to);});return touched;};
// Undo restores the formats that a change or a format command replaced, including formats lost with deleted text.
const undoFormats=invertedEffects.of(tr=>tr.effects.some(effect=>effect.is(setFormats))||lost(tr)?[setFormats.of({entries:tr.startState.field(formatField).entries})]:[]);

class ImageWidget extends WidgetType{
  constructor(entry,load){super();this.entry=entry;this.load=load;}
  eq(other){return other.entry.id===this.entry.id&&other.entry.src===this.entry.src&&other.entry.alt===this.entry.alt&&other.load===this.load;}
  get estimatedHeight(){return 180;}
  toDOM(){
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');figure.className='vela-format-image';figure.dataset.formatImage=this.entry.id;figure.title='插图：'+this.entry.src+'（点击编辑）';
    caption.textContent=this.entry.alt||this.entry.src;
    const placeholder=message=>{const box=document.createElement('div');box.className='vela-format-image-missing';box.textContent=message;figure.prepend(box);};
    const pending=this.load?.(this.entry.src);
    if(pending)pending.then(url=>{const image=document.createElement('img');image.alt=this.entry.alt||'';image.src=url;figure.prepend(image);}).catch(error=>placeholder('无法显示 '+this.entry.src+'：'+(error?.message||error)));
    else placeholder('插图 '+this.entry.src+'（此环境无法读取工作区图片）');
    figure.append(caption);return figure;
  }
  ignoreEvent(){return true;}
}
const inline={strong:Decoration.mark({class:'vela-format-strong',inclusiveEnd:true}),emphasis:Decoration.mark({class:'vela-format-emphasis',inclusiveEnd:true})};
const lines={center:Decoration.line({class:'vela-format-center'}),right:Decoration.line({class:'vela-format-right'})};
const decorations=EditorView.decorations.compute([formatField,formatStyles,imageLoader],state=>{
  const styles=state.facet(formatStyles),load=state.facet(imageLoader),items=[];
  for(const entry of state.field(formatField).entries){
    if(entry.group==='marks'&&entry.to>entry.from){
      if(inline[entry.type])items.push(inline[entry.type].range(entry.from,entry.to));
      else if(entry.type==='ruby'&&entry.value)items.push(Decoration.mark({class:'vela-format-ruby',attributes:{'data-ruby':entry.value}}).range(entry.from,entry.to));
      else if(entry.type==='style'&&styles[entry.value])items.push(Decoration.mark({class:'vela-style',inclusiveEnd:true,attributes:{'data-style':entry.value,style:styleCss(styles[entry.value],{inline:true})}}).range(entry.from,entry.to));
    }
    else if(entry.group==='blocks'&&entry.type==='align'&&lines[entry.value])items.push(lines[entry.value].range(entry.from));
    else if(entry.group==='blocks'&&entry.type==='style'&&styles[entry.value])items.push(Decoration.line({attributes:{class:'vela-style-block','data-style':entry.value,style:styleCss(styles[entry.value])}}).range(entry.from));
    else if(entry.group==='inserts'&&entry.type==='image'&&entry.src)items.push(Decoration.widget({widget:new ImageWidget(entry,load),block:true,side:1}).range(Math.min(entry.from,state.doc.length)));
  }
  return Decoration.set(items,true);
});
const theme=EditorView.baseTheme({
  '.vela-format-strong':{fontWeight:'700'},
  '.vela-format-emphasis':{textEmphasis:'filled dot',textEmphasisPosition:'under right',WebkitTextEmphasis:'filled dot',WebkitTextEmphasisPosition:'under right'},
  '.vela-format-center':{textAlign:'center'},
  '.vela-format-right':{textAlign:'right'},
  // The reading is drawn by a pseudo-element, so it adds no text to the document or the DOM text.
  '.vela-format-ruby':{position:'relative',borderBottom:'1px dotted var(--muted, #999)'},
  '.vela-format-ruby::before':{content:'attr(data-ruby)',position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',fontSize:'.55em',lineHeight:'1',whiteSpace:'nowrap',opacity:'.8',pointerEvents:'none'},
  '.vela-format-image':{margin:'.6em auto',padding:'8px',maxWidth:'min(100%, 480px)',textAlign:'center',border:'1px solid var(--line, #ddd)',borderRadius:'6px',cursor:'pointer'},
  '.vela-format-image img':{display:'block',maxWidth:'100%',maxHeight:'360px',margin:'0 auto'},
  '.vela-format-image figcaption':{fontSize:'.8em',opacity:'.75',marginTop:'4px'},
  '.vela-format-image-missing':{padding:'24px 12px',fontSize:'.85em',opacity:'.7',background:'var(--soft, #f2f2f2)',borderRadius:'4px'}
});

/** Editor extensions with the initial entries (already placed in `doc`) and review list. */
export function richTextExtensions({entries=[],review=[],source=null}={}){
  return [formatField.init(()=>({entries:[...entries].sort((a,b)=>a.from-b.from||a.to-b.to),review,source})),undoFormats,decorations,theme];
}
export const formatsOf=state=>state.field(formatField,false);

const covered=(entries,kind,from,to)=>{let at=from;for(const entry of entries.filter(entry=>sameKind(entry,kind)).sort((a,b)=>a.from-b.from)){if(entry.from>at)break;at=Math.max(at,entry.to);if(at>=to)return true;}return false;};
const dispatch=(view,entries,extra={})=>{view.dispatch({effects:setFormats.of({entries,...extra}),userEvent:'format'});return true;};
/**
 * Toggles an inline format (`strong`, `emphasis`, or `style` with a style ID) over the selection: removes it when
 * the whole selection has it, otherwise adds it and merges with touching ranges of the same format.
 */
export function toggleInline(view,type,value){
  const state=formatsOf(view.state);if(!state)return false;const kind={group:'marks',type,value};
  const ranges=view.state.selection.ranges.filter(range=>!range.empty);if(!ranges.length)return false;
  const remove=ranges.every(range=>covered(state.entries,kind,range.from,range.to));
  let entries=state.entries;
  for(const {from,to} of ranges){
    // Only one named style applies to a piece of text: adding a style removes other styles there.
    const same=entries.filter(entry=>sameKind(entry,kind)),others=entries.filter(entry=>!same.includes(entry)&&!(type==='style'&&!remove&&entry.group==='marks'&&entry.type==='style'&&entry.from<to&&entry.to>from)),kept=[];
    if(type==='style'&&!remove)for(const entry of entries.filter(entry=>entry.group==='marks'&&entry.type==='style'&&entry.value!==value&&entry.from<to&&entry.to>from)){if(entry.from<from)kept.push({...entry,to:from});if(entry.to>to)kept.push({...entry,id:newEntryId(),from:to});}
    if(remove){for(const entry of same){if(entry.to<=from||entry.from>=to){kept.push(entry);continue;}if(entry.from<from)kept.push({...entry,to:from});if(entry.to>to)kept.push({...entry,id:newEntryId(),from:to});}}
    else{let start=from,end=to,id=null;for(const entry of same){if(entry.to<from||entry.from>to){kept.push(entry);continue;}start=Math.min(start,entry.from);end=Math.max(end,entry.to);id||=entry.id;}kept.push({id:id||newEntryId(),group:'marks',type,...(value!==undefined?{value}:{}),from:start,to:end});}
    entries=[...others,...kept];
  }
  return dispatch(view,entries);
}
const selectedLines=state=>{const starts=new Set();for(const range of state.selection.ranges){for(let line=state.doc.lineAt(range.from);;line=state.doc.line(line.number+1)){starts.add(line.from);if(line.to>=range.to||line.number===state.doc.lines)break;}}return starts;};
/** Sets a paragraph format (`align` or `style`) on every selected line, or clears it when they all have that value. */
export function toggleBlock(view,type,value){
  const state=formatsOf(view.state);if(!state)return false;const starts=selectedLines(view.state);
  const current=state.entries.filter(entry=>entry.group==='blocks'&&entry.type===type&&starts.has(entry.from));
  const clear=starts.size===current.length&&current.every(entry=>entry.value===value);
  const entries=state.entries.filter(entry=>!(entry.group==='blocks'&&entry.type===type&&starts.has(entry.from)));
  if(!clear)for(const from of starts){const line=view.state.doc.lineAt(from),old=current.find(entry=>entry.from===from);entries.push({id:old?.id||newEntryId(),group:'blocks',type,value,from:line.from,to:line.to});}
  return dispatch(view,entries);
}
export const toggleAlign=(view,value)=>toggleBlock(view,'align',value);
/** Removes named styles (paragraph and inline) from the selection. */
export function clearStyles(view){
  const state=formatsOf(view.state);if(!state)return false;const starts=selectedLines(view.state),ranges=view.state.selection.ranges,entries=[];
  for(const entry of state.entries){
    if(entry.group==='blocks'&&entry.type==='style'&&starts.has(entry.from))continue;
    if(entry.group==='marks'&&entry.type==='style'){const hit=ranges.find(range=>!range.empty&&entry.from<range.to&&entry.to>range.from);if(hit){if(entry.from<hit.from)entries.push({...entry,to:hit.from});if(entry.to>hit.to)entries.push({...entry,id:newEntryId(),from:hit.to});continue;}}
    entries.push(entry);
  }
  // Nothing to clear: report it (the caller shows a hint) instead of an empty undo step.
  if(entries.length===state.entries.length&&entries.every((entry,i)=>entry===state.entries[i]))return null;
  return dispatch(view,entries);
}
/** The reading of the ruby touching the selection, or ''. */
export function rubyAt(state){const value=formatsOf(state),range=state.selection.main;return value?.entries.find(entry=>entry.group==='marks'&&entry.type==='ruby'&&(range.empty?entry.from<=range.head&&entry.to>=range.head:entry.from<range.to&&entry.to>range.from))?.value||'';}
/** Sets the reading (ruby) for the selected text; an empty reading removes ruby there. */
export function setRuby(view,reading){
  const state=formatsOf(view.state);if(!state)return false;const range=view.state.selection.main;if(range.empty)return false;
  const value=String(reading||'').trim();if(value.length>MAX_RUBY)throw Error('注音最多 '+MAX_RUBY+' 个字符。');if(/[\n\r]/.test(value))throw Error('注音不能换行。');
  const entries=state.entries.filter(entry=>!(entry.group==='marks'&&entry.type==='ruby'&&entry.from<range.to&&entry.to>range.from));
  if(value)entries.push({id:newEntryId(),group:'marks',type:'ruby',value,from:range.from,to:range.to});
  return dispatch(view,entries);
}
/** Inserts an illustration after the paragraph at the cursor. */
export function insertImage(view,{src,alt=''}){
  const state=formatsOf(view.state);if(!state)return false;const line=view.state.doc.lineAt(view.state.selection.main.head);
  return dispatch(view,[...state.entries,{id:newEntryId(),group:'inserts',type:'image',src,...(alt?{alt}:{}),from:line.to,to:line.to}]);
}
/** Changes an illustration's path or caption, or removes it when `next` is null. */
export function updateImage(view,id,next){
  const state=formatsOf(view.state);if(!state)return false;
  const entries=state.entries.flatMap(entry=>entry.id!==id||entry.group!=='inserts'?[entry]:next?[{...entry,src:next.src,...(next.alt?{alt:next.alt}:{alt:undefined})}]:[]).map(entry=>{if(entry.alt===undefined)delete entry.alt;return entry;});
  return dispatch(view,entries);
}
/** Applies a review entry to the current selection, or drops it; the review list is not part of undo. */
export function settleReview(view,id,{apply=false}={}){
  const state=formatsOf(view.state);if(!state)return false;const item=state.review.find(entry=>entry.id===id);if(!item)return false;
  const review=state.review.filter(entry=>entry!==item),range=view.state.selection.main,entries=[...state.entries];
  if(apply){const {reason:_reason,...rest}=item;if(item.group==='blocks'){const line=view.state.doc.lineAt(range.head);entries.push({...rest,from:line.from,to:line.to});}else if(item.group==='inserts'){const line=view.state.doc.lineAt(range.head);entries.push({...rest,from:line.to,to:line.to});}else{if(range.empty)throw Error('请先选中要应用此格式的文字。');entries.push({...rest,from:range.from,to:range.to});}}
  return dispatch(view,entries,{review});
}
export const isFormatActive=(state,type,value)=>{const formats=formatsOf(state);if(!formats)return false;const range=state.selection.main;return !range.empty&&covered(formats.entries,{group:'marks',type,value},range.from,range.to);};
/** The paragraph style ID on the cursor line, or ''. */
export const blockStyleAt=state=>{const formats=formatsOf(state);if(!formats)return '';const line=state.doc.lineAt(state.selection.main.head);return formats.entries.find(entry=>entry.group==='blocks'&&entry.type==='style'&&entry.from===line.from)?.value||'';};
/**
 * Applies a named style to the selected characters (`scope: 'chars'`) or to the selected paragraphs, toggling it off
 * where it is already set. Characters need a selection.
 */
export const applyStyle=(view,id,scope)=>scope==='chars'?toggleInline(view,'style',id):toggleBlock(view,'style',id);
/** The named style on the selection (or at the cursor) and on the cursor's paragraph. */
export function styleAt(state){
  const formats=formatsOf(state);if(!formats)return {chars:'',paragraph:''};const range=state.selection.main;
  const chars=formats.entries.find(entry=>entry.group==='marks'&&entry.type==='style'&&(range.empty?entry.from<range.head&&entry.to>=range.head:entry.from<=range.from&&entry.to>=range.to))?.value||'';
  return {chars,paragraph:blockStyleAt(state)};
}
/**
 * Removes every format from the selection: inline formats (bold, emphasis, ruby, styles) are cut at its edges and
 * paragraph formats of the touched lines are removed. Without a selection only the cursor's paragraph is cleared.
 * Illustrations stay; they are edited from their own dialog.
 */
export function clearFormats(view){
  const state=formatsOf(view.state);if(!state)return false;const starts=selectedLines(view.state),selected=view.state.selection.ranges.filter(range=>!range.empty),entries=[];
  // Without a selection the inline formats of the cursor's whole paragraph go too, not only its paragraph formats.
  const ranges=selected.length?selected:[...starts].map(from=>({from,to:view.state.doc.lineAt(from).to}));
  for(const entry of state.entries){
    if(entry.group==='blocks'&&starts.has(entry.from))continue;
    if(entry.group==='marks'){const hits=ranges.filter(range=>entry.from<range.to&&entry.to>range.from);if(hits.length){let at=entry.from;for(const hit of hits.sort((a,b)=>a.from-b.from)){if(hit.from>at)entries.push({...entry,id:at===entry.from?entry.id:newEntryId(),from:at,to:hit.from});at=Math.max(at,hit.to);}if(at<entry.to)entries.push({...entry,id:newEntryId(),from:at,to:entry.to});continue;}}
    entries.push(entry);
  }
  // Nothing to clear: null (the caller shows a hint) instead of an empty undo step.
  if(entries.length===state.entries.length&&entries.every((entry,i)=>entry===state.entries[i]))return null;
  return dispatch(view,entries);
}
