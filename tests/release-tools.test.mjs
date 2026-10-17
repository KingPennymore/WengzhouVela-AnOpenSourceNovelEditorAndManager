import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {versionCode,npmVersion,readVersions,versionProblems,bumpVersions} from '../scripts/versions.mjs';
import {lines,changedPaths,packVersion,redact,secrets} from '../scripts/release.mjs';

const files=['package.json','package-lock.json','AppScope/app.json5','android/app/build.gradle','windows/package.json','windows/package-lock.json'];
function copy(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vela-bump-'));for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(file,path.join(root,file));}return root;}

test('version codes and npm versions follow scripts/check-build.mjs',()=>{
  assert.equal(versionCode('0.9.8.1'),1090801);assert.equal(versionCode('0.9.9'),1090900);assert.equal(versionCode('1.0.0.2'),2000002);
  assert.equal(npmVersion('0.9.8.1'),'0.9.8-1');assert.equal(npmVersion('0.9.9'),'0.9.9');assert.throws(()=>versionCode('0.9'),/版本号格式/);
  assert.deepEqual(versionProblems(),[],'the repository itself is consistent');
});

test('bump sets every version field, keeps the rest of each file, and the result passes the consistency check',()=>{
  const root=copy();try{
    for(const version of [readVersions(root).release==='0.9.9'?'0.9.9.1':'0.9.9','1.0.0.2']){
      assert.equal(bumpVersions(version,root).length,6);const v=readVersions(root);assert.deepEqual(versionProblems(v),[]);
      assert.equal(v.release,version);assert.equal(v.harmony.code,versionCode(version));assert.equal(v.android.name,version+'-android.1');assert.equal(v.windows.vela,version);assert.deepEqual(bumpVersions(version,root),[],'repeating the same version is a no-op');
    }
    const lock=fs.readFileSync(path.join(root,'package-lock.json'),'utf8'),original=fs.readFileSync('package-lock.json','utf8');
    assert.equal(lock.split('\n').length,original.split('\n').length);assert.equal(lock.split('\n').filter((line,i)=>line!==original.split('\n')[i]).length,readVersions().release==='1.0.0.2'?0:2,'only the two own version lines change');
    fs.writeFileSync(path.join(root,'android/app/build.gradle'),fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8').replace(/versionCode \d+/,'versionCode 1'));
    assert.match(versionProblems(readVersions(root)).join(),/安卓 versionCode 1/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('release helpers: CRLF output, porcelain paths, the HarmonyOS pack version and secret redaction',()=>{
  assert.deepEqual(lines('v0.9.8\r\nv0.9.8.1\r\n\r\n'),['v0.9.8','v0.9.8.1']);
  assert.deepEqual(changedPaths(' M entry/a.js\r\n?? scripts/b.mjs\r\nM  c.css\n'),['entry/a.js','scripts/b.mjs','c.css']);
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vela-pack-')),app=path.join(folder,'me.wenzhou.write-0.9.6.app');
  try{fs.writeFileSync(app,zipSync({'pack.info':strToU8(JSON.stringify({summary:{app:{version:{code:1090900,name:'0.9.9'}}}})),'entry-default.hap':strToU8('hap')}));assert.equal(packVersion(app),'0.9.9','the version inside the .app, not its file name');}
  finally{fs.rmSync(folder,{recursive:true,force:true});}
  secrets.add('gitee-token-123');secrets.add(encodeURIComponent('gitee-token-123'));
  assert.equal(redact('GET https://gitee.com/api/v5/x?access_token=gitee-token-123 → 401'),'GET https://gitee.com/api/v5/x?access_token=*** → 401');
});
