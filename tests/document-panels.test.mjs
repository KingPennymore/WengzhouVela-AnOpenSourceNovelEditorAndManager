import test from 'node:test';
import assert from 'node:assert/strict';
import {textInfoCache} from '../web/document-panels.mjs';
import {gitFileState,folderTree} from '../web/workspace.mjs';
import {textFingerprint} from '../web/document-service.mjs';

test('text metadata is reused until an edit, including equal-length text replacements',()=>{
  let scans=0;const info=textInfoCache(text=>{scans++;return [...text].length;}),doc={text:'风😀'};
  assert.equal(info(doc).count(),2);assert.equal(info(doc).includes('风'),true);
  assert.equal(info(doc).count(),2);assert.equal(scans,1);
  doc.text='雨😀';assert.equal(info(doc).includes('风'),false);assert.equal(info(doc).includes('雨'),true);
  assert.equal(info(doc).count(),2);assert.equal(scans,2);
});

test('cached Git fingerprints follow edits, undo and changes to the sync baseline',()=>{
  const doc={name:'正文.txt',path:'小说/正文.txt',text:'风起'},base={hash:textFingerprint('风起')},workspace={repositories:[{folder:'小说',baseFiles:{'正文.txt':base}}]};
  assert.equal(gitFileState(workspace,doc),'');doc.text='雨起';assert.equal(gitFileState(workspace,doc),'M');
  base.hash=textFingerprint('雨起');assert.equal(gitFileState(workspace,doc),'');
  doc.text='风起';assert.equal(gitFileState(workspace,doc),'M');base.hash=textFingerprint('风起');assert.equal(gitFileState(workspace,doc),'');
});

test('grouped trees retain nested folders and lazy files without duplicating filtered loaded files',()=>{
  const doc={id:'book',name:'正文.txt',path:'小说/卷一/正文.txt',text:'风起',updatedAt:1},workspace={documents:[doc],folders:['小说/卷一/空目录'],entries:[{path:doc.path,name:doc.name,editable:true},{path:'小说/卷一/地图.csv',name:'地图.csv',editable:true}]};
  const html=folderTree(workspace,[],s=>s);
  assert.match(html,/data-folder="小说\/卷一\/空目录"/);assert.match(html,/data-project-file="小说\/卷一\/地图.csv"/);
  assert.ok(!html.includes('正文.txt'));
});
