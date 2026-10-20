const error=(message,code='E_INVALID_DATA')=>Object.assign(Error(message),{code});
/** Context notifications are coalesced; listeners never receive the editor or mutable document. */
export class ViewContext {
 constructor(read){this.read=read;this.listeners=new Set();this.pending=false;}
 get(){return structuredClone(this.read());}
 subscribe(fn){if(typeof fn!=='function')throw error('需要监听函数。');this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 changed(){if(this.pending)return;this.pending=true;queueMicrotask(()=>{this.pending=false;const context=this.get();for(const fn of this.listeners)try{fn(structuredClone(context));}catch{}});}
}
export class BackgroundTasks {
 constructor(){this.items=new Map();this.root=null;}
 run(owner,spec){
  if(!spec||typeof spec.title!=='string'||!spec.title.trim()||typeof spec.run!=='function')throw error('任务需要标题和 run 函数。');
  const id=crypto.randomUUID(),controller=new AbortController(),item={id,owner,title:spec.title.slice(0,80),state:'running',progress:0,controller};this.items.set(id,item);this.render();
  const cancel=()=>{if(item.state==='running'){controller.abort();item.state='cancelled';this.render();}};
  let abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(error('任务已取消。','E_CANCELLED'));controller.signal.addEventListener('abort',abort,{once:true});});
  const work=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return spec.run({signal:controller.signal,report:({progress,message}={})=>{if(controller.signal.aborted)return;if(Number.isFinite(progress))item.progress=Math.min(1,Math.max(0,progress));item.message=String(message||'').slice(0,200);this.render();},yield:()=>new Promise(resolve=>setTimeout(resolve,0))});});
  const result=Promise.race([work,cancelled]).then(value=>{item.state='completed';return value;},cause=>{item.state=controller.signal.aborted?'cancelled':'failed';item.message=cause.message;throw cause;}).finally(()=>{controller.signal.removeEventListener('abort',abort);this.render();if(item.state!=='failed'){this.items.delete(id);this.render();}});result.catch(()=>{});
  return Object.freeze({id,result,cancel});
 }
 worker(owner,{title,url,input,type='classic'}){return this.run(owner,{title,run:({signal,report})=>new Promise((resolve,reject)=>{const worker=new Worker(url,{type}),stop=()=>{worker.terminate();reject(error('任务已取消。','E_CANCELLED'));};signal.addEventListener('abort',stop,{once:true});const finish=(fn,value)=>{signal.removeEventListener('abort',stop);worker.terminate();fn(value);};worker.onmessage=({data})=>{if(data?.progress){report(data.progress);return;}if(data?.error)finish(reject,Error(String(data.error)));else finish(resolve,data?.result);};worker.onerror=e=>finish(reject,Error(e.message));try{worker.postMessage(input);}catch(cause){finish(reject,cause);}})});}
 render(){if(typeof document==='undefined')return;if(!this.root){this.root=document.createElement('aside');this.root.className='extension-tasks';this.root.setAttribute('aria-label','后台任务');document.body.append(this.root);}this.root.replaceChildren();for(const item of this.items.values()){const row=document.createElement('div'),text=document.createElement('span'),progress=document.createElement('progress'),button=document.createElement('button');text.textContent=item.title+(item.message?' · '+item.message:'');progress.max=1;progress.value=item.progress;button.textContent=item.state==='running'?'取消':'关闭';button.onclick=()=>{item.controller.abort();this.items.delete(item.id);this.render();};row.append(text,progress,button);this.root.append(row);}this.root.hidden=!this.items.size;}
 dispose(owner){for(const [id,item] of this.items)if(item.owner===owner){item.controller.abort();this.items.delete(id);}this.render();}
}
export function themeSnapshot(){const css=getComputedStyle(document.body);return Object.fromEntries(['paper','panel','text','muted','accent','line','radius','control'].map(key=>[key,css.getPropertyValue('--'+key).trim()]));}
export function createUiElement(kind,{title='',text=''}={}){if(!['empty','toolbar','list'].includes(kind))throw error('不支持此公共控件。');const element=document.createElement(kind==='toolbar'?'div':'section');element.className='vela-extension-'+kind;if(kind==='toolbar'){element.setAttribute('role','toolbar');element.setAttribute('aria-label',title);}else if(kind==='empty'){const heading=document.createElement('strong'),description=document.createElement('p');heading.textContent=title;description.textContent=text;element.append(heading,description);}return element;}
