import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
// Renders the key frames of storyboard v3 to promo/0.9.9/storyboard/frames/*.jpg.
// node promo/0.9.9/storyboard/render.mjs [id,id…]   (default: every frame in window.FRAMES)
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME});
const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>console.error('page:',e.message));
await page.goto(pathToFileURL(path.join(dir,'..','scene.html')).href+'?record=1');await page.waitForFunction(()=>window.promoReady);
// scene.html already loads the loom, the samples and the storyboard
if(!await page.evaluate(()=>!!window.FRAMES))for(const f of ['../samples/loom.js','../samples/samples.js','frames.js'])await page.addScriptTag({path:path.join(dir,f)});
const ids=process.argv[2]?process.argv[2].split(','):await page.evaluate(()=>Object.keys(window.FRAMES));
for(const id of ids){
  const data=await page.evaluate(id=>{window.FRAMES[id]();return document.getElementById('stage').toDataURL('image/jpeg',.9);},id);
  const file=path.join(dir,'frames',id+'.jpg');await writeFile(file,Buffer.from(data.split(',')[1],'base64'));console.log(file);}
await browser.close();
