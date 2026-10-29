import {settingsSection,setSetting,closeSettings} from './settings-helper.mjs';
import {selectAppView} from './navigation-helper.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {checkNativeNouns} from './native-nouns.mjs';
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const data=fs.mkdtempSync(path.join(os.tmpdir(),'vela-electron-qa-')),checks=[],errors=[],env={...process.env,VELA_QA:'1',VELA_QA_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const application=await electron.launch({executablePath:process.env.VELA_TEST_EXECUTABLE||path.resolve('windows/node_modules/electron/dist/electron.exe'),args:process.env.VELA_TEST_EXECUTABLE?[]:[path.resolve('windows')],env,timeout:60000});
application.process().stderr.on('data',chunk=>{const text=String(chunk);if(/Error|Exception/.test(text)&&!text.includes('ssl_client_socket'))console.error(text.trim());});
let page;const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
try{
  page=await application.firstWindow();await application.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.webContents.on('render-process-gone',(_event,details)=>console.error('QA renderer exited:',JSON.stringify(details)));});page.on('crash',()=>console.error('QA renderer crashed'));page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.cm-editor',{timeout:30000});await page.waitForFunction(()=>window.velaReady);
  await check('Windows 原生启动、沙箱桥与内部文件夹持久保存',async()=>{
    assert.equal(await application.evaluate(({Menu})=>Menu.getApplicationMenu()),null);
    assert.equal(await page.evaluate(()=>window.WenzhouNative.platform),'windows');assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>typeof window.process),'undefined');assert.equal(await page.locator('#workspace-name').count(),0);
    const state=await page.evaluate(()=>JSON.parse(window.WenzhouNative.readWorkspace()));assert.ok(state.documents.some(doc=>doc.name==='操作指南.md'));assert.ok(fs.existsSync(path.join(data,'workspaces/Vela/操作指南.md')));
  });
  await page.keyboard.press('Control+n');await page.locator('#dialog [name=name]').fill('Windows 正文测试.txt');await page.locator('#dialog-submit').click();await page.waitForSelector('#editor:not([hidden]) .cm-editor');
  await check('Windows 正文候选后台 Worker 与补全撤销',()=>checkNativeNouns(page));
  await check('Windows 段落换行完整继承全角缩进及撤销恢复',async()=>{
    const original=await page.evaluate(()=>velaEditorView.state.doc.toString());
    await page.evaluate(()=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'　　正文'},selection:{anchor:4}});v.focus();});
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),'　　正文\n　　');assert.equal(await page.evaluate(()=>velaEditorView.state.selection.main.head),7);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),'　　正文');
    await page.evaluate(text=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:0}});},original);
  });
  await check('Windows 自动保存按文稿增量写入，重载后正文完整',async()=>{
    const stored=()=>fs.readFileSync(path.join(data,'workspace.json'),'utf8'),original=await page.evaluate(()=>velaEditorView.state.doc.toString()),marker='增量保存标记'+Date.now();
    await page.evaluate(()=>window.wenzhouSave());const edit=async text=>{await page.evaluate(text=>{const v=velaEditorView;v.dispatch({changes:{from:v.state.doc.length,insert:text}});},text);assert.notEqual(await page.evaluate(()=>window.wenzhouSave()),false);};
    await edit(String.fromCharCode(10)+marker);await edit('续');
    assert.ok(stored().startsWith('{"store":{"format":2'),'workspace.json is a skeleton after an incremental save');assert.ok(!stored().includes(marker),'texts live in workspace-store, not in the skeleton');
    const read=JSON.parse(await page.evaluate(()=>window.WenzhouNative.readWorkspace()));assert.ok(read.documents.some(doc=>doc.text.endsWith(marker+'续')));
    await page.reload();await page.waitForSelector('.cm-editor',{timeout:30000});await page.waitForFunction(()=>window.velaReady);assert.ok((await page.evaluate(()=>velaEditorView.state.doc.toString())).endsWith(marker+'续'));
    await page.evaluate(text=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text}});},original);await page.evaluate(()=>window.wenzhouSave());
  });
  await check('Windows 自动更新检查设置即时保存',async()=>{await page.locator('#more-tools').click();await page.locator('#settings').click();await setSetting(page,'updateChecks',false);await closeSettings(page);assert.equal(await page.evaluate(()=>JSON.parse(WenzhouNative.readWorkspace()).settings.updateChecks),false);});
  await check('全局配置 GUI 可枚举内部文件、调整排版、保存后恢复',async()=>{
    await page.locator('#more-tools').click();await page.locator('#settings').click();await settingsSection(page,'reading');await page.locator('.settings-section details').evaluate(el=>el.open=true);await page.locator('#edit-global-vela').click();await page.waitForSelector('#vela-form');assert.ok(await page.locator('#vela-form [name=readingFiles]').count()>0);await page.locator('#vela-form [name=fontSize]').fill('22');await page.locator('#vela-form [name=lineHeight]').fill('2.2');await page.locator('#vela-form [name=marginLeft]').fill('48');await page.locator('#vela-form .primary').click();const config=JSON.parse(fs.readFileSync(path.join(data,'workspaces/Vela/.global.vela'),'utf8'));assert.equal(config.reader.layout.fontSize,22);assert.equal(config.reader.layout.lineHeight,2.2);assert.equal(config.reader.layout.marginLeft,48);
  });
  await check('批量写入、原生刷新与 GUI 文件打开',async()=>{
    await page.locator('#mobile-library').click();
    const result=await page.evaluate(async()=>JSON.parse(await window.WenzhouNative.call('writeWorkspaceFiles',JSON.stringify({files:[{path:'QA/Novel.txt',data:btoa(unescape(encodeURIComponent('第一章：启航！\n'+('测试正文保持只读。\n'.repeat(150))+'第二章 抵达。\n后续正文。')))} ,{path:'QA/.vela',data:btoa(JSON.stringify({version:2,kind:'workspace',id:'windows-qa',project:{name:'QA Book'},reader:{},reading:{layout:{fontSize:16},items:[{id:'novel',path:'Novel.txt'},{id:'html',path:'Page.html'}]}}))},{path:'QA/Page.html',data:btoa('<!doctype html><h1>Preview QA</h1><p>Readonly HTML document</p><script>document.body.dataset.untrusted="ran"</script>')}],folders:['QA']}))));assert.equal(result.ok,true);
    await page.locator('#refresh-folder').click();await page.locator('#toast',{hasText:'工作区已刷新'}).waitFor();/* refreshing keeps the open document */await page.keyboard.press('Control+Alt+h');await page.waitForSelector('[data-recent]',{state:'attached'});await openRecentFile(page,page.locator('[data-recent]').filter({hasText:'Novel.txt'}));await page.waitForSelector('.cm-editor');assert.ok((await page.evaluate(()=>window.velaEditorView.state.doc.toString())).startsWith('第一章'));
  });
  await check('Windows 阅读全屏、章节独立页、页数与页脚章节、键盘焦点无黑框',async()=>{
    await page.locator('#more-tools').click();await page.locator('#settings').click();await setSetting(page,'readingMode','pages');await closeSettings(page);await selectAppView(page,'reader');await page.locator('[data-read]').filter({has:page.locator('strong',{hasText:/^Novel$/})}).click();await page.waitForSelector('.reader-paged');await page.waitForTimeout(350);
    const fullscreen=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen());assert.equal(fullscreen,true);assert.match(await page.locator('#reader-position').textContent(),/^1 \/ \d+/);assert.equal(await page.locator('#reader-footer-chapter').textContent(),'第一章：启航');assert.equal(await page.locator('.reader-section-title').count(),2);
    const viewport=page.locator('.reader-viewport');await viewport.focus();assert.equal(await viewport.evaluate(element=>getComputedStyle(element).outlineStyle),'none');await viewport.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));await page.waitForTimeout(300);assert.match(await page.locator('#reader-position').textContent(),/^2 \/ /);
    await viewport.evaluate(element=>{getSelection()?.removeAllRanges();const box=element.getBoundingClientRect();element.dispatchEvent(new MouseEvent('click',{clientX:box.x+box.width*.5,clientY:box.y+box.height*.5,bubbles:true}));});await page.locator('#reader-back').click();await page.waitForTimeout(200);assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),false);
  });
  await check('HTML 预览隔离，用户脚本默认禁用且无原生文件和账号桥',async()=>{
    const opened=application.waitForEvent('window');const result=await page.evaluate(async()=>JSON.parse(await window.WenzhouNative.call('previewHtml',JSON.stringify({path:'QA/Page.html',dark:false}))));assert.equal(result.ok,true);const preview=await opened;await preview.waitForLoadState();assert.equal(await preview.locator('h1').textContent(),'Preview QA');assert.equal(await preview.evaluate(()=>typeof window.WenzhouNative),'undefined');assert.equal(await preview.evaluate(()=>typeof window.require),'undefined');assert.equal(await preview.evaluate(()=>document.body.dataset.untrusted),undefined);await preview.close();
  });
  await check('Windows 双页阅读与隔离 HTML 双页布局，每次翻动两页',async()=>{
    await selectAppView(page,'write');await page.locator('#more-tools').click();await page.locator('#settings').click();await setSetting(page,'readingMode','double');await closeSettings(page);await selectAppView(page,'reader');await page.locator('[data-read]').filter({has:page.locator('strong',{hasText:/^Novel$/})}).click();await page.waitForSelector('.reader-double');await page.waitForTimeout(300);
    assert.match(await page.locator('#reader-position').textContent(),/^1–2 \/ /);await page.locator('.reader-viewport').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));await page.waitForTimeout(300);assert.match(await page.locator('#reader-position').textContent(),/^3–4 \/ /);
    const opened=application.waitForEvent('window');const result=await page.evaluate(async()=>JSON.parse(await window.WenzhouNative.call('previewHtml',JSON.stringify({path:'QA/Page.html',reading:true,readingMode:'double'}))));assert.equal(result.ok,true);const preview=await opened;await preview.waitForSelector('.vela-reader-spread');assert.equal(await preview.evaluate(()=>typeof window.WenzhouNative),'undefined');await preview.close();
    await page.locator('.reader-viewport').evaluate(el=>{const b=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{clientX:b.x+b.width/2,clientY:b.y+b.height/2,bubbles:true}));});await page.locator('#reader-back').click();
  });
  await check('Windows 随包 TeX 引擎实际编译并显示 PDF',async()=>{
    await selectAppView(page,'write');await page.locator('#mobile-library').click();await page.locator('#new-doc').click();await page.locator('#dialog [name=name]').fill('Windows-compile.tex');await page.locator('#dialog-submit').click();
    await page.evaluate(()=>{const view=window.velaEditorView;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'\\documentclass{article}\n\\begin{document}\nWindows Vela PDF test.\\newpage Second page.\n\\end{document}'}});});await page.locator('#quick-save').click();await page.locator('[data-display=preview]').click();if(process.env.VELA_TEST_FLAVOR==='lite'){await page.waitForSelector('.tex-component-controls:not([hidden])');await page.locator('.tex-component-import').click();await page.locator('#plugin-input').setInputFiles('dist/tex-components/Vela-TeX-0.1.1.zip');await page.waitForFunction(()=>[...document.querySelectorAll('.plugin-card')].some(card=>card.textContent.includes('vela.component.tex')&&card.textContent.includes('已启用')),null,{timeout:120000});await page.locator('#dialog-cancel').click();console.log('PASS Windows lite component imported');}await page.locator('.tex-compile').click();await page.waitForSelector('.pdf-canvas canvas',{timeout:90000});assert.ok(await page.locator('.pdf-canvas canvas').evaluate(canvas=>canvas.width>100&&canvas.height>100));
  });
  assert.deepEqual(errors,[]);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/windows-071.png'});fs.writeFileSync('test-results/windows-071-results.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
}catch(error){await page?.screenshot({path:'test-results/windows-071-failure.png'}).catch(()=>{});throw error;}finally{await application.close();fs.rmSync(data,{recursive:true,force:true});}
