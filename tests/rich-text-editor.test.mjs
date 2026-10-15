import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {richTextExtensions,formatsOf,toggleInline,toggleAlign,settleReview,isFormatActive} from '../web/rich-text-editor.mjs';

// A minimal stand-in for EditorView: the commands only use state and dispatch.
const editor=(doc,options={})=>{const target={state:EditorState.create({doc,extensions:[history(),richTextExtensions(options)]})};target.dispatch=spec=>{target.state=(spec.changes!==undefined&&spec.startState?spec:target.state.update(spec)).state;};return target;};
const select=(view,from,to=from)=>view.dispatch({selection:EditorSelection.range(from,to)});
const type=(view,at,text)=>view.dispatch({changes:{from:at,insert:text},userEvent:'input.type'});
const remove=(view,from,to)=>view.dispatch({changes:{from,to},userEvent:'delete'});
const marks=view=>formatsOf(view.state).entries.filter(entry=>entry.group==='marks').map(entry=>[entry.type,view.state.sliceDoc(entry.from,entry.to)]);
const aligned=view=>formatsOf(view.state).entries.filter(entry=>entry.group==='blocks').map(entry=>[entry.value,view.state.sliceDoc(entry.from,entry.to)]);

test('bold continues when typing at its end but not at its start',()=>{
  const view=editor('林舟冷笑一声');select(view,0,4);toggleInline(view,'strong');
  assert.deepEqual(marks(view),[['strong','林舟冷笑']]);
  type(view,4,'着');type(view,0,'只见');
  assert.deepEqual(marks(view),[['strong','林舟冷笑着']]);
  assert.equal(view.state.doc.toString(),'只见林舟冷笑着一声');
});

test('toggling over a formatted selection removes it and splits the rest',()=>{
  const view=editor('林舟冷笑一声');select(view,0,6);toggleInline(view,'strong');select(view,2,4);
  assert.equal(isFormatActive(view.state,'strong'),true);toggleInline(view,'strong');
  assert.deepEqual(marks(view),[['strong','林舟'],['strong','一声']]);
  select(view,1,5);toggleInline(view,'strong');assert.deepEqual(marks(view),[['strong','林舟冷笑一声']]);
});

test('undo removes a new format, and undoing a deletion brings back the formats it removed',()=>{
  const view=editor('第一句。第二句。');select(view,4,7);toggleInline(view,'emphasis');
  undo(view);assert.deepEqual(marks(view),[]);redo(view);assert.deepEqual(marks(view),[['emphasis','第二句']]);
  remove(view,3,8);assert.deepEqual(marks(view),[]);
  undo(view);assert.equal(view.state.doc.toString(),'第一句。第二句。');assert.deepEqual(marks(view),[['emphasis','第二句']]);
});

test('alignment follows its line and is dropped with it',()=>{
  const view=editor('正文\n——完——\n后记');select(view,4);toggleAlign(view,'center');
  assert.deepEqual(aligned(view),[['center','——完——']]);
  type(view,3,'　');assert.deepEqual(aligned(view),[['center','　——完——']]);
  type(view,0,'序\n');assert.deepEqual(aligned(view),[['center','　——完——']]);
  select(view,view.state.doc.line(3).from);toggleAlign(view,'center');assert.deepEqual(aligned(view),[]);
  select(view,view.state.doc.line(3).from);toggleAlign(view,'center');
  const start=view.state.doc.line(3).from;remove(view,start-1,start);assert.deepEqual(aligned(view),[]);
  undo(view);assert.deepEqual(aligned(view),[['center','　——完——']]);
});

test('a review entry can be applied to the selection or dropped',()=>{
  const view=editor('林舟淡笑',{review:[{id:'r1',group:'marks',type:'strong',quote:'林舟冷笑',reason:'找不到原文'},{id:'r2',group:'marks',type:'emphasis',quote:'x',reason:'找不到原文'}]});
  select(view,0,4);settleReview(view,'r1',{apply:true});settleReview(view,'r2');
  assert.deepEqual(marks(view),[['strong','林舟淡笑']]);assert.deepEqual(formatsOf(view.state).review,[]);
  assert.equal(formatsOf(view.state).entries[0].reason,undefined);
});
