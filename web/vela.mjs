import {documentKind} from './model.mjs';
import {chapterSettings} from './chapters.mjs';
import {documentPath} from './workspace.mjs';
import {parseV2,effectiveVela,effectiveFileVela,itemId} from './vela-v2.mjs';
export {createVelaV2,effectiveVela} from './vela-v2.mjs';

export const readable=doc=>['TXT','MD','HTML','CSV','TEX','CODE','PDF'].includes(documentKind(doc));
export const GLOBAL_VELA_PATH='.global.vela';
export const readingLayoutDefaults=Object.freeze({lineHeight:1.9,marginTop:24,marginBottom:24,marginLeft:35,marginRight:35});
export function readingLayout(value={}){
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('reading.layout 必须是对象。');
  const result={...value};
  for(const [key,fallback] of Object.entries(readingLayoutDefaults)){
    const number=Object.hasOwn(value,key)?value[key]:fallback,min=key==='lineHeight'?1:0,max=key==='lineHeight'?3.5:240;
    if(!Number.isFinite(number)||number<min||number>max)throw new Error(key==='lineHeight'?'行距须在 1–3.5 之间。':'阅读边距须在 0–240 px 之间。');
    result[key]=number;
  }
  return result;
}
export const readingItems=config=>(config?.kind==='global'?config.library?.items:config?.reading?.items)||[];
export function parseVela(text){
  if(typeof text!=='string'||text.length>262144)throw new Error('工作区配置不能超过 256 KB。');
  const raw=JSON.parse(text);
  if(raw?.version!==2)throw new Error('不支持此 .vela 配置版本，请使用 version: 2 并重新创建配置。');
  return parseV2(raw);
}
export const velaText=value=>JSON.stringify(parseVela(JSON.stringify(value)),null,2)+'\n';
export const configFolder=path=>path.split('/').slice(0,-1).join('/');
const configCache=new WeakMap(),effectiveCache=new WeakMap(),directoryCache=new WeakMap(),pathSets=new WeakMap();
function directory(workspace){let value=directoryCache.get(workspace);if(!value||value.documents!==workspace.documents||value.length!==workspace.documents.length||value.revision!==workspace.treeRevision){const all=workspace.documents.filter(doc=>doc.name==='.vela'||documentPath(doc)===GLOBAL_VELA_PATH);value={documents:workspace.documents,length:workspace.documents.length,revision:workspace.treeRevision,global:all.find(doc=>documentPath(doc)===GLOBAL_VELA_PATH),projects:all.filter(doc=>doc.name==='.vela'&&documentPath(doc)!==GLOBAL_VELA_PATH).map(doc=>({doc,folder:configFolder(documentPath(doc))})).sort((a,b)=>b.folder.length-a.folder.length||documentPath(a.doc).localeCompare(documentPath(b.doc)))};directoryCache.set(workspace,value);}return value;}
function paths(config){let value=pathSets.get(config);if(!value){value=new Map(readingItems(config).map((item,i)=>[item.path,i]));pathSets.set(config,value);}return value;}
function cachedConfig(workspace,doc){
  const cached=configCache.get(doc);if(cached?.text===doc.text)return cached;
  let result;try{const config=parseVela(doc.text);result={text:doc.text,config};{workspace.configLastGood={...workspace.configLastGood,[doc.id]:doc.text};const ids=Object.keys(workspace.configLastGood);for(const id of ids.slice(0,Math.max(0,ids.length-20)))delete workspace.configLastGood[id];}}
  catch(error){let previous=cached?.config;if(!previous&&workspace.configLastGood?.[doc.id])try{previous=parseVela(workspace.configLastGood[doc.id]);}catch{}result=previous?{text:doc.text,config:previous,warning:error}:{text:doc.text,error};}configCache.set(doc,result);return result;
}
export function globalConfig(workspace){
  const doc=directory(workspace).global;
  if(!doc)return null;
  return {doc,folder:'',global:true,...cachedConfig(workspace,doc)};
}
function parsedProject(workspace,item,doc){
  const parsed=cachedConfig(workspace,item.doc);if(parsed.error)return {...item,error:parsed.error};const rawConfig=parsed.config,global=globalConfig(workspace),path=documentPath(doc).slice(item.folder?item.folder.length+1:0);let config=rawConfig;
  {let cached=effectiveCache.get(rawConfig);if(!cached||cached.global!==global?.config){cached={global:global?.config,config:effectiveVela(global?.config,rawConfig),files:new Map()};effectiveCache.set(rawConfig,cached);}if(rawConfig.files?.[path]){if(!cached.files.has(path)){cached.files.set(path,effectiveFileVela(global?.config,cached.config,rawConfig.files[path]));if(cached.files.size>32)cached.files.delete(cached.files.keys().next().value);}config=cached.files.get(path);}else config=cached.config;}
  return {...item,rawConfig,config,warning:parsed.warning};
}
export function projectConfig(workspace,doc){
  if(!doc)return null;const path=documentPath(doc);
  const global=globalConfig(workspace);
  const candidates=directory(workspace).projects.filter(item=>!item.folder||path.startsWith(item.folder+'/'));
  if(!candidates.length){if(!global?.config)return global;let cached=effectiveCache.get(global.config);if(!cached||cached.global!==global.config){cached={global:global.config,config:effectiveVela(global.config,null)};effectiveCache.set(global.config,cached);}return {...global,rawConfig:global.config,config:cached.config};}const item=candidates[0];
  return parsedProject(workspace,item,doc);
}
export function readingDocuments(workspace){const global=globalConfig(workspace);const manual=global?.config?.library?.mode==='manual';const binaries=(workspace.entries||[]).filter(entry=>!entry.directory&&/\.pdf$/i.test(entry.path)&&!workspace.documents.some(doc=>documentPath(doc)===entry.path)).map(entry=>{workspace.binaryIds||={};const id=workspace.binaryIds[entry.path]||=crypto.randomUUID();return {id,name:entry.name||entry.path.split('/').at(-1),path:entry.path,kind:'PDF',text:'',updatedAt:entry.modifiedAt||0,binary:true};});return [...workspace.documents,...binaries].filter(doc=>{
  if(!readable(doc))return false;const project=projectConfig(workspace,doc);
  if(manual)return paths(global.config).has(documentPath(doc));
  if(!project)return true;if(project.error)return false;
  if(project.global)return project.config.library?.showUnconfiguredFiles!==false;
  const relative=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  return paths(project.config).has(relative);
}).sort((a,b)=>{const pa=projectConfig(workspace,a),pb=projectConfig(workspace,b),rank=(doc,project)=>{const path=manual?documentPath(doc):documentPath(doc).slice(project?.folder?project.folder.length+1:0);return paths(manual?global.config:project?.config||{}).get(path)??-1;};if(manual||pa?.doc===pb?.doc)return rank(a,pa)-rank(b,pb);return 0;});}
export function projectWriter(workspace,doc){const project=projectConfig(workspace,doc);return chapterSettings({...workspace.settings.writer,titleTemplates:project?.config?.chapters?.templates||[]});}
export function includeNewReadingFile(workspace,doc){
  if(!readable(doc))return;const project=projectConfig(workspace,doc);if(!project?.config)return;
  const path=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  const config=project.rawConfig||project.config;if(config.kind==='global'&&config.library?.mode!=='manual')return;
  if(!readingItems(config).some(item=>item.path===path)){const container=config.kind==='global'?config.library:config.reading;container.items=[...readingItems(config),{id:itemId(path),path}];project.doc.text=velaText(config);project.doc.updatedAt=Date.now();}
}
export function rewriteVelaFiles(before,after,action,path,destination=''){
  const affected=value=>value===path||value.startsWith(path+'/');
  const binaryIds={...after.binaryIds};for(const [file,id] of Object.entries(before.binaryIds||{}))if(affected(file)){
    if(action==='move'){delete binaryIds[file];binaryIds[destination+file.slice(path.length)]=id;}
    if(action==='copy')binaryIds[destination+file.slice(path.length)]=crypto.randomUUID();
  }after.binaryIds=binaryIds;
  for(const doc of after.documents.filter(doc=>documentKind(doc)==='VELA')){
    const original=before.documents.find(item=>item.id===doc.id)||(action==='copy'&&withinDestination(documentPath(doc),destination)?before.documents.find(item=>documentPath(item)===path+documentPath(doc).slice(destination.length)):null);if(!original)continue;
    try{
      const config=parseVela(doc.text),oldFolder=configFolder(documentPath(original)),newFolder=configFolder(documentPath(doc)),copied=action==='copy'&&doc.id!==original.id;
      if(copied&&config.kind==='workspace')config.id=crypto.randomUUID();
      const rewrite=relative=>{let full=(oldFolder?oldFolder+'/':'')+relative;if(affected(full)&&(action==='move'||copied))full=destination+full.slice(path.length);if(newFolder&&!full.startsWith(newFolder+'/'))return null;return full.slice(newFolder?newFolder.length+1:0);};
      {
        const container=config.kind==='global'?config.library:config.reading;
        if(container?.items)container.items=container.items.flatMap(item=>{const next=rewrite(item.path);return next===null?[]:[{...item,path:next}];});
        if(config.files)config.files=Object.fromEntries(Object.entries(config.files).flatMap(([key,value])=>{const next=rewrite(key);return next===null?[]:[[next,value]];}));
        for(const editor of [config.editor,config.workspaceDefaults?.editor,...Object.values(config.files||{}).map(value=>value.editor)])if(editor?.glossaries)editor.glossaries=editor.glossaries.map(rewrite).filter(path=>path!==null);
        for(const [object,key] of [[config.project,'cover'],[config.formats?.latex,'main'],[config.publishing,'changelog']])if(object?.[key]){const next=rewrite(object[key]);if(next===null)delete object[key];else object[key]=next;}
      }
      const text=velaText(config);if(text!==doc.text){doc.text=text;doc.updatedAt=Date.now();}
    }catch{/* Invalid manifests remain intact for source repair. */}
  }
  const previouslyReadable=new Set(readingDocuments(before).map(doc=>doc.id));
  if(action==='copy'||action==='move')for(const doc of after.documents.filter(doc=>(documentPath(doc)===destination||documentPath(doc).startsWith(destination+'/'))&&(action==='copy'?previouslyReadable.has(before.documents.find(original=>documentPath(original)===path+documentPath(doc).slice(destination.length))?.id):previouslyReadable.has(doc.id))))includeNewReadingFile(after,doc);
}
const withinDestination=(path,folder)=>path===folder||path.startsWith(folder+'/');
export function velaVisiblePaths(tree,configs){
  return tree.filter(item=>item.type==='blob'&&readable({name:item.path})).filter(item=>{
    const candidates=configs.filter(config=>!config.folder||item.path.startsWith(config.folder+'/')).sort((a,b)=>b.folder.length-a.folder.length);
    const project=candidates[0];return !!project&&readingItems(project.config).some(entry=>entry.path===item.path.slice(project.folder?project.folder.length+1:0));
  }).map(item=>item.path).sort();
}
