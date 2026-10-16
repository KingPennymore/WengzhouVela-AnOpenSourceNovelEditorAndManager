import test from 'node:test';
import assert from 'node:assert/strict';
import {Text} from '@codemirror/state';
import {EditorIndex} from '../web/editor-index.mjs';
import {exportLines,chapterMarkdown,chapterHtml} from '../web/rich-text-export.mjs';
import {inlineRuns} from '../web/rich-text.mjs';

const settings={includeHeading:false,countMode:'chars',templates:[]};
const novel='第一章 风起\n\n　　林舟冷笑一声，“走吧”。\n\n　　苏晚心中暗道不好。\n\n——完——\n\n第二章 云涌\n\n　　2*3 不是 #1。';
const {sections}=new EditorIndex(Text.of(novel.split('\n')),settings).value;
const at=(quote,group='marks',type='strong',value)=>{const from=novel.indexOf(quote);return {group,type,value,from,to:from+quote.length};};
const entries=[at('林舟冷笑'),at('“走吧”'),at('不好','marks','emphasis'),at('——完——','blocks','align','center')].map(entry=>entry.group==='blocks'?{...entry,to:entry.from+5}:entry);

test('inline runs split text at format edges and join back to the original',()=>{
  const runs=inlineRuns(novel,0,novel.length,entries);
  assert.equal(runs.map(run=>run.text).join(''),novel);
  assert.deepEqual(runs.filter(run=>run.types.length).map(run=>[run.text,run.types]),[['林舟冷笑',['strong']],['“走吧”',['strong']],['不好',['emphasis']]]);
});

test('export lines trim blank lines and mark chapter titles',()=>{
  const [first]=exportLines(novel,sections,{from:0});
  assert.equal(first[0].text,'第一章 风起');assert.equal(first[0].heading,true);assert.equal(first.at(-1).text,'——完——');
  assert.equal(exportLines(novel,sections,{from:0,includeTitle:false})[0][0].text,'　　林舟冷笑一声，“走吧”。');
});

test('Markdown keeps bold, uses HTML next to CJK punctuation and escapes Markdown characters in the text',()=>{
  const {text,chapters}=chapterMarkdown(novel,sections,entries,{from:0,to:1});
  assert.equal(chapters,2);
  assert.equal(text,'## 第一章 风起\n\n　　**林舟冷笑**一声，<strong>“走吧”</strong>。\n\n　　苏晚心中暗道*不好*。\n\n——完——\n\n## 第二章 云涌\n\n　　2\\*3 不是 #1。\n');
  assert.equal(chapterMarkdown(novel,sections,[],{from:1,includeTitle:false}).text,'　　2\\*3 不是 #1。\n');
});

test('HTML is a standalone offline page with formats, alignment and escaped text',()=>{
  const {text}=chapterHtml(novel,sections,entries,{from:0,to:1},{title:'航程 <1>'});
  assert.match(text,/^<!doctype html>/);assert.match(text,/<title>航程 &lt;1&gt;<\/title>/);assert.doesNotMatch(text,/<script|https?:/);
  assert.match(text,/<h2>第一章 风起<\/h2>/);assert.match(text,/<p>　　<strong>林舟冷笑<\/strong>一声，<strong>“走吧”<\/strong>。<\/p>/);
  assert.match(text,/<em class="emphasis">不好<\/em>/);assert.match(text,/<p class="center">——完——<\/p>/);
  assert.equal((text.match(/<section>/g)||[]).length,2);
});
