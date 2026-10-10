import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
if(!process.env.WENZHOU_CHROME&&existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'))process.env.WENZHOU_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out='test-results/verify';await mkdir(out,{recursive:true});const results=[];let server;const lite=process.argv.includes('--lite');
async function run(name,args,env={}){
  const start=Date.now(),chunks=[];console.log('CHECK '+name);
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>chunks.push(chunk));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});await writeFile(`${out}/${name}.log`,Buffer.concat(chunks));results.push({name,passed:code===0,milliseconds:Date.now()-start});if(code!==0){process.stderr.write(Buffer.concat(chunks).toString().split('\n').slice(-45).join('\n'));throw Error(name+' 检查失败，详见 '+out+'/'+name+'.log');}console.log('PASS '+name);
}
try{
  await run('build',['scripts/build.mjs',...(lite?['--lite']:[])]);
  await run('build-integrity',['scripts/check-build.mjs']);
  const unit=(await readdir('tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name),writer=(await readdir('vendor/acode-writer/tests')).filter(name=>name.endsWith('.test.cjs')).map(name=>'vendor/acode-writer/tests/'+name);
  await run('unit',['--test',...unit,...writer]);
  server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,VELA_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览服务启动超时。')),15000);server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',()=>{clearTimeout(timer);reject(Error('预览服务提前退出。'));});let output='';server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/VELA_PREVIEW_URL=(http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const suites=['browser','features-browser','workspace-browser','file-manager-browser','sidebars-browser','studio-browser','editing-browser','reading-browser','reading-config-browser','double-reading-browser','reading-window-browser','ui-overhaul-browser','glossary-browser','bugfix-browser','gitee-browser','storyboard-sync-browser','improvements-browser','completion-layout-browser','mobile-shell-browser','mobile-status-browser','paragraph-indent-browser','storyboard-browser'];
  for(const suite of suites)await run(suite,['tests/'+suite+'.mjs'],{VELA_TEST_URL:url});
  for(const suite of ['start-page-browser','velaodt-browser','odf-component-browser'])await run(suite,['tests/'+suite+'.mjs']);
  await run(lite?'components-browser':'components-builtins-browser',[lite?'tests/components-browser.mjs':'tests/components-builtins-browser.mjs']);
  if(process.argv.includes('--tex'))await run(lite?'tex-lite-browser':'tex-browser',[lite?'tests/tex-lite-browser.mjs':'tests/tex-browser.mjs'],{VELA_TEST_URL:url});
  if(process.argv.includes('--windows'))await run('windows-browser',['tests/windows-browser.mjs'],{VELA_TEST_FLAVOR:lite?'lite':'full'});
}catch(error){console.error(error.message);process.exitCode=1;}finally{server?.kill();await writeFile(`${out}/results.json`,JSON.stringify({passed:!process.exitCode,checks:results},null,2));}
