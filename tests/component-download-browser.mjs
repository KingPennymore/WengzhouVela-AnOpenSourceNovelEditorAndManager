// In-app component download and app update, with the native `downloadComponent` / `downloadUpdate` bridge mocked.
// Covers success, ZIP SHA-256 failure, over-size, cancel, Gitee failure falling back to GitHub, the browser-preview
// fallback, the component catalog (newer TeX, updates, components needing a newer app), the mobile Wi-Fi hint and the update dialog (HarmonyOS getting only the release page is a unit test). Real downloads on the three devices still need manual checks.
// Signed manifests (docs/RELEASE-SIGNING.md): a valid signature, a hash changed after signing and a missing signature,
// for the catalog and for a release from after signing (v0.9.9). The page trusts a throwaway key passed to the bundle.
import {signText,testKey} from './fixtures/release-test-key.mjs';
import {chromium} from 'playwright';
import {build} from 'esbuild';
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
// The component catalog (release tag `catalog`); only pages opened with {catalog:true} can read it, others get 404 as
// before the catalog was published.
payloads.catalog=Buffer.from(JSON.stringify({format:1,updated:'2026-10-20T08:00:00Z',components:[
  {id:'vela.component.tex',kind:'tex',title:'LaTeX 排版组件',version:'0.1.2',tag:'tex-0.1.2',name:'Vela-TeX-0.1.2.zip',bytes:payloads.full.length,sha256:sha(payloads.full),minApp:'0.9.7'},
  {id:'vela.component.ebook-reader',kind:'plugin',title:'电子书阅读组件',version:'1.3.0',tag:'v0.9.9',name:'Vela-Ebook-Reader-1.3.0.zip',bytes:2*1024*1024,sha256:'d'.repeat(64),minApp:'0.9.7'},
  {id:'vela.component.future',kind:'plugin',title:'未来组件',version:'1.0.0',tag:'v9.0.0',name:'Vela-Future-1.0.0.zip',bytes:1024,sha256:'e'.repeat(64),minApp:'9.0.0'},
  {id:'bad id',kind:'plugin',title:'坏条目',version:'1',tag:'x',name:'x.zip',bytes:1,sha256:'f'}]}));
const catalogSignature=signText(payloads.catalog);
const descriptor={format:1,version:'0.1.1',id:'test-tex-'+sha(JSON.stringify(files)).slice(0,12),builtin:false,files,groups:names,
  downloads:{tag:'tex-0.1.1',package:{name:'Vela-TeX-0.1.1.zip',bytes:payloads.full.length,sha256:sha(payloads.full)}}};
const hex=c=>c.repeat(64);
const githubReleases=[{tag_name:'tex-0.1.1',assets:[]},{tag_name:'v0.9.8',name:'Vela 0.9.8',body:'更新说明',assets:[
  {name:'Vela-Ebook-Reader-1.2.0.zip',size:100*1024*1024,digest:'sha256:'+hex('c')},
  {name:'Vela-0.9.8-windows-lite-setup-x64.exe',size:120*1024*1024,digest:'sha256:'+hex('a')},
  {name:'Vela-0.9.8-android.1-lite-release-signed.apk',size:6*1024*1024,digest:'sha256:'+hex('b')}]}];
const workspace={version:1,documents:[{id:'doc',name:'a.txt',path:'a.txt',text:'正文',updatedAt:1}],settings:{theme:'light',updateChecks:false},activeId:'doc',openIds:['doc']};

process.env.VELA_TEST_RELEASE_KEYS=JSON.stringify([testKey]);
const server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,...(process.env.WENZHOU_CHROME?{executablePath:process.env.WENZHOU_CHROME}:{})});
let failed=0;
const check=async(name,run)=>{if(process.env.VELA_TEST_FILTER&&!name.includes(process.env.VELA_TEST_FILTER))return;try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,'\n',error);}};

