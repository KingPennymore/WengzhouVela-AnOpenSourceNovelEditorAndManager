import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adoptFolder,preparePaths,documentPath,folderTree} from '../web/workspace.mjs';
test('默认储存目录迁移保留文稿，对外部同名文件分配不同路径',()=>{
  const workspace={documents:[{id:'local',name:'小说.txt',text:'本地',updatedAt:1}],activeId:'local',openIds:['local']};
  preparePaths(workspace);adoptFolder(workspace,{storage:{id:'root'},documents:[{id:'external',name:'小说.txt',path:'小说.txt',text:'外部',updatedAt:1}],entries:[{path:'小说.txt'}],folders:[]},{migrate:true});
  assert.deepEqual(workspace.documents.map(documentPath),['小说.txt','小说 (2).txt']);assert.equal(workspace.activeId,'local');
});
test('文件夹工作区切换不混入旧目录的文稿，层级包含空文件夹和不可编辑文件',()=>{
  const workspace={documents:[{id:'old',name:'旧.txt',text:'旧'}],activeId:'old',openIds:['old']};
  adoptFolder(workspace,{storage:{id:'new'},documents:[{id:'a',name:'小说.md',path:'新书/小说.md',text:'# 第一章'}],folders:['空目录','新书'],entries:[{path:'新书/image.png',name:'image.png',directory:false,reason:'二进制文件'}]});
  assert.equal(workspace.activeId,null);assert.deepEqual(workspace.openIds,[]);assert.equal(workspace.documents.length,1);
  const html=folderTree(workspace,workspace.documents,s=>s);assert.match(html,/新书/);assert.match(html,/空目录/);assert.match(html,/image.png/);
});
