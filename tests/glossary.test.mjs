import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import {parseGlossary,glossaryText,createGlossary,glossaryPaths,glossaryTerms,glossaryCompletion} from '../web/glossary.mjs';
import {createVelaV2,velaText,parseVela,rewriteVelaFiles} from '../web/vela.mjs';
import {fileKind} from '../web/model.mjs';
test('术语库格式、别名、重复保护及未知字段保留',()=>{
  for(const name of ['词库.gly','Terms.GLOSSARY'])assert.equal(fileKind(name),'GLY');
  const value={...createGlossary('航程'),extension:{keep:true},entries:[{term:'林舟',definition:'记录者',aliases:['舟','舟'],category:'人物'}]};
  const parsed=parseGlossary(glossaryText(value));assert.equal(parsed.entries[0].term,'林舟');assert.deepEqual(parsed.entries[0].aliases,['舟']);assert.ok(parsed.entries[0].id);assert.deepEqual(parsed.extension,{keep:true});
  assert.throws(()=>glossaryText({...value,entries:[{term:'Vela'},{term:'vela'}]}),/重复/);assert.throws(()=>glossaryText({...value,entries:[{term:'a\nb'}]}),/换行/);assert.throws(()=>parseGlossary('{}'),/version/);
});
test('工作区术语库相对路径，全局继承及显式停用',()=>{
  const g=createVelaV2('Global',{global:true});g.editor.glossaries=['全局.gly'];const p=createVelaV2('Novel');p.editor.glossaries=['词库.gly'];
  const doc={id:'book',name:'小说.txt',path:'Novel/小说.txt'},global={id:'g',name:'.global.vela',path:'.global.vela',text:velaText(g)},project={id:'p',name:'.vela',path:'Novel/.vela',text:velaText(p)},terms={id:'terms',name:'词库.gly',path:'Novel/词库.gly',text:glossaryText({version:1,entries:[{term:'林舟'}]})},workspace={documents:[doc,global,project,terms]};
  assert.deepEqual(glossaryPaths(workspace,doc),['Novel/词库.gly']);assert.equal(glossaryTerms(workspace,doc)[0].term,'林舟');terms.text='{invalid';assert.deepEqual(glossaryTerms(workspace,doc),[]);
  delete p.editor.glossaries;project.text=velaText(p);assert.deepEqual(glossaryPaths(workspace,doc),['全局.gly']);p.editor.glossaries=[];project.text=velaText(p);assert.deepEqual(glossaryPaths(workspace,doc),[]);
  p.editor.glossaries=['../private.gly'];assert.throws(()=>velaText(p));
});
test('术语库中文单字、英文多词、别名自动补全优先及安全插入',()=>{
  const entries=parseGlossary(glossaryText({version:1,entries:[{term:'林舟',aliases:['船长'],definition:'主角'},{term:'New Harbor',aliases:[]}]})).entries;
  for(const [text,expected] of [['正文中的林','林舟'],['船','林舟'],['new h','New Harbor']]){
    const state=EditorState.create({doc:text}),result=glossaryCompletion(new CompletionContext(state,text.length,false),entries);assert.ok(result);assert.equal(result.options[0].apply,expected);assert.equal(result.options[0].boost,99);assert.equal(text.slice(result.from),text==='正文中的林'?'林':text);
  }
});
test('术语库移动和文件夹复制重写 .vela 引用',()=>{
  const c=createVelaV2('Novel');c.editor.glossaries=['词库.gly'];const before={documents:[{id:'config',name:'.vela',path:'Novel/.vela',text:velaText(c)},{id:'terms',name:'词库.gly',path:'Novel/词库.gly',text:glossaryText(createGlossary())}]},after=structuredClone(before);after.documents[1].path='Novel/术语.glossary';after.documents[1].name='术语.glossary';rewriteVelaFiles(before,after,'move','Novel/词库.gly','Novel/术语.glossary');assert.deepEqual(parseVela(after.documents[0].text).editor.glossaries,['术语.glossary']);
});
test('多个术语库按配置顺序读取，重复词条合并并显示全部来源',()=>{
  const config=createVelaV2('Novel');config.editor.glossaries=['地点.glossary','人物.gly'];const doc={id:'book',name:'小说.txt',path:'Novel/小说.txt'},project={id:'config',name:'.vela',path:'Novel/.vela',text:velaText(config)},a={id:'a',name:'人物.gly',path:'Novel/人物.gly',text:glossaryText({version:1,entries:[{term:'林舟',definition:'记录者',aliases:['舟']}]})},b={id:'b',name:'地点.glossary',path:'Novel/地点.glossary',text:glossaryText({version:1,entries:[{term:'林舟',definition:'港口名',aliases:['林港']},{term:'灯塔'}]})};
  const entries=glossaryTerms({documents:[doc,project,a,b]},doc);assert.equal(entries.filter(entry=>entry.term==='林舟').length,1);assert.deepEqual(entries[0].sources,['Novel/地点.glossary','Novel/人物.gly']);assert.deepEqual(entries[0].aliases,['林港','舟']);const state=EditorState.create({doc:'林'}),completion=glossaryCompletion(new CompletionContext(state,1,false),entries).options[0];assert.match(completion.detail,/地点\.glossary.*人物\.gly/);assert.match(completion.info,/港口名/);assert.match(completion.info,/记录者/);
});

test('手动补全有前缀时不混入无关术语，空白处仍能浏览术语',()=>{const entries=[{term:'林舟',aliases:[]}];const query=text=>glossaryCompletion(new CompletionContext(EditorState.create({doc:text}),text.length,true),entries);assert.equal(query('星'),null);assert.equal(query(' ').options[0].label,'林舟');});
