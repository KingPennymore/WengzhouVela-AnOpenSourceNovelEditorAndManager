import test from 'node:test';
import assert from 'node:assert/strict';
import {plainTexLine,findInPages,findSourceLine} from '../web/latex-sync.mjs';

test('source lines reduce to the words they print',()=>{
  assert.equal(plainTexLine('\\section{引言} 文舟是\\textbf{开源}小说工具。% 注释'),'引言文舟是开源小说工具。');
  assert.equal(plainTexLine('公式 $E=mc^2$ 见 \\ref{eq:one}。'),'公式见。');
  assert.equal(plainTexLine('\\usepackage{amsmath}'),'');
  assert.equal(plainTexLine('50\\% of \\emph{Words} here'),'50ofwordshere');
});
test('PDF lookup finds the page and falls back to shorter windows',()=>{
  const pages=['第一页 内容','2 引言 文舟 是开源小说工具。'];
  assert.equal(findInPages(pages,plainTexLine('文舟是\\textbf{开源}小说工具')).page,2);
  assert.equal(findInPages(pages,plainTexLine('文舟是开源小说工具，但这半句被改过')).page,2);
  assert.equal(findInPages(pages,'完全不存在的句子'),null);
});
test('PDF to source searches the current file, then project TeX files, and returns project-relative paths',()=>{
  const main={id:'a',name:'main.tex',path:'书/main.tex',text:'\\input{ch}\n序言文字'},chapter={id:'b',name:'ch.tex',path:'书/ch.tex',text:'\\section{第二章}\n她走进房间。'},other={id:'c',name:'x.tex',path:'别处/x.tex',text:'她走进房间。'};
  assert.deepEqual(findSourceLine([main,chapter,other],main,'她走进房间'),{path:'ch.tex',line:2});
  assert.deepEqual(findSourceLine([main,chapter],main,'序言文字'),{path:'main.tex',line:2});
  assert.equal(findSourceLine([main],main,'无'),null);
});
