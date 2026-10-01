import * as state from '@codemirror/state';
import * as view from '@codemirror/view';
class Emitter {
 constructor(){this.listeners=new Map();}
 on(n,f){if(!this.listeners.has(n))this.listeners.set(n,new Set());this.listeners.get(n).add(f);}
 off(n,f){this.listeners.get(n)?.delete(f);}
 emit(n,...args){for(const f of [...(this.listeners.get(n)||[])])f(...args);}
}
window.cm={state,view};
const params=new URLSearchParams(location.search), mode=params.get('mode')||'cm';
const container=document.querySelector('#editor');
const commands=new Map(), actions=new Map();
const manager=new Emitter();manager.activeFile={filename:'novel.txt'};manager.container=container;
const initial='一、炉边\n甲乙\n二、渡口\n丙丁戊';
if(mode==='cm')manager.editor=new view.EditorView({parent:container,state:state.EditorState.create({doc:initial,extensions:[view.EditorView.theme({'&':{height:'100%'},'.cm-scroller':{overflow:'auto'}})]})});
else{
 manager.editor=ace.edit(container);manager.editor.setValue(initial,-1);manager.editor.session.setUseWrapMode(true);
}
const settings=new Emitter();settings.value={lang:'zh-cn'};
let init,unmount;
window.acode={
 require(name){if(name==='settings')return settings;if(name==='codemirror')return window.cm;if(name==='commands')return {addCommand:d=>commands.set(d.name,d),removeCommand:n=>commands.delete(n)};
 if(name==='actionStack')return {push:a=>actions.set(a.id,a),remove:id=>actions.delete(id)};throw new Error(name);},
 setPluginInit(_id,f){init=f;},setPluginUnmount(_id,f){unmount=f;}
};
window.editorManager=manager;
window.host={
 mode,manager,commands,actions,settings,
 language(lang){settings.value.lang=lang;settings.emit('update:lang');},
 init(){init();},unmount(){unmount();},
 run(name){commands.get('com.tuyuan.acode.writer.'+name).exec();},
 text(){return mode==='cm'?manager.editor.state.doc.toString():manager.editor.getValue();},
 setText(text){const e=manager.editor;if(mode==='cm')e.dispatch({changes:{from:0,to:e.state.doc.length,insert:text}});else e.setValue(text,-1);},
 cursor(row){const e=manager.editor;if(mode==='cm')e.dispatch({selection:{anchor:e.state.doc.line(row+1).from},scrollIntoView:true});else e.gotoLine(row+1,0,true);},
 row(){const e=manager.editor;return mode==='cm'?e.state.doc.lineAt(e.state.selection.main.head).number-1:e.getCursorPosition().row;},
 switchFile(filename,text){manager.activeFile={filename};if(mode==='cm')manager.editor.setState(state.EditorState.create({doc:text,extensions:[view.EditorView.theme({'&':{height:'100%'},'.cm-scroller':{overflow:'auto'}})]}));else manager.editor.setSession(ace.createEditSession(text));manager.emit('switch-file');},
 resetState(text){manager.editor.setState(state.EditorState.create({doc:text}));},
};
