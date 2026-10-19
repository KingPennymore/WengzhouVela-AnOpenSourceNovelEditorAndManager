import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const compiled=await build({entryPoints:['web/platform.mjs'],bundle:true,write:false,platform:'node',format:'cjs'});
function fixture(saved=true){
 const calls=[],module={exports:{}};
 vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,Uint8Array,performance,TextEncoder,TextDecoder,btoa,window:{WenzhouNative:{async call(operation,json){calls.push({operation,...JSON.parse(json)});return JSON.stringify({ok:true,value:saved});}}}});
 return {api:module.exports,calls};
}
test('generic native export preserves MOBI bytes without routing them through ZIP validation',async()=>{
 const {api,calls}=fixture(),bytes=new Uint8Array([0,255,1,0,128]);
 assert.equal(await api.exportBinary('书籍.mobi',bytes,'application/x-mobipocket-ebook'),true);
 assert.equal(calls[0].operation,'exportBinary');assert.equal(calls[0].name,'书籍.mobi');assert.deepEqual(Buffer.from(calls[0].data,'base64'),Buffer.from(bytes));
});
test('existing EPUB/ODF, PNG and PDF exports retain their native format routes and cancellation',async()=>{
 const {api,calls}=fixture(false);
 for(const [mime,operation] of [['application/epub+zip','exportOdt'],['application/vnd.oasis.opendocument.text','exportOdt'],['image/png','exportPng'],['application/pdf','exportPdf']]){
  assert.equal(await api.exportBinary('book.bin',new Uint8Array([80,75,1,2,3]),mime),false);assert.equal(calls.at(-1).operation,operation);
 }
});
test('invalid binary export requests never open a native picker',async()=>{
 const {api,calls}=fixture();
 for(const [name,bytes] of [['../book.mobi',new Uint8Array([1])],['book.mobi',new Uint8Array()],['book.mobi',new Uint8Array(32*1024*1024+1)]])await assert.rejects(api.exportBinary(name,bytes,'application/octet-stream'),/无效/);
 assert.equal(calls.length,0);
});
