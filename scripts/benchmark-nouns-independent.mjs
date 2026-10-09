import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {NounIndex} from '../web/noun-index.mjs';
const baselineSource=execFileSync('git',['show','c611b36:web/noun-index.mjs'],{encoding:'utf8'}).replace('../vendor/jieba/filter.mjs',pathToFileURL(path.resolve('vendor/jieba/filter.mjs')).href);
const {NounIndex:Baseline}=await import('data:text/javascript;base64,'+Buffer.from(baselineSource).toString('base64'));
const fixture=JSON.parse(await readFile('tests/fixtures/noun-independent.json','utf8'));
const gold=Object.values(fixture.entities).flat(),results={};
for(const [label,Type] of [['baseline',Baseline],['current',NounIndex]]){
  const index=new Type();index.put(1,fixture.text);const predicted=index.candidates().map(v=>v.label),found=gold.filter(n=>predicted.includes(n));
  results[label]={found:found.length,total:gold.length,candidates:predicted.length,recall:found.length/gold.length,precision:found.length/predicted.length,byKind:Object.fromEntries(Object.entries(fixture.entities).map(([k,items])=>[k,{found:items.filter(n=>predicted.includes(n)).length,total:items.length}])),missed:gold.filter(n=>!predicted.includes(n)),extra:predicted.filter(n=>!gold.includes(n))};
}
await mkdir('test-results/noun-benchmark',{recursive:true});await writeFile('test-results/noun-benchmark/independent.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
