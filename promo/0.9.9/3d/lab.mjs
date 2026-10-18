import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
// Renders lab.html (model review) to dist/promo/0.9.9/lab.png. Usage: node promo/0.9.9/3d/lab.mjs [model] [json options]
const dir=path.dirname(fileURLToPath(import.meta.url)),[model='soldier',opts='{}']=process.argv.slice(2);
const types={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.json':'application/json'};
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>console.error('page:',e.message));page.on('console',m=>m.type()==='error'&&console.error('console:',m.text()));
await page.route('http://promo.local/**',async r=>{const p=path.join(dir,decodeURIComponent(new URL(r.request().url()).pathname));try{r.fulfill({body:await readFile(p),contentType:types[path.extname(p)]||'application/octet-stream'});}catch{r.fulfill({status:404});}});
await page.goto('http://promo.local/lab.html');await page.waitForFunction(()=>window.labReady);
const o={model,...JSON.parse(opts)};await page.evaluate(o=>o.poses?window.labPoses(o):window.lab(o),o);
const out=path.resolve('dist/promo/0.9.9/lab.png');await mkdir(path.dirname(out),{recursive:true});
await writeFile(out,Buffer.from((await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'))).split(',')[1],'base64'));console.log(out);await browser.close();
