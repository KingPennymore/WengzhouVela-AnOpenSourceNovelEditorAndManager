import {validateWorkspace,MAX_TEXT_BYTES} from './model.mjs';
import {relativePath} from './project-contract.mjs';
import {documentPath} from './workspace.mjs';
const encoder=new TextEncoder(),fail=(message,code='E_INVALID_DATA')=>Object.assign(Error(message),{code});
const MAX_BACKUP_BYTES=32*1024*1024;

/** Read and fully validate an exported workspace backup (the JSON written by “导出全部文稿备份”). */
export function readWorkspaceBackup(bytes){
  if(!(bytes instanceof Uint8Array))throw fail('备份文件无效。');if(bytes.length>MAX_BACKUP_BYTES)throw fail('备份超过 32 MiB 恢复限额。','E_LIMIT');
  if(bytes[0]===0x50&&bytes[1]===0x4b)throw fail('这是压缩包，不是文舟导出的文稿备份（.json）。');
  let workspace;try{workspace=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('备份不是有效的 JSON 文件。');}
  validateWorkspace(workspace);const seen=new Set();
  for(const doc of [...workspace.documents,...(workspace.trash||[]).flatMap(item=>item.documents||[])]){
    if(!doc||typeof doc.id!=='string'||typeof doc.text!=='string'||typeof doc.name!=='string'||!Number.isFinite(doc.updatedAt)||encoder.encode(doc.text).length>MAX_TEXT_BYTES)throw fail('备份中的文稿无效。');
    relativePath(documentPath(doc));if(seen.has(doc.id))throw fail('备份中的文稿身份重复。');seen.add(doc.id);
  }
  const tools=workspace.writingTools;if(tools&&(!Array.isArray(tools.glossary||[])||!(tools.glossary||[]).every(value=>typeof value==='string')||!Array.isArray(tools.snippets||[])||!(tools.snippets||[]).every(value=>typeof value?.label==='string'&&typeof value.text==='string')))throw fail('备份中的词库或片段无效。');
  for(const values of Object.values(workspace.localHistory||{}))if(!Array.isArray(values)||values.some(value=>typeof value?.text!=='string'||!Number.isFinite(value.createdAt)))throw fail('备份中的文本历史无效。');
  for(const values of Object.values(workspace.annotations||{}))if(!Array.isArray(values)||values.some(value=>!value||typeof value!=='object'||value.quote!==undefined&&typeof value.quote!=='string'||value.context!==undefined&&typeof value.context!=='string'))throw fail('备份中的批注无效。');
  return workspace;
}

/** Plan a restore into a new folder: every document gets a new identity; history and annotations follow it. */
export function prepareBackupRestore(backup,folder){
  folder=relativePath(folder);const records=[],folders=new Set([folder]),used=new Set(),restored=new Map();
  const add=(source,path)=>{path=relativePath(path);const folded=path.toLocaleLowerCase();if(used.has(folded))throw fail('备份包含同名路径，恢复已取消。');used.add(folded);
    const doc={...source,id:crypto.randomUUID(),name:path.split('/').at(-1),path,remote:null,subscription:null};
    // A restored project is a copy, not the same project: give its .vela a new project ID.
    if(doc.name==='.vela')try{const config=JSON.parse(doc.text);if(config.version===2&&config.kind==='workspace'){config.id=crypto.randomUUID();doc.text=JSON.stringify(config,null,2)+'\n';}}catch{}
    records.push(doc);restored.set(source.id,doc);const parts=path.split('/');for(let at=1;at<parts.length;at++)folders.add(parts.slice(0,at).join('/'));};
  for(const doc of backup.documents.filter(doc=>!doc.binary&&!doc.pluginView))add(doc,folder+'/'+documentPath(doc));
  for(const item of backup.trash||[])for(const doc of (item.documents||[]).filter(doc=>!doc.binary&&!doc.pluginView))add(doc,folder+'/回收站文稿/'+encodeURIComponent(item.id)+'/'+documentPath(doc));
  const annotations={},localHistory={};for(const [sourceId,doc] of restored){if(backup.annotations?.[sourceId])annotations[doc.id]=structuredClone(backup.annotations[sourceId]);if(backup.localHistory?.[sourceId])localHistory[doc.id]=structuredClone(backup.localHistory[sourceId]);}
  for(const source of backup.folders||[])folders.add(relativePath(folder+'/'+source));
  if([...folders].some(path=>used.has(path.toLocaleLowerCase())))throw fail('备份的文件与文件夹路径冲突。');if(records.length+folders.size>5000)throw fail('恢复项目超过 5000 项。','E_LIMIT');
  const skipped=[...backup.documents,...(backup.trash||[]).flatMap(item=>item.documents||[])].filter(doc=>doc.binary||doc.pluginView).length;
  return {id:crypto.randomUUID(),folder,documents:records,folders:[...folders],annotations,localHistory,writingTools:backup.writingTools||{},skipped};
}

/** Apply a plan to a copy of the workspace; existing files and settings are never replaced. Idempotent per plan. */
export function mergeBackupRestore(workspace,plan){
  if(workspace.restoredImports?.some(item=>item.id===plan.id))return structuredClone(workspace);
  const candidate=structuredClone(workspace),occupied=[...candidate.documents.map(documentPath),...candidate.folders||[],...(candidate.entries||[]).map(entry=>entry.path)].map(path=>path.toLocaleLowerCase()),base=plan.folder;
  if(candidate.documents.some(doc=>base.toLocaleLowerCase().startsWith(documentPath(doc).toLocaleLowerCase()+'/')))throw fail('恢复文件夹的上级路径是一个文件。');
  let folder=base,n=1;while(occupied.some(path=>path===folder.toLocaleLowerCase()||path.startsWith(folder.toLocaleLowerCase()+'/')))folder=base+' ('+n++ +')';
  const remap=path=>folder+path.slice(base.length),live=new Set(candidate.documents.map(doc=>doc.id));
  for(const source of plan.documents){if(live.has(source.id))throw fail('恢复文稿身份已被其他文件使用。','E_CONFLICT');candidate.documents.push({...source,path:remap(source.path)});live.add(source.id);}
  candidate.folders=[...new Set([...candidate.folders||[],...plan.folders.map(remap)])];if(candidate.documents.length+candidate.folders.length>5000)throw fail('恢复后工作区超过 5000 项。','E_LIMIT');
  candidate.annotations={...candidate.annotations,...plan.annotations};candidate.localHistory={...candidate.localHistory,...plan.localHistory};
  const before=candidate.writingTools||{},incoming=plan.writingTools||{};candidate.writingTools={...before,glossary:[...new Set([...before.glossary||[],...incoming.glossary||[]].filter(value=>typeof value==='string'))],snippets:[...before.snippets||[]]};
  for(const snippet of incoming.snippets||[]){if(typeof snippet?.label!=='string'||typeof snippet.text!=='string')throw fail('备份中的写作片段无效。');if(!candidate.writingTools.snippets.some(value=>value.label===snippet.label&&value.text===snippet.text))candidate.writingTools.snippets.push(snippet);}
  candidate.treeRevision=(candidate.treeRevision||0)+1;candidate.restoredImports=[...candidate.restoredImports||[],{id:plan.id,folder}].slice(-256);return candidate;
}
