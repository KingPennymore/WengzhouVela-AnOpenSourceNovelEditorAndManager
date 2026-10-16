import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Decodes the soundtrack of a rendered MP4 in Chrome and prints its length and loudness (RMS, dBFS) per second.
// Usage: node scripts/promo/check-audio.mjs <file.mp4>
const file=process.argv[2];
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();await page.route('http://vela.local/**',route=>route.request().url().endsWith('.mp4')?route.fulfill({path:path.resolve(file),contentType:'video/mp4'}):route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('http://vela.local/');
const info=await page.evaluate(async url=>{const data=await (await fetch(url)).arrayBuffer(),ac=new OfflineAudioContext(2,48000,48000),buffer=await ac.decodeAudioData(data),ch=buffer.getChannelData(0),per=buffer.sampleRate,rows=[];
  for(let s=0;s*per<ch.length;s++){let sum=0,peak=0;const end=Math.min(ch.length,(s+1)*per);for(let i=s*per;i<end;i++){sum+=ch[i]*ch[i];peak=Math.max(peak,Math.abs(ch[i]));}rows.push([s,(20*Math.log10(Math.sqrt(sum/(end-s*per))+1e-9)).toFixed(1),peak.toFixed(2)]);}
  return {duration:buffer.duration,channels:buffer.numberOfChannels,rate:buffer.sampleRate,rows};},'http://vela.local/video.mp4');
console.log(`duration ${info.duration.toFixed(2)} s, ${info.channels} ch, ${info.rate} Hz`);console.log(info.rows.map(([s,db,p])=>`${String(s).padStart(2)}s ${db.padStart(6)} dB peak ${p}`).join('\n'));
await browser.close();
