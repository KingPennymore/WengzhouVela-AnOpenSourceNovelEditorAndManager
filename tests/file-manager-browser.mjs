import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain'}).end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[],errors=[];
await mkdir('test-results',{recursive:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
const saved=()=>p.evaluate(()=>{window.wenzhouSave();return JSON.parse(localStorage.getItem('wenzhou.workspace'));});
const submit=async()=>{await p.locator('#dialog-submit').click();await p.waitForFunction(()=>!document.querySelector('#dialog').open);};
const menu=async path=>{const w=await saved(),doc=w.documents.find(d=>d.path===path);await p.locator(doc?`[data-menu="${doc.id}"]`:`[data-path-menu="${path}"]`).click();};
try{
  await p.goto(url);await p.waitForSelector('.cm-editor');
  await check('侧栏快速滑入滑出，连续切换不残留；减少动态效果时直接切换',async()=>{
    await p.evaluate(()=>document.querySelector('#mobile-library').click());
    await p.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');
    await p.locator('#mobile-library').click();await p.locator('#library').waitFor({state:'hidden'});
    await p.evaluate(()=>{const button=document.querySelector('#mobile-library');button.click();button.click();button.click();});await p.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');assert.equal(await p.locator('#library').isVisible(),true);assert.equal(await p.locator('#mobile-library').getAttribute('aria-expanded'),'true');
    await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#mobile-library').click();assert.equal(await p.locator('#library').isVisible(),false);await p.locator('#mobile-library').click();assert.equal(await p.locator('#app').getAttribute('data-sidebars-animating'),'false');await p.locator('#mobile-library').click();await p.emulateMedia({reducedMotion:'no-preference'});
    assert.equal(await p.locator('#setup-storage,#open-folder,#internal-storage').count(),0);
  });
  await check('首次创建操作指南，嵌套空文件夹即时显示且侧栏仅通过文件夹按钮切换',async()=>{
    assert.equal((await saved()).documents[0].name,'操作指南.txt');assert.equal(await p.locator('#library').isVisible(),false);await p.locator('#mobile-library').click();
    await p.locator('#new-folder').click();await p.locator('[name=path]').fill('小说/资料');await submit();assert.equal(await p.locator('[data-folder="小说"]').count(),1);assert.equal(await p.locator('[data-folder="小说/资料"]').count(),1);
    await menu('小说/资料');await p.locator('#folder-new-file').click();await p.locator('[name=name]').fill('人物.csv');await p.locator('[name=template]').selectOption('empty');await submit();assert.equal((await saved()).documents.find(d=>d.name==='人物.csv').path,'小说/资料/人物.csv');assert.equal(await p.locator('#library').isVisible(),true);
  });
  await check('文件夹更名保留子文件和编辑内容，属性、复制粘贴、剪切移动与排序可用',async()=>{
    await p.locator('[data-display=source]').click();await p.evaluate(()=>{const v=editorManager.editor;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'姓名,身份\n甲,主角'}});});
    await menu('小说');await p.locator('#rename-doc').click();await p.locator('[name=name]').fill('长篇');await submit();assert.equal((await saved()).documents.find(d=>d.name==='人物.csv').path,'长篇/资料/人物.csv');
    await menu('长篇');await p.locator('#file-properties').click();assert.match(await p.locator('#dialog-body').innerText(),/长篇/);await p.locator('#dialog-cancel').click();
    await menu('长篇');await p.locator('#copy-file').click();await p.locator('#workspace-root').click();await p.locator('#paste-file').click();await p.waitForSelector('[data-folder="长篇 (2)"]');assert.equal((await saved()).documents.filter(d=>d.name==='人物.csv').length,2);
    await menu('长篇 (2)/资料/人物.csv');await p.locator('#cut-file').click();await p.locator('#workspace-root').click();await p.locator('#paste-file').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(d=>d.path==='人物.csv'));
    await p.locator('#file-sort').selectOption('size');assert.equal((await saved()).settings.filesSort,'size');assert.equal(await p.locator('#library').isVisible(),true);
  });
  await check('目录删除与回收站跨刷新保留，恢复文稿内容与空目录，永久删除需要确认',async()=>{
    await menu('长篇');await p.locator('#delete-doc').click();await submit();assert.equal((await saved()).documents.some(d=>d.path==='长篇/资料/人物.csv'),false);
    await p.reload();await p.waitForFunction(()=>window.editorManager);await p.locator('#open-trash').click();await p.locator('[data-restore]').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(d=>d.path==='长篇/资料/人物.csv'));await p.locator('#dialog-cancel').click();
    assert.equal((await saved()).documents.find(d=>d.path==='长篇/资料/人物.csv').text,'姓名,身份\n甲,主角');assert.ok((await saved()).folders.includes('长篇/资料'));
    await menu('长篇 (2)');await p.locator('#delete-doc').click();await submit();await p.locator('#open-trash').click();await p.locator('[data-permanent]').click();assert.equal((await saved()).trash.length,1);await p.locator('#dialog-submit').click();await p.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='回收站');assert.equal((await saved()).trash.length,0);await p.locator('#dialog-cancel').click();
  });
  await check('章节始终自动识别，可同时添加多种模板并在重启后保留',async()=>{
    await p.locator('#workspace-root').click();await p.locator('#new-doc').click();await p.locator('[name=name]').fill('正文.txt');await p.locator('[name=template]').selectOption('empty');await submit();await p.evaluate(()=>{const v=editorManager.editor;v.dispatch({changes:{from:0,insert:'第一章 开始\n正文\n【二】海岸\n正文\n幕 Three — 航路\n正文'}});});
    const novel=(await saved()).activeId;await p.locator('#settings').click();assert.equal(await p.locator('[name=format]').count(),0);assert.equal(await p.locator('#dialog [name=titleTemplates]').count(),0);await p.locator('#create-vela').click();await p.locator('#vela-form [name=titleTemplates]').fill('【{序号}】{标题}\n幕 {number} — {title}');await p.locator('#vela-form .primary').click();await p.locator(`[data-doc="${novel}"]`).click();await p.waitForFunction(()=>document.querySelector('#chapter-count').textContent.includes('3 章'));
    await p.reload();await p.waitForFunction(()=>document.querySelector('#chapter-count').textContent==='3 章');assert.equal(JSON.parse((await saved()).documents.find(doc=>doc.path==='.vela').text).chapters.templates.length,2);assert.equal(await p.locator('#chapter-count').textContent(),'3 章');
  });
  await check('访问令牌按钮优先高亮，齿轮图标居中且在窄屏保持等比',async()=>{
    await p.locator('#quick-git').click();assert.equal(await p.locator('#token-login').evaluate(el=>el.classList.contains('primary')),true);assert.equal(await p.locator('#device-login').evaluate(el=>el.classList.contains('primary')),false);await p.locator('[data-return-write]').click();
    for(const width of [1440,390]){await p.setViewportSize({width,height:900});const shape=await p.locator('#settings svg').evaluate(svg=>{const box=svg.getBBox(),r=svg.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height,ratio:r.width/r.height,circles:svg.querySelectorAll('circle').length};});assert.ok(Math.abs(shape.width-shape.height)<.02);assert.ok(Math.abs(shape.x+shape.width/2-12)<.02);assert.equal(shape.ratio,1);assert.equal(shape.circles,1);await p.screenshot({path:`test-results/file-manager-040-${width}.png`});}
  });
  await check('旧指南自动更名保留正文，用户自己的未命名小说不更名',async()=>{
    const migration=await browser.newContext({viewport:{width:1000,height:800}});await migration.addInitScript(()=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'guide',name:'未命名小说.txt',text:'文舟操作指南\n用户补充内容',updatedAt:1,remote:null},{id:'novel',name:'未命名小说.txt',path:'正文/未命名小说.txt',text:'第一章\n用户原创正文',updatedAt:1,remote:null}],activeId:'guide',openIds:['guide'],settings:{writer:{format:'template',template:'【{标题}】'}}})));
    const page=await migration.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('.cm-editor');const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));assert.equal(data.documents.find(d=>d.id==='guide').name,'操作指南.txt');assert.equal(data.documents.find(d=>d.id==='guide').text,'文舟操作指南\n用户补充内容');assert.equal(data.documents.find(d=>d.id==='novel').name,'未命名小说.txt');assert.equal(data.settings.writer.format,'auto');assert.deepEqual(data.settings.writer.titleTemplates,[]);assert.equal(data.documents.some(doc=>doc.path==='.vela'),false);await migration.close();
  });
  assert.deepEqual(errors,[]);await writeFile('test-results/file-manager-040-results.json',JSON.stringify({passed:checks.length,checks,pageErrors:errors},null,2));
}catch(error){await p.screenshot({path:'test-results/file-manager-040-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();server.close();}
