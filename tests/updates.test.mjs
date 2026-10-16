import test from 'node:test';import assert from 'node:assert/strict';import {compareVersions,checkUpdates,installerFor} from '../web/updates.mjs';import {windowBounds} from '../windows/window-state.mjs';
import {parseSums,releaseComponents,texDownloads,releaseUrl,releaseSources} from '../web/component-downloads.mjs';
const asset=(name,size=10,digest)=>({name,size,...(digest?{digest:'sha256:'+digest}:{})}),hex=c=>c.repeat(64);
test('updates compare numeric versions and accept only public stable release tags',async()=>{
  assert.equal(compareVersions('v0.8.0','0.7.1'),1);assert.equal(compareVersions('0.6.1.1','0.6.1'),1);assert.equal(compareVersions('0.8.0','0.8.0'),0);assert.equal(compareVersions('0.9.7-android.1','v0.9.7')>=0,true);
  const github=[{tag_name:'tex-0.1.1',assets:[]},{tag_name:'v0.9.9',prerelease:true,assets:[]},{tag_name:'v0.9.8',body:'notes',assets:[asset('Vela-0.9.8-windows-lite-setup-x64.exe',100,hex('a')),asset('Vela-0.9.8-android.1-lite-release-signed.apk',50,hex('b')),asset('Vela-Ebook-Reader-1.2.0.zip',20,hex('c'))]},{tag_name:'../outside',assets:[]}];
  const calls=[];const transport=async(op,payload)=>{calls.push(payload.provider);if(payload.provider==='gitee')return {status:200,body:[{tag_name:'tex-0.1.1',assets:[]}]};return {status:200,body:github};};
  const result=await checkUpdates(transport,'0.9.7',{platform:'windows',installed:new Map([['vela.component.ebook-reader','1.1.0']])});
  assert.deepEqual(calls,['gitee','github'],'Gitee is asked first; a mirror without app releases falls through to GitHub');
  assert.equal(result.available,true);assert.equal(result.version,'v0.9.8');assert.ok(result.url.endsWith('/releases/tag/v0.9.8'));
  assert.equal(result.installer.name,'Vela-0.9.8-windows-lite-setup-x64.exe');assert.equal(result.components[0].id,'vela.component.ebook-reader');assert.equal(result.components[0].version,'1.2.0');
  const harmony=await checkUpdates(transport,'0.9.7',{platform:'harmonyos'});assert.equal(harmony.installer,null);
  const current=await checkUpdates(transport,'0.9.8',{platform:'android'});assert.equal(current.available,false);
});
test('installers, checksum lists and component assets are recognised strictly',()=>{
  const assets=[{name:'Vela-0.9.8-windows-setup-x64.exe'},{name:'Vela-0.9.8-windows-lite-setup-x64.exe'},{name:'Vela-0.9.8-android.1-release-signed.apk'}];
  assert.equal(installerFor('windows',assets,{lite:true}).name,'Vela-0.9.8-windows-lite-setup-x64.exe');assert.equal(installerFor('windows',assets,{lite:false}).name,'Vela-0.9.8-windows-setup-x64.exe');assert.equal(installerFor('android',assets,{lite:true}).name,'Vela-0.9.8-android.1-release-signed.apk');assert.equal(installerFor('harmonyos',assets),null);
  const sums=parseSums(hex('a')+'  Vela-Ebook-Reader-1.1.0.zip\r\nbad line\n'+hex('b')+' *x.zip');assert.equal(sums.get('Vela-Ebook-Reader-1.1.0.zip'),hex('a'));assert.equal(sums.get('x.zip'),hex('b'));
  const components=releaseComponents({tag:'v0.9.7',assets:[{name:'Vela-Ebook-Reader-1.1.0.zip',bytes:2,sha256:hex('a')},{name:'Vela-TeX-0.1.1-engine.zip'},{name:'Vela-0.9.7-source.zip'},{name:'Vela-0.9.7-windows-lite-x64.zip'}]});
  assert.deepEqual(components.map(item=>item.id),['vela.component.ebook-reader']);
  const tex=texDownloads({version:'0.1.1',downloads:{tag:'tex-0.1.1',package:{name:'Vela-TeX-0.1.1.zip',bytes:5,sha256:hex('d')}}});assert.deepEqual(tex.map(item=>[item.id,item.name]),[['vela.component.tex','Vela-TeX-0.1.1.zip']]);
  assert.deepEqual(texDownloads({version:'0.1.1',downloads:{tag:'tex-0.1.1',package:{name:'../x',bytes:1,sha256:hex('e')}}}),[]);
  assert.equal(releaseUrl(releaseSources[0],'tex-0.1.1','a.zip'),'https://gitee.com/kingpennymore/wenzhou-vela-mirror-repository/releases/download/tex-0.1.1/a.zip');assert.throws(()=>releaseUrl(releaseSources[1],'tex-0.1.1','../a.zip'));
});
test('window restoration fits available DIP bounds after monitor removal and handles corrupt saved sizes',()=>{const displays=[{workArea:{x:0,y:0,width:960,height:680}}];assert.deepEqual(windowBounds({x:2500,y:100,width:1600,height:1000},displays),{x:0,y:0,width:960,height:680});assert.deepEqual(windowBounds({width:'bad',height:null},displays),{x:0,y:0,width:960,height:680});const second={workArea:{x:-1920,y:0,width:1920,height:1080}};assert.equal(windowBounds({x:-1800,y:50,width:1000,height:700},[...displays,second]).x,-1800);});
