import test from 'node:test';
import assert from 'node:assert/strict';
import {hexPoint,pointHex,hexVertices} from '../web/map-geometry.mjs';
import {MapHistory} from '../web/map-history.mjs';
test('hex centers and near-center hits round trip in both orientations',()=>{for(const orientation of ['pointy','flat'])for(let q=-12;q<=12;q++)for(let r=-12;r<=12;r++){const p=hexPoint(q,r,32,orientation);assert.deepEqual(pointHex(p.x+2,p.y-2,32,orientation),{q,r});assert.equal(hexVertices(q,r,32,orientation).length,6);}});
test('100 reversible operations preserve unknown fields and independent cell edits',()=>{const h=new MapHistory(),v={cells:{},future:{x:1}};for(let i=0;i<105;i++){const before=structuredClone(v);v.cells[i+',0']={fill:'plain'};h.record(before,v);}assert.equal(h.undo.length,100);for(let i=0;i<100;i++)assert.ok(h.apply(v));assert.equal(Object.keys(v.cells).length,5);for(let i=0;i<100;i++)assert.ok(h.apply(v,true));assert.equal(Object.keys(v.cells).length,105);assert.equal(v.future.x,1);});
