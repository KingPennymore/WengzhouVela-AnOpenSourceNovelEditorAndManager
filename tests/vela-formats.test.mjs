import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVela,velaText,readingDocuments,rewriteVelaFiles,addFormatRecord,formatHome,documentFormats,configStyles,includeNewReadingFile} from '../web/vela.mjs';
import {buildRecord,buildSidecar,sidecarText} from '../web/rich-text.mjs';

const novel='第一章 风起\n\n　　林舟冷笑一声。\n\n——完——';
const strong={group:'marks',type:'strong',from:novel.indexOf('林舟'),to:novel.indexOf('林舟')+2};
const record=()=>buildRecord(novel,[strong]);
const work=(extra={})=>({version:3,kind:'workspace',id:'voyage',project:{name:'航程'},...extra});
const doc=(path,text)=>({id:path,name:path.split('/').at(-1),path,text,updatedAt:1});
const workspace=documents=>({documents,settings:{},treeRevision:0});
const recordsOf=(space,path)=>JSON.parse(space.documents.find(item=>item.path===path).text).richText?.documents||{};

test('richText holds the switch, styles and per-TXT records; invalid records are refused with the path',()=>{
  const config=parseVela(JSON.stringify(work({richText:{enabled:true,styles:{whisper:{label:'耳语',color:'muted'}},documents:{'卷一/正文.txt':record()}}})));
  assert.equal(config.richText.enabled,true);assert.deepEqual(configStyles(config),{whisper:{label:'耳语',color:'muted'}});
  assert.deepEqual(configStyles({styles:{a:{label:'旧'}},richText:{styles:{b:{label:'新'}}}}),{a:{label:'旧'},b:{label:'新'}},'0.9.7 top-level styles are still read');
  assert.throws(()=>parseVela(JSON.stringify(work({richText:{documents:{'正文.md':record()}}}))),/TXT 相对路径/);
  assert.throws(()=>parseVela(JSON.stringify(work({richText:{documents:{'../正文.txt':record()}}}))));
  assert.throws(()=>parseVela(JSON.stringify(work({richText:{documents:{'正文.txt':{text:{length:1,hash:'0'},marks:[{type:'strong',at:[1]}]}}}}))),/正文\.txt.*位置无效/);
  assert.throws(()=>parseVela(JSON.stringify({...work(),version:2,richText:{}})),/version: 3/);
});

test('velaText writes one entry per line; the configuration part stays under 256 KB while records may be larger',()=>{
  const text=velaText(work({reading:{items:[{path:'a.txt'},{path:'b.txt'}]},richText:{documents:{'正文.txt':record()}}}));
  assert.match(text,/\n {4}"items": \[\n {6}\{"path":"a\.txt","id":"[^"]+"\},\n/);
  assert.match(text,/\n {8}"text": \{"length":\d+,"hash":"\w+","lines":5\},\n {8}"marks": \[\n {10}\{"type":"strong","at":\[3,2,4\],"hash":"\w+","quote":"林舟"\}\n {8}\]/);
  assert.deepEqual(parseVela(text),parseVela(JSON.stringify(parseVela(text))));
  const big={};for(let i=0;i<300;i++)big['第'+i+'章.txt']=buildRecord(novel+i,Array.from({length:20},()=>strong));
  assert.ok(velaText(work({richText:{documents:big}})).length>262144,'records alone may pass 256 KB');
  assert.throws(()=>parseVela(JSON.stringify(work({publishing:{note:'x'.repeat(270000)}}))),/256 KB/);
});

test('a work without reading.items reads every supported file in its folder and keeps no list',()=>{
  const space=workspace([doc('航程/.vela',JSON.stringify(work())),doc('航程/正文.txt',novel),doc('航程/笔记.md','# 笔记'),doc('其他.txt','外面')]);
  assert.deepEqual(readingDocuments(space).map(item=>item.path).sort(),['其他.txt','航程/正文.txt','航程/笔记.md']);
  const added=doc('航程/新章.txt','新');space.documents.push(added);includeNewReadingFile(space,added);
  assert.equal(JSON.parse(space.documents[0].text).reading?.items,undefined,'new files are not written into a list');
});

test('formats are found through the nearest work .vela and read for the reader, from 0.9.7 sidecars too',()=>{
  const space=workspace([doc('航程/.vela',JSON.stringify(work({richText:{documents:{'卷一/正文.txt':record()}}}))),doc('航程/卷一/正文.txt',novel)]);
  const home=formatHome(space,space.documents[1]);assert.equal(home.key,'卷一/正文.txt');assert.equal(home.doc,space.documents[0]);
  assert.deepEqual(documentFormats(space,space.documents[1]).map(entry=>novel.slice(entry.from,entry.to)),['林舟']);
  const legacy=workspace([doc('正文.txt',novel),doc('正文.txt.vela',sidecarText(buildSidecar('正文.txt',novel,[strong])))]);
  assert.equal(formatHome(legacy,legacy.documents[0]),null);
  assert.deepEqual(documentFormats(legacy,legacy.documents[0]).map(entry=>novel.slice(entry.from,entry.to)),['林舟']);
});

test('addFormatRecord uses the covering .vela or creates one in the TXT folder that reads every file',()=>{
  const space=workspace([doc('散稿/正文.txt',novel)]);
  assert.equal(addFormatRecord(space,'散稿/正文.txt',record()),true);
  const created=space.documents.find(item=>item.path==='散稿/.vela'),config=JSON.parse(created.text);
  assert.equal(config.kind,'workspace');assert.equal(config.project.name,'散稿');assert.equal(config.reading.items,undefined);assert.equal(config.editor,undefined);
  assert.ok(config.richText.documents['正文.txt']);
  addFormatRecord(space,'散稿/卷二/续.txt',record());assert.deepEqual(Object.keys(recordsOf(space,'散稿/.vela')).sort(),['卷二/续.txt','正文.txt']);
});

test('records follow renames inside the work, move to the destination work, and are copied with a copy',()=>{
  const make=()=>workspace([doc('航程/.vela',JSON.stringify(work({richText:{documents:{'正文.txt':record()}}}))),doc('航程/正文.txt',novel),doc('彼岸/.vela',JSON.stringify(work({id:'other',project:{name:'彼岸'}})))]);
  let before=make(),after=structuredClone(before);after.documents[1].path='航程/卷一/正文.txt';
  rewriteVelaFiles(before,after,'move','航程/正文.txt','航程/卷一/正文.txt');assert.deepEqual(Object.keys(recordsOf(after,'航程/.vela')),['卷一/正文.txt']);
  before=make();after=structuredClone(before);after.documents[1].path='彼岸/正文.txt';
  rewriteVelaFiles(before,after,'move','航程/正文.txt','彼岸/正文.txt');
  assert.deepEqual(recordsOf(after,'航程/.vela'),{});assert.deepEqual(Object.keys(recordsOf(after,'彼岸/.vela')),['正文.txt']);
  before=make();after=structuredClone(before);after.documents.push({...doc('无主/正文.txt',novel),id:'copy'});
  rewriteVelaFiles(before,after,'copy','航程/正文.txt','无主/正文.txt');
  assert.deepEqual(Object.keys(recordsOf(after,'航程/.vela')),['正文.txt']);assert.deepEqual(Object.keys(recordsOf(after,'无主/.vela')),['正文.txt'],'a .vela is created where none covers the copy');
  before=make();after=structuredClone(before);after.documents.splice(1,1);
  rewriteVelaFiles(before,after,'delete','航程/正文.txt');assert.deepEqual(Object.keys(recordsOf(after,'航程/.vela')),['正文.txt'],'kept while the TXT is in the trash');
});
