import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap} from '../web/map.mjs';
import {mapSvg,mapBounds} from '../web/map-export.mjs';
import {planningDefaults} from '../web/planning-config.mjs';
test('full-map SVG includes distant cells, military layers and escaped user text',()=>{const v=createMap();v.cells['0,0']={fill:'plain',name:'<script>坏</script>'};v.cells['100,20']={fill:'city'};v.symbols=[{id:'s',type:'unit.infantry',x:50,y:40,label:'旅 & 队'}];v.arrows=[{id:'r',path:['0,0','100,20'],style:'pincer'}];const text=mapSvg(v,planningDefaults.map.palette,planningDefaults.map);assert.ok(text.startsWith('<svg'));assert.ok(text.includes('&lt;script&gt;'));assert.ok(!text.includes('<script>'));assert.match(text,/旅 &amp; 队/);assert.ok(mapBounds(v).width>4000);assert.match(text,/transform="translate\(0 36\)"/);});
