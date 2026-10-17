import {signText,testKey} from './fixtures/release-test-key.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalog,catalogText,catalogBlocker,catalogStatus,loadCatalog} from '../web/component-catalog.mjs';
import {trustedAssets} from '../web/component-downloads.mjs';
import {verifySignature,unsignedRelease} from '../web/release-signing.mjs';
import {RELEASE_KEYS} from '../web/release-keys.mjs';

const entry=(extra={})=>({id:'vela.component.ebook-reader',kind:'plugin',title:'电子书阅读组件',version:'1.1.0',tag:'v0.9.8',name:'Vela-Ebook-Reader-1.1.0.zip',bytes:100,sha256:'a'.repeat(64),...extra});

test('the catalog keeps valid entries as download items and skips malformed ones',()=>{
  const {items,skipped}=parseCatalog(JSON.stringify({format:1,components:[entry(),entry({id:'vela.component.tex',kind:'tex',name:'Vela-TeX-0.1.2.zip',tag:'tex-0.1.2'}),entry({sha256:'x'}),entry({id:'vela.component.ebook-reader',version:'2.0.0'}),entry({id:'evil',name:'../a.zip'})]}));
  assert.deepEqual(items.map(item=>[item.key,item.kind,item.version]),[['plugin.ebook-reader','plugin','1.1.0'],['tex','tex','1.1.0']]);
  assert.equal(skipped,3,'bad hash, duplicate ID and unsafe name');
  assert.throws(()=>parseCatalog('{"format":2,"components":[]}'),/格式不受支持/);assert.throws(()=>parseCatalog('not json'),/JSON/);assert.throws(()=>parseCatalog('x'.repeat(300*1024)),/256 KB/);
});

test('blockers, install states and the generated text',()=>{
  assert.equal(catalogBlocker({minApp:'0.9.9'},{appVersion:'0.9.8'}),'需要文舟 0.9.9 或更新版本');assert.equal(catalogBlocker({minApp:'0.9.8'},{appVersion:'0.9.8-android.1'}),'');
  assert.equal(catalogBlocker({platforms:['windows']},{platform:'android'}),'此平台不可用');
  assert.deepEqual(['','1.0.0','1.1.0','1.2.0'].map(version=>catalogStatus({version:'1.1.0'},version)),['missing','update','current','newer']);
  const text=catalogText([entry(),entry({version:'1.2.0',name:'Vela-Ebook-Reader-1.2.0.zip'}),entry({id:'vela.component.tex',kind:'tex',note:'',minApp:null})],{updated:'2026-10-16T00:00:00Z'});
  const value=JSON.parse(text);assert.deepEqual(value.components.map(item=>[item.id,item.version]),[['vela.component.ebook-reader','1.2.0'],['vela.component.tex','1.1.0']]);
  assert.equal('note' in value.components[1]||'minApp' in value.components[1],false,'empty fields are left out');
});

