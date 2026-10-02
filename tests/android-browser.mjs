import {_android} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import assert from 'node:assert/strict';

const serial=process.env.WENZHOU_ANDROID_SERIAL||'emulator-5582';
if(!/^emulator-\d+$/.test(serial))throw new Error('安卓回归测试仅允许专用模拟器。');
const registry=name=>execFileSync('powershell.exe',['-NoProfile','-Command',`[Environment]::GetEnvironmentVariable('${name}','User')`],{encoding:'utf8'}).trim();
const sdk=process.env.ANDROID_HOME||registry('ANDROID_HOME');
const adb=(...args)=>execFileSync(`${sdk}/platform-tools/adb.exe`,['-s',serial,...args],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024}).trim();
assert.match(adb('emu','avd','name'),/^Wenzhou_QA_API36/);
adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
const devices=await _android.devices(),device=devices.find(d=>d.serial()===serial);
if(!device)throw new Error('请先启动 Wenzhou_QA_API36 测试模拟器。');
let p,checks=[],errors=[],deviceClosed=false;
await mkdir('test-results',{recursive:true});
const connect=async()=>{const web=await device.webView({pkg:'me.wenzhou.write'});p=await web.page();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('.cm-editor',{timeout:30000,state:'attached'});await p.waitForFunction(()=>typeof window.wenzhouSave==='function');};
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const invoke=async(op,payload={})=>{
  const result=await p.evaluate(async({op,payload})=>JSON.parse(await window.WenzhouNative.call(op,JSON.stringify(payload))),{op,payload});
  if(!result.ok)throw new Error(result.error);return result.value;
};
async function nav(name){if(await p.locator('body').evaluate(el=>el.classList.contains('reader-open')&&!el.classList.contains('reader-chrome-visible'))){await p.waitForTimeout(220);const box=await p.locator('.reader-viewport').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);await p.waitForFunction(()=>document.body.classList.contains('reader-chrome-visible'));await p.waitForTimeout(180);}await p.locator(`[data-view=${name}]`).click();}
const saved=()=>p.evaluate(()=>{if(!window.wenzhouSave())throw Error('Native save failed');return JSON.parse(window.WenzhouNative.readWorkspace());});
const prefix='移植验证-'+Date.now();
try{
  await connect();
  await check('Android 原生桥、内部工作区和操作指南首次启动',async()=>{
    assert.equal(await p.evaluate(()=>window.WenzhouNative.platform),'android');
    const state=await saved();assert.equal(state.storage.internal,true);assert.equal(state.storage.needsSetup,false);assert.ok(state.documents.some(d=>d.name==='操作指南.txt'));
    const layout=await p.evaluate(()=>({top:document.querySelector('.topbar').getBoundingClientRect().top,env:JSON.parse(window.WenzhouNative.readEnvironment())}));
    assert.ok(layout.top>=layout.env.top-.5);assert.equal(await p.locator('#setup-storage,#open-folder').count(),0);
  });
  await p.evaluate(prefix=>{const state=JSON.parse(window.WenzhouNative.readWorkspace()),doc={id:crypto.randomUUID(),name:'正文.txt',path:prefix+'/正文.txt',text:'第一章 开始\n原始正文\n\n第二章 继续\n后续正文',updatedAt:Date.now(),remote:null};state.settings.theme='system';state.settings.libraryOpen=false;state.documents.unshift(doc);state.folders.push(prefix+'/空目录');state.activeId=doc.id;state.openIds.push(doc.id);const result=window.WenzhouNative.writeWorkspace(JSON.stringify(state));if(result!=='ok')throw Error(result);},prefix);
  await p.reload();await p.waitForSelector('.cm-editor',{state:'attached'});
  await check('Tab 缩进、撤回重做、章节跳转和实际文件保存',async()=>{
    await p.locator('#quick-top').click();await p.keyboard.press('Tab');assert.ok((await saved()).documents.find(d=>d.path===prefix+'/正文.txt').text.startsWith('　　第一章'));
    await p.locator('#quick-undo').click();assert.ok((await saved()).documents.find(d=>d.path===prefix+'/正文.txt').text.startsWith('第一章'));
    await p.locator('#quick-redo').click();assert.ok((await saved()).documents.find(d=>d.path===prefix+'/正文.txt').text.startsWith('　　第一章'));
    await p.locator('#quick-bottom').click();await p.locator('#quick-chapter-top').click();assert.match(await p.locator('#current-chapter').innerText(),/第二章/);
    assert.match(adb('shell','run-as','me.wenzhou.write','cat','files/workspaces/文舟/'+prefix+'/正文.txt'),/原始正文/);
  });
  await check('系统深浅模式实时跟随，手动主题保留',async()=>{
    adb('shell','cmd','uimode','night','yes');await p.waitForFunction(()=>document.body.classList.contains('dark'));
    adb('shell','cmd','uimode','night','no');await p.waitForFunction(()=>!document.body.classList.contains('dark'));
    await p.locator('#theme').click();const mode=(await saved()).settings.theme;adb('shell','cmd','uimode','night','yes');assert.equal((await saved()).settings.theme,mode);
    adb('shell','cmd','uimode','night','no');
  });
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  await check('整批文件写入保留 UTF-16 CSV、HTML、Markdown、图片和空目录',async()=>{
    await saved();const files=[{path:prefix+'/人物.CSV',data:Buffer.concat([Buffer.from([255,254]),Buffer.from('姓名;身份\n甲;主角','utf16le')]).toString('base64')},{path:prefix+'/页面.HTML',data:Buffer.from('<!doctype html><h1>原生页面</h1>').toString('base64')},{path:prefix+'/设定.md',data:Buffer.from('# 设定\n\n- [ ] 场景\n\n![封面](封面.png)').toString('base64')},{path:prefix+'/封面.png',data:png}];
    const state=await invoke('writeWorkspaceFiles',{files,folders:[prefix+'/空目录']});assert.equal(state.documents.find(d=>d.path===prefix+'/人物.CSV').text,'姓名;身份\n甲;主角');assert.equal(state.entries.find(e=>e.path===prefix+'/封面.png').editable,false);assert.ok(state.folders.includes(prefix+'/空目录'));
    assert.equal(await invoke('readWorkspaceAsset',{path:prefix+'/封面.png'}),'data:image/png;base64,'+png);
    await p.reload();await p.waitForSelector('.cm-editor',{state:'attached'});
  });
  await check('CSV 显示为可编辑表格，Markdown 工具栏与本地图片预览',async()=>{
    await p.locator('#mobile-library').click();const state=await saved(),csv=state.documents.find(d=>d.path===prefix+'/人物.CSV');
    await p.locator(`[data-doc="${csv.id}"]`).click();await p.locator('#preview table').waitFor();await p.locator('[data-cell-row="1"][data-cell-column="0"]').fill('乙');assert.match((await saved()).documents.find(d=>d.id===csv.id).text,/乙/);
    const md=state.documents.find(d=>d.path===prefix+'/设定.md');await p.locator(`[data-doc="${md.id}"]`).click();assert.equal(await p.locator('#markdown-tools').isVisible(),true);
    await p.locator('#preview-toggle').click();await p.locator('#preview img').waitFor();assert.equal(await p.locator('body').evaluate(b=>b.classList.contains('show-library')),true);
    await p.locator('#mobile-library').click();
  });
  await check('独立原生 HTML 预览：本地样式图片、脚本开关和桥隔离',async()=>{
    await saved();const html='<!doctype html><html><head><link rel="stylesheet" href="样式.css"></head><body><h1 id="title">排版验证</h1><img id="cover" src="封面.png"><button id="action">交互按钮</button><div contenteditable="true" id="editable">Editable</div><script src="行为.js"></script></body></html>';
    const state=await invoke('writeWorkspaceFiles',{files:[{path:prefix+'/预览.html',data:Buffer.from(html).toString('base64')},{path:prefix+'/样式.css',data:Buffer.from('h1{color:rgb(17,85,34);font-size:30px}body{margin:12px}').toString('base64')},{path:prefix+'/行为.js',data:Buffer.from("document.body.dataset.script='ready';document.querySelector('#action').onclick=()=>document.querySelector('#title').textContent='交互成功';").toString('base64')}]});
    await p.reload();await p.waitForSelector('.cm-editor',{state:'attached'});await p.locator('#mobile-library').click();const doc=(await saved()).documents.find(d=>d.path===prefix+'/预览.html');await p.locator(`[data-doc="${doc.id}"]`).click();
    const context=p.context(),wait=context.waitForEvent('page');await p.locator('[data-display="preview"]').click();const preview=await wait;await preview.waitForSelector('#title');
    assert.ok(preview.url().startsWith('https://wenzhou-preview.local/'));assert.equal(await preview.locator('#title').evaluate(e=>getComputedStyle(e).color),'rgb(17, 85, 34)');await preview.waitForFunction(()=>document.querySelector('#cover').naturalWidth===1);
    assert.equal(await preview.evaluate(()=>document.body.dataset.script||''),'');assert.equal(await preview.evaluate(()=>typeof window.WenzhouNative+':'+typeof window.WenzhouAndroid),'undefined:undefined');
    const blocked=await preview.evaluate(async()=>{try{return (await fetch('/../workspace.json')).status;}catch{return 0;}});assert.ok(blocked===403||blocked===0);
    await device.tap({text:'脚本：关'});await preview.waitForFunction(()=>document.body.dataset.script==='ready');await preview.locator('#action').click();assert.equal(await preview.locator('#title').innerText(),'交互成功');
    await device.tap({text:'返回编辑'});await p.locator('.cm-editor').waitFor();assert.equal(await p.locator('body').evaluate(b=>b.classList.contains('show-library')),true);await p.locator('#mobile-library').click();
  });
  await check('.vela GUI 原生保存、只读阅读、HTML 禁止编辑与双指字号状态',async()=>{
    await saved();const config={version:1,name:'验证工作区',fontSize:21,titleTemplates:['【{number}】{title}'],reading:{files:['正文.txt','人物.CSV','预览.html','设定.md']}};
    await invoke('writeWorkspaceFiles',{files:[{path:prefix+'/.vela',data:Buffer.from(JSON.stringify(config)).toString('base64')}]});await p.reload();await p.waitForSelector('.cm-editor',{state:'attached'});await p.locator('#mobile-library').click();const state=await saved(),manifest=state.documents.find(d=>d.path===prefix+'/.vela');await p.locator(`[data-doc="${manifest.id}"]`).click();await p.waitForSelector('#vela-form');await p.locator('#vela-form [name=fontSize]').fill('22');await p.locator('#vela-form .primary').click();assert.equal(JSON.parse(adb('shell','run-as','me.wenzhou.write','cat','files/workspaces/文舟/'+prefix+'/.vela')).fontSize,22);
    await p.locator('#mobile-library').click();await nav('reader');const book=state.documents.find(d=>d.path===prefix+'/正文.txt');await p.locator(`[data-read="${book.id}"]`).click();await p.waitForFunction(()=>document.querySelector('.reader-content')?.textContent.includes('原始正文'));assert.equal(await p.locator('.reader-content [contenteditable],.reader-content textarea').count(),0);assert.equal(await p.locator('#document-tabs').isVisible(),false);const before=(await saved()).documents.find(d=>d.id===book.id).text;await p.keyboard.press('Control+z');assert.equal((await saved()).documents.find(d=>d.id===book.id).text,before);await p.evaluate(()=>window.wenzhouNativeScale(1.2));assert.ok(await p.locator('.reader-content').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>22));
    await nav('reader');const html=state.documents.find(d=>d.path===prefix+'/预览.html'),wait=p.context().waitForEvent('page');await p.locator(`[data-read="${html.id}"]`).click();const preview=await wait;await preview.waitForSelector('#title');assert.equal(await preview.locator('#action').isDisabled(),true);assert.equal(await preview.locator('#editable').getAttribute('contenteditable'),null);assert.equal(await preview.evaluate(()=>typeof window.WenzhouNative+':'+typeof window.WenzhouAndroid),'undefined:undefined');await preview.waitForFunction(()=>window.velaHtmlReaderReady===true);assert.equal(await preview.evaluate(()=>document.body.dataset.script||''),'');adb('shell','input','keyevent','4');await p.locator('.reader-header').waitFor({state:'attached'});await nav('write');assert.equal(await invoke('readWorkspaceFile',{path:prefix+'/封面.png'}),png);
    await assert.rejects(invoke('publicApi',{path:'/user',method:'GET'}),/repository|仓库/);await assert.rejects(invoke('publicApi',{path:'/repos/o/r',method:'POST'}),/repository|仓库/);
  });
  await check('移动复制、回收站恢复与永久删除，保留附件和空目录',async()=>{
    await saved();const initial=await invoke('refreshFolder'),original=initial.documents.find(d=>d.path===prefix+'/正文.txt');
    const copied=await invoke('manageFiles',{action:'copy',path:prefix,destination:prefix+'-副本'});const clone=copied.documents.find(d=>d.path===prefix+'-副本/正文.txt');assert.notEqual(clone.id,original.id);
    await invoke('manageFiles',{action:'move',path:prefix+'-副本',destination:prefix+'-改名'});await invoke('manageFiles',{action:'delete',path:prefix+'-改名'});
    let trash=(await invoke('listTrash')).find(t=>t.path===prefix+'-改名');assert.ok(trash);
    const restored=await invoke('restoreTrash',{id:trash.id});assert.ok(restored.folders.includes(prefix+'-改名/空目录'));assert.equal(await invoke('readWorkspaceAsset',{path:prefix+'-改名/封面.png'}),'data:image/png;base64,'+png);
    await invoke('manageFiles',{action:'delete',path:prefix+'-改名'});trash=(await invoke('listTrash')).find(t=>t.path===prefix+'-改名');await invoke('restoreTrash',{id:trash.id,permanent:true});
    assert.ok(!(await invoke('listTrash')).some(t=>t.path===prefix+'-改名'));
  });
  await check('越界路径、未授权桥调用和仓库中途失败不会覆盖文稿',async()=>{
    await assert.rejects(invoke('readWorkspaceAsset',{path:'../outside.png'}),/相对路径/);
    assert.equal(await p.evaluate(()=>{try{window.WenzhouAndroid.readWorkspace('invalid');return false;}catch{return true;}}),true);
    const path=prefix+'/正文.txt',before=adb('shell','run-as','me.wenzhou.write','cat','files/workspaces/文舟/'+path);
    await assert.rejects(invoke('writeWorkspaceFiles',{files:[{path,data:Buffer.from('不应保留').toString('base64')},{path:path+'/失败.txt',data:'YQ=='}]}));
    assert.equal(adb('shell','run-as','me.wenzhou.write','cat','files/workspaces/文舟/'+path),before);
    await assert.rejects(invoke('api',{path:'//example.com',method:'GET'}),/请求路径/);
    await assert.rejects(invoke('login',{token:'invalid token'}),/令牌格式/);
  });
  await check('Acode JS 插件安装、执行及配置持久化',async()=>{
    const plugin=zipSync({'plugin.json':strToU8(JSON.stringify({id:'wenzhou.qa',name:'移植验证插件',version:'1.0.0',main:'main.js'})),'main.js':strToU8("acode.setPluginInit('wenzhou.qa',()=>{document.body.dataset.androidPlugin='ready';});acode.setPluginUnmount('wenzhou.qa',()=>{});")});
    // Exercise the same ZIP input handler without opening the native picker.
    await p.locator('#plugin-input').setInputFiles({name:'qa-plugin.zip',mimeType:'application/zip',buffer:Buffer.from(plugin)});
    await p.waitForFunction(()=>document.body.dataset.androidPlugin==='ready');assert.match(await p.evaluate(()=>window.WenzhouNative.readPlugins()),/wenzhou.qa/);
    await p.locator('#dialog-cancel').click();
  });
  await check('Android WebView 本地 XeLaTeX 中文编译、PDF 渲染与宏包持久化',async()=>{
    await saved();const source=String.raw`\documentclass{ctexart}\begin{document}\section{文舟}中文 PDF。\end{document}`;
    const folder=await invoke('writeWorkspaceFiles',{files:[{path:prefix+'/main.tex',data:Buffer.from(source).toString('base64')}]});await p.reload();await p.waitForSelector('.cm-editor',{state:'attached'});if(!await p.locator('#library').isVisible())await p.locator('#mobile-library').click();const doc=(await saved()).documents.find(doc=>doc.path===prefix+'/main.tex');await p.locator(`[data-doc="${doc.id}"]`).click();await p.locator('#preview-toggle').click();await p.locator('.tex-compile').click();await p.waitForFunction(()=>!document.querySelector('.tex-compile').disabled,{},{timeout:180000});await writeFile('test-results/android-tex.log',await p.locator('.tex-log pre').textContent());assert.equal(await p.locator('.tex-status').textContent(),'编译完成');assert.ok(await p.locator('canvas').evaluate(canvas=>canvas.width>0));assert.match(await p.evaluate(()=>window.WenzhouNative.readPlugins()),/vela.tex.cjk/);await p.screenshot({path:'test-results/android-tex.png'});
  });
  await check('进程退出后文稿、主题和插件重新加载',async()=>{
    const before=await saved();await device.close();deviceClosed=true;adb('shell','am','force-stop','me.wenzhou.write');adb('shell','am','start','-W','-n','me.wenzhou.write/.MainActivity');
    const nextDevices=await _android.devices(),next=nextDevices.find(d=>d.serial()===serial);const web=await next.webView({pkg:'me.wenzhou.write'});p=await web.page();await p.waitForSelector('.cm-editor',{state:'attached'});await p.waitForFunction(()=>document.querySelector('#preview')?.offsetWidth>0||document.querySelector('.cm-editor')?.offsetWidth>0);
    const after=await saved();assert.equal(after.documents.find(d=>d.path===prefix+'/正文.txt').text,before.documents.find(d=>d.path===prefix+'/正文.txt').text);assert.equal(after.settings.theme,before.settings.theme);await p.waitForFunction(()=>document.body.dataset.androidPlugin==='ready');await next.close();
  });
  assert.deepEqual(errors,[]);await writeFile('test-results/android-results.json',JSON.stringify({passed:checks.length,checks,pageErrors:errors},null,2));
}catch(error){if(p)await p.screenshot({path:'test-results/android-failure.png'}).catch(()=>{});throw error;}
finally{if(!deviceClosed)await device.close().catch(()=>{});try{adb('shell','am','force-stop','com.microsoft.playwright.androiddriver');}catch{}}
