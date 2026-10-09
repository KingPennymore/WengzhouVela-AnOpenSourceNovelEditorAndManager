import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(/^https:\/\/(gitee\.com\/api\/v5|api\.github\.com)/,async route=>{
  const req=route.request(),url=new URL(req.url()),gitee=url.hostname==='gitee.com',path=url.pathname.replace('/api/v5','');calls.push({host:url.hostname,path,auth:req.headers().authorization});
  const status=path==='/user'&&req.headers().authorization==='Bearer invalid-fixture'?401:200;
  const body=path==='/user/repos'?[{name:'novel',full_name:'writer/novel',default_branch:'main',private:false,permissions:{push:true,admin:true}}]:path==='/user'?{login:gitee?'gitee-writer':'github-writer'}:path.endsWith('/branches')?[{name:'main'}]:path.includes('/contents/')?[]:{};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:4173/');await page.locator('[data-view=github]').click();await page.locator('#git-provider').selectOption('gitee');assert.ok(await page.locator('#device-login').isHidden());await page.locator('#check-connection').click();assert.match(await page.locator('#dialog-body').textContent(),/Gitee 连接正常/);await page.locator('#dialog-cancel').click();
 await page.locator('#token-login').click();assert.equal(await page.locator('[name=provider]').inputValue(),'gitee');await page.locator('[name=token]').fill('invalid-fixture');await page.locator('#dialog-submit').click();await page.waitForFunction(()=>document.querySelector('#dialog-error').textContent.length>0);assert.ok(await page.locator('#dialog[open]').isVisible());
 await page.locator('[name=token]').fill('gitee-fixture');await page.locator('#dialog-submit').click();await page.waitForSelector('.repo-card');assert.match(await page.locator('#account-label').textContent(),/Gitee/);assert.ok(calls.filter(call=>call.path==='/user/repos').every(call=>call.host==='gitee.com'&&call.auth==='Bearer gitee-fixture'));
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));assert.equal(state.settings.gitProvider,'gitee');assert.equal(state.githubCache.provider,'gitee');assert.ok(!JSON.stringify(state).includes('gitee-fixture'));
 await page.locator('.repo-card').click();await page.waitForSelector('#branch-select option',{state:'attached'});assert.equal(await page.locator('#branch-select').inputValue(),'main');await page.locator('#back-repos').click();await page.locator('#logout').click();
 await page.locator('#git-provider').selectOption('github');assert.ok(await page.locator('#device-login').isVisible());await page.locator('#token-login').click();await page.locator('[name=token]').fill('github-fixture');await page.locator('#dialog-submit').click();await page.waitForSelector('.repo-card');assert.ok(calls.filter(call=>call.host==='api.github.com').every(call=>call.auth==='Bearer github-fixture'));assert.match(await page.locator('#account-label').textContent(),/GitHub/);assert.deepEqual(errors,[]);console.log('PASS provider choice, failed login, Gitee repository UI, secure credentials and GitHub switching');
}finally{await browser.close();}
