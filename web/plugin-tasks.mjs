import {error,checkAbort} from './project-contract.mjs';
export class PluginTasks {
  constructor(){this.records=new Map();}
  start(owner,run,options={}){
    const id=crypto.randomUUID(),controller=new AbortController(),listeners=new Set();
    const record={id,owner,state:'running',controller,listeners};this.records.set(id,record);
    const abort=()=>{if(record.state==='running')controller.abort();};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const context={id,signal:controller.signal,check:()=>checkAbort(controller.signal),progress:p=>{record.progress={...p,taskId:id};if(!record.stopped)for(const fn of listeners)try{fn({...record.progress});}catch{}},commit:()=>{checkAbort(controller.signal);record.state='committing';}};
    record.result=Promise.resolve().then(()=>{context.check();return run(context);}).then(result=>{record.state='completed';record.value=result;return result;},cause=>{const failure=cause.code?cause:error('E_INVALID_DATA',cause.message||'任务失败。');record.state=failure.code==='E_CANCELLED'?'cancelled':'failed';record.error=failure;throw failure;}).finally(()=>{options.signal?.removeEventListener('abort',abort);listeners.clear();this.trim(owner);});
    // A stopped page need not attach a rejection handler for a cancelled task.
    record.result.catch(()=>{});
    return Object.freeze({id,result:record.result,onProgress:fn=>{if(record.stopped)throw error('E_PLUGIN_STOPPED','插件已停用。');if(typeof fn!=='function')throw error('E_INVALID_DATA','进度监听器无效。');listeners.add(fn);if(record.progress)fn({...record.progress});return ()=>listeners.delete(fn);},cancel:async()=>abort()});
  }
  get(owner,id){const record=this.records.get(id);if(!record||record.owner!==owner)throw error('E_NOT_FOUND','任务不存在。');return record;}
  status(owner,id){const r=this.get(owner,id);return {state:r.state,progress:r.progress&&{...r.progress},result:r.value,error:r.error&&{code:r.error.code,message:r.error.message,details:r.error.details,retryable:r.error.retryable}};}
  async cancel(owner,id){const r=this.get(owner,id);if(r.state==='running')r.controller.abort();}
  async stop(owner){const tasks=[...this.records.values()].filter(r=>r.owner===owner);for(const r of tasks){r.stopped=true;r.listeners.clear();if(r.state==='running')r.controller.abort();}await Promise.allSettled(tasks.map(r=>r.result));for(const r of tasks)this.records.delete(r.id);}
  trim(owner){const done=[...this.records.values()].filter(r=>r.owner===owner&&!['running','committing'].includes(r.state));for(const r of done.slice(0,-100))this.records.delete(r.id);}
}
