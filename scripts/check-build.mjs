import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {bundleIsCurrent,resourceDir} from './frontend-state.mjs';

const json=path=>JSON.parse(readFileSync(path,'utf8'));
const pkg=json('package.json'),harmony=json('AppScope/app.json5').app,windows=json('windows/package.json'),android=readFileSync('android/app/build.gradle','utf8');
assert.equal(harmony.versionName,pkg.harmonyVersion||pkg.version,'鸿蒙版本与根版本不一致');
assert.equal(windows.version,pkg.version,'Windows 版本与根版本不一致');
assert.equal(windows.velaVersion||windows.version,pkg.harmonyVersion||pkg.version,'Windows 显示版本与发布版本不一致');
// Mobile version codes since 0.9.8.1: ((major+1)*10000+minor*100+patch)*100+fourth part (0.9.8.1 -> 1090801, 0.9.9 -> 1090900).
{const [a,b,c,d=0]=harmony.versionName.split('.').map(Number);assert.equal(harmony.versionCode,(10000*(a+1)+100*b+c)*100+d,'移动版本代码与版本号不一致');}
assert.equal(android.match(/versionName '([^']+)'/)[1].split('-android.')[0],harmony.versionName,'安卓版本与根版本不一致');
assert.equal(Number(android.match(/versionCode (\d+)/)[1]),harmony.versionCode,'移动版本代码不一致');
assert.ok(bundleIsCurrent(process.cwd()),'前端资源与源码或构建摘要不一致');
const version=json(resourceDir+'/version.json'),components=json(resourceDir+'/tex/components.json'),manifest=json(resourceDir+'/build-manifest.json');
assert.equal(version.version,harmony.versionName);
assert.ok(['full','lite'].includes(version.flavor));
assert.equal(components.builtin,version.flavor==='full');
for(const name of ['tex-component-worker.js','project-archive-worker.js','html-reader.js','tex/worker.js','tex/manifest.json','tex/components.json','pdf/pdf.worker.mjs'])assert.ok(manifest.outputs[name],'缺少必需资源：'+name);
// Code-split bundle: every module reachable from app.js (static and import()) is a recorded output, the lazy features
// are separate chunks, and the startup graph holds neither pdf.js nor KaTeX.
{
  const graph=new Map(),queue=['app.js'],load=file=>readFileSync(resourceDir+'/'+file,'utf8');
  while(queue.length){const file=queue.shift();if(graph.has(file))continue;assert.ok(manifest.outputs[file]&&existsSync(resourceDir+'/'+file),'缺少分包模块：'+file);const text=load(file),base=file.includes('/')?file.slice(0,file.lastIndexOf('/')+1):'';const edges=[];
    for(const match of text.matchAll(/(import\(|from|import)\s*["'](\.\.?\/[^"']+\.js)["']/g)){const target=new URL(match[2],'http://x/'+base).pathname.slice(1);edges.push({target,lazy:match[1]==='import('});queue.push(target);}graph.set(file,edges);}
  const startup=new Set(),walk=file=>{if(startup.has(file))return;startup.add(file);for(const edge of graph.get(file))if(!edge.lazy)walk(edge.target);};walk('app.js');
  for(const name of ['pdf-preview','katex','reader','epub-export','latex-editor','latex-language'])assert.ok([...graph.keys()].some(file=>new RegExp('^chunks/'+name+'-[A-Z0-9]+[.]js$').test(file)),'缺少按需加载模块：'+name);
  const eager=[...startup].map(load).join(String.fromCharCode(10));assert.ok(!eager.includes('GlobalWorkerOptions'),'pdf.js 不应在启动模块中');assert.ok(!eager.includes('KaTeX parse error'),'KaTeX 不应在启动模块中');
  assert.ok(readFileSync(resourceDir+'/index.html','utf8').includes('<script type="module" src="./app.js">'),'app.js 须以模块方式加载');
  console.log(`PASS 分包：启动 ${startup.size} 个模块，共 ${graph.size} 个模块`);
}
// Release signing (docs/RELEASE-SIGNING.md): the app embeds at least one public key and no test key.
{const {RELEASE_KEYS}=await import('../web/release-keys.mjs');assert.ok(RELEASE_KEYS.length>0,'没有内置发布签名公钥');const bundle=readdirSync(resourceDir+'/chunks').map(name=>readFileSync(resourceDir+'/chunks/'+name,'utf8')).join('')+readFileSync(resourceDir+'/app.js','utf8');assert.ok(!bundle.includes('vela-test-key'),'发布包含有测试签名密钥');}
for(const name of Object.keys(components.files))assert.equal(existsSync(resourceDir+'/tex/'+name),components.builtin,'组件内置状态不符：'+name);
console.log('PASS 三端版本、共享前端摘要及 '+version.flavor+' 组件清单一致');
