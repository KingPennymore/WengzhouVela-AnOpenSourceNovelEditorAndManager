import {chromium,_electron,_android} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {zipSync,strToU8} from 'fflate';
import {inspectZip} from '../web/project-archive.mjs';

const mode=process.env.VELA_PROJECT_PLATFORM||'browser',errors=[],checks=[];
let browser,application,device,p,data,server;
if(mode==='windows'){
 data=fs.mkdtempSync(path.join(os.tmpdir(),'vela-project-plugin-'));
 const env={...process.env,VELA_QA:'1',VELA_QA_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.VELA_TEST_EXECUTABLE||path.resolve('windows/node_modules/electron/dist/electron.exe'),args:process.env.VELA_TEST_EXECUTABLE?[]:[path.resolve('windows')],env,timeout:60000});p=await application.firstWindow();
}else if(mode==='android'){
 const sdk=process.env.ANDROID_HOME||'D:/Android/Sdk',serial='emulator-5582';
 const adb=(...args)=>execFileSync(path.join(sdk,'platform-tools/adb.exe'),['-s',serial,...args],{encoding:'utf8',timeout:60000}).trim();
 assert.match(adb('emu','avd','name'),/^Wenzhou_QA_API36/);adb('install','-r',path.resolve('android/app/build/outputs/apk/debug/app-debug.apk'));adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
 device=(await _android.devices()).find(d=>d.serial()===serial);assert.ok(device,'QA emulator required');p=await (await device.webView({pkg:'me.wenzhou.write'})).page();
}else{server=http.createServer((req,res)=>{const root=path.resolve('dist/web'),file=path.resolve(root,'.'+(req.url==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,channel:'chrome'});p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);}
p.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+mode+' '+name);};
try{
 await p.waitForSelector('.cm-editor',{state:'attached',timeout:30000});
 const main=`(()=>{const id='test.vela.projects';acode.setPluginInit(id,()=>{const api=acode.require('vela'),Page=acode.require('page'),page=new Page('QA');window.projectQA={api,page,visible:0,hidden:0};page.onVisible(()=>window.projectQA.visible++);page.onHide(()=>window.projectQA.hidden++);page.onBeforeClose(()=>false);api.dispose(()=>window.projectQA.disposed=true);});acode.setPluginUnmount(id,()=>{});})();`;
 const preview='<!doctype html><h1>Trusted runtime</h1><script>window.testRuntime={bridge:typeof WenzhouNative,node:typeof require};fetch(VELA_PREVIEW.assetBase+"a.json").then(r=>r.text()).then(t=>document.body.dataset.payload=t);fetch("https://api.github.com").then(()=>window.networkAllowed=true).catch(()=>window.networkAllowed=false);</script>';
 const record={manifest:{id:'test.vela.projects',name:'项目接口测试',version:'1.0.0',main:'main.js',vela:{api:'>=3 <4',requiredCapabilities:['file-transactions-v1']}},files:{'main.js':Buffer.from(main).toString('base64'),'preview.html':Buffer.from(preview).toString('base64')},enabled:true};
 await p.evaluate(record=>{if(window.WenzhouNative){const result=window.WenzhouNative.writePlugins(JSON.stringify([record]));if(result!=='ok')throw Error(result);}else localStorage.setItem('wenzhou.plugins',JSON.stringify([record]));},record);
 await p.reload();await p.waitForFunction(()=>window.projectQA);
 const name='SDK-QA-'+Date.now();
 await p.evaluate(name=>{window.projectPending=projectQA.api.workspace.create({name});},name);
 await p.waitForSelector('#dialog[open]');await p.locator('#dialog-submit').click();
 const handle=await p.evaluate(async()=>{const handle=await projectPending;projectQA.handle=handle;return handle;});
 await check('API v3 gates, project creation and opaque handle',async()=>{assert.equal(await p.evaluate(()=>projectQA.api.version),3);assert.ok(!JSON.stringify(handle).includes(data||'C:\\Users'));const caps=await p.evaluate(()=>projectQA.api.getCapabilities());assert.equal(caps.features.transactions,true);assert.equal(caps.features.independentPreview,mode==='windows');});
 await check('cross-file commit, lazy file opening and safe revision checks',async()=>{
  const result=await p.evaluate(async()=>{const api=projectQA.api,h=projectQA.handle;const receipt=await api.fs.applyBatch({workspaceId:h.id,expectedWorkspaceRevision:h.revision,idempotencyKey:'first',changes:[{kind:'mkdir',path:'Empty'},{kind:'writeText',path:'a.json',text:'{"generation":1}',expectedRevision:null},{kind:'writeText',path:'b.csv',text:'id,name\nhero,主角',expectedRevision:null}]});const a=await api.fs.readText({workspaceId:h.id,path:'a.json'});const opened=await api.documents.open({workspaceId:h.id,path:'a.json',expectedRevision:a.revision,selection:{from:1,to:3},focus:false});return {receipt,a,opened};});
  assert.equal(result.a.text,'{"generation":1}');assert.ok(result.opened.documentId);assert.equal(await p.evaluate(()=>editorManager.editor.state.selection.main.to),3);
  const lazy=p.locator('[data-project-file="'+name+'/b.csv"]');assert.equal(await lazy.count(),1);
 });
 await check('snapshot resources, native Range and fixed revisions',async()=>{
  const value=await p.evaluate(async()=>{const api=projectQA.api,id=projectQA.handle.id,h=await api.workspace.open({workspaceId:id}),snap=await api.snapshots.create({workspaceId:id,expectedWorkspaceRevision:h.revision,includeRoots:[''],label:'fixed'}).result;projectQA.snapshotId=snap.snapshotId;const s=await api.assets.openSession({workspaceId:id,allowedRoots:[''],purpose:'preview',snapshotId:snap.snapshotId});projectQA.session=s;const asset=await api.assets.resolve({...s,path:'a.json'});const response=await fetch(asset.url,{headers:{Range:'bytes=0-4'}});return {asset,status:response.status,range:response.headers.get('Content-Range'),text:await response.text()};});
  assert.equal(value.asset.mime,'application/json');if(mode!=='browser'){assert.equal(value.status,206);assert.match(value.range,/bytes 0-4/);assert.equal(value.text,'{"gen');}else assert.ok([200,206].includes(value.status));
 });
 await check('page lifecycle and bounded close rejection',async()=>{const value=await p.evaluate(async()=>{const q=projectQA;q.page.show();q.page.hide();q.page.show();return {visible:q.visible,hidden:q.hidden,closed:await q.page.close()};});assert.equal(value.visible,2);assert.equal(value.hidden,1);assert.equal(value.closed,false);await p.evaluate(()=>projectQA.page.hide());});
 await check('ZIP worker preserves Unicode, binary and empty directories and rejects bad CRC',async()=>{
  const bytes=zipSync({'数据.json':strToU8('{"name":"主角"}'),'空目录/':new Uint8Array(),'素材.bin':new Uint8Array([0,255,128,17])}),entries=inspectZip(bytes).entries;
  const result=await p.evaluate(async({bytes,entries})=>{const run=data=>new Promise((resolve,reject)=>{const worker=new Worker('project-archive-worker.js'),timer=setTimeout(()=>{worker.terminate();reject(Error('ZIP worker timeout'));},10000);worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};worker.postMessage(data);});const good=await run({action:'extract',data:Uint8Array.from(bytes),entries});const first=await run({action:'export',files:good.files}),second=await run({action:'export',files:good.files});const bad=entries.map(e=>e.directory?e:{...e,crc:e.crc^1});const invalid=await run({action:'extract',data:Uint8Array.from(bytes),entries:bad});return {files:good.files.map(f=>({path:f.path,directory:f.directory,bytes:f.bytes&&Array.from(f.bytes)})),deterministic:first.bytes.toString()===second.bytes.toString(),invalid:invalid.code};},{bytes:Array.from(bytes),entries});
  assert.equal(result.files.find(f=>f.path==='空目录').directory,true);assert.deepEqual(result.files.find(f=>f.path==='素材.bin').bytes,[0,255,128,17]);assert.equal(result.deterministic,true);assert.equal(result.invalid,'E_INVALID_DATA');
 });
 if(mode==='browser')await check('host trash restores closed project payload from IndexedDB',async()=>{
  await p.evaluate(async()=>{const api=projectQA.api,h=await api.workspace.open({workspaceId:projectQA.handle.id}),file=await api.fs.stat({workspaceId:h.id,path:'b.csv'});await api.fs.applyBatch({workspaceId:h.id,expectedWorkspaceRevision:h.revision,idempotencyKey:'trash-qa',changes:[{kind:'delete',path:'b.csv',expectedRevision:file.revision,mode:'trash'}]});});
  if(!await p.locator('#open-trash').isVisible())await p.locator('#mobile-library').click();await p.locator('#open-trash').click();await p.locator('[data-restore]').click();await p.waitForFunction(()=>!document.querySelector('[data-restore]'));await p.locator('#dialog-close').click();const read=await p.evaluate(()=>projectQA.api.fs.readText({workspaceId:projectQA.handle.id,path:'b.csv'}));assert.equal(read.text,'id,name\nhero,主角');
 });
 if(mode==='windows')await check('independent preview cannot access host bridge, Node or network',async()=>{
  const windowEvent=application.waitForEvent('window');await p.evaluate(()=>projectQA.api.preview.open({snapshotId:projectQA.snapshotId,runtime:{pluginAsset:'preview.html'},contentRoot:'',initialState:{},network:'none'}));const preview=await windowEvent;await preview.waitForFunction(()=>document.body.dataset.payload&&window.networkAllowed===false);assert.equal(await preview.locator('h1').textContent(),'Trusted runtime');assert.equal(await preview.evaluate(()=>window.testRuntime.bridge),'undefined');assert.equal(await preview.evaluate(()=>window.testRuntime.node),'undefined');assert.equal(await preview.evaluate(()=>document.body.dataset.payload),'{"generation":1}');await preview.close();
 });
 await check('unload releases resources and old SDK refuses access',async()=>{
  await p.locator('#more-tools').click();await p.locator('#plugins').click();await p.locator('[data-plugin-enable]').click();await p.waitForFunction(()=>window.projectQA.disposed);const result=await p.evaluate(async()=>{try{await projectQA.api.fs.stat({workspaceId:projectQA.handle.id,path:'a.json'});return 'BAD';}catch(e){return e.code;}});assert.equal(result,'E_PLUGIN_STOPPED');assert.equal(await p.locator('.plugin-page').count(),0);
 });
 assert.deepEqual(errors,[]);console.log(`${checks.length} ${mode} plugin integration checks passed`);
}finally{await application?.close();await browser?.close();await device?.close();await new Promise(resolve=>server?server.close(resolve):resolve());if(data)fs.rmSync(data,{recursive:true,force:true});}
