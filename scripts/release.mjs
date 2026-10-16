// Release pipeline (docs/BUILD-AND-VERIFY.md, “发布流程”). Stages, each re-runnable, resumed after a failure:
//   preflight → build → sign → package → verify → publish-github → mirror-gitee → restore
// Usage:
//   node scripts/release.mjs run [版本] [--dry-run] [--from <阶段>] [--only <阶段>] [--lite-only] [--gitee-replace] [--gitee-full-verify]
//   node scripts/release.mjs status [版本]
//   node scripts/release.mjs bump <版本>                 sync every version field (scripts/versions.mjs)
//   node scripts/release.mjs fingerprints [--record]    show (or record in release-config.json) signing fingerprints
// State is kept in dist/release-state/<版本>.json; `run` continues with the first stage that has not finished, and a
// new commit starts over. Before the first external stage of a run (GitHub, Gitee) every external operation is
// listed and confirmed once. The Gitee token is typed once per run and kept in memory only: it is never written to
// disk, logs or command lines. The Android keystore password is read only by scripts/sign-android.ps1.
import {spawn} from 'node:child_process';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync,copyFileSync,rmSync,appendFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';
import {readVersions,versionProblems,bumpVersions,VERSION} from './versions.mjs';
import {defaultKeyPath,publicEntry,verifyFiles} from './release-signing.mjs';
import {RELEASE_KEYS} from '../web/release-keys.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const configFile='scripts/release-config.json',config=JSON.parse(readFileSync(configFile,'utf8'));
const STAGES=['preflight','build','sign','package','verify','publish-github','mirror-gitee','restore'],EXTERNAL=new Set(['publish-github','mirror-gitee']);
/** A stage runs (also with --only) only after these passed for the same commit; nothing is published unverified. */
const REQUIRES={build:['preflight'],sign:['preflight'],package:['preflight'],verify:['preflight'],'publish-github':['preflight','verify'],'mirror-gitee':['preflight','verify']};
const argv=process.argv.slice(2),command=argv[0]||'help',flag=name=>argv.includes(name),option=name=>{const i=argv.indexOf(name);return i>0?argv[i+1]:undefined;};
const DRY=flag('--dry-run'),positional=argv.slice(1).filter((arg,i,all)=>!arg.startsWith('--')&&!['--from','--only'].includes(all[i-1]));

// ---- output, secrets and commands ---------------------------------------------------------------------------------
export const secrets=new Set();
export const redact=text=>{let value=String(text);for(const secret of secrets)if(secret)value=value.split(secret).join('***');return value;};
let logFile=null;
const say=(...parts)=>{const text=redact(parts.join(' '));console.log(text);if(logFile)appendFileSync(logFile,text+'\n');};
/** Output of git, gh and Windows tools ends lines with CRLF; every parsed line goes through this. */
export const lines=text=>String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
/** Paths from `git status --porcelain` (" M path", "?? path"): the status columns keep their leading space. */
export const changedPaths=text=>String(text).split(/\r?\n/).filter(line=>line.length>3).map(line=>line.slice(3).replace(/^"|"$/g,''));
const quote=value=>/[\s"&|<>^()]/.test(value)?'"'+String(value).replace(/"/g,'\\"')+'"':value;
/**
 * Runs a program. .bat/.cmd go through cmd.exe with absolute paths (no lookup in the current directory). With
 * --dry-run only read-only queries (readOnly) run; everything else is printed.
 */
function exec(program,args=[],{cwd=root,env={},capture=false,input=null,allowFail=false,quiet=false,readOnly=false}={}){
  const batch=/\.(bat|cmd)$/i.test(program),display=[program,...args].map(quote).join(' ');
  if(DRY&&!readOnly){say('  （演练）$ '+display);return Promise.resolve({code:0,out:'',err:'',dry:true});}
  if(!quiet)say('  $ '+display);
  return new Promise((resolve,reject)=>{
    const child=batch?spawn('cmd.exe',['/d','/s','/c','"'+[program,...args].map(quote).join(' ')+'"'],{cwd,env:{...process.env,...env},windowsVerbatimArguments:true,stdio:[input===null?'ignore':'pipe',capture?'pipe':'inherit',capture?'pipe':'inherit']})
      :spawn(program,args,{cwd,env:{...process.env,...env},stdio:[input===null?'ignore':'pipe',capture?'pipe':'inherit',capture?'pipe':'inherit']});
    let out='',err='';if(capture){child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);}
    if(input!==null){child.stdin.end(input);}
    child.on('error',error=>allowFail?resolve({code:-1,out,err:error.message}):reject(Error(redact(`${program} 无法启动：${error.message}`))));
    child.on('exit',code=>{if(code!==0&&!allowFail)reject(Error(redact(`命令失败（退出码 ${code}）：${display}${err?'\n'+err.trim().split(/\r?\n/).slice(-8).join('\n'):''}`)));else resolve({code,out,err});});
  });
}
const sha256=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const size=file=>statSync(file).size,mb=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
async function ask(question){const rl=readline.createInterface({input:process.stdin,output:process.stdout});const answer=await new Promise(resolve=>rl.question(question,resolve));rl.close();return answer.trim();}
/** Reads a line without echo (raw mode on a terminal). */
async function askSecret(question){
  process.stdout.write(question);
  if(!process.stdin.isTTY){const value=await ask('');return value;}
  return new Promise((resolve,reject)=>{let value='';const stdin=process.stdin;stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');
    const done=result=>{stdin.setRawMode(false);stdin.pause();stdin.removeListener('data',onData);process.stdout.write('\n');result instanceof Error?reject(result):resolve(result);};
    const onData=chunk=>{for(const char of chunk){if(char==='\r'||char==='\n')return done(value.trim());if(char==='\u0003')return done(Error('已取消。'));if(char==='\u0008'||char==='\u007f')value=value.slice(0,-1);else value+=char;}};
    stdin.on('data',onData);});
}

