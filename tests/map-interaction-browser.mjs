import {launchBrowser} from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {interactionSeed,exerciseMapInteraction} from './map-interaction-helper.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {noMotion} from './wait-helpers.mjs';
const server=await startSourceAppServer(),browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1280,height:850},hasTouch:true}),errors=[];await noMotion(context);await context.addInitScript(seed=>{localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},interactionSeed());const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await mkdir('test-results/map-interaction',{recursive:true});try{await p.goto(server.url+'/?ui=android');await p.waitForFunction(()=>window.velaReady);const result=await exerciseMapInteraction(p,{screenshot:name=>p.screenshot({path:'test-results/map-interaction/'+name+'.png'})});assert.deepEqual(errors,[]);console.log('PASS 元素选中、触摸旋转缩放、撤销重做、网格和地图详情',result);}catch(e){await p.screenshot({path:'test-results/map-interaction/failure.png'});console.log(errors);throw e;}finally{await browser.close();await server.close();}
