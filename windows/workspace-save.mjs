import {Worker} from 'node:worker_threads';
// Both synchronous exit guards and the background writer share this gate.
// Reserving a newer epoch invalidates jobs that have not started writing yet.
export class BackgroundWorkspaceSave{
  constructor(base){this.base=base;this.gate=new Int32Array(new SharedArrayBuffer(8));this.sequence=0;this.pending=new Map();}
  sync(run){Atomics.add(this.gate,1,1);while(Atomics.compareExchange(this.gate,0,0,1)!==0){if(Atomics.wait(this.gate,0,1,30000)==='timed-out')throw Error('等待后台保存超时，请稍后重试。');}try{return run();}finally{Atomics.store(this.gate,0,0);Atomics.notify(this.gate,0);}}
  save(data,delta=false){
    const epoch=Atomics.add(this.gate,1,1)+1;
    if(!this.worker){this.worker=new Worker(new URL('./workspace-save-worker.mjs',import.meta.url),{workerData:{base:this.base,gate:this.gate.buffer}});this.worker.unref();this.worker.on('message',message=>{const task=this.pending.get(message.id);if(!task)return;this.pending.delete(message.id);message.error?task.reject(Error(message.error)):task.resolve(message.value);});const failed=error=>{for(const task of this.pending.values())task.reject(error);this.pending.clear();this.worker=null;};this.worker.on('error',failed);this.worker.on('exit',code=>{if(code&&this.worker)failed(Error('后台写盘线程异常退出。'));});}
    return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,data,delta,epoch});});
  }
  async close(){await this.worker?.terminate();this.worker=null;}
}
