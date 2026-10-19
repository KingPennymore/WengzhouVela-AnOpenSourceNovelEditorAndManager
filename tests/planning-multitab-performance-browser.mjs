import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {createOutline,outlineText} from '../web/outline.mjs';
import {createMap,mapText} from '../web/map.mjs';

const cases=[
  {name:'large-6-desktop',pairs:3,nodes:1000,cells:20000,width:1280,cpu:1},
  {name:'large-6-slow-cpu',pairs:3,nodes:1000,cells:20000,width:1280,cpu:4},
  {name:'large-6-phone-width',pairs:3,nodes:1000,cells:20000,width:390,cpu:1},
  {name:'heavy-10-desktop',pairs:5,nodes:3000,cells:50000,width:1280,cpu:1},
  {name:'limit-6-desktop',pairs:3,nodes:5000,cells:50000,width:1280,cpu:1},
  {name:'relations-6-desktop',pairs:3,nodes:1000,cells:20000,width:1280,cpu:1,mode:'relations'},
].filter(item=>!process.env.VELA_PLANNING_CASE||item.name===process.env.VELA_PLANNING_CASE);
assert.ok(cases.length,'VELA_PLANNING_CASE does not match a stress scenario');
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||undefined});
const results=[];
await mkdir('test-results/planning',{recursive:true});
const output=process.env.VELA_PLANNING_OUTPUT||'test-results/planning/multitab-performance.json';
const summary=list=>{
  const values=[...list].sort((a,b)=>a-b),at=p=>values[Math.min(values.length-1,Math.floor(values.length*p))]??0;
  return {count:values.length,median:at(.5),p95:at(.95),max:at(1)};
};

function fixture(spec){
  const documents=[{id:'guide',name:'操作指南.txt',path:'操作指南.txt',text:'规划文件压力测试。',updatedAt:1}],ids=[];
  for(let k=0;k<spec.pairs;k++){
    const outline=createOutline('大型剧情 '+k);outline.root='n0';outline.roots=['n0'];
    for(let i=0;i<spec.nodes;i++){
      const id='n'+i;outline.nodes[id]={title:`第${i}个情节节点`,summary:'人物在城市中相遇并改变故事走向。'.repeat(3),detail:'## 场景\n\n'+('人物的动机、冲突与后果将在后续章节展开。'.repeat(6)),status:'draft',tags:['主线','测试'],children:[]};
      if(i)outline.nodes['n'+Math.floor((i-1)/4)].children.push(id);
      if(i>1&&i%3===0)outline.edges.push({id:'e'+i,from:'n'+(i-2),to:id,label:'影响',style:'dashed'});
    }
    if(spec.mode==='relations'){
      outline.view='relations';outline.relations={nodes:Object.fromEntries(Object.entries(outline.nodes).map(([id,node])=>[id,{...node,children:[]}])),edges:[]};
      for(let i=0;i<spec.nodes;i++)for(let step=1;step<=4;step++)outline.relations.edges.push({id:`r${i}-${step}`,from:'n'+i,to:'n'+((i+step)%spec.nodes),label:'关系',style:'solid'});
      outline.nodes={};outline.edges=[];outline.root='';outline.roots=[];
    }
    const o={id:'o'+k,name:`大型剧情${k}.pcs`,path:`小说/大型剧情${k}.pcs`,text:outlineText(outline),updatedAt:1};
    const map=createMap('大型地图 '+k),columns=spec.cells===20000?200:250;
    map.grid.visible=true;
    for(let i=0;i<spec.cells;i++)map.cells[(i%columns-Math.floor(columns/2))+','+(Math.floor(i/columns)-Math.floor(spec.cells/columns/2))]={type:'draw'};
    map.markers=Array.from({length:250},(_,i)=>({id:'marker'+i,x:(i%25-12)*300,y:(Math.floor(i/25)-5)*300,name:'城镇'+i,note:'城镇介绍与关联剧情。'.repeat(8)}));
    map.symbols=Array.from({length:200},(_,i)=>({id:'symbol'+i,type:'unit.infantry',x:(i%20-10)*250,y:(Math.floor(i/20)-5)*250,label:'部队'+i,faction:'blue',echelon:'brigade'}));
    map.arrows=Array.from({length:100},(_,i)=>({id:'arrow'+i,path:[(i%50-25)+',0',(i%50-25)+',4'],style:'attack',width:2,color:'#a03030',curve:.3,label:'路线'+i}));
    // Map 0 exercises first-open fill generation. Others model already-saved fills.
    if(k)map.generated=[{id:'g-drawing-fill',algorithm:'drawing-fill',paths:[],regions:[{id:'land',color:'#8cba9a55',paths:[[[-6000,-5000],[6000,-5000],[6000,5000],[-6000,5000],[-6000,-5000]]]}]}];
    const m={id:'m'+k,name:`大型地图${k}.vlmp`,path:`小说/大型地图${k}.vlmp`,text:mapText(map),updatedAt:1};
    documents.push(o,m);ids.push(o.id,m.id);
  }
  documents.push({id:'config',name:'.vela',path:'小说/.vela',text:JSON.stringify({version:3,kind:'workspace',id:'performance',project:{name:'大型规划文件测试'}}),updatedAt:1});
  return {seed:{version:1,documents,activeId:'guide',openIds:['guide',...ids],folders:['小说'],settings:{theme:'light',autoNouns:false}},ids,files:documents.filter(doc=>ids.includes(doc.id)).map(doc=>({id:doc.id,name:doc.name,bytes:Buffer.byteLength(doc.text)}))};
}

