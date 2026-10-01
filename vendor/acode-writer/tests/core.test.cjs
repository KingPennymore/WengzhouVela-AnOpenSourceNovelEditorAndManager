const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

test('独立中文标题、首尾全角缩进和章前内容', () => {
  const text = '前言\n　　一、炉边　\n正文。\n这句提到二、但不是标题\n二、渡口\n河岸';
  const index = C.buildIndex(text);
  assert.equal(index.chapterCount, 2);
  assert.deepEqual(index.sections.map(s => s.row), [0,1,4]);
  assert.equal(C.sectionAt(index, 0).title, '章前内容');
  assert.equal(C.sectionAt(index, 1).title, '一、炉边');
  assert.equal(C.sectionAt(index, 4).title, '二、渡口');
  assert.equal(index.sections[1].count, C.countText('正文。这句提到二、但不是标题'));
  assert.equal(index.sections[2].count, 2);
});
test('默认混合格式、数字、全角编号和第x卷', () => {
  const matcher = C.compileMatcher(C.DEFAULTS);
  for (const line of ['一、夜','二十一、雨','第一章 山','第１２卷','1. 水','２、火','# 尾声','## 段落']) assert.ok(matcher(line), line);
  for (const line of ['正文中第一章不是标题','', '   ', '#hashtag', '一、']) assert.equal(matcher(line), false, line);
});
test('CRLF、CR、LF 的行号与空章', () => {
  const index = C.buildIndex('一、甲\r\n二、乙\r正文\n三、丙');
  assert.deepEqual(index.sections.map(s => [s.row, s.count]), [[0,0],[1,2],[3,0]]);
  assert.equal(index.lineCount, 4);
});
test('标题默认排除、可包含；章节合计等于全文', () => {
  for (const includeHeading of [false, true]) {
    const index = C.buildIndex('引子\n一、甲\n你好。\n二、乙\nABC 12', {...C.DEFAULTS, includeHeading});
    assert.equal(index.total, index.sections.reduce((sum,s) => sum + s.count, 0));
    assert.equal(index.total, includeHeading ? 16 : 10);
  }
});
test('Unicode 码点、标点和英文字符口径', () => {
  assert.equal(C.countText('你好， A12\n\t　𠀀😀'), 8);
  assert.equal(C.countText('你好， A12\n\t　𠀀😀','letters'), 6);
});
test('无标题、空文稿、末尾换行均有可用章节', () => {
  assert.equal(C.buildIndex('').sections[0].count, 0);
  assert.equal(C.buildIndex('正文\n').sections[0].count, 2);
  assert.equal(C.sectionAt(C.buildIndex('一、甲\n正文\n'),2).title, '一、甲');
});
test('模板标点按字面识别，空格可省，序号支持大写数字', () => {
  let s = {...C.DEFAULTS, format:'template', template:'【{序号}】{标题}'};
  let match = C.compileMatcher(s);
  assert.ok(match('【壹】炉火')); assert.ok(match('【12】河岸')); assert.equal(match('【一】'),false);
  match = C.compileMatcher({...s, template:'第{序号}章 {标题}'});
  assert.ok(match('第一章炉火')); assert.ok(match('第2章 炉火'));
  assert.throws(() => C.compileMatcher({...s, template:'固定标题'}));
});
test('多条自定义正则与非法规则拒绝', () => {
  const s = {...C.DEFAULTS, format:'custom', custom:'序章|终章\n^第[0-9]+章.*$'};
  const match = C.compileMatcher(s);
  assert.ok(match('序章')); assert.ok(match('第12章 远山')); assert.equal(match('有序章吗'),false);
  for (const custom of ['', '[', '.*', '^$']) assert.throws(() => C.compileMatcher({...s,custom}));
});
test('标题插入、删除、撤销后的索引按新文本重新生成', () => {
  const original = '一、甲\n正文\n河岸';
  assert.equal(C.buildIndex(original).chapterCount,1);
  assert.equal(C.buildIndex('一、甲\n正文\n二、乙\n河岸').chapterCount,2);
  assert.equal(C.buildIndex('正文\n河岸').chapterCount,0);
  assert.equal(C.buildIndex(original).chapterCount,1);
});
test('文件类型匹配与设置数据校正', () => {
  assert.ok(C.supportsFile({filename:'Novel.TXT'}, C.DEFAULTS));
  assert.ok(C.supportsFile({filename:'untitled'}, C.DEFAULTS));
  assert.equal(C.supportsFile({filename:'app.js'}, C.DEFAULTS),false);
  assert.equal(C.supportsFile(null, {...C.DEFAULTS,allFiles:true}),false);
  assert.equal(C.normalizeSettings({format:'unknown', extensions:null}).extensions,'txt,md,markdown');
});
test('长篇文稿索引与二分章节定位', () => {
  const text = Array.from({length:500}, (_,i) => `第${i+1}章 标题\n${'汉字，'.repeat(600)}`).join('\n');
  const start = performance.now(), index = C.buildIndex(text), elapsed = performance.now() - start;
  assert.equal(index.chapterCount,500); assert.equal(index.total,900000);
  assert.equal(C.sectionAt(index, 998).title,'第500章 标题');
  console.log(`90万字 / 500章扫描：${elapsed.toFixed(1)} ms（此环境，非手机基准）`);
});

