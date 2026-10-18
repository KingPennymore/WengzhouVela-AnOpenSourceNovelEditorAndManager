import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
// Renders the art-direction samples to promo/0.9.9/samples/*.jpg.
// node promo/0.9.9/samples/render.mjs [name,name…]   (default: all)
const dir=path.dirname(fileURLToPath(import.meta.url));
const ALL={'1-traces':'sampleTraces','2-tapestry-bear':'sampleBear','3-tapestry-rider':'sampleRider'};
const want=process.argv[2]?process.argv[2].split(','):Object.keys(ALL);
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME});
const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>console.error('page:',e.message));page.on('console',m=>console.log('console:',m.text()));
await page.goto(pathToFileURL(path.join(dir,'..','scene.html')).href+'?record=1');await page.waitForFunction(()=>window.promoReady);
for(const f of ['loom.js','samples.js'])await page.addScriptTag({path:path.join(dir,f)});
for(const name of want){
  const data=await page.evaluate(fn=>{window[fn]();return document.getElementById('stage').toDataURL('image/jpeg',.9);},ALL[name]);
  const file=path.join(dir,name+'.jpg');await writeFile(file,Buffer.from(data.split(',')[1],'base64'));console.log(file);}
await browser.close();
