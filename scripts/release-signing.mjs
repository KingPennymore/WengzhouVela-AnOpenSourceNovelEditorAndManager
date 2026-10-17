// Release manifest signing (docs/RELEASE-SIGNING.md): ECDSA P-256 / SHA-256 over the exact bytes of
// SHA256SUMS-<tag>.txt and catalog.json, written next to them as <file>.sig. The private key stays on the publisher's
// machine (default ~/.vela-release-signing/release-ecdsa-p256.pem, or VELA_RELEASE_SIGNING_KEY); this script reads it
// only to sign and never prints, copies or logs it. The app embeds the public keys in web/release-keys.mjs.
//   node scripts/release-signing.mjs keygen [--out <path>]   create a key pair, print only the public key entry
//   node scripts/release-signing.mjs public [--key <path>]   print the key id and public key of the private key
//   node scripts/release-signing.mjs sign <file>... [--key <path>]
//   node scripts/release-signing.mjs verify <file>...
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_KEYS} from '../web/release-keys.mjs';
import {verifySignature,SIGNATURE_ALGORITHM} from '../web/release-signing.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const defaultKeyPath=()=>process.env.VELA_RELEASE_SIGNING_KEY||path.join(os.homedir(),'.vela-release-signing','release-ecdsa-p256.pem');
const option=(args,name)=>{const at=args.indexOf(name);return at>=0?args[at+1]:undefined;};
export const keyId=spki=>'vela-'+createHash('sha256').update(spki).digest('hex').slice(0,16);
function insideRepository(file){const relative=path.relative(root,path.resolve(file));return !relative.startsWith('..')&&!path.isAbsolute(relative);}
function loadPrivate(file){
  if(!existsSync(file))throw Error(`找不到发布签名私钥：${file}。用 keygen 生成，或设置 VELA_RELEASE_SIGNING_KEY。`);
  if(insideRepository(file))throw Error('发布签名私钥不能放在仓库目录中。');
  return createPrivateKey(readFileSync(file));
}
export function publicEntry(privateKey){const spki=createPublicKey(privateKey).export({type:'spki',format:'der'});return {id:keyId(spki),spki:spki.toString('base64')};}
/** Signs each file with the key at keyPath and checks the result against the keys the app embeds. */
export async function signFiles(files,{keyPath=defaultKeyPath()}={}){
  const privateKey=loadPrivate(keyPath),entry=publicEntry(privateKey);
  if(!RELEASE_KEYS.some(key=>key.id===entry.id&&key.spki===entry.spki))throw Error(`私钥 ${entry.id} 不在 web/release-keys.mjs 中，应用无法验证它签的文件。`);
  for(const file of files){
    const data=readFileSync(file),signature=sign('sha256',data,{key:privateKey,dsaEncoding:'ieee-p1363'});
    const text=JSON.stringify({format:1,algorithm:SIGNATURE_ALGORITHM,key:entry.id,signature:signature.toString('base64')})+'\n';
    if(!(await verifySignature(data,text)).valid)throw Error('签名自检失败：'+file);
    writeFileSync(file+'.sig',text);
  }
  return entry.id;
}
export async function verifyFiles(files){
  const results=[];for(const file of files){const sig=file+'.sig';const result=existsSync(sig)?await verifySignature(readFileSync(file),readFileSync(sig,'utf8')):{valid:false,reason:'缺少 .sig'};results.push({file,...result});}
  return results;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,...args]=process.argv.slice(2),files=args.filter((arg,i)=>!arg.startsWith('--')&&!args[i-1]?.startsWith('--'));
  try{
    if(command==='keygen'){
      const out=option(args,'--out')||defaultKeyPath();
      if(existsSync(out))throw Error('目标已存在，不会覆盖：'+out);
      if(insideRepository(out))throw Error('发布签名私钥不能放在仓库目录中。');
      const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
      mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
      const entry=publicEntry(privateKey);
      console.log(`私钥已写入 ${out}（不会显示内容，请自行备份到安全位置）。\n把下面这一项加入 web/release-keys.mjs 的 RELEASE_KEYS：\n${JSON.stringify(entry)}`);
    }else if(command==='public'){console.log(JSON.stringify(publicEntry(loadPrivate(option(args,'--key')||defaultKeyPath()))));}
    else if(command==='sign'){if(!files.length)throw Error('请指定要签名的文件。');const id=await signFiles(files,{keyPath:option(args,'--key')||defaultKeyPath()});for(const file of files)console.log(`已签名 ${file}.sig（${id}）`);}
    else if(command==='verify'){const results=await verifyFiles(files);for(const item of results)console.log(`${item.valid?'PASS':'FAIL'} ${item.file}${item.valid?' · '+item.key:' · '+item.reason}`);if(results.some(item=>!item.valid))process.exitCode=1;}
    else{console.error('用法：keygen | public | sign <文件> | verify <文件>');process.exitCode=2;}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
