// Theme switches must not flash: screencast frames are reduced to a 24×24 luminance grid and every cell has to move
// monotonically from its start to its end value (within JPEG noise). The former per-element fade overshot by 70–90.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';
import {settled} from './wait-helpers.mjs';
const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[];
for(const [w,h] of [[1280,850],[390,844]]){
  const context=await browser.newContext({viewport:{width:w,height:h}});
  await context.addInitScript(()=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'b',name:'正文.txt',text:'第一章\n\n'+'林舟望着远处的灯塔，风吹过海岸。\n\n'.repeat(40),updatedAt:1}],activeId:null,openIds:[],settings:{theme:'light'}})));
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);await openRecentFile(p,p.locator('[data-recent=b]'));await settled(p);
  for(const direction of ['light→dark','dark→light']){
    const cdp=await context.newCDPSession(p),frames=[];
    cdp.on('Page.screencastFrame',async f=>{frames.push(f.data);await cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,everyNthFrame:1});await p.waitForTimeout(250);
    await p.evaluate(()=>document.querySelector('#theme').click());await p.waitForTimeout(700);
    await cdp.send('Page.stopScreencast');await cdp.detach();
    const result=await p.evaluate(async frames=>{
      const N=24,grids=[];
      for(const data of frames){const img=new Image();img.src='data:image/jpeg;base64,'+data;await img.decode();const c=new OffscreenCanvas(N,N),x=c.getContext('2d');x.drawImage(img,0,0,N,N);const d=x.getImageData(0,0,N,N).data,g=[];for(let i=0;i<d.length;i+=4)g.push(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);grids.push(g);}
      // A cell flickers when it overshoots its start→end range or reverses direction by more than JPEG noise.
      let worst=0,where=-1;const tol=6;
      for(let k=0;k<N*N;k++){const s=grids.map(g=>g[k]),a=s[0],b=s[s.length-1],lo=Math.min(a,b)-tol,hi=Math.max(a,b)+tol;let dev=0;for(const v of s)dev=Math.max(dev,lo-v,v-hi);
        const sign=Math.sign(b-a);for(let i=1;i<s.length;i++){const step=(s[i]-s[i-1])*sign;if(step<-tol)dev=Math.max(dev,-step);}if(dev>worst){worst=dev;where=k;}}
      return {frames:grids.length,worst:Math.round(worst),cell:where<0?null:[where%N,Math.floor(where/N)]};
    },frames);
    assert.ok(result.frames>=8,`${w}x${h} ${direction}: too few frames`);assert.ok(result.worst<=20,`${w}x${h} ${direction}: cell ${result.cell} overshoots by ${result.worst}`);
    console.log(`PASS ${w}x${h} ${direction} 无闪烁:`,JSON.stringify(result));
    await settled(p);
  }
  await context.close();
}
try{assert.deepEqual(errors,[]);}finally{await browser.close();await server.close();}
