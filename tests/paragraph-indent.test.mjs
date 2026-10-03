import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {paragraphNewline} from '../web/indent.mjs';

function viewFor(doc,selection,extensions=[]){const view={state:EditorState.create({doc,selection,extensions})};view.dispatch=transaction=>{view.state=transaction.state;};return view;}
test('paragraph Enter preserves exact full-width, ordinary and mixed indentation',()=>{
  for(const indent of ['　　','　','    ','\t　 ','']){
    const text=indent+'正文';const view=viewFor(text,{anchor:text.length});
    assert.equal(paragraphNewline(view),true);
    assert.equal(view.state.doc.toString(),text+'\n'+indent);
    assert.equal(view.state.selection.main.head,text.length+1+indent.length);
  }
});
test('paragraph split and selection replacement preserve suffix and indentation',()=>{
  const view=viewFor('　　前后文',{anchor:3,head:4});paragraphNewline(view);
  assert.equal(view.state.doc.toString(),'　　前\n　　文');assert.equal(view.state.selection.main.head,6);
  const start=viewFor('　　正文',{anchor:0});paragraphNewline(start);
  assert.equal(start.state.doc.toString(),'\n　　正文');
  const inside=viewFor('　　正文',{anchor:1});paragraphNewline(inside);
  assert.equal(inside.state.doc.toString(),'　\n　　正文');
});
test('blank indented paragraphs retain indentation and Enter is undoable',()=>{
  const view=viewFor('　　',{anchor:2},[history()]);paragraphNewline(view);
  assert.ok(undo(view));assert.equal(view.state.doc.toString(),'　　');
  assert.ok(redo(view));assert.equal(view.state.doc.toString(),'　　\n　　');
  paragraphNewline(view);assert.equal(view.state.doc.toString(),'　　\n　　\n　　');
});
test('multiple cursors inherit each line separately; read-only and composition are untouched',()=>{
  const view=viewFor('　　甲\n  乙',EditorSelection.create([EditorSelection.cursor(3),EditorSelection.cursor(7)],1),[EditorState.allowMultipleSelections.of(true)]);
  paragraphNewline(view);assert.equal(view.state.doc.toString(),'　　甲\n　　\n  乙\n  ');assert.equal(view.state.selection.main.head,13);
  const readonly=viewFor('　　甲',{anchor:3},[EditorState.readOnly.of(true)]);assert.equal(paragraphNewline(readonly),false);
  const composing=viewFor('　　甲',{anchor:3});composing.composing=true;assert.equal(paragraphNewline(composing),false);assert.equal(composing.state.doc.toString(),'　　甲');
});
