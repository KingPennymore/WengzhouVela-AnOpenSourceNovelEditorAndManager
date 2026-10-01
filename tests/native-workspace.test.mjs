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
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wenzhou-storage-')),sandbox=path.join(root,'sandbox'),downloads=path.join(root,'Download'),other=path.join(root,'other');
  for(const folder of [sandbox,downloads,other])fs.mkdirSync(folder);
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  let selected=downloads,denied=false,failRename='';const grants=[];
  const sdk={'@kit.AbilityKit':{},'@kit.CoreFileKit':{
    fileIo:{OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4,READ_ONLY:0},accessSync:p=>fs.existsSync(p),readTextSync:p=>fs.readFileSync(p,'utf8'),openSync:(p,mode)=>({fd:fs.openSync(p,mode?'w':'r')}),writeSync:(fd,b)=>fs.writeSync(fd,new Uint8Array(b)),readSync:(fd,b)=>fs.readSync(fd,new Uint8Array(b)),statSync:fd=>fs.fstatSync(fd),lstatSync:p=>fs.lstatSync(p),closeSync:f=>fs.closeSync(f.fd),fsyncSync:fd=>fs.fsyncSync(fd),renameSync:(a,b)=>{if(failRename&&b.endsWith(failRename)){failRename='';throw new Error('模拟磁盘写入失败');}fs.renameSync(a,b);},mkdirSync:(p,recursive)=>fs.mkdirSync(p,{recursive:!!recursive}),rmdirSync:p=>{assert.ok(p.startsWith(sandbox+'/pull-'));fs.rmSync(p,{recursive:true});},unlinkSync:p=>fs.unlinkSync(p),listFileSync:p=>fs.readdirSync(p)},
    fileUri:{FileUri:class{constructor(uri){this.path=uri;this.name=path.basename(uri);}}},
    picker:{DocumentSelectMode:{FOLDER:1},DocumentViewPicker:class{async select(options){assert.equal(options.selectMode,1);return [selected];}}},
    fileShare:{OperationMode:{READ_MODE:1,WRITE_MODE:2},persistPermission:async policies=>{if(denied)throw new Error('授权失败');grants.push(['persist',policies]);},activatePermission:async policies=>grants.push(['activate',policies])},
    Environment:{getUserDownloadDir:()=>{throw new Error('平板不支持');}}
  },'@kit.ArkTS':{util:{generateRandomUUID:randomUUID,TextEncoder:class{encodeInto(s){return new TextEncoder().encode(s);}},TextDecoder:{create:(encoding,options)=>({decodeToString:bytes=>new TextDecoder(encoding,options).decode(bytes)})},Base64Helper:class{decodeSync(s){return new Uint8Array(Buffer.from(s,'base64'));}encodeToStringSync(bytes){return Buffer.from(bytes).toString('base64');}}}}};
  const module={exports:{}},context=vm.createContext({sdk,module,exports:module.exports,Error,Uint8Array,ArrayBuffer,Date,decodeURIComponent});new vm.Script(compiled.outputFiles[0].text).runInContext(context);
  const create=()=>{const service=new module.exports.WorkspaceFiles();service.context={filesDir:sandbox};return service;};
  return {create,downloads,other,grants,select:p=>{selected=p;},deny:()=>{denied=true;},failOnce:suffix=>{failRename=suffix;}};
}
test('首次授权下载目录后创建文舟文件夹，文稿、子目录和空工作区保存到实文件',async t=>{
  const f=fixture(t),service=f.create();assert.equal((await service.initialize()).storage.needsSetup,true);const folder=await service.choose(true);
  const data={version:1,storage:folder.storage,folders:['资料'],documents:[{id:'book',name:'小说.md',path:'正文/小说.md',text:'# 第一章\n中文',updatedAt:1,remote:null}]};
  service.mirror(JSON.stringify(data));assert.equal(fs.readFileSync(path.join(f.downloads,'文舟/正文/小说.md'),'utf8'),data.documents[0].text);assert.ok(fs.statSync(path.join(f.downloads,'文舟/资料')).isDirectory());
  data.documents=[];service.mirror(JSON.stringify(data));assert.equal(fs.existsSync(path.join(f.downloads,'文舟/正文/小说.md')),false);
});
test('重启激活持久授权，切换文件夹不会删除原工作区文件',async t=>{
  const f=fixture(t),service=f.create();await service.initialize();const folder=await service.choose(true),data={version:1,storage:folder.storage,documents:[{id:'a',name:'a.txt',text:'旧工作区',updatedAt:1,remote:null}]};service.mirror(JSON.stringify(data));
  const resumed=f.create();await resumed.initialize();assert.equal(f.grants.at(-1)[0],'activate');f.select(f.other);const opened=await resumed.choose(false);resumed.mirror(JSON.stringify({version:1,storage:opened.storage,documents:[]}));assert.equal(fs.readFileSync(path.join(f.downloads,'文舟/a.txt'),'utf8'),'旧工作区');
});
test('授权失败、越界路径和外部编辑均不覆盖用户文件',async t=>{
  const f=fixture(t),service=f.create();await service.initialize();const folder=await service.choose(true),file=path.join(f.downloads,'文舟/a.txt'),data={version:1,storage:folder.storage,documents:[{id:'a',name:'a.txt',text:'原文',updatedAt:1,remote:null}]};service.mirror(JSON.stringify(data));fs.writeFileSync(file,'外部改动');data.documents[0].text='新文';assert.throws(()=>service.mirror(JSON.stringify(data)),/外部修改/);assert.equal(fs.readFileSync(file,'utf8'),'外部改动');data.documents[0].path='../outside.txt';assert.throws(()=>service.mirror(JSON.stringify(data)),/相对路径/);f.deny();await assert.rejects(service.choose(false),/授权失败/);
});
test('整仓库批量写入保留二进制，写入中断后恢复已覆盖文件',async t=>{
  const f=fixture(t),service=f.create();await service.initialize();await service.choose(true);
  const base=path.join(f.downloads,'文舟');fs.writeFileSync(path.join(base,'a.txt'),'旧');
  const files=[{path:'a.txt',data:Buffer.from('新').toString('base64')},{path:'b.bin',data:Buffer.from([0,255]).toString('base64')}];f.failOnce('b.bin');assert.throws(()=>service.writeFiles(files,[]),/模拟磁盘/);assert.equal(fs.readFileSync(path.join(base,'a.txt'),'utf8'),'旧');assert.equal(fs.existsSync(path.join(base,'b.bin')),false);
  service.writeFiles(files,[]);assert.deepEqual(fs.readFileSync(path.join(base,'b.bin')),Buffer.from([0,255]));
});

