import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,access} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';

// Renders scene.html frame by frame (canvas → JPEG → ffmpeg) and muxes soundtrack.wav into an H.264/AAC MP4.
// Frames come from renderAt(t) on a fixed 30 fps clock, so the render is exact however slow the machine is.
// Usage (from the repository root):
//   node promo/0.9.9/render.mjs                      → promo/0.9.9/炉火祈愿-文舟0.9.9宣传片.mp4
//   node promo/0.9.9/render.mjs stills 10,30,61      → dist/promo/0.9.9/stills/t10.png …
//   node promo/0.9.9/render.mjs sheet 0,5,10,…       → dist/promo/0.9.9/sheet.png (contact sheet)
//   node promo/0.9.9/render.mjs chars                → dist/promo/0.9.9/chars.png (character model sheet)
// Needs ffmpeg on PATH (or FFMPEG=…) and Chrome/Chromium (WENZHOU_CHROME=… or Playwright's own browser).
const dir=path.dirname(fileURLToPath(import.meta.url)),FPS=30,[mode='video',list='']=process.argv.slice(2);
const out=path.resolve('dist/promo/0.9.9'),video=path.join(dir,'炉火祈愿-文舟0.9.9宣传片.mp4');
const exists=p=>access(p).then(()=>true,()=>false);
const winChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath=process.env.WENZHOU_CHROME||(await exists(winChrome)?winChrome:undefined);
const browser=await chromium.launch({executablePath});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
  await page.goto(pathToFileURL(path.join(dir,'scene.html')).href+'?record=1');await page.waitForFunction(()=>window.promoReady);
  const frame=(t,type)=>page.evaluate(([t,type])=>{renderAt(t);return document.getElementById('stage').toDataURL(type,.93);},[t,type]).then(d=>Buffer.from(d.slice(d.indexOf(',')+1),'base64'));
  await mkdir(out,{recursive:true});
  if(mode==='stills'){
    const {writeFile}=await import('node:fs/promises');await mkdir(path.join(out,'stills'),{recursive:true});
    for(const t of list.split(',').map(Number)){const f=path.join(out,'stills',`t${t}.png`);await writeFile(f,await frame(t,'image/png'));console.log(f);}
  }else if(mode==='chars'){
    const {writeFile}=await import('node:fs/promises');await writeFile(path.join(out,'chars.png'),await page.evaluate(()=>{characterSheet();return document.getElementById('stage').toDataURL('image/png');}).then(d=>Buffer.from(d.slice(22),'base64')));console.log(path.join(out,'chars.png'));
  }else if(mode==='sheet'){
    const times=list.split(',').map(Number);
    await page.evaluate(times=>{const cols=4,cw=480,ch=270,sheet=document.createElement('canvas');sheet.width=cw*cols;sheet.height=(ch+26)*Math.ceil(times.length/cols);const g=sheet.getContext('2d');g.fillStyle='#222';g.fillRect(0,0,sheet.width,sheet.height);
      times.forEach((t,i)=>{renderAt(t);const x=(i%cols)*cw,y=Math.floor(i/cols)*(ch+26);g.drawImage(document.getElementById('stage'),x,y+26,cw,ch);g.fillStyle='#fff';g.font='16px sans-serif';g.fillText(t+'s',x+6,y+18);});
      document.body.replaceChildren(sheet);sheet.id='sheet';},times);
    await page.locator('#sheet').screenshot({path:path.join(out,'sheet.png')});console.log(path.join(out,'sheet.png'));
  }else{
    const duration=await page.evaluate(()=>window.DURATION),total=Math.round(duration*FPS),t0=Date.now();
    const ff=spawn(process.env.FFMPEG||'ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-i',path.join(dir,'soundtrack.wav'),
      '-c:v','libx264','-preset','slow','-crf','20','-tune','animation','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
      '-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',video],{stdio:['pipe','inherit','inherit']});
    for(let f=0;f<total;f++){const buf=await frame(f/FPS,'image/jpeg');if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%300===0)console.log(`frame ${f}/${total}  ${((Date.now()-t0)/1000).toFixed(0)} s`);}
    ff.stdin.end();const code=await new Promise(r=>ff.on('close',r));if(code)throw Error('ffmpeg exited with '+code);console.log(video);
  }
  if(errors.length)console.error('page errors:',[...new Set(errors)].slice(0,10));
}finally{await browser.close();}
