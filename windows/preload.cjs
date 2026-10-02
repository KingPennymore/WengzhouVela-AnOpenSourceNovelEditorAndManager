'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const read=operation=>{const result=ipcRenderer.sendSync('vela:sync',operation);if(result.error)throw new Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('WenzhouNative',Object.freeze({
  platform:'windows',readWorkspace:()=>read('readWorkspace'),readPlugins:()=>read('readPlugins'),readEnvironment:()=>read('readEnvironment'),
  writeWorkspace:data=>ipcRenderer.sendSync('vela:sync','writeWorkspace',data).value,
  writePlugins:data=>ipcRenderer.sendSync('vela:sync','writePlugins',data).value,
  call:(operation,json)=>ipcRenderer.invoke('vela:call',operation,json)
}));
