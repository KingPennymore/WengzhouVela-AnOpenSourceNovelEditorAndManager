import {launchBrowser} from './browser-launch.mjs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const contents=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream'}).end(contents);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const out='test-results/start-page';await mkdir(out,{recursive:true});
let browser;
const checks=[],errors=[];
try{
  browser=await launchBrowser();
  for(const [profile,width,height,theme,language,motion] of [
    ['android',320,700,'light','zh-CN','no-preference'],
    ['android',390,844,'dark','zh-CN','no-preference'],
    ['harmonyos',390,844,'light','en','no-preference'],
    ['harmonyos',768,900,'dark','zh-CN','no-preference'],
    ['windows',1366,900,'light','zh-CN','no-preference'],
    ['android',800,360,'light','zh-CN','reduce']
  ]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:motion});
    await context.addInitScript(({theme,language})=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'older',name:'旧文稿.txt',text:'旧正文',updatedAt:1},{id:'book',name:'最新文稿.txt',text:'第一章 航程\n正文内容。',updatedAt:5}],openIds:['book'],activeId:'book',settings:{theme,language}})),{theme,language});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route=>route.abort());
    await page.goto(url+'/?ui='+profile);
    await page.locator('#start-actions-panel').waitFor({state:'visible'});await page.waitForFunction(()=>window.velaReady);
    assert.equal(await page.locator('.file-rowbar').isVisible(),false);
    assert.equal(await page.locator('#writing-footer').isVisible(),false);
    assert.equal(await page.locator('#outline-toggle').isVisible(),false);
    assert.equal(await page.locator('.resume-card').getAttribute('data-doc'),'book');
    assert.equal(await page.locator('#start-recent-panel').isVisible(),true);
    const actions=page.locator('.start-action:visible');assert.equal(await actions.count(),profile==='windows'?7:6);assert.ok(await page.locator('[data-start=check-update]').isVisible(),'check for updates from the start page');
    for(const button of await actions.all())assert.ok(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;}));
    assert.equal(await page.locator('[data-start=commands]').isVisible(),profile==='windows');
    await page.screenshot({path:`${out}/${profile}-${width}-${theme}-home.png`});
    await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent'));assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'recent');assert.equal(await page.locator('.start-back').evaluate(e=>e===document.activeElement),true);
    await page.locator('.start-back').click();assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent'));await page.keyboard.press('Escape');assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent'));assert.equal(await page.evaluate(()=>window.wenzhouBack()),true);assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent'));await page.screenshot({path:`${out}/${profile}-${width}-${theme}-recent.png`});
    await page.locator('[data-recent=book]').click();
    await page.locator('.cm-content').waitFor();
    await page.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');
    if(await page.locator('body').getAttribute('data-mobile-editor')==='true'){assert.equal(await page.locator('.file-rowbar').isVisible(),false);assert.equal(await page.locator('#current-name').isVisible(),true);}else assert.equal(await page.locator('.file-rowbar').isVisible(),height>500||width>height);
    assert.equal(await page.locator('#writing-footer').isVisible(),true);
    assert.equal(await page.locator('#search-editor').isEnabled(),true);
    await page.locator('.cm-content').fill('第一章 航程\n保存后的正文。');
    await page.keyboard.press('Control+Alt+h');
    assert.equal(await page.locator('#writing-footer').isVisible(),false);
    await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent'));await page.locator('[data-recent=book]').click();
    assert.match(await page.locator('.cm-content').innerText(),/保存后的正文/);
    checks.push(`${profile} ${width}×${height} ${theme} ${language}: layout, uniform buttons, navigation, focus, editor restore and save`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));
  console.log(checks.map(check=>'PASS '+check).join('\n'));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
