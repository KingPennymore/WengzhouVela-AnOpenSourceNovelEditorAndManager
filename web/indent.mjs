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
