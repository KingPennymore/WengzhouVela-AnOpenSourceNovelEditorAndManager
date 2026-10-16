import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {Text} from '@codemirror/state';
import {EditorIndex} from '../web/editor-index.mjs';
import {inlineSegments,imagesByLine,imagePath,buildSidecar,sidecarText,readSidecar,resolveSidecar} from '../web/rich-text.mjs';
import {resolveStyles,validateStyles,styleCss,styleSheet,BUILTIN_STYLES} from '../web/rich-text-styles.mjs';
import {chapterMarkdown,chapterHtml} from '../web/rich-text-export.mjs';
import {buildEpub} from '../web/epub-export.mjs';
import {parseVela} from '../web/vela.mjs';

const settings={includeHeading:false,countMode:'chars',templates:[]};
const novel='第一章 风起\n\n　　林舟冷笑一声。\n\n【叮！任务完成】\n\n　　她低声说道：“走。”';
const {sections}=new EditorIndex(Text.of(novel.split('\n')),settings).value;
const at=(quote,extra)=>{const from=novel.indexOf(quote);return {from,to:from+quote.length,...extra};};
const lineEnd=quote=>novel.indexOf('\n',novel.indexOf(quote));
const entries=[
  at('林舟',{group:'marks',type:'ruby',value:'lín zhōu'}),at('林舟冷笑',{group:'marks',type:'strong'}),
  at('【叮！任务完成】',{group:'blocks',type:'style',value:'system'}),at('低声说道',{group:'marks',type:'style',value:'aside'}),
  {group:'inserts',type:'image',src:'插图/雪夜.png',alt:'雪夜 <山门>',from:lineEnd('林舟冷笑一声'),to:lineEnd('林舟冷笑一声')},
];
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);

test('segments put ruby around its base text and keep other formats inside',()=>{
  const items=inlineSegments(novel,0,novel.length,entries);
  assert.equal(items.map(item=>item.ruby===undefined?item.text:item.runs.map(run=>run.text).join('')).join(''),novel);
  const ruby=items.find(item=>item.ruby);assert.equal(ruby.ruby,'lín zhōu');assert.deepEqual(ruby.runs,[{text:'林舟',types:['strong']}]);
  assert.ok(items.some(item=>item.text==='低声说道'&&item.types.includes('style:aside')));
  assert.deepEqual([...imagesByLine(novel,entries).keys()],[lineEnd('林舟冷笑一声')]);
});

