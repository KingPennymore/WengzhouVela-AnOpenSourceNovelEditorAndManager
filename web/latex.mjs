import katex from 'katex';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderMath(source,display=false){try{return katex.renderToString(source,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});}catch(error){return `<code class="latex-error" title="${esc(error.message)}">${esc(source)}</code>`;}}
function group(text,start){if(text[start]!=='{')return null;let level=1;for(let i=start+1;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='{')level++;if(text[i]==='}'&&!--level)return {text:text.slice(start+1,i),end:i+1};}return null;}
export function latexInline(text){let result='';for(let i=0;i<text.length;){
  const delimiter=text.startsWith('\\[',i)?'\\[':text.startsWith('\\(',i)?'\\(':text.startsWith('$$',i)?'$$':text[i]==='$'?'$':null;
  if(delimiter){const close=delimiter==='\\['?'\\]':delimiter==='\\('?'\\)':delimiter,end=text.indexOf(close,i+delimiter.length);if(end>=0){result+=renderMath(text.slice(i+delimiter.length,end),delimiter==='$$'||delimiter==='\\[');i=end+close.length;continue;}}
  if(text[i]==='\\'){
    const command=text.slice(i).match(/^\\(textbf|textit|emph|texttt|underline|section\*?|subsection\*?|subsubsection\*?|chapter\*?|title|author|date|label|ref|cite)\s*/);
    if(command){const value=group(text,i+command[0].length);if(value){const name=command[1],tags={textbf:'strong',textit:'em',emph:'em',texttt:'code',underline:'u',chapter:'h1',section:'h2',subsection:'h3',subsubsection:'h4'},tag=tags[name.replace('*','')];result+=tag?`<${tag}>${latexInline(value.text)}</${tag}>`:name==='label'?'':`<code>${esc(command[0]+text.slice(i+command[0].length,value.end))}</code>`;i=value.end;continue;}}
    if(text.startsWith('\\\\',i)){result+='<br>';i+=2;continue;}if(/[{}%$&#_]/.test(text[i+1]||'')){result+=esc(text[i+1]);i+=2;continue;}
  }result+=esc(text[i++]);
}return result;}
export function renderLatex(source){
  const title=source.match(/\\title\s*\{([^}]*)\}/)?.[1],author=source.match(/\\author\s*\{([^}]*)\}/)?.[1];
  let text=source.replace(/(?<!\\)%[^\n]*/g,'');const begin=text.indexOf('\\begin{document}');if(begin>=0)text=text.slice(begin+16);const end=text.lastIndexOf('\\end{document}');if(end>=0)text=text.slice(0,end);
  const blocks=[];text=text.replace(/\\begin\{(equation\*?|align\*?|gather\*?|displaymath)\}([\s\S]*?)\\end\{\1\}/g,(_all,name,math)=>{const formula=/^align/.test(name)?'\\begin{aligned}'+math+'\\end{aligned}':/^gather/.test(name)?'\\begin{gathered}'+math+'\\end{gathered}':math;blocks.push(renderMath(formula,true));return '\uE000'+(blocks.length-1)+'\uE001';});
  text=text.replace(/\\maketitle/g,()=>{blocks.push(`<header class="latex-title"><h1>${latexInline(title||'')}</h1>${author?'<p>'+latexInline(author)+'</p>':''}</header>`);return '\uE000'+(blocks.length-1)+'\uE001';});
  text=text.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g,(_all,name,body)=>{const tag=name==='itemize'?'ul':'ol';blocks.push(`<${tag}>`+body.split(/\\item\s*/).slice(1).map(item=>'<li>'+latexInline(item.trim())+'</li>').join('')+`</${tag}>`);return '\uE000'+(blocks.length-1)+'\uE001';});
  return '<div class="latex-document">'+text.split(/\n\s*\n/).map(paragraph=>{const html=latexInline(paragraph.trim()).replace(/\uE000(\d+)\uE001/g,(_,i)=>blocks[Number(i)]||'');return /^\s*<(h[1-4]|header|ul|ol|span class="katex-display")/.test(html)?html:'<p>'+html+'</p>';}).join('')+'</div>';
}
export function markdownMath(md){
  md.inline.ruler.before('escape','vela_math',(state,silent)=>{const pos=state.pos,source=state.src,open=source.startsWith('\\(',pos)?'\\(':source[pos]==='$'&&!source.startsWith('$$',pos)?'$':null;if(!open)return false;const close=open==='$'?'$':'\\)',end=source.indexOf(close,pos+open.length);if(end<0||source.slice(pos+open.length,end).includes('\n'))return false;if(!silent){const token=state.push('vela_math','math',0);token.content=source.slice(pos+open.length,end);}state.pos=end+close.length;return true;});
  md.renderer.rules.vela_math=(tokens,index)=>renderMath(tokens[index].content);
  md.block.ruler.before('fence','vela_math_block',(state,start,end,silent)=>{const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]).trim(),open=line.startsWith('$$')?'$$':line.startsWith('\\[')?'\\[':null;if(!open)return false;const close=open==='$$'?'$$':'\\]';let math=line.slice(open.length),next=start,found=math.indexOf(close);while(found<0&&++next<end){math+='\n'+state.src.slice(state.bMarks[next],state.eMarks[next]);found=math.indexOf(close);}if(found<0)return false;if(silent)return true;const token=state.push('vela_math_block','math',0);token.content=math.slice(0,found);token.map=[start,next+1];state.line=next+1;return true;});
  md.renderer.rules.vela_math_block=(tokens,index)=>renderMath(tokens[index].content,true);
}
