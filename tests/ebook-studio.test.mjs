import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {validateBook,sourceText,parseBook,relativePath,encode64,readText,writeText,importEpub} from '../components/ebook-studio/engine.mjs';
import {textChapters} from '../components/ebook-studio/create-book.mjs';

const fixture=()=>({version:1,kind:'vela-ebook',packagePath:'Book/package.opf',files:{'Book/package.opf':encode64(strToU8('<package/>')),'Book/one.xhtml':encode64(strToU8('<html/>'))},chapters:[{id:'one',path:'Book/one.xhtml',title:'第一章'}],metadata:{title:'书籍',author:'作者',language:'zh-CN',identifier:'urn:uuid:fixture',description:''},template:'original'});
test('ebook sources preserve resource bytes and reject invalid references, duplicate chapters and oversized sources',()=>{
 const book=fixture();writeText(book,'Book/styles/book.css','p{color:red}');assert.equal(readText(parseBook(sourceText(book)),'Book/styles/book.css'),'p{color:red}');
 assert.throws(()=>validateBook({...book,chapters:[...book.chapters,...book.chapters]}),/重复/);
 assert.throws(()=>validateBook({...book,metadata:{...book.metadata,language:'bad language'}}),/语言/);
 assert.throws(()=>validateBook({...book,files:{...book.files,'../outside':'AA=='}}),/无效/);
 assert.throws(()=>validateBook({...book,drafts:{'missing.xhtml':'draft'}}),/草稿/);
 assert.throws(()=>sourceText({...book,metadata:{...book.metadata,description:'x'.repeat(8*1024*1024)}}),/8 MB/);
});
test('ebook resource references stay inside the archive after percent decoding',()=>{
 assert.equal(relativePath('Book/text/one.xhtml','../images/a%20b.png#cover'),'Book/images/a b.png');
 for(const path of ['../../../outside','%2e%2e/%2e%2e/%2e%2e/outside','https://remote.invalid/p.png','%2foutside','..\\outside'])assert.throws(()=>relativePath('Book/text/one.xhtml',path),/路径|越过/);
});
test('multi-megabyte embedded images validate without recursive regular-expression overflow',()=>{
 const book=fixture();book.files['Book/large.png']=encode64(new Uint8Array(4*1024*1024).fill(255));assert.equal(parseBook(sourceText(book)).files['Book/large.png'],book.files['Book/large.png']);
});
test('unsafe ZIP paths and encrypted EPUBs fail before XML or resource loading',()=>{
 const files={mimetype:[strToU8('application/epub+zip'),{level:0}],'META-INF/container.xml':strToU8('<container/>')};
 assert.throws(()=>importEpub(zipSync({...files,'../outside':strToU8('x')})),/路径/);
 assert.throws(()=>importEpub(zipSync({...files,'META-INF/encryption.xml':strToU8('<encryption/>')})),/加密/);
});
test('novel chapter conversion preserves prologues and escapes user text',()=>{
 const chapters=textChapters('序言 & <原文>\n第一章 启程\n　　中文正文。\nChapter 2 Return\nSecond paragraph.');
 assert.equal(chapters.length,3);assert.match(chapters[0].content,/&amp; &lt;原文&gt;/);assert.equal(chapters[1].title,'第一章 启程');assert.match(chapters[2].content,/Second paragraph/);
});
test('vendored iepub WASM produces complete long Unicode text across MOBI record boundaries',async()=>{
 const wasm=await readFile('components/ebook-studio/runtime/mobi.wasm'),module=await WebAssembly.compile(wasm);assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const {exports:api}=await WebAssembly.instantiate(module,{}),text=('中文航路🚢标记 &amp; 正文。').repeat(2200),book={title:'长篇测试',author:'作者',identifier:'urn:uuid:long',description:'说明',chapters:[{title:'第一章',html:'<h1>第一章</h1><p>'+text+'</p>'}],assets:[],cover:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='};
 const input=strToU8(JSON.stringify(book)),pointer=api.studio_alloc(input.length);new Uint8Array(api.memory.buffer,pointer,input.length).set(input);const result=api.studio_convert(pointer,input.length);api.studio_free(pointer,input.length);
 const outPointer=Number(result&0xffffffffn),length=Number(result>>32n),output=new Uint8Array(api.memory.buffer,outPointer,length).slice();api.studio_free(outPointer,length);assert.equal(output[0],1);
 const bytes=output.slice(1),view=new DataView(bytes.buffer),count=view.getUint16(76),offsets=Array.from({length:count},(_,i)=>view.getUint32(78+i*8)),record0=new DataView(bytes.buffer,offsets[0]),records=record0.getUint16(8),total=record0.getUint32(4);
 assert.equal(record0.getUint16(0),1);assert.equal(record0.getUint32(36),6);
 const textBytes=Buffer.concat(Array.from({length:records},(_,i)=>Buffer.from(bytes.subarray(offsets[i+1],offsets[i+2]??bytes.length))));
 const html=new TextDecoder('utf-8',{fatal:true}).decode(textBytes.subarray(0,total));assert.ok(html.includes(text),'the entire original Unicode text must survive record splitting');
});
