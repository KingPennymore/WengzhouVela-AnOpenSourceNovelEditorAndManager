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
test('the selection bar sits centred above the selection, or pinned below the editor toolbar when there is no room',()=>{
 const bounds={left:0,top:96,right:390,bottom:844};
 assert.deepEqual(menuPlacement({left:100,right:200,top:330,bottom:360},180,44,bounds),{left:60,top:278,pinned:false});
 assert.deepEqual(menuPlacement({left:0,right:390,top:96,bottom:400},180,44,bounds),{left:105,top:104,pinned:true},'selection starting above the visible editor');
 assert.equal(menuPlacement({left:360,right:385,top:500,bottom:520},180,44,bounds).left,202,'kept inside the window');
});
