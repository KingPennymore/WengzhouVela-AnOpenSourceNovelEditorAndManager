import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||undefined});
const reports=[],errors=[];
const text=Array.from({length:3000},(_,i)=>i%100===0?`第${i/100+1}章 风起`:`　　林舟望着远处的灯塔，风吹过书页。这是第${i}段。`).join('\n');
const seed={version:1,activeId:null,openIds:['a','b','c'],settings:{theme:'light',autoNouns:false},folders:['小说'],documents:[...['a','b','c'].map(id=>({id,name:id+'.txt',path:'小说/'+id+'.txt',text,updatedAt:1})),{id:'config',name:'.vela',path:'小说/.vela',text:JSON.stringify({version:3,kind:'workspace',id:'novel',project:{name:'小说'}}),updatedAt:1}]};

try{
  for(const width of [1280,390])for(const cpu of [1,4]){
    const context=await browser.newContext({viewport:{width,height:850}});
    await context.addInitScript(seed=>{
      localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));
      window.animationProbe={writes:[],callbacks:[],longTasks:[],delay:0};
      const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='wenzhou.workspace'){
          const start=performance.now(),animating=document.querySelector('#app')?.dataset.sidebarsAnimating==='true';
          // A controlled slow synchronous storage bridge makes overlaps reproducible.
          if(animationProbe.delay){const end=start+animationProbe.delay;while(performance.now()<end){}}
          set.call(this,key,value);animationProbe.writes.push({start,duration:performance.now()-start,animating});return;
        }
        return set.call(this,key,value);
      };
      const raf=requestAnimationFrame;
      window.requestAnimationFrame=callback=>raf.call(window,now=>{
        const start=performance.now();try{callback(now);}finally{animationProbe.callbacks.push({name:callback.name,start,duration:performance.now()-start});}
      });
      if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
        for(const entry of list.getEntries())animationProbe.longTasks.push({start:entry.startTime,duration:entry.duration});
      }).observe({type:'longtask',buffered:true});
    },seed);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const client=await context.newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:cpu});
    await page.goto(server.url);await openRecentFile(page,page.locator('[data-recent=a]'));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).activeId==='a');
    await page.evaluate(async()=>{
      for(const id of ['b','c','a']){document.querySelector(`[data-tab=${id}]`).click();await new Promise(requestAnimationFrame);}
      window.wenzhouSave();await new Promise(resolve=>setTimeout(resolve,500));
      window.sampleAnimation=async run=>{
        const app=document.querySelector('#app'),start=performance.now(),gaps=[];
        let previous,active=true;
        const track=now=>{if(previous!==undefined)gaps.push(now-previous);previous=now;if(active)requestAnimationFrame(track);};
        requestAnimationFrame(track);await run();
        do{await new Promise(requestAnimationFrame);}while(app.dataset.sidebarsAnimating==='true');
        const end=performance.now();active=false;await new Promise(resolve=>setTimeout(resolve,150));
        const callbacks=animationProbe.callbacks.filter(item=>item.start>=start&&item.start<end),tasks=animationProbe.longTasks.filter(item=>item.start>=start&&item.start<end);
        return {duration:end-start,frames:gaps.length,maxFrameGap:Math.max(0,...gaps),gapsOver50:gaps.filter(gap=>gap>50).length,maxSidebarCallback:Math.max(0,...callbacks.filter(item=>item.name==='tick').map(item=>item.duration)),longTasks:tasks};
      };
    });
    const sidebar=await page.evaluate(()=>sampleAnimation(async()=>{document.querySelector('#mobile-library').click();}));
    const switching=await page.evaluate(()=>sampleAnimation(async()=>{
      window.switchClickDurations=[];
      document.querySelector('#mobile-library').click();
      for(const id of ['b','c','a']){await new Promise(requestAnimationFrame);const start=performance.now();document.querySelector(`[data-tab=${id}]`).click();switchClickDurations.push(performance.now()-start);}
    }));
    switching.clickDurations=await page.evaluate(()=>switchClickDurations);
    await page.emulateMedia({reducedMotion:'reduce'});
    const withoutMotion=await page.evaluate(()=>sampleAnimation(async()=>{
      window.switchClickDurations=[];
      for(const id of ['b','c','a']){await new Promise(requestAnimationFrame);const start=performance.now();document.querySelector(`[data-tab=${id}]`).click();switchClickDurations.push(performance.now()-start);}
    }));
    withoutMotion.clickDurations=await page.evaluate(()=>switchClickDurations);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,500)));
    const storage=await page.evaluate(async()=>{
      animationProbe.writes=[];animationProbe.delay=90;
      document.querySelector('[data-tab=b]').click();
      // Deliberately start another animation just before the metadata timer expires.
      await new Promise(resolve=>setTimeout(resolve,200));
      const metrics=await sampleAnimation(async()=>{document.querySelector('#outline-toggle').click();});
      await new Promise(resolve=>setTimeout(resolve,700));animationProbe.delay=0;
      return {metrics,writes:animationProbe.writes};
    });
    const contentSave=await page.evaluate(async()=>{
      animationProbe.writes=[];animationProbe.delay=90;
      velaEditorView.dispatch({changes:{from:0,insert:'自动保存验证\n'},userEvent:'input'});
      await new Promise(resolve=>setTimeout(resolve,1100));
      const metrics=await sampleAnimation(async()=>{document.querySelector('#outline-toggle').click();});
      await new Promise(resolve=>setTimeout(resolve,700));animationProbe.delay=0;
      const saved=JSON.parse(localStorage.getItem('wenzhou.workspace'));
      return {metrics,writes:animationProbe.writes,saved:saved.documents.find(doc=>doc.id==='b').text.startsWith('自动保存验证')};
    });
    reports.push({width,cpu,sidebar,switching,withoutMotion,storage,contentSave});
    console.log(JSON.stringify(reports.at(-1)));
    await context.close();
  }
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/animation-blocking.json',JSON.stringify({reports,errors},null,2));
  assert.deepEqual(errors,[]);
  for(const report of reports){
    assert.ok(report.sidebar.frames>=3,'sidebar must paint intermediate frames');
    assert.equal(report.storage.writes.filter(write=>write.animating).length,0,'deferred navigation save must not run during an animation');
    assert.ok(report.storage.writes.length>0,'deferred navigation must eventually be saved');
    assert.equal(report.contentSave.writes.filter(write=>write.animating).length,0,'background content save must not run during an animation');
    assert.equal(report.contentSave.saved,true,'edited content must eventually be saved');
  }
}finally{await browser.close();await server.close();}
