// 宿主契约模拟：不是 Android 或真实 CodeMirror/Ace 实机测试。
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Emitter {
  constructor() { this.events = new Map(); }
  on(name, fn) { if (!this.events.has(name)) this.events.set(name,new Set()); this.events.get(name).add(fn); }
  off(name, fn) { this.events.get(name)?.delete(fn); }
  emit(name, ...args) { for (const fn of [...(this.events.get(name) || [])]) fn(...args); }
  count() { return [...this.events.values()].reduce((s,entry) => s+entry.size,0); }
}
class Node extends Emitter {
  constructor(tag='div') {
    super(); this.tagName=tag; this.children=[]; this.textContent=''; this.attrs={}; this.value='';
    const classes = new Set(); this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};
    this.style={setProperty:(k,v)=>{this.style[k]=v;},removeProperty:k=>delete this.style[k]};
  }
  addEventListener(...args) { this.on(...args); }
  append(...children) { for (const child of children) { child.remove(); child.parentElement=this; this.children.push(child); } }
  remove() { if (this.parentElement) this.parentElement.children=this.parentElement.children.filter(n=>n!==this); this.parentElement=null; }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
  setAttribute(k,v) { this.attrs[k]=v; }
  focus() {}
  contains(node) { return node===this || this.children.some(child=>child.contains(node)); }
}
function setup(mode='cm') {
  const timeouts=new Map(), intervals=new Map(); let seq=0;
  const container=new Node(), manager=new Emitter(), registered=new Map();
  let init, unmount, text='一、炉边\n甲乙\n二、渡口\n丙丁戊', row=0;
  manager.activeFile={filename:'novel.txt'};
  const commands={addCommand:d=>registered.set(d.name,d),removeCommand:n=>registered.delete(n)};
  const stack={entries:new Map(),push(a){this.entries.set(a.id,a);},remove(id){this.entries.delete(id);}};
  const document={head:new Node('head'),body:new Node('body'),createElement:t=>new Node(t),
    createTextNode:t=>{const n=new Node('text'); n.textContent=t; return n;},createDocumentFragment:()=>new Node('fragment')};
  const storage=new Map();
  function doc(value) {
    const lines=value.split('\n');
    return {lines:lines.length,toString:()=>value,
      line(n){return {number:n,from:lines.slice(0,n-1).reduce((sum,line)=>sum+line.length+1,0)};},
      lineAt(pos){return {number:value.slice(0,pos).split('\n').length};}};
  }
  class Compartment {
    of(extensions){return {comp:this,extensions};}
    get(state){return state.config.get(this);}
    reconfigure(extensions){return {kind:'replace',comp:this,extensions};}
  }
  const cm={state:{Compartment,StateEffect:{appendConfig:{of:config=>({kind:'append',config})}}},
    view:{EditorView:{updateListener:{of:fn=>({kind:'listener',fn})}},showPanel:{of:fn=>({kind:'panel',fn})}}};
  let view;
  if(mode==='cm') {
    view={state:{doc:doc(text),selection:{main:{head:0}},config:new Map()},focus(){},
      dispatch(transaction){
        const effects=transaction.effects ? [transaction.effects].flat() : [];
        for(const effect of effects) {
          const comp=effect.comp||effect.config?.comp;
          const old=this.state.config.get(comp)||[];
          for(const ext of old) if(ext.kind==='panel') ext.dom?.remove();
          const extensions=effect.extensions||effect.config?.extensions||[];
          this.state.config.set(comp,extensions);
          for(const ext of extensions) if(ext.kind==='panel') {ext.dom=ext.fn().dom;container.append(ext.dom);}
        }
        if(transaction.selection){this.state.selection.main.head=transaction.selection.anchor;notify(false,true);}
      }};
  } else {
    view=new Emitter(); view.container=container;view.selection=new Emitter();view.session=new Emitter();
    view.renderer=new Emitter(); view.renderer.scrollBarH={getHeight:()=>0};view.renderer.$extraHeight=7;
    view.resize=()=>view.renderer.emit('afterRender');view.getValue=()=>text;
    view.getCursorPosition=()=>({row});view.gotoLine=(line)=>{row=line-1;view.selection.emit('changeCursor');};view.focus=()=>{};
  }
  manager.editor=view; manager.container=container;
  function notify(docChanged,selectionSet){
    if(mode==='cm') {
      for(const extensions of view.state.config.values()) for(const ext of extensions) if(ext.kind==='listener') ext.fn({docChanged,selectionSet});
    } else if(docChanged) view.emit('change');else view.selection.emit('changeCursor');
  }
  const acode={require:name=>({codemirror:cm,commands,actionStack:stack})[name],
    setPluginInit:(_id,fn)=>{init=fn;},setPluginUnmount:(_id,fn)=>{unmount=fn;}};
  const context={window:{acode,editorManager:manager},acode,document,console,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:fn=>{const id=++seq;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:fn=>{const id=++seq;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/i18n.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/plugin.js'),'utf8'),context);
  const flush=()=>{for(let i=0;i<10&&timeouts.size;i++){const entries=[...timeouts];timeouts.clear();for(const [,fn] of entries)fn();}};
  const getBar=()=>container.children.find(n=>n.className==='aw-bar');
  return {init,unmount,flush,manager,view,container,registered,stack,document,timeouts,intervals,getBar,
    status(){return getBar().children[1].children.map(n=>n.textContent).join('');},
    run(name){registered.get('com.tuyuan.acode.writer.'+name).exec();},
    setText(value){text=value;if(mode==='cm')view.state.doc=doc(text);notify(true,false);flush();},
    cursor(n){row=n;if(mode==='cm')view.state.selection.main.head=view.state.doc.line(n+1).from;notify(false,true);flush();},
    switchFile(filename,value){text=value;manager.activeFile={filename};if(mode==='cm')view.state.doc=doc(text);
      else view.session=new Emitter();manager.emit('switch-file');flush();},
    resetState(value){text=value;view.state={doc:doc(text),selection:{main:{head:0}},config:new Map()};container.replaceChildren();for(const fn of intervals.values())fn();flush();}
  };
}
for(const mode of ['cm','ace']) {
  test(`${mode}：初始化、光标、输入、章节跳转与文件切换`,()=>{
    const h=setup(mode);h.init();h.flush();
    assert.equal(h.registered.size,4);assert.ok(h.getBar());
    assert.match(h.status(),/一、炉边 · 2字/);
    h.cursor(3);assert.match(h.status(),/二、渡口 · 3字/);
    h.setText('一、炉边\n甲乙\n二、渡口\n丙丁戊己');assert.match(h.status(),/4字/);
    h.run('previous');h.flush();assert.match(h.status(),/一、炉边/);
    h.run('outline');assert.equal(h.document.body.children.length,1);assert.equal(h.stack.entries.size,1);
    h.switchFile('other.txt','一、新文稿\n山河');assert.equal(h.document.body.children.length,0);
    assert.match(h.status(),/一、新文稿 · 2字/);
    h.switchFile('app.js','const a=1');assert.match(h.status(),/未启用/);
    h.unmount();assert.equal(h.getBar(),undefined);assert.equal(h.registered.size,0);
    assert.equal(h.manager.count(),0);assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);
    assert.equal(h.document.head.children.length,0);assert.equal(h.document.body.children.length,0);
    if(mode==='ace'){assert.equal(h.view.renderer.$extraHeight,7);assert.equal(h.view.renderer.count(),0);assert.equal(h.view.count(),0);assert.equal(h.view.selection.count(),0);}
  });
  test(`${mode}：停用后再次启用，不重复底栏和命令`,()=>{
    const h=setup(mode);h.init();h.flush();h.unmount();h.init();h.flush();
    assert.equal(h.container.children.length,1);assert.equal(h.registered.size,4);h.unmount();
  });
}
test('CodeMirror：宿主替换 EditorState 后恢复底栏与计数',()=>{
  const h=setup();h.init();h.flush();h.resetState('第一章 新状态\n甲乙丙');
  assert.match(h.status(),/3字/);h.unmount();
});
test('设置界面可打开，关闭和卸载移除返回栈',()=>{
  const h=setup();h.init();h.flush();h.run('settings');
  assert.equal(h.document.body.children.length,1);assert.equal(h.stack.entries.size,1);
  h.unmount();assert.equal(h.document.body.children.length,0);assert.equal(h.stack.entries.size,0);
});
for (const mode of ['cm','ace']) test(`${mode}：切换文件和停用时不会把焦点抢回旧编辑器`,()=>{
  const h=setup(mode);let focusCalls=0;h.view.focus=()=>focusCalls++;
  h.init();h.flush();h.run('settings');
  h.switchFile('next.txt','一、新章\n正文');assert.equal(focusCalls,0);
  h.run('settings');h.unmount();assert.equal(focusCalls,0);
});
