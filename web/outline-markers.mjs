import {gutter,GutterMarker} from '@codemirror/view';
import {StateEffect} from '@codemirror/state';
import {t} from './i18n.mjs';
export const outlineMarksChanged=StateEffect.define();
class OutlineMarker extends GutterMarker{constructor(entries,open){super();this.entries=entries;this.open=open;}eq(other){return this.entries.map(e=>e.outlineId+e.collection+e.nodeId+e.title).join('|')===other.entries.map(e=>e.outlineId+e.collection+e.nodeId+e.title).join('|');}toDOM(){const b=document.createElement('button');b.className='outline-line-marker';b.textContent='⋮';b.title=t('链接的大纲节点')+'：'+this.entries.map(e=>e.title).join('、');b.setAttribute('aria-label',b.title);b.onclick=e=>{e.preventDefault();e.stopPropagation();this.open(this.entries);};return b;}}
export function outlineMarkers(entries,open){
 // Every visible line asks for its marker. Resolve workspace anchors once per
 // view state, including explicit outlineMarksChanged transactions.
 const cache=new WeakMap(),forView=view=>{let result=cache.get(view);if(!result||result.state!==view.state){result={state:view.state,entries:entries()};cache.set(view,result);}return result.entries;};
 return gutter({class:'outline-gutter',lineMarker(view,line){const found=forView(view).filter(e=>!e.anchor.needsReview&&!e.anchor.invalid&&e.anchor.offset>=line.from&&e.anchor.offset<=line.to);return found.length?new OutlineMarker(found,open):null;},lineMarkerChange:u=>u.transactions.some(tr=>tr.effects.some(e=>e.is(outlineMarksChanged)))});
}
