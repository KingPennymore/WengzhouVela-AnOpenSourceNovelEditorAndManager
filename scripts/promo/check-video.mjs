import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Opens a rendered MP4 in Chrome, reports duration and size, and saves the decoded frames at the given times.
// Usage: node scripts/promo/check-video.mjs <file.mp4> <out-prefix> [t1,t2,...]   → <out-prefix>-<t>.png
const [file,prefix,list='3,13.4,23.6,31.6,37.5']=process.argv.slice(2),times=list.split(',').map(Number);
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:960,height:960}});
await page.goto(pathToFileURL(path.resolve(file)).href);await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
const info=await page.evaluate(()=>{const v=document.querySelector('video');v.pause();v.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000';return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};});
for(const t of times){await page.evaluate(t=>new Promise(r=>{const v=document.querySelector('video');v.onseeked=()=>r();v.currentTime=t;}),t);await page.waitForTimeout(150);await page.screenshot({path:`${prefix}-${t}.png`});}
console.log(JSON.stringify(info));await browser.close();
