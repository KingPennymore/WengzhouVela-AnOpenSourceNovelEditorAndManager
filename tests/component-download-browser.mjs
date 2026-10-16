// In-app component download and app update, with the native `downloadComponent` / `downloadUpdate` bridge mocked.
// Covers success, ZIP SHA-256 failure, over-size, cancel, Gitee failure falling back to GitHub, the browser-preview
// fallback, the mobile Wi-Fi hint and the update dialog (HarmonyOS getting only the release page is a unit test). Real downloads on the three devices still need manual checks.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
const names={engine:['busytex.js','busytex.wasm','core.js','core.data','formats/pdflatex.fmt','formats/xelatex.fmt','licenses.json'],chinese:['vela-tex-cjk.zip']};
const contents=Object.fromEntries([...names.engine,...names.chinese].map(name=>[name,strToU8('test:'+name)]));
const files=Object.fromEntries(Object.entries(contents).map(([name,data])=>[name,{bytes:data.length,sha256:sha(data)}]));
const archive=group=>Buffer.from(zipSync(Object.fromEntries(names[group].map(name=>[name,[contents[name],{mtime:new Date('1980-01-01T00:00:00Z')}]]))));
const all=Buffer.from(zipSync(Object.fromEntries(Object.entries(contents).map(([name,data])=>[name,[data,{mtime:new Date('1980-01-01T00:00:00Z')}]]))));
const payloads={full:all,engine:archive('engine'),corrupt:Buffer.concat([all.subarray(0,-4),Buffer.from('xxxx')])};
const descriptor={format:1,version:'0.1.1',id:'test-tex-'+sha(JSON.stringify(files)).slice(0,12),builtin:false,files,groups:names,
  downloads:{tag:'tex-0.1.1',package:{name:'Vela-TeX-0.1.1.zip',bytes:payloads.full.length,sha256:sha(payloads.full)}}};
const hex=c=>c.repeat(64);
const githubReleases=[{tag_name:'tex-0.1.1',assets:[]},{tag_name:'v0.9.8',name:'Vela 0.9.8',body:'更新说明',assets:[
  {name:'Vela-Ebook-Reader-1.2.0.zip',size:100*1024*1024,digest:'sha256:'+hex('c')},
  {name:'Vela-0.9.8-windows-lite-setup-x64.exe',size:120*1024*1024,digest:'sha256:'+hex('a')},
  {name:'Vela-0.9.8-android.1-lite-release-signed.apk',size:6*1024*1024,digest:'sha256:'+hex('b')}]}];
const workspace={version:1,documents:[{id:'doc',name:'a.txt',path:'a.txt',text:'正文',updatedAt:1}],settings:{theme:'light',updateChecks:false},activeId:'doc',openIds:['doc']};

const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,...(process.env.WENZHOU_CHROME?{executablePath:process.env.WENZHOU_CHROME}:{})});
let failed=0;
const check=async(name,run)=>{try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,'\n',error);}};

