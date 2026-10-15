import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Settings → 恢复文稿备份: a JSON backup is restored into a new folder without touching existing documents.
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}let body;try{body=await readFile(file);}catch{res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream'}).end(body);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const backup={version:1,documents:[{id:'old-1',name:'正文.txt',path:'旧书/正文.txt',text:'第一章 恢复的正文',updatedAt:1}],folders:['旧书'],trash:[],openIds:[],activeId:null,writingTools:{glossary:['恢复词'],snippets:[]}};
const stored=()=>page.evaluate(()=>{for(const key of Object.keys(localStorage)){try{const value=JSON.parse(localStorage.getItem(key));if(value?.documents)return value;}catch{}}return null;});
try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.velaReady===true);
  const before=(await stored())?.documents.map(doc=>doc.id+':'+doc.text)||[];
  await check('restore button opens a preview with the document count and a new folder name',async()=>{await page.evaluate(()=>document.querySelector('#settings').click());await page.locator('#restore-backup').waitFor();const chooser=page.waitForEvent('filechooser');await page.locator('#restore-backup').click();await (await chooser).setFiles({name:'Vela-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='恢复文稿备份');assert.match(await page.locator('#dialog-body').innerText(),/1 篇文稿/);assert.match(await page.locator('#dialog-body [name=folder]').inputValue(),/^恢复的备份 /);});
  await check('confirming restores into the new folder with a new identity and keeps existing documents',async()=>{await page.locator('#dialog-body [name=folder]').fill('恢复测试');await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);const after=await stored(),restored=after.documents.find(doc=>doc.path==='恢复测试/旧书/正文.txt');assert.ok(restored,'restored document saved');assert.notEqual(restored.id,'old-1');assert.equal(restored.text,'第一章 恢复的正文');for(const item of before)assert.ok(after.documents.some(doc=>doc.id+':'+doc.text===item),'existing document unchanged');assert.ok(after.writingTools.glossary.includes('恢复词'));});
  await check('an invalid file is refused with a reason and nothing changes',async()=>{const count=(await stored()).documents.length;await page.evaluate(()=>document.querySelector('#settings').click());const chooser=page.waitForEvent('filechooser');await page.locator('#restore-backup').click();await (await chooser).setFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('not json')});await page.waitForFunction(()=>/JSON/.test(document.querySelector('#toast')?.textContent||document.querySelector('#dialog-error')?.textContent||''));assert.equal((await stored()).documents.length,count);});
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/backup-restore.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();server.close();}
