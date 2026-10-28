import {t,say} from './i18n.mjs';
import {StateEffect,StateField,EditorSelection,Prec} from '@codemirror/state';
import {keymap,EditorView} from '@codemirror/view';
import {foldService,foldGutter,foldKeymap} from '@codemirror/language';
import {linter,lintGutter} from '@codemirror/lint';
import {snippetCompletion} from '@codemirror/autocomplete';
import {LEVELS,texHeading} from './tex-heading.mjs';
export {texHeading};

// ---------------------------------------------------------------------------------------------------------------------
// Catalog: commands and environments offered by completion. Templates use CodeMirror snippet fields (${name}).
// ---------------------------------------------------------------------------------------------------------------------
const C=(label,template,detail,group)=>({label,template,detail,group});
export const texCommands=[
  C('documentclass','\\documentclass[${UTF8}]{${ctexart}}','文档类','结构'),
  C('usepackage','\\usepackage{${package}}','引入宏包','结构'),
  C('title','\\title{${标题}}','标题','结构'),
  C('author','\\author{${作者}}','作者','结构'),
  C('date','\\date{${\\today}}','日期','结构'),
  C('maketitle','\\maketitle','生成标题','结构'),
  C('tableofcontents','\\tableofcontents','目录','结构'),
  C('part','\\part{${标题}}','部分','章节'),
  C('chapter','\\chapter{${标题}}','章（book/report/ctexbook）','章节'),
  C('section','\\section{${标题}}','节','章节'),
  C('subsection','\\subsection{${标题}}','小节','章节'),
  C('subsubsection','\\subsubsection{${标题}}','子小节','章节'),
  C('paragraph','\\paragraph{${标题}}','段落标题','章节'),
  C('appendix','\\appendix','附录','章节'),
  C('frontmatter','\\frontmatter','前言部分','章节'),
  C('mainmatter','\\mainmatter','正文部分','章节'),
  C('backmatter','\\backmatter','后记部分','章节'),
  C('textbf','\\textbf{${文字}}','粗体','文字'),
  C('textit','\\textit{${文字}}','斜体','文字'),
  C('emph','\\emph{${文字}}','强调','文字'),
  C('underline','\\underline{${文字}}','下划线','文字'),
  C('texttt','\\texttt{${文字}}','等宽','文字'),
  C('textsc','\\textsc{${文字}}','小型大写','文字'),
  C('footnote','\\footnote{${脚注}}','脚注','文字'),
  C('marginpar','\\marginpar{${旁注}}','旁注','文字'),
  C('quad','\\quad','空白','文字'),
  C('qquad','\\qquad','双倍空白','文字'),
  C('newline','\\newline','换行','文字'),
  C('newpage','\\newpage','换页','文字'),
  C('clearpage','\\clearpage','清页','文字'),
  C('noindent','\\noindent','取消缩进','文字'),
  C('centering','\\centering','居中','文字'),
  C('vspace','\\vspace{${1em}}','竖直间距','文字'),
  C('hspace','\\hspace{${1em}}','水平间距','文字'),
  C('zihao','\\zihao{${5}}','字号（ctex）','中文'),
  C('songti','\\songti','宋体（ctex）','中文'),
  C('heiti','\\heiti','黑体（ctex）','中文'),
  C('kaishu','\\kaishu','楷体（ctex）','中文'),
  C('fangsong','\\fangsong','仿宋（ctex）','中文'),
  C('ctexset','\\ctexset{${section}={${format=\\Large\\bfseries}}}','ctex 格式设置','中文'),
  C('label','\\label{${key}}','标签','引用'),
  C('ref','\\ref{${key}}','引用编号','引用'),
  C('eqref','\\eqref{${key}}','引用公式','引用'),
  C('pageref','\\pageref{${key}}','引用页码','引用'),
  C('cite','\\cite{${key}}','引用文献','引用'),
  C('bibliography','\\bibliography{${refs}}','参考文献库','引用'),
  C('bibliographystyle','\\bibliographystyle{${plain}}','文献样式','引用'),
  C('url','\\url{${https://}}','网址','引用'),
  C('href','\\href{${https://}}{${文字}}','链接','引用'),
  C('includegraphics','\\includegraphics[width=${0.8}\\linewidth]{${图片}}','插入图片','浮动体'),
  C('caption','\\caption{${说明}}','图表标题','浮动体'),
  C('input','\\input{${文件}}','插入文件','文件'),
  C('include','\\include{${文件}}','插入章节文件','文件'),
  C('item','\\item ${内容}','列表项','列表'),
  C('frac','\\frac{${分子}}{${分母}}','分数','数学'),
  C('sqrt','\\sqrt{${表达式}}','根号','数学'),
  C('sum','\\sum_{${i=1}}^{${n}}','求和','数学'),
  C('int','\\int_{${a}}^{${b}}','积分','数学'),
  C('lim','\\lim_{${x \\to 0}}','极限','数学'),
  C('left','\\left( ${内容} \\right)','自适应括号','数学'),
  C('mathbb','\\mathbb{${R}}','黑板粗体','数学'),
  C('mathrm','\\mathrm{${文字}}','正体','数学'),
  C('text','\\text{${文字}}','数学中的文字','数学'),
  C('cdot','\\cdot','点乘','数学'),
  C('times','\\times','乘号','数学'),
  C('infty','\\infty','无穷','数学'),
  C('alpha','\\alpha','α','希腊字母'),
  C('beta','\\beta','β','希腊字母'),
  C('gamma','\\gamma','γ','希腊字母'),
  C('delta','\\delta','δ','希腊字母'),
  C('lambda','\\lambda','λ','希腊字母'),
  C('pi','\\pi','π','希腊字母'),
  C('sigma','\\sigma','σ','希腊字母'),
  C('theta','\\theta','θ','希腊字母'),
  C('omega','\\omega','ω','希腊字母'),
  C('newcommand','\\newcommand{\\${name}}[${1}]{${定义}}','定义命令','定义'),
  C('renewcommand','\\renewcommand{\\${name}}{${定义}}','重定义命令','定义'),
  C('setlength','\\setlength{\\${parindent}}{${2em}}','设置长度','定义'),
  C('begin','\\begin{${environment}}\n\t${}\n\\end{${environment}}','环境','环境')
];
const E=(name,body,detail)=>({name,body,detail});
export const texEnvironments=[
  E('document','\n\t${}\n','文档正文'),
  E('abstract','\n\t${摘要}\n','摘要'),
  E('itemize','\n\t\\item ${}\n','无序列表'),
  E('enumerate','\n\t\\item ${}\n','有序列表'),
  E('description','\n\t\\item[${术语}] ${说明}\n','描述列表'),
  E('equation','\n\t${公式}\n','编号公式'),
  E('equation*','\n\t${公式}\n','不编号公式'),
  E('align','\n\t${a} &= ${b} \\\\\n','对齐公式'),
  E('align*','\n\t${a} &= ${b}\n','对齐公式（不编号）'),
  E('gather','\n\t${公式}\n','居中公式组'),
  E('figure','[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${图片}}\n\t\\caption{${说明}}\n\t\\label{fig:${key}}\n','图'),
  E('table','[htbp]\n\t\\centering\n\t\\caption{${说明}}\n\t\\label{tab:${key}}\n\t\\begin{tabular}{${lll}}\n\t\t${} \\\\\n\t\\end{tabular}\n','表'),
  E('tabular','{${lll}}\n\t${a} & ${b} & ${c} \\\\\n','表格'),
  E('center','\n\t${}\n','居中'),
  E('quote','\n\t${引文}\n','引文'),
  E('quotation','\n\t${引文}\n','长引文'),
  E('verse','\n\t${诗句}\n','诗歌'),
  E('verbatim','\n${}\n','原样输出'),
  E('minipage','{${0.45}\\linewidth}\n\t${}\n','小页'),
  E('theorem','\n\t${}\n','定理'),
  E('proof','\n\t${}\n','证明'),
  E('thebibliography','{${99}}\n\t\\bibitem{${key}} ${条目}\n','参考文献列表')
];
const PACKAGES=['amsmath','amssymb','amsthm','graphicx','hyperref','geometry','ctex','xeCJK','fontspec','booktabs','longtable','multirow','array','xcolor','tikz','listings','caption','subcaption','float','enumitem','fancyhdr','titlesec','setspace','natbib','biblatex','url','siunitx','mathtools','bm','ulem'];
const CLASSES=['ctexart','ctexrep','ctexbook','ctexbeamer','article','report','book','beamer','letter'];

