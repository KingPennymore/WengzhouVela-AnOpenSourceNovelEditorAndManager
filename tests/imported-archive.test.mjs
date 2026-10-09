import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {readImportedArchive} from '../web/imported-archive.mjs';
import {isTexComponentArchive} from '../web/tex-component.mjs';

test('native archive URLs transfer bytes and release on success, failure and rejection',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location;
 globalThis.location={href:'https://appassets.androidplatform.net/assets/web/index.html',origin:'https://appassets.androidplatform.net'};
 let reads=0,released=[];
 const result={url:'https://appassets.androidplatform.net/imports/qa',size:3,importToken:'qa'},release=async token=>released.push(token);
 try{
  globalThis.fetch=async()=>{reads++;return new Response(new Uint8Array([1,2,3]));};
  assert.deepEqual(await readImportedArchive(result,release),new Uint8Array([1,2,3]));
  await assert.rejects(readImportedArchive({...result,url:'https://other.example/imports/qa'},release),/地址或大小/);
  await assert.rejects(readImportedArchive({...result,size:64*1024*1024+1},release),/地址或大小/);
  assert.equal(reads,1);
  await assert.rejects(readImportedArchive({...result,size:4},release),/不完整/);
  globalThis.fetch=async()=>new Response(null,{status:404});
  await assert.rejects(readImportedArchive(result,release),/重新选择/);
  assert.deepEqual(released,['qa','qa','qa','qa','qa']);
  assert.deepEqual(await readImportedArchive({data:'AQID'}),new Uint8Array([1,2,3]));
  assert.equal(await readImportedArchive(null),null);
 }finally{globalThis.fetch=oldFetch;if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});

test('component routing inspects names without inflating large packs or relaxing ordinary plugin limits',()=>{
 const chinese=zipSync({'vela-tex-cjk.zip':new Uint8Array(17*1024*1024)});
 assert.equal(isTexComponentArchive(chinese),true);
 assert.equal(isTexComponentArchive(zipSync({'busytex.wasm':strToU8('fixture')})),true);
 assert.equal(isTexComponentArchive(zipSync({'plugin.json':strToU8('{}'),'main.js':strToU8('')})),false);
 assert.throws(()=>isTexComponentArchive(new Uint8Array([1,2,3])));
});
