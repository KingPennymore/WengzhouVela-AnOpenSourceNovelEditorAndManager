import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPlanningPlane} from '../web/planning-viewport.mjs';
import {mapBounds} from '../web/map-export.mjs';
import {createMap} from '../web/map.mjs';
import {drawMap} from '../web/map-renderer.mjs';
import {bindPlane} from '../web/gestures.mjs';

test('initial planning viewport fits distant content and aligns both centres',()=>{
  const bounds={x:10000,y:-40000,width:600,height:1200},plane=fitPlanningPlane(bounds,390,600);
  assert.equal(plane.x+(bounds.x+bounds.width/2)*plane.scale,195);
  assert.equal(plane.y+(bounds.y+bounds.height/2)*plane.scale,300);
  assert.ok(bounds.width*plane.scale<=342);assert.ok(bounds.height*plane.scale<=552);
  assert.equal(fitPlanningPlane(bounds,0,600),null);
});
test('large outlines can fit below the old minimum zoom',()=>{
  const plane=fitPlanningPlane({x:0,y:0,width:1000,height:1500000},390,600);
  assert.ok(plane.scale<.08);assert.ok(1500000*plane.scale<=552);
});
test('map bounds use the content centre rather than the world origin and include filled regions',()=>{
  const map=createMap();map.cells['1000,1000']={type:'draw'};
  let bounds=mapBounds(map);assert.ok(bounds.x>10000);assert.ok(bounds.y>10000);
  map.generated=[{id:'land',algorithm:'drawing-fill',paths:[],regions:[{id:'r',color:'#abcdef',paths:[[[80000,90000],[90000,90000],[90000,95000],[80000,90000]]]}]}];
  bounds=mapBounds(map);assert.ok(bounds.x+bounds.width>90000);assert.ok(bounds.y+bounds.height>95000);
  const empty=mapBounds(createMap());assert.equal(empty.x+empty.width/2,0);assert.equal(empty.y+empty.height/2,0);
});
test('fitting very distant sparse map points does not iterate their empty coordinate space',()=>{
  const map=createMap();map.cells={'-1000000,0':{type:'draw'},'1000000,0':{type:'draw'}};
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
  const plane=fitPlanningPlane(mapBounds(map),640,480);
  assert.equal(drawMap(ctx,map,plane,640,480,[]),2);
  const original=plane.scale,gesture=bindPlane({addEventListener(){}},plane,()=>{});
  gesture.zoom(original*1.1,320,240);
  assert.equal(plane.scale,original*1.1,'zooming from a very distant fitted map must not jump to the old minimum');
});
