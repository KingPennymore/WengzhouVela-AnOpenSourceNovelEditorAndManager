import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
// Motion preview of the trail (shots 12, 14–18): the camera following the footprints, without sound.
// node promo/0.9.9/storyboard/preview.mjs → storyboard/preview-trail.mp4
const dir=path.dirname(fileURLToPath(import.meta.url)),FPS=12,SPANS=[[87,98],[116,161]];
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME});
const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>console.error('page:',e.message));
await page.goto(pathToFileURL(path.join(dir,'..','scene.html')).href+'?record=1');await page.waitForFunction(()=>window.promoReady);
for(const f of ['../samples/loom.js','../samples/samples.js','frames.js'])await page.addScriptTag({path:path.join(dir,f)});
const out=path.join(dir,'preview-trail.mp4');
const ff=spawn(process.env.FFMPEG||'ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-vf','scale=1280:720','-c:v','libx264','-pix_fmt','yuv420p','-crf','22',out],{stdio:['pipe','inherit','inherit']});
let n=0;for(const [a,b] of SPANS)for(let t=a;t<b;t+=1/FPS){
  const data=await page.evaluate(t=>{trailFrame(t);ctx.setTransform(1,0,0,1,0,0);if(t>137.2&&t<153.5){ctx.save();outlinePanel(t);ctx.restore();}subtitles(t);return document.getElementById('stage').toDataURL('image/jpeg',.85);},t);
  if(!ff.stdin.write(Buffer.from(data.split(',')[1],'base64')))await new Promise(r=>ff.stdin.once('drain',r));if(++n%60===0)console.log('frame',n,'t',t.toFixed(1));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await browser.close();console.log(out);