async function memory(client){
  await client.send('HeapProfiler.collectGarbage');
  const heap=await client.send('Runtime.getHeapUsage'),dom=await client.send('Memory.getDOMCounters');
  return {jsHeapMiB:heap.usedSize/1048576,embedderHeapMiB:(heap.embedderHeapUsedSize||0)/1048576,...dom};
}

try{
 for(const spec of cases){
  console.log('START '+spec.name);
  const {seed,ids,files}=fixture(spec),data=JSON.stringify(seed);
  const result={...spec,files,totalTextMiB:files.reduce((sum,file)=>sum+file.bytes,0)/1048576,errors:[],switches:[],memory:{}};
  const context=await browser.newContext({viewport:{width:spec.width,height:850}}),page=await context.newPage();
  page.setDefaultTimeout(90000);page.on('pageerror',error=>result.errors.push(error.message));
  await context.addInitScript(data=>{
    // Large native workspaces exceed browser localStorage's quota. Keep only this
    // key in memory; app JSON serialization/validation remains in the timed path.
    let stored=data;const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    window.planningProbe={phase:'boot',callbacks:[],saves:[],longTasks:[],workerStarts:0,workerStops:0};
    Storage.prototype.getItem=function(key){return key==='wenzhou.workspace'?stored:get.call(this,key);};
    Storage.prototype.setItem=function(key,value){if(key==='wenzhou.workspace'){stored=String(value);planningProbe.saves.push({time:performance.now(),phase:planningProbe.phase});}else set.call(this,key,value);};
    const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf.call(window,time=>{
      const start=performance.now(),phase=planningProbe.phase;
      try{return callback(time);}finally{planningProbe.callbacks.push({phase,name:callback.name,start,duration:performance.now()-start});}
    });
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const entry of list.getEntries())planningProbe.longTasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});
    const WorkerClass=window.Worker;window.Worker=class extends WorkerClass{constructor(...args){super(...args);planningProbe.workerStarts++;}terminate(){planningProbe.workerStops++;super.terminate();}};
  },data);
  const client=await context.newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:spec.cpu});
  try{
    const boot=performance.now();await page.goto(server.url);await page.waitForFunction(()=>window.velaReady&&!!document.querySelector('.cm-editor'));
    result.startupMs=performance.now()-boot;await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,400)));
    result.memory.boot=await memory(client);
    const names=new Map(files.map(file=>[file.id,file.name]));
    const open=async(id,round)=>{
      const phase=`round${round}-${id}`;
      const initial=await page.evaluate(({id,phase})=>{
        planningProbe.phase=phase;window.planningOldRoot=document.querySelector('#preview').firstElementChild;
        const start=performance.now();document.querySelector(`[data-tab=${id}]`).click();return {start,handlerMs:performance.now()-start};
      },{id,phase});
      await page.waitForFunction(({id,name})=>document.querySelector('#current-name').textContent===name&&document.querySelector('#preview').firstElementChild!==window.planningOldRoot&&(id.startsWith('o')?!!document.querySelector('.outline-plane'):!!document.querySelector('.map-stage canvas')),{id,name:names.get(id)});
      const end=await page.evaluate(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const end=performance.now();window.planningOldRoot=null;
        return {end,domNodes:document.querySelector('#preview').querySelectorAll('*').length,cards:document.querySelectorAll('.outline-graph-card').length,canvas:document.querySelectorAll('#preview canvas').length,status:document.querySelector('#preview .planning-live')?.textContent||''};
      });
      const item={id,kind:id.startsWith('o')?'pcs':'vlmp',round,...initial,...end,readyMs:end.end-initial.start};
      result.switches.push(item);console.log(spec.name+' '+phase+' '+item.readyMs.toFixed(1)+' ms');
    };
    for(let round=0;round<3;round++){
      for(const id of ids)await open(id,round);
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,400)));
      result.memory['round'+round]=await memory(client);
    }
    result.mapInteractions=await page.evaluate(async()=>{
      const probe=async(fit,label)=>{
        planningProbe.phase='zoom-setup';
        if(!fit){const canvas=document.querySelector('.map-stage canvas'),r=canvas.getBoundingClientRect(),zoom=Number(canvas.dataset.zoom)||1;canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:Math.log(zoom)/.002,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
        planningProbe.phase=label;const start=performance.now(),gaps=[];let last;
        if(fit)document.querySelector('[data-map-fit]').click();
        for(let i=0;i<24;i++){
          const now=await new Promise(requestAnimationFrame);if(last!==undefined)gaps.push(now-last);last=now;
          if(!fit){const canvas=document.querySelector('.map-stage canvas'),r=canvas.getBoundingClientRect();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?8:-8,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true}));}

        }
        return {label,start,end:performance.now(),gaps,zoom:document.querySelector('canvas').dataset.zoom,paints:planningProbe.callbacks.filter(item=>item.phase===label&&item.name==='paint')};
      };
      const normal=await probe(false,'map-zoom');const full=await probe(true,'map-fit');return {normal,full};
    });
    const canvasBox=await page.locator('.map-stage canvas').boundingBox();
    await page.evaluate(()=>{planningProbe.phase='map-full-pan';});
    await page.mouse.move(canvasBox.x+20,canvasBox.y+20);await page.mouse.down();
    for(let i=1;i<=24;i++){await page.mouse.move(canvasBox.x+20+i*3,canvasBox.y+20+i);await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await page.mouse.up();
    result.mapInteractions.fullPan=await page.evaluate(()=>({paints:planningProbe.callbacks.filter(item=>item.phase==='map-full-pan'&&item.name==='paint')}));
    result.sidebar=await page.evaluate(async()=>{
      planningProbe.phase='sidebar';const gaps=[];let last;const start=performance.now();document.querySelector('#mobile-library').click();
      do{const now=await new Promise(requestAnimationFrame);if(last!==undefined)gaps.push(now-last);last=now;}while(document.querySelector('#app').dataset.sidebarsAnimating==='true');
      return {duration:performance.now()-start,gaps};
    });
    await page.evaluate(()=>{planningProbe.phase='leave-planning';document.querySelector('[data-tab=guide]').click();});
    await page.waitForFunction(()=>document.querySelector('#preview').hidden&&!document.querySelector('#editor').hidden);
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,500)));
    result.memory.returnToText=await memory(client);
    result.idle=await page.evaluate(async()=>{
      planningProbe.phase='idle';const start=performance.now();await new Promise(resolve=>setTimeout(resolve,600));
      return {duration:performance.now()-start,mapPaints:planningProbe.callbacks.filter(item=>item.phase==='idle'&&item.name==='paint').length,workerStarts:planningProbe.workerStarts,workerStops:planningProbe.workerStops};
    });
    await page.evaluate(ids=>{planningProbe.phase='close-tabs';for(const id of ids)document.querySelector(`[data-close=${id}]`)?.click();window.wenzhouSave();},ids);
    result.memory.closed=await memory(client);
    result.activity=await page.evaluate(()=>({longTasks:planningProbe.longTasks,saves:planningProbe.saves}));
    result.summaries={};
    for(const kind of ['pcs','vlmp'])for(const group of ['first','repeat']){
      const selected=result.switches.filter(item=>item.kind===kind&&(group==='first'?item.round===0:item.round>0));
      result.summaries[kind+'-'+group]={readyMs:summary(selected.map(item=>item.readyMs)),handlerMs:summary(selected.map(item=>item.handlerMs))};
    }
    assert.equal(result.idle.mapPaints,0,'leaving planning view must stop map painting');
    assert.deepEqual(result.errors,[]);
  }catch(error){result.failure=error.message;console.error('FAIL '+spec.name+': '+error.message);}
  finally{results.push(result);await writeFile(output,JSON.stringify({testedBaseCommit:'2b1382f',includesLocalCenteringChanges:true,includesOutlineMarkerCache:true,storage:'in-memory workspace key; JSON processing included; no real disk/native latency',results},null,2));await context.close();}
  console.log('DONE '+spec.name+' '+JSON.stringify(result.summaries||{}));
 }
}finally{await browser.close();await server.close();}
assert.ok(results.every(result=>!result.failure),JSON.stringify(results.filter(result=>result.failure).map(result=>({name:result.name,failure:result.failure}))));
