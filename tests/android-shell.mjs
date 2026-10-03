import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {glossaryText} from '../web/glossary.mjs';

const serial='emulator-5582',adb=(...args)=>execFileSync('D:/Android/Sdk/platform-tools/adb.exe',['-s',serial,...args],{encoding:'utf8',timeout:60000}).trim();
assert.match(adb('emu','avd','name'),/^Wenzhou_QA_API36/);
const overlay='com.android.internal.display.cutout.emulation.hole',overlays=adb('shell','cmd','overlay','list'),wasEnabled=overlays.includes('[x] '+overlay);
let browser;const screenshot=()=>execFileSync('D:/Android/Sdk/platform-tools/adb.exe',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:8*1024*1024});
let page,backup,bookId;const errors=[],checks=[],out='test-results/android-shell';await mkdir(out,{recursive:true});
try{
 if(overlays.includes(overlay))adb('shell','cmd','overlay','enable',overlay);
 console.log('QA emulator connected');adb('shell','input','keyevent','KEYCODE_WAKEUP');adb('shell','wm','dismiss-keyguard');adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
 const pid=adb('shell','pidof','me.wenzhou.write');adb('forward','tcp:9227','localabstract:webview_devtools_remote_'+pid);browser=await chromium.connectOverCDP('http://127.0.0.1:9227',{noDefaults:true});page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>typeof wenzhouSave==='function');
 console.log('QA WebView connected');backup=await page.evaluate(()=>WenzhouNative.readWorkspace());
 const config=createVelaV2('界面测试');config.reading.items=[{path:'航程.txt'}];config.editor.glossaries=['人物.gly'];
 const files=[{path:'界面测试/.vela',text:velaText(config)},{path:'界面测试/航程.txt',text:'第一章 航程\n林舟走向灯塔。\n'+('海风吹过港湾。\n'.repeat(120))},{path:'界面测试/人物.gly',text:glossaryText({version:1,entries:[{term:'林舟',category:'人物',definition:'航海记录者'}]})}].map(file=>({path:file.path,data:Buffer.from(file.text).toString('base64')}));
 await page.evaluate(async files=>{wenzhouSave();const result=JSON.parse(await WenzhouNative.call('writeWorkspaceFiles',JSON.stringify({files})));if(!result.ok)throw Error(result.error);},files);
 await page.reload();await page.waitForSelector('.cm-editor');await page.evaluate(()=>document.querySelector('#home-button').click());bookId=await page.evaluate(()=>JSON.parse(WenzhouNative.readWorkspace()).documents.find(doc=>doc.path==='界面测试/航程.txt').id);await page.locator(`[data-recent="${bookId}"]`).click();await page.waitForSelector('.cm-editor');assert.equal(await page.locator('#current-name').textContent(),'航程.txt');console.log('QA workspace loaded');
 assert.equal(await page.locator('#preview-toggle').count(),0);
 const metrics=await page.evaluate(()=>{const bar=document.querySelector('.quickbar');return {top:document.querySelector('.topbar').offsetHeight,width:bar.clientWidth,scroll:bar.scrollWidth,buttons:bar.querySelectorAll('button').length};});assert.ok(metrics.top<=56&&metrics.scroll<=metrics.width);assert.equal(metrics.buttons,8);
 await page.locator('#more-tools').click();for(const id of ['focus-toggle','theme','commands','plugins'])assert.ok(await page.locator('#toolbar-overflow #'+id).isVisible());await page.keyboard.press('Escape');checks.push('Native single-row toolbar, eight visible actions and overflow tools');
 await page.evaluate(()=>{const view=editorManager.editor;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'林'},selection:{anchor:1}});view.focus();});await page.evaluate(()=>editorManager.editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',ctrlKey:true,bubbles:true,cancelable:true})));await page.waitForSelector('.cm-tooltip-autocomplete');
 const candidate=page.locator('.cm-tooltip-autocomplete li').first();assert.match(await candidate.textContent(),/林舟.*术语.*人物.gly.*人物/);assert.ok((await candidate.boundingBox()).height<=28);assert.equal(await candidate.locator('.cm-completionIcon').count(),0);await page.waitForSelector('.vela-completion-info');await page.waitForTimeout(120);const listBox=await page.locator('.cm-tooltip-autocomplete>ul').boundingBox(),infoBox=await page.locator('.cm-completionInfo').boundingBox();assert.ok(listBox.y+listBox.height<=infoBox.y+1,JSON.stringify({listBox,infoBox}));assert.equal(await page.locator('.cm-completionInfo').evaluate(el=>getComputedStyle(el).position),'static');await writeFile(out+'/completion.png',screenshot());await page.keyboard.press('Escape');checks.push('Android WebView inline term, type, library and category');
 await page.evaluate(()=>{const view=editorManager.editor;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'第一章 航程\n'+('海风吹过港湾，远处是灯塔。\n'.repeat(120))}});wenzhouSave();});
 await page.locator('#settings').click();await page.waitForTimeout(250);const sheet=await page.locator('#dialog').boundingBox(),height=await page.evaluate(()=>innerHeight);assert.ok(Math.abs(sheet.y-height/3)<2&&Math.abs(sheet.height-height*2/3)<2);await page.locator('#dialog-cancel').click();
 await page.locator('[data-view=reader]').click();await page.locator(`[data-read="${bookId}"]`).click();await page.waitForTimeout(500);assert.equal(await page.locator('#reader-title').textContent(),'航程');
 const env=await page.evaluate(()=>JSON.parse(WenzhouNative.readEnvironment()));assert.ok(env.cutouts.length>0,'The QA hole overlay must publish cutout bounds');
 for(const id of ['reader-back','reader-title','reader-outline-action','reader-tools','reader-notes']){const box=await page.locator('#'+id).boundingBox();for(const rect of env.cutouts)assert.ok(box.x+box.width<=rect.left||box.x>=rect.right||box.y>=rect.bottom,'Camera overlap: '+id);}
 await page.locator('#reader-tools').click();assert.ok(await page.locator('.reader-search-section').isVisible());await page.locator('[data-tools-close]').click();await page.locator('#reader-notes').click();assert.ok(await page.locator('.reader-notes-section').isVisible());await page.locator('[data-tools-close]').click();await writeFile(out+'/reader-camera.png',screenshot());checks.push('Native camera bounds, extension-free title, search and notes');
 await page.locator('#reader-back').click();assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({checks,metrics,env,errors},null,2));console.log('PASS '+checks.join('\nPASS '));
}finally{
 if(backup&&page&&!page.isClosed())await page.evaluate(backup=>WenzhouNative.writeWorkspace(backup),backup).catch(()=>{});
 if(overlays.includes(overlay)&&!wasEnabled)adb('shell','cmd','overlay','disable',overlay);
 await browser?.close();adb('forward','--remove','tcp:9227');
}
