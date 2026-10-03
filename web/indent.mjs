import {EditorSelection} from '@codemirror/state';

// Preserve characters instead of measuring code indentation columns.
export function paragraphNewline(view) {
  if(view.composing||view.state.readOnly)return false;
  const state=view.state;
  view.dispatch(state.update(state.changeByRange(range=>{
    const line=state.doc.lineAt(range.from);
    const indent=line.text.slice(0,range.from-line.from).match(/^[^\S\r\n]*/)[0];
    return {changes:{from:range.from,to:range.to,insert:state.lineBreak+indent},range:EditorSelection.cursor(range.from+1+indent.length)};
  }),{scrollIntoView:true,userEvent:'input'}));
  return true;
}

export function fullWidthIndent(view,remove=false) {
  if(view.composing)return false;
  const state=view.state,lines=new Set();
  for(const range of state.selection.ranges) {
    const first=state.doc.lineAt(range.from),last=state.doc.lineAt(range.to);
    if(range.empty&&!remove)continue;
    for(let number=first.number;number<=last.number;number++) {
      if(number===last.number&&last.from===range.to&&number>first.number)break;
      lines.add(number);
    }
  }
  if(!lines.size&&!remove) {view.dispatch(state.replaceSelection('　　'));return true;}
  const changes=[...lines].sort((a,b)=>a-b).map(number=>{const line=state.doc.line(number),count=remove?(line.text.match(/^　{1,2}/)?.[0].length||0):0;return {from:line.from,to:line.from+count,insert:remove?'':'　　'};});
  if(!changes.length)return true;
  const changeSet=state.changes(changes);view.dispatch({changes:changeSet,selection:state.selection.map(changeSet)});return true;
}
