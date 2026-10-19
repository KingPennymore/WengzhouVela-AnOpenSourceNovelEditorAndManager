// Reproducible synthetic-file benchmark; timings describe parseMap, not full application startup.
// Run: TZ=UTC node tests/map-terrain-benchmark.mjs
import {performance} from 'node:perf_hooks';
import {createMap,mapText,parseMap} from '../web/map.mjs';
import {updateDrawingFill} from '../web/map-fill.mjs';
import {convertDrawingTerrain} from '../web/map-terrain.mjs';
function medianParse(text){
 for(let i=0;i<5;i++)parseMap(text);
 const samples=[];for(let i=0;i<25;i++){const start=performance.now();parseMap(text);samples.push(performance.now()-start);}
 return samples.sort((a,b)=>a-b)[12];
}
for(const side of [30,140]){
 const source=createMap();for(let r=0;r<side;r++)for(let q=0;q<side;q++)source.cells[q+','+r]={type:'draw'};
 // Compare files which both already contain the same fill; do not count fill generation as parsing.
 updateDrawingFill(source);const before=mapText(source),{value}=convertDrawingTerrain(source,{},'land'),after=mapText(value);
 console.log(JSON.stringify({points:side*side,beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),beforeParseMs:medianParse(before),afterParseMs:medianParse(after),remainingPoints:Object.keys(value.cells).length}));
}