test('styles: built-ins, configured overrides, closed property set and CSS',()=>{
  const styles=resolveStyles({system:{label:'系统',block:true,align:'right'},whisper:{label:'耳语',size:'small'}});
  assert.equal(styles.system.align,'right');assert.equal(styles.letter.label,BUILTIN_STYLES.letter.label);assert.equal(styles.whisper.label,'耳语');
  assert.throws(()=>validateStyles({Bad:{label:'x'}}),/样式 ID/);assert.throws(()=>validateStyles({x:{label:'x',color:'pink'}}),/不支持/);
  // Any style may be used on characters (0.9.8); there alignment and indent do not apply and a frame is drawn inline.
  validateStyles({x:{label:'x',align:'center',frame:true}});
  assert.doesNotMatch(styleCss({label:'x',align:'center',indent:2,frame:true},{inline:true}),/text-align|padding-left|margin/);assert.match(styleCss({label:'x',frame:true},{inline:true}),/border:1px solid currentColor;border-radius:3px/);
  assert.match(styleSheet({x:{label:'x',align:'center'}}),/^\.style-x\{text-align:center\}\nspan\.style-x\{\}$/);
  assert.match(styleCss(BUILTIN_STYLES.system),/text-align:center;.*border:1px solid var\(--accent\)/);assert.doesNotMatch(styleSheet(BUILTIN_STYLES),/var\(/);
  assert.equal(parseVela(JSON.stringify({version:3,kind:'workspace',id:'w',project:{name:'航程'},styles:{whisper:{label:'耳语',size:'small'}}})).styles.whisper.size,'small');
  assert.throws(()=>parseVela(JSON.stringify({version:2,kind:'workspace',id:'w',project:{name:'航程'},styles:{}})),/version: 3/);
  assert.throws(()=>imagePath('../a.png'),/相对路径/);assert.throws(()=>imagePath('https://x/a.png'),/相对路径/);assert.throws(()=>imagePath('a.bmp'),/PNG/);assert.equal(imagePath('插图\\a.PNG'),'插图/a.PNG');
});

test('ruby, styles and illustrations survive the sidecar round trip and outside edits',()=>{
  const sidecar=readSidecar(sidecarText(buildSidecar('正文.txt',novel,entries)));
  assert.equal(sidecar.inserts[0].src,'插图/雪夜.png');assert.equal(sidecar.marks.find(mark=>mark.type==='ruby').value,'lín zhōu');
  const edited='序\n'+novel,result=resolveSidecar(edited,sidecar);
  assert.deepEqual(result.review,[]);assert.equal(result.entries.find(entry=>entry.type==='image').from,edited.indexOf('\n',edited.indexOf('林舟冷笑一声')));
});

test('Markdown: ruby as inline HTML, illustration as an image, styles left out',()=>{
  const {text}=chapterMarkdown(novel,sections,entries,{from:0});
  assert.match(text,/<ruby>\*\*林舟\*\*<rt>lín zhōu<\/rt><\/ruby>\*\*冷笑\*\*一声。/);
  assert.match(text,/一声。\n\n!\[雪夜 <山门>\]\(%E6%8F%92%E5%9B%BE\/%E9%9B%AA%E5%A4%9C\.png\)\n\n【叮！任务完成】/);
  assert.doesNotMatch(text,/style/);
});

test('HTML: ruby with fallback parentheses, style classes with a stylesheet, embedded illustrations',()=>{
  const styles=resolveStyles({}),withImage=chapterHtml(novel,sections,entries,{from:0},{styles,images:new Map([['插图/雪夜.png','data:image/png;base64,AAAA']])});
  assert.match(withImage.text,/<ruby><strong>林舟<\/strong><rp>（<\/rp><rt>lín zhōu<\/rt><rp>）<\/rp><\/ruby>/);
  assert.match(withImage.text,/<p class="style-system">【叮！任务完成】<\/p>/);assert.match(withImage.text,/<span class="style-aside">低声说道<\/span>/);
  assert.match(withImage.text,/\.style-system\{[^}]*text-align:center/);
  assert.match(withImage.text,/<figure class="illustration"><img src="data:image\/png;base64,AAAA" alt="雪夜 &lt;山门&gt;"\/><figcaption>雪夜 &lt;山门&gt;<\/figcaption><\/figure>/);
  const without=chapterHtml(novel,sections,entries,{from:0},{styles});assert.deepEqual(without.missing,['插图/雪夜.png']);assert.doesNotMatch(without.text,/<figure/);
});

test('EPUB: illustrations are packaged once with manifest items, styles reach the stylesheet, missing images are reported',()=>{
  const twice=[...entries,{group:'inserts',type:'image',src:'插图/雪夜.png',from:novel.length,to:novel.length}];
  const result=buildEpub({text:novel,sections,entries:twice,styles:resolveStyles({}),images:new Map([['插图/雪夜.png',{bytes:png,type:'image/png'}]]),metadata:{title:'航程'}}),files=unzipSync(result.bytes);
  assert.deepEqual([...files['OEBPS/images/illustration-001.png']],[...png]);assert.ok(!files['OEBPS/images/illustration-002.png']);
  const opf=strFromU8(files['OEBPS/content.opf']),chapter=strFromU8(files['OEBPS/text/chapter-001.xhtml']);
  assert.match(opf,/<item id="illustration-001" href="images\/illustration-001.png" media-type="image\/png"\/>/);
  assert.equal((chapter.match(/<img src="..\/images\/illustration-001.png"/g)||[]).length,2);
  assert.match(chapter,/<rt>lín zhōu<\/rt>/);assert.match(strFromU8(files['OEBPS/styles/book.css']),/\.style-letter\{/);
  assert.deepEqual(buildEpub({text:novel,sections,entries,metadata:{title:'航程'}}).missing,['插图/雪夜.png']);
});
