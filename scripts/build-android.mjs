import {spawn,execFileSync} from 'node:child_process';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
if(process.argv.includes('--assets-only')){
  await import('./build.mjs');
  await mkdir('android/app/src/main/assets',{recursive:true});
  await cp('entry/src/main/resources/rawfile/web','android/app/src/main/assets/web',{recursive:true});
  const license=await readFile('android/APACHE-2.0.txt','utf8');
  const file='android/app/src/main/assets/web/licenses.js';
  await writeFile(file,(await readFile(file,'utf8'))+'\nwindow.WENZHOU_LICENSES.push('+JSON.stringify({name:'AndroidX Core / WebKit · Apache-2.0',text:license})+');\n');
  console.log('安卓编辑器资源已生成。');
}else{
  const registry=name=>{
    if(process.platform!=='win32')return '';
    try{return execFileSync('powershell.exe',['-NoProfile','-Command',`[Environment]::GetEnvironmentVariable('${name}','User')`],{encoding:'utf8'}).trim();}catch{return '';}
  };
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||registry('ANDROID_HOME');
  const java=process.env.ANDROID_JAVA_HOME||registry('ANDROID_JAVA_HOME')||process.env.JAVA_HOME;
  if(!sdk||!existsSync(sdk))throw new Error('请先配置 ANDROID_HOME（Android SDK 路径）。');
  const env={...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,...(java?{JAVA_HOME:java}:{} )};
  await writeFile('android/local.properties',`sdk.dir=${sdk.replaceAll('\\','/')}\n`);
  const release=process.argv.includes('--release');
  const command=release?'assembleRelease bundleRelease':'assembleDebug';
  const child=process.platform==='win32'
    ?spawn('cmd.exe',['/d','/s','/c',`gradlew.bat --no-daemon --console=plain ${command}`],{cwd:join(root,'android'),env,stdio:'inherit'})
    :spawn('./gradlew',['--no-daemon','--console=plain',...command.split(' ')],{cwd:join(root,'android'),env,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error('安卓构建失败，请查看上方错误。');
  const variant=release?'release':'debug',name=(await readFile('android/app/build.gradle','utf8')).match(/versionName '([^']+)'/)[1];
  const source=`android/app/build/outputs/apk/${variant}/app-${variant}${release?'-unsigned':''}.apk`;
  await mkdir('dist',{recursive:true});
  const target=`dist/Vela-${name}-${release?'release-unsigned':'debug'}.apk`;
  await cp(source,target);
  if(release)await cp('android/app/build/outputs/bundle/release/app-release.aab',`dist/Vela-${name}-release-unsigned.aab`);
  const bytes=await readFile(target);
  await writeFile(`dist/android-${variant}.json`,JSON.stringify({version:name,package:'me.wenzhou.write',variant,signed:!release,file:target.split('/').at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
  console.log('安卓 APK：'+target+(release?'（未签名）':'（调试签名）'));
}
