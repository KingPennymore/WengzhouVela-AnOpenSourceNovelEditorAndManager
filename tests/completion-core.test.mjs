import test from 'node:test';
import assert from 'node:assert/strict';
import {glossaryCandidates,nounCandidates,expandCompletionSnippet,validateCompletionContext} from '../web/completion-core.mjs';
import {glossaryCompletion} from '../web/glossary.mjs';
import {NounIndex} from '../web/noun-index.mjs';

const context=(text='若水')=>({documentId:'book',blockId:'chapter-1',revision:'r1',text,position:text.length,explicit:true,kind:'prose'});
const terms=[{term:'欧阳若水',aliases:['若水'],definition:'人物',source:'人物.gly'}];

test('editor-independent glossary candidates match what the CodeMirror source inserts',()=>{
  const input=context(),core=glossaryCandidates(input,terms),editor=glossaryCompletion({pos:input.position,explicit:true,state:{doc:{sliceString:(from,to)=>input.text.slice(from,to)}}},terms);
  assert.equal(core.find(item=>item.label==='若水').insertText,'欧阳若水');assert.equal(editor.options.find(item=>item.label==='若水').apply,'欧阳若水');
  assert.deepEqual(JSON.parse(JSON.stringify(core)),core,'candidates are plain serializable data');
  assert.equal(glossaryCandidates(context('x'),terms).length,0);
});
test('proper-noun candidates come from the local recognizer and respect glossary exclusions',()=>{
  const nouns=new NounIndex();nouns.put('c1','欧阳若水说道。旅人抵达青岚港时，天还没亮。');
  assert.ok(nounCandidates(context('青岚'),nouns.candidates(),{}).some(item=>item.label==='青岚港'));
  assert.equal(nounCandidates(context('青岚'),nouns.candidates(),{glossary:['青岚港']}).length,0);
});
test('snippet expansion selects the first placeholder without executable callbacks',()=>{
  assert.deepEqual(expandCompletionSnippet('hello'),{text:'hello',selection:{from:5,to:5}});
  assert.deepEqual(expandCompletionSnippet('${2:second} ${1:first} ${0}').selection,{from:7,to:12});
});
test('malformed completion contexts are rejected',()=>{
  assert.throws(()=>validateCompletionContext({...context(),position:99}));
  assert.throws(()=>validateCompletionContext({...context(),text:42}));
});
