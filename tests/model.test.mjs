import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chapterPosition,normalizeText,validateWorkspace,newDocument,encodeContent,decodeContent,repoPath,fileName} from '../web/model.mjs';
const Writer=createRequire(import.meta.url)('../vendor/acode-writer/src/core.js');
test('章节跳转使用标题行和下一章节之前的完整范围，包含章前内容',()=>{
  const text='序言\n\n第一章 开始\n甲乙\n\n第二章 继续\n丙丁';
  const idx=Writer.buildIndex(text);
  assert.equal(chapterPosition(text,idx,text.indexOf('甲'),'top'),text.indexOf('第一章'));
  assert.equal(chapterPosition(text,idx,text.indexOf('甲'),'bottom'),text.indexOf('第二章')-1);
  assert.equal(chapterPosition(text,idx,0,'top'),0);
  assert.equal(chapterPosition(text,idx,0,'bottom'),text.indexOf('第一章')-1);
  assert.equal(chapterPosition(text,idx,text.length,'bottom'),text.length);
});
test('空章节、空文件和未识别章节均有合法跳转位置',()=>{
  for(const text of ['', '没有标题\n甲', '第一章\n第二章\n']){
    const idx=Writer.buildIndex(text);
    for(let pos=0;pos<=text.length;pos++)for(const edge of ['top','bottom']){
      const target=chapterPosition(text,idx,pos,edge);assert.ok(target>=0&&target<=text.length);
    }
  }
  const text='第一章\n第二章\n';const idx=Writer.buildIndex(text);
  assert.equal(chapterPosition(text,idx,0,'bottom'),3);
  assert.equal(chapterPosition('',Writer.buildIndex(''),0,'top'),0);
});
test('Windows 换行、BOM 和中文内容可以无损归一化与编码',()=>{
  const text=normalizeText('\uFEFF第一章\r\n甲𠮷😀\r正文');
  assert.equal(text,'第一章\n甲𠮷😀\n正文');assert.equal(decodeContent(encodeContent(text)),text);
  assert.throws(()=>decodeContent('/w=='));
});
test('损坏或重复文稿数据被拒绝，有效文稿可回退到可用活动文件',()=>{
  const doc=newDocument('全书.txt','第一章\n正文');
  assert.equal(validateWorkspace({version:1,documents:[]}).activeId,null);
  assert.throws(()=>validateWorkspace({version:1,documents:'corrupt'}));
  assert.throws(()=>validateWorkspace({version:1,documents:[doc,doc]}));
  const value={version:1,documents:[doc],activeId:'missing'};
  assert.equal(validateWorkspace(value).activeId,doc.id);
});
test('仓库路径支持中文嵌套路径，拒绝越界、空路径和控制字符',()=>{
  assert.equal(repoPath('小说/全书.txt'),'小说/全书.txt');
  for(const p of ['', '../a.txt','a/../b','/a','a//b','a\\b','a\nb'])assert.throws(()=>repoPath(p));
  assert.equal(fileName('新小说'),'新小说.md');assert.throws(()=>fileName('a/b'));
});
