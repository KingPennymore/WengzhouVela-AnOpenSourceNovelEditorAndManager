import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

// The e-book reader component on plugin API 4: install, top-toolbar button, page, command and clean disable.
const root=path.resolve('dist/web'),pkg=JSON.parse(await readFile('components/ebook-reader/plugin.json','utf8')),zip=await readFile('dist/plugins/Vela-Ebook-Reader-'+pkg.version+'.zip');
const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}let body;try{body=await readFile(file);}catch{res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream'}).end(body);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const button='[data-plugin-button="vela.component.ebook-reader/open"]';
try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.velaReady===true);
  await check('reader package declares plugin API 4 and installs without errors',async()=>{assert.equal(pkg.vela.api,'>=4 <5');await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.locator('#plugin-input').setInputFiles({name:'reader.zip',mimeType:'application/zip',buffer:zip});await page.locator('.plugin-card').filter({hasText:pkg.name}).waitFor();assert.equal(await page.locator('#dialog-error').textContent(),'');assert.match(await page.locator('.plugin-card').filter({hasText:pkg.name}).textContent(),/停用/);await page.locator('#dialog-cancel').click();});
  await check('reader adds a top-toolbar button that opens its page',async()=>{await page.locator(button).waitFor({state:'attached'});if(!await page.locator(button).isVisible())await page.locator('#more-tools').click();await page.locator(button).click();await page.locator('.plugin-page:not([hidden])').waitFor();assert.ok(await page.locator('.plugin-page:not([hidden]) .ebook-pdf').count()>0,'reader interface rendered');await page.locator('.plugin-page:not([hidden]) header button').click();await page.locator('.plugin-page:not([hidden])').waitFor({state:'detached'}).catch(()=>{});});
  await check('reader command is listed in the command palette',async()=>{await page.locator('#more-tools').click();await page.locator('#commands').click();await page.locator('#command-search').fill('电子书');assert.match(await page.locator('#command-list').innerText(),/电子书：打开阅读器/);await page.locator('#dialog-cancel').click();});
  await check('disabling the reader removes its button and page',async()=>{await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.locator('.plugin-card').filter({hasText:pkg.name}).locator('[data-plugin-enable]').click();await page.locator('#dialog-cancel').click();assert.equal(await page.locator(button).count(),0);assert.equal(await page.locator('.plugin-page').count(),0);});
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/reader-component.json',JSON.stringify({checks,errors,version:pkg.version},null,2));
}finally{await browser.close();server.close();}
