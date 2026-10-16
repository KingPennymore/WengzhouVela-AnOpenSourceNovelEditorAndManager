import test from 'node:test';
import assert from 'node:assert/strict';
import {readPosition,positionEntry,positionOffset,positionUpdate,rewriteVelaFiles,positionHome,velaText,GLOBAL_VELA_PATH} from '../web/vela.mjs';
import {createVelaV2} from '../web/vela-v2.mjs';

// The last editing position of each document is kept in the .vela covering it (positions), relative to that work,
// or in the global .vela for documents outside any work. It survives external edits through the line's first chars.
const novel='第一章 风起\n\n　　林舟冷笑一声。\n　　海风吹过。\n\n第二章 归航\n　　天亮了。';
const work=(extra={})=>({version:3,kind:'workspace',id:'voyage',project:{name:'航程'},...extra});
const doc=(path,text)=>({id:path,name:path.split('/').at(-1),path,text,updatedAt:1});
const space=documents=>({documents,settings:{},treeRevision:0});
const apply=(workspace,update)=>{update.doc.text=update.text;return JSON.parse(update.text);};

test('an entry stores line, column and the line head; the offset comes back exactly',()=>{
  const at=novel.indexOf('海风')+1,entry=positionEntry(novel,at);
  assert.deepEqual(entry,{at:[4,3],head:'　　海风吹过。'});
  assert.equal(positionOffset(novel,entry),at);
});
test('after an external edit the line is found again by its head, else the same line number is used',()=>{
  const entry=positionEntry(novel,novel.indexOf('天亮'));
  const edited='序章\n\n'+novel;assert.equal(positionOffset(edited,entry),edited.indexOf('天亮'));
  const rewritten=novel.replace('　　天亮了。','　　夜色未尽。');assert.equal(positionOffset(rewritten,entry),rewritten.indexOf('　　夜色未尽。')+2);
  assert.equal(positionOffset('短',entry),1,'clamped into a shorter text');
  assert.equal(positionOffset(novel,{at:['x']}),0,'malformed entries start at the top');
});
test('positions are written into the work .vela with paths relative to it, newest last, and unchanged ones skipped',()=>{
  const book=doc('航程/卷一/正文.txt',novel),config=doc('航程/.vela',velaText(work())),workspace=space([config,book]);
  assert.equal(positionHome(workspace,book).key,'卷一/正文.txt');
  const entry=positionEntry(novel,novel.indexOf('海风')),update=positionUpdate(workspace,book,entry);assert.equal(update.doc,config);
  const saved=apply(workspace,update);assert.deepEqual(saved.positions,{'卷一/正文.txt':entry});assert.deepEqual(readPosition(workspace,book),entry);
  assert.equal(positionUpdate(workspace,book,entry),null,'same position: no rewrite');
  assert.equal(positionUpdate(workspace,doc('航程/.vela',''),entry),null,'.vela files have no position');
  apply(workspace,positionUpdate(workspace,book,positionEntry(novel,0)));assert.equal(JSON.parse(config.text).positions,undefined,'back at the top: the entry is dropped');
});
test('documents outside a work use the global .vela, which is created only when there is a position to keep',()=>{
  const loose=doc('杂记.txt',novel),workspace=space([loose]);let created=0;
  const createGlobal=()=>{created++;const g=doc(GLOBAL_VELA_PATH,velaText(createVelaV2('全局默认配置',{global:true})));workspace.documents.push(g);return g;};
  assert.equal(positionUpdate(workspace,loose,positionEntry(novel,0),createGlobal),null);assert.equal(created,0);
  const update=positionUpdate(workspace,loose,positionEntry(novel,5),createGlobal);assert.equal(created,1);
  assert.deepEqual(Object.keys(apply(workspace,update).positions),['杂记.txt']);
});
test('positions follow renamed and moved files and are dropped with deleted ones',()=>{
  const book=doc('航程/正文.txt',novel),config=doc('航程/.vela',velaText(work({positions:{'正文.txt':{at:[3,2],head:'　　林舟'},'旧章.txt':{at:[2,0],head:''}}}))),before=space([config,book,doc('航程/旧章.txt','x')]);
  const after=structuredClone(before);after.documents[1].path='航程/卷一/正文.txt';
  rewriteVelaFiles(before,after,'move','航程/正文.txt','航程/卷一/正文.txt');
  assert.deepEqual(Object.keys(JSON.parse(after.documents[0].text).positions).sort(),['卷一/正文.txt','旧章.txt']);
  const removed=structuredClone(after);removed.documents.splice(2,1);
  rewriteVelaFiles(after,removed,'delete','航程/旧章.txt');
  assert.deepEqual(Object.keys(JSON.parse(removed.documents[0].text).positions),['卷一/正文.txt']);
});