// ---- context --------------------------------------------------------------------------------------------------------
const head=async()=>lines((await exec('git',['rev-parse','HEAD'],{capture:true,quiet:true,readOnly:true})).out)[0];
function context(version){
  const v=readVersions(),androidName=v.android.name,flavors=flag('--lite-only')?['-lite']:['-lite',''];
  return {version,tag:'v'+version,androidName,flavors,dryRun:flag('--dry-run'),release:`dist/releases/${version}`,metadata:`dist/metadata/${version}`,
    stateFile:`dist/release-state/${version}.json`,deveco:config.deveco,problems:[],gitee:null};
}
const loadState=ctx=>existsSync(ctx.stateFile)?JSON.parse(readFileSync(ctx.stateFile,'utf8')):{version:ctx.version,head:null,stages:{}};
const saveState=(ctx,state)=>{if(ctx.dryRun)return;mkdirSync(path.dirname(ctx.stateFile),{recursive:true});writeFileSync(ctx.stateFile,JSON.stringify(state,null,2));};
const check=(ctx,ok,message,{warn=false}={})=>{say(`  ${ok?'✓':warn?'!':'✗'} ${message}`);if(!ok&&!warn)ctx.problems.push(message);return ok;};
const androidHome=()=>process.env.ANDROID_HOME||config.androidHome||'';
const androidCertificate=()=>config.androidCertificate||(androidHome()?path.join(path.dirname(androidHome()),'Signing','Wenzhou','Wenzhou-release-public.cer'):'');
const hvigor=ctx=>path.join(ctx.deveco,'tools','hvigor','bin','hvigorw.bat'),ohpm=ctx=>path.join(ctx.deveco,'tools','ohpm','bin','ohpm.bat');
const devecoEnv=ctx=>({DEVECO_SDK_HOME:path.join(ctx.deveco,'sdk'),JAVA_HOME:path.join(ctx.deveco,'jbr'),NODE_HOME:path.join(ctx.deveco,'tools','node'),Path:[path.join(ctx.deveco,'tools','node'),path.join(ctx.deveco,'jbr','bin'),process.env.Path||process.env.PATH].join(';')});
function certificateFingerprint(file){
  const raw=readFileSync(file),pem=raw.toString('latin1').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  return new X509Certificate(pem?pem[0]:raw).fingerprint256.replace(/:/g,'').toLowerCase();
}
/** The certificate HarmonyOS builds are signed with: certpath of the local build-profile.json5 (only that field is read). */
function harmonyCertificate(){const text=existsSync('build-profile.json5')?readFileSync('build-profile.json5','utf8'):'';return text.match(/"certpath"\s*:\s*"([^"]+)"/)?.[1]||'';}
function fingerprints(){
  const result={};
  try{const key=defaultKeyPath();result.releaseKey=existsSync(key)?publicEntry(createPrivateKey(readFileSync(key))).id:'';}catch(error){result.releaseKey='';result.releaseKeyError=error.message;}
  try{const file=androidCertificate();result.android=file&&existsSync(file)?certificateFingerprint(file):'';}catch(error){result.androidError=error.message;}
  try{const file=harmonyCertificate();result.harmonyos=file&&existsSync(file)?certificateFingerprint(file):'';}catch(error){result.harmonyosError=error.message;}
  return result;
}
/** HarmonyOS packs: DevEco may name the .app after an old version (me.wenzhou.write-0.9.6.app); its pack.info is checked. */
export function packVersion(file){const files=unzipSync(new Uint8Array(readFileSync(file)),{filter:entry=>entry.name==='pack.info'});return JSON.parse(strFromU8(files['pack.info'])).summary.app.version.name;}
function newestApp(){const folder='build/outputs/default';if(!existsSync(folder))return null;return readdirSync(folder).filter(name=>name.endsWith('.app')&&!name.endsWith('-unsigned.app')).map(name=>path.join(folder,name)).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0]||null;}
const releaseAssets=ctx=>{const file=`${ctx.metadata}/release-assets-${ctx.version}.json`;return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;};
/** The asset list finalize-release.py writes, for planning before it exists. */
const expectedAssets=ctx=>[...ctx.flavors.flatMap(f=>[`Vela-${ctx.androidName}${f}-release-signed.apk`,`Vela-${ctx.androidName}${f}-release-signed.aab`,`Vela-${ctx.version}${f}-release-signed.app.zip`,`Vela-${ctx.version}${f}-release-signed.hap`,`Vela-${ctx.version}-windows${f}-setup-x64.exe`,`Vela-${ctx.version}-windows${f}-x64.zip`]),`Vela-${ctx.version}-source.zip`,'Vela-TeX-0.1.1.zip','Vela-Ebook-Reader-1.1.0.zip',`SHA256SUMS-${ctx.version}.txt`,`SHA256SUMS-${ctx.version}.txt.sig`];