const I18n = require('../src/i18n.js');
test('英文标题识别大小写、数字、英文数词、罗马数字及中英混排', () => {
  const matcher = C.compileMatcher({format:'english'});
  for (const title of ['Chapter 1', 'CHAPTER ONE: Dawn', 'chapter IV — Home', 'Part Twenty-One', 'Book II. Night']) assert.ok(matcher(title), title);
  for (const title of ['Chapter', 'Chapter1', 'chapter zeros', 'A Chapter 1 in prose']) assert.equal(matcher(title), false, title);
  const index = C.buildIndex('一、山林\n甲乙\nChapter One: Dawn\nHello world!\nChapter IV\nGoodbye.');
  assert.equal(index.chapterCount, 3); assert.equal(index.sections[1].count, 11); assert.equal(index.total, 21);
});
test('英文模板占位符和字面标点，原中文模板保持兼容', () => {
  const matcher = C.compileMatcher({format:'template', template:'Chapter {number}: {title}'});
  assert.ok(matcher('Chapter 1: Dawn')); assert.ok(matcher('CHAPTER Twenty-One: Home'));
  assert.equal(matcher('Chapter 1 — Dawn'), false);
  assert.ok(C.compileMatcher({format:'template',template:'第{序号}章 {标题}'})('第三章 山河'));
  assert.equal(C.compileMatcher({format:'custom',custom:'Chapter [0-9]+'})('chapter 1'),false);
});
test('自动语言跟随宿主，明确选择优先，旧设置升级默认自动', () => {
  for (const locale of ['zh-cn','zh_TW','zh','ZH-Hans']) assert.equal(I18n.resolve('auto',locale),'zh');
  for (const locale of ['en-us','en','fr-fr']) assert.equal(I18n.resolve('auto',locale),'en');
  assert.equal(I18n.resolve('zh','en-us'),'zh'); assert.equal(I18n.resolve('en','zh-cn'),'en');
  assert.equal(C.normalizeSettings({}).language,'auto'); assert.equal(C.normalizeSettings({language:'bad'}).language,'auto');
});
test('翻译仅替换参数，不改写用户标题和模板占位符', () => {
  assert.equal(I18n.translate('en','第{row}行：{title}',{row:2,title:'一、山河 {count}'}),'Line 2: 一、山河 {count}');
  assert.equal(I18n.translate('en','当前文稿'),'Current document');
  assert.equal(I18n.translate('zh','第{row}行：{title}',{row:2,title:'Dawn'}),'第2行：Dawn');
});
test('所有规则验证错误都支持英文说明', () => {
  for (const [settings, code] of [[{format:'template',template:'Chapter'},'template'],[{format:'custom',custom:''},'empty'],[{format:'custom',custom:'x'.repeat(2001)},'long'],[{format:'custom',custom:'['},'regex'],[{format:'custom',custom:'.*'},'blank']]) {
    assert.throws(()=>C.compileMatcher(settings), error => {
      assert.equal(error.code, code); assert.doesNotMatch(I18n.error('en', error), /[\p{Script=Han}]/u); return true;
    });
  }
});

test('多种标题格式组合、停用及重复规则不产生重复章节', () => {
  const rules=[{format:'chinese',value:'',enabled:true},{format:'template',value:'【{序号}】{标题}',enabled:true},{format:'custom',value:'序章|终章',enabled:true},{format:'english',value:'',enabled:false},{format:'chinese',value:'',enabled:true}];
  const settings={format:'multi',rules};
  const text='序章\n甲\n一、山河\n乙丙\n【二】归来\n丁\nChapter 3: Home\n戊';
  const index=C.buildIndex(text,settings);assert.equal(index.chapterCount,3);
  assert.deepEqual(index.sections.map(s=>s.title),['序章','一、山河','【二】归来']);
  rules[3].enabled=true;assert.equal(C.buildIndex(text,settings).chapterCount,4);
  const normalized=C.normalizeSettings(settings);normalized.rules[0].enabled=false;assert.equal(rules[0].enabled,true);
});
test('组合中非法规则定位，全部停用与过多规则不可保存', () => {
  assert.throws(()=>C.compileMatcher({format:'multi',rules:[{format:'chinese'},{format:'custom',value:'['}]}),e=>{
    assert.equal(e.ruleNumber,2);assert.match(I18n.error('en',e),/Rule 2: Invalid/);return true;
  });
  assert.throws(()=>C.compileMatcher({format:'multi',rules:[]}),/至少启用/);
  assert.throws(()=>C.compileMatcher({format:'multi',rules:Array.from({length:33},()=>({format:'chinese'}))}),/32/);
  assert.ok(C.compileMatcher({format:'multi',rules:[{format:'chinese'},{format:'custom',value:'[',enabled:false}]})('一、章'));
});
