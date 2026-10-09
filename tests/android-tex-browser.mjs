import {_android} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const serial=process.env.WENZHOU_ANDROID_SERIAL||'emulator-5582',sdk=process.env.ANDROID_HOME||'D:/Android/Sdk';
if(!/^emulator-\d+$/.test(serial))throw Error('安装回归仅允许专用模拟器。');
const adb=(...args)=>execFileSync(`${sdk}/platform-tools/adb.exe`,['-s',serial,...args],{encoding:'utf8',timeout:60000}).trim();
assert.match(adb('emu','avd','name'),/^Wenzhou_QA_API36/);
for(const name of ['engine','chinese'])adb('push',`dist/tex-components/Vela-TeX-0.1.1-${name}.zip`,'/sdcard/Download/');
adb('shell','am','force-stop','com.android.documentsui');adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
let device=(await _android.devices()).find(d=>d.serial()===serial);
assert.ok(device,'请启动 Wenzhou_QA_API36。');
let page,original;const errors=[],requests=[],checks=[];
const connect=async()=>{page=await(await device.webView({pkg:'me.wenzhou.write'})).page();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/imports/'))requests.push(r.url());});await page.waitForSelector('#more-tools');};
async function choose(name){
 const filename=`Vela-TeX-0.1.1-${name}.zip`;
 for(let attempt=0;attempt<8;attempt++){
  adb('shell','uiautomator','dump','/sdcard/vela-qa-picker.xml');
  const xml=adb('shell','cat','/sdcard/vela-qa-picker.xml');
  const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(match=>Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(pair=>[pair[1],pair[2]])));
  const file=nodes.find(n=>n.text===filename&&n['resource-id']==='android:id/title');
  const target=file||nodes.find(n=>n.text==='Downloads'&&n['resource-id']==='android:id/title')||nodes.find(n=>n['content-desc']==='Show roots');
  if(!target)continue;
  const [left,top,right,bottom]=target.bounds.match(/\d+/g).map(Number);adb('shell','input','tap',String(Math.round((left+right)/2)),String(Math.round((top+bottom)/2)));
  if(file)return;
 }
 throw Error('系统选择器未显示 '+filename);
}
try{
 await connect();original=await page.evaluate(()=>WenzhouNative.readWorkspace());
 await page.evaluate(()=>{const state=JSON.parse(WenzhouNative.readWorkspace()),id=crypto.randomUUID();state.documents=state.documents.filter(d=>d.path!=='安装回归.tex');state.documents.unshift({id,path:'安装回归.tex',name:'安装回归.tex',text:'\\documentclass{ctexart}\\begin{document}安卓离线排版安装回归。\\end{document}',updatedAt:Date.now(),remote:null});state.activeId=id;state.openIds=[id];state.settings.libraryOpen=false;const saved=WenzhouNative.writeWorkspace(JSON.stringify(state));if(saved!=='ok')throw Error(saved);});
 await page.reload();await page.waitForSelector('#more-tools');
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('vela.tex-components');r.onsuccess=resolve;r.onerror=reject;r.onblocked=()=>reject(Error('组件存储占用'));}));
 await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.locator('#install-plugin').click();await choose('engine');
 await page.waitForFunction(()=>document.querySelector('#tex-components-status')?.textContent.includes('引擎 已安装'),{},{timeout:120000});
 checks.push('系统选择器导入 51.35 MiB 引擎，插件页面安装成功且无崩溃');console.log('PASS '+checks.at(-1));
 await page.locator('#dialog-cancel').click();await page.locator('[data-display=preview]').click();await page.waitForSelector('.tex-component-controls:not([hidden])');
 await page.locator('.tex-component-import').click();await choose('chinese');
 await page.waitForFunction(()=>document.querySelector('.tex-component-note').textContent.includes('已就绪'),{},{timeout:120000});
 checks.push('LaTeX 预览系统选择器导入 25.65 MiB 中文包，不触发普通插件 16 MiB 限制');console.log('PASS '+checks.at(-1));
 assert.equal(requests.length,2);
 for(const url of [...requests])assert.equal(await page.evaluate(async url=>(await fetch(url)).status,url),404);
 checks.push('安装包经同源二进制读取，读取后临时地址失效');console.log('PASS '+checks.at(-1));
 await device.close();adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');device=(await _android.devices()).find(d=>d.serial()===serial);await connect();
 await page.locator('[data-display=preview]').click();await page.waitForFunction(()=>document.querySelector('.tex-component-note')?.textContent.includes('已就绪'));
 await page.locator('.tex-compile').click();await page.waitForSelector('.pdf-canvas canvas',{timeout:180000});
 assert.ok(await page.locator('.pdf-canvas canvas').evaluate(c=>c.width>100&&c.height>100));assert.equal(await page.locator('.tex-status').textContent(),'编译完成');
 checks.push('进程重启后两个组件保留，实际 Android WebView 编译并渲染中文 PDF');console.log('PASS '+checks.at(-1));
 assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/android-tex-install.png'});await writeFile('test-results/android-tex-install.json',JSON.stringify({checks,errors},null,2));
}finally{
 if(original&&page&&!page.isClosed())await page.evaluate(state=>WenzhouNative.writeWorkspace(state),original).catch(()=>{});
 await device.close();
}