// ---- stages ---------------------------------------------------------------------------------------------------------
const stages={
  async preflight(ctx){
    const v=readVersions(),problems=versionProblems(v),commit=await head();
    check(ctx,v.release===ctx.version,`版本号：文件中为 ${v.release}，本次发布 ${ctx.version}`);
    for(const problem of problems)check(ctx,false,problem);if(!problems.length)check(ctx,true,`三端版本号一致（鸿蒙 / 安卓 versionCode ${v.harmony.code}，安卓 ${v.android.name}，npm ${v.npm}）`);
    const dirty=changedPaths((await exec('git',['status','--porcelain'],{capture:true,quiet:true,readOnly:true})).out),blocking=dirty.filter(file=>!config.allowDirty.some(prefix=>file===prefix||file.startsWith(prefix)));
    check(ctx,!blocking.length,blocking.length?`工作区有未提交的改动：${blocking.slice(0,8).join('、')}${blocking.length>8?' 等':''}`:`工作区干净（HEAD ${commit.slice(0,10)}${dirty.length?`，忽略构建产物和本机配置 ${dirty.length} 项`:''}）`);
    const tag=lines((await exec('git',['tag','--list',ctx.tag],{capture:true,quiet:true,readOnly:true})).out)[0];
    if(tag){const target=lines((await exec('git',['rev-list','-n','1',ctx.tag],{capture:true,quiet:true,readOnly:true})).out)[0];check(ctx,target===commit,`标签 ${ctx.tag} 指向 ${target?.slice(0,10)}，应为 HEAD`);}else check(ctx,true,`标签 ${ctx.tag} 尚未创建（发布到 GitHub 时在 HEAD 上创建）`);
    check(ctx,readFileSync('RELEASE_NOTES.md','utf8').includes(ctx.version),`RELEASE_NOTES.md 包含 ${ctx.version} 的说明`);
    for(const [program,args] of [['node',['--version']],['python',['--version']],['pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()']],['gh',['--version']]]){const result=await exec(program,args,{capture:true,quiet:true,allowFail:true,readOnly:true});check(ctx,result.code===0,`${program} ${result.code===0?lines(result.out||result.err)[0]:'不可用'}`);}
    const auth=await exec('gh',['auth','status'],{capture:true,quiet:true,allowFail:true,readOnly:true});check(ctx,auth.code===0,auth.code===0?'gh 已登录 GitHub':'gh 未登录：运行 gh auth login',{warn:ctx.dryRun});
    check(ctx,existsSync(hvigor(ctx))&&existsSync(ohpm(ctx)),`DevEco 工具：${ctx.deveco}`);check(ctx,!!androidHome()&&existsSync(androidHome()),`ANDROID_HOME：${androidHome()||'未设置'}`);
    const actual=fingerprints(),expected=config.fingerprints||{};
    check(ctx,!!actual.releaseKey&&RELEASE_KEYS.some(key=>key.id===actual.releaseKey)&&actual.releaseKey===expected.releaseKey,`发布清单签名密钥：${actual.releaseKey||actual.releaseKeyError||'未找到 '+defaultKeyPath()}（应用内置 ${RELEASE_KEYS.map(key=>key.id).join('、')}）`);
    for(const [name,label] of [['android','安卓发布证书'],['harmonyos','鸿蒙发布证书']]){
      if(!actual[name]){check(ctx,false,`${label}：${actual[name+'Error']||'找不到证书文件'}`,{warn:ctx.dryRun});continue;}
      if(!expected[name])check(ctx,false,`${label} SHA-256 ${actual[name]}：release-config.json 尚未记录，核对后运行 fingerprints --record`,{warn:ctx.dryRun});
      else check(ctx,actual[name]===expected[name],`${label} SHA-256 ${actual[name]}${actual[name]===expected[name]?' 与记录一致':' 与记录 '+expected[name]+' 不一致'}`);
    }
    check(ctx,/"signingConfigs"\s*:\s*\[\s*\{/.test(existsSync('build-profile.json5')?readFileSync('build-profile.json5','utf8'):''),'本机 build-profile.json5 已配置鸿蒙签名（DevEco 写入，不提交）',{warn:ctx.dryRun});
  },
  async build(ctx){
    // Lite first: the working tree ends with the full front end, as committed. Each flavor's outputs are copied out
    // before the next build overwrites them.
    for(const flavor of ctx.flavors){
      const lite=flavor==='-lite',extra=lite?['--lite']:[];say(`  — ${lite?'轻量版':'完整版'}`);
      await exec('node',['scripts/build-android.mjs','--release',...extra]);
      await exec('node',['scripts/build-windows.mjs',...extra]);
      await exec(ohpm(ctx),['install'],{env:devecoEnv(ctx)});
      await exec(hvigor(ctx),['--mode','project','-p','product=default','-p','buildMode=release','assembleApp','--no-daemon'],{env:devecoEnv(ctx)});
      if(ctx.dryRun){say(`  · 收集 build/outputs/default/*.app（按 pack.info 核对版本）和 entry-default-signed.hap，改名为 Vela-${ctx.version}${flavor}-release-signed.app / .hap`);continue;}
      const app=newestApp();if(!app)throw Error('DevEco 没有生成已签名的 .app（检查本机 build-profile.json5 的签名配置）。');
      const packed=packVersion(app);if(packed!==ctx.version)throw Error(`${app} 的 pack.info 版本为 ${packed}，不是 ${ctx.version}。`);
      copyFileSync(app,`dist/Vela-${ctx.version}${flavor}-release-signed.app`);say(`  · ${path.basename(app)}（pack.info ${packed}）→ dist/Vela-${ctx.version}${flavor}-release-signed.app`);
      const hap='entry/build/default/outputs/default/entry-default-signed.hap';if(!existsSync(hap))throw Error('缺少已签名的 HAP：'+hap);
      copyFileSync(hap,`dist/Vela-${ctx.version}${flavor}-release-signed.hap`);say(`  · ${hap} → dist/Vela-${ctx.version}${flavor}-release-signed.hap`);
    }
  },
  async sign(ctx){
    // The keystore password is read by sign-android.ps1 alone.
    for(const flavor of ctx.flavors){
      await exec('pwsh',['-NoProfile','-File','scripts/sign-android.ps1',...(flavor?['-Lite']:[])]);
      if(!ctx.dryRun)for(const ext of ['apk','aab']){const file=`dist/Vela-${ctx.androidName}${flavor}-release-signed.${ext}`;if(!existsSync(file))throw Error('签名后缺少 '+file);}
    }
    if(ctx.dryRun)say(`  · 检查发布清单签名私钥 ${defaultKeyPath()} 存在（package 阶段签 SHA256SUMS 与 catalog.json）`);
    else if(!existsSync(defaultKeyPath()))throw Error('缺少发布清单签名私钥：'+defaultKeyPath());
  },
  async package(ctx){
    await exec('python',['scripts/package.py','--source-only']);
    await exec('python',['scripts/finalize-release.py',...(flag('--lite-only')?['--lite-only']:[])]);
    // The catalog keeps every component this release does not carry: start from the published one.
    const previous=path.join(os.tmpdir(),'vela-release-catalog-'+ctx.version);
    if(!ctx.dryRun)rmSync(previous,{recursive:true,force:true});
    await exec('gh',['release','download','catalog','--repo',config.github,'--pattern','catalog.json','--dir',previous,'--clobber']);
    await exec('node',['scripts/build-catalog.mjs','--version',ctx.version,'--previous',path.join(previous,'catalog.json')]);
  },
  async verify(ctx){
    await exec('node',['scripts/verify.mjs','--tex','--windows']);
    if(ctx.dryRun){say(`  · 核对 ${ctx.metadata}/release-assets-${ctx.version}.json 中每个文件存在、与 SHA256SUMS 一致，SHA256SUMS 与 catalog.json 的签名有效，.app 的 pack.info 版本，APK 签名证书指纹`);return;}
    const assets=releaseAssets(ctx);if(!assets)throw Error('缺少发布文件清单，先运行 package 阶段。');
    const sums=new Map(lines(readFileSync(`${ctx.release}/SHA256SUMS-${ctx.version}.txt`,'utf8')).map(line=>line.split(/\s+\*?/)).map(([hash,name])=>[name,hash]));
    for(const name of assets){const file=`${ctx.release}/${name}`;if(!existsSync(file))throw Error('缺少发布文件：'+file);if(sums.has(name)&&sums.get(name)!==sha256(file))throw Error('SHA256SUMS 与文件不符：'+name);}
    say(`  ✓ ${assets.length} 个发布文件齐全，与 SHA256SUMS 一致`);
    for(const result of await verifyFiles([`${ctx.release}/SHA256SUMS-${ctx.version}.txt`,'dist/releases/catalog/catalog.json'])){if(!result.valid)throw Error(`签名无效：${result.file}（${result.reason}）`);say(`  ✓ 签名有效：${result.file}（${result.key}）`);}
    for(const name of assets.filter(name=>name.endsWith('.app.zip'))){const inner=unzipSync(new Uint8Array(readFileSync(`${ctx.release}/${name}`)));const app=Object.keys(inner).find(file=>file.endsWith('.app'));const version=JSON.parse(strFromU8(unzipSync(inner[app],{filter:entry=>entry.name==='pack.info'})['pack.info'])).summary.app.version.name;if(version!==ctx.version)throw Error(`${name} 中的鸿蒙包版本为 ${version}`);say(`  ✓ ${name}：pack.info ${version}`);}
    const apksigner=readdirSync(path.join(androidHome(),'build-tools')).sort().reverse().map(dir=>path.join(androidHome(),'build-tools',dir,'apksigner.bat')).find(existsSync);
    for(const name of assets.filter(name=>name.endsWith('.apk'))){const out=(await exec(apksigner,['verify','--print-certs',`${ctx.release}/${name}`],{capture:true,quiet:true})).out;const digest=lines(out).find(line=>/SHA-256 digest:/.test(line))?.split(':').pop().trim();if(config.fingerprints?.android&&digest!==config.fingerprints.android)throw Error(`${name} 的签名证书 ${digest} 与记录不一致`);say(`  ✓ ${name}：证书 SHA-256 ${digest}`);}
    for(const name of assets)if(size(`${ctx.release}/${name}`)>config.gitee.attachmentLimit)say(`  · 超过 Gitee 附件上限，只发布到 GitHub：${name}（${mb(size(`${ctx.release}/${name}`))}）`);
  },
  async 'publish-github'(ctx){
    const repo=config.github,assets=releaseAssets(ctx)||expectedAssets(ctx),notes=`${ctx.metadata}/release-notes-${ctx.version}.md`;
    const view=await exec('gh',['release','view',ctx.tag,'--repo',repo,'--json','databaseId,isDraft'],{capture:true,quiet:true,allowFail:true,readOnly:true});
    let release=view.code===0?JSON.parse(view.out):null;
    if(!release)await exec('gh',['release','create',ctx.tag,'--repo',repo,'--draft','--target',await head(),'--title',`Vela ${ctx.version}`,'--notes-file',notes]);
    if(ctx.dryRun){say(`  · 上传 ${assets.length} 个文件（已上传且摘要相同的跳过），核对 GitHub 计算的 SHA-256，然后 gh release edit ${ctx.tag} --draft=false --latest`);}
    else{
      release=JSON.parse((await exec('gh',['release','view',ctx.tag,'--repo',repo,'--json','databaseId,isDraft'],{capture:true,quiet:true})).out);
      const remote=()=>exec('gh',['api',`repos/${repo}/releases/${release.databaseId}/assets?per_page=100`],{capture:true,quiet:true}).then(result=>JSON.parse(result.out));
      const present=new Map((await remote()).map(asset=>[asset.name,asset.digest]));
      for(const name of assets){const file=`${ctx.release}/${name}`;if(present.get(name)==='sha256:'+sha256(file)){say('  · 已上传，跳过：'+name);continue;}await exec('gh',['release','upload',ctx.tag,file,'--repo',repo,'--clobber']);}
      const uploaded=new Map((await remote()).map(asset=>[asset.name,asset]));
      for(const name of assets){const asset=uploaded.get(name),file=`${ctx.release}/${name}`;if(!asset||asset.size!==size(file)||asset.digest!=='sha256:'+sha256(file))throw Error('GitHub 上的文件与本地不一致：'+name);}
      say(`  ✓ GitHub 上 ${assets.length} 个文件的大小与 SHA-256 一致`);
      await exec('gh',['release','edit',ctx.tag,'--repo',repo,'--draft=false','--latest']);
    }
    const catalogFiles=['catalog.json','catalog.json.sig','SHA256SUMS-catalog.txt'].map(name=>`dist/releases/catalog/${name}`);
    const catalog=await exec('gh',['release','view','catalog','--repo',repo,'--json','tagName'],{capture:true,quiet:true,allowFail:true,readOnly:true});
    if(catalog.code===0)await exec('gh',['release','upload','catalog',...catalogFiles,'--repo',repo,'--clobber']);
    else await exec('gh',['release','create','catalog',...catalogFiles,'--repo',repo,'--title','文舟组件目录','--notes','应用读取的组件目录','--latest=false']);
  },
  async 'mirror-gitee'(ctx){
    const assets=(releaseAssets(ctx)||expectedAssets(ctx)).filter(name=>ctx.dryRun||size(`${ctx.release}/${name}`)<=config.gitee.attachmentLimit);
    await giteeMirror(ctx,{tag:ctx.tag,folder:ctx.release,names:assets.filter(name=>!name.endsWith('-source.zip')),title:`Vela ${ctx.version}`,notes:`${ctx.metadata}/release-notes-${ctx.version}.md`,sums:`SHA256SUMS-${ctx.version}.txt`});
    await giteeMirror(ctx,{tag:'catalog',folder:'dist/releases/catalog',names:['catalog.json','catalog.json.sig','SHA256SUMS-catalog.txt'],title:'文舟组件目录',notes:null,sums:'SHA256SUMS-catalog.txt',replace:true});
  },
  async restore(ctx){
    // Builds and verify leave the full front end in rawfile; rebuild it once more so the tree matches HEAD's sources.
    await exec('node',['scripts/build.mjs']);await exec('node',['scripts/check-build.mjs']);
    if(!ctx.dryRun)rmSync(path.join(os.tmpdir(),'vela-release-catalog-'+ctx.version),{recursive:true,force:true});
    const dirty=changedPaths((await exec('git',['status','--porcelain'],{capture:true,quiet:true,readOnly:true})).out).filter(file=>!config.allowDirty.some(prefix=>file.startsWith(prefix)));
    check(ctx,!dirty.length,dirty.length?'发布后工作区有改动：'+dirty.join('、'):'工作区与 HEAD 一致（除构建产物和本机配置）');
  }
};

// ---- Gitee (token in memory only) -----------------------------------------------------------------------------------
async function giteeToken(ctx){
  if(ctx.gitee)return ctx.gitee;
  const token=await askSecret('Gitee 私人令牌（需 projects 权限；输入不显示，只在本次运行的内存中使用）：');
  if(!token)throw Error('没有输入 Gitee 令牌。');secrets.add(token);secrets.add(encodeURIComponent(token));ctx.gitee=token;return token;
}
async function giteeMirror(ctx,{tag,folder,names,title,notes,sums,replace=flag('--gitee-replace')}){
  const {owner,repository}=config.gitee,base=`https://gitee.com/api/v5/repos/${owner}/${repository}`;
  if(ctx.dryRun){say(`  · Gitee ${owner}/${repository}：发布 ${tag}（没有则创建），上传 ${names.length} 个文件${replace?'（全部替换）':'（同名同大小的跳过）'}，再核对大小，并从公开地址下载 1 MB 以下的文件核对 SHA-256${flag('--gitee-full-verify')?'（--gitee-full-verify：全部下载核对）':''}`);for(const name of names)say('      '+name);return;}
  const token=await giteeToken(ctx),auth='access_token='+encodeURIComponent(token);
  const call=async(url,init={})=>{const response=await fetch(url,init);if(!response.ok&&!(init.allow404&&response.status===404))throw Error(`Gitee API ${init.method||'GET'} ${redact(url.split('?')[0])} 失败：HTTP ${response.status} ${redact((await response.text()).slice(0,200))}`);return response.status===404?null:response.status===204?null:response.json();};
  let release=await call(`${base}/releases/tags/${tag}?${auth}`,{allow404:true});
  if(!release?.id){const body=new URLSearchParams({access_token:token,tag_name:tag,name:title,body:notes&&existsSync(notes)?readFileSync(notes,'utf8'):title,target_commitish:'master'});release=await call(`${base}/releases`,{method:'POST',body});say(`  · 已创建 Gitee 发布 ${tag}`);}
  const list=async()=>(await call(`${base}/releases/${release.id}/attach_files?${auth}&per_page=100`))||[];
  const attached=await list();
  for(const name of names){
    const file=path.join(folder,name),existing=attached.filter(item=>item.name===name);
    if(existing.length===1&&!replace&&Number(existing[0].size)===size(file)){say('  · 已存在，跳过：'+name);continue;}
    for(const old of existing)await call(`${base}/releases/${release.id}/attach_files/${old.id}?${auth}`,{method:'DELETE'});
    const form=new FormData();form.append('file',new Blob([readFileSync(file)]),name);
    await call(`${base}/releases/${release.id}/attach_files?${auth}`,{method:'POST',body:form});say(`  · 已上传：${name}（${size(file)} 字节）`);
  }
  // Sizes through the API (fast); content by downloading small files back from the public address. Downloading the
  // installers back from Gitee is slow, so that only happens with --gitee-full-verify.
  const listed=await list();
  for(const name of names){const entry=listed.filter(item=>item.name===name);if(entry.length!==1||Number(entry[0].size)!==size(path.join(folder,name)))throw Error(`Gitee 上的 ${name} 大小与本地不一致。`);}
  const expected=new Map(existsSync(path.join(folder,sums))?lines(readFileSync(path.join(folder,sums),'utf8')).map(line=>line.split(/\s+\*?/)).map(([hash,name])=>[name,hash]):[]);
  for(const name of names.filter(name=>flag('--gitee-full-verify')||size(path.join(folder,name))<=1024*1024)){
    const response=await fetch(`https://gitee.com/${owner}/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`);if(!response.ok)throw Error(`从 Gitee 下载 ${name} 失败：HTTP ${response.status}`);
    const hash=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),want=expected.get(name)||sha256(path.join(folder,name));
    if(hash!==want)throw Error(`Gitee 上的 ${name} 内容与本地不一致（刚替换时 CDN 可能仍返回旧文件，稍后用 --only mirror-gitee 重试）。`);
  }
  say(`  ✓ Gitee ${tag}：${names.length} 个文件大小一致，小文件内容已核对 · https://gitee.com/${owner}/${repository}/releases/tag/${tag}`);
}

