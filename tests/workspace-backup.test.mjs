import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspaceBackup,prepareBackupRestore,mergeBackupRestore} from '../web/workspace-backup.mjs';
import {validateWorkspace} from '../web/model.mjs';

const doc=(id,path,text)=>({id,name:path.split('/').at(-1),path,text,updatedAt:1});
const backup={version:1,documents:[doc('a','小说/正文.txt','第一章'),doc('b','.vela',JSON.stringify({version:2,kind:'workspace',id:'old-project'}))],folders:['小说'],trash:[{id:'t1',documents:[doc('c','旧稿.txt','删掉的稿子')]}],openIds:[],activeId:null,localHistory:{a:[{text:'旧版',createdAt:1}]},annotations:{a:[{quote:'第一'}]},writingTools:{glossary:['若水'],snippets:[{label:'场景',text:'* * *'}]}};
const encode=value=>new TextEncoder().encode(JSON.stringify(value));

test('restores every document into a new folder with new identities, keeping existing files',()=>{
  const current={version:1,documents:[doc('x','现有.txt','保留')],folders:[],openIds:['x'],activeId:'x',writingTools:{glossary:['青岚'],snippets:[]}};
  const plan=prepareBackupRestore(readWorkspaceBackup(encode(backup)),'恢复的备份'),result=mergeBackupRestore(current,plan);
  assert.equal(result.documents[0].text,'保留','existing document untouched');
  const restored=result.documents.slice(1);assert.equal(restored.length,3);assert.ok(restored.every(item=>!['a','b','c'].includes(item.id)),'new identities');
  assert.ok(restored.some(item=>item.path==='恢复的备份/小说/正文.txt'));assert.ok(restored.some(item=>item.path.startsWith('恢复的备份/回收站文稿/t1/')),'recycle bin restored as visible files');
  const text=restored.find(item=>item.path.endsWith('正文.txt'));assert.equal(result.localHistory[text.id][0].text,'旧版');assert.equal(result.annotations[text.id][0].quote,'第一');
  assert.notEqual(JSON.parse(restored.find(item=>item.name==='.vela').text).id,'old-project','restored project gets its own ID');
  assert.deepEqual(result.writingTools.glossary.sort(),['若水','青岚'].sort());assert.equal(result.writingTools.snippets.length,1);
  validateWorkspace(result);
});
test('restoring twice is idempotent and a taken folder name gets a suffix',()=>{
  const plan=prepareBackupRestore(readWorkspaceBackup(encode(backup)),'备份'),once=mergeBackupRestore({version:1,documents:[doc('x','备份/占用.txt','')],folders:['备份'],openIds:[],activeId:null},plan);
  assert.ok(once.documents.some(item=>item.path.startsWith('备份 (1)/')));assert.equal(mergeBackupRestore(once,plan).documents.length,once.documents.length);
});
test('invalid backups are rejected before anything is planned',()=>{
  assert.throws(()=>readWorkspaceBackup(new Uint8Array([0x50,0x4b,3,4])),/压缩包/);assert.throws(()=>readWorkspaceBackup(new TextEncoder().encode('not json')),/JSON/);
  assert.throws(()=>readWorkspaceBackup(encode({...backup,documents:[doc('a','a.txt',''),doc('a','b.txt','')]})),/重复|损坏/);
  assert.throws(()=>prepareBackupRestore(readWorkspaceBackup(encode({...backup,documents:[doc('a','A.txt',''),doc('d','a.txt','')],trash:[]})),'恢复'),/同名/);
});
