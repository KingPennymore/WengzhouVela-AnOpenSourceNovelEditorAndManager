import test from 'node:test';
import assert from 'node:assert/strict';
import {Text} from '@codemirror/state';
import {EditorIndex} from '../web/editor-index.mjs';
import {chapterExport,chapterFileName,markdownToPlain} from '../web/chapter-export.mjs';

const settings={includeHeading:false,countMode:'chars',templates:[]};
const index=text=>new EditorIndex(Text.of(text.split('\n')),settings).value;
const novel='前言内容\n\n第一章 风起\n\n山雨欲来。\n\n\n第二章 云涌\n云涌正文。\r\n\n第三章 落幕\n终了。';

test('one chapter exports its title and body without surrounding blank lines',()=>{
  const sections=index(novel.replace(/\r/g,'')),at=sections.sections.findIndex(section=>section.title==='第一章 风起');
  assert.deepEqual(chapterExport(novel,sections.sections,{from:at}),{text:'第一章 风起\n\n山雨欲来。\n',chapters:1});
  assert.equal(chapterExport(novel,sections.sections,{from:at,includeTitle:false}).text,'山雨欲来。\n');
});
test('a chapter range is joined with one empty line and keeps the pre-chapter section when chosen',()=>{
  const {sections}=index(novel.replace(/\r/g,''));
  assert.equal(sections[0].title,'章前内容');
  assert.equal(chapterExport(novel,sections,{from:2,to:3}).text,'第二章 云涌\n云涌正文。\n\n第三章 落幕\n终了。\n');
  assert.equal(chapterExport(novel,sections,{from:0}).text,'前言内容\n');
  assert.throws(()=>chapterExport(novel,sections,{from:3,to:1}),/范围/);assert.throws(()=>chapterExport(novel,sections,{from:9}),/范围/);
});
test('Markdown marks are removed only on request and fenced code keeps its content',()=>{
  assert.equal(markdownToPlain('# 第一章\n> 引文 **重点** 与 *强调* 和 ~~删除~~\n[链接](https://x) ![图](a.png) `代码`\n```\n原样 **保留**\n```\n2*3*4'),'第一章\n引文 重点 与 强调 和 删除\n链接 图 代码\n原样 **保留**\n2*3*4');
  const md='# 第一章\n\n**她**来了。\n',{sections}=index(md);
  assert.equal(chapterExport(md,sections,{from:0,stripMarkdown:true}).text,'第一章\n\n她来了。\n');assert.equal(chapterExport(md,sections,{from:0}).text,'# 第一章\n\n**她**来了。\n');
});
test('file names are safe and describe the chapter or range',()=>{
  const sections=[{title:'第一章 风/起?'},{title:'第五章'}];
  assert.equal(chapterFileName('我的书.txt',sections,0),'我的书 - 第一章 风 起.txt');
  assert.equal(chapterFileName('我的书.md',sections,0,1),'我的书 - 第一章 风 起 至 第五章.txt');
});
