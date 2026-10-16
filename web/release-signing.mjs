// Release manifests are signed (docs/RELEASE-SIGNING.md): SHA256SUMS-<tag>.txt and catalog.json each have a
// <file>.sig holding an ECDSA P-256 / SHA-256 signature of the file's exact bytes by a key in web/release-keys.mjs.
// ECDSA is verified with WebCrypto, available since Chromium 37, so on Android WebView 105+, ArkWeb and Electron
// alike; WebCrypto Ed25519 only arrived in Chromium 137 (Android WebView 133 still refuses it).
// The hashes in a manifest are trusted only after its signature checks out; mirrors only carry the files.
import {RELEASE_KEYS} from './release-keys.mjs';
import {compareVersions} from './version-compare.mjs';

export const SIGNATURE_ALGORITHM='ECDSA-P256-SHA256';
/** Releases published before signing existed. They have no .sig files and are accepted unsigned only from GitHub. */
export const LAST_UNSIGNED_RELEASE='0.9.8.1',LAST_UNSIGNED_TEX='0.1.1';
/* Test builds (tests/source-app-server.mjs) add a throwaway key through this define; release builds leave it empty. */
/* global __VELA_TEST_RELEASE_KEYS__ */
const testKeys=typeof __VELA_TEST_RELEASE_KEYS__!=='undefined'?__VELA_TEST_RELEASE_KEYS__:[];
export const releaseKeys=()=>[...RELEASE_KEYS,...testKeys];

const base64=text=>{const binary=atob(text);return Uint8Array.from(binary,char=>char.charCodeAt(0));};
const imported=new Map();
async function publicKey(entry){
  if(!imported.has(entry.spki))imported.set(entry.spki,crypto.subtle.importKey('spki',base64(entry.spki),{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
  return imported.get(entry.spki);
}
/** Parses a .sig file; null when it is not one. */
export function parseSignature(text){
  let value;try{value=JSON.parse(String(text));}catch{return null;}
  if(value?.format!==1||value.algorithm!==SIGNATURE_ALGORITHM||typeof value.key!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(value.key)||typeof value.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(value.signature))return null;
  return value;
}
/** {valid, key, reason}: whether `signatureText` is a signature of `bytes` by one of the embedded keys. */
export async function verifySignature(bytes,signatureText,{keys=releaseKeys()}={}){
  const signature=parseSignature(signatureText);if(!signature)return {valid:false,reason:'签名文件格式无效'};
  const entry=keys.find(key=>key.id===signature.key);if(!entry)return {valid:false,reason:'签名使用了未知的密钥 '+signature.key};
  try{const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await publicKey(entry),base64(signature.signature),bytes instanceof Uint8Array?bytes:new TextEncoder().encode(String(bytes)));return ok?{valid:true,key:entry.id}:{valid:false,reason:'签名与内容不符'};}
  catch(error){return {valid:false,reason:'无法验证签名：'+error.message};}
}
/** Whether a release tag predates signing (see LAST_UNSIGNED_RELEASE). */
export function unsignedRelease(tag){
  const app=/^v?(\d+\.\d+\.\d+(?:\.\d+)?)$/.exec(tag||''),tex=/^tex-(\d+\.\d+\.\d+)$/.exec(tag||'');
  return app?compareVersions(app[1],LAST_UNSIGNED_RELEASE)<=0:tex?compareVersions(tex[1],LAST_UNSIGNED_TEX)<=0:false;
}
