import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {glossaryKeywords,matchesGlossary} from '../web/glossary-search.mjs';
import {mergeTexts,mergedText} from '../web/sync-merge.mjs';
import {applyRepository,resolveRepositoryConflict} from '../web/git-workspace.mjs';
import {downloadPlan} from '../web/sync-plan.mjs';
import {textFingerprint} from '../web/document-service.mjs';
import {viewportGeometry} from '../web/viewport.mjs';
import {SyncActivity} from '../web/sync-status.mjs';
import {verifyComponent} from '../web/tex-component-worker.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

test('glossary search requires every keyword across term, category, aliases and definition',()=>{
 const entry={term:'柯戈德尾',category:'地名',aliases:['Kogod'],definition:'北方海港'};
 for(const query of ['柯戈德尾 地名','地名　柯戈德尾','  kogod\t北方  ','柯戈德尾 柯戈德尾',''])assert.equal(matchesGlossary(entry,glossaryKeywords(query)),true,query);
 for(const query of ['柯戈德尾 人名','地名 南方'])assert.equal(matchesGlossary(entry,glossaryKeywords(query)),false,query);
 assert.equal(matchesGlossary({term:'无分类'},glossaryKeywords('undefined')),false);
});
test('three-way merge combines independent paragraphs and preserves CRLF and final newlines',()=>{
 const base='第一段\r\n第二段\r\n第三段\r\n第四段\r\n';
 assert.equal(mergedText(mergeTexts(base,base.replace('第一段','本地第一段'),base.replace('第四段','远端第四段'))),'本地第一段\r\n第二段\r\n第三段\r\n远端第四段\r\n');
 assert.equal(mergedText(mergeTexts('a\nb\nc','A\nb\nc','a\nB\nc')),'A\nB\nc');
});
test('three-way merge preserves insertions, deletions and matching changes',()=>{
 assert.equal(mergedText(mergeTexts('a\nb\nc\n','a\nlocal\nb\nc\n','a\nb\nc\nremote\n')),'a\nlocal\nb\nc\nremote\n');
 assert.equal(mergedText(mergeTexts('a\nb\nc\n','a\nc\n','a\nb\nC\n')),'a\nC\n');
 assert.equal(mergedText(mergeTexts('a\n','A\n','A\n')),'A\n');
 assert.equal(mergedText(mergeTexts('','local','')),'local');
});
test('overlapping changes require explicit resolution; deletion is a valid resolution',()=>{
 const parts=mergeTexts('a\nb\nc\n','a\nlocal\nc\n','a\nremote\nc\n');assert.equal(parts.filter(p=>p.conflict).length,1);assert.throws(()=>mergedText(parts),/处理/);
 const conflict=parts.find(p=>p.conflict);assert.equal(conflict.base,'b\n');conflict.resolution='';conflict.resolved=true;assert.equal(mergedText(parts),'a\nc\n');
 assert.equal(mergeTexts(null,'local','remote')[0].conflict,true);
 assert.equal(mergeTexts('a\n','a\nx\n','a\ny\n').filter(p=>p.conflict).length,1);
});
test('large conflicting manuscripts fall back conservatively without quadratic memory',()=>{
 const base=Array.from({length:4000},(_,i)=>'第'+i+'行\n').join('');
 const parts=mergeTexts(base,'本地\n'+base.replace(/第/g,'章节'),'远端\n'+base.replace(/行/g,'段'));
 assert.ok(parts.some(p=>p.conflict));assert.throws(()=>mergedText(parts));
});
test('resolving a workspace conflict retains the remote baseline rather than marking merged changes synced',()=>{
 const workspace={documents:[{id:'a',path:'Book/a.txt',text:'local'}],repositories:[],folders:[],openIds:[]};
 applyRepository(workspace,{repo:'o/book',branch:'main',commit:'new',folders:[],files:[{path:'a.txt',text:'merged',remoteText:'remote',sha:'remote-sha'}]},'Book');
 assert.equal(workspace.documents[0].text,'merged');assert.equal(workspace.documents[0].remote.lastSyncedText,'remote');assert.equal(workspace.repositories[0].baseFiles['a.txt'].hash,textFingerprint('remote'));
 assert.equal(downloadPlan(workspace,{repo:'o/book',branch:'main',files:[{path:'a.txt',text:'newer remote'}]},'Book')[0].state,'conflict');
});
test('keyboard geometry never subtracts the native resized viewport twice or mistakes pinch zoom for a keyboard',()=>{
 assert.deepEqual(viewportGeometry(850,{height:400,offsetTop:20,scale:1}),{height:400,top:20,keyboard:true});
 assert.deepEqual(viewportGeometry(400,{height:400,offsetTop:0,scale:1}),{height:400,top:0,keyboard:false});
 assert.deepEqual(viewportGeometry(850,{height:425,offsetTop:30,scale:2}),{height:850,top:0,keyboard:false});
});
test('sync status exposes in-flight work and keeps failure details until a successful retry',async()=>{
 let finish;const activity=new SyncActivity(()=>{}),job=activity.run('a',()=>new Promise(resolve=>finish=resolve));assert.equal(activity.items.get('a').state,'busy');await assert.rejects(activity.run('a',async()=>{}));finish();await job;
 await assert.rejects(activity.run('a',async()=>{throw Error('network unavailable');}));assert.match(activity.label('a'),/network unavailable/);
 await activity.run('a',async()=>{});assert.equal(activity.items.get('a').state,'success');assert.match(activity.label('a',true),/待同步/);
});
test('offline components accept only complete pinned groups and reject modified code',async()=>{
 const data=strToU8('pinned engine'),sha=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex'),descriptor={files:{'engine.js':{bytes:data.length,sha256:sha}},groups:{engine:['engine.js']}};
 assert.deepEqual(Object.keys(await verifyComponent(zipSync({'engine.js':data}),descriptor)),['engine.js']);
 await assert.rejects(verifyComponent(zipSync({'engine.js':strToU8('evilxx engine')}),descriptor),/校验失败|大小/);
 await assert.rejects(verifyComponent(zipSync({'../engine.js':data}),descriptor),/未知/);
 await assert.rejects(verifyComponent(zipSync({}),descriptor),/不完整/);
});

test('resolving the last retained conflict advances only to the downloaded snapshot and updates its baseline',()=>{
 const association={repo:'o/book',branch:'main',commit:'old',pendingCommit:'downloaded',conflicts:['a.txt','b.txt'],baseFiles:{}};
 const workspace={repositories:[association]};
 resolveRepositoryConflict(workspace,{repo:'o/book',branch:'main',path:'a.txt',sha:'a',text:'remote a'});
 assert.equal(association.commit,'old');assert.deepEqual(association.conflicts,['b.txt']);
 resolveRepositoryConflict(workspace,{repo:'o/book',branch:'main',path:'b.txt',sha:'b',text:'remote b'});
 assert.equal(association.commit,'downloaded');assert.equal(association.pendingCommit,undefined);assert.equal(association.baseFiles['b.txt'].hash,textFingerprint('remote b'));
});
