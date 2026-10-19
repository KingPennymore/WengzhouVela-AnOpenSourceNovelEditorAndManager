import test from 'node:test';
import assert from 'node:assert/strict';
import {labelHalo,drawMapLabel} from '../web/map-labels.mjs';
import {createMap} from '../web/map.mjs';
import {mapSvg} from '../web/map-export.mjs';
test('theme text retains its foreground with a contrasting screen-sized halo; exported labels sit above terrain',()=>{
 assert.equal(labelHalo('#fff'),'#101010');assert.equal(labelHalo('rgb(230,230,230)'),'#101010');assert.equal(labelHalo('#263b34'),'#ffffff');
 const calls=[],ctx={save(){},restore(){},strokeText(...args){calls.push({args,stroke:this.strokeStyle,width:this.lineWidth});},fillText(...args){calls.push({args,fill:this.fillStyle});}};
 drawMapLabel(ctx,'城镇',4,5,{color:'#eeeeee',scale:1.5,maxWidth:100});assert.deepEqual(calls,[{args:['城镇',4,5,100],stroke:'#101010',width:2},{args:['城镇',4,5,100],fill:'#eeeeee'}]);
 const value=createMap();value.markers=[{id:'m',x:0,y:0,name:'地形上的名字'}];value.generated=[{id:'g',algorithm:'terrain',paths:[],regions:[{color:'#263b34',paths:[[[0,0],[10,0],[0,10]]]}]}];const svg=mapSvg(value,[],{});assert.match(svg,/paint-order="stroke fill"/);assert.ok(svg.indexOf('地形上的名字')>svg.indexOf('fill-rule="evenodd"'));
});
