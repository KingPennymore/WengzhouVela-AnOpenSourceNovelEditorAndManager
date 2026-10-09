import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {palettes} from '../web/palettes.mjs';
import {parseCsv} from '../web/csv.mjs';
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const contents=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain'}).end(contents);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[],errors=[];
const doc=(id,name,text)=>({id,name,path:name,text,updatedAt:1,remote:null});
const seed={version:1,documents:[doc('book','未命名小说.txt','第一章 开始\n正文\n\n第二章 继续\n结尾')],openIds:['book'],activeId:'book',settings:{theme:'system'}};
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
const save=p=>p.evaluate(()=>{window.wenzhouSave();return JSON.parse(localStorage.getItem('wenzhou.workspace'));});
const nativeSave=p=>p.evaluate(()=>{window.wenzhouSave();return JSON.parse(window.WenzhouNative.readWorkspace());});
async function ready(p){await p.goto(url);await p.waitForFunction(()=>window.editorManager&&document.querySelector('#current-name').textContent);if(await p.locator('#start-page').isVisible()&&await p.locator('[data-recent=book]').count())await p.locator('[data-recent=book]').click();}
async function importFile(p,name,buffer){await p.locator('#file-input').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer)});await p.waitForFunction(name=>document.querySelector('#current-name').textContent===name,name);}
const ctx=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'light'});
await ctx.addInitScript(data=>{if(window===window.top&&!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(data));},seed);
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
try{
  await ready(p);
  await check('文件侧栏在切换、关闭、导入、专注、目录和 Git 页面时保持状态，刷新后恢复',async()=>{
    await p.locator('#mobile-library').click();
    await p.locator('#new-doc').click();await p.locator('[name=name]').fill('测试.txt');await p.locator('#dialog-submit').click();
    await p.locator('[data-tab=book]').click();await p.locator('#more-tools').click();await p.locator('#focus-toggle').click();assert.equal(await p.locator('#library').isVisible(),true);await p.locator('#more-tools').click();await p.locator('#focus-toggle').click();
    await p.locator('#outline-toggle').click();assert.equal(await p.locator('#library').isVisible(),true);await p.locator('#outline-toggle').click();
    await p.locator('#quick-git').click();assert.equal(await p.locator('#library').isVisible(),true);assert.equal(await p.locator('#mobile-library').isVisible(),true);
    await p.locator('#mobile-library').click();await p.locator('#library').waitFor({state:'hidden'});assert.equal(await p.locator('#library').isVisible(),false);await p.locator('#mobile-library').click();await p.locator('[data-return-write]').click();
    await p.locator('[data-close=book]').click();assert.equal(await p.locator('#library').isVisible(),true);await p.locator('[data-doc=book]').click();
    await importFile(p,'导入.txt','正文');assert.equal(await p.locator('#library').isVisible(),true);await p.reload();await p.waitForSelector('#mobile-library');assert.equal(await p.locator('#library').isVisible(),true);
    await p.locator('#mobile-library').click();await p.locator('#library').waitFor({state:'hidden'});await p.locator('#more-tools').click();await p.locator('#home-button').click();assert.equal(await p.locator('#library').isVisible(),false);
  });
  await check('五套配色可切换、持久化，并分别跟随系统深浅模式',async()=>{
    for(const palette of palettes){await p.locator('#more-tools').click();await p.locator('#settings').click();await p.locator(`[name=palette][value=${palette.id}]`).check();await p.locator('[name=theme]').selectOption('system');await p.locator('#dialog-submit').click();assert.equal(await p.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),palette.light.accent);await p.emulateMedia({colorScheme:'dark'});await p.waitForFunction(color=>getComputedStyle(document.body).getPropertyValue('--accent').trim()===color,palette.dark.accent);await p.emulateMedia({colorScheme:'light'});}
    await p.reload();await p.waitForFunction(()=>window.editorManager);assert.equal((await save(p)).settings.palette,'graphite');
  });
  await check('CSV 扩展名大小写与 UTF-16 文件可识别，分号和制表符表格可编辑',async()=>{
    await importFile(p,'人物.CSV',Buffer.concat([Buffer.from([255,254]),Buffer.from('姓名;身份\r\n文舟;作者','utf16le')]));await p.waitForSelector('[data-cell-row="1"]');assert.equal(await p.locator('[data-cell-row="1"][data-cell-column="0"]').inputValue(),'文舟');await p.locator('[data-cell-row="1"][data-cell-column="1"]').fill('写作者');assert.ok((await save(p)).documents.find(d=>d.name==='人物.CSV').text.includes('文舟;写作者'));
    await importFile(p,'人物-tab.csv','名字\t身份\n甲\t主角');assert.equal(await p.locator('[data-cell-row="1"][data-cell-column="1"]').inputValue(),'主角');
  });
  await check('宽表按列分页，编辑后保留所有列和未显示的行',async()=>{
    const rows=Array.from({length:120},(_,r)=>Array.from({length:120},(_,c)=>`${r}:${c}`).join(','));await importFile(p,'宽表.csv',rows.join('\n'));assert.ok(await p.locator('#preview textarea').count()<=2000);
    await p.locator('#csv-column-next').click();assert.equal(await p.locator('[data-cell-row="0"][data-cell-column="50"]').inputValue(),'0:50');await p.locator('[data-cell-row="0"][data-cell-column="50"]').fill('修改');const parsed=parseCsv((await save(p)).documents.find(d=>d.name==='宽表.csv').text);assert.equal(parsed.length,120);assert.equal(parsed[119].length,120);assert.equal(parsed[119][119],'119:119');assert.equal(parsed[0][50],'修改');
  });
  await check('HTML / HTM 可打开预览并保留文档样式，脚本不能运行',async()=>{
    await importFile(p,'页面.HTM','<!doctype html><html><head><style>h1{color:rgb(1,2,3)}</style></head><body><h1>页面标题</h1><script>window.parent.__unsafe=true</script></body></html>');await p.locator('[data-display=preview]').click();const frame=p.frameLocator('#preview iframe');assert.equal(await frame.locator('h1').innerText(),'页面标题');assert.equal(await frame.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(1, 2, 3)');assert.equal(await p.evaluate(()=>window.__unsafe),undefined);assert.equal(await p.locator('#preview iframe').getAttribute('sandbox'),'');
  });
  await check('扩展名错误的文件可手动设置类型，重命名后立即更新编辑格式',async()=>{
    await importFile(p,'页面.txt','<h1>手动识别</h1>');await p.locator('[data-format]').click();await p.locator('[name=kind]').selectOption('HTML');await p.locator('#dialog-submit').click();await p.locator('[data-display=preview]').click();assert.equal(await p.frameLocator('#preview iframe').locator('h1').innerText(),'手动识别');
    await p.locator('[data-format]').click();await p.locator('[name=kind]').selectOption('');await p.locator('#dialog-submit').click();await p.locator('#dialog[open]').waitFor({state:'hidden'});await p.locator('#current-name').dblclick();await p.locator('[name=name]').fill('页面.html');await p.locator('#dialog-submit').click();await p.waitForSelector('#dialog[open]',{state:'hidden'});assert.equal(await p.locator('[data-format]').innerText(),'HTML');
  });
  await check('Markdown 扩展名、标题、表格、代码和任务列表可预览，TXT 保留原文',async()=>{
    await importFile(p,'资料.MARKDOWN','# 第一章\n\n- [x] 已完成\n- [ ] 待办\n\n|人物|身份|\n|---|---|\n|文舟|作者|\n\n```js\nconst x = 1;\n```');assert.equal(await p.locator('#markdown-tools').isVisible(),true);await p.locator('[data-display=preview]').click();assert.equal(await p.locator('#preview h1').innerText(),'第一章');assert.equal(await p.locator('#preview table').count(),1);assert.equal(await p.locator('#preview .task-state').count(),2);assert.equal(await p.locator('#preview pre code').count(),1);
    await importFile(p,'纯文本.txt','# 原文\n**内容**');await p.locator('[data-display=preview]').click();assert.equal(await p.locator('#preview h1').count(),0);assert.equal(await p.locator('#preview').innerText(),'# 原文\n**内容**');
  });
  await check('Markdown 快捷键与格式按钮作用于选区，并可撤回',async()=>{
    await importFile(p,'格式.md','正文');await p.evaluate(()=>{const v=window.editorManager.editor;v.dispatch({selection:{anchor:0,head:2}});v.focus();});await p.keyboard.press('Control+b');assert.equal((await save(p)).documents.find(d=>d.name==='格式.md').text,'**正文**');await p.keyboard.press('Control+z');assert.equal((await save(p)).documents.find(d=>d.name==='格式.md').text,'正文');await p.locator('#md-heading').click();assert.equal((await save(p)).documents.find(d=>d.name==='格式.md').text,'# 正文');
  });
  await check('桌面与窄屏右上角按钮和图标尺寸一致，窄屏展开后仍能点击文件夹按钮',async()=>{
    for(const width of [1440,390,800]){await p.setViewportSize({width,height:900});const sizes=await p.locator('.toolbar>button').evaluateAll(list=>list.filter(el=>el.getBoundingClientRect().width).map(el=>{const r=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return [r.width,r.height,s.width,s.height];}));assert.ok(sizes.every(item=>JSON.stringify(item)===JSON.stringify(sizes[0])),JSON.stringify(sizes));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.locator('#mobile-library').click();assert.equal(await p.locator('#library').isVisible(),true);await p.locator('#quick-save').click();await p.locator('#mobile-library').click();await p.locator('#library').waitFor({state:'hidden'});assert.equal(await p.locator('#library').isVisible(),false);}
    await p.setViewportSize({width:1440,height:900});await p.screenshot({path:'test-results/workspace-030-desktop.png'});
  });
  const nc=await browser.newContext({viewport:{width:1440,height:900}});
  await nc.addInitScript(data=>{
    if(window!==window.top)return;let stored=JSON.stringify(data),active='internal',counter=0;const roots={internal:{}},folders={internal:[]};window.__nativeCalls=[];window.__roots=roots;window.__remote='第一章 远端\n第一版';
    const folderState=()=>{const old=JSON.parse(stored),files=roots[active];return {storage:{id:active,label:'内部工作区',internal:true,root:'/sandbox/workspaces/文舟',needsSetup:false},documents:Object.entries(files).flatMap(([path,text])=>typeof text==='string'?[{...(old.documents.find(d=>d.path===path)||{}),id:old.documents.find(d=>d.path===path)?.id||'disk-'+(++counter),name:path.split('/').at(-1),path,text,remote:old.documents.find(d=>d.path===path)?.remote||null,updatedAt:1}]:[]),folders:folders[active],entries:Object.entries(files).map(([path,text])=>({path,name:path.split('/').at(-1),directory:false,editable:typeof text==='string'})),repositories:old.storage?.id===active?old.repositories||[]:[]};};
    const repo={name:'novel',full_name:'writer/novel',private:true,default_branch:'main'};
    window.WenzhouNative={readWorkspace:()=>stored,writeWorkspace:value=>{const w=JSON.parse(value);if(w.storage?.id){active=w.storage.id;for(const d of w.documents)roots[active][d.path]=d.text;folders[active]=w.folders||[];}stored=value;window.__nativeCalls.push({operation:'save',value:w});return 'ok';},readPlugins:()=>'',writePlugins:()=> 'ok',readEnvironment:()=>JSON.stringify({dark:false,top:24,bottom:20}),call:async(operation,json)=>{
      const payload=JSON.parse(json);window.__nativeCalls.push({operation,payload});let value=true;
      if(operation==='initializeStorage')value=active?folderState():{storage:{id:'',needsSetup:true},documents:[],folders:[],entries:[]};
      if(operation==='refreshFolder')value=folderState();
      if(operation==='readWorkspaceAsset')value='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
      if(operation==='writeWorkspaceFiles'){for(const f of payload.files){const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));roots[active][f.path]=bytes.includes(0)?bytes:new TextDecoder().decode(bytes);}folders[active]=[...new Set([...folders[active],...payload.folders])];value=folderState();}
      if(operation==='api'){const u=new URL(payload.path,'https://api.github.com'),s=u.pathname;let body,status=200;
        if(s==='/user')body={login:'writer'};else if(s==='/user/repos')body=[repo];else if(s.endsWith('/branches'))body=[{name:'main'}];else if(s.endsWith('/contents/'))body=[{name:'全书.txt',path:'全书.txt',type:'file',sha:'blob-book',size:new TextEncoder().encode(window.__remote).length}];else if(s.endsWith('/contents/全书.txt')||decodeURIComponent(s).endsWith('/contents/全书.txt'))body={type:'file',encoding:'base64',content:btoa(unescape(encodeURIComponent(window.__remote))),sha:'blob-book',size:new TextEncoder().encode(window.__remote).length};else if(s.includes('/git/ref/'))body={object:{sha:'commit'}};else if(s.endsWith('/git/commits/commit'))body={tree:{sha:'tree'}};else if(s.includes('/git/trees/'))body={truncated:false,tree:[{path:'资料',type:'tree',sha:'dir'},{path:'全书.txt',type:'blob',sha:'blob-book',size:new TextEncoder().encode(window.__remote).length,mode:'100644'},{path:'资料/设定.md',type:'blob',sha:'blob-md',size:new TextEncoder().encode('# 世界设定').length,mode:'100644'},{path:'封面.png',type:'blob',sha:'blob-image',size:3,mode:'100644'}]};else if(s.endsWith('/git/blobs/blob-book'))body={encoding:'base64',content:btoa(unescape(encodeURIComponent(window.__remote)))};else if(s.endsWith('/git/blobs/blob-md'))body={encoding:'base64',content:btoa(unescape(encodeURIComponent('# 世界设定')))};else if(s.endsWith('/git/blobs/blob-image'))body={encoding:'base64',content:'AAEC'};else{status=404;body={message:'Missing mock '+s};}value={status,body};}
      return JSON.stringify({ok:true,value});
    }};
  },seed);
  const n=await nc.newPage();n.on('pageerror',e=>errors.push(e.message));await ready(n);
  await check('直接初始化内部工作区，新建子目录和文稿写入内部文件夹',async()=>{
    assert.equal(await n.evaluate(()=>window.__roots.internal['未命名小说.txt']),seed.documents[0].text);assert.equal(await n.locator('#dialog').evaluate(el=>el.open),false);assert.equal(await n.evaluate(()=>window.__nativeCalls.some(c=>c.operation==='setupStorage')),false);
    await n.locator('#mobile-library').click();assert.equal(await n.locator('#setup-storage,#open-folder,#internal-storage').count(),0);
    await n.locator('#new-folder').click();await n.locator('[name=path]').fill('小说/资料');await n.locator('#dialog-submit').click();await n.locator('#new-doc').click();await n.locator('[name=name]').fill('人物.md');await n.locator('[name=template]').selectOption('empty');await n.locator('#dialog-submit').click();assert.equal((await nativeSave(n)).documents.find(d=>d.name==='人物.md').path,'小说/资料/人物.md');assert.equal(await n.evaluate(()=>window.__roots.internal['小说/资料/人物.md']),'');
  });
  await check('内部目录刷新后保留文稿，启动页与命令不再出现外部目录入口',async()=>{
    await n.locator('#refresh-folder').click();await n.waitForFunction(()=>document.querySelector('#current-name').textContent==='启动页');assert.ok((await nativeSave(n)).documents.some(d=>d.path==='小说/资料/人物.md'));assert.equal(await n.locator('[data-start="open-folder"],[data-start="setup-storage"]').count(),0);await n.locator('#more-tools').click();await n.locator('#commands').click();assert.equal((await n.locator('#command-list').innerText()).includes('打开文件夹工作区'),false);await n.locator('#dialog-cancel').click();assert.equal(await n.locator('#library').isVisible(),true);
  });
  let pulledId;
  await check('同仓库同路径重复拉取覆盖本地文件且保留标签 ID',async()=>{
    await n.locator('#github-shortcut').click();await n.waitForSelector('.repo-card');await n.locator('.repo-card').click();await n.waitForSelector('[data-file]');await n.locator('[data-file]').click();await n.waitForFunction(()=>JSON.parse(window.WenzhouNative.readWorkspace()).documents.some(doc=>doc.remote?.path==='全书.txt'));let pulled=await nativeSave(n);pulledId=pulled.documents.find(doc=>doc.remote?.path==='全书.txt').id;assert.equal(pulled.activeId,null);assert.equal(await n.locator('#github-view').isVisible(),true);assert.ok(!pulled.openIds.includes(pulledId));await n.locator(`[data-doc="${pulledId}"]`).click();await n.evaluate(()=>window.__remote='第一章 远端\n第二版');await n.locator('#quick-git').click();await n.locator('#read-remote').click();await n.waitForFunction(()=>!document.querySelector('#dialog').open);const w=await nativeSave(n);assert.equal(w.activeId,pulledId);assert.equal(w.documents.filter(d=>d.remote?.path==='全书.txt').length,1);assert.ok(w.documents.find(d=>d.id===pulledId).text.includes('第二版'));
  });
  await check('远端长按进入多选，取消恢复，选中拉取保持当前文稿和页面',async()=>{
    await n.locator('#github-shortcut').click();await n.waitForSelector('[data-file]');const box=await n.locator('[data-file]').boundingBox();await n.mouse.move(box.x+20,box.y+20);await n.mouse.down();await n.waitForTimeout(450);await n.mouse.up();assert.equal(await n.locator('[data-remote-select]').isVisible(),true);assert.equal(await n.locator('[data-remote-select]').isChecked(),true);assert.equal(await n.locator('#remote-pull-selected').isEnabled(),true);const active=(await nativeSave(n)).activeId;await n.locator('#remote-pull-selected').click();await n.locator('#dialog-submit').click();await n.waitForSelector('[name=downloadFiles]');for(const input of await n.locator('[name=downloadFiles]').all())await input.check();await n.locator('#dialog-submit').click();await n.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal((await nativeSave(n)).activeId,active);assert.equal(await n.locator('#github-view').isVisible(),true);assert.equal(await n.locator('[data-remote-select]').isVisible(),false);
  });
  await check('整仓拉取写入目录树和二进制资源，合并已关联文稿，保留本地独有文件',async()=>{
    await n.locator('#github-shortcut').click();await n.waitForSelector('#repo-pull');await n.locator('#repo-pull').click();await n.locator('#dialog-submit').click();await n.waitForSelector('[name=downloadFiles]');for(const input of await n.locator('[name=downloadFiles]').all())await input.check();await n.locator('#dialog-submit').click();await n.waitForFunction(()=>!document.querySelector('#dialog').open);const w=await nativeSave(n);assert.equal(w.documents.find(d=>d.id===pulledId).path,'novel/全书.txt');assert.ok(w.documents.some(d=>d.path==='novel/资料/设定.md'));assert.ok(w.documents.some(d=>d.name==='人物.md'));assert.deepEqual(await n.evaluate(()=>[...window.__roots.internal['novel/封面.png']]),[0,1,2]);assert.equal(await n.locator('#library').isVisible(),true);
  });
  await check('Markdown 相对图片从原生工作区读取并显示',async()=>{
    const w=await nativeSave(n),d=w.documents.find(d=>d.path==='novel/资料/设定.md');await n.locator('[data-view=write]').click();await n.locator(`[data-doc="${d.id}"]`).click();await n.evaluate(()=>{const v=window.editorManager.editor;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'# 设定\n\n![封面](../封面.png)'}});});await n.locator('[data-display=preview]').click();await n.waitForSelector('#preview img');assert.ok((await n.locator('#preview img').getAttribute('src')).startsWith('data:image/png;base64,'));const calls=await n.evaluate(()=>window.__nativeCalls);assert.ok(calls.some(c=>c.operation==='readWorkspaceAsset'&&c.payload.path==='novel/封面.png'));
  });
  await check('拉取预览默认保留本地冲突，取消不写文件，明确覆盖留下历史',async()=>{
    await n.locator(`[data-doc="${pulledId}"]`).click();await n.evaluate(()=>{const v=editorManager.editor;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'第一章 本地修改\n不能静默丢失'}});window.wenzhouSave();window.__remote='第一章 远端\n第三版';});
    await n.locator('#github-shortcut').click();await n.waitForSelector('#repo-pull');await n.locator('#repo-pull').click();await n.locator('#dialog-submit').click();await n.waitForSelector('[name=downloadFiles]');const item=n.locator('.sync-files label').filter({hasText:'全书.txt'}).locator('input');assert.equal(await item.isChecked(),false);await n.locator('#dialog-cancel').click();assert.ok((await nativeSave(n)).documents.find(d=>d.id===pulledId).text.includes('本地修改'));
    await n.locator('#repo-pull').click();await n.locator('#dialog-submit').click();await n.waitForSelector('[name=downloadFiles]');await n.locator('.sync-files label').filter({hasText:'全书.txt'}).locator('input').check();await n.locator('[data-resolution]').selectOption('merge');await n.waitForSelector('.sync-conflict-part');for(const button of await n.locator('.sync-conflict-part [data-choose=remote]').all())await button.click();assert.match(await n.locator('.sync-merged').inputValue(),/第三版/);await n.locator('#dialog-submit').click();await n.waitForFunction(()=>!document.querySelector('#dialog').open);const saved=await nativeSave(n);assert.ok(saved.documents.find(d=>d.id===pulledId).text.includes('第三版'));assert.ok(saved.localHistory[pulledId].some(item=>item.text.includes('不能静默丢失')));
  });
  await nc.close();
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/workspace-030-results.json',JSON.stringify({passed:checks.length,checks,pageErrors:errors},null,2));console.log(`${checks.length} 项新功能界面检查通过`);
}catch(e){await p.screenshot({path:'test-results/workspace-030-failure.png'}).catch(()=>{});throw e;}
finally{await browser.close();server.close();}
