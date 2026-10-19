import {parseVela,velaText} from './vela.mjs';

// Cursor positions change on save/tab switches. They belong to this device and must not
// invalidate a sync preview or turn an otherwise safe configuration update into a conflict.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const missing=Symbol('missing');
const own=(value,key)=>Object.hasOwn(value,key)?value[key]:missing;
function same(a,b){
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));}
 return false;
}
function config(path,text){
 if(!/\.vela$/i.test(path)||typeof text!=='string')return null;
 try{const value=parseVela(text);return value.kind==='workspace'||value.kind==='global'?value:null;}catch{return null;}
}
const content=value=>{const {positions,...rest}=value;return rest;};
export function syncTextEqual(path,a,b){
 if(a===b)return true;
 const left=config(path,a),right=config(path,b);
 return !!left&&!!right&&same(content(left),content(right));
}
export function preserveVelaPositions(path,incoming,current){
 const next=config(path,incoming),local=config(path,current);
 if(!next||!local||next.kind!==local.kind||next.id!==local.id)return incoming;
 if(local.positions)next.positions=local.positions;else delete next.positions;
 return velaText(next);
}
function merge(base,local,remote,path=[]){
 if(same(local,remote))return local;if(same(base,local))return remote;if(same(base,remote))return local;
 if(path.length===3&&path[0]==='richText'&&path[1]==='documents')throw Error('文稿格式记录冲突');
 if(object(local)&&object(remote)&&(base===missing||object(base))){
  const result=[];
  for(const key of new Set([...Object.keys(base===missing?{}:base),...Object.keys(local),...Object.keys(remote)])){
   const value=merge(base===missing?missing:own(base,key),own(local,key),own(remote,key),path.concat(key));
   if(value!==missing)result.push([key,value]);
  }
  return Object.fromEntries(result);
 }
 // Arrays (including format records), delete/edit collisions and overlapping fields
 // require an explicit choice. Never combine positions from two versions of a manuscript.
 throw Error('配置字段冲突');
}
export function mergeVelaTexts(path,baseText,localText,remoteText){
 const base=config(path,baseText),local=config(path,localText),remote=config(path,remoteText);
 if(!base||!local||!remote||base.kind!==local.kind||base.kind!==remote.kind||base.id!==local.id||base.id!==remote.id)return null;
 try{const result=merge(content(base),content(local),content(remote));if(local.positions)result.positions=local.positions;return velaText(result);}catch{return null;}
}
