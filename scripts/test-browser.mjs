// Runs every tests/*-browser.mjs against the current dist/web build and prints one summary.
// `node scripts/test-browser.mjs --jobs 4 map csv` filters suites and runs up to four at a time (default three).
// Skipped: Android suites (they need the Wenzhou_QA_API36 emulator), lite-only suites unless dist/web is a lite
// build, and performance/stress suites.
import {spawn,spawnSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';

let jobs=3;
const filters=[],args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==='--jobs'||args[i].startsWith('--jobs=')){
    const value=args[i]==='--jobs'?args[++i]:args[i].slice(7);
    if(!/^[1-9]\d*$/.test(value||'')||!Number.isSafeInteger(Number(value)))throw Error('--jobs must be a positive integer');
    jobs=Number(value);
  }else if(args[i].startsWith('--'))throw Error('Unknown option: '+args[i]);
  else filters.push(args[i]);
}
const lite=JSON.parse(readFileSync('dist/web/version.json','utf8')).flavor==='lite';
const liteOnly=new Set(['components-browser.mjs','tex-lite-browser.mjs']);
// Other suites use ephemeral ports and distinct artifact filenames; shared directories alone do not conflict.
const serialOnly=new Set([
  'selection-browser.mjs', // Run timing budgets first; observed 6.75 ms/update against the 6 ms limit after the batch.
  'animation-blocking-browser.mjs', // CPU throttling, frame counts and deferred-save timing.
  'app-core-chrome-motion-browser.mjs', // Inspects running animations across separate browser calls.
  'csv-tables-browser.mjs', // Reader wheel/scroll wait timed out under concurrent load.
  'css-refactor-equivalence-browser.mjs', // Runs profile sweeps concurrently internally; external load nearly hit the 600 s timeout.
  'ebook-studio-browser.mjs', // Rewrites the shared dist/plugins/Vela-Ebook-Studio ZIP.
  'ebook-studio-visual-browser.mjs', // Rewrites the same shared ebook studio ZIP.
  'landscape-windows-browser.mjs', // Native Electron windows share desktop focus.
  'map-interaction-windows-browser.mjs', // Native Electron mouse, keyboard and window resizing.
  'mobile-startup-regressions-browser.mjs', // Counts intermediate drawer frames and times held startup requests.
  'planning-windows-browser.mjs', // Native Electron input and window capture.
  'project-plugins-browser.mjs', // Can launch Electron or control the fixed Android emulator via platform mode.
  'sidebars-browser.mjs', // Requires multiple visible animation frames and samples their geometry.
  'startup-content-browser.mjs', // Captures and pauses specific startup animation phases.
  'theme-flicker-browser.mjs', // Screencast frame counts and luminance depend on rendering cadence.
  'windows-browser.mjs', // Native Electron windows, dialogs and input.
]);
const files=readdirSync('tests').filter(name=>name.endsWith('-browser.mjs')
  &&!name.startsWith('android')
  &&!/performance|stress|benchmark/.test(name)
  &&liteOnly.has(name)===lite
  &&(!filters.length||filters.some(word=>name.includes(word))));

const started=Date.now(),failed=[],children=new Set();
function stop(child){
  if(child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});
  else child.kill('SIGKILL');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of children)stop(child);process.exit(signal==='SIGINT'?130:143);});
// Share one read-only dist server; source suites start their own ephemeral servers.
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:['ignore','pipe','inherit']});
children.add(server);
async function run(file){
  const started=Date.now(),child=spawn(process.execPath,['tests/'+file],{env,stdio:['ignore','pipe','pipe']});
  children.add(child);
  let stdout='',stderr='',error;
  child.stdout.setEncoding('utf8').on('data',data=>stdout+=data);
  child.stderr.setEncoding('utf8').on('data',data=>stderr+=data);
  const timer=setTimeout(()=>{error=new Error('Suite timed out after 600 s');stop(child);},600000);
  const code=await new Promise(resolve=>{child.on('error',err=>{error=err;});child.on('close',resolve);});
  clearTimeout(timer);children.delete(child);
  const ok=code===0&&!error;
  if(!ok)failed.push([file,[String(error||''),stderr.trim(),stdout.trim()].filter(Boolean).join('\n')]);
  console.log(`${ok?'PASS':'FAIL'} ${file} (${((Date.now()-started)/1000).toFixed(0)} s)`);
}
let env;
try{
  const url=await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('dist server startup timed out')),30000);
    const fail=error=>{clearTimeout(timer);reject(error);};
    server.on('error',fail);server.on('exit',code=>fail(new Error('dist server exited with '+code)));
    server.stdout.on('data',data=>{output+=data;const match=output.match(/VELA_PREVIEW_URL=(\S+)\r?\n/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  env={...process.env,VELA_TEST_URL:process.env.VELA_TEST_URL||url};
  console.log(`Running ${files.length} browser suites with ${jobs} job(s).`);
  if(jobs===1){for(const file of files)await run(file);}
  else{
    for(const file of [...serialOnly].filter(file=>files.includes(file)))await run(file);
    const queue=files.filter(file=>!serialOnly.has(file));
    await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{while(queue.length)await run(queue.shift());}));
  }
}finally{for(const child of children)stop(child);}
console.log(`\n${files.length-failed.length}/${files.length} browser suites passed (${lite?'lite':'full'} build, ${((Date.now()-started)/1000).toFixed(1)} s).`);
for(const [file,output] of failed)console.log(`\nFAIL ${file}\n${output}`);
process.exitCode=failed.length?1:0;
