import {openRecentFile} from './start-page-helper.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=path.resolve('dist/web'),server=http.createServer(async(req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const contents=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[path.extname(file)]||'application/octet-stream'}).end(contents);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{if(window.top!==window)return;if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'tex',name:'main.tex',text:'\\documentclass{article}\\begin{document}test\\end{document}',updatedAt:1}],settings:{theme:'light'},activeId:'tex',openIds:['tex']}));});
const open=async()=>{await page.goto(url);await openRecentFile(page,page.locator('[data-recent=tex]'));await page.locator('#more-tools').click();await page.locator('#plugins').click();};
try{
 assert.equal(JSON.parse(await readFile('dist/web/tex/components.json','utf8')).builtin,true,'Requires a full build');await open();const engine=page.locator('.plugin-card').filter({hasText:'vela.component.tex.engine'}),chinese=page.locator('.plugin-card').filter({hasText:'vela.component.tex.chinese'});await engine.waitFor();assert.match(await engine.textContent(),/内置组件/);assert.match(await chinese.textContent(),/已启用/);assert.equal(await engine.locator('[data-plugin-remove]').count(),0);await engine.locator('[data-plugin-enable]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.plugin-card')].find(c=>c.textContent.includes('vela.component.tex.engine'))?.textContent.includes('已停用'));await open();assert.match(await engine.textContent(),/已停用/);await engine.locator('[data-plugin-enable]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.plugin-card')].find(c=>c.textContent.includes('vela.component.tex.engine'))?.textContent.includes('已启用'));assert.deepEqual(errors,[]);console.log('PASS full build exposes builtin component cards, disallows uninstall and persists stop/start');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
