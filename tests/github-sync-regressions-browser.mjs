import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {startSourceAppServer} from './source-app-server.mjs';

// Exercise the production sync dialog with an isolated workspace, without a remote write.
const fixture=await build({stdin:{resolveDir:process.cwd(),contents:`
import {previewDownload} from './web/sync-download.mjs';
import {applyRepository} from './web/git-workspace.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let workspace,submit,applied,saves;
export function begin(seed,result){
 workspace=structuredClone(seed);applied=null;saves=0;document.querySelector('#sync-probe')?.remove();
 const form=document.createElement('form');form.id='sync-probe';form.style.cssText='position:fixed;inset:5%;overflow:auto;z-index:10000;background:var(--paper);padding:20px';document.body.append(form);
 previewDownload({workspace,result,folder:'Book',escape,checkpoint:()=>{},save:()=>{saves++;return true;},onApply:value=>{applied=value;applyRepository(workspace,value,'Book');},openModal:(_title,html,callback)=>{form.innerHTML=html;submit=callback;}});
}
export function mutate(change){const value=JSON.parse(workspace.documents[0].text);Object.assign(value,change);workspace.documents[0].text=JSON.stringify(value);}
export async function apply(){try{await submit(new FormData(document.querySelector('#sync-probe')));return {workspace,applied,saves};}catch(error){return {error:error.message,workspace,applied,saves};}}
`},bundle:true,format:'esm',write:false,target:'chrome105'});
const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||undefined});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];await page.addInitScript(()=>localStorage.setItem('vela.test.motion','off'));page.on('pageerror',error=>errors.push(error.message));
 let userCalls=0,rejected=false;
 await page.route('https://api.github.com/**',async route=>{
  const url=new URL(route.request().url());let body,status=200;
  if(url.pathname==='/user'){userCalls++;status=rejected?401:200;body=rejected?{message:'Bad credentials'}:{login:'writer',id:1};}
  else if(url.pathname==='/user/repos')body=[{name:'Book',full_name:'writer/Book',default_branch:'master',permissions:{push:true,admin:true}}];
  else throw Error('Unexpected remote request: '+url.pathname);
  await route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 });
 await page.route(server.url+'/sync-regression-fixture.js',route=>route.fulfill({contentType:'text/javascript',body:fixture.outputFiles[0].text}));
 await page.goto(server.url);await page.waitForFunction(()=>window.velaReady);
 for(let round=0;round<3;round++){
  if(await page.locator('#token-login').count()===0)await page.locator('[data-view=github]').click();await page.locator('#token-login').click();
  await page.locator('[name=token]').fill('github_pat_fixture_repeat');await page.locator('#dialog-submit').click();
  await page.locator('[data-repo="writer/Book"]').waitFor();
  await page.locator('#logout').click();await page.locator('#token-login').waitFor();
  if(round===1){await page.reload();await page.waitForFunction(()=>window.velaReady);}
 }
 assert.equal(userCalls,3);
 rejected=true;await page.locator('#token-login').click();await page.locator('[name=token]').fill('github_pat_fixture_repeat');await page.locator('#dialog-submit').click();
 await page.locator('#dialog-error').filter({hasText:'HTTP 401'}).waitFor();await page.locator('#dialog-cancel').click();
 assert.equal(await page.locator('#token-login').count(),1,'a rejected repeated token cannot sign in');
 console.log('PASS browser same-token login, logout/relogin, reload/relogin and revoked-token rejection');
 await page.evaluate(async()=>{window.syncRegression=await import('/sync-regression-fixture.js');});
 const config={version:3,kind:'workspace',id:'book',project:{name:'Book'},editor:{fontSize:18},reading:{items:[]}};
 const position=n=>({'正文.txt':{at:[n,0],head:'正文'}}),base=JSON.stringify(config),remote=JSON.stringify({...config,editor:{fontSize:20},positions:position(3)});
 const seed=local=>({documents:[{id:'config',name:'.vela',path:'Book/.vela',text:local,remote:{repo:'writer/Book',branch:'master',path:'.vela',lastSyncedText:base}}],openIds:[],repositories:[]});
 const result={repo:'writer/Book',branch:'master',commit:'next',folders:[],files:[{path:'.vela',text:remote,data:Buffer.from(remote).toString('base64'),sha:'new'}]};
 await page.evaluate(({seed,result})=>syncRegression.begin(seed,result),{seed:seed(JSON.stringify({...config,positions:position(8)})),result});
 assert.equal(await page.locator('#sync-probe [name=downloadFiles]').isChecked(),true);
 await page.evaluate(positions=>syncRegression.mutate({positions}),position(12));
 let applied=await page.evaluate(()=>syncRegression.apply());assert.equal(applied.error,undefined);
 let next=JSON.parse(applied.workspace.documents[0].text);assert.equal(next.editor.fontSize,20);assert.deepEqual(next.positions,position(12));
 assert.equal(applied.workspace.documents[0].remote.lastSyncedText,remote);
 assert.equal(Buffer.from(applied.applied.files[0].data,'base64').toString(),applied.workspace.documents[0].text);
 console.log('PASS .vela pull tolerates a position change after preview and retains remote baseline/actual write bytes');
 await page.evaluate(({seed,result})=>syncRegression.begin(seed,result),{seed:seed(JSON.stringify({...config,editor:{fontSize:18,wrap:false},positions:position(8)})),result});
 assert.match(await page.locator('#sync-probe').textContent(),/配置修改可自动合并/);
 applied=await page.evaluate(()=>syncRegression.apply());next=JSON.parse(applied.workspace.documents[0].text);assert.deepEqual(next.editor,{fontSize:20,wrap:false});
 await page.evaluate(({seed,result})=>syncRegression.begin(seed,result),{seed:seed(JSON.stringify({...config,positions:position(8)})),result});
 await page.evaluate(()=>syncRegression.mutate({editor:{fontSize:25}}));
 applied=await page.evaluate(()=>syncRegression.apply());assert.match(applied.error,/本地文稿已变化/);assert.equal(applied.applied,null);
 console.log('PASS disjoint configuration merge; genuine edits after preview still block writes');
 await page.evaluate(({seed,result})=>syncRegression.begin(seed,result),{seed:seed(JSON.stringify({...config,editor:{fontSize:22},positions:position(8)})),result});
 assert.equal(await page.locator('#sync-probe [name=downloadFiles]').isChecked(),false);
 await page.locator('#sync-probe [name=downloadFiles]').check();
 applied=await page.evaluate(()=>syncRegression.apply());assert.match(applied.error,/选择处理方式/);
 await page.locator('#sync-probe [data-resolution]').selectOption('local');
 applied=await page.evaluate(()=>syncRegression.apply());assert.equal(JSON.parse(applied.workspace.documents[0].text).editor.fontSize,22);assert.equal(applied.workspace.documents[0].remote.lastSyncedText,remote);
 console.log('PASS overlapping configuration edits require an explicit choice and retain local edits');
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
