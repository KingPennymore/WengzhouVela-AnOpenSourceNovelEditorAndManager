import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
if(!process.env.WENZHOU_CHROME&&existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'))process.env.WENZHOU_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
// Usage: node scripts/verify.mjs [--lite] [--tex] [--windows] [--jobs N] [--only a,b]
// Build and the integrity check run first; then unit tests and the browser suites run in a pool of N processes
// (default: CPU count, or VELA_VERIFY_JOBS). Every suite gets its own Chromium; the shared dist preview server is
// read-only and listens on a free port, and suites write to distinct test-results paths. A failing suite does not
// stop the others: its log, and the screenshots and page state captured by tests/verify-capture.mjs, are kept in
// test-results/verify/<suite>/.
const argument=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:undefined;};
const lite=process.argv.includes('--lite'),jobs=Math.max(1,Number(argument('--jobs')||process.env.VELA_VERIFY_JOBS||os.availableParallelism?.()||os.cpus().length)),only=argument('--only')?.split(',');
const out='test-results/verify',capture=pathToFileURL(path.join(root,'tests/verify-capture.mjs')).href;
const previous=(()=>{try{return Object.fromEntries(JSON.parse(readFileSync(out+'/results.json','utf8')).checks.map(check=>[check.name,check.milliseconds]));}catch{return {};}})();
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const results=[],started=Date.now();let server;
async function run(name,args,env={},{timeout=15*60000}={}){
  const start=Date.now(),chunks=[],artifacts=`${out}/${name}`;
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,VELA_VERIFY_ARTIFACTS:artifacts,...env},stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>chunks.push(chunk));
  const timer=setTimeout(()=>{chunks.push(Buffer.from(`\nverify: ${name} 超过 ${timeout/60000} 分钟，已终止\n`));child.kill();},timeout);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
  const passed=code===0,log=Buffer.concat(chunks);
  if(passed)await writeFile(`${out}/${name}.log`,log);else{await mkdir(artifacts,{recursive:true});await writeFile(`${artifacts}/output.log`,log);}
  results.push({name,passed,milliseconds:Date.now()-start});
  console.log(`${passed?'PASS':'FAIL'} ${name} (${((Date.now()-start)/1000).toFixed(1)} s)`);
  if(!passed)process.stderr.write(`---- ${name} ----\n`+log.toString().split('\n').slice(-45).join('\n')+`\n---- 详见 ${artifacts}/ ----\n`);
  return passed;
}
async function pool(tasks){
  // Longest first (by the previous run's durations), so a slow suite does not start last.
  const queue=[...tasks].sort((a,b)=>(previous[b.name]??6e4)-(previous[a.name]??6e4));
  await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{for(let task;task=queue.shift();)await run(task.name,task.args,task.env);}));
}
try{
  if(!await run('core',['scripts/check-core.mjs']))throw Error('核心代码检查失败，未运行构建与测试');
  if(!await run('build',['scripts/build.mjs',...(lite?['--lite']:[])])||!await run('build-integrity',['scripts/check-build.mjs']))throw Error('构建失败，未运行测试');
  const unit=(await readdir('tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name),writer=(await readdir('vendor/acode-writer/tests')).filter(name=>name.endsWith('.test.cjs')).map(name=>'vendor/acode-writer/tests/'+name);
  server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,VELA_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览服务启动超时。')),15000);server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',()=>{clearTimeout(timer);reject(Error('预览服务提前退出。'));});let output='';server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/VELA_PREVIEW_URL=(http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const suites=['app-core-chrome-motion-browser','gutter-browser','app-core-editor-chrome-browser','app-core-fonts-browser','app-core-browser','ebook-studio-browser','map-info-choices-browser','startup-content-browser','mobile-startup-regressions-browser','dialog-mobile-browser','toolbar-sidebars-browser','ui-refinement-browser','sidebar-views-map-browser','document-formats-browser','map-terrain-browser','github-sync-regressions-browser','sync-safety-browser','sync-workflow-browser','csv-tables-browser','repository-mobile-browser','editor-input-regressions-browser','large-planning-browser','outline-marker-cache-browser','planning-centering-browser','animation-blocking-browser','navigation-performance-browser','map-interaction-browser','landscape-browser','planning-refinement-browser','app-choices-browser','planning-usability-browser','planning-feedback-browser','planning-workflows-browser','planning-revision-browser','theme-performance-browser','planning-visual-browser','map-performance-browser','planning-browser','browser','features-browser','workspace-browser','file-manager-browser','sidebars-browser','studio-browser','editing-browser','reading-browser','reading-config-browser','double-reading-browser','reading-window-browser','ui-overhaul-browser','glossary-browser','bugfix-browser','gitee-browser','gitea-browser','storyboard-sync-browser','improvements-browser','completion-layout-browser','mobile-shell-browser','mobile-status-browser','paragraph-indent-browser','storyboard-browser','rich-text-browser','rich-text-formats-browser','epub-export-browser','preview-jump-browser','shell-layout-browser','vela-format-page-browser','selection-browser','fixes-0981-browser','lazy-chunks-browser','scroll-backgrounds-browser','component-download-browser','start-page-browser',lite?'components-browser':'components-builtins-browser'];
  if(process.argv.includes('--tex'))suites.push(lite?'tex-lite-browser':'tex-browser');
  const tasks=[{name:'unit',args:['--test',...unit,...writer]},...suites.map(suite=>({name:suite,args:['--import',capture,'tests/'+suite+'.mjs'],env:{VELA_TEST_URL:url}}))];
  // The Windows suite drives Electron and its own data directory; it runs alone after the pool.
  if(process.argv.includes('--windows'))for(const suite of ['csv-tables-windows','sync-safety-windows','gitea-windows','app-core-fonts-windows','windows-browser','planning-windows-browser','landscape-windows-browser','map-interaction-windows-browser'])tasks.push({name:suite,args:['tests/'+suite+'.mjs'],env:{VELA_TEST_FLAVOR:lite?'lite':'full'},alone:true});
  const selected=only?tasks.filter(task=>only.includes(task.name)):tasks;
  console.log(`并行度 ${jobs}，共 ${selected.length} 组检查`);
  await pool(selected.filter(task=>!task.alone));for(const task of selected.filter(task=>task.alone))await run(task.name,task.args,task.env);
  const failed=results.filter(result=>!result.passed);if(failed.length)throw Error(`${failed.length} 组检查失败：${failed.map(result=>result.name).join('、')}，详见 ${out}/<组名>/`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{
  server?.kill();const milliseconds=Date.now()-started;
  await writeFile(`${out}/results.json`,JSON.stringify({passed:!process.exitCode,jobs,milliseconds,checks:results},null,2));
  console.log(`verify ${process.exitCode?'失败':'通过'}，用时 ${(milliseconds/1000).toFixed(1)} s（并行度 ${jobs}）`);
}
