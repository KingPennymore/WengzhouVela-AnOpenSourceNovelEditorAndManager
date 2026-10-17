import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {relative} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const options={entryPoints:['web/app.js'],bundle:true,write:false,format:'esm',splitting:true,outdir:'metrics',minify:true,target:'chrome105',legalComments:'eof',define:{__VELA_HARMONY_VERSION__:'"0.9.8.1"',__VELA_TEST_RELEASE_KEYS__:'[]'}};
const sizes=result=>result.outputFiles.filter(f=>/[\\/]app.js$|[\\/](outline-view|map-view)-/.test(f.path)).map(f=>({file:f.path.split(/[\\/]/).at(-1),bytes:f.contents.length,gzip:gzipSync(f.contents).length}));
const baseline=await build({...options,plugins:[{name:'baseline',setup(b){b.onLoad({filter:/[\\/]web[\\/].*\.(mjs|js)$/},({path})=>{const file=relative(process.cwd(),path).replaceAll('\\','/');return {contents:execFileSync('git',['show','827b094:'+file],{encoding:'utf8'}),loader:'js'};});}}]}),current=await build(options);
const result={baseline:sizes(baseline),current:sizes(current)};await mkdir('test-results/planning',{recursive:true});await writeFile('test-results/planning/sizes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
