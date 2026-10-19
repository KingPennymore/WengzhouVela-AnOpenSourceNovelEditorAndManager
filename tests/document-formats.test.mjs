import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDocumentFormat,documentProvider,documentSourceProvider,documentImportExtensions,importDocumentBytes,componentText} from '../web/document-components.mjs';
import {prepareDocumentImport,readDocumentBytes} from '../web/document-import.mjs';
import {documentKind} from '../web/model.mjs';
import {readable} from '../web/vela.mjs';

const encode=text=>new TextEncoder().encode(text);
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const provider=(extra={})=>({id:'test.books',extensions:['.epub'],sourceExtensions:['.vepub'],importBytes:async(_bytes,name)=>({name:name.replace(/\.epub$/i,'.vepub'),text:'{"text":"正文"}'}),render(){},plainText:source=>JSON.parse(source).text,toHtml:source=>'<p>'+JSON.parse(source).text+'</p>',validate:JSON.parse,...extra});

test('registered binary imports become editable source documents and keep their identity after stop',async()=>{
 const original=encode('PK synthetic book'),stop=registerDocumentFormat('test',provider());
 try{
  assert.equal(documentProvider('BOOK.EPUB').id,'test.books');
  assert.equal(documentSourceProvider('book.vepub').id,'test.books');
  assert.ok(documentImportExtensions().includes('.epub'));
  const doc=await prepareDocumentImport(original,'book.epub',decode);
  assert.deepEqual(doc,{name:'book.vepub',text:'{"text":"正文"}',kind:'PLUGIN',formatId:'test.books'});
  assert.equal(documentKind(doc),'PLUGIN');assert.equal(readable(doc),true);
  assert.equal(componentText(doc.text,doc.name),'正文');
  assert.deepEqual(await prepareDocumentImport(encode(doc.text),doc.name,decode),doc);
  assert.equal(decode(original),'PK synthetic book');
  stop();assert.equal(documentKind(doc),'PLUGIN');assert.equal(componentText(doc.text,doc.name),doc.text);
  assert.equal(documentProvider('book.epub'),undefined);
  await assert.rejects(prepareDocumentImport(original,'book.epub',decode),/文档插件/);
 }finally{stop();}
});

test('format registration rejects overlapping source ownership and snapshots declarations',()=>{
 const spec=provider(),stop=registerDocumentFormat('test',spec);
 try{
  spec.extensions.push('.changed');spec.sourceExtensions.push('.changedsource');
  assert.equal(documentProvider('book.changed'),undefined);assert.equal(documentSourceProvider('book.changedsource'),undefined);
  assert.throws(()=>registerDocumentFormat('other',provider({id:'other',extensions:['.other']})),/已由其他组件注册/);
  assert.throws(()=>registerDocumentFormat('other',provider({id:'other',sourceExtensions:[]})),/编辑源/);
 }finally{stop();}
});

test('imports reject unsafe names, binary output names, invalid source, and oversize input',async()=>{
 for(const [result,pattern] of [[{name:'../bad.vepub',text:'{}'},/无效/],[{name:'bad.txt',text:'{}'},/sourceExtensions/],[{name:'bad.vepub',text:'broken'},/JSON/],[{name:'bad.vepub',text:'x'.repeat(8*1024*1024+1)},/无效/]]){
  const stop=registerDocumentFormat('test',provider({importBytes:()=>result}));
  try{await assert.rejects(importDocumentBytes(encode('PK'),'book.epub'),pattern);}finally{stop();}
 }
 const stop=registerDocumentFormat('test',provider({sourceExtensions:['.epub'],maxImportBytes:2,importBytes:()=>({name:'book.epub',text:'{}'})}));
 try{await assert.rejects(importDocumentBytes(encode('PK'),'book.epub'),/二进制/);await assert.rejects(importDocumentBytes(encode('PK!'),'book.epub'),/大小/);}finally{stop();}
});

test('an asynchronous import cannot create a document after the format stops or the operation aborts',async()=>{
 let release;const stop=registerDocumentFormat('test',provider({importBytes:()=>new Promise(resolve=>release=resolve)}));
 const pending=importDocumentBytes(encode('PK'),'book.epub');await Promise.resolve();stop();release({name:'book.vepub',text:'{}'});
 await assert.rejects(pending,e=>e.code==='E_PLUGIN_STOPPED');
 const controller=new AbortController(),stop2=registerDocumentFormat('test',provider());
 try{controller.abort();await assert.rejects(importDocumentBytes(encode('PK'),'book.epub',{signal:controller.signal}),e=>e.name==='AbortError');}finally{stop2();}
});

test('plain-text providers work without sourceExtensions and preserve an empty plainText result',async()=>{
 const stop=registerDocumentFormat('text',provider({extensions:['.fiction'],sourceExtensions:undefined,plainText:()=>'',validate:()=>{},importBytes:()=>({name:'book.fiction',text:'source'})}));
 try{assert.equal(componentText('source','book.fiction'),'');assert.equal((await prepareDocumentImport(encode('source'),'book.fiction',decode)).kind,'PLUGIN');}finally{stop();}
});

test('class-based providers retain prototype methods and mutable instance state',async()=>{
 class Format {
  id='class.format';extensions=['.fiction'];calls=0;
  importBytes(){this.calls++;return {name:'book.fiction',text:'source'};}
  render(){}plainText(){return String(this.calls);}toHtml(){return '<p>'+this.calls+'</p>';}
 }
 const instance=new Format(),stop=registerDocumentFormat('class',instance);
 try{await importDocumentBytes(encode('source'),'book.fiction');assert.equal(instance.calls,1);assert.equal(componentText('source','book.fiction'),'1');}finally{stop();}
});

test('stopping a format immediately aborts an unfinished parser',async()=>{
 let parseSignal;const stop=registerDocumentFormat('test',provider({importBytes(_bytes,_name,{signal}){parseSignal=signal;return new Promise(()=>{});}}));
 const pending=importDocumentBytes(encode('PK'),'book.epub');await Promise.resolve();stop();
 await assert.rejects(pending,e=>e.code==='E_PLUGIN_STOPPED');assert.equal(parseSignal.aborted,true);
});

test('chunked reads enforce a fixed revision, total size, nonempty chunks and limits',async()=>{
 const bytes=new Uint8Array(300000).fill(42),calls=[];
 const result=await readDocumentBytes(async args=>{calls.push(args);return {bytes:bytes.slice(args.offset,args.offset+args.length),totalSize:bytes.length,revision:'r:fixed'};},'book.epub',400000);
 assert.deepEqual(result.bytes,bytes);assert.equal(calls.length,2);assert.equal(calls[1].expectedRevision,'r:fixed');
 for(const response of [{bytes:new Uint8Array(),totalSize:1,revision:'r:1'},{bytes:encode('x'),totalSize:500000,revision:'r:1'},{bytes:encode('xx'),totalSize:1,revision:'r:1'}])await assert.rejects(readDocumentBytes(async()=>response,'book.epub',400000),/读取期间/);
 let turn=0;await assert.rejects(readDocumentBytes(async()=>({bytes:encode('x'),totalSize:2,revision:'r:'+(++turn)}),'book.epub',4),/读取期间/);
});
