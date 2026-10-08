import {ViewPlugin} from '@codemirror/view';
import {t} from './i18n.mjs';
const SIZE=4096,HALO=32;
export function nounCompletionExtension(getProject){
  let plugin;
  plugin=ViewPlugin.fromClass(class {
    constructor(view){this.view=view;this.revision=0;this.serial=0;this.options=[];this.waiters=new Set();this.blocks=[];this.removed=[];this.busy=false;this.enabled=getProject?.()?.autoNouns!==false;
      if(!this.enabled)return;
      try{this.worker=new Worker(new URL('./noun-worker.js',location.href));this.worker.onmessage=({data})=>{this.busy=false;if(data.revision===this.revision){this.options=data.options;for(const resolve of this.waiters)resolve();this.waiters.clear();}this.schedule();};this.worker.onerror=()=>this.destroy();this.add(0,view.state.doc.length);this.schedule();}catch{this.enabled=false;}
    }
    add(from,to){for(let pos=from;pos<to;){const end=to-pos<=SIZE*2?to:pos+SIZE;this.blocks.push({id:++this.serial,from:pos,to:end,dirty:true});pos=end;}}
    schedule(){if(this.timer||this.busy||!this.enabled||!this.worker)return;this.timer=setTimeout(()=>{this.timer=null;const dirty=this.blocks.filter(b=>b.dirty).slice(0,8);if(!dirty.length&&!this.removed.length)return;const doc=this.view.state.doc;const blocks=dirty.map(b=>{b.dirty=false;const from=Math.max(0,b.from-HALO),to=Math.min(doc.length,b.to+HALO);return {id:b.id,text:doc.sliceString(from,to),start:b.from-from,end:b.to-from};});this.busy=true;this.worker.postMessage({revision:this.revision,remove:this.removed.splice(0),blocks});},80);}
    update(update){if(!this.enabled||!update.docChanged)return;this.revision++;this.options=[];const ranges=[];update.changes.iterChangedRanges((from,to,a,b)=>ranges.push({from:Math.max(0,from-HALO),to:to+HALO,a,b}));const retained=[],replace=[];
      for(const block of this.blocks){if(ranges.some(r=>block.to>=r.from&&block.from<=r.to)){this.removed.push(block.id);replace.push({from:update.changes.mapPos(block.from,-1),to:update.changes.mapPos(block.to,1)});}else retained.push({...block,from:update.changes.mapPos(block.from,1),to:update.changes.mapPos(block.to,-1)});}
      if(!this.blocks.length)replace.push({from:0,to:update.state.doc.length});this.blocks=retained;
      replace.sort((a,b)=>a.from-b.from);const merged=[];for(const r of replace){const last=merged.at(-1);if(last&&r.from<=last.to)last.to=Math.max(last.to,r.to);else merged.push(r);}for(const r of merged)this.add(r.from,r.to);this.schedule();
    }
    destroy(){clearTimeout(this.timer);this.timer=null;this.enabled=false;this.worker?.terminate();this.worker=null;this.options=[];this.blocks=[];for(const resolve of this.waiters)resolve();this.waiters.clear();}
  });
  const source=async context=>{if(context.view?.composing)return null;const service=context.view?.plugin(plugin);if(!service?.enabled)return null;if(service.busy||service.removed.length||service.blocks.some(b=>b.dirty)){await new Promise(resolve=>{service.waiters.add(resolve);context.addEventListener('abort',()=>{service.waiters.delete(resolve);resolve();});});}if(context.aborted||context.view.state.doc!==context.state.doc||!service.options.length)return null;const project=getProject?.()||{},excluded=new Set([...(project.terms||[]).flatMap(e=>[e.term,...e.aliases]),...(project.glossary||[])]),before=context.state.doc.sliceString(Math.max(0,context.pos-8),context.pos);let from=context.pos,options=[];
    for(const item of service.options){if(excluded.has(item.label))continue;let n=Math.min(before.length,item.label.length-1);while(n>0&&!before.endsWith(item.label.slice(0,n)))n--;if(!n)continue;const start=context.pos-n;if(options.length&&start>from)continue;if(start<from){options=[];from=start;}options.push({label:item.label,type:'text',velaKind:'noun',boost:-20,detail:t('正文候选'),info:t('从当前正文推测，未加入术语库。')});if(options.length>=80)break;}
    return options.length?{from,options}:null;
  };
  return {plugin,source};
}
