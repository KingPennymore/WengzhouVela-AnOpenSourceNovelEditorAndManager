import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {bundleIsCurrent,resourceDir} from './frontend-state.mjs';
import {readVersions,versionProblems} from './versions.mjs';

const json=path=>JSON.parse(readFileSync(path,'utf8'));
// Versions of the three apps and their mobile version code (scripts/versions.mjs).
const versions=readVersions(),problems=versionProblems(versions);assert.deepEqual(problems,[],'版本号不一致：'+problems.join('；'));
assert.ok(bundleIsCurrent(process.cwd()),'前端资源与源码或构建摘要不一致');
const version=json(resourceDir+'/version.json'),components=json(resourceDir+'/tex/components.json'),manifest=json(resourceDir+'/build-manifest.json');
assert.equal(version.version,versions.release);
assert.ok(['full','lite'].includes(version.flavor));
assert.equal(components.builtin,version.flavor==='full');
for(const name of ['map-simplify-worker.js','tex-component-worker.js','project-archive-worker.js','html-reader.js','tex/worker.js','tex/manifest.json','tex/components.json','pdf/pdf.worker.mjs'])assert.ok(manifest.outputs[name],'缺少必需资源：'+name);
// Code-split bundle: every module reachable from app.js (static and import()) is a recorded output, the lazy features
// are separate chunks, and the startup graph holds neither pdf.js nor KaTeX.
{
  assert.ok(gzipSync(readFileSync(resourceDir+'/app.js')).length<=227983+15*1024,'app.js 相对指定基线的 gzip 增量超过 15 KiB');
  const graph=new Map(),queue=['app.js'],load=file=>readFileSync(resourceDir+'/'+file,'utf8');
  while(queue.length){const file=queue.shift();if(graph.has(file))continue;assert.ok(manifest.outputs[file]&&existsSync(resourceDir+'/'+file),'缺少分包模块：'+file);const text=load(file),base=file.includes('/')?file.slice(0,file.lastIndexOf('/')+1):'';const edges=[];
    for(const match of text.matchAll(/(import\(|from|import)\s*["'](\.\.?\/[^"']+\.js)["']/g)){const target=new URL(match[2],'http://x/'+base).pathname.slice(1);edges.push({target,lazy:match[1]==='import('});queue.push(target);}graph.set(file,edges);}
  const startup=new Set(),walk=file=>{if(startup.has(file))return;startup.add(file);for(const edge of graph.get(file))if(!edge.lazy)walk(edge.target);};walk('app.js');
  for(const name of ['pdf-preview','katex','reader','epub-export','latex-editor','latex-language','outline-view','map-view','map-algorithm-view'])assert.ok([...graph.keys()].some(file=>new RegExp('^chunks/'+name+'-[A-Z0-9]+[.]js$').test(file)),'缺少按需加载模块：'+name);
  const eager=[...startup].map(load).join(String.fromCharCode(10));assert.ok(!eager.includes('GlobalWorkerOptions'),'pdf.js 不应在启动模块中');assert.ok(!eager.includes('KaTeX parse error'),'KaTeX 不应在启动模块中');
  assert.ok(readFileSync(resourceDir+'/index.html','utf8').includes('<script type="module" src="./app.js">'),'app.js 须以模块方式加载');
  console.log(`PASS 分包：启动 ${startup.size} 个模块，共 ${graph.size} 个模块`);
}
// Release signing (docs/RELEASE-SIGNING.md): the app embeds at least one public key and no test key.
{const {RELEASE_KEYS}=await import('../web/release-keys.mjs');assert.ok(RELEASE_KEYS.length>0,'没有内置发布签名公钥');const bundle=readdirSync(resourceDir+'/chunks').map(name=>readFileSync(resourceDir+'/chunks/'+name,'utf8')).join('')+readFileSync(resourceDir+'/app.js','utf8');assert.ok(!bundle.includes('vela-test-key'),'发布包含有测试签名密钥');}
for(const name of Object.keys(components.files))assert.equal(existsSync(resourceDir+'/tex/'+name),components.builtin,'组件内置状态不符：'+name);
console.log('PASS 三端版本、共享前端摘要及 '+version.flavor+' 组件清单一致');