/** One page with a mocked native bridge. `scenario` maps "<host>:<file>" to ok | fail | corrupt | hang. */
async function nativePage({platform='windows',scenario={},installed=[]}={}){
  const context=await browser.newContext({viewport:{width:1200,height:860}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  await page.route('**/tex/components.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(descriptor)}));
  await page.route('**/imports/*',route=>{const token=new URL(route.request().url()).pathname.split('/').pop(),body=payloads[token.split('-')[0]];return body?route.fulfill({status:200,contentType:'application/zip',body}):route.fulfill({status:404,body:''});});
  await context.addInitScript(({workspace,platform,scenario,installed,sizes,githubReleases})=>{
    let stored=JSON.stringify(workspace),plugins=installed.length?JSON.stringify(installed):'';
    const mock=window.__mock={calls:[],cancelled:[],installed:[]};
    const ok=value=>JSON.stringify({ok:true,value}),fail=error=>JSON.stringify({ok:false,error});
    const progress=(id,received,total)=>window.dispatchEvent(new CustomEvent('wenzhouDownload',{detail:{id,received,total}}));
    window.WenzhouNative={platform,readWorkspace:()=>stored,writeWorkspace:value=>{stored=value;return 'ok';},readPlugins:()=>plugins,writePlugins:value=>{plugins=value;return 'ok';},
      readEnvironment:()=>JSON.stringify({platform,version:'0.9.7',dark:false,top:0,bottom:0,left:0,right:0}),
      call:async(operation,json)=>{
        const data=JSON.parse(json||'{}');
        if(operation==='initializeStorage')return ok({storage:{id:'',needsSetup:false},documents:[],folders:[],entries:[]});
        if(operation==='publicApi')return ok(data.provider==='gitee'?{status:200,body:[{tag_name:'tex-0.1.1',assets:[]}]}:{status:200,body:githubReleases});
        if(operation==='downloadComponent'||operation==='downloadUpdate'){
          const url=new URL(data.url),host=url.hostname,file=url.pathname.split('/').pop(),mode=scenario[host+':'+file]||scenario[file]||'ok';
          mock.calls.push({operation,host,file});
          if(mode==='fail')return fail('无法连接下载服务器，请检查网络后重试。');
          if(mode==='hang'){for(let i=1;i<=50;i++){if(mock.cancelled.includes(data.id))return fail('下载已取消。');progress(data.id,i*1024,data.size);await new Promise(resolve=>setTimeout(resolve,100));}return fail('超时');}
          if(operation==='downloadUpdate'){progress(data.id,data.size/2,data.size);progress(data.id,data.size,data.size);return ok({token:'update-token',size:data.size,sha256:data.sha256,name:data.name});}
          const kind=mode==='corrupt'?'corrupt':'full',token=kind+'-'+Math.random().toString(16).slice(2);
          progress(data.id,Math.floor(sizes[kind]/2),data.size);
          return ok({name:data.name,size:sizes[kind],importToken:token,url:location.origin+'/imports/'+token});
        }
        if(operation==='cancelDownload'){mock.cancelled.push(data.id);return ok(true);}
        if(operation==='installUpdate'){mock.installed.push(data.token);return ok(true);}
        if(operation==='api')return ok({status:401,body:{}});
        return ok(true);
      }};
  },{workspace,platform,scenario,installed,sizes:Object.fromEntries(Object.entries(payloads).map(([key,value])=>[key,value.length])),githubReleases});
  await page.goto(server.url);await page.waitForSelector('#start-page:not([hidden]), #more-tools');await page.waitForTimeout(300);
  if(await page.locator('#start-page').isVisible())await openRecentFile(page,page.locator('[data-recent=doc]'));
  return {page,context,errors};
}
const openPlugins=async page=>{await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.locator('#component-downloads h3').waitFor();};
const downloadCard=page=>page.locator('[data-download-card="tex"]');
const installedCard=(page,id)=>page.locator('.plugin-list .plugin-card').filter({hasText:id});

try{
  await check('Gitee failure falls back to GitHub, the ZIP is verified and the single TeX package installs',async()=>{
    const {page,context,errors}=await nativePage({scenario:{'gitee.com:Vela-TeX-0.1.1.zip':'fail'}});
    await openPlugins(page);
    const card=downloadCard(page);await card.getByText('未安装').waitFor();
    assert.match(await card.innerText(),/vela\.component\.tex · 0\.1\.1/);assert.match(await page.locator('#component-downloads').innerText(),/Gitee 镜像优先/);
    await card.locator('[data-download-start]').click();
    await installedCard(page,'vela.component.tex').waitFor({timeout:15000});
    const calls=await page.evaluate(()=>window.__mock.calls.filter(call=>call.file.endsWith('.zip')).map(call=>call.host));
    assert.deepEqual(calls,['gitee.com','github.com']);
    assert.match(await downloadCard(page).innerText(),/已安装/);assert.equal(await downloadCard(page).locator('[data-download-start]').count(),0);
    assert.deepEqual(errors,[]);await context.close();
  });
  await check('a Gitee download succeeds directly and replaces a legacy half install',async()=>{
    const {page,context}=await nativePage();await openPlugins(page);
    // An old engine-only ZIP still installs, as a legacy card that asks for the full package.
    await page.locator('#plugin-input').setInputFiles({name:'Vela-TeX-0.1.1-engine.zip',mimeType:'application/zip',buffer:payloads.engine});
    await installedCard(page,'vela.component.tex.engine').waitFor({timeout:15000});assert.match(await installedCard(page,'vela.component.tex.engine').innerText(),/旧版分包/);
    assert.match(await downloadCard(page).innerText(),/未安装/);
    await downloadCard(page).locator('[data-download-start]').click();
    await installedCard(page,'vela.component.tex').filter({hasNotText:'旧版分包'}).first().waitFor({timeout:15000});
    assert.equal(await page.locator('.plugin-list .plugin-card').filter({hasText:'旧版分包'}).count(),0,'The full package replaces the legacy card');
    assert.deepEqual(await page.evaluate(()=>window.__mock.calls.map(call=>call.host)),['gitee.com']);await context.close();
  });
  await check('a ZIP whose SHA-256 does not match is rejected on both mirrors and offers retry',async()=>{
    const {page,context}=await nativePage({scenario:{'Vela-TeX-0.1.1.zip':'corrupt'}});await openPlugins(page);
    await downloadCard(page).locator('[data-download-start]').click();
    const alert=downloadCard(page).locator('.error');await alert.waitFor();
    assert.match(await alert.innerText(),/Gitee：.*SHA-256.*GitHub：.*SHA-256/s);
    assert.equal(await downloadCard(page).locator('[data-download-start]').innerText(),'重试');
    assert.equal(await installedCard(page,'vela.component.tex').count(),0);await context.close();
  });
  await check('a component larger than 96 MiB is refused before anything is downloaded',async()=>{
    const {page,context}=await nativePage({installed:[{manifest:{id:'vela.component.ebook-reader',name:'电子书',version:'1.1.0',main:'main.js',vela:{type:'reader-component',api:'>=4 <5'}},enabled:false,files:{'main.js':'Ly8='}}]});
    await openPlugins(page);
    const card=page.locator('[data-download-card="plugin.ebook-reader"]');await card.waitFor({timeout:10000});
    assert.match(await card.innerText(),/100\.0 MB.*可更新到 1\.2\.0/s);
    await card.locator('[data-download-start]').click();
    await card.locator('.error').waitFor();assert.match(await card.locator('.error').innerText(),/超过 96\.0 MB 上限/);
    assert.equal(await page.evaluate(()=>window.__mock.calls.filter(call=>call.file.endsWith('.zip')).length),0);await context.close();
  });
  await check('cancelling stops the native download and keeps the component uninstalled',async()=>{
    const {page,context}=await nativePage({scenario:{'Vela-TeX-0.1.1.zip':'hang'}});await openPlugins(page);
    const card=downloadCard(page);await card.locator('[data-download-start]').click();
    await card.locator('progress').waitFor();await page.waitForFunction(()=>Number(document.querySelector('[data-download-card="tex"] progress')?.value)>0);
    await card.locator('[data-download-cancel]').click();
    await card.getByText('下载已取消。').waitFor();
    assert.equal(await page.evaluate(()=>window.__mock.cancelled.length),1);
    assert.equal(await page.evaluate(()=>window.__mock.calls.length),1,'Cancelling does not try the next mirror');
    assert.equal(await card.locator('[data-download-start]').count(),1);await context.close();
  });
  await check('progress survives closing and reopening the plugin manager',async()=>{
    const {page,context}=await nativePage({scenario:{'Vela-TeX-0.1.1.zip':'hang'}});await openPlugins(page);
    await downloadCard(page).locator('[data-download-start]').click();await downloadCard(page).locator('progress').waitFor();
    await page.locator('#dialog-cancel').click();await openPlugins(page);
    await downloadCard(page).locator('[data-download-cancel]').waitFor();await downloadCard(page).locator('[data-download-cancel]').click();
    await downloadCard(page).getByText('下载已取消。').waitFor();await context.close();
  });
  await check('phones show the Wi-Fi hint',async()=>{
    const {page,context}=await nativePage({platform:'android'});await openPlugins(page);
    assert.match(await page.locator('#component-downloads').innerText(),/建议在 Wi‑Fi 下下载/);await context.close();
  });
  await check('the browser preview hides download buttons and explains why',async()=>{
    const context=await browser.newContext({viewport:{width:1200,height:860}}),page=await context.newPage();
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.route('**/tex/components.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(descriptor)}));
    await context.addInitScript(workspace=>localStorage.setItem('wenzhou.workspace',JSON.stringify(workspace)),workspace);
    await page.goto(server.url);await openRecentFile(page,page.locator('[data-recent=doc]'));await openPlugins(page);
    await page.locator('[data-download-unavailable]').waitFor();assert.equal(await page.locator('[data-download-start]').count(),0);
    assert.match(await downloadCard(page).innerText(),/未安装/);assert.equal(await page.locator('#install-plugin').count(),1,'ZIP install stays available');
    await context.close();
  });
  await check('the update button finds the release on GitHub after Gitee, downloads the installer and starts it',async()=>{
    const {page,context}=await nativePage({platform:'android'});
    await page.locator('#more-tools').click();await page.locator('#check-update').click();
    await page.locator('#download-update').waitFor();
    const text=await page.locator('#dialog-body').innerText();assert.match(text,/v0\.9\.8/);assert.match(text,/GitHub/);assert.match(text,/Vela-0\.9\.8-android\.1-lite-release-signed\.apk/);assert.match(text,/Wi‑Fi/);
    await page.locator('#download-update').click();await page.locator('#install-update').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__mock.calls.map(call=>[call.operation,call.host])),[['downloadUpdate','gitee.com']]);
    await page.locator('#install-update').click();await page.waitForFunction(()=>window.__mock.installed.length===1);
    await context.close();
  });
}finally{await browser.close();await server.close();}
if(failed){console.error(failed+' failed');process.exit(1);}
