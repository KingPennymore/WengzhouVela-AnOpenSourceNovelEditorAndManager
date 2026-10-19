import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap} from '../web/map.mjs';
import {drawingPointPositions,clearPointCache} from '../web/map-points.mjs';
import {hexPoint} from '../web/map-geometry.mjs';
import {drawMap} from '../web/map-renderer.mjs';
import {mapBounds} from '../web/map-export.mjs';
test('cached drawing coordinates exclude information cells and invalidate after edits and grid changes',()=>{
 const value=createMap();value.cells={'-2,5':{type:'draw'},'0,0':{type:'info'}};
 const p=hexPoint(-2,5),first=drawingPointPositions(value);assert.deepEqual([...first],[p.x,p.y]);assert.equal(drawingPointPositions(value),first);
 value.cells['1,0']={type:'draw'};clearPointCache(value);assert.equal(drawingPointPositions(value).length,4);
 value.grid.orientation='flat';assert.notDeepEqual([...drawingPointPositions(value)].slice(0,2),[p.x,p.y]);
 value.cells={'0,0':{type:'draw'}};assert.deepEqual([...drawingPointPositions(value)],[0,0]);
});
test('export bounds follow in-place edits even when a viewport geometry cache exists',()=>{
 const value=createMap();value.cells={'0,0':{type:'draw'}};drawingPointPositions(value);
 const before=mapBounds(value);delete value.cells['0,0'];value.cells['1000,1000']={type:'draw'};
 const after=mapBounds(value);assert.ok(after.x>before.x+10000&&after.y>before.y+10000);
});
test('dense overview reduces point primitives without changing the drawing data',()=>{
 const value=createMap();for(let q=0;q<200;q++)for(let r=0;r<100;r++)value.cells[q+','+r]={type:'draw'};
 const original=JSON.stringify(value),ctx=new Proxy({},{get:()=>()=>{},set:()=>true}),count=drawMap(ctx,value,{x:10,y:10,scale:.01},640,480,[]);
 assert.ok(count>0&&count<2000,String(count));assert.equal(drawMap(ctx,value,{x:10,y:10,scale:.01},640,480,[],{lod:false}),20000,'export rendering keeps all original point primitives');assert.equal(JSON.stringify(value),original);
});
