import {repoPath} from './model.mjs';
export const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(label+' 必须是对象。');return v;};
export const string=(v,label)=>{if(typeof v!=='string')throw Error(label+' 必须是字符串。');return v;};
export const finite=(v,label)=>{if(!Number.isFinite(v))throw Error(label+' 必须是有限数字。');return v;};
export const optional=(v,key,check)=>{if(v[key]!==undefined)check(v[key],key);};
export function readFormat(text,max){if(typeof text!=='string'||new TextEncoder().encode(text).length>max)throw Error('文件超过格式大小限制，原文已保留。');const v=object(JSON.parse(text),'文件');if(v.version!==1)throw Error('不支持此文件版本，原文已保留。');optional(v,'name',string);return v;}
export function ordered(v,keys=[]){if(Array.isArray(v))return v.map(item=>ordered(item));if(!v||typeof v!=='object')return v;return Object.fromEntries([...keys.filter(key=>Object.hasOwn(v,key)),...Object.keys(v).filter(key=>!keys.includes(key)).sort()].map(key=>[key,ordered(v[key])]));}
export const reference=v=>repoPath(string(v,'路径'));
export const writeFormat=(v,keys)=>JSON.stringify(ordered(v,keys),null,2)+'\n';
