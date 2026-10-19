import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap,mapText,parseMap} from '../web/map.mjs';
import {updateDrawingFill} from '../web/map-fill.mjs';
import {convertDrawingTerrain,terrainBounds,moveTerrain,hitTerrain} from '../web/map-terrain.mjs';
import {hitMapLayer} from '../web/map-layers.mjs';
import {mapSvg,mapBounds} from '../web/map-export.mjs';
import {MapHistory} from '../web/map-history.mjs';
const dense=(n=12)=>{const value=createMap();for(let r=0;r<n;r++)for(let q=0;q<n;q++)value.cells[q+','+r]={type:'draw'};return value;};
test('conversion retains exact fill, metadata and references; only closed plain samples are removed',()=>{
 const source=dense();source.cells['3,3'].name='城镇';source.cells['4,4'].future={id:8};source.cells['5,5']={fill:'old-land'};source.cells['40,40']={type:'draw'};source.cells['50,50']={type:'info',note:'信息'};source.arrows=[{id:'a',path:['0,0','1,0']}];source.markers=[{id:'m',x:1,y:2,name:'标记'}];source.future={keep:true};source.generated.push({id:'plugin',algorithm:'custom',paths:[],future:9});updateDrawingFill(source);source.generated.at(-1).regions[0].color='#ff000080';
 const original=mapText(source),result=convertDrawingTerrain(source,{},'land'),next=result.value,terrain=next.generated.find(g=>g.id==='land');assert.equal(mapText(source),original);assert.equal(result.removed,139);assert.equal(result.kept,5);assert.deepEqual(terrain.regions,source.generated.at(-1).regions);assert.deepEqual(next.arrows,source.arrows);assert.deepEqual(next.markers,source.markers);assert.deepEqual(next.future,source.future);
 for(const key of ['0,0','1,0','3,3','4,4','5,5'])assert.deepEqual(next.cells[key],{...source.cells[key],drawingBaked:true});for(const key of ['40,40','50,50'])assert.deepEqual(next.cells[key],source.cells[key]);
 assert.deepEqual(parseMap(mapText(next)),next);updateDrawingFill(next);assert.deepEqual(next.generated.find(g=>g.id==='land'),terrain);assert.ok(!next.generated.some(g=>g.id==='g-drawing-fill'),'protected points must not regenerate overlapping fill');
 for(const key of ['70,70','71,70','70,71'])next.cells[key]={type:'draw'};updateDrawingFill(next);assert.ok(next.generated.some(g=>g.id==='g-drawing-fill'));assert.deepEqual(next.generated.find(g=>g.id==='land'),terrain);
 const history=new MapHistory();history.record(source,result.value);assert.ok(history.apply(result.value,false));assert.equal(mapText(result.value),original);assert.ok(history.apply(result.value,true));assert.ok(result.value.generated.some(g=>g.id==='land'));
});
test('baked geometry survives round trips, movement, export, region holes and hit priorities',()=>{
 const source=dense(4),{value}=convertDrawingTerrain(source,{},'land'),terrain=value.generated.find(g=>g.id==='land'),original=structuredClone(terrain),before=terrainBounds(terrain);moveTerrain(terrain,original,100,200);const after=terrainBounds(terrain);assert.ok(Math.abs(after.x-before.x-100)<.0001);assert.ok(Math.abs(after.y-before.y-200)<.0001);assert.deepEqual(terrain.regions[0].paths[0][0],original.regions[0].paths[0][0].map((x,i)=>Math.round((x+[100,200][i])*10000)/10000));assert.deepEqual(parseMap(mapText(value)),value);assert.ok(mapSvg(value,[],{}).includes('fill-rule="evenodd"'));assert.ok(mapBounds(value).width>0);
 const square=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]],ring={id:'ring',algorithm:'terrain',paths:[],regions:[{color:'#123456',paths:[square(0,0,100),square(30,30,40),square(200,0,50)]}]};value.generated=[ring];assert.ok(hitTerrain(ring,{x:10,y:10}));assert.ok(!hitTerrain(ring,{x:50,y:50}));assert.ok(hitTerrain(ring,{x:220,y:20}));assert.ok(!hitTerrain(ring,{x:150,y:20}));assert.equal(hitMapLayer(value,{x:10,y:10}).object,ring);value.symbols=[{id:'s',type:'terrain.mountain',x:10,y:10}];assert.equal(hitMapLayer(value,{x:10,y:10}).layer,'symbols');assert.equal(hitMapLayer(value,{x:220,y:20},'cells'),null);
});
test('conversion refuses empty/open maps and duplicate IDs; preserves source after errors',()=>{
 const v=createMap();assert.throws(()=>convertDrawingTerrain(v),/封闭/);v.cells={'0,0':{type:'draw'},'1,0':{type:'draw'},'2,0':{type:'draw'}};const text=mapText(v);assert.throws(()=>convertDrawingTerrain(v),/封闭/);assert.equal(mapText(v),text);const closed=dense(2);closed.generated.push({id:'taken',algorithm:'custom',paths:[]});assert.throws(()=>convertDrawingTerrain(closed,{},'taken'),/重复/);assert.throws(()=>mapText({...v,cells:{'0,0':{type:'draw',drawingBaked:'yes'}}}),/标记/);
});
