import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const compiled=await build({entryPoints:['entry/src/main/ets/services/WorkspaceFiles.ets'],bundle:true,write:false,platform:'node',format:'cjs',resolveExtensions:['.ets','.js'],loader:{'.ets':'ts'},plugins:[{name:'sdk',setup(p){p.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));p.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(args.path)}];`}));}}]});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wenzhou-storage-')),sandbox=path.join(root,'sandbox');fs.mkdirSync(sandbox);
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  let failRename='',blockReads=false;
  const sdk={'@kit.AbilityKit':{},'@kit.CoreFileKit':{
    fileIo:{OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4,READ_ONLY:0},accessSync:p=>fs.existsSync(p),readTextSync:p=>fs.readFileSync(p,'utf8'),openSync:(p,mode)=>({fd:fs.openSync(p,mode?'w':'r')}),writeSync:(fd,b)=>fs.writeSync(fd,new Uint8Array(b)),readSync:(fd,b)=>fs.readSync(fd,new Uint8Array(b)),statSync:fd=>fs.fstatSync(fd),lstatSync:p=>fs.lstatSync(p),closeSync:f=>fs.closeSync(f.fd),fsyncSync:fd=>fs.fsyncSync(fd),copyFileSync:(a,b)=>fs.copyFileSync(a,b),renameSync:(a,b)=>{if(failRename&&b.endsWith(failRename)){failRename='';throw new Error('模拟磁盘写入失败');}fs.renameSync(a,b);},mkdirSync:(p,recursive)=>fs.mkdirSync(p,{recursive:!!recursive}),rmdirSync:p=>{assert.ok(path.resolve(p).startsWith(path.resolve(root)+path.sep));fs.rmSync(p,{recursive:true});},unlinkSync:p=>fs.unlinkSync(p),listFileSync:p=>{if(blockReads)throw new Error('工作区授权不可用');return fs.readdirSync(p);}}
  },'@kit.ArkTS':{util:{generateRandomUUID:randomUUID,TextEncoder:class{encodeInto(s){return new TextEncoder().encode(s);}},TextDecoder:{create:(encoding,options)=>({decodeToString:bytes=>new TextDecoder(encoding,options).decode(bytes)})},Base64Helper:class{decodeSync(s){return new Uint8Array(Buffer.from(s,'base64'));}encodeToStringSync(bytes){return Buffer.from(bytes).toString('base64');}}}}};
  const module={exports:{}},context=vm.createContext({sdk,module,exports:module.exports,Error,Uint8Array,ArrayBuffer,Date,decodeURIComponent});new vm.Script(compiled.outputFiles[0].text).runInContext(context);
  const create=()=>{const service=new module.exports.WorkspaceFiles();service.context={filesDir:sandbox};return service;};
  return {create,root,sandbox,blockReads:()=>{blockReads=true;},failOnce:suffix=>{failRename=suffix;}};
}

test('内部工作区直接创建实文件及空目录，重启保留标识，不依赖权限或目录选择器',async t=>{
  const f=fixture(t),service=f.create(),folder=await service.initialize();assert.equal(folder.storage.internal,true);assert.equal(folder.storage.needsSetup,false);assert.equal(path.resolve(folder.storage.root),path.join(f.sandbox,'workspaces','文舟'));assert.equal(service.choose,undefined);
  const data={version:1,storage:folder.storage,folders:['空目录'],documents:[{id:'book',name:'正文.txt',path:'小说/正文.txt',text:'中文正文',updatedAt:1,remote:null}]};service.mirror(JSON.stringify(data));assert.ok(fs.statSync(path.join(folder.storage.root,'空目录')).isDirectory());
  const resumed=await f.create().initialize();assert.equal(resumed.documents[0].id,'book');assert.equal(resumed.documents[0].text,'中文正文');assert.equal(resumed.storage.id,folder.storage.id);
});
test('配置不能使内部服务访问外部目录，初始化后只允许内部工作区',async t=>{
  const f=fixture(t),outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'保留.txt'),'外部文件');fs.writeFileSync(path.join(f.sandbox,'folders.json'),JSON.stringify({current:'outside',default:'outside',roots:[{id:'outside',path:outside,uri:'file://outside',label:'外部'}]}));
  const folder=await f.create().initialize();assert.equal(folder.storage.internal,true);assert.equal(folder.documents.length,0);assert.equal(fs.readFileSync(path.join(outside,'保留.txt'),'utf8'),'外部文件');assert.equal(JSON.parse(fs.readFileSync(path.join(f.sandbox,'folders.json'),'utf8')).roots.length,1);
});
test('越界路径和磁盘内容冲突不会覆盖文件，初始化写入失败可重试',async t=>{
  const f=fixture(t),service=f.create();f.failOnce('folders.json');await assert.rejects(service.initialize(),/模拟磁盘/);const folder=await service.initialize(),file=path.join(folder.storage.root,'a.txt'),data={version:1,storage:folder.storage,documents:[{id:'a',name:'a.txt',text:'原文',updatedAt:1,remote:null}]};service.mirror(JSON.stringify(data));fs.writeFileSync(file,'磁盘改动');data.documents[0].text='新文';assert.throws(()=>service.mirror(JSON.stringify(data)),/外部修改/);assert.equal(fs.readFileSync(file,'utf8'),'磁盘改动');data.documents[0].path='../outside.txt';assert.throws(()=>service.mirror(JSON.stringify(data)),/相对路径/);
});
test('整仓库批量写入保留二进制，写入中断后恢复已覆盖文件',async t=>{
  const f=fixture(t),service=f.create(),folder=await service.initialize(),base=folder.storage.root;fs.writeFileSync(path.join(base,'a.txt'),'旧');const files=[{path:'a.txt',data:Buffer.from('新').toString('base64')},{path:'b.bin',data:Buffer.from([0,255]).toString('base64')}];f.failOnce('b.bin');assert.throws(()=>service.writeFiles(files,[]),/模拟磁盘/);assert.equal(fs.readFileSync(path.join(base,'a.txt'),'utf8'),'旧');assert.equal(fs.existsSync(path.join(base,'b.bin')),false);service.writeFiles(files,[]);assert.deepEqual(fs.readFileSync(path.join(base,'b.bin')),Buffer.from([0,255]));
});
test('内部目录的 UTF-16 CSV 与图片可读取，图片路径不能越界',async t=>{
  const f=fixture(t),service=f.create(),initial=await service.initialize(),folder=path.join(initial.storage.root,'100%');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'人物.CSV'),Buffer.concat([Buffer.from([255,254]),Buffer.from('姓名;身份\n文舟;作者','utf16le')]));fs.writeFileSync(path.join(folder,'封面.png'),Buffer.from([137,80,78,71]));const state=service.scan();assert.equal(state.documents.find(d=>d.name==='人物.CSV').text,'姓名;身份\n文舟;作者');assert.equal(service.readAsset('100%/封面.png'),'data:image/png;base64,iVBORw==');assert.throws(()=>service.readAsset('../封面.png'),/相对路径/);
});
test('内部目录移动与复制保留二进制、空文件夹和编码，移动保留 ID，复制解除远端关联',async t=>{
  const f=fixture(t),service=f.create(),folder=await service.initialize(),base=folder.storage.root;
  service.mirror(JSON.stringify({version:1,storage:folder.storage,folders:['小说/空目录'],repositories:[{repo:'me/book',branch:'main',commit:'abc',folder:'小说'}],documents:[{id:'book',name:'小说.txt',path:'小说/小说.txt',text:'中文正文',updatedAt:1,remote:{repo:'me/book'}}]}));
  const bytes=Buffer.from([0,255,13,10]);fs.writeFileSync(path.join(base,'小说/封面.png'),bytes);
  const csv=Buffer.concat([Buffer.from([255,254]),Buffer.from('姓名,身份\n甲,主角','utf16le')]);fs.writeFileSync(path.join(base,'小说/人物.csv'),csv);
  let moved=service.manage('move','小说','成稿/第一部');assert.equal(moved.documents.find(d=>d.id==='book').path,'成稿/第一部/小说.txt');assert.equal(moved.repositories[0].folder,'成稿/第一部');assert.ok(moved.folders.includes('成稿/第一部/空目录'));
  assert.deepEqual(fs.readFileSync(path.join(base,'成稿/第一部/封面.png')),bytes);
  const copied=service.manage('copy','成稿/第一部','成稿/副本'),clone=copied.documents.find(d=>d.path==='成稿/副本/小说.txt');assert.notEqual(clone.id,'book');assert.equal(clone.remote,null);assert.equal(clone.text,'中文正文');assert.deepEqual(fs.readFileSync(path.join(base,'成稿/副本/人物.csv')),csv);
  const resumed=await f.create().initialize();assert.equal(resumed.documents.find(d=>d.path===clone.path).id,clone.id);assert.equal(resumed.repositories.length,1);
});
test('删除文件夹进入回收站，跨重启恢复附件和关联；冲突时不覆盖，永久删除仅移除回收内容',async t=>{
  const f=fixture(t),service=f.create(),folder=await service.initialize(),base=folder.storage.root;
  service.mirror(JSON.stringify({version:1,storage:folder.storage,folders:['小说/空目录'],repositories:[{repo:'me/book',branch:'main',commit:'abc',folder:'小说'}],documents:[{id:'book',name:'小说.txt',path:'小说/小说.txt',text:'正文',updatedAt:1,remote:null},{id:'keep',name:'保留.txt',path:'保留.txt',text:'保留',updatedAt:1,remote:null}]}));fs.writeFileSync(path.join(base,'小说/封面.png'),Buffer.from([0,255]));
  const deleted=service.manage('delete','小说','');assert.equal(deleted.documents.length,1);assert.equal(deleted.repositories.length,0);assert.equal(fs.existsSync(path.join(base,'小说')),false);
  const resumed=f.create();await resumed.initialize();const item=resumed.listTrash()[0];fs.mkdirSync(path.join(base,'小说'));assert.throws(()=>resumed.restoreTrash(item.id,false),/同名/);assert.equal(resumed.listTrash().length,1);fs.rmdirSync(path.join(base,'小说'));
  const restored=resumed.restoreTrash(item.id,false);assert.equal(restored.documents.find(d=>d.id==='book').text,'正文');assert.equal(restored.repositories[0].folder,'小说');assert.deepEqual(fs.readFileSync(path.join(base,'小说/封面.png')),Buffer.from([0,255]));assert.ok(restored.folders.includes('小说/空目录'));
  resumed.manage('delete','小说','');resumed.restoreTrash(resumed.listTrash()[0].id,true);assert.equal(resumed.listTrash().length,0);assert.equal(fs.readFileSync(path.join(base,'保留.txt'),'utf8'),'保留');
});
test('目录操作中断回退实文件和状态，拒绝越界、覆盖和自身子目录',async t=>{
  const f=fixture(t),service=f.create(),folder=await service.initialize(),base=folder.storage.root;
  service.mirror(JSON.stringify({version:1,storage:folder.storage,documents:[{id:'book',name:'小说.txt',path:'小说/小说.txt',text:'完整正文',updatedAt:1,remote:null}]}));
  f.failOnce('folder-'+folder.storage.id+'.json');assert.throws(()=>service.manage('move','小说','改名'),/模拟磁盘/);assert.equal(fs.readFileSync(path.join(base,'小说/小说.txt'),'utf8'),'完整正文');assert.equal(fs.existsSync(path.join(base,'改名')),false);assert.equal(service.scan().documents[0].id,'book');
  f.failOnce('folder-'+folder.storage.id+'.json');assert.throws(()=>service.manage('copy','小说','副本'),/模拟磁盘/);assert.equal(fs.existsSync(path.join(base,'副本')),false);
  f.failOnce('trash.json');assert.throws(()=>service.manage('delete','小说',''),/模拟磁盘/);assert.equal(service.listTrash().length,0);assert.equal(fs.readFileSync(path.join(base,'小说/小说.txt'),'utf8'),'完整正文');
  assert.throws(()=>service.manage('move','小说','../坏'),/相对路径/);assert.throws(()=>service.manage('copy','小说','小说/子目录'),/自身/);assert.throws(()=>service.manage('copy','小说/小说.txt','小说/小说.txt'),/自身|已存在/);assert.equal(fs.readFileSync(path.join(base,'小说/小说.txt'),'utf8'),'完整正文');
});