/** One page with a mocked native bridge. `scenario` maps "<host>:<file>" to ok | fail | corrupt | hang. */
async function nativePage({platform='windows',scenario={},installed=[],catalog=false,texts={},releases=githubReleases}={}){
  // Small text assets (checksum lists, signatures, catalogs) by "<host>:<file>" or "<file>"; the signed catalog's .sig comes with catalog:true
  // and an empty string removes a file (404).
  const files=Object.fromEntries(Object.entries({...(catalog?{'catalog.json.sig':catalogSignature}:{}),...texts}).filter(([,text])=>text!=='').map(([key,text])=>[key,{data:Buffer.from(text).toString('base64'),size:Buffer.byteLength(text)}]));
  const context=await browser.newContext({viewport:{width:1200,height:860}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  await page.route('**/tex/components.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(descriptor)}));
  await page.route('**/imports/*',route=>{const token=new URL(route.request().url()).pathname.split('/').pop(),body=payloads[token.split('-')[0]];return body?route.fulfill({status:200,contentType:'application/zip',body}):route.fulfill({status:404,body:''});});
  await context.addInitScript(({workspace,platform,scenario,installed,sizes,githubReleases,catalog,files})=>{
    let stored=JSON.stringify(workspace),plugins=installed.length?JSON.stringify(installed):'';
    const mock=window.__mock={calls:[],cancelled:[],installed:[],catalog:[]};
    const ok=value=>JSON.stringify({ok:true,value}),fail=error=>JSON.stringify({ok:false,error});
    const progress=(id,received,total)=>window.dispatchEvent(new CustomEvent('wenzhouDownload',{detail:{id,received,total}}));
    window.WenzhouNative={platform,readWorkspace:()=>stored,writeWorkspace:value=>{stored=value;return 'ok';},readPlugins:()=>plugins,writePlugins:value=>{plugins=value;return 'ok';},
      readEnvironment:()=>JSON.stringify({platform,version:'0.9.7',dark:false,top:0,bottom:0,left:0,right:0}),
      call:async(operation,json)=>{
        const data=JSON.parse(json||'{}');
        if(operation==='initializeStorage')return ok({storage:{id:'',needsSetup:false},documents:[],folders:[],entries:[]});
        if(operation==='publicApi'&&mock.holdApi)await new Promise(resolve=>mock.releaseApi=resolve);
        if(operation==='publicApi')return ok(data.provider==='gitee'?{status:200,body:[{tag_name:'tex-0.1.1',assets:[]}]}:{status:200,body:githubReleases});
        if(operation==='downloadComponent'||operation==='downloadUpdate'){
          const url=new URL(data.url),host=url.hostname,file=url.pathname.split('/').pop(),mode=scenario[host+':'+file]||scenario[file]||'ok';
          const text=files[host+':'+file]||files[file];
          if(file==='catalog.json')mock.catalog.push(host);
          if(text){mock.texts=(mock.texts||[]).concat(host+':'+file);return ok({name:file,size:text.size,data:text.data});}
          if(file.endsWith('.sig')||/^SHA256SUMS-/.test(file))return fail('HTTP 404');
          if(file==='catalog.json'){if(!catalog)return fail('HTTP 404');const token='catalog-'+Math.random().toString(16).slice(2);return ok({name:file,size:sizes.catalog,importToken:token,url:location.origin+'/imports/'+token});}
          mock.calls.push({operation,host,file,sha256:data.sha256});
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
  },{workspace,platform,scenario,installed,sizes:Object.fromEntries(Object.entries(payloads).map(([key,value])=>[key,value.length])),githubReleases:releases,catalog,files});
  await page.goto(server.url);await page.waitForSelector('#start-page:not([hidden]), #more-tools');await page.waitForTimeout(300);
  if(await page.locator('#start-page').isVisible())await openRecentFile(page,page.locator('[data-recent=doc]'));
  return {page,context,errors};
}
const openPlugins=async page=>{await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.locator('#component-downloads h3').waitFor();};
const downloadCard=page=>page.locator('[data-download-card="tex"]');
const installedCard=(page,id)=>page.locator('.plugin-list .plugin-card').filter({hasText:id});

try{
  await check('review: a delayed update check cannot replace another dialog',async()=>{
    const {page,context}=await nativePage();
    await page.evaluate(()=>{window.__mock.holdApi=true;window.__updateResult=document.querySelector('#check-update').onclick();});
    await page.waitForFunction(()=>typeof window.__mock.releaseApi==='function');
    await page.locator('#dialog-cancel').click();await page.locator('#more-tools').click();await page.locator('#settings').click();
    await page.evaluate(()=>{window.__mock.holdApi=false;window.__mock.releaseApi();});await page.evaluate(()=>window.__updateResult);
    assert.equal(await page.locator('#dialog-title').textContent(),'编辑器设置');assert.equal(await page.locator('[name=fontSize]').count(),1);
    await context.close();
  });
  await check('review: download views release listeners when closed or completed',async()=>{
    const {page,context}=await nativePage();
    const bundle=await build({entryPoints:['web/component-download-view.mjs'],bundle:true,write:false,format:'iife',globalName:'DownloadReview',define:{__VELA_TEST_RELEASE_KEYS__:'[]'}});
    await page.route('**/__download-review.js',route=>route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
    await page.addScriptTag({url:server.url+'/__download-review.js'});
    const result=await page.evaluate(async()=>{
      const job={state:'running',listeners:new Set()},counts=[];DownloadReview._jobs.set('probe',job);
      const host={native:false,platform:'browser',descriptor:async()=>null,installed:async()=>new Map()};
      for(let i=0;i<4;i++){const root=document.createElement('div');document.body.append(root);const view=DownloadReview.mountComponentDownloads(root,host);counts.push(job.listeners.size);view.dispose();root.remove();counts.push(job.listeners.size);}
      const root=document.createElement('div');document.body.append(root);const view=DownloadReview.mountComponentDownloads(root,host);job.state='cancelled';for(const listener of [...job.listeners])listener();counts.push(job.listeners.size);view.dispose();root.remove();DownloadReview._jobs.delete('probe');return counts;
    });
    assert.deepEqual(result,[1,0,1,0,1,0,1,0,0]);await context.close();
  });
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
  await check('the catalog lists a newer TeX, marks updates and names components that need a newer app',async()=>{
    const {page,context,errors}=await nativePage({catalog:true,installed:[{manifest:{id:'vela.component.ebook-reader',name:'电子书',version:'1.1.0',main:'main.js',vela:{type:'reader-component',api:'>=4 <5'}},enabled:true,files:{'main.js':'Ly8='}}]});
    await openPlugins(page);const section=page.locator('#component-downloads');
    await page.locator('[data-download-card="plugin.future"]').waitFor({timeout:10000});
    assert.match(await downloadCard(page).innerText(),/vela\.component\.tex · 0\.1\.2/,'the catalog TeX is newer than the one this build knows');
    const ebook=page.locator('[data-download-card="plugin.ebook-reader"]');assert.match(await ebook.innerText(),/已安装 1\.1\.0，可更新到 1\.3\.0/);assert.equal(await ebook.locator('[data-download-start]').innerText(),'更新');
    const future=page.locator('[data-download-card="plugin.future"]');assert.match(await future.innerText(),/需要文舟 9\.0\.0 或更新版本/);assert.equal(await future.locator('[data-download-start]').count(),0);
    assert.match(await section.innerText(),/1 个可更新/);assert.match(await section.innerText(),/组件目录 · Gitee · 更新于 2026\/10\/20 · 1 项格式无效已跳过/);
    assert.deepEqual(await page.evaluate(()=>window.__mock.catalog),['gitee.com']);
    await section.locator('[data-download-refresh]').click();await page.waitForFunction(()=>window.__mock.catalog.length===2);await future.waitFor();
    assert.deepEqual(errors,[]);await context.close();
  });
  await check('without a catalog the components of the newest app release are listed, and the page says so',async()=>{
    const {page,context}=await nativePage();await openPlugins(page);
    await page.locator('[data-download-card="plugin.ebook-reader"]').waitFor({timeout:10000});
    assert.match(await page.locator('#component-downloads').innerText(),/暂时读不到组件目录，显示 v0\.9\.8 附带的组件 · GitHub/);
    assert.deepEqual(await page.evaluate(()=>window.__mock.catalog),['gitee.com','github.com']);await context.close();
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
  // Signed manifests.
  const origin=page=>page.locator('.download-origin').innerText();
  await check('a validly signed catalog is used from Gitee and marked as verified',async()=>{
    const {page,context,errors}=await nativePage({catalog:true});await openPlugins(page);await page.locator('[data-download-card="plugin.future"]').waitFor({timeout:10000});
    assert.match(await origin(page),/组件目录 · Gitee.*签名已验证/);assert.deepEqual(await page.evaluate(()=>window.__mock.texts),['gitee.com:catalog.json.sig']);assert.deepEqual(errors,[]);await context.close();
  });
  await check('a catalog whose hashes were changed after signing is refused; the signed GitHub copy is used',async()=>{
    const tampered=payloads.catalog.toString().replace(sha(payloads.full),'0'.repeat(64));
    const {page,context}=await nativePage({catalog:true,texts:{'gitee.com:catalog.json':tampered}});await openPlugins(page);await page.locator('[data-download-card="plugin.future"]').waitFor({timeout:10000});
    assert.match(await origin(page),/组件目录 · GitHub.*签名已验证/);assert.match(await downloadCard(page).innerText(),/vela\.component\.tex · 0\.1\.2/);await context.close();
  });
  await check('without signatures the old catalog is accepted from GitHub only, and refused once a signed one was seen',async()=>{
    let {page,context}=await nativePage({catalog:true,texts:{'catalog.json.sig':''}});await openPlugins(page);await page.locator('[data-download-card="plugin.future"]').waitFor({timeout:10000});
    assert.match(await origin(page),/组件目录 · GitHub.*发布签名前的旧清单，仅接受 GitHub/);await context.close();
    ({page,context}=await nativePage({catalog:true,texts:{'catalog.json.sig':''}}));await page.evaluate(()=>localStorage.setItem('vela.catalog.signed','1'));await openPlugins(page);
    await page.locator('[data-download-card="plugin.ebook-reader"]').waitFor({timeout:10000});assert.match(await origin(page),/暂时读不到组件目录，显示 v0\.9\.8 附带的组件/);
    assert.equal(await page.locator('[data-download-card="plugin.future"]').count(),0);await context.close();
  });
  const release099=[{tag_name:'v0.9.9',name:'Vela 0.9.9',body:'签名发布',assets:[{name:'Vela-0.9.9-windows-lite-setup-x64.exe',size:1024,digest:'sha256:'+hex('9')},{name:'SHA256SUMS-0.9.9.txt',size:100}]}];
  const sums099=hex('c')+'  Vela-0.9.9-windows-lite-setup-x64.exe\n';
  await check('a release after 0.9.9 installs with the hash of its signed checksum list, not the mirror digest',async()=>{
    const {page,context}=await nativePage({releases:release099,texts:{'SHA256SUMS-0.9.9.txt':sums099,'SHA256SUMS-0.9.9.txt.sig':signText(sums099)}});
    await page.locator('#more-tools').click();await page.locator('#check-update').click();await page.locator('#download-update').waitFor();
    assert.match(await page.locator('#dialog-body').innerText(),/发布清单签名已验证/);await page.locator('#download-update').click();await page.locator('#install-update').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__mock.calls.map(call=>call.sha256)),[hex('c')]);await context.close();
  });
  for(const [name,texts] of [['a changed hash',{'SHA256SUMS-0.9.9.txt':sums099.replace(hex('c'),hex('e')),'SHA256SUMS-0.9.9.txt.sig':signText(sums099)}],['a missing signature',{'SHA256SUMS-0.9.9.txt':sums099}]])
    await check(`a release after 0.9.9 with ${name} in its checksum list is not offered for installation`,async()=>{
      const {page,context}=await nativePage({releases:release099,texts});
      await page.locator('#more-tools').click();await page.locator('#check-update').click();
      await page.waitForFunction(()=>/无法验证 SHA256SUMS-0\.9\.9\.txt 的签名/.test(document.querySelector('#dialog-error')?.textContent||''));
      assert.equal(await page.locator('#download-update').count(),0);assert.deepEqual(await page.evaluate(()=>window.__mock.calls),[]);await context.close();
    });
}finally{await browser.close();await server.close();}
if(failed){console.error(failed+' failed');process.exit(1);}
