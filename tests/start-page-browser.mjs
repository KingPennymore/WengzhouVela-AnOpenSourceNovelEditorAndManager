import {chromium} from 'playwright';
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
  browser=await chromium.launch({headless:true,...(process.env.WENZHOU_CHROME?{executablePath:process.env.WENZHOU_CHROME}:{})});
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
    await page.locator('#start-actions-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('.file-rowbar').isVisible(),false);
    assert.equal(await page.locator('#writing-footer').isVisible(),false);
    assert.equal(await page.locator('#outline-toggle').isVisible(),false);
    assert.equal(await page.locator('#start-recent-panel').getAttribute('aria-hidden'),'true');
    const layout=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
      const buttons=[...document.querySelectorAll('.start-action')];
      return {top:rect('.topbar'),start:rect('#start-page'),overflow:document.documentElement.scrollWidth>innerWidth,
        buttons:buttons.map(b=>({rect:b.getBoundingClientRect().toJSON(),icon:!!b.querySelector('svg'),label:b.querySelector('strong').textContent,style:[getComputedStyle(b).backgroundColor,getComputedStyle(b).borderColor,getComputedStyle(b).borderRadius,getComputedStyle(b.querySelector('.start-action-icon')).backgroundColor]})),
        transition:getComputedStyle(document.querySelector('.start-panel')).transitionDuration};
    });
    assert.equal(layout.overflow,false);
    assert.ok(Math.abs(layout.start.top-layout.top.bottom)<1,'no unused row above the start page');
    assert.ok(Math.abs(layout.start.bottom-height)<1,'start page reaches the bottom');
    assert.equal(layout.buttons.length,8);
    for(let i=0;i<layout.buttons.length;i++){
      const b=layout.buttons[i];assert.ok(b.icon&&b.label);
      assert.deepEqual(b.style,layout.buttons[0].style,'consistent action colors and shape');
      assert.ok(b.rect.left>=0&&b.rect.right<=width);
      assert.ok(Math.abs(b.rect.left-layout.buttons[0].rect.left)<1);
      if(i)assert.ok(b.rect.top>=layout.buttons[i-1].rect.bottom,'one button per row');
    }
    if(motion==='reduce')assert.match(layout.transition,/^0s/);
    await page.screenshot({path:`${out}/${profile}-${width}-${theme}-home.png`});
    const menu=page.locator('#start-actions-panel'),recent=page.locator('#start-recent-panel');
    await page.locator('[data-start=recent]').click();
    await page.waitForFunction(()=>document.querySelector('#start-page').dataset.panel==='recent'&&getComputedStyle(document.querySelector('#start-recent-panel')).transform==='matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(await menu.getAttribute('aria-hidden'),'true');
    assert.equal(await menu.evaluate(e=>e.inert),true);
    assert.equal(await recent.evaluate(e=>e.inert),false);
    assert.equal(await page.locator('.recent-files>button').first().getAttribute('data-recent'),'book');
    assert.equal(await page.locator('.start-back').evaluate(e=>e===document.activeElement),true);
    await page.locator('.start-back').click();
    assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('[data-start=recent]').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('[data-start=recent]').click();
    assert.equal(await page.evaluate(()=>window.wenzhouBack()),true);
    assert.equal(await page.locator('#start-page').getAttribute('data-panel'),'actions');
    await page.locator('[data-start=recent]').click();
    await page.screenshot({path:`${out}/${profile}-${width}-${theme}-recent.png`});
    await page.locator('[data-recent=book]').click();
    await page.locator('.cm-content').waitFor();
    await page.waitForFunction(()=>document.querySelector('#app').dataset.sidebarsAnimating==='false');
    assert.equal(await page.locator('.file-rowbar').isVisible(),height>500);
    assert.equal(await page.locator('#writing-footer').isVisible(),true);
    assert.equal(await page.locator('#search-editor').isEnabled(),true);
    await page.locator('.cm-content').fill('第一章 航程\n保存后的正文。');
    await page.keyboard.press('Control+Alt+h');
    assert.equal(await page.locator('#writing-footer').isVisible(),false);
    await page.locator('[data-start=recent]').click();await page.locator('[data-recent=book]').click();
    assert.match(await page.locator('.cm-content').innerText(),/保存后的正文/);
    checks.push(`${profile} ${width}×${height} ${theme} ${language}: layout, uniform buttons, navigation, focus, editor restore and save`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));
  console.log(checks.map(check=>'PASS '+check).join('\n'));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
