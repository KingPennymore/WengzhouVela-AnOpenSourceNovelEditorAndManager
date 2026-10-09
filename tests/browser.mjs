import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain'}).end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const browser=await chromium.launch({headless:true,executablePath});
const results=[],errors=[];
await mkdir('test-results',{recursive:true});
const seedText='序言\n\n第一章 开端\n甲乙丙\n\n第二章 转折\n丁戊己庚\n\n第三章 终局\n辛壬癸\n';
const seed={version:1,activeId:'book',settings:{dark:true,theme:'dark'},documents:[{id:'book',name:'全书.txt',text:seedText,updatedAt:1,remote:null},{id:'other',name:'操作指南.txt',text:'第一章\n另一部小说',updatedAt:1,remote:null}]};
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(data=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(data));},seed);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const click=async id=>{if(await page.locator('#toolbar-overflow #'+id).count())await page.locator('#more-tools').click();await page.locator('#'+id).click();};
const cursor=()=>page.locator('#cursor-position').textContent();
const content=()=>page.locator('.cm-content').innerText();
const waitText=async(selector,text)=>{await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});};
try{
  await page.goto(url);await page.waitForSelector('.cm-editor');
  await check('默认收起文件与章节侧栏，行号可见，正文占满工作区',async()=>{
    assert.equal(await page.locator('#library').isVisible(),false);assert.equal(await page.locator('#outline').isVisible(),false);assert.equal(await page.locator('.cm-lineNumbers').isVisible(),true);
    assert.equal(await page.locator('.quickbar button').count(),8);assert.ok((await page.locator('#editor').boundingBox()).height>650);
  });
  await check('文件与章节顶部/底部快捷跳转使用正确边界',async()=>{
    await click('quick-bottom');assert.equal(await cursor(),'行 11，列 1');
    await click('quick-chapter-top');assert.equal(await cursor(),'行 9，列 1');
    await click('quick-chapter-bottom');assert.equal(await cursor(),'行 11，列 1');
    await click('quick-top');assert.equal(await cursor(),'行 1，列 1');
    await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
    await click('quick-chapter-bottom');assert.equal(await cursor(),'行 5，列 1');
    await click('quick-chapter-top');assert.equal(await cursor(),'行 3，列 1');
  });
  await check('保存、撤回、重做及文件切换保留各自编辑历史',async()=>{
    await click('quick-top');await page.keyboard.insertText('修改');assert.ok((await content()).startsWith('修改序言'));
    await click('quick-undo');assert.ok((await content()).startsWith('序言'));
    await click('quick-redo');assert.ok((await content()).startsWith('修改序言'));
    await click('quick-save');const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));assert.ok(stored.documents[0].text.startsWith('修改序言'));
    await page.locator('[data-tab="other"]').click();assert.ok((await content()).includes('另一部小说'));
    await page.locator('[data-tab="book"]').click();await click('quick-undo');assert.ok((await content()).startsWith('序言'));
    await click('quick-save');
  });
  await check('章节目录支持筛选、定位和在同一文件追加章节',async()=>{
    await click('outline-toggle');assert.equal(await page.locator('#outline').isVisible(),true);
    await page.locator('#chapter-search').fill('转折');assert.equal(await page.locator('.chapter').count(),1);
    await page.locator('.chapter').click();assert.equal(await cursor(),'行 6，列 1');
    await click('locate-chapter');assert.equal(await page.locator('.chapter').count(),4);
    await click('append-chapter');await page.locator('[name="title"]').fill('第四章 续篇');await click('dialog-submit');
    await waitText('#chapter-count','4 章');assert.ok((await content()).includes('第四章 续篇'));
    await click('quick-undo');await waitText('#chapter-count','3 章');await page.locator('#outline').waitFor({state:'hidden'});
  });
  await check('查找替换面板、标题规则错误反馈和设置持久化',async()=>{
    await click('search-editor');assert.equal(await page.locator('.cm-search').isVisible(),true);await page.keyboard.press('Escape');
    await click('settings');assert.equal(await page.locator('[name="format"]').count(),0);assert.equal(await page.locator('[name="titleTemplates"]').count(),0);
    await page.locator('[name="theme"]').selectOption('light');await click('dialog-submit');
    await page.reload();await page.waitForSelector('.cm-editor');assert.equal(await page.locator('#library').isVisible(),false);assert.equal(await page.locator('#outline').isVisible(),false);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),false);assert.equal(await page.locator('#theme').getAttribute('aria-label'),'切换到深色模式');
    await click('theme');assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),true);await click('theme');assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),false);
  });
  await check('新建、重命名、删除文件以及开源许可查看可用',async()=>{
    await click('mobile-library');await click('new-doc');await page.locator('[name="name"]').fill('新小说.txt');await click('dialog-submit');await waitText('#current-name','新小说.txt');assert.ok((await content()).includes('第一章'));
    const activeId=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).activeId);await page.locator(`[data-menu="${activeId}"]`).click();await click('rename-doc');await page.locator('[name="name"]').fill('重命名小说.txt');await click('dialog-submit');await waitText('#current-name','重命名小说.txt');
    await page.locator(`[data-menu="${activeId}"]`).click();await click('delete-doc');await click('dialog-submit');await page.locator('#dialog[open]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-tab]').count(),2);await page.locator('[data-tab="book"]').click();
    await click('settings');await click('show-licenses');assert.ok((await page.locator('#license-text').inputValue()).includes('Copyright'));assert.ok(await page.locator('#license-component option').count()>8);await click('dialog-cancel');
  });
  // All remote mutations below are intercepted. No real account or repository is modified.
  const remoteCalls=[];let conflict=false;
  const repo={name:'novel',full_name:'writer/novel',description:'',private:true,default_branch:'main'};
  await page.route('https://api.github.com/**',async route=>{
    const r=route.request(),u=new URL(r.url());remoteCalls.push({method:r.method(),path:u.pathname,body:r.postDataJSON()});
    let status=200,body;
    if(u.pathname==='/user')body={login:'writer'};
    else if(u.pathname==='/user/repos'&&r.method()==='GET')body=[repo];
    else if(u.pathname==='/user/repos'&&r.method()==='POST'){status=201;body={...repo,name:r.postDataJSON().name};}
    else if(u.pathname.endsWith('/branches'))body=[{name:'main'},{name:'draft'}];
    else if(u.pathname.includes('/git/ref/'))body={object:{sha:'base-sha'}};
    else if(u.pathname.endsWith('/git/refs')){status=201;body={ref:'refs/heads/draft'};}
    else if(u.pathname.endsWith('/contents/'))body=[{name:'全书.txt',path:'全书.txt',type:'file',sha:'original-sha',size:30}];
    else if(u.pathname.includes('/contents/')&&r.method()==='GET')body={name:'全书.txt',type:'file',encoding:'base64',size:30,sha:'original-sha',content:Buffer.from('第一章 远端\n正文').toString('base64')};
    else if(r.method()==='PUT'){status=conflict?409:200;body=conflict?{message:'Conflict'}:{content:{sha:'new-sha'}};}
    else if(r.method()==='DELETE'){status=200;body={};}
    else if(r.method()==='PATCH')body={...repo,name:r.postDataJSON().name,description:r.postDataJSON().description};
    else {status=404;body={message:'Not found'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await check('Git 按钮、令牌登录、仓库与分支浏览、远端文件读取',async()=>{
    await click('quick-git');await click('token-login');await page.locator('[name="token"]').fill('test-token');await click('dialog-submit');await page.waitForSelector('.repo-card');
    assert.equal(await page.locator('#dialog').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('wenzhou.workspace').includes('test-token')),false);
    await page.locator('.repo-card').click();await page.waitForSelector('[data-file]');await page.locator('#branch-select').selectOption('draft');await page.waitForSelector('[data-file]');
    await click('create-branch');await page.locator('[name="name"]').fill('draft/revision');await click('dialog-submit');await page.waitForSelector('[data-file]');
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).activeId);await page.locator('[data-file]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(doc=>doc.remote?.path==='全书.txt'));assert.equal(await page.locator('#github-view').isVisible(),true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).activeId),before);const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(doc=>doc.remote?.path==='全书.txt').id);await page.locator(`[data-doc="${id}"]`).click();await page.waitForSelector('#write-view:not([hidden])');assert.ok((await content()).includes('远端'));
  });
  await check('文稿提交绑定原 SHA，版本冲突显示提示并保留本地正文',async()=>{
    await click('quick-git');await click('dialog-submit');await click('dialog-submit');await page.waitForFunction(()=>!document.querySelector('#dialog').open);
    const put=remoteCalls.find(r=>r.method==='PUT');assert.equal(put.body.sha,'original-sha');
    await click('quick-bottom');await page.keyboard.insertText('本地修订');await click('quick-save');conflict=true;
    await click('quick-git');await click('dialog-submit');await click('dialog-submit');await waitText('#dialog-error','远端版本已变化');assert.ok((await content()).includes('本地修订'));await click('dialog-cancel');
  });
  await check('仓库创建、设置更新和远端文件删除走对应确认表单',async()=>{
    await click('github-shortcut');await click('back-repos');await click('create-repo');await page.locator('[name="name"]').fill('new-novel');await click('dialog-submit');await page.waitForSelector('.repo-card');
    const create=remoteCalls.find(r=>r.method==='POST'&&r.path==='/user/repos');assert.equal(create.body.name,'new-novel');assert.equal(create.body.private,true);
    await page.locator('.repo-card').click();await page.waitForSelector('[data-file]');await click('repo-settings');await page.locator('[name="description"]').fill('长篇小说');await click('dialog-submit');await page.waitForSelector('[data-file]');assert.ok(remoteCalls.some(r=>r.method==='PATCH'&&r.body.description==='长篇小说'));
    await page.locator('[data-delete]').click();await click('dialog-submit');await page.waitForSelector('[data-file]');const del=remoteCalls.find(r=>r.method==='DELETE');assert.equal(del.body.sha,'original-sha');await page.locator('[data-return-write]').click();
  });
  await check('浏览器刷新保留全文且不保留登录令牌',async()=>{
    await page.reload();await page.waitForSelector('.cm-editor');assert.ok((await content()).includes('本地修订'));await click('quick-git');assert.equal(await page.locator('#token-login').isVisible(),true);
    await page.locator('[data-return-write]').click();
  });
  await page.screenshot({path:'test-results/desktop.png'});
  await click('outline-toggle');await page.screenshot({path:'test-results/desktop-outline.png'});await click('close-outline');
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.addInitScript(data=>localStorage.setItem('wenzhou.workspace',JSON.stringify(data)),seed);
  const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(url);await m.waitForSelector('.cm-editor');
  await check('手机宽度下八项工具可用，侧栏仍默认收起且无水平溢出',async()=>{
    assert.equal(await m.locator('#library').isVisible(),false);assert.equal(await m.locator('#outline').isVisible(),false);
    assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const id of ['quick-save','quick-undo','quick-redo','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','quick-git']){
      await m.locator('#'+id).scrollIntoViewIfNeeded();const rect=await m.locator('#'+id).boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390.5,id);
    }
    await m.locator('#mobile-library').click();assert.equal(await m.locator('#library').isVisible(),true);await m.locator('#mobile-library').click();
    await m.locator('#outline-toggle').click();await m.locator('[data-row="5"]').click();assert.equal(await m.locator('#cursor-position').textContent(),'行 6，列 1');assert.equal(await m.locator('#outline').isVisible(),true);await m.locator('#outline-toggle').click();await m.locator('#outline').waitFor({state:'hidden'});
    await m.locator('#more-tools').click();await m.locator('#theme').click();assert.equal(await m.locator('body').evaluate(el=>el.classList.contains('dark')),false);assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
  await m.screenshot({path:'test-results/mobile.png'});await mobile.close();
  // A 600,000-character novel checks virtualization and jumping across hundreds of chapters.
  const largeContext=await browser.newContext({viewport:{width:1440,height:900}});
  const largeText=Array.from({length:300},(_,i)=>`第${i+1}章 标题\n${'正文内容。'.repeat(400)}\n\n`).join('');
  await largeContext.addInitScript(text=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,activeId:'large',settings:{dark:true,theme:'dark'},documents:[{id:'large',name:'操作指南.txt',text,updatedAt:1,remote:null}]})),largeText);
  const large=await largeContext.newPage();large.on('pageerror',e=>errors.push(e.message));
  await check('60 万字符小说可统计 300 章并跳转末章，编辑器保持虚拟化',async()=>{
    await large.goto(url);await large.waitForSelector('.cm-editor');assert.equal(await large.locator('#chapter-count').textContent(),'300 章');
    assert.ok(await large.locator('.cm-line').count()<1200);await large.locator('#quick-bottom').click();await large.locator('#quick-chapter-top').click();assert.equal(await large.locator('#cursor-position').textContent(),'行 898，列 1');
  });
  await largeContext.close();assert.deepEqual(errors,[]);await writeFile('test-results/results.json',JSON.stringify({passed:results.length,checks:results,pageErrors:errors},null,2));
  const nativeContext=await browser.newContext({viewport:{width:390,height:844}});
  await nativeContext.addInitScript(data=>{
    let stored=JSON.stringify(data);window.__nativeCalls=[];window.__nativeMode='normal';
    window.WenzhouNative={
      readWorkspace:()=>stored,readPlugins:()=>'',writePlugins:()=> 'ok',readEnvironment:()=>JSON.stringify({dark:false,top:24,bottom:16}),
      writeWorkspace:value=>{stored=value;window.__nativeCalls.push({operation:'save',value});return 'ok';},
      call:async(operation,json)=>{const payload=JSON.parse(json);window.__nativeCalls.push({operation,payload});if(window.__nativeMode==='no-result')return undefined;if(window.__nativeMode==='network-failure')return JSON.stringify({ok:false,error:'连接 GitHub 超时，请检查设备网络后重试。（错误码 1007900028）',code:1007900028,stage:'network'});let value=true;if(operation==='initializeStorage')value={storage:{id:'',needsSetup:false},documents:[],folders:[],entries:[]};if(operation==='api')value=window.__nativeMode==='signed-in'?{status:200,body:[]}:{status:401,body:{}};if(operation==='connection')value={status:200,body:{}};if(operation==='login'){await new Promise(resolve=>setTimeout(resolve,30));window.__nativeMode='signed-in';value={login:'native-writer'};}if(operation==='import')value=[{name:'导入小说.txt',text:'第一章 导入\r\n正文'}];return JSON.stringify({ok:true,value});}
    };
  },seed);
  const n=await nativeContext.newPage();n.on('pageerror',e=>errors.push(e.message));await n.goto(url);await n.waitForSelector('.cm-editor');
  await check('页面的鸿蒙桥接路径可保存、导入、导出，且不写浏览器文稿存储',async()=>{
    await n.locator('#mobile-library').click();await n.locator('#import-doc').click();await n.waitForFunction(()=>document.querySelector('#current-name').textContent==='导入小说.txt');await n.locator('#quick-save').click();
    const id=await n.evaluate(()=>document.querySelector('.document-tab.active [data-tab]').dataset.tab);await n.locator(`[data-menu="${id}"]`).click();await n.locator('#menu-export').click();
    const calls=await n.evaluate(()=>window.__nativeCalls);assert.ok(calls.some(c=>c.operation==='save'&&c.value.includes('导入小说.txt')));assert.ok(calls.some(c=>c.operation==='export'&&c.payload.text==='第一章 导入\n正文'));assert.equal(await n.evaluate(()=>localStorage.getItem('wenzhou.workspace')),null);
  });
  await check('原生连接检测和 Promise 登录返回值可正确显示，异常返回不会成为已登录状态',async()=>{
    await n.locator('#dialog-cancel').click().catch(()=>{});
    await n.locator('#mobile-library').click();await n.locator('#quick-git').click();await n.locator('#check-connection').click();await n.waitForFunction(()=>document.querySelector('#dialog-body').textContent.includes('连接正常'));await n.locator('#dialog-cancel').click();
    await n.locator('#token-login').click();await n.locator('[name="token"]').fill('native-test-token');
    await n.evaluate(()=>window.__nativeMode='no-result');await n.locator('#dialog-submit').click();await n.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('未返回结果'));
    await n.evaluate(()=>window.__nativeMode='network-failure');await n.locator('#dialog-submit').click();await n.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('1007900028'));
    await n.evaluate(()=>window.__nativeMode='normal');await n.locator('#dialog-submit').click();await n.waitForSelector('#logout');assert.equal(await n.locator('#dialog').isVisible(),false);
    assert.equal(await n.evaluate(()=>localStorage.getItem('wenzhou.workspace')),null);
  });
  await nativeContext.close();assert.deepEqual(errors,[]);await writeFile('test-results/results.json',JSON.stringify({passed:results.length,checks:results,pageErrors:errors},null,2));
  console.log(`${results.length} 项界面检查通过`);
}catch(error){await page.screenshot({path:'test-results/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();server.close();}
