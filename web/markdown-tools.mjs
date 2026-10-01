export function inlineMarkup(view,mark,end=mark){
  const {from,to}=view.state.selection.main,selected=view.state.sliceDoc(from,to);
  const wrapped=selected.startsWith(mark)&&selected.endsWith(end)&&selected.length>=mark.length+end.length;
  const insert=wrapped?selected.slice(mark.length,-end.length):mark+selected+end;
  view.dispatch({changes:{from,to,insert},selection:{anchor:from+(wrapped?0:mark.length),head:from+insert.length-(wrapped?0:end.length)},userEvent:'input'});view.focus();
}
export function lineMarkup(view,prefix){
  const range=view.state.selection.main,start=view.state.doc.lineAt(range.from),end=view.state.doc.lineAt(range.to>range.from?range.to-1:range.to),changes=[];
  for(let n=start.number;n<=end.number;n++){const line=view.state.doc.line(n);changes.push(line.text.startsWith(prefix)?{from:line.from,to:line.from+prefix.length,insert:''}:{from:line.from,insert:prefix});}
  view.dispatch({changes,userEvent:'input'});view.focus();
}
export function relativeResource(file,path){
  if(/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(path))return null;
  let decoded;try{decoded=decodeURIComponent(path.split(/[?#]/)[0]);}catch{return null;}
  if(/[\\\x00-\x1f]/.test(decoded))return null;
  const parts=file.split('/').slice(0,-1);
  for(const part of decoded.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(part);}
  return parts.length?parts.join('/'):null;
}
export function taskLists(md){
  md.core.ruler.after('inline','wenzhou-tasks',state=>{
    for(let i=2;i<state.tokens.length;i++){
      const token=state.tokens[i];if(token.type!=='inline'||state.tokens[i-2].type!=='list_item_open'||!/^\[[ xX]\] /.test(token.content))continue;
      const first=token.children?.[0];if(first?.type!=='text')continue;
      const checked=/^\[[xX]\]/.test(first.content);first.content=first.content.replace(/^\[[ xX]\] /,'');
      const status=new state.Token('html_inline','',0);status.content=`<span class="task-state" aria-label="${checked?'已完成':'未完成'}">${checked?'☑':'☐'}</span> `;token.children.unshift(status);
    }
  });
}