// ---- external operations, listed and confirmed once -----------------------------------------------------------------
function externalPlan(ctx,selected){
  const items=[],assets=releaseAssets(ctx)||expectedAssets(ctx),sized=name=>existsSync(`${ctx.release}/${name}`)?`（${mb(size(`${ctx.release}/${name}`))}）`:'';
  if(selected.includes('publish-github')){
    items.push(`GitHub ${config.github}：创建或更新草稿发布 ${ctx.tag}（目标 HEAD，说明取自 ${ctx.metadata}/release-notes-${ctx.version}.md）`);
    for(const name of assets)items.push(`GitHub ${ctx.tag}：上传 ${name}${sized(name)}`);
    items.push(`GitHub ${ctx.tag}：核对摘要后设为正式发布并标为 Latest（创建标签 ${ctx.tag}）`);
    items.push(`GitHub catalog：上传 catalog.json、catalog.json.sig、SHA256SUMS-catalog.txt（替换）`);
  }
  if(selected.includes('mirror-gitee')){
    const {owner,repository}=config.gitee;
    for(const name of assets.filter(name=>!name.endsWith('-source.zip')&&(!existsSync(`${ctx.release}/${name}`)||size(`${ctx.release}/${name}`)<=config.gitee.attachmentLimit)))items.push(`Gitee ${owner}/${repository} ${ctx.tag}：上传 ${name}${sized(name)}`);
    items.push(`Gitee ${owner}/${repository} catalog：替换 catalog.json、catalog.json.sig、SHA256SUMS-catalog.txt`);
  }
  return items;
}

