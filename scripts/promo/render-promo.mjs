import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Records scripts/promo/vela-promo.html to MP4 (H.264 + AAC) inside Chrome. Each frame is drawn by renderAt(t) on
// the canvas and pushed through captureStream(0) + requestFrame(); the soundtrack is synthesised by scheduleMusic()
// into a MediaStreamDestination. Frames are paced by the audio clock so picture and music stay in sync.
// No screenshots and no ffmpeg are involved.
// Usage: node scripts/promo/render-promo.mjs [landscape|portrait|all]   → dist/promo/*.mp4
const which=process.argv[2]||'all',FPS=30,version='0.9.8.1';
const formats={landscape:{w:1920,h:1080,bitrate:16e6},portrait:{w:1080,h:1920,bitrate:16e6}};
await mkdir('dist/promo',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
  for(const [name,format] of Object.entries(formats)){
    if(which!=='all'&&which!==name)continue;
    const page=await browser.newPage({viewport:{width:Math.min(format.w,1600),height:Math.min(format.h,1600)}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('scripts/promo/vela-promo.html')).href+`?w=${format.w}&h=${format.h}&record=1`);await page.waitForFunction(()=>window.promoReady);
    const started=Date.now();
    const result=await page.evaluate(async({fps,bitrate})=>{
      const mime=['video/mp4;codecs=avc1.640033,mp4a.40.2','video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error('MP4 recording not supported');
      const ac=new AudioContext({sampleRate:48000});await ac.resume();const audio=ac.createMediaStreamDestination();
      const canvas=document.getElementById('stage'),video=canvas.captureStream(0).getVideoTracks()[0];
      const stream=new MediaStream([video,...audio.stream.getAudioTracks()]);
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:192000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      renderAt(0);video.requestFrame();recorder.start(1000);
      const start=ac.currentTime+.3;scheduleMusic(ac,audio,start);
      const frames=Math.round(window.DURATION*fps);let late=0;
      const until=time=>new Promise(r=>{const check=()=>{const left=time-ac.currentTime;if(left<=.002)r();else setTimeout(check,Math.max(1,Math.min(left*1000-2,15)));};check();});
      for(let i=0;i<=frames;i++){await until(start+i/fps);if(ac.currentTime-(start+i/fps)>1/fps)late++;renderAt(Math.min(i/fps,window.DURATION));video.requestFrame();}
      await until(start+window.DURATION+.25);recorder.stop();await new Promise(r=>recorder.onstop=r);await ac.close();
      const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());window.__video=bytes;return {mime,frames:frames+1,late,size:bytes.length};
    },{fps:FPS,bitrate:format.bitrate});
    // Bring the file back in base64 slices (page.evaluate results are JSON).
    const parts=[];for(let at=0;at<result.size;at+=6*1024*1024)parts.push(Buffer.from(await page.evaluate(([a,b])=>{let s='';const v=window.__video.subarray(a,b);for(let i=0;i<v.length;i+=32768)s+=String.fromCharCode(...v.subarray(i,i+32768));return btoa(s);},[at,at+6*1024*1024]),'base64'));
    const file=`dist/promo/Vela-${version}-promo-${format.w}x${format.h}.mp4`;await writeFile(file,Buffer.concat(parts));
    console.log(`${file}  ${(result.size/1048576).toFixed(1)} MB  ${result.mime}  ${result.frames} frames, ${result.late} late, ${((Date.now()-started)/1000).toFixed(0)} s`,errors.length?errors:'');
    await page.close();
  }
}finally{await browser.close();}
