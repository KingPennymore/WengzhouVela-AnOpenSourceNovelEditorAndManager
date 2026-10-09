import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {bundleIsCurrent,resourceDir} from './frontend-state.mjs';

const json=path=>JSON.parse(readFileSync(path,'utf8'));
const pkg=json('package.json'),harmony=json('AppScope/app.json5').app,windows=json('windows/package.json'),android=readFileSync('android/app/build.gradle','utf8');
assert.equal(harmony.versionName,pkg.harmonyVersion||pkg.version,'鸿蒙版本与根版本不一致');
assert.equal(windows.version,pkg.version,'Windows 版本与根版本不一致');
assert.equal(android.match(/versionName '([^']+)'/)[1].split('-android.')[0],harmony.versionName,'安卓版本与根版本不一致');
assert.equal(Number(android.match(/versionCode (\d+)/)[1]),harmony.versionCode,'移动版本代码不一致');
assert.ok(bundleIsCurrent(process.cwd()),'前端资源与源码或构建摘要不一致');
const version=json(resourceDir+'/version.json'),components=json(resourceDir+'/tex/components.json'),manifest=json(resourceDir+'/build-manifest.json');
assert.equal(version.version,harmony.versionName);
assert.ok(['full','lite'].includes(version.flavor));
assert.equal(components.builtin,version.flavor==='full');
for(const name of ['tex-component-worker.js','project-archive-worker.js','html-reader.js','tex/worker.js','tex/manifest.json','tex/components.json','pdf/pdf.worker.mjs'])assert.ok(manifest.outputs[name],'缺少必需资源：'+name);
for(const name of Object.keys(components.files))assert.equal(existsSync(resourceDir+'/tex/'+name),components.builtin,'组件内置状态不符：'+name);
console.log('PASS 三端版本、共享前端摘要及 '+version.flavor+' 组件清单一致');
