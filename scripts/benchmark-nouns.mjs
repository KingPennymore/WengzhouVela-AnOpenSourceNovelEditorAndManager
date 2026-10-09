import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {writeCorpus} from './noun-corpus.mjs';
const dir='test-results/noun-benchmark',seed=Number(process.argv[3])||20261009,unit=process.argv[4]||'characters';
let moduleURL=pathToFileURL(path.resolve(process.argv[2]||'web/noun-index.mjs')),source,baselineRevision;
if(process.argv[2]==='baseline'){
  baselineRevision='c611b36';
  source=execFileSync('git',['show',`${baselineRevision}:web/noun-index.mjs`],{encoding:'utf8'});
  const runnable=source.replace('../vendor/jieba/filter.mjs',pathToFileURL(path.resolve('vendor/jieba/filter.mjs')).href);
  moduleURL='data:text/javascript;base64,'+Buffer.from(runnable).toString('base64');
}else source=await readFile(moduleURL,'utf8');
const algorithmSha256=createHash('sha256').update(source).digest('hex');
const {NounIndex}=await import(moduleURL);
const {text,gold}=await writeCorpus(dir,seed,unit),index=new NounIndex();
for(const entity of gold.entities)for(const at of entity.occurrences)if(text.slice(at,at+entity.name.length)!==entity.name)throw new Error('Invalid gold offset: '+entity.name);
global.gc?.();const before=process.memoryUsage().heapUsed,t0=performance.now();
const blocks=[];let peak=before;
for(let from=0,id=1;from<text.length;from+=4096,id++){
  const start=Math.max(0,from-32),end=Math.min(text.length,from+4096+32);index.put(id,text.slice(start,end),from-start,Math.min(4096,text.length-from)+from-start);blocks.push(id);
  peak=Math.max(peak,process.memoryUsage().heapUsed);
}
const indexMs=performance.now()-t0,sortStart=performance.now(),candidates=index.candidates(),queryMs=performance.now()-sortStart;
global.gc?.();const retainedHeapMB=(process.memoryUsage().heapUsed-before)/1048576;
const predicted=new Set(candidates.map(c=>c.label)),truth=new Set(gold.entities.map(e=>e.name));
const found=gold.entities.filter(e=>predicted.has(e.name)),missed=gold.entities.filter(e=>!predicted.has(e.name)),extra=[...predicted].filter(x=>!truth.has(x));
const byKind=Object.fromEntries([...new Set(gold.entities.map(e=>e.kind))].map(k=>[k,{found:found.filter(e=>e.kind===k).length,total:gold.entities.filter(e=>e.kind===k).length}]));
const rare=gold.entities.filter(e=>e.occurrences.length===1);const changes=[];
for(let n=0;n<50;n++){const t=performance.now();index.put(10,text.slice(9*4096-32,10*4096+32)+'字',32,4128);index.candidates();changes.push(performance.now()-t);}
changes.sort((a,b)=>a-b);
const result={unit,hanLength:gold.hanLength,algorithmSha256,baselineRevision,cpu:os.cpus()[0].model,platform:os.platform(),node:process.version,gcMeasured:Boolean(global.gc),retainedHeapMB,seed,length:text.length,sha256:gold.sha256,uniqueSpecialNouns:truth.size,found:found.length,candidates:predicted.size,recall:found.length/truth.size,precision:found.length/predicted.size,byKind,singleOccurrence:{found:rare.filter(e=>predicted.has(e.name)).length,total:rare.length},indexMs,queryMs,incrementalP95Ms:changes[47],heapGrowthMB:(process.memoryUsage().heapUsed-before)/1048576,peakHeapGrowthMB:(peak-before)/1048576,terms:index.terms.size,missed:missed.map(e=>e.name),extra,candidateList:candidates};
await mkdir(dir,{recursive:true});const label=process.env.BENCH_LABEL||'current';await writeFile(`${dir}/${label}-${seed}${unit==='han'?'-han':''}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,missed:result.missed.slice(0,35),extra:extra.slice(0,35),candidateList:undefined},null,2));
