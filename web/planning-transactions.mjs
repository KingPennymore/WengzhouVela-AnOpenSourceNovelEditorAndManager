import {parseMap,mapText} from './map.mjs';
import {parseOutline,outlineText} from './outline.mjs';
const bad=message=>Object.assign(Error(message),{code:'E_INVALID_DATA'});
/** Bounded object patches: no array offsets, nested paths, or mutation of a live view. */
export function applyPlanningChanges(kind,text,changes){
 if(!['MAP','OUTLINE'].includes(kind)||!Array.isArray(changes)||!changes.length||changes.length>1000)throw bad('结构化更改无效。');
 const value=(kind==='MAP'?parseMap:parseOutline)(text),blocked=new Set(['__proto__','prototype','constructor','id']);
 for(const change of changes){
  if(!change||typeof change.id!=='string'||!change.id||blocked.has(change.id)||!['add','update','remove'].includes(change.op))throw bad('更改需要对象 ID 和操作。');
  const collection=change.collection,allowed=kind==='MAP'?['markers','cells','symbols','arrows','labels']:['nodes','relations.nodes'];if(!allowed.includes(collection))throw bad('不支持此对象集合。');
  if(!change.patch&&change.op!=='remove'||change.patch&&(typeof change.patch!=='object'||Array.isArray(change.patch)||Object.keys(change.patch).some(key=>blocked.has(key))))throw bad('对象属性无效。');
  if(collection==='labels'){if(change.op!=='update'||change.id!=='map')throw bad('名称设置使用 update 和 map 标识。');value.labels={...value.labels};for(const [key,v] of Object.entries(change.patch)){if(v===null)delete value.labels[key];else value.labels[key]=structuredClone(v);}continue;}
  const list=collection==='relations.nodes'?value.relations?.nodes:value[collection];if(!list)throw bad('对象集合不存在。');const array=Array.isArray(list),index=array?list.findIndex(item=>item.id===change.id):change.id;
  if(change.op!=='add'&&(array?index<0:!Object.hasOwn(list,index)))throw Object.assign(Error('对象不存在。'),{code:'E_NOT_FOUND'});
  if(change.op==='remove'){if(kind==='OUTLINE')throw bad('大纲节点删除需同时处理关系，请使用完整文稿事务。');if(array)list.splice(index,1);else delete list[index];continue;}
  if(!change.patch||typeof change.patch!=='object'||Array.isArray(change.patch)||Object.keys(change.patch).some(key=>blocked.has(key)))throw bad('对象属性无效。');
  if(change.op==='add'){if(array?index>=0:Object.hasOwn(list,index))throw Object.assign(Error('对象 ID 已存在。'),{code:'E_EXISTS'});const item=structuredClone(change.patch);if(array)list.push({id:change.id,...item});else list[index]=item;continue;}
  for(const [key,v] of Object.entries(change.patch)){if(v===null)delete list[index][key];else list[index][key]=structuredClone(v);}
 }
 return (kind==='MAP'?mapText:outlineText)(value);
}
