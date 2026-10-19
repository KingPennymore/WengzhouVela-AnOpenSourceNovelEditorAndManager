import {parentPort,workerData} from 'node:worker_threads';
import {WorkspaceStorage} from './storage.mjs';
const gate=new Int32Array(workerData.gate);let files;
parentPort.on('message',({id,data,delta,epoch})=>{
  while(Atomics.compareExchange(gate,0,0,1)!==0){if(Atomics.wait(gate,0,1,30000)==='timed-out'){parentPort.postMessage({id,error:'等待后台保存超时，请稍后重试。'});return;}}
  let value,error;try{if(epoch!==Atomics.load(gate,1))value={superseded:true};else{files??=new WorkspaceStorage(workerData.base);delta?files.saveWorkspaceDelta(data):files.saveWorkspace(data);value={saved:true};}}catch(failure){error=failure.message;}finally{Atomics.store(gate,0,0);Atomics.notify(gate,0);}
  parentPort.postMessage({id,value,error});
});
