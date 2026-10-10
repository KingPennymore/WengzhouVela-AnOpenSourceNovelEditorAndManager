import {openRecentFile} from './start-page-helper.mjs';
import {_android} from 'playwright';
import {execFileSync} from 'node:child_process';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const sdk=process.env.ANDROID_HOME||execFileSync('powershell.exe',['-NoProfile','-Command',"[Environment]::GetEnvironmentVariable('ANDROID_HOME','User')"],{encoding:'utf8'}).trim(),serial='emulator-5582';
const adb=(...args)=>execFileSync(sdk+'/platform-tools/adb.exe',['-s',serial,...args],{encoding:'utf8',timeout:60000});
assert.match(adb('emu','avd','name'),/^Wenzhou_QA_API36/);adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
const device=(await _android.devices()).find(device=>device.serial()===serial);assert.ok(device);
const page=await(await device.webView({pkg:'me.wenzhou.write'})).page();
const invoke=async(op,data)=>{const result=await page.evaluate(async({op,data})=>JSON.parse(await window.WenzhouNative.call(op,JSON.stringify(data))),{op,data});if(!result.ok)throw Error(result.error);return result.value;};
async function files(folder='测试文件',prefix=''){
  const list=[];for(const item of await readdir(folder,{withFileTypes:true})){const path=prefix+item.name;if(item.isDirectory())list.push(...await files(folder+'/'+item.name,path+'/'));else list.push({path:'公开样例验证/'+path,data:(await readFile(folder+'/'+item.name)).toString('base64')});}return list;
}
try{
  await page.waitForFunction(()=>!!window.WenzhouNative);await page.evaluate(()=>window.wenzhouSave());const state=await invoke('writeWorkspaceFiles',{files:await files()});const html=state.documents.find(doc=>doc.path==='公开样例验证/HTML/index.html');assert.ok(html);await page.reload();await page.waitForFunction(()=>!!window.editorManager);
  await page.keyboard.press('Control+Alt+h');await openRecentFile(page,page.locator(`[data-recent="${html.id}"]`));await page.locator('[data-display=preview]').click();const frame=page.frameLocator('#preview iframe');await frame.locator('h1').waitFor();
  assert.equal(await frame.locator('h1').innerText(),'航路');await frame.locator('h1').evaluate(element=>new Promise(resolve=>{const poll=()=>{if(getComputedStyle(element).color==='rgb(35, 116, 78)')resolve();else setTimeout(poll,50);};poll();}));
  assert.equal(await frame.locator('.cover').evaluate(element=>element.complete&&element.naturalWidth),240);assert.equal(await frame.locator('table tbody tr').count(),2);
  if(await page.locator('body').evaluate(element=>element.classList.contains('show-library')))await page.locator('#mobile-library').click();await page.waitForTimeout(200);
  const box=await page.locator('#preview iframe').boundingBox(),paper=await page.locator('.paper').boundingBox();assert.ok(Math.abs(box.height-paper.height)<1&&box.height>400);
  await page.screenshot({path:'test-results/html-embedded-android.png'});console.log('PASS public HTML local CSS @import, SVG and full-height original editor bounds');
  await page.locator('[data-display=source]').click();assert.ok((await page.locator('.cm-content').innerText()).includes('styles/page.css'));
  const raw=state.documents.find(doc=>doc.path==='公开样例验证/代码/example.py');await page.keyboard.press('Control+Alt+h');await openRecentFile(page,page.locator(`[data-recent="${raw.id}"]`));await page.evaluate(()=>{const state=JSON.parse(window.WenzhouNative.readWorkspace());state.documents.find(doc=>doc.path==='公开样例验证/代码/example.py').kind='HTML';const result=window.WenzhouNative.writeWorkspace(JSON.stringify(state));if(result!=='ok')throw Error(result);});await page.reload();await page.waitForFunction(()=>!!window.editorManager);await page.keyboard.press('Control+Alt+h');await openRecentFile(page,page.locator(`[data-recent="${raw.id}"]`));await page.locator('[data-display=preview]').click();await page.frameLocator('#preview iframe').locator('body').waitFor();assert.ok((await page.frameLocator('#preview iframe').locator('body').textContent()).includes('dataclass'));console.log('PASS manual HTML type works with other extensions');
  await writeFile('test-results/android-sample-results.json',JSON.stringify({passed:2,checks:['public HTML local assets','manual HTML type']},null,2));
}finally{await device.close();}
