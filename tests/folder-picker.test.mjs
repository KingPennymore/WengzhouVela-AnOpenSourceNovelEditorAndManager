import test from 'node:test';
import assert from 'node:assert/strict';
import {folderChoices} from '../web/folder-picker.mjs';
import {assertNewFile,hasSettingsFile} from '../web/new-file.mjs';
test('folder picker lists lazy and implicit folders and excludes move descendants',()=>{const w={documents:[{name:'文稿.txt',path:'作品/正文/文稿.txt'}],folders:['空文件夹'],entries:[{path:'资料/地图/图.vlmp'}]};assert.deepEqual(new Set(folderChoices(w)),new Set(['','作品','作品/正文','空文件夹','资料','资料/地图']));assert.ok(folderChoices(w,{exclude:'作品'}).every(p=>!p.startsWith('作品')));});
test('new settings cannot duplicate loaded or lazy configs, and global settings belong in root',()=>{const w={documents:[{name:'.vela',path:'作品/.vela'}],entries:[{path:'.global.vela'}],folders:['作品']};assert.ok(hasSettingsFile(w,'作品'));assert.throws(()=>assertNewFile(w,'.vela','作品'));assert.throws(()=>assertNewFile(w,'其他.vela','作品'));assert.throws(()=>assertNewFile(w,'.global.vela',''));assert.throws(()=>assertNewFile(w,'.global.vela','新作品'));assert.doesNotThrow(()=>assertNewFile(w,'.vela','新作品'));});
