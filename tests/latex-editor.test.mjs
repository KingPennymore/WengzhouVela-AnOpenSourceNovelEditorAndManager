import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import {checkLatex,texHeading,openEnvironments,latexCompletion,projectFacts,texCommands,texEnvironments} from '../web/latex-editor.mjs';
import {EditorIndex} from '../web/editor-index.mjs';
import {Text} from '@codemirror/state';

const complete=(text,doc={id:'a',name:'main.tex',path:'书/main.tex',text},project={},explicit=true)=>{const state=EditorState.create({doc:text});return latexCompletion(doc,()=>project)(new CompletionContext(state,text.length,explicit));};
const messages=text=>checkLatex(text).map(item=>item.message);

test('static checks find unbalanced braces, mismatched environments, duplicate labels and a missing document body',()=>{
  assert.deepEqual(checkLatex('\\documentclass{article}\n\\begin{document}\n\\section{A}\\label{a} 50\\% \\{ok\\}\n\\end{document}'),[]);
  assert.match(messages('\\textbf{open').join(),/左花括号/);assert.match(messages('close}').join(),/右花括号/);
  assert.match(messages('\\begin{itemize}\n\\end{enumerate}').join(),/不匹配/);assert.match(messages('\\end{figure}').join(),/多余的 \\end/);
  assert.match(messages('\\begin{equation}x').join(),/没有对应的 \\end\{equation\}/);
  assert.match(messages('\\label{x}\\label{x}').join(),/重复/);assert.match(messages('\\documentclass{ctexart}').join(),/缺少 \\begin\{document\}/);
  assert.deepEqual(checkLatex('% \\begin{x} {\n\\begin{verbatim}\n{ \\end{nothing}\n\\end{verbatim}'),[],'Comments and verbatim bodies are ignored');
});
test('outline headings show the printed title with indentation by level',()=>{
  assert.equal(texHeading('\\section{引言}'),'　引言');assert.equal(texHeading('\\chapter*{序 \\emph{章}}'),'序 章');assert.equal(texHeading('\\subsection[短]{长标题} % note'),'　　长标题');
  assert.equal(texHeading('正文 \\section{不在行首也不算}'),null);
  const index=new EditorIndex(Text.of(['\\documentclass{ctexbook}','\\begin{document}','\\chapter{第一章}','正文','\\section{一节}','\\end{document}']),{tex:true,countMode:'chars'});
  assert.deepEqual(index.value.sections.filter(section=>section.heading).map(section=>section.title),['第一章','　一节']);
});
test('completion offers commands, whole environments, labels, citations, packages and files',()=>{
  const commands=complete('\\sec');assert.ok(commands.options.some(option=>option.label==='\\section'));assert.equal(commands.from,0);
  assert.equal(complete('\\s',undefined,{},false)?.options.length>0,true);assert.equal(complete('\\',undefined,{},false),null,'A lone backslash waits for a letter unless asked');
  const env=complete('\\begin{ite');assert.ok(env.options.some(option=>option.label==='itemize'));
  const project={documents:[{path:'书/main.tex',text:'\\label{fig:a}\\label{sec:b}'},{path:'书/ch1.tex',text:''},{path:'书/refs.bib',text:'@book{knuth84, title={x}}'}],entries:['书/img/cover.png'],packages:['tex/mypkg.sty']};
  assert.deepEqual(complete('见 \\ref{',undefined,project).options.map(option=>option.label).sort(),['fig:a','sec:b']);
  assert.deepEqual(complete('\\cite{a,',undefined,project).options.map(option=>option.label),['knuth84']);
  assert.ok(complete('\\usepackage{',undefined,project).options.some(option=>option.label==='mypkg'));
  assert.deepEqual(complete('\\input{',undefined,project).options.map(option=>option.label),['ch1']);
  assert.deepEqual(complete('\\includegraphics[width=1cm]{',undefined,project).options.map(option=>option.label),['img/cover.png']);
  assert.deepEqual(complete('\\begin{a}\\begin{b}\\end{').options.map(option=>option.label),['b','a']);
});
test('catalog and facts are well formed',()=>{
  assert.ok(texCommands.length>=75);assert.ok(texEnvironments.some(item=>item.name==='figure'));
  assert.deepEqual(openEnvironments('\\begin{document}\\begin{itemize}\\end{itemize}% \\begin{x}'),['document']);
  assert.deepEqual(projectFacts([{path:'a.bib',text:'@article{k1,\n}'},{path:'b.tex',text:'\\bibitem{k2}'}]).citations.sort(),['k1','k2']);
});
