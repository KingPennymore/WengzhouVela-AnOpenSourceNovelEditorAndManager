import {repoPath} from './model.mjs';
import {documentPath,uniquePath} from './workspace.mjs';

export const within=(parent,path)=>path===parent||path.startsWith(parent+'/');
export const basename=path=>path.split('/').at(-1);
export const parentPath=path=>path.split('/').slice(0,-1).join('/');
export function itemPaths(workspace){return new Set([...workspace.documents.map(documentPath),...(workspace.folders||[]),...(workspace.entries||[]).map(item=>item.path)]);}
export function copyDestination(workspace,path,folder=parentPath(path)){
  const candidate=(folder?folder+'/':'')+basename(path);
  return uniquePath(candidate,itemPaths(workspace));
}
export function applyFileOperation(workspace,action,path,destination='') {
  repoPath(path);
  const paths=itemPaths(workspace);
  if(!paths.has(path)&&![...paths].some(item=>within(path,item)))throw new Error('项目不存在。');
  const selected=workspace.documents.filter(doc=>within(path,documentPath(doc)));
  const folders=(workspace.folders||[]).filter(folder=>within(path,folder));
  const entries=(workspace.entries||[]).filter(entry=>within(path,entry.path));
  if(action==='delete'){
    workspace.trash=workspace.trash||[];
    if(workspace.trash.length>=100)throw new Error('回收站已满，请先恢复或删除部分项目。');
    const repositories=(workspace.repositories||[]).filter(item=>within(path,item.folder));
    workspace.trash.push({id:crypto.randomUUID(),path,createdAt:Date.now(),directory:folders.includes(path)||selected.some(doc=>documentPath(doc)!==path),documents:selected,folders,entries,repositories});
    workspace.repositories=(workspace.repositories||[]).filter(item=>!within(path,item.folder));
    workspace.documents=workspace.documents.filter(doc=>!within(path,documentPath(doc)));
    workspace.folders=(workspace.folders||[]).filter(folder=>!within(path,folder));
    workspace.entries=(workspace.entries||[]).filter(entry=>!within(path,entry.path));
  }else{
    repoPath(destination);
    if(within(path,destination))throw new Error('不能将项目放入自身或其子目录。');
    if([...paths].some(item=>within(destination,item)))throw new Error('目标已存在。');
    if([...paths].some(item=>within(item,destination)&&item!==destination&&workspace.documents.some(doc=>documentPath(doc)===item)))throw new Error('目标父路径不是文件夹。');
    if(!['copy','move'].includes(action))throw new Error('文件操作无效。');
    const replace=p=>destination+p.slice(path.length);
    const documents=selected.map(doc=>({...doc,id:action==='copy'?crypto.randomUUID():doc.id,path:replace(documentPath(doc)),name:basename(replace(documentPath(doc))),remote:action==='copy'?null:doc.remote}));
    if(action==='move'){
      workspace.documents=workspace.documents.filter(doc=>!within(path,documentPath(doc)));
      workspace.folders=(workspace.folders||[]).filter(folder=>!within(path,folder));
      workspace.entries=(workspace.entries||[]).filter(entry=>!within(path,entry.path));
      for(const item of workspace.repositories||[])if(within(path,item.folder))item.folder=replace(item.folder);
    }
    workspace.documents.push(...documents);workspace.folders=[...new Set([...(workspace.folders||[]),...folders.map(replace)])];
    workspace.entries=[...(workspace.entries||[]),...entries.map(entry=>({...entry,path:replace(entry.path),name:basename(replace(entry.path))}))];
    const parts=parentPath(destination).split('/').filter(Boolean);for(let i=1;i<=parts.length;i++)workspace.folders.push(parts.slice(0,i).join('/'));
    workspace.folders=[...new Set(workspace.folders)];
  }
  workspace.openIds=workspace.openIds.filter(id=>workspace.documents.some(doc=>doc.id===id));
  if(!workspace.documents.some(doc=>doc.id===workspace.activeId))workspace.activeId=null;
}
export function restoreFile(workspace,id,permanent=false){
  const item=(workspace.trash||[]).find(item=>item.id===id);if(!item)throw new Error('回收站项目不存在。');
  if(!permanent){
    if([...itemPaths(workspace)].some(path=>within(item.path,path)))throw new Error('原路径已有同名项目。');
    workspace.documents.push(...item.documents);workspace.folders=[...new Set([...(workspace.folders||[]),...item.folders])];workspace.entries=[...(workspace.entries||[]),...item.entries];workspace.repositories=[...(workspace.repositories||[]),...(item.repositories||[])];
  }
  workspace.trash=workspace.trash.filter(value=>value.id!==id);
}
