// Version numbers of the three apps, read and written in one place (scripts/release.mjs bump, scripts/check-build.mjs).
// The release version may have four parts (0.9.8.1). npm only accepts three, so package.json and windows/package.json
// carry 0.9.8-1 as `version` and the release version in `harmonyVersion` / `velaVersion`. Android names its builds
// <version>-android.N. Mobile version codes since 0.9.8.1: ((major+1)*10000+minor*100+patch)*100+fourth part
// (0.9.8.1 -> 1090801, 0.9.9 -> 1090900).
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

export const VERSION=/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/;
export function versionCode(version){const m=VERSION.exec(version);if(!m)throw Error('版本号格式应为 x.y.z 或 x.y.z.w：'+version);const [a,b,c,d]=[m[1],m[2],m[3],m[4]||0].map(Number);return (10000*(a+1)+100*b+c)*100+d;}
export function npmVersion(version){const m=VERSION.exec(version);if(!m)throw Error('版本号格式应为 x.y.z 或 x.y.z.w：'+version);return m[4]===undefined?version:`${m[1]}.${m[2]}.${m[3]}-${m[4]}`;}
const files={pkg:'package.json',lock:'package-lock.json',app:'AppScope/app.json5',gradle:'android/app/build.gradle',windows:'windows/package.json',windowsLock:'windows/package-lock.json'};

export function readVersions(root=process.cwd()){
  const text=name=>readFileSync(path.join(root,files[name]),'utf8'),json=name=>JSON.parse(text(name));
  const pkg=json('pkg'),app=json('app').app,windows=json('windows'),gradle=text('gradle');
  return {release:pkg.harmonyVersion||pkg.version,npm:pkg.version,lock:json('lock').version,harmony:{name:app.versionName,code:app.versionCode},
    android:{name:gradle.match(/versionName '([^']+)'/)?.[1],code:Number(gradle.match(/versionCode (\d+)/)?.[1])},windows:{version:windows.version,vela:windows.velaVersion||windows.version},windowsLock:json('windowsLock').version};
}
/** Mismatches between the files (empty when consistent). */
export function versionProblems(v=readVersions()){
  const problems=[],expect=(ok,message)=>{if(!ok)problems.push(message);};
  let code=null;try{code=versionCode(v.release);}catch(error){problems.push(error.message);}
  expect(v.npm===npmVersion(v.release),`package.json version ${v.npm} 应为 ${npmVersion(v.release)}`);expect(v.lock===v.npm,`package-lock.json 版本 ${v.lock} 与 package.json 不一致`);
  expect(v.harmony.name===v.release,`鸿蒙 versionName ${v.harmony.name} 与发布版本 ${v.release} 不一致`);expect(v.harmony.code===code,`鸿蒙 versionCode ${v.harmony.code} 应为 ${code}`);
  expect(v.android.name?.split('-android.')[0]===v.release,`安卓 versionName ${v.android.name} 与发布版本不一致`);expect(v.android.code===code,`安卓 versionCode ${v.android.code} 应为 ${code}`);
  expect(v.windows.version===v.npm,`windows/package.json version ${v.windows.version} 应为 ${v.npm}`);expect(v.windows.vela===v.release,`windows/package.json velaVersion ${v.windows.vela} 应为 ${v.release}`);expect(v.windowsLock===v.windows.version,`windows/package-lock.json 版本 ${v.windowsLock} 与 windows/package.json 不一致`);
  return problems;
}
/** package-lock.json: the root "version" and the one of the root package (packages[""]); dependencies are untouched. */
function lockVersion(text,npm){
  const root=/^(\{\s*"name":\s*"[^"]*",\s*"version":\s*")[^"]+(")/,own=/("packages":\s*\{\s*"":\s*\{\s*"name":\s*"[^"]*",\s*"version":\s*")[^"]+(")/;
  if(!root.test(text)||!own.test(text))throw Error('package-lock.json 结构不符合预期');
  return text.replace(root,`$1${npm}$2`).replace(own,`$1${npm}$2`);
}
/** Sets every version field to `version` (Android build number back to 1); returns the changed files. */
export function bumpVersions(version,root=process.cwd(),{write=true}={}){
  const code=versionCode(version),npm=npmVersion(version),changed=[];
  const update=(name,change)=>{const file=path.join(root,files[name]),before=readFileSync(file,'utf8'),after=change(before);if(after===before)return;changed.push(files[name]);if(write)writeFileSync(file,after);};
  const one=(text,pattern,replacement,label)=>{if(!pattern.test(text))throw Error('找不到 '+label);return text.replace(pattern,replacement);};
  update('pkg',text=>one(one(text,/("version":\s*")[^"]+(")/,`$1${npm}$2`,'package.json version'),/("harmonyVersion":\s*")[^"]+(")/,`$1${version}$2`,'package.json harmonyVersion'));
  update('lock',text=>lockVersion(text,npm));
  update('app',text=>one(one(text,/("versionCode":\s*)\d+/,`$1${code}`,'app.json5 versionCode'),/("versionName":\s*")[^"]+(")/,`$1${version}$2`,'app.json5 versionName'));
  update('gradle',text=>one(one(text,/(versionCode )\d+/,`$1${code}`,'build.gradle versionCode'),/(versionName ')[^']+(')/,`$1${version}-android.1$2`,'build.gradle versionName'));
  update('windows',text=>one(one(text,/("version":\s*")[^"]+(")/,`$1${npm}$2`,'windows/package.json version'),/("velaVersion":\s*")[^"]+(")/,`$1${version}$2`,'windows/package.json velaVersion'));
  update('windowsLock',text=>lockVersion(text,npm));
  return changed;
}
