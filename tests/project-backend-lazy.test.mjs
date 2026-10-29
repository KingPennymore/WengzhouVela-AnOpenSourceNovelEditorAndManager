import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';

test('HarmonyOS archive fallback keeps capabilities, ownership and cancellation across lazy initialization',async()=>{
  const zip=zipSync({'book.txt':strToU8('Chapter one')}),calls=[];
  globalThis.window={WenzhouNative:{call:async(operation,payload)=>{
    assert.equal(operation,'project');
    const {action,request}=JSON.parse(payload),args=JSON.parse(request);calls.push(action);
    let value=true;
    if(action==='capabilities')value={features:{filesystem:true,archives:false},limits:{}};
    if(action==='selectionRead')value={totalSize:zip.length,data:Buffer.from(zip.subarray(args.offset,args.offset+args.length)).toString('base64')};
    return JSON.stringify({ok:true,value});
  }}};
  try{
    const {projectBackend}=await import('../web/project-backend.mjs');
    const backend=projectBackend(()=>({documents:[]}),'harmonyos');
    const capabilities=await backend.call('capabilities','host',{});
    assert.equal(capabilities.features.archives,true);
    assert.equal(capabilities.limits.archiveExpandedBytes,8*1024*1024);
    assert.equal(capabilities.limits.archiveEntries,1000);
    assert.deepEqual(calls,['capabilities']);
    const [first,second]=await Promise.all(['first','second'].map(owner=>backend.call('archiveInspect',owner,{selectionToken:owner,taskId:owner})));
    assert.deepEqual(first.entries,[{path:'book.txt',directory:false,size:11}]);
    await assert.rejects(backend.call('archiveRead','second',{archiveToken:first.archiveToken,path:'book.txt',maxBytes:100}),{code:'E_NOT_FOUND'});
    await backend.call('cancel','first',{taskId:'cancelled'});
    await assert.rejects(backend.call('archiveInspect','first',{selectionToken:'first',taskId:'cancelled'}),{code:'E_CANCELLED'});
    await backend.call('stop','second',{});
    await assert.rejects(backend.call('archiveRead','second',{archiveToken:second.archiveToken,path:'book.txt',maxBytes:100}),{code:'E_NOT_FOUND'});
    assert.equal(calls.includes('archiveInspect'),false);
    const windows=projectBackend(()=>({documents:[]}),'windows');
    assert.equal((await windows.call('capabilities','host',{})).features.archives,false);
  }finally{delete globalThis.window;}
});
