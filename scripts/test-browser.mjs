// Runs every tests/*-browser.mjs against the current dist/web build and prints one summary.
// `node scripts/test-browser.mjs map csv` runs only the suites whose names contain one of the words.
// Skipped: Android suites (they need the Wenzhou_QA_API36 emulator), lite-only suites unless dist/web is a lite
// build, and performance/stress suites.
import {spawn,spawnSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';

const lite=JSON.parse(readFileSync('dist/web/version.json','utf8')).flavor==='lite';
const liteOnly=new Set(['components-browser.mjs','tex-lite-browser.mjs']);
const filters=process.argv.slice(2);
const files=readdirSync('tests').filter(name=>name.endsWith('-browser.mjs')
  &&!name.startsWith('android')
  &&!/performance|stress|benchmark/.test(name)
  &&liteOnly.has(name)===lite
  &&(!filters.length||filters.some(word=>name.includes(word))));

// Most suites read the dist build from 4173; the rest start their own servers.
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('VELA_PREVIEW_URL'))resolve();});server.on('exit',code=>reject(new Error('dist server exited with '+code)));});
const failed=[];
try{
  for(const file of files){
    const started=Date.now(),run=spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:600000});
    const seconds=((Date.now()-started)/1000).toFixed(0);
    if(run.status===0){console.log(`PASS ${file} (${seconds} s)`);continue;}
    const tail=(run.stderr||run.stdout||String(run.error)).split('\n').filter(line=>line.trim()&&!/^\s+at /.test(line)).slice(-4);
    failed.push([file,tail]);console.log(`FAIL ${file} (${seconds} s)`);
  }
}finally{server.kill();}
console.log(`\n${files.length-failed.length}/${files.length} browser suites passed (${lite?'lite':'full'} build).`);
for(const [file,tail] of failed)console.log(`\nFAIL ${file}\n  ${tail.join('\n  ')}`);
process.exitCode=failed.length?1:0;
