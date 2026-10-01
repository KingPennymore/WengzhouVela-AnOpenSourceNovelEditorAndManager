import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {parseCsv,writeCsv} from '../web/csv.mjs';
import {fileName,fileKind,validateWorkspace,newDocument} from '../web/model.mjs';
import {readPluginZip,fromBase64,assetPath,validatePluginStore} from '../web/plugin-package.mjs';
import {guide,isOriginalDemo} from '../web/guide.mjs';
import {readFile} from 'node:fs/promises';

test('CSV 的逗号、双引号、空末列、单元格换行与中文可无损往返',()=>{
  const rows=[['姓名','备注',''],['文舟','中文,"引用"\n第二行','001'],['','末行','']];
  assert.deepEqual(parseCsv(writeCsv(rows)),rows);
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x\r\ny",z\r\n'),[['a','b'],['x\r\ny','z']]);
  for(const bad of ['"no end','a"b,c','"a"b,c'])assert.throws(()=>parseCsv(bad));
});
test('HTML 与 CSV 文件名保留扩展名，关闭标签列表不删除文稿',()=>{
  for(const name of ['页面.html','页面.htm','数据.csv','正文.txt','正文.md'])assert.equal(fileName(name),name);
  assert.equal(fileKind('a.HTM'),'HTML');assert.equal(fileKind('a.CSV'),'CSV');
  const doc=newDocument('a.csv','a,b');const value=validateWorkspace({version:1,documents:[doc],openIds:['missing',doc.id,doc.id],activeId:doc.id});
  assert.deepEqual(value.openIds,[doc.id]);value.openIds=[];assert.equal(validateWorkspace(value).documents.length,1);
});
test('Acode ZIP 安装解析清单、主脚本与二进制资源，拒绝缺失清单与入口',()=>{
  const manifest={id:'com.example.test',name:'插件',version:'1.0.0',main:'dist/main.js'};
  const record=readPluginZip(zipSync({'plugin.json':strToU8(JSON.stringify(manifest)),'dist/main.js':strToU8('acode.setPluginInit("com.example.test",()=>{});'),'icon.png':new Uint8Array([0,255,128])}));
  assert.equal(record.manifest.id,manifest.id);assert.deepEqual(fromBase64(record.files['icon.png']),new Uint8Array([0,255,128]));assert.equal(validatePluginStore([record])[0],record);
  assert.throws(()=>readPluginZip(zipSync({'main.js':strToU8('')})),/plugin.json/);
  assert.throws(()=>readPluginZip(zipSync({'plugin.json':strToU8(JSON.stringify(manifest))})),/main/);
});
test('插件 ZIP 拒绝越界路径与解压炸弹',()=>{
  for(const path of ['../main.js','/main.js','a\\main.js','a/../../main.js'])assert.throws(()=>assetPath(path));
  assert.throws(()=>readPluginZip(zipSync({'../main.js':strToU8('bad')})),/路径/);
  assert.throws(()=>readPluginZip(zipSync({'huge.txt':new Uint8Array(17*1024*1024)})),/解压/);
});
test('首次安装指南包含快捷键，仅完全未修改的旧示例被迁移',async()=>{
  assert.ok(guide.includes('操作指南'));assert.ok(guide.includes('Ctrl+Shift+G'));assert.ok(!guide.includes('封锁线'));
  const text=await readFile('tests/fixtures/legacy-demo.txt','utf8');
  const doc=newDocument('长篇小说.txt',text);assert.equal(await isOriginalDemo(doc),true);
  assert.equal(await isOriginalDemo({...doc,text:text+'修改'}),false);
  assert.equal(await isOriginalDemo({...doc,name:'我的小说.txt'}),false);
  assert.equal(await isOriginalDemo({...doc,remote:{repo:'test'}}),false);
});
