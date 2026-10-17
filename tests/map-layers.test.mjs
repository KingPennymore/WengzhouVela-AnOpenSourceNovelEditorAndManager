import test from 'node:test';
import assert from 'node:assert/strict';
import {arrowStyles,arrowShapes} from '../web/map-arrows.mjs';
import {mapSymbols,factionFrame} from '../web/map-symbols.mjs';
import {hitMapLayer} from '../web/map-layers.mjs';
test('all arrow styles produce finite code paths, including attacks and retreat',()=>{for(const [style] of arrowStyles){const v=arrowShapes({path:['0,0','1,0','2,-1'],style,color:'#c00000',curve:.5,width:2},{orientation:'pointy',size:32});assert.ok(v.shapes.length);for(const s of v.shapes){assert.ok(!/NaN|Infinity/.test(s.d));assert.ok(s.d.startsWith('M'));}}});
test('military symbol set and four affiliation frames are code paths',()=>{assert.equal(Object.keys(mapSymbols).length,16);for(const s of Object.values(mapSymbols))assert.ok(s.path.startsWith('M'));for(const a of ['friendly','hostile','neutral','unknown'])assert.ok(factionFrame(a));});
test('layer hit testing deletes symbols before arrows and respects scope',()=>{const v={grid:{size:32,orientation:'pointy'},symbols:[{id:'s',x:0,y:0}],arrows:[{id:'a',path:['0,0','1,0']}],generated:[]};assert.equal(hitMapLayer(v,{x:0,y:0}).layer,'symbols');assert.equal(hitMapLayer(v,{x:0,y:0},'arrows').layer,'arrows');assert.equal(hitMapLayer(v,{x:0,y:0},'cells'),null);});
