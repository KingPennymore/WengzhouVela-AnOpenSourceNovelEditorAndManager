import test from 'node:test';
import assert from 'node:assert/strict';
import {MapHistory,mapSnapshot,snapshotSections,same} from '../web/map-history.mjs';

const map=()=>({grid:{size:20,visible:false},cells:{'0,0':{color:'#123'},'1,0':{color:'#456'}},markers:[{id:'m1',x:1,y:2}],name:'岛'});

test('partial snapshots record, undo and redo only the sections they cover',()=>{
  const value=map(),history=new MapHistory(),cells=value.cells;
  const before=mapSnapshot(value,['grid','markers']);
  assert.deepEqual(snapshotSections(before),['grid','markers']);
  assert.deepEqual(Object.keys(before),['grid','markers'],'cells and name are not copied');
  value.grid.visible=true;value.markers.push({id:'m2',x:3,y:4});
  assert.equal(history.record(before,value),true);
  assert.equal(history.apply(value),true);
  assert.deepEqual(value,map());assert.equal(value.cells,cells,'untouched sections keep their identity');
  assert.equal(history.apply(value,true),true);
  assert.equal(value.grid.visible,true);assert.equal(value.markers.length,2);
});

test('a partial snapshot of an added or removed section undoes the key itself',()=>{
  const value=map(),history=new MapHistory();
  let before=mapSnapshot(value,['arrows']);value.arrows=[{id:'r1',path:[]}];
  assert.equal(history.record(before,value),true);history.apply(value);assert.equal('arrows' in value,false);
  before=mapSnapshot(value,['name']);delete value.name;
  assert.equal(history.record(before,value),true);history.apply(value);assert.equal(value.name,'岛');
});

test('unchanged partial snapshots record nothing and full snapshots still work',()=>{
  const value=map(),history=new MapHistory();
  assert.equal(history.record(mapSnapshot(value,['grid']),value),false);
  const before=structuredClone(value);value.cells['2,0']={color:'#789'};
  assert.equal(history.record(before,value),true);history.apply(value);assert.deepEqual(value,map());
  assert.equal(same({a:1,b:undefined},{a:1}),true);assert.equal(same([1,{x:2}],[1,{x:3}]),false);
});
