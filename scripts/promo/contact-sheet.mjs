import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Review aid: a grid of frames at chosen times, drawn from the same canvas (no recording).
// Usage: node scripts/promo/contact-sheet.mjs [w] [h] [out.png] [t1,t2,...]
const [w=1920,h=1080,out='dist/promo/contact-sheet.png',list='2.6,7.5,12.2,13.4,15.4,18.7,23.6,29.4,31.6,37.5']=process.argv.slice(2);
const times=String(list).split(',').map(Number),cols=PORTRAIT()?5:2;function PORTRAIT(){return Number(h)>Number(w);}
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1600,height:1200}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('scripts/promo/vela-promo.html')).href+`?w=${w}&h=${h}&record=1`);await page.waitForFunction(()=>window.promoReady);
const size=await page.evaluate(({times,cols})=>{const stage=document.getElementById('stage'),scale=Math.min(1,1600/cols/stage.width),cw=stage.width*scale,chh=stage.height*scale,rows=Math.ceil(times.length/cols);
  const sheet=document.createElement('canvas');sheet.width=cw*cols;sheet.height=(chh+28)*rows;const g=sheet.getContext('2d');g.fillStyle='#222';g.fillRect(0,0,sheet.width,sheet.height);
  times.forEach((t,i)=>{renderAt(t);const x=(i%cols)*cw,y=Math.floor(i/cols)*(chh+28);g.drawImage(stage,x,y+28,cw,chh);g.fillStyle='#fff';g.font='18px sans-serif';g.fillText(t+'s',x+8,y+20);});
  document.body.replaceChildren(sheet);sheet.style.maxWidth='none';sheet.style.maxHeight='none';return {width:sheet.width,height:sheet.height};},{times,cols});
await page.setViewportSize({width:Math.ceil(size.width),height:Math.ceil(size.height)});await page.locator('canvas').screenshot({path:out});
console.log(out,errors.length?errors:'no errors');await browser.close();
