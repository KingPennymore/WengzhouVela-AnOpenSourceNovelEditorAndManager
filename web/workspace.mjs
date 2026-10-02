import {repoPath} from './model.mjs';

export function documentPath(doc){return doc.path||doc.name;}
export function uniquePath(path,paths){
  if(!paths.has(path))return path;
  const slash=path.lastIndexOf('/'),dot=path.lastIndexOf('.'),stem=dot>slash?path.slice(0,dot):path,ext=dot>slash?path.slice(dot):'';
  for(let i=2;;i++){const candidate=stem+' ('+i+')'+ext;if(!paths.has(candidate))return candidate;}
}
export function preparePaths(workspace){
  workspace.treeRevision=(workspace.treeRevision||0)+1;
  const paths=new Set();workspace.folders=workspace.folders||[];
  for(const doc of workspace.documents){doc.path=uniquePath(repoPath(documentPath(doc)),paths);doc.name=doc.path.split('/').at(-1);paths.add(doc.path);}
  return workspace;
}
export function adoptFolder(workspace,result,{migrate=false}={}){
  const old=workspace.documents,active=workspace.activeId,documents=result.documents.map(doc=>({...doc}));
  if(migrate){
    const paths=new Set([...(result.entries||[]).map(entry=>entry.path),...documents.map(documentPath)]);
    for(const original of old){
      const same=documents.find(doc=>documentPath(doc)===documentPath(original)&&doc.text===original.text);
      if(same){if(original.id===active)workspace.activeId=same.id;continue;}
      const path=uniquePath(documentPath(original),paths);paths.add(path);documents.push({...original,path,name:path.split('/').at(-1)});
    }
  }
  workspace.documents=documents;workspace.storage=result.storage;workspace.folders=[...new Set(result.folders||[])];workspace.entries=result.entries||[];
  workspace.repositories=result.repositories||[];
  workspace.openIds=(workspace.openIds||[]).filter(id=>documents.some(doc=>doc.id===id));
  if(!documents.some(doc=>doc.id===workspace.activeId))workspace.activeId=null;
  return workspace;
}

export function folderTree(workspace,docs,escape,selected='',sort='name'){
  const folders=new Set(workspace.folders||[]);
  for(const folder of [...folders]){const parts=folder.split('/');for(let i=1;i<parts.length;i++)folders.add(parts.slice(0,i).join('/'));}
  for(const doc of docs){const parts=documentPath(doc).split('/');for(let i=1;i<parts.length;i++)folders.add(parts.slice(0,i).join('/'));}
  const others=(workspace.entries||[]).filter(entry=>!entry.directory&&entry.editable!==true&&!docs.some(doc=>documentPath(doc)===entry.path)&&!workspace.documents.some(doc=>documentPath(doc)===entry.path));
  const render=prefix=>{
    const parent=path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
    const branches=[...folders].filter(path=>parent(path)===prefix).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
    const files=docs.filter(doc=>parent(documentPath(doc))===prefix).sort((a,b)=>sort==='modified'?b.updatedAt-a.updatedAt:sort==='size'?b.text.length-a.text.length:a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
    return branches.map(path=>`<details class="workspace-folder" open><summary data-folder="${escape(path)}" class="${path===selected?'selected-folder':''}"><span>▸ ${escape(path.split('/').at(-1))}</span><button type="button" class="doc-menu" data-path-menu="${escape(path)}" data-directory="true" title="文件夹操作" aria-label="${escape(path)} 文件夹操作">···</button></summary>${render(path)}</details>`).join('')+files.map(doc=>`<div class="doc-item ${doc.id===workspace.activeId?'active':''}"><button class="doc-open" data-doc="${escape(doc.id)}"><span class="doc-info"><strong>${escape(doc.name)}</strong><small>${escape(documentPath(doc))}${doc.remote?' · Git':''}</small></span></button><button class="doc-menu" data-menu="${escape(doc.id)}" title="文件操作" aria-label="${escape(doc.name)} 文件操作">···</button></div>`).join('')+others.filter(entry=>parent(entry.path)===prefix).map(entry=>`<div class="doc-item workspace-other" title="${escape(entry.reason||'保留在工作区中')}"><span class="doc-info"><strong>${escape(entry.name)}</strong><small>${escape(entry.reason||'文件')}</small></span><button class="doc-menu" data-path-menu="${escape(entry.path)}" title="文件操作" aria-label="${escape(entry.name)} 文件操作">···</button></div>`).join('');
  };
  return render('');
}
