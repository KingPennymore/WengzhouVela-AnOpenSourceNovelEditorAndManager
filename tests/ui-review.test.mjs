import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasDensity,pdfPageSizes} from '../web/pdf-rendering.mjs';
import {csvReadingIndex} from '../web/csv-reading.mjs';
import {beginViewSession} from '../web/view-session.mjs';
import {readerThemeTokens} from '../web/reader-chrome.mjs';

test('PDF backing stores stay inside pixel and edge budgets, including extreme page ratios',()=>{
  for(const [width,height] of [[3000,4200],[900,200000],[100000,300],[612,792]]){
    const density=canvasDensity(width,height,2);
    assert.ok(Math.max(1,Math.floor(width*density))*Math.max(1,Math.floor(height*density))<=16000000);
    assert.ok(width*density<=16384&&height*density<=16384);
  }
});
test('PDF dimensions are shared by concurrent layouts and reused after zoom',async()=>{
  let calls=0;const pdf={numPages:20,getPage:async()=>{calls++;return {getViewport:()=>({width:612,height:792})};}};
  const [a,b]=await Promise.all([pdfPageSizes(pdf),pdfPageSizes(pdf)]);
  assert.equal(a,b);assert.equal((await pdfPageSizes(pdf)).length,20);assert.equal(calls,20);
});
test('CSV reading anchors survive DOM recycling and account for multiline cells and ragged rows',()=>{
  const rows=[['header','note'],['multi\nline','值'],['tail']];const index=csvReadingIndex({rows});
  const at=index.text.indexOf('值');assert.deepEqual(index.cellAt(at),{row:1,column:1});
  assert.equal(index.offsetAt(index.cellAt(at)),at);assert.deepEqual(index.cellAt(index.text.indexOf('tail')),{row:2,column:0});
});
test('replacing a view aborts its callbacks and runs cleanup only once',()=>{
  const root={isConnected:true};let flushed=0;const old=beginViewSession(root);
  old.onDispose(()=>flushed++);const next=beginViewSession(root);old.dispose();
  assert.equal(flushed,1);assert.equal(old.signal.aborted,true);assert.equal(old.alive(),false);assert.equal(next.alive(),true);
});
test('isolated reader accepts presentation colors and rejects CSS injection',()=>{
  const colors=readerThemeTokens('{"accent":"#123456","panel":"red;position:fixed"}',false);
  assert.equal(colors.accent,'#123456');assert.match(colors.panel,/^#/);
});
