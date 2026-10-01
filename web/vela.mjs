import {repoPath,documentKind} from './model.mjs';
import {chapterSettings,chapterMatcher} from './chapters.mjs';
import {documentPath} from './workspace.mjs';

export const readable=doc=>['TXT','MD','HTML','CSV'].includes(documentKind(doc));
export function parseVela(text){
  if(typeof text!=='string'||text.length>262144)throw new Error('工作区配置不能超过 256 KB。');
  const raw=JSON.parse(text);
  if(!raw||Array.isArray(raw)||typeof raw!=='object'||raw.version!==1)throw new Error('不支持此 .vela 配置版本，请使用 version: 1。');
  if(typeof raw.name!=='string'||raw.name.length>160)throw new Error('请填写工作区名称（最多 160 字符）。');
  const size=raw.fontSize??16;
  if(!Number.isFinite(size)||size<10||size>40)throw new Error('字号须在 10–40 之间。');
  if(!Array.isArray(raw.reading?.files)||raw.reading.files.length>5000)throw new Error('reading.files 必须是文件路径数组（最多 5000 项）。');
  const files=[...new Set(raw.reading.files.map(path=>{if(typeof path!=='string')throw new Error('阅读文件路径必须为字符串。');const safe=repoPath(path);if(!readable({name:safe}))throw new Error('阅读清单只支持 TXT、Markdown、HTML 和 CSV。');return safe;} ))];
  if(raw.titleTemplates!==undefined&&(!Array.isArray(raw.titleTemplates)||raw.titleTemplates.some(item=>typeof item!=='string')))throw new Error('titleTemplates 必须是字符串数组。');
  const settings=chapterSettings({titleTemplates:raw.titleTemplates??[]});chapterMatcher(settings);
  return {...raw,version:1,name:raw.name,fontSize:size,titleTemplates:settings.titleTemplates,reading:{...raw.reading,files}};
}
export function createVela(name){return {version:1,name,fontSize:16,titleTemplates:[],reading:{files:[]}};}
export const velaText=value=>JSON.stringify(parseVela(JSON.stringify(value)),null,2)+'\n';
export const configFolder=path=>path.split('/').slice(0,-1).join('/');
export function projectConfig(workspace,doc){
  if(!doc)return null;const path=documentPath(doc);
  const candidates=workspace.documents.filter(item=>documentKind(item)==='VELA').map(item=>({doc:item,folder:configFolder(documentPath(item))})).filter(item=>!item.folder||path.startsWith(item.folder+'/')).sort((a,b)=>b.folder.length-a.folder.length||documentPath(a.doc).localeCompare(documentPath(b.doc)));
  if(!candidates.length)return null;const item=candidates[0];
  try{return {...item,config:parseVela(item.doc.text)};}catch(error){return {...item,error};}
}
export function readingDocuments(workspace){return workspace.documents.filter(doc=>{
  if(!readable(doc))return false;const project=projectConfig(workspace,doc);
  if(!project)return true;if(project.error)return false;
  const relative=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  return project.config.reading.files.includes(relative);
});}
export function projectWriter(workspace,doc){const project=projectConfig(workspace,doc);return chapterSettings({...workspace.settings.writer,titleTemplates:project?.config?.titleTemplates||[]});}
export function includeNewReadingFile(workspace,doc){
  if(!readable(doc))return;const project=projectConfig(workspace,doc);if(!project?.config)return;
  const path=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  if(!project.config.reading.files.includes(path)){project.config.reading.files.push(path);project.doc.text=velaText(project.config);project.doc.updatedAt=Date.now();}
}
export function rewriteVelaFiles(before,after,action,path,destination=''){
  const affected=value=>value===path||value.startsWith(path+'/');
  for(const doc of after.documents.filter(doc=>documentKind(doc)==='VELA')){
    const original=before.documents.find(item=>item.id===doc.id);if(!original)continue;
    try{const config=parseVela(doc.text),oldFolder=configFolder(documentPath(original)),newFolder=configFolder(documentPath(doc));
      const files=config.reading.files.flatMap(relative=>{let full=(oldFolder?oldFolder+'/':'')+relative;if(affected(full)){if(action==='delete')return [];if(action==='move')full=destination+full.slice(path.length);}
        if(newFolder&&!full.startsWith(newFolder+'/'))return [];return [full.slice(newFolder?newFolder.length+1:0)];});
      if(JSON.stringify(files)!==JSON.stringify(config.reading.files)){config.reading.files=files;doc.text=velaText(config);doc.updatedAt=Date.now();}
    }catch{/* Invalid manifests remain intact for source repair. */}
  }
  const previouslyReadable=new Set(readingDocuments(before).map(doc=>doc.id));
  if(action==='copy'||action==='move')for(const doc of after.documents.filter(doc=>(documentPath(doc)===destination||documentPath(doc).startsWith(destination+'/'))&&(action==='copy'?previouslyReadable.has(before.documents.find(original=>documentPath(original)===path+documentPath(doc).slice(destination.length))?.id):previouslyReadable.has(doc.id))))includeNewReadingFile(after,doc);
}
export function velaVisiblePaths(tree,configs){
  return tree.filter(item=>item.type==='blob'&&readable({name:item.path})).filter(item=>{
    const candidates=configs.filter(config=>!config.folder||item.path.startsWith(config.folder+'/')).sort((a,b)=>b.folder.length-a.folder.length);
    const project=candidates[0];return !!project&&project.config.reading.files.includes(item.path.slice(project.folder?project.folder.length+1:0));
  }).map(item=>item.path).sort();
}