test('含百分号的目录、UTF-16 CSV 扫描与本地图片读取正确，图片路径不能越界',async t=>{
  const f=fixture(t),service=f.create();await service.initialize();const folder=path.join(f.other,'100%');fs.mkdirSync(folder);f.select(folder);
  fs.writeFileSync(path.join(folder,'人物.CSV'),Buffer.concat([Buffer.from([255,254]),Buffer.from('姓名;身份\n文舟;作者','utf16le')]));fs.writeFileSync(path.join(folder,'封面.png'),Buffer.from([137,80,78,71]));
  const opened=await service.choose(false);assert.equal(opened.storage.label,'100%');assert.equal(opened.documents.find(d=>d.name==='人物.CSV').text,'姓名;身份\n文舟;作者');assert.equal(service.readAsset('封面.png'),'data:image/png;base64,iVBORw==');assert.throws(()=>service.readAsset('../封面.png'),/相对路径/);
});
test('目录配置写入失败时保留原工作区，仍可继续保存',async t=>{
  const f=fixture(t),service=f.create();await service.initialize();const original=await service.choose(true);f.select(f.other);f.failOnce('folders.json');await assert.rejects(service.choose(false),/模拟磁盘/);
  service.mirror(JSON.stringify({version:1,storage:original.storage,documents:[{id:'a',name:'a.txt',text:'保留原工作区',updatedAt:1,remote:null}]}));assert.equal(fs.readFileSync(path.join(f.downloads,'文舟/a.txt'),'utf8'),'保留原工作区');
});
