import test from 'node:test';
import assert from 'node:assert/strict';
import {templatesFor,templateText} from '../web/file-templates.mjs';
import {fileKind} from '../web/model.mjs';
import {menuPlacement} from '../web/selection-menu.mjs';
import {createVelaOdt} from '../web/odf-base.mjs';

test('templates follow actual extension and use valid structured defaults',()=>{
 for(const name of ['book.txt','book.md'])assert.deepEqual(templatesFor(name).map(t=>t.id),['empty','format']);
 // The ODF component was removed: existing VODT files stay readable, new ones only get the empty template.
 for(const name of ['book.velaodt','book.vodt'])assert.deepEqual(templatesFor(name).map(t=>t.id),['empty']);
 assert.deepEqual(templatesFor('a.js').map(t=>t.id),['empty','format']);assert.deepEqual(templatesFor('a.unknownext').map(t=>t.id),['empty','format']);
 assert.ok(templateText('story.md','format').startsWith('# '));assert.ok(templateText('a.tex','format').includes('\\begin{document}'));
 assert.deepEqual(JSON.parse(templateText('data.json','format')),{name:'',items:[]});assert.ok(templateText('Main.java','format').includes('class Main'));assert.ok(templateText('page.html','format').startsWith('<!doctype html>'));
 assert.equal(templateText('a.md','empty'),'');assert.ok(templateText('run.sh','format').startsWith('#!/bin/sh'));
 assert.ok(templateText('plan.tsv','format').includes('\t'));assert.ok(templateText('plan.csv','format').startsWith('列一,'));assert.equal(JSON.parse(templateText('terms.gly','empty')).entries.length,0);
 assert.equal(fileKind('test.velaodt'),'VODT');assert.equal(fileKind('test.fodt'),'VODT');assert.equal(fileKind('test.VODT'),'VODT');assert.equal(templateText('test.vodt','empty'),templateText('test.velaodt','empty'));
 assert.throws(()=>templateText('test.js','chapters'));assert.throws(()=>templateText('book.vodt','format'));assert.deepEqual(templatesFor('sheet.fods').map(t=>t.id),['empty']);assert.ok(templateText('sheet.fods','empty').includes('office:spreadsheet'));assert.ok(templateText('slides.fodp','empty').includes('application/vnd.oasis.opendocument.presentation'));
 assert.ok(templateText('book.velaodt','empty').includes('office:mimetype="application/vnd.oasis.opendocument.text"'));
 assert.ok(createVelaOdt(['<&']).includes('&lt;&amp;'));
});
test('selection menu placements avoid the selected rectangle or request a separate rail',()=>{
 const bounds={left:0,top:0,right:390,bottom:844};
 for(const r of [{left:30,right:280,top:330,bottom:370},{left:20,right:350,top:20,bottom:55},{left:30,right:200,top:790,bottom:820}]){const p=menuPlacement(r,160,220,bounds);assert.ok(p);assert.ok(p.top+220<=r.top||p.top>=r.bottom||p.left+160<=r.left||p.left>=r.right);}
 assert.equal(menuPlacement({left:0,right:390,top:10,bottom:834},160,220,bounds),null);
});
