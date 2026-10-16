import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Video covers: the film's last shot (the three devices, the Vela title and the release badge) drawn by the same
// canvas code with ?cover=1, which settles every animation, and exported from the canvas as PNG.
// Usage: node scripts/promo/render-cover.mjs   → dist/promo/Vela-0.9.8.1-cover-16x9.png and -4x3.png
const version='0.9.8.1',covers=[['16x9',1920,1080],['4x3',1920,1440]];
await mkdir('dist/promo',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  for(const [name,w,h] of covers){
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('scripts/promo/vela-promo.html')).href+`?w=${w}&h=${h}&record=1&cover=1`);await page.waitForFunction(()=>window.promoReady);
    const data=await page.evaluate(()=>{renderAt(window.COVER_TIME);return document.getElementById('stage').toDataURL('image/png');});
    const file=`dist/promo/Vela-${version}-cover-${name}.png`,bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64');await writeFile(file,bytes);
    console.log(`${file}  ${w}×${h}  ${(bytes.length/1024).toFixed(0)} KB`,errors.length?errors:'');await page.close();
  }
}finally{await browser.close();}
