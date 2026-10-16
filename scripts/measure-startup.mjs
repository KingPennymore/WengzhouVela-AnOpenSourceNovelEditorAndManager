// Cold start of the built editor (dist/web): time from navigation to window.velaReady, and the JavaScript fetched
// until then, in fresh browser contexts (no HTTP cache). Runs unthrottled and with 4× CPU throttling (a slow phone).
// Usage: node scripts/measure-startup.mjs [runs] [--out file.json]
import {chromium} from 'playwright';
import {existsSync,readFileSync,statSync,readdirSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import http from 'node:http';
import path from 'node:path';

const runs=Number(process.argv[2])||7,outIndex=process.argv.indexOf('--out'),root=path.resolve('dist/web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];
async function once(throttle){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  await page.addInitScript(()=>{let value;Object.defineProperty(window,'velaReady',{configurable:true,get:()=>value,set(next){value=next;if(next&&!window.__velaReadyAt)window.__velaReadyAt=performance.now();}});});
  if(throttle>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});}
  await page.goto(url);await page.waitForFunction(()=>window.__velaReadyAt,null,{timeout:120000});
  const ready=await page.evaluate(()=>window.__velaReadyAt),scripts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\.m?js$/.test(new URL(e.name).pathname)&&e.startTime<window.__velaReadyAt).map(e=>new URL(e.name).pathname));
  await context.close();return {ready,scripts};
}
const result={measuredAt:new Date().toISOString(),runs,files:{}};
for(const file of readdirSync(root).filter(name=>/\.js$/.test(name)&&statSync(path.join(root,name)).isFile()).concat(existsSync(path.join(root,'chunks'))?readdirSync(path.join(root,'chunks')).map(name=>'chunks/'+name):[])){const bytes=readFileSync(path.join(root,file));result.files[file]={bytes:bytes.length,gzip:gzipSync(bytes).length};}
for(const throttle of [1,4]){
  await once(throttle);const times=[];let scripts=[];
  for(let i=0;i<runs;i++){const run=await once(throttle);times.push(run.ready);scripts=run.scripts;}
  const startupBytes=scripts.reduce((n,name)=>n+(result.files[name.replace(/^\//,'')]?.bytes||0),0);
  result['cpu'+throttle+'x']={medianReadyMs:Math.round(median(times)),minReadyMs:Math.round(Math.min(...times)),scriptsBeforeReady:scripts,scriptBytesBeforeReady:startupBytes};
}
console.log(JSON.stringify(result,null,2));if(outIndex>0)await writeFile(process.argv[outIndex+1],JSON.stringify(result,null,2));
await browser.close();server.close();
