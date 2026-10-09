import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {textFingerprint} from '../web/document-service.mjs';
import {writeFile} from 'node:fs/promises';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),repo='author/voyage',original='第一章\n原来的正文\n',updated='第一章\n修改后的正文\n';let head=A,delay=false;const writes=[];
const seed={version:1,documents:[{id:'book',name:'航程.txt',path:'Novel/航程.txt',text:updated,updatedAt:1,remote:{repo,branch:'main',path:'航程.txt',sha:B,lastSyncedText:original}}],folders:['Novel'],openIds:['book'],activeId:'book',repositories:[{repo,branch:'main',folder:'Novel',commit:A,baseFiles:{'航程.txt':{sha:B,hash:textFingerprint(original)}}}],settings:{theme:'light'}};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({viewport:{width:1280,height:850}}),errors=[];
await context.addInitScript(seed=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
await context.route('https://api.github.com/**',async route=>{const r=route.request(),u=new URL(r.url()),path=decodeURIComponent(u.pathname),method=r.method();let body={},status=200;if(method!=='GET')writes.push({path,method,body:r.postDataJSON()});
 if(path==='/user')body={login:'author'};
 else if(path==='/user/repos')body=[{full_name:repo,name:'voyage',default_branch:'main',permissions:{push:true,admin:true}}];
 else if(path.endsWith('/branches'))body=[{name:'main'}];
 else if(path.endsWith('/releases'))body=[{id:1,tag_name:'v1.3',name:'新增第十三章',body:'更新正文',published_at:'2026-10-09T00:00:00Z'}];
 else if(path.endsWith('/commits')&&method==='GET')body=[{sha:A,commit:{message:'第二章修订',author:{name:'Writer',date:'2026-10-09T00:00:00Z'}}}];
 else if(path.includes('/git/ref/heads/'))body={object:{sha:head}};
 else if(path.includes('/git/commits/'))body={tree:{sha:C}};
 else if(path.includes('/git/trees/')&&method==='GET')body={sha:C,tree:[{path:'航程.txt',type:'blob',sha:B,size:Buffer.byteLength(original)}]};
 else if(path.includes('/git/blobs/')){if(delay)await new Promise(r=>setTimeout(r,700));body={encoding:'base64',content:Buffer.from(original).toString('base64'),size:Buffer.byteLength(original)};}
 else if(path.includes('/contents/')&&method==='PUT')body={content:{sha:C},commit:{sha:C}};
 else if(path.includes('/contents'))body=[];
 else if(path.endsWith('/git/trees')&&method==='POST')body={sha:C,tree:[{path:'航程.txt',sha:C}]};
 else if(path.endsWith('/git/commits')&&method==='POST')body={sha:C};
 else if(path.endsWith('/git/refs/heads/main'))body={object:{sha:C}};
 else if(path==='/repos/'+repo)body={full_name:repo,default_branch:'main'};
 else {status=404;body={message:path};}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));const done=()=>p.waitForSelector('#dialog[open]',{state:'hidden'});
try{
 await p.goto((process.env.VELA_TEST_URL||'http://127.0.0.1:4173'));await p.locator('[data-recent=book]').click();await p.locator('[data-view=github]').click();await p.locator('#token-login').click();await p.locator('[name=token]').fill('fixture-only');await p.locator('#dialog-submit').click();await done();await p.locator('.repo-card').click();await p.locator('#repo-history').click();await p.waitForSelector('.git-history-item');assert.match(await p.locator('.git-history-item').textContent(),/第二章修订.*aaaaaaaa/s);await p.locator('#dialog-cancel').click();
 await p.locator('#repo-commit').click();await p.locator('#dialog-submit').click();await p.waitForSelector('.sync-diff');assert.match(await p.locator('.sync-diff').textContent(),/− 原来的正文.*\+ 修改后的正文/s);assert.equal(writes.length,0);await p.locator('#dialog-cancel').click();
 await p.locator('#repo-commit-workspace').click();await p.locator('#dialog-submit').click();await p.waitForSelector('[data-diff]');await p.locator('[data-diff] summary').click();await p.waitForSelector('.sync-diff');assert.match(await p.locator('.sync-diff').textContent(),/原来的正文.*修改后的正文/s);await p.locator('#dialog-cancel').click();assert.equal(writes.length,0);
 await p.locator('#repo-commit-workspace').click();await p.locator('#dialog-submit').click();await p.waitForSelector('[name=commitFiles]');head=C;await p.locator('#dialog-submit').click();await p.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('远端版本已变化'));assert.equal(writes.length,0);await p.locator('#dialog-cancel').click();head=A;
 await p.locator('#repo-commit-workspace').click();await p.locator('#dialog-submit').click();await p.waitForSelector('[name=commitFiles]');await p.locator('#dialog-submit').click();await done();assert.equal(writes.at(-1).body.force,false);assert.ok(writes.some(w=>w.path.endsWith('/git/commits')));
 await p.locator('[data-view=subscriptions]').click();await p.locator('#subscription-add').click();await p.locator('[name=url]').fill('https://github.com/'+repo);await p.locator('#dialog-submit').click();await p.waitForFunction(()=>document.querySelector('#dialog-title').textContent==='立即拉取？');await p.locator('#dialog-cancel').click();assert.match(await p.locator('.subscription-card').textContent(),/v1.3.*新增第十三章/);await p.locator('.subscription-open').click();await p.locator('#subscription-pull').click();delay=true;await p.locator('#dialog-submit').click();await p.waitForSelector('#subscription-pull-cancel:not([hidden])');await p.locator('#subscription-pull-cancel').click();await p.waitForFunction(()=>document.querySelector('#dialog-error').textContent.length>0);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.some(d=>d.path.startsWith('Subscriptions/'))),false);await p.locator('#dialog-cancel').click();delay=false;
 await p.locator('#subscription-pull').click();await p.locator('#dialog-submit').click();await p.waitForSelector('[name=downloadFiles]');assert.match(await p.locator('.sync-files').textContent(),/航程.txt/);assert.match(await p.locator('#dialog-body').textContent(),/Subscriptions\/author\/voyage/);await p.locator('#dialog-cancel').click();
 assert.deepEqual(errors,[]);await writeFile('test-results/storyboard/sync-results.json',JSON.stringify({checks:['Commit history','Single-file line diff and cancel','Workspace line diff','Concurrent remote change blocks commit','Non-force atomic commit','Subscription release summary','Download cancellation preserves workspace','Download preview keeps full paths'],errors},null,2));console.log('PASS storyboard Git and subscriptions');
}finally{await browser.close();}
