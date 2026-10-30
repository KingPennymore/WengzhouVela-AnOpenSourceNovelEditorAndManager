import {editorAction} from './mobile-editor-helper.mjs';
import {setSetting,closeSettings} from './settings-helper.mjs';
import {launchBrowser} from './browser-launch.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {parseCsv} from '../web/csv.mjs';
import {editCsvCell,csvCellText,findCsvCell} from './csv-grid-helper.mjs';
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{
  const file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const contents=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain'}).end(contents);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await launchBrowser();
const checks=[],errors=[];
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function context(seed,options={}){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},...options});
  if(seed)await ctx.addInitScript(data=>{if(window!==window.top)return;if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(data));},seed);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.velaReady&&document.querySelector('#current-name').textContent);return {ctx,p};
}
const doc=(id,name,text)=>({id,name,text,updatedAt:1,remote:null});
const saved=p=>p.evaluate(()=>{window.wenzhouSave();return JSON.parse(localStorage.getItem('wenzhou.workspace'));});
const data={version:1,activeId:'book',settings:{theme:'system'},documents:[doc('book','操作指南.txt','第一章 开始\n正文甲\n\n第二章 继续\n正文乙')],openIds:['book']};
async function importFile(p,name,text){await p.locator('#file-input').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(name=>document.querySelector('#current-name').textContent===name,name);}
try{
  const fresh=await context(null,{colorScheme:'dark'}),p=fresh.p;
  await check('首次安装显示新建空状态，指南仍可打开，Tab 保持正文焦点',async()=>{
    await p.locator('.ui-empty').waitFor();await p.locator('[data-start=guide]').click();await p.locator('.cm-content').waitFor();assert.match(await p.locator('.cm-content').innerText(),/^文舟操作指南/);assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('dark')),true);
    await editorAction(p,'#quick-top');await p.keyboard.press('Tab');assert.ok((await saved(p)).documents[0].text.startsWith('  文舟'));
    assert.equal(await p.locator('.cm-content').evaluate(el=>el.contains(document.activeElement)||el===document.activeElement),true);
    await p.keyboard.press('Shift+Tab');assert.ok((await saved(p)).documents[0].text.startsWith('文舟'));
  });
  await check('系统深浅模式实时跟随，手动外观可固定并在重启后保留',async()=>{
    await p.emulateMedia({colorScheme:'light'});await p.waitForFunction(()=>!document.body.classList.contains('dark'));
    await p.emulateMedia({colorScheme:'dark'});await p.waitForFunction(()=>document.body.classList.contains('dark'));
    await p.locator('#more-tools').click();await p.locator('#settings').click();await setSetting(p,'theme','light');await closeSettings(p);
    // The new look is painted when the cross-fade starts; until then the old dark class is still on.
    await p.waitForFunction(()=>!document.body.classList.contains('dark'));
    await p.emulateMedia({colorScheme:'dark'});assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('dark')),false);
    await p.reload();await p.waitForSelector('.cm-editor');assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('dark')),false);
  });
  const working=await context(data),w=working.p;
  await check('八项底部操作的快捷键执行保存、撤回、重做、文件和章节跳转及 Git',async()=>{
    await w.locator('.cm-content').click();await w.keyboard.press('Control+Home');await w.keyboard.insertText('增加');await w.keyboard.press('Control+s');assert.ok((await saved(w)).documents[0].text.startsWith('增加'));
    await w.keyboard.press('Control+z');assert.ok((await saved(w)).documents[0].text.startsWith('第一章'));
    await w.keyboard.press('Control+Shift+z');assert.ok((await saved(w)).documents[0].text.startsWith('增加'));
    await w.keyboard.press('Control+End');assert.equal(await w.locator('#cursor-position').textContent(),'行 5，列 4');
    await w.keyboard.press('Alt+ArrowUp');assert.equal(await w.locator('#cursor-position').textContent(),'行 4，列 1');
    await w.keyboard.press('Alt+ArrowDown');assert.equal(await w.locator('#cursor-position').textContent(),'行 5，列 4');
    await w.keyboard.press('Control+Home');assert.equal(await w.locator('#cursor-position').textContent(),'行 1，列 1');
    await w.keyboard.press('Control+Shift+g');await w.waitForSelector('#token-login');await w.locator('[data-return-write]').click();
    await w.keyboard.press('Control+Shift+k');assert.ok(await w.locator('.command-item').count()>=24);assert.ok((await w.locator('#command-list').innerText()).includes('Ctrl+Shift+G'));await w.locator('#dialog-cancel').click();
  });
  await check('关闭文件标签保存内容且保留文件，关闭全部后显示启动页并能重新打开',async()=>{
    await w.locator('[data-close="book"]').click();assert.equal(await w.locator('#start-page').isVisible(),true);assert.equal(await w.locator('[data-tab]').count(),0);
    const store=await saved(w);assert.equal(store.documents.length,1);assert.ok(store.documents[0].text.startsWith('增加'));
    await openRecentFile(w,w.locator('[data-recent="book"]'));await w.waitForSelector('.cm-editor');assert.ok((await w.locator('.cm-content').innerText()).includes('正文乙'));
  });
  await check('CSV 默认显示表格，带逗号、换行和引号的单元格可编辑、保存与撤回',async()=>{
    await importFile(w,'角色.csv','姓名,备注\n甲,"引号""内容\n第二行"\n乙,原文');
    await w.locator('[role=grid][aria-label="表格编辑"]').waitFor();
    assert.equal(await w.locator('[role=grid][aria-label="表格编辑"]').isVisible(),true);assert.equal(await w.locator('#editor').isVisible(),false);
    assert.equal(await csvCellText(w,1,1),'引号"内容\n第二行');await editCsvCell(w,1,1,'逗号,引号"与\n换行');await w.keyboard.press('Control+s');
    const state=await saved(w);assert.equal(parseCsv(state.documents.find(d=>d.name==='角色.csv').text)[1][1],'逗号,引号"与\n换行');
    await w.locator('#quick-undo').click();await w.waitForFunction(()=>document.querySelector('[data-cell-row="1"][data-cell-column="1"]')?.textContent==='引号"内容\n第二行');await w.locator('#quick-redo').click();await w.waitForFunction(()=>document.querySelector('[data-cell-row="1"][data-cell-column="1"]')?.textContent==='逗号,引号"与\n换行');
    await w.locator('#csv-add-row').click();await w.waitForFunction(()=>document.querySelectorAll('.csv-row-heading').length===4);await w.locator('#csv-add-column').click();await w.waitForFunction(()=>document.querySelectorAll('.csv-column-heading').length===3);
    await editorAction(w,'[data-display=source]');assert.equal(await w.locator('#editor').isVisible(),true);assert.ok((await w.locator('.cm-content').innerText()).includes('逗号'));
  });
  await check('HTML 扩展名保持不变，预览与原生桥接隔离，脚本和外部资源不执行',async()=>{
    let remoteRequests=0;await w.route('https://example.invalid/**',r=>{remoteRequests++;r.abort();});
    await importFile(w,'简介.html','<h1>人物设定</h1><table><tr><td>甲</td></tr></table><script>window.parent.__htmlExecuted=true</script><img src="https://example.invalid/x.png"><iframe></iframe>');
    await editorAction(w,'[data-display=preview]');const frame=w.frameLocator('#preview iframe');await frame.locator('h1').waitFor();assert.equal(await frame.locator('h1').innerText(),'人物设定');assert.equal(await frame.locator('script,iframe').count(),0);assert.equal(await w.evaluate(()=>window.__htmlExecuted),undefined);assert.equal(remoteRequests,0);
    assert.ok((await saved(w)).documents.some(d=>d.name==='简介.html'));await editorAction(w,'[data-display=source]');
  });
  await check('双指缩放与 Ctrl 加减号只改变文字字号，工具栏与页面缩放比例不变',async()=>{
    const before=await w.locator('#quick-save').boundingBox();const font=await w.locator('.cm-editor').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    await w.locator('.paper').evaluate(el=>{
      const touches=distance=>[new Touch({identifier:1,target:el,clientX:100,clientY:150}),new Touch({identifier:2,target:el,clientX:100+distance,clientY:150})];
      el.dispatchEvent(new TouchEvent('touchstart',{touches:touches(100),bubbles:true,cancelable:true}));el.dispatchEvent(new TouchEvent('touchmove',{touches:touches(150),bubbles:true,cancelable:true}));el.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));
    });
    assert.equal(await w.locator('.cm-editor').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),Math.round(font*1.5));assert.deepEqual(await w.locator('#quick-save').boundingBox(),before);assert.equal(await w.evaluate(()=>visualViewport.scale),1);
    await w.locator('.cm-content').focus();await w.keyboard.press('Control+0');assert.equal((await saved(w)).settings.fontSize,16);
  });
  await check('没有操作指南时启动显示最近文件页，已有正文不被修改',async()=>{
    const existing=await context({version:1,activeId:'existing',documents:[doc('existing','我的小说.txt','私有正文')],settings:{}});
    await existing.p.locator('#start-page').waitFor({state:'visible'});assert.equal(await existing.p.locator('[data-recent="existing"]').textContent().then(t=>t.includes('我的小说.txt')),true);
    await openRecentFile(existing.p,existing.p.locator('[data-recent="existing"]'));assert.equal((await saved(existing.p)).documents[0].text,'私有正文');await existing.ctx.close();
  });
  await check('CSV 大表可查找并滚动查看全部数据，编辑不丢失',async()=>{
    await importFile(w,'全表.csv',Array.from({length:205},(_,i)=>`${i},值${i}`).join('\n'));await editCsvCell(w,1,1,'已修改');await findCsvCell(w,'值100');await w.waitForFunction(()=>document.querySelector('#csv-cell-reference')?.textContent==='B101');assert.equal(await csvCellText(w,100,1),'值100');await findCsvCell(w,'值204');await w.waitForFunction(()=>document.querySelector('#csv-cell-reference')?.textContent==='B205');await findCsvCell(w,'已修改');await w.waitForFunction(()=>document.querySelector('#csv-cell-reference')?.textContent==='B2');assert.equal(await csvCellText(w,1,1),'已修改');
  });
  const writerZip=zipSync({'plugin.json':new Uint8Array(await readFile('vendor/acode-writer/plugin.json')),'main.js':new Uint8Array(await readFile('vendor/acode-writer/main.js'))});
  await check('旧版 Acode 插件（Writer 1.0.4）被明确拒绝，入口不执行',async()=>{
    await w.locator('[data-tab="book"]').click();await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('#plugin-input').setInputFiles({name:'Writer-1.0.4.zip',mimeType:'application/zip',buffer:Buffer.from(writerZip)});
    await w.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('旧版 Acode'));assert.equal(await w.locator('.aw-bar').count(),0);assert.ok((await w.locator('.plugin-card').filter({hasText:'com.tuyuan.acode.writer'}).innerText()).includes('旧版 Acode'));
    await w.locator('.plugin-card').filter({hasText:'com.tuyuan.acode.writer'}).locator('[data-plugin-remove]').click();await w.locator('#dialog-cancel').click();
  });
  const api4=(id,name,extra={})=>JSON.stringify({id,name,version:'1.0.0',main:'main.js',...extra,vela:{api:'>=4 <5',...extra.vela}});
  await check('API 4 插件包内脚本、CSS、资源、命令与卸载清理可用',async()=>{
    const id='com.example.assets';
    const code=`let node,link;VelaPlugins.register('${id}',{async activate(vela){link=document.createElement('link');link.rel='stylesheet';link.href=vela.assets.url('style.css');document.head.append(link);const data=JSON.parse(await vela.assets.read('data.json'));node=document.createElement('div');node.className='fixture-plugin';node.textContent=data.text;document.body.append(node);vela.commands.register({id:'insert',title:'测试：插入',run:()=>{const v=vela.editor.view;v.dispatch(v.state.replaceSelection('插件内容'));}});},deactivate(){node?.remove();link?.remove();}});`;
    const bytes=zipSync({'plugin.json':strToU8(api4(id,'资源测试')),'main.js':strToU8(code),'style.css':strToU8('.fixture-plugin{position:fixed;top:100px;right:10px;color:rgb(1,2,3)}'),'data.json':strToU8('{"text":"包内资源已加载"}')});
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('#plugin-input').setInputFiles({name:'assets.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});await w.waitForSelector('.fixture-plugin');assert.equal(await w.locator('.fixture-plugin').innerText(),'包内资源已加载');await w.waitForFunction(()=>getComputedStyle(document.querySelector('.fixture-plugin')).color==='rgb(1, 2, 3)');await w.locator('#dialog-cancel').click();
    await editorAction(w,'#quick-top');await w.locator('#more-tools').click();await w.locator('#commands').click();await w.locator('#command-search').fill('测试：插入');await w.locator('.command-item').click();assert.ok((await saved(w)).documents.find(d=>d.id==='book').text.startsWith('插件内容'));
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('[data-plugin-remove]').click();assert.equal(await w.locator('.fixture-plugin').count(),0);await w.locator('#dialog-cancel').click();
    assert.equal(await w.evaluate(()=>typeof window.acode+typeof window.editorManager),'undefinedundefined','Acode globals are gone');
  });
  await check('插件按钮进入顶栏、文稿工具区、底栏、两侧侧栏与选区菜单，面板和内置按钮调整在停用后恢复',async()=>{
    const id='com.example.slots';
    const code=`VelaPlugins.register('${id}',{activate(vela){const press=location=>()=>{window.slotRuns=[...(window.slotRuns||[]),location];};for(const location of ['top-toolbar','document-toolbar','bottom-toolbar','library-sidebar','outline-sidebar'])vela.ui.addButton({id:'b-'+location,title:'插件'+location,icon:'task',location,run:press(location)});vela.ui.addButton({id:'sel',title:'插件选区',location:'selection-menu',run:context=>{window.slotSelection=context.selection.text;}});const toggle=vela.ui.addButton({id:'toggle',title:'插件切换',location:'bottom-toolbar',toggle:true,run:()=>toggle.update({checked:true})});const panel=vela.ui.addPanel({id:'notes',title:'插件面板',location:'outline-sidebar'});panel.body.textContent='面板内容';vela.ui.setBuiltin('quick-git',{hidden:true});window.slotBuiltins=vela.ui.builtins('bottom-toolbar').map(item=>item.id);}});`;
    const bytes=zipSync({'plugin.json':strToU8(api4(id,'插槽测试',{vela:{requiredCapabilities:['ui-slots']}})),'main.js':strToU8(code)});
    await w.locator('[data-tab="book"]').click();await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('#plugin-input').setInputFiles({name:'slots.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});await w.waitForSelector('[data-plugin-button="com.example.slots/b-bottom-toolbar"]',{state:'attached'});await w.locator('#dialog-cancel').click();
    for(const location of ['document-toolbar','bottom-toolbar','library-sidebar','outline-sidebar'])assert.equal(await w.locator('#plugin-'+location+' [data-plugin-button="com.example.slots/b-'+location+'"]').count(),1,location+' button placed in its existing region');
    assert.equal(await w.locator('[data-plugin-button="com.example.slots/b-top-toolbar"]').count(),1,'top toolbar button placed in toolbar or overflow menu');
    await w.locator('#plugin-bottom-toolbar [data-plugin-button="com.example.slots/b-bottom-toolbar"]').click();await w.waitForFunction(()=>window.slotRuns?.includes('bottom-toolbar'));
    await w.locator('[data-plugin-button="com.example.slots/toggle"]').click();await w.waitForFunction(()=>document.querySelector('[data-plugin-button="com.example.slots/toggle"]').getAttribute('aria-pressed')==='true');
    assert.ok(await w.locator('#quick-git').evaluate(el=>getComputedStyle(el).display==='none'),'built-in quick bar button hidden by plugin');assert.ok((await w.evaluate(()=>window.slotBuiltins)).includes('quick-save'),'built-ins are listed by location');
    assert.equal(await w.locator('#plugin-outline-sidebar-panels .plugin-panel-body').textContent(),'面板内容');
    await w.evaluate(()=>{const v=velaEditorView;v.dispatch({selection:{anchor:0,head:2}});v.focus();});await w.waitForSelector('#selection-menu:not([hidden])');await w.locator('#selection-menu .selection-more-toggle').click();await w.locator('#selection-menu button',{hasText:'插件选区'}).click();assert.equal((await w.evaluate(()=>window.slotSelection)).length,2);
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('.plugin-card').filter({hasText:'插槽测试'}).locator('[data-plugin-enable]').click();await w.locator('#dialog-cancel').click();
    assert.equal(await w.locator('[data-plugin-button^="com.example.slots/"]').count(),0,'all plugin buttons removed when disabled');assert.equal(await w.locator('#plugin-outline-sidebar-panels .plugin-panel').count(),0);assert.ok(await w.locator('#quick-git').evaluate(el=>getComputedStyle(el).display!=='none'),'built-in button restored');
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('.plugin-card').filter({hasText:'插槽测试'}).locator('[data-plugin-remove]').click();await w.locator('#dialog-cancel').click();
  });
  await check('插件扩展、补全和事件跨文件切换，停用异常仍完成清理',async()=>{
    const main=`VelaPlugins.register('test.vela.lifecycle',{activate(vela){const {EditorView}=vela.editor.codemirror.view;vela.editor.addExtension(EditorView.theme({'.cm-content':{color:'rgb(17, 88, 33)'}}));vela.editor.addCompletion(context=>({from:context.pos,options:[{label:'vela-plugin-completion'}]}));vela.on('file-content-changed',()=>window.velaEventCount=(window.velaEventCount||0)+1);vela.dispose(()=>window.velaDisposed=true);},deactivate(){throw Error('fixture deactivate error');}});`;
    const bytes=zipSync({'plugin.json':strToU8(api4('test.vela.lifecycle','Lifecycle')),'main.js':strToU8(main)});
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('#plugin-input').setInputFiles({name:'lifecycle.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});await w.waitForFunction(()=>getComputedStyle(document.querySelector('.cm-content')).color==='rgb(17, 88, 33)');await w.locator('#dialog-cancel').click();
    await w.evaluate(()=>{const editor=velaEditorView;editor.dispatch({changes:{from:editor.state.doc.length,insert:'x'}});editor.focus();});assert.equal(await w.evaluate(()=>window.velaEventCount),1);await w.keyboard.press('Control+Space');await w.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('vela-plugin-completion'));await w.keyboard.press('Escape');
    const ids=await w.locator('[data-tab]').evaluateAll(items=>items.map(item=>item.dataset.tab));const alternate=ids.find(id=>id!=='book');if(alternate){await w.locator(`[data-tab="${alternate}"]`).click();await w.locator('[data-tab=book]').click();}
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('.plugin-card').filter({hasText:'Lifecycle'}).locator('[data-plugin-remove]').click();await w.waitForFunction(()=>window.velaDisposed===true);await w.locator('#dialog-cancel').click();assert.notEqual(await w.locator('.cm-content').evaluate(el=>getComputedStyle(el).color),'rgb(17, 88, 33)');
    if(alternate){await w.locator(`[data-tab="${alternate}"]`).click();await w.locator('[data-tab=book]').click();assert.notEqual(await w.locator('.cm-content').evaluate(el=>getComputedStyle(el).color),'rgb(17, 88, 33)');}
    await w.evaluate(()=>{const editor=velaEditorView;editor.dispatch({changes:{from:editor.state.doc.length,insert:'y'}});});assert.equal(await w.evaluate(()=>window.velaEventCount),1);
  });
  await check('缺少的插件能力给出具体加载原因，停用记录在重启后保留',async()=>{
    const bytes=zipSync({'plugin.json':strToU8(api4('com.example.unsupported','依赖检查',{vela:{requiredCapabilities:['terminal']}})),'main.js':strToU8('throw Error("must not run");')});
    await w.locator('#more-tools').click();await w.locator('#plugins').click();await w.locator('#plugin-input').setInputFiles({name:'unsupported.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});await w.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('terminal'));await w.locator('#dialog-cancel').click();
    await w.reload();await w.waitForSelector('.cm-editor');await w.locator('#more-tools').click();await w.locator('#plugins').click();assert.ok((await w.locator('.plugin-card .error').innerText()).includes('terminal'));await w.locator('.plugin-card').filter({hasText:'com.example.unsupported'}).locator('[data-plugin-remove]').click();await w.locator('#dialog-cancel').click();
  });
  await w.screenshot({path:'test-results/features-desktop.png'});
  await check('鸿蒙系统主题与安全区变化更新页面，原生双指缩放只调整字号',async()=>{
    const nativeContext=await browser.newContext({viewport:{width:390,height:844}});
    await nativeContext.addInitScript(data=>{let stored=JSON.stringify(data);window.WenzhouNative={readWorkspace:()=>stored,writeWorkspace:value=>{stored=value;return 'ok';},readPlugins:()=>'',writePlugins:()=> 'ok',readEnvironment:()=>JSON.stringify({dark:true,top:24,bottom:20,left:0,right:0}),call:async operation=>JSON.stringify({ok:true,value:operation==='initializeStorage'?{storage:{id:'',needsSetup:false},documents:[],folders:[],entries:[]}:operation==='api'?{status:401,body:{}}:true})};},data);
    const n=await nativeContext.newPage();n.on('pageerror',e=>errors.push(e.message));await n.goto(url);await n.waitForFunction(()=>window.velaReady);if(await n.locator('.ui-empty').isVisible())await n.locator('[data-start=guide]').click();await n.waitForSelector('.cm-editor');
    assert.equal(await n.locator('body').evaluate(el=>el.classList.contains('dark')),true);assert.equal(await n.locator('.statusbar').evaluate(el=>getComputedStyle(el).height),'28px');assert.equal(await n.locator('#writing-footer').evaluate(el=>getComputedStyle(el).paddingBottom),'20px','the quick bar, now the last row, keeps clear of the gesture area');
    const rect=await n.locator('#quick-save').boundingBox();await n.evaluate(()=>{window.dispatchEvent(new CustomEvent('wenzhouEnvironment',{detail:{dark:false,top:30,bottom:18,left:0,right:0}}));window.wenzhouNativePinch(1,'start');window.wenzhouNativePinch(1.5,'move');window.wenzhouNativePinch(1,'end');});
    await n.waitForFunction(()=>!document.body.classList.contains('dark'));
    assert.equal(await n.locator('body').evaluate(el=>el.classList.contains('dark')),false);assert.equal(await n.locator('.cm-editor').evaluate(el=>getComputedStyle(el).fontSize),'24px');assert.equal((await n.locator('#quick-save').boundingBox()).width,rect.width);assert.equal(await n.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await n.screenshot({path:'test-results/features-mobile.png'});await nativeContext.close();
  });
  await check('鸿蒙原生选区跨越中文标点、换行和全角缩进时，范围与复制替换一致',async()=>{
    const ctx=await browser.newContext({viewport:{width:900,height:900}});
    await ctx.addInitScript(()=>{let stored='';window.WenzhouNative={readWorkspace:()=>stored,writeWorkspace:s=>{stored=s;return 'ok';},readPlugins:()=>'',writePlugins:()=> 'ok',readEnvironment:()=>JSON.stringify({dark:false,top:0,bottom:18}),call:async operation=>JSON.stringify({ok:true,value:operation==='initializeStorage'?{storage:{id:'',needsSetup:false},documents:[],folders:[],entries:[]}:operation==='api'?{status:401,body:{}}:true})};});
    const n=await ctx.newPage();n.on('pageerror',e=>errors.push(e.message));await n.goto(url);await n.waitForFunction(()=>window.velaReady);if(await n.locator('.ui-empty').isVisible())await n.locator('[data-start=guide]').click();await n.waitForSelector('.cm-editor');
    const text='第一章 标题\n　　'+('正文，包含“引号”与标点。'.repeat(15))+'\n\n　　下一段落，选择到这里结束。\n第二章';
    const from=text.indexOf('包含'),to=text.indexOf('这里')+2;
    await n.evaluate(text=>{const v=velaEditorView;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text}});v.focus();},text);
    await n.waitForFunction(()=>document.querySelector('.cm-line')?.textContent==='第一章 标题');
    assert.ok(await n.locator('.cm-content wbr').count()>0);
    await n.evaluate(({from,to})=>{const v=velaEditorView,a=v.domAtPos(from),b=v.domAtPos(to);getSelection().setBaseAndExtent(a.node,a.offset,b.node,b.offset);},{from,to});
    await n.waitForFunction(({from,to})=>velaEditorView.state.selection.main.from===from&&velaEditorView.state.selection.main.to===to,{from,to});
    const copied=await n.evaluate(()=>{let copied='';const event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});velaEditorView.contentDOM.dispatchEvent(event);copied=event.clipboardData.getData('text/plain');return copied;});
    assert.equal(copied,text.slice(from,to));assert.equal(await n.locator('.cm-editor').evaluate(el=>el.classList.contains('has-selection')),true);assert.equal(await n.locator('.cm-activeLine').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await n.keyboard.insertText('替换内容');assert.notEqual(await n.locator('.cm-activeLine').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await n.evaluate(()=>velaEditorView.state.doc.toString()),text.slice(0,from)+'替换内容'+text.slice(to));
    await n.keyboard.press('Control+z');assert.equal(await n.evaluate(()=>velaEditorView.state.doc.toString()),text);
    await ctx.close();
  });
  await check('选区左右边界与段落一致，窄屏、深浅色、字号和部分文字选择保持准确',async()=>{
    const text='第一章 标题\n　　'+('正文，包含“引号”与标点。'.repeat(35))+'\n\n　　下一段落，选择到这里结束。\n第二章 标题';
    const seed={...data,documents:[doc('book','操作指南.txt',text)]};
    const {ctx,p}=await context(seed);
    for(const [width,dark,ratio] of [[900,false,1],[390,true,1.5],[600,false,1.667]]){
      await p.setViewportSize({width,height:1000});await p.emulateMedia({colorScheme:dark?'dark':'light'});
      await p.evaluate(ratio=>{window.wenzhouNativePinch(1,'start');window.wenzhouNativePinch(ratio,'move');window.wenzhouNativePinch(1,'end');const v=velaEditorView;v.dispatch({selection:{anchor:2,head:v.state.doc.length-3}});v.focus();},ratio);
      await p.waitForFunction(()=>{
        const line=document.querySelector('#editor .cm-line').getBoundingClientRect(),rects=[...document.querySelectorAll('.wenzhou-selection-layer>.cm-selectionBackground')].map(el=>el.getBoundingClientRect());
        return rects.length>0&&rects.every(r=>r.left>=line.left-.5&&r.right<=line.right+.5)&&rects.some(r=>Math.abs(r.width-line.width)<.5);
      });
      const selection=await p.evaluate(()=>velaEditorView.state.selection.main.toJSON());assert.deepEqual(selection,{anchor:2,head:text.length-3});
      assert.equal(await p.locator('.cm-activeLine').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
      await p.screenshot({path:`test-results/selection-${width}.png`});
    }
    await p.setViewportSize({width:900,height:1000});
    await p.evaluate(()=>{const v=velaEditorView;v.dispatch({selection:{anchor:1,head:3}});});
    await p.waitForFunction(()=>{
      const v=velaEditorView,a=v.coordsAtPos(1),b=v.coordsAtPos(3),rects=[...document.querySelectorAll('.wenzhou-selection-layer>.cm-selectionBackground')].map(el=>el.getBoundingClientRect());
      return rects.length===1&&Math.abs(rects[0].left-a.left)<.5&&Math.abs(rects[0].right-b.right)<.5;
    });
    await ctx.close();
  });
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/features-results.json',JSON.stringify({passed:checks.length,checks,pageErrors:errors},null,2));
  await fresh.ctx.close();await working.ctx.close();console.log(`${checks.length} 项新增功能检查通过`);
}finally{await browser.close();server.close();}
