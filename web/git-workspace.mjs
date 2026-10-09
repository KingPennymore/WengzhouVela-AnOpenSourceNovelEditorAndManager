import {newDocument,repoPath,MAX_TEXT_BYTES} from './model.mjs';
import {documentPath,uniquePath} from './workspace.mjs';
import {textFingerprint} from './document-service.mjs';

export function resolveRepositoryConflict(workspace,{provider='github',repo,branch,path,sha,text}){
  const association=workspace.repositories?.find(item=>(item.provider||'github')===provider&&item.repo.toLowerCase()===repo.toLowerCase()&&item.branch===branch);
  if(!association)return;
  association.baseFiles={...association.baseFiles,[path]:{sha,hash:textFingerprint(text)}};
  association.conflicts=(association.conflicts||[]).filter(value=>value!==path);
  if(!association.conflicts.length&&association.pendingCommit){association.commit=association.pendingCommit;delete association.pendingCommit;}
}

export function applyRemoteFile(workspace,{repo,branch,path,text,sha,provider='github'},prefix=''){
  path=repoPath(path);
  let doc=workspace.documents.find(doc=>(doc.remote?.provider||'github')===provider&&doc.remote?.repo.toLowerCase()===repo.toLowerCase()&&doc.remote.path===path);
  const localPath=(prefix?prefix+'/':'')+path;
  if(!doc){
    const occupied=new Set([...workspace.documents.map(documentPath),...(workspace.entries||[]).map(entry=>entry.path)]);
    const target=uniquePath(localPath,occupied);doc={...newDocument(target.split('/').at(-1),text),path:target};workspace.documents.unshift(doc);
  }
  doc.text=text;doc.updatedAt=Date.now();doc.remote={...(provider==='gitee'?{provider}:{}),repo,branch,path,sha,lastSyncedText:text};
  return doc;
}
export function repositoryFolder(workspace,repo,provider='github'){
  const existing=workspace.repositories?.find(item=>(item.provider||'github')===provider&&item.repo.toLowerCase()===repo.toLowerCase());
  if(existing)return existing.folder;
  const folders=new Set([...(workspace.folders||[]),...workspace.documents.map(doc=>documentPath(doc).split('/')[0])]);
  const folder=uniquePath(repo.split('/')[1],folders);
  return folder;
}
export function applyRepository(workspace,result,folder){
  workspace.repositories=workspace.repositories||[];
  const old=workspace.repositories.find(item=>(item.provider||'github')===(result.provider||'github')&&item.repo.toLowerCase()===result.repo.toLowerCase());
  const baseFiles={...old?.baseFiles,...Object.fromEntries(result.files.map(file=>[file.path,{sha:file.sha,hash:textFingerprint(file.remoteText??file.text??file.data)}]))};if(old)Object.assign(old,{folder,branch:result.branch,commit:result.commit,baseFiles});else workspace.repositories.push({...(result.provider==='gitee'?{provider:'gitee'}:{}),repo:result.repo,folder,branch:result.branch,commit:result.commit,baseFiles});
  workspace.folders=[...new Set([...(workspace.folders||[]),folder,...result.folders.map(path=>folder+'/'+path)])];
  for(const file of result.files){
    if(file.text===null||new TextEncoder().encode(file.text).length>MAX_TEXT_BYTES)continue;
    const path=folder+'/'+file.path;
    const exact=workspace.documents.find(doc=>documentPath(doc)===path);
    const tracked=workspace.documents.find(doc=>(doc.remote?.provider||'github')===(result.provider||'github')&&doc.remote?.repo.toLowerCase()===result.repo.toLowerCase()&&doc.remote.path===file.path);
    let doc=tracked||exact;
    if(tracked&&exact&&tracked!==exact){workspace.documents=workspace.documents.filter(d=>d!==exact);workspace.openIds=workspace.openIds.filter(id=>id!==exact.id);}
    if(!doc){doc=newDocument(file.path.split('/').at(-1),file.text);workspace.documents.push(doc);}
    Object.assign(doc,{name:file.path.split('/').at(-1),path,text:file.text,updatedAt:Date.now(),remote:{...(result.provider==='gitee'?{provider:'gitee'}:{}),repo:result.repo,branch:result.branch,path:file.path,sha:file.sha,lastSyncedText:file.remoteText??file.text}});
  }
  return workspace;
}