// ---------------------------------------------------------------------------------------------------------------------
// Project facts used by completion: labels and citation keys across the project, files to include, images.
// ---------------------------------------------------------------------------------------------------------------------
export function projectFacts(documents){
  const labels=new Set(),citations=new Set(),files=[],images=[];
  for(const item of documents||[]){
    const path=item.path||item.name||'',text=String(item.text||'');
    if(/\.(tex|ltx|latex)$/i.test(path)){
      files.push(path);
      for(const match of text.matchAll(/\\label\{([^}]+)\}/g)) labels.add(match[1]);
      for(const match of text.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) citations.add(match[1]);
    }
    if(/\.bib$/i.test(path)) for(const match of text.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)) citations.add(match[1]);
    if(/\.(png|jpe?g|pdf|eps|svg)$/i.test(path)) images.push(path);
  }
  return {labels:[...labels],citations:[...citations],files,images};
}
const relative=(from,path)=>{
  const base=from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'';
  return base&&path.startsWith(base)?path.slice(base.length):path;
};

/** One completion source for TeX: commands, \begin environments, labels / citations, packages, classes and files. */
export function latexCompletion(doc,getProject=()=>({})){
  return context=>{
    const before=context.state.doc.sliceString(Math.max(0,context.pos-300),context.pos);
    const argument=before.match(/\\(ref|eqref|pageref|autoref|cref|cite|citep|citet|nocite|usepackage|documentclass|input|include|includegraphics|begin|end)(?:\[[^\]]*\])?\{([^}]*)$/);
    if(argument){
      const [,command,typed]=argument,prefix=typed.split(',').at(-1).trimStart(),from=context.pos-prefix.length,project=getProject()||{},facts=projectFacts([...(project.documents||[doc]),...(project.entries||[]).map(path=>({path}))]),own=doc.path||doc.name;
      let options=[];
      if(/ref$/.test(command)) options=facts.labels.map(label=>({label,type:'variable',detail:t('标签')}));
      else if(/cite/.test(command)) options=facts.citations.map(label=>({label,type:'variable',detail:t('文献')}));
      else if(command==='usepackage'){
        const own=new Set(PACKAGES);
        for(const value of project.packages||[]) if(value.endsWith('.sty')) own.add(value.split('/').at(-1).slice(0,-4));
        options=[...own].map(label=>({label,type:'namespace',detail:t('宏包')}));
      }
      else if(command==='documentclass') options=CLASSES.map(label=>({label,type:'class',detail:t('文档类')}));
      else if(command==='begin'){
        const line=context.state.doc.lineAt(context.pos),after=context.state.doc.sliceString(context.pos,line.to);
        if(/^[^}]*\}/.test(after)) options=texEnvironments.map(item=>({label:item.name,type:'type',detail:t(item.detail)})); else{
          // Typing the name inside \begin{…}: complete the whole environment including its body and \end.
          const indent=/^\s*/.exec(line.text)[0];
          options=texEnvironments.map(item=>snippetCompletion(item.name.replace(/\*/g,'\\*')+'}'+item.body.replace(/\n/g,'\n'+indent)+'\\end{'+item.name+'}',{label:item.name,type:'type',detail:t(item.detail)}));
        }
      }
      else if(command==='end'){
        const open=openEnvironments(context.state.doc.sliceString(0,context.pos));
        options=open.reverse().map((label,index)=>({label,type:'type',boost:20-index}));
      }
      else if(command==='includegraphics') options=facts.images.map(path=>({label:relative(own,path),type:'text',detail:t('图片')}));
      else options=facts.files.filter(path=>path!==own).map(path=>({label:relative(own,path).replace(/\.tex$/i,''),type:'text',detail:t('文件')}));
      return {from,options,validFor:/^[^},]*$/};
    }
    const word=context.matchBefore(/\\[A-Za-z]*$/);
    if(!word||!context.explicit&&word.text.length<2) return null;
    return {from:word.from,options:texCommands.map(item=>snippetCompletion(item.template,{label:'\\'+item.label,detail:t(item.detail),section:t(item.group),type:item.group==='环境'?'type':'function',boost:item.group==='章节'?2:0})),validFor:/^\\[A-Za-z]*$/};
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Structure: environments, outline headings, folding.
// ---------------------------------------------------------------------------------------------------------------------
const VERBATIM=/^(verbatim\*?|lstlisting|minted|comment)$/;
/** Environments still open at the end of `text`, innermost last. */
export function openEnvironments(text){
  const stack=[];
  for(const match of stripComments(text).matchAll(/\\(begin|end)\{([^}]+)\}/g)){
    if(match[1]==='begin') stack.push(match[2]); else{
      const at=stack.lastIndexOf(match[2]);
      if(at>=0) stack.splice(at,1);
    }
  }
  return stack;
}
const stripComments=text=>text.replace(/(^|[^\\])%.*$/gm,(all,lead)=>lead+' '.repeat(all.length-lead.length));
function foldLatex(state,lineStart,lineEnd){
  const line=state.doc.lineAt(lineStart),text=line.text;
  const begin=/\\begin\{([^}]+)\}/.exec(text);
  if(begin&&!new RegExp('\\\\end\\{'+begin[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\}').test(text.slice(begin.index))){
    let depth=0;
    for(let number=line.number+1;number<=state.doc.lines;number++){
      const next=state.doc.line(number).text;
      for(const match of next.matchAll(/\\(begin|end)\{([^}]+)\}/g)){
        if(match[2]!==begin[1]) continue;
        if(match[1]==='begin') depth++; else if(depth) depth--; else return number>line.number+1||next.trim()!==match[0]?{from:lineEnd,to:state.doc.line(number).from-1}:null;
      }
    }
    return null;
  }
  const heading=/^\s*\\(part|chapter|section|subsection|subsubsection)\*?\s*[[{]/.exec(text);
  if(heading){
    const level=LEVELS[heading[1]];
    for(let number=line.number+1;number<=state.doc.lines;number++){
      const next=state.doc.line(number).text,other=/^\s*\\(part|chapter|section|subsection|subsubsection)\*?\s*[[{]/.exec(next);
      if(other&&LEVELS[other[1]]<=level||/\\end\{document\}|\\appendix|\\bibliography\{/.test(next)){
        const to=state.doc.line(number-1).to;
        return to>lineEnd?{from:lineEnd,to}:null;
      }
    }
    const to=state.doc.length;
    return to>lineEnd?{from:lineEnd,to}:null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Checks while typing, plus the last compile's diagnostics for this file.
// ---------------------------------------------------------------------------------------------------------------------
/** Static problems: unbalanced braces, mismatched \begin / \end, duplicate labels, missing \begin{document}. */
export function checkLatex(text){
  const problems=[],source=stripComments(text),stack=[],labels=new Map();
  let verbatim=null;
  const tokens=/\\begin\{([^}]+)\}|\\end\{([^}]+)\}|\\label\{([^}]+)\}|\\[{}%\\]|[{}]/g;
  for(const match of source.matchAll(tokens)){
    const at=match.index,token=match[0];
    if(verbatim){
      if(match[2]===verbatim) verbatim=null;
      continue;
    }
    if(match[1]){
      stack.push({name:match[1],from:at,to:at+token.length});
      if(VERBATIM.test(match[1])) verbatim=match[1];
      continue;
    }
    if(match[2]){
      const open=stack.at(-1);
      if(!open) problems.push({from:at,to:at+token.length,severity:'error',message:say(`多余的 \\end{${match[2]}}，没有对应的 \\begin。`,`Extra \\end{${match[2]}} without a matching \\begin.`)}); else if(open.name!==match[2]){
        problems.push({from:at,to:at+token.length,severity:'error',message:say(`\\end{${match[2]}} 与 \\begin{${open.name}} 不匹配。`,`\\end{${match[2]}} does not match \\begin{${open.name}}.`)});
        const index=stack.map(item=>item.name).lastIndexOf(match[2]);
        if(index>=0) stack.splice(index);
      }else stack.pop();
      continue;
    }
    if(match[3]){
      if(labels.has(match[3])) problems.push({from:at,to:at+token.length,severity:'warning',message:say(`标签 ${match[3]} 重复定义。`,`Label ${match[3]} is defined more than once.`)}); else labels.set(match[3],at);
      continue;
    }
  }
  // Braces are counted on a copy with verbatim bodies and \verb|…| blanked out; escaped braces never count.
  const counted=source.replace(/\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}/g,all=>' '.repeat(all.length)).replace(/\\verb\*?([^A-Za-z\s])[^\n]*?\1/g,all=>' '.repeat(all.length));
  let depth=0,first=-1;
  for(const match of counted.matchAll(/\\[{}\\]|[{}]/g)){
    if(match[0]==='{'){
      if(!depth) first=match.index;
      depth++;
    }else if(match[0]==='}'){
      if(!depth) problems.push({from:match.index,to:match.index+1,severity:'error',message:t('多余的右花括号 }。')}); else depth--;
    }
  }
  if(depth>0&&first>=0) problems.push({from:first,to:first+1,severity:'error',message:say(`有 ${depth} 个左花括号 { 没有闭合。`,`${depth} opening braces { are not closed.`)});
  for(const open of stack) if(!VERBATIM.test(open.name)||verbatim===open.name) problems.push({from:open.from,to:open.to,severity:'error',message:say(`\\begin{${open.name}} 没有对应的 \\end{${open.name}}。`,`\\begin{${open.name}} has no matching \\end{${open.name}}.`)});
  if(/\\documentclass/.test(source)&&!/\\begin\{document\}/.test(source)){
    const at=source.indexOf('\\documentclass');
    problems.push({from:at,to:at+14,severity:'warning',message:t('主文件缺少 \\begin{document}。')});
  }
  return problems.sort((a,b)=>a.from-b.from);
}
/** Diagnostics from the last compile for this file: [{line, message, severity}]. */
export const setCompileDiagnostics=StateEffect.define();
const compileDiagnostics=StateField.define({
  create:()=>[],update(value,transaction){
    for(const effect of transaction.effects) if(effect.is(setCompileDiagnostics)) return effect.value;
    return transaction.docChanged&&value.length?value.map(item=>({...item,stale:true})):value;
  }
});
function lintSource(view){
  const doc=view.state.doc,text=doc.toString(),problems=checkLatex(text).map(item=>({...item,source:'LaTeX'}));
  for(const item of view.state.field(compileDiagnostics,false)||[]){
    if(item.stale) continue;
    const line=doc.line(Math.max(1,Math.min(doc.lines,item.line||1)));
    problems.push({from:line.from,to:line.to,severity:item.severity==='warning'?'warning':'error',message:say(`编译：${item.message}`,`Compilation: ${item.message}`),source:'TeX'});
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Typing aids: \begin{x} + Enter closes the environment, Ctrl+B / Ctrl+I / Ctrl+M wrap the selection.
// ---------------------------------------------------------------------------------------------------------------------
function closeEnvironment(view){
  const state=view.state,range=state.selection.main;
  if(!range.empty) return false;
  const line=state.doc.lineAt(range.head);
  if(range.head!==line.to) return false;
  const match=/\\begin\{([^}]+)\}(\[[^\]]*\]|\{[^}]*\})*\s*$/.exec(line.text);
  if(!match) return false;
  const name=match[1],ahead=state.doc.sliceString(range.head),begins=(state.doc.sliceString(0,range.head).match(new RegExp('\\\\begin\\{'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\}','g'))||[]).length,ends=(state.doc.toString().match(new RegExp('\\\\end\\{'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\}','g'))||[]).length;
  if(ends>=begins&&ahead.includes('\\end{'+name+'}')) return false;
  const indent=/^\s*/.exec(line.text)[0],inner=indent+'\t'+(/^(itemize|enumerate)$/.test(name)?'\\item ':''),insert='\n'+inner+'\n'+indent+'\\end{'+name+'}';
  view.dispatch({changes:{from:range.head,insert},selection:EditorSelection.cursor(range.head+1+inner.length),scrollIntoView:true,userEvent:'input'});
  return true;
}
const wrap=(before,after)=>view=>{
  const changes=view.state.changeByRange(range=>{
    const text=view.state.sliceDoc(range.from,range.to);
    return {
      changes:{from:range.from,to:range.to,insert:before+text+after},range:range.empty
        ?EditorSelection.cursor(range.from+before.length)
        :EditorSelection.range(range.from+before.length,range.from+before.length+text.length)
    };
  });
  view.dispatch(changes,{scrollIntoView:true,userEvent:'input'});
  return true;
};

/** Editor extensions for TeX documents (document-local; project-aware completion is added by completion.mjs). */
export function latexEditing(){
  return [
    compileDiagnostics,
    foldService.of(foldLatex),
    foldGutter({
      markerDOM:open=>{
        const node=document.createElement('span');
        node.className='cm-tex-fold';
        node.textContent=open?'▾':'▸';
        return node;
      }
    }),
    linter(lintSource,{delay:600,needsRefresh:update=>update.transactions.some(transaction=>transaction.effects.some(effect=>effect.is(setCompileDiagnostics)))}),
    lintGutter(),
    Prec.high(keymap.of([{key:'Enter',run:closeEnvironment},{key:'Mod-b',run:wrap('\\textbf{','}')},{key:'Mod-i',run:wrap('\\emph{','}')},{key:'Mod-m',run:wrap('$','$')},...foldKeymap])),
    EditorView.theme({'.cm-tex-fold':{cursor:'pointer',padding:'0 2px',opacity:'.6'},'.cm-tex-fold:hover':{opacity:'1'}})
  ];
}