// Signed manifests (docs/RELEASE-SIGNING.md). `files` maps "<host>:<file>" or "<file>" to its content; a missing entry
// is a 404 on that mirror.
function mirrors(files){
  const calls=[];
  const transport=async(operation,payload)=>{
    if(operation!=='downloadComponent')throw Error('unexpected '+operation);
    const url=new URL(payload.url),host=url.hostname,file=url.pathname.split('/').pop();calls.push(host+':'+file);
    const content=files[host+':'+file]??files[file];if(content===undefined)throw Error('HTTP 404');
    return {name:file,size:Buffer.byteLength(content),data:Buffer.from(content).toString('base64')};
  };
  return {transport,calls};
}
const memoryStorage=()=>{const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const catalog=catalogText([entry()],{updated:'2026-10-17T00:00:00Z'}),tampered=catalog.replace('a'.repeat(64),'b'.repeat(64));

test('a validly signed catalog is accepted from the Gitee mirror; the release key list is well formed',async()=>{
  memoryStorage();
  const {transport,calls}=mirrors({'catalog.json':catalog,'catalog.json.sig':signText(catalog)});
  const result=await loadCatalog(transport);assert.equal(result.signed,true);assert.equal(result.source,'Gitee');assert.equal(result.items[0].sha256,'a'.repeat(64));
  assert.deepEqual(calls,['gitee.com:catalog.json','gitee.com:catalog.json.sig']);
  assert.ok(RELEASE_KEYS.length>=1&&RELEASE_KEYS.every(key=>/^vela-[0-9a-f]{16}$/.test(key.id)&&/^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$/.test(key.spki)),'embedded keys are P-256 SPKI');
  assert.equal((await verifySignature(catalog,signText(catalog,{key:'vela-unknown'}))).valid,false,'unknown key id');
  assert.equal((await verifySignature(catalog,'not a signature')).reason,'签名文件格式无效');
});

test('a catalog whose hashes were changed after signing is refused on that mirror and taken from the next one',async()=>{
  memoryStorage();
  const sig=signText(catalog);
  let {transport}=mirrors({'gitee.com:catalog.json':tampered,'catalog.json':catalog,'catalog.json.sig':sig});
  const result=await loadCatalog(transport);assert.equal(result.source,'GitHub');assert.equal(result.signed,true);assert.equal(result.items[0].sha256,'a'.repeat(64));
  ({transport}=mirrors({'catalog.json':tampered,'catalog.json.sig':sig}));
  await assert.rejects(loadCatalog(transport),error=>error.code==='E_SIGNATURE'&&/Gitee：签名与内容不符.*GitHub：签名与内容不符/.test(error.message));
});

test('a missing signature: never from Gitee, the old unsigned catalog from GitHub only until a signed one was seen',async()=>{
  memoryStorage();
  let {transport}=mirrors({'gitee.com:catalog.json':tampered,'github.com:catalog.json':catalog});
  const legacy=await loadCatalog(transport);assert.equal(legacy.source,'GitHub');assert.equal(legacy.signed,false);assert.equal(legacy.items[0].sha256,'a'.repeat(64),'the Gitee copy without .sig is not used');
  ({transport}=mirrors({'gitee.com:catalog.json':catalog}));await assert.rejects(loadCatalog(transport),error=>error.code==='E_SIGNATURE','Gitee alone, unsigned');
  ({transport}=mirrors({'catalog.json':catalog,'catalog.json.sig':signText(catalog)}));assert.equal((await loadCatalog(transport)).signed,true);
  ({transport}=mirrors({'github.com:catalog.json':catalog}));await assert.rejects(loadCatalog(transport),error=>error.code==='E_SIGNATURE','after a signed catalog, an unsigned one is a downgrade');
});

test('release checksums: signed lists are required from 0.9.9 on, older releases trust GitHub only',async()=>{
  const release=(tag,source,assets)=>({tag,source,assets:assets.map(([name,sha256])=>({name,bytes:10,sha256}))});
  const sums=`${'c'.repeat(64)}  Vela-0.9.9-windows-setup-x64.exe\n`,file='SHA256SUMS-0.9.9.txt';
  const fresh=release('v0.9.9','Gitee',[['Vela-0.9.9-windows-setup-x64.exe','d'.repeat(64)],[file,null]]);
  let {transport}=mirrors({[file]:sums,[file+'.sig']:signText(sums)});
  let assets=await trustedAssets(transport,fresh);assert.equal(assets[0].sha256,'c'.repeat(64),'the signed list wins over the mirror API digest');assert.equal(assets[0].signed,true);
  ({transport}=mirrors({[file]:sums.replace('c'.repeat(64),'e'.repeat(64)),[file+'.sig']:signText(sums)}));await assert.rejects(trustedAssets(transport,fresh),error=>error.code==='E_SIGNATURE','changed hash');
  ({transport}=mirrors({[file]:sums}));await assert.rejects(trustedAssets(transport,fresh),error=>error.code==='E_SIGNATURE','missing signature');
  assert.equal(unsignedRelease('v0.9.8.1'),true);assert.equal(unsignedRelease('v0.9.8'),true);assert.equal(unsignedRelease('v0.9.9'),false);assert.equal(unsignedRelease('tex-0.1.1'),true);assert.equal(unsignedRelease('tex-0.1.2'),false);
  const old=[['Vela-0.9.8-windows-setup-x64.exe','f'.repeat(64)]];
  ({transport}=mirrors({}));
  assert.equal((await trustedAssets(transport,release('v0.9.8','Gitee',old)))[0].sha256,null,'Gitee API digests of an old release are not trusted');
  assets=await trustedAssets(transport,release('v0.9.8','GitHub',old),{needed:['Vela-0.9.8-windows-setup-x64.exe']});assert.equal(assets[0].sha256,'f'.repeat(64));assert.equal(assets[0].signed,false);
  assert.ok(testKey.id);
});
