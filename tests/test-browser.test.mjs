import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const runner=fileURLToPath(new URL('../scripts/test-browser.mjs',import.meta.url));
async function fixture(fn){
  const root=await mkdtemp(path.join(os.tmpdir(),'vela-browser-runner-'));
  try{
    for(const folder of ['scripts','tests','dist/web'])await mkdir(path.join(root,folder),{recursive:true});
    await writeFile(path.join(root,'dist/web/version.json'),'{}');
    await writeFile(path.join(root,'scripts/serve.mjs'),"console.log('VELA_PREVIEW_URL=http://127.0.0.1:4191');setInterval(()=>{},1000);");
    const suite="import {appendFileSync} from 'node:fs';const event=phase=>appendFileSync('events.jsonl',JSON.stringify({name:process.argv[1].split(/[\\\\/]/).at(-1),phase,url:process.env.VELA_TEST_URL})+'\\n');event('start');await new Promise(r=>setTimeout(r,200));event('end');";
    for(const name of ['alpha','beta','gamma','selection'])await writeFile(path.join(root,'tests',name+'-browser.mjs'),suite);
    await fn(root);
  }finally{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    await rm(root,{recursive:true,force:true});
  }
}
async function run(root,args=[]){
  const env={...process.env};delete env.VELA_TEST_URL;
  const child=spawn(process.execPath,[runner,...args],{cwd:root,env});
  let output='';for(const stream of [child.stdout,child.stderr])stream.setEncoding('utf8').on('data',data=>output+=data);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  return {code,output};
}
test('browser runner bounds concurrency, isolates serial suites and forwards the server URL',()=>fixture(async root=>{
  // Synchronize workers instead of assuming all three Node processes start within
  // the fixture's 200 ms delay (not reliable under the full regression load).
  const concurrentSuite=`import {appendFileSync,readFileSync} from 'node:fs';
const event=phase=>appendFileSync('events.jsonl',JSON.stringify({name:process.argv[1].split(/[\\\\/]/).at(-1),phase,url:process.env.VELA_TEST_URL})+'\\n');
event('start');
const deadline=Date.now()+10000;
while(readFileSync('events.jsonl','utf8').trim().split('\\n').map(JSON.parse).filter(e=>e.phase==='start'&&e.name!=='selection-browser.mjs').length<3){
  if(Date.now()>deadline)throw Error('Three parallel suites did not start');
  await new Promise(resolve=>setTimeout(resolve,20));
}
event('end');`;
  for(const name of ['alpha','beta','gamma'])await writeFile(path.join(root,'tests',name+'-browser.mjs'),concurrentSuite);
  const result=await run(root);assert.equal(result.code,0,result.output);
  const events=(await readFile(path.join(root,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  let active=0,peak=0;
  for(const event of events){
    assert.equal(event.url,'http://127.0.0.1:4191');
    active+=event.phase==='start'?1:-1;peak=Math.max(peak,active);
    if(event.name==='selection-browser.mjs')assert.equal(active,event.phase==='start'?1:0);
  }
  assert.equal(peak,3);assert.equal(active,0);assert.match(result.output,/4\/4 browser suites passed/);
}));
test('browser runner keeps serial ordering and keyword filters',()=>fixture(async root=>{
  const result=await run(root,['--jobs','1','alpha','beta']);assert.equal(result.code,0,result.output);
  const events=(await readFile(path.join(root,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(({name,phase})=>[name,phase]),[['alpha-browser.mjs','start'],['alpha-browser.mjs','end'],['beta-browser.mjs','start'],['beta-browser.mjs','end']]);
}));
test('browser runner retains assertion details and continues after failure',()=>fixture(async root=>{
  await writeFile(path.join(root,'tests/alpha-browser.mjs'),"import assert from 'node:assert/strict';assert.equal('actual value','expected value','fixture assertion');");
  const result=await run(root,['--jobs=2','alpha','beta']);assert.equal(result.code,1);
  for(const pattern of [/fixture assertion/,/actual value/,/expected value/,/tests[\\/]alpha-browser\.mjs:1:/,/PASS beta-browser.mjs/,/1\/2 browser suites passed/])assert.match(result.output,pattern);
}));
test('browser runner rejects invalid job counts',()=>fixture(async root=>{
  for(const value of ['0','-1','1.5','nope','9007199254740992']){
    const result=await run(root,['--jobs',value]);assert.equal(result.code,1);assert.match(result.output,/--jobs must be a positive integer/);
  }
  assert.equal((await run(root,['--jobs'])).code,1);
}));
