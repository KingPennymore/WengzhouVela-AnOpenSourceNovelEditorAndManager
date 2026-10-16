'use strict';
// electron-builder afterPack hook: drops Chromium files Vela never uses before the installer and ZIP are made.
// dxcompiler.dll / dxil.dll are the DirectX shader compiler for WebGPU only (WebGL uses d3dcompiler_47.dll, which
// stays); the shared frontend does not use WebGPU. default_app.asar is Electron's demo app, unused when packaged.
const fs=require('node:fs');
const path=require('node:path');
const unused=['dxcompiler.dll','dxil.dll','resources/default_app.asar'];
exports.default=async context=>{
  for(const name of unused){
    const file=path.join(context.appOutDir,name);
    if(fs.existsSync(file)){fs.rmSync(file);console.log('  • removed unused '+name);}
  }
};
