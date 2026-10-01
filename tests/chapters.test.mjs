import {test} from 'node:test';
import assert from 'node:assert/strict';
import Writer from '../vendor/acode-writer/src/core.js';
import {chapterSettings,chapterMatcher} from '../web/chapters.mjs';

test('自动识别标准标题与多个模板，旧单一识别模式不会限制标准标题',()=>{
  const settings=chapterSettings({format:'chinese',titleTemplates:['【{序号}】{标题}','幕 {number} — {title}']});
  assert.equal(settings.format,'auto');
  const matches=chapterMatcher(settings);
  for(const line of ['第一章 起航','# 第二章','Chapter IV Return','一、开篇','【二】航路','幕 Three — 海岸'])assert.equal(matches(line),true,line);
  for(const line of ['', '正文的内容','这是第一章的故事'])assert.equal(matches(line),false,line);
  const index=Writer.buildIndex('第一章 起航\n正文\n【二】航路\n段落\n幕 Three — 海岸',settings,matches);
  assert.equal(index.chapterCount,3);
});
test('保留旧模板并去重，拒绝没有占位符或超过限额的模板',()=>{
  assert.deepEqual(chapterSettings({format:'template',template:'【{标题}】'}).titleTemplates,['【{标题}】']);
  assert.deepEqual(chapterSettings({format:'multi',rules:[{format:'template',value:'{序号}：{标题}'},{format:'template',value:'忽略',enabled:false}]}).titleTemplates,['{序号}：{标题}']);
  assert.deepEqual(chapterSettings({titleTemplates:['  【{标题}】 ','【{标题}】','']}).titleTemplates,['【{标题}】']);
  assert.throws(()=>chapterMatcher({titleTemplates:['没有占位符']}),/模板需包含/);
  assert.throws(()=>chapterSettings({titleTemplates:Array.from({length:33},(_,i)=>`${i} {标题}`)}),/32/);
  assert.throws(()=>chapterSettings({titleTemplates:['a'.repeat(257)]}),/256/);
});
