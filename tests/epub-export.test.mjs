import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {Text} from '@codemirror/state';
import {EditorIndex} from '../web/editor-index.mjs';
import {buildEpub,epubFileName} from '../web/epub-export.mjs';

const settings={includeHeading:false,countMode:'chars',templates:[]};
const novel='序\n\n第一章 风起\n\n　　林舟冷笑一声，“走吧”。\n\n　　苏晚心中暗道不好 & <好>。\n\n——完——\n\n第二章 云涌\n\n第三章 落幕\n\n　　终了\u0007。';
const {sections}=new EditorIndex(Text.of(novel.split('\n')),settings).value;
const at=(quote,group='marks',type='strong',value)=>{const from=novel.indexOf(quote);return {group,type,value,from,to:from+quote.length};};
const entries=[at('林舟冷笑'),at('不好','marks','emphasis'),at('——完——','blocks','align','center')];
const build=(options={})=>buildEpub({text:novel,sections,entries,metadata:{title:'航程 & 远方',author:'作者',description:'简介',identifier:'urn:uuid:00000000-0000-4000-8000-000000000001'},clock:()=>new Date('2026-10-15T08:00:00.123Z'),...options});

test('the archive starts with an uncompressed mimetype and holds the OCF container, package, nav, NCX and chapters',()=>{
  const {bytes,chapters}=build();
  assert.equal(strFromU8(bytes.subarray(30,38)),'mimetype');assert.equal(bytes[8]|bytes[9]<<8,0,'stored');assert.equal(bytes[28]|bytes[29]<<8,0,'no extra field');
  assert.equal(strFromU8(bytes.subarray(38,58)),'application/epub+zip');
  const files=unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(),['META-INF/container.xml','OEBPS/content.opf','OEBPS/nav.xhtml','OEBPS/styles/book.css','OEBPS/text/chapter-001.xhtml','OEBPS/text/chapter-002.xhtml','OEBPS/text/chapter-003.xhtml','OEBPS/text/chapter-004.xhtml','OEBPS/toc.ncx','mimetype']);
  assert.equal(chapters,4,'the preface and three chapters; 第二章 has only its title and is kept with it');
});

test('package metadata, manifest and spine follow EPUB 3 with an NCX for older readers',()=>{
  const opf=strFromU8(unzipSync(build().bytes)['OEBPS/content.opf']);
  assert.match(opf,/<package xmlns="http:\/\/www.idpf.org\/2007\/opf" version="3.0" unique-identifier="book-id"/);
  assert.match(opf,/<dc:identifier id="book-id">urn:uuid:00000000-0000-4000-8000-000000000001<\/dc:identifier>/);
  assert.match(opf,/<dc:title>航程 &amp; 远方<\/dc:title>/);assert.match(opf,/<dc:creator>作者<\/dc:creator>/);assert.match(opf,/<dc:description>简介<\/dc:description>/);
  assert.match(opf,/<meta property="dcterms:modified">2026-10-15T08:00:00Z<\/meta>/);
  assert.match(opf,/properties="nav"/);assert.match(opf,/<spine toc="ncx">\n<itemref idref="chapter-001"\/>\n<itemref idref="chapter-002"\/>\n<itemref idref="chapter-003"\/>/);
  const ncx=strFromU8(unzipSync(build().bytes)['OEBPS/toc.ncx']);assert.match(ncx,/<navLabel><text>第一章 风起<\/text><\/navLabel><content src="text\/chapter-002.xhtml"\/>/);
});

test('chapters keep formats, escape text and drop characters XML does not allow',()=>{
  const files=unzipSync(build().bytes),chapter=strFromU8(files['OEBPS/text/chapter-002.xhtml']);
  assert.match(chapter,/^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE html>/);
  assert.match(chapter,/<h1>第一章 风起<\/h1>/);assert.match(chapter,/<p>　　<strong>林舟冷笑<\/strong>一声，“走吧”。<\/p>/);
  assert.match(chapter,/<em class="emphasis">不好<\/em> &amp; &lt;好&gt;。/);assert.match(chapter,/<p class="center">——完——<\/p>/);
  assert.doesNotMatch(strFromU8(files['OEBPS/text/chapter-004.xhtml']),/\u0007/);assert.match(strFromU8(files['OEBPS/text/chapter-004.xhtml']),/终了。/);
  assert.match(strFromU8(files['OEBPS/nav.xhtml']),/<li><a href="text\/chapter-001.xhtml">章前内容<\/a><\/li>/);
});

test('without titles, a chapter that is only a title is skipped; a range exports only its chapters',()=>{
  assert.equal(build({includeTitle:false}).chapters,3);
  const files=unzipSync(build({from:1,to:2,includeTitle:false}).bytes);
  assert.doesNotMatch(strFromU8(files['OEBPS/text/chapter-001.xhtml']),/<h1>/);
  assert.ok(!files['OEBPS/text/chapter-002.xhtml'],'第二章 has no text without its title');
});

test('a cover adds the image, a cover page first in the spine and both EPUB 3 and EPUB 2 cover markers',()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),files=unzipSync(build({cover:{bytes:png,type:'image/png'}}).bytes),opf=strFromU8(files['OEBPS/content.opf']);
  assert.deepEqual([...files['OEBPS/images/cover.png']],[...png]);
  assert.match(opf,/<item id="cover-image" href="images\/cover.png" media-type="image\/png" properties="cover-image"\/>/);assert.match(opf,/<meta name="cover" content="cover-image"\/>/);
  assert.match(opf,/<spine toc="ncx">\n<itemref idref="cover" linear="yes"\/>/);
  assert.throws(()=>build({cover:{bytes:png,type:'image/bmp'}}),/JPEG、PNG/);
});

test('invalid metadata or empty selections are refused with a reason',()=>{
  assert.throws(()=>build({metadata:{title:' '}}),/书名/);assert.throws(()=>build({metadata:{title:'书',language:'中文'}}),/语言/);
  assert.throws(()=>build({from:2,to:2,includeTitle:false}),/没有正文/);
  assert.equal(epubFileName('航程: 第一卷?'),'航程 第一卷.epub');assert.equal(epubFileName(''),'电子书.epub');
});
