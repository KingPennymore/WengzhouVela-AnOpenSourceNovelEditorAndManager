import test from 'node:test';
import assert from 'node:assert/strict';
import {syncTextEqual,preserveVelaPositions,mergeVelaTexts} from '../web/vela-sync.mjs';
import {downloadPlan,commitPlan} from '../web/sync-plan.mjs';
import {textFingerprint} from '../web/document-service.mjs';
import {applyRepository,applyRemoteFile} from '../web/git-workspace.mjs';
import {mergeTexts,mergedText} from '../web/sync-merge.mjs';
import {buildRecord} from '../web/rich-text.mjs';

const config={version:3,kind:'workspace',id:'book',project:{name:'Book'},editor:{fontSize:18},reading:{items:[]},extra:{keep:'unknown'}};
const position=n=>({'正文.txt':{at:[n,2],head:'正文'}});
const text=value=>JSON.stringify(value,null,2)+'\n';
const base=text({...config,positions:position(1)});
const local=text({...config,positions:position(8)});
const remote=text({...config,editor:{fontSize:20},positions:position(4)});
const doc=(value=local)=>({id:'config',name:'.vela',path:'Book/.vela',text:value,remote:{provider:'github',repo:'owner/Book',branch:'master',path:'.vela',sha:'old',lastSyncedText:base}});
const result=(value=remote)=>({repo:'owner/Book',branch:'master',commit:'next',folders:[],files:[{path:'.vela',text:value,data:Buffer.from(value).toString('base64'),sha:'new'}]});

test('sync comparison ignores only valid .vela position records and key order',()=>{
 assert.equal(syncTextEqual('.vela',base,local),true);
 assert.equal(syncTextEqual('Book/.vela',base,text({...config,positions:position(5),extra:{keep:'unknown'}})),true);
 assert.equal(syncTextEqual('.vela',local,remote),false);
 assert.equal(syncTextEqual('notes.txt',base,local),false);
 assert.equal(syncTextEqual('.vela','invalid one','invalid two'),false);
 assert.equal(syncTextEqual('.vela',local,text({...config,richText:{enabled:true}})),false);
});
test('pulling changed settings preserves the current device position and original remote baseline',()=>{
 const workspace={documents:[doc()],openIds:[],repositories:[]},item=downloadPlan(workspace,result(),'Book')[0];
 assert.equal(item.state,'remote');assert.equal(item.selected,true);
 assert.deepEqual(JSON.parse(item.file.text).positions,position(8));
 assert.equal(Buffer.from(item.file.data,'base64').toString(),item.file.text);
 assert.equal(item.file.remoteText,remote);
 applyRepository(workspace,{...result(),files:[item.file]},'Book');
 assert.equal(workspace.documents[0].remote.lastSyncedText,remote);
 assert.equal(workspace.repositories[0].baseFiles['.vela'].hash,textFingerprint(remote));
 assert.equal(downloadPlan(workspace,result(),'Book')[0].state,'unchanged');
});
test('nonoverlapping .vela fields merge, unknown fields survive, overlapping values remain conflicts',()=>{
 const changed=text({...config,editor:{fontSize:18,wrap:false},positions:position(8)});
 const merged=mergeVelaTexts('.vela',base,changed,remote);
 assert.deepEqual(JSON.parse(merged).editor,{fontSize:20,wrap:false});
 assert.deepEqual(JSON.parse(merged).extra,{keep:'unknown'});
 assert.deepEqual(JSON.parse(merged).positions,position(8));
 assert.equal(mergedText(mergeTexts(base,changed,remote)),merged);
 assert.equal(downloadPlan({documents:[doc(changed)]},result(),'Book')[0].state,'merged');
 assert.equal(mergeVelaTexts('.vela',base,text({...config,editor:{fontSize:22}}),remote),null);
 assert.equal(downloadPlan({documents:[doc(text({...config,editor:{fontSize:22}}))]},result(),'Book')[0].state,'conflict');
});
test('delete/edit collisions, different identities and malformed configuration never auto-merge',()=>{
 const deleted=text({...config,extra:{}}),edited=text({...config,extra:{keep:'changed'}});
 assert.equal(mergeVelaTexts('.vela',base,deleted,edited),null);
 assert.equal(mergeVelaTexts('.vela',base,local,text({...config,id:'another'})),null);
 assert.equal(mergeVelaTexts('.vela',undefined,local,remote),null);
 assert.equal(mergeVelaTexts('.vela',base,'broken',remote),null);
});
test('position deletion at document start stays local, including after preview creation',()=>{
 const next=preserveVelaPositions('.vela',remote,text(config));
 assert.equal(JSON.parse(next).positions,undefined);
 assert.deepEqual(JSON.parse(preserveVelaPositions('.vela',remote,text({...config,positions:position(10)}))).positions,position(10));
});
test('different documents can merge format records; divergent edits to one record require a choice',()=>{
 const record=buildRecord('正文',[]),before={...config,richText:{documents:{'正文.txt':record,'其他.txt':record}}};
 const a=structuredClone(before),b=structuredClone(before);
 a.richText.documents['正文.txt']=buildRecord('修改后的正文',[]);
 b.richText.documents['其他.txt']=buildRecord('修改后的其他文稿',[]);
 assert.ok(mergeVelaTexts('.vela',text(before),text(a),text(b)));
 b.richText.documents['正文.txt']=buildRecord('冲突的正文',[]);
 assert.equal(mergeVelaTexts('.vela',text(before),text(a),text(b)),null);
});
test('position-only changes are not staged when the matching remote baseline is known',()=>{
 const files=[{path:'.vela',text:local}],association={baseFiles:{'.vela':{hash:textFingerprint(base)}}};
 assert.equal(commitPlan(files,association,{baseText:()=>base})[0].state,'unchanged');
 assert.equal(commitPlan([{path:'.vela',text:remote}],association,{baseText:()=>base})[0].state,'modified');
 assert.equal(commitPlan(files,association,{baseText:()=>remote})[0].state,'modified','unrelated baseline cannot hide changes');
});
test('single-file auto-merge keeps the immutable fetched baseline for later push',()=>{
 const workspace={documents:[doc()]};
 const merged=mergeVelaTexts('.vela',base,local,remote);
 applyRemoteFile(workspace,{repo:'owner/Book',branch:'master',path:'.vela',sha:'new',text:merged,remoteText:remote});
 assert.equal(workspace.documents[0].text,merged);
 assert.equal(workspace.documents[0].remote.lastSyncedText,remote);
});
