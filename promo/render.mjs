// Renders video.html frame by frame and muxes it with music.wav via ffmpeg.
// node promo/render.mjs [--stills 1,12,20]  → stills only, for checking layouts
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dir=path.resolve('promo'),FPS=30;
const ffmpeg=process.env.FFMPEG;
const stillsArg=process.argv.indexOf('--stills');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>console.error(e.message));
await page.goto(pathToFileURL(path.join(dir,'video.html')).href);await page.evaluate(()=>window.ready);await page.waitForTimeout(500);
const duration=await page.evaluate(()=>window.DURATION);
try{
 if(stillsArg>0){await mkdir(dir+'/stills',{recursive:true});for(const t of process.argv[stillsArg+1].split(',').map(Number)){await page.evaluate(t=>render(t),t);await page.screenshot({path:`${dir}/stills/t${String(t).padStart(5,'0')}.png`});}}
 else{
  const ff=spawn(ffmpeg,['-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-i',dir+'/music.wav','-c:v','libx264','-preset','slow','-crf','18','-vf','scale=out_range=tv:out_color_matrix=bt709,format=yuv420p','-color_range','tv','-colorspace','bt709','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',dir+'/文舟Vela宣传片.mp4'],{stdio:['pipe','inherit','inherit']});
  const total=Math.round(duration*FPS),t0=Date.now();
  for(let f=0;f<total;f++){await page.evaluate(t=>render(t),f/FPS);const buf=await page.screenshot({type:'jpeg',quality:93});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%300===0)console.log(`frame ${f}/${total} ${((Date.now()-t0)/1000).toFixed(0)}s`);}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
 }
}finally{await browser.close();}
