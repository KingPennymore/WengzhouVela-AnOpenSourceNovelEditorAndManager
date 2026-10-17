import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMapSymbol,mapSymbols} from '../web/map-symbols.mjs';
import {registerMapAlgorithm,mapAlgorithmExtensions} from '../web/map-algorithms.mjs';
test('plugin symbols are namespaced, bounded code paths with explicit disposal',()=>{const h=registerMapSymbol('sample.plugin',{type:'terrain.tree',label:'树木',path:'M0-10L10 10H-10Z'});assert.ok(mapSymbols[h.type]);assert.throws(()=>registerMapSymbol('sample.plugin',{type:'terrain.tree',label:'树木',path:'M0 0L1 1'}));assert.throws(()=>registerMapSymbol('sample.plugin',{type:'bad',label:'bad',path:'<svg onload=alert(1)>'}));h.dispose();assert.equal(mapSymbols[h.type],undefined);});
test('plugin algorithms expose cloned defaults and unregister cleanly',async()=>{const defaults={radius:3},h=registerMapAlgorithm('sample.plugin',{id:'border',label:'边界',defaults,run:()=>({paths:[[[0,0],[1,1]]]})});defaults.radius=100;const e=mapAlgorithmExtensions().find(e=>e.id===h.id);assert.equal(e.defaults.radius,3);assert.equal((await e.run()).paths.length,1);h.dispose();assert.equal(mapAlgorithmExtensions().find(e=>e.id===h.id),undefined);});
