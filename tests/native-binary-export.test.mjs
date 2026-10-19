import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const compiled=await build({entryPoints:['entry/src/main/ets/services/NativeBridge.ets'],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.ets':'ts'},resolveExtensions:['.ets','.js'],plugins:[{name:'native-transfer-fixture',setup(plugin){
 plugin.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));
 plugin.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:'module.exports=globalThis.sdk['+JSON.stringify(args.path)+'];'}));
}}]});
function fixture({cancelled=false,source=Buffer.from([80,75,0,255])}={}){
 const writes=[],calls=[];let readOffset=0;
 const sdk={
  '@kit.BasicServicesKit':{},'@kit.AbilityKit':{},'@kit.RemoteCommunicationKit':{},'@kit.AssetStoreKit':{},
  '@kit.PerformanceAnalysisKit':{hilog:{error(){}}},
  '@kit.ArkTS':{util:{TextEncoder:class{encodeInto(text){return new TextEncoder().encode(text);}},Base64Helper:class{decodeSync(text){return new Uint8Array(Buffer.from(text,'base64'));}encodeToStringSync(bytes){return Buffer.from(bytes).toString('base64');}}}},
  '@kit.CoreFileKit':{picker:{DocumentViewPicker:class{async save(options){calls.push(options);return cancelled?[]:['fixture'];}async select(){return ['fixture'];}}},fileUri:{FileUri:class{get name(){return 'book.epub';}}},fileIo:{OpenMode:{READ_ONLY:0,WRITE_ONLY:1,CREATE:2,TRUNC:4},openSync(){return {fd:1};},closeSync(){},statSync(){return {size:source.length};},readSync(_fd,buffer){const bytes=source.subarray(readOffset,readOffset+buffer.byteLength);new Uint8Array(buffer).set(bytes);readOffset+=bytes.length;return bytes.length;},writeSync(_fd,buffer){writes.push(Buffer.from(buffer));return buffer.byteLength;}}}
 };
 const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,sdk,Uint8Array,ArrayBuffer,Error,Map});
 const bridge=new module.exports.NativeBridge();bridge.context={};
 return {writes,calls,call:async(operation,payload)=>JSON.parse(await bridge.call(operation,JSON.stringify(payload)))};
}
test('Harmony native binary export writes arbitrary book bytes, while legacy exports keep signature checks',async()=>{
 const f=fixture(),bytes=Buffer.from([0,1,2,255]);
 const result=await f.call('exportBinary',{name:'book.mobi',data:bytes.toString('base64')});
 assert.equal(result.ok,true);assert.equal(result.value,true);assert.deepEqual(f.writes,[bytes]);
 const legacy=fixture(),rejected=await legacy.call('exportOdt',{name:'book.odt',data:bytes.toString('base64')});
 assert.equal(rejected.ok,false);assert.equal(legacy.writes.length,0);
});
test('Harmony native cancellation does not write a file',async()=>{
 const f=fixture({cancelled:true}),result=await f.call('exportBinary',{name:'book.mobi',data:'AAEC/w=='});
 assert.equal(result.ok,true);assert.equal(result.value,false);assert.equal(f.writes.length,0);
});
test('registered imports reach the format parser as original bytes rather than decoded text',async()=>{
 const f=fixture(),result=await f.call('import',{binaryExtensions:['.epub']});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.value[0].text,undefined);assert.deepEqual(Buffer.from(result.value[0].data,'base64'),Buffer.from([80,75,0,255]));
});