// ---- commands -------------------------------------------------------------------------------------------------------
async function run(){
  const version=positional[0]||readVersions().release;if(!VERSION.test(version))throw Error('版本号格式应为 x.y.z 或 x.y.z.w');
  const ctx=context(version),state=loadState(ctx),commit=await head();
  if(!ctx.dryRun){mkdirSync('dist/release-state',{recursive:true});logFile=`dist/release-state/${version}.log`;appendFileSync(logFile,`\n==== ${new Date().toISOString()} ${argv.join(' ')}\n`);}
  if(state.head&&state.head!==commit){say(`提交已从 ${state.head.slice(0,10)} 变为 ${commit.slice(0,10)}，从头开始。`);state.stages={};}
  state.head=commit;
  const from=option('--from'),only=option('--only');for(const name of [from,only].filter(Boolean))if(!STAGES.includes(name))throw Error('未知阶段：'+name+'。可用：'+STAGES.join('、'));
  if(from)for(const name of STAGES.slice(STAGES.indexOf(from)))delete state.stages[name];
  const selected=only?[only]:STAGES.filter(name=>ctx.dryRun||state.stages[name]?.status!=='done');
  say(`文舟 ${version} 发布${ctx.dryRun?'（演练：只检查和列出，不构建、不签名、不上传）':''} · HEAD ${commit.slice(0,10)} · 阶段：${selected.join(' → ')||'全部已完成'}`);
  let confirmed=ctx.dryRun;
  if(!ctx.dryRun)for(const name of selected){const missing=(REQUIRES[name]||[]).filter(need=>state.stages[need]?.status!=='done'&&!selected.slice(0,selected.indexOf(name)).includes(need));if(missing.length){say(`✗ ${name} 需要先通过：${missing.join('、')}（node scripts/release.mjs run 会按顺序执行）。`);process.exitCode=1;return;}}
  for(const name of selected){
    if(EXTERNAL.has(name)&&!confirmed){
      const items=externalPlan(ctx,selected.filter(stage=>EXTERNAL.has(stage)));
      say(`\n即将执行 ${items.length} 项外部操作：`);for(const item of items)say('  - '+item);
      if((await ask('\n输入 yes 确认执行以上全部外部操作：'))!=='yes'){say('已取消，没有执行任何外部操作。');saveState(ctx,state);return;}
      confirmed=true;
    }
    say(`\n[${name}]${EXTERNAL.has(name)?' 外部操作':''}`);const started=Date.now();
    if(ctx.dryRun&&EXTERNAL.has(name)){for(const item of externalPlan(ctx,[name]))say('  - '+item);}
    try{await stages[name](ctx);}
    catch(error){state.stages[name]={status:'failed',at:new Date().toISOString(),error:redact(error.message)};saveState(ctx,state);say(`\n✗ ${name} 失败：${redact(error.message)}\n修正后重新运行 node scripts/release.mjs run ${version}，会从这一阶段继续。`);process.exitCode=1;return;}
    if(name==='preflight'&&ctx.problems.length&&!ctx.dryRun){state.stages[name]={status:'failed',at:new Date().toISOString(),error:ctx.problems.join('；')};saveState(ctx,state);say(`\n✗ 预检有 ${ctx.problems.length} 项问题，未继续。`);process.exitCode=1;return;}
    state.stages[name]={status:'done',at:new Date().toISOString(),seconds:Math.round((Date.now()-started)/1000)};saveState(ctx,state);
  }
  if(ctx.dryRun){say(`\n演练完成：${selected.length} 个阶段全部走通${ctx.problems.length?`，发现 ${ctx.problems.length} 项需要处理：\n  - `+ctx.problems.join('\n  - '):'，没有发现问题'}。`);if(ctx.problems.length)process.exitCode=1;}
  else say(`\n发布 ${version} 完成。状态：${ctx.stateFile}`);
}
async function status(){const version=positional[0]||readVersions().release,ctx=context(version),state=loadState(ctx);say(`文舟 ${version} · 提交 ${state.head?.slice(0,10)||'—'}`);for(const name of STAGES){const item=state.stages[name];say(`  ${item?.status==='done'?'✓':item?.status==='failed'?'✗':'·'} ${name}${item?` · ${item.at}${item.error?' · '+item.error:''}`:''}`);}}
function bump(){
  const version=positional[0];if(!version)throw Error('用法：node scripts/release.mjs bump <版本>');
  const before=readVersions(),changed=bumpVersions(version,root,{write:!flag('--dry-run')});
  say(`${before.release} → ${version}${flag('--dry-run')?'（演练，未写入）':''}`);for(const file of changed)say('  '+file);
  if(!flag('--dry-run')){const problems=versionProblems();if(problems.length)throw Error(problems.join('；'));say('版本号已同步；记得在 RELEASE_NOTES.md 写本版说明，并重新构建（npm run build）。');}
}
async function fingerprintsCommand(){
  const actual=fingerprints();for(const [key,value] of Object.entries(actual))say(`${key}: ${value||'—'}`);
  if(flag('--record')){const next={...config,fingerprints:{...config.fingerprints,...Object.fromEntries(['android','harmonyos','releaseKey'].filter(key=>actual[key]).map(key=>[key,actual[key]]))}};writeFileSync(configFile,JSON.stringify(next,null,2)+'\n');say('已写入 '+configFile+'（请确认这些指纹与已发布应用一致后再提交）。');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(command==='run')await run();else if(command==='status')await status();else if(command==='bump')bump();else if(command==='fingerprints')await fingerprintsCommand();
    else say(readFileSync(fileURLToPath(import.meta.url),'utf8').split('\n').slice(0,11).map(line=>line.replace(/^\/\/ ?/,'')).join('\n'));
  }catch(error){console.error(redact(error.message));process.exitCode=1;}
}
