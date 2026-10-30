import {t} from './i18n.mjs';
import {remapCsvRecord} from './csv-embed.mjs';
import {rewritePlanningFiles} from './planning-paths.mjs';
import {documentKind,newDocument} from './model.mjs';
import {chapterSettings} from './chapters.mjs';
import {documentPath} from './workspace.mjs';
import {parseV2,effectiveVela,effectiveFileVela,itemId} from './vela-v2.mjs';
import {parseDocumentVela,sidecarText,readSidecar,resolveSidecar,resolveRecord,sidecarPath,MAX_SIDECAR_CHARS,MAX_VELA_CHARS} from './rich-text.mjs';
import {createVelaV2} from './vela-v2.mjs';
export {createVelaV2,effectiveVela,configStyles} from './vela-v2.mjs';
export const readable=doc=>['TXT','MD','HTML','CSV','TEX','CODE','PDF','VODT','PLUGIN'].includes(documentKind(doc));
export const GLOBAL_VELA_PATH='.global.vela';
export const readingLayoutDefaults=Object.freeze({lineHeight:1.9,marginTop:24,marginBottom:24,marginLeft:35,marginRight:35});
export function readingLayout(value={}){
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error(t('reading.layout 必须是对象。'));
  const result={...value};
  for(const [key,fallback] of Object.entries(readingLayoutDefaults)){
    const number=Object.hasOwn(value,key)?value[key]:fallback,min=key==='lineHeight'?1:0,max=key==='lineHeight'?3.5:240;
    if(!Number.isFinite(number)||number<min||number>max)throw new Error(key==='lineHeight'?t('行距须在 1–3.5 之间。'):t('阅读边距须在 0–240 px 之间。'));
    result[key]=number;
  }
  return result;
}

/** A work without reading.items reads every supported file in its folder. */
export const allFiles=config=>config?.kind==='workspace'&&config.reading?.items===undefined;
export const readingItems=config=>(config?.kind==='global'?config.library?.items:config?.reading?.items)||[];
export function parseVela(text){
  if(typeof text!=='string'||text.length>MAX_VELA_CHARS)throw new Error(t('.vela 文件不能超过 8 MiB。'));
  const raw=JSON.parse(text.replace(/^\uFEFF/,''));

  // 0.9.7 format sidecars (kind: document) are read until their formats move into the work's .vela.
  if(raw?.kind==='document'){
    if(text.length>MAX_SIDECAR_CHARS)throw new Error(t('格式旁注不能超过 4 MiB。'));
    return parseDocumentVela(raw);
  }
  if(raw?.version!==2&&raw?.version!==3)throw new Error(t('不支持此 .vela 配置版本，请使用 version: 2 或 3 并重新创建配置。'));

  // Format records may be large; the configuration itself stays within 256 KB.
  if(text.length>262144&&JSON.stringify({...raw,richText:raw.richText&&{...raw.richText,documents:undefined}}).length>262144)throw new Error(t('工作区配置不能超过 256 KB（不含格式记录）。'));
  return parseV2(raw);
}

// Lists of entries are written one entry per line, so files stay short and Git merges land on single entries.
const COMPACT=new Set(['items','marks','blocks','inserts','review']);
function pretty(value,indent,key){
  if(Array.isArray(value)){
    if(!value.length)return '[]';
    const inner=indent+'  ',compact=COMPACT.has(key)&&value.every(item=>item&&typeof item==='object');
    return '[\n'+value.map(item=>inner+(compact?JSON.stringify(item):pretty(item,inner,''))).join(',\n')+'\n'+indent+']';
  }
  if(value&&typeof value==='object'){
    const keys=Object.keys(value).filter(name=>value[name]!==undefined);
    if(!keys.length)return '{}';
    if(key==='text'&&keys.every(name=>typeof value[name]!=='object'))return JSON.stringify(value);
    const inner=indent+'  ';
    return '{\n'+keys.map(name=>inner+JSON.stringify(name)+': '+pretty(value[name],inner,name)).join(',\n')+'\n'+indent+'}';
  }
  return JSON.stringify(value)??'null';
}
export const velaText=value=>value?.kind==='document'?sidecarText(parseDocumentVela(value)):pretty(parseVela(JSON.stringify(value)),'','')+'\n';
export const configFolder=path=>path.split('/').slice(0,-1).join('/');
const configCache=new WeakMap(),effectiveCache=new WeakMap(),directoryCache=new WeakMap(),pathSets=new WeakMap();
function directory(workspace){
  let value=directoryCache.get(workspace);
  if(!value||value.documents!==workspace.documents||value.length!==workspace.documents.length||value.revision!==workspace.treeRevision){
    const all=workspace.documents.filter(doc=>doc.name==='.vela'||documentPath(doc)===GLOBAL_VELA_PATH);
    value={documents:workspace.documents,length:workspace.documents.length,revision:workspace.treeRevision,global:all.find(doc=>documentPath(doc)===GLOBAL_VELA_PATH),projects:all.filter(doc=>doc.name==='.vela'&&documentPath(doc)!==GLOBAL_VELA_PATH).map(doc=>({doc,folder:configFolder(documentPath(doc))})).sort((a,b)=>b.folder.length-a.folder.length||documentPath(a.doc).localeCompare(documentPath(b.doc)))};
    directoryCache.set(workspace,value);
  }
  return value;
}
function paths(config){
  let value=pathSets.get(config);
  if(!value){
    value=new Map(readingItems(config).map((item,i)=>[item.path,i]));
    pathSets.set(config,value);
  }
  return value;
}
function cachedConfig(workspace,doc){
  const cached=configCache.get(doc);
  if(cached?.text===doc.text)return cached;
  let result;
  try{
    const config=parseVela(doc.text);
    result={text:doc.text,config};

    {
      workspace.configLastGood={...workspace.configLastGood,[doc.id]:doc.text};
      const ids=Object.keys(workspace.configLastGood);
      for(const id of ids.slice(0,Math.max(0,ids.length-20)))delete workspace.configLastGood[id];
    }
  }
  catch(error){
    let previous=cached?.config;
    if(!previous&&workspace.configLastGood?.[doc.id])try{
      previous=parseVela(workspace.configLastGood[doc.id]);
    }catch{}
    result=previous?{text:doc.text,config:previous,warning:error}:{text:doc.text,error};
  }
  configCache.set(doc,result);
  return result;
}
export function globalConfig(workspace){
  const doc=directory(workspace).global;
  if(!doc)return null;
  return {doc,folder:'',global:true,...cachedConfig(workspace,doc)};
}
function parsedProject(workspace,item,doc){
  const parsed=cachedConfig(workspace,item.doc);
  if(parsed.error)return {...item,error:parsed.error};
  const rawConfig=parsed.config,global=globalConfig(workspace),path=documentPath(doc).slice(item.folder?item.folder.length+1:0);
  let config=rawConfig;

  {
    let cached=effectiveCache.get(rawConfig);
    if(!cached||cached.global!==global?.config){
      cached={global:global?.config,config:effectiveVela(global?.config,rawConfig),files:new Map()};
      effectiveCache.set(rawConfig,cached);
    }
    if(rawConfig.files?.[path]){
      if(!cached.files.has(path)){
        cached.files.set(path,effectiveFileVela(global?.config,cached.config,rawConfig.files[path]));
        if(cached.files.size>32)cached.files.delete(cached.files.keys().next().value);
      }
      config=cached.files.get(path);
    }else config=cached.config;
  }
  return {...item,rawConfig,config,warning:parsed.warning};
}
export function projectConfig(workspace,doc){
  if(!doc)return null;
  const path=documentPath(doc);
  const global=globalConfig(workspace);
  const candidates=directory(workspace).projects.filter(item=>!item.folder||path.startsWith(item.folder+'/'));
  if(!candidates.length){
    if(!global?.config)return global;
    let cached=effectiveCache.get(global.config);
    if(!cached||cached.global!==global.config){
      cached={global:global.config,config:effectiveVela(global.config,null)};
      effectiveCache.set(global.config,cached);
    }
    return {...global,rawConfig:global.config,config:cached.config};
  }
  const item=candidates[0];
  return parsedProject(workspace,item,doc);
}
export function readingDocuments(workspace){
  const global=globalConfig(workspace);
  const manual=global?.config?.library?.mode==='manual';
  const binaries=(workspace.entries||[]).filter(entry=>!entry.directory&&/\.pdf$/i.test(entry.path)&&!workspace.documents.some(doc=>documentPath(doc)===entry.path)).map(entry=>{
    workspace.binaryIds||={};
    const id=workspace.binaryIds[entry.path]||=crypto.randomUUID();
    return {id,name:entry.name||entry.path.split('/').at(-1),path:entry.path,kind:'PDF',text:'',updatedAt:entry.modifiedAt||0,binary:true};
  });
  return [...workspace.documents,...binaries].filter(doc=>{
    if(!readable(doc))return false;
    const project=projectConfig(workspace,doc);
    if(manual)return paths(global.config).has(documentPath(doc));
    if(!project)return true;
    if(project.error)return false;
    if(project.global)return project.config.library?.showUnconfiguredFiles!==false;
    const relative=documentPath(doc).slice(project.folder?project.folder.length+1:0);
    return allFiles(project.config)||paths(project.config).has(relative);
  }).sort((a,b)=>{
    const pa=projectConfig(workspace,a),
      pb=projectConfig(workspace,b),
      rank=(doc,project)=>{
      const path=manual?documentPath(doc):documentPath(doc).slice(project?.folder?project.folder.length+1:0);
      return paths(manual?global.config:project?.config||{}).get(path)??-1;
    };
    if(manual||pa?.doc===pb?.doc)return rank(a,pa)-rank(b,pb);
    return 0;
  });
}
/** UI defaults remain local; only explicit project preferences override them. */
export function setVelaPreference(workspace,doc,section,key,value){
 if(!doc||documentKind(doc)==='VELA')return false;
 const project=projectConfig(workspace,doc);if(!project?.doc)return false;
 if(project.warning||project.error)throw Error(t('配置无效，请切换源码修复。'));
 const config=structuredClone(project.rawConfig||project.config),relative=documentPath(doc).slice(project.folder?project.folder.length+1:0);
 const layer=config.files?.[relative]?.[section]?config.files[relative]:config;
 layer[section]={...layer[section],[key]:value};
 project.doc.text=velaText(config);project.doc.updatedAt=Date.now();return true;
}
export function editorPreferences(workspace,doc){
 const value=projectConfig(workspace,doc)?.config?.editor||{},local=workspace.settings;
 return {...value,lineNumbers:value.lineNumbers??!!local.novelLineNumbers,
  autoNouns:value.autoNouns??local.autoNouns,highlightTerms:value.highlightTerms??local.highlightTerms,
  glossaryPanel:value.glossaryPanel??local.glossaryPanel,
  snippets:[...new Map([...(workspace.writingTools?.snippets||[]),...(value.snippets||[])].map(item=>[item.label,item])).values()]};
}
export function projectWriter(workspace,doc){
  const project=projectConfig(workspace,doc);
  return chapterSettings({...workspace.settings.writer,...project?.config?.chapters,titleTemplates:project?.config?.chapters?.templates||[]});
}
export function includeNewReadingFile(workspace,doc){
  if(!readable(doc))return;
  const project=projectConfig(workspace,doc);
  if(!project?.config)return;
  const path=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  const config=project.rawConfig||project.config;
  if(config.kind==='global'&&config.library?.mode!=='manual'||allFiles(config))return;
  if(!readingItems(config).some(item=>item.path===path)){
    const container=config.kind==='global'?config.library:config.reading;
    container.items=[...readingItems(config),{id:itemId(path),path}];
    project.doc.text=velaText(config);
    project.doc.updatedAt=Date.now();
  }
}
export function rewriteVelaFiles(before,after,action,path,destination=''){
  rewritePlanningFiles(before,after,action,path,destination);
  const affected=value=>value===path||value.startsWith(path+'/');
  const binaryIds={...after.binaryIds};
  for(const [file,id] of Object.entries(before.binaryIds||{}))if(affected(file)){
    if(action==='move'){
      delete binaryIds[file];
      binaryIds[destination+file.slice(path.length)]=id;
    }
    if(action==='copy')binaryIds[destination+file.slice(path.length)]=crypto.randomUUID();
  }
  after.binaryIds=binaryIds;

  // TXT formats that leave their work's folder (or are copied) are added to the .vela covering the new place.
  const arriving=[];
  for(const doc of after.documents.filter(doc=>documentKind(doc)==='VELA')){
    const original=before.documents.find(item=>item.id===doc.id)||(action==='copy'&&withinDestination(documentPath(doc),destination)
      ?before.documents.find(item=>documentPath(item)===path+documentPath(doc).slice(destination.length))
      :null);
    if(!original)continue;
    try{
      const config=parseVela(doc.text),oldFolder=configFolder(documentPath(original)),newFolder=configFolder(documentPath(doc)),copied=action==='copy'&&doc.id!==original.id;
      if(copied&&config.kind==='workspace')config.id=crypto.randomUUID();
      if(config.kind==='document'){
        const target=documentPath(doc).split('/').at(-1).replace(/\.vela$/i,'');
        if(config.target!==target){
          config.target=target;
          doc.text=velaText(config);
          doc.updatedAt=Date.now();
        }
        continue;
      }
      const rewrite=relative=>{
        let full=(oldFolder?oldFolder+'/':'')+relative;
        if(affected(full)&&(action==='move'||copied))full=destination+full.slice(path.length);
        if(newFolder&&!full.startsWith(newFolder+'/'))return null;
        return full.slice(newFolder?newFolder.length+1:0);
      };

      {
        const container=config.kind==='global'?config.library:config.reading;
        if(container?.items)container.items=container.items.flatMap(item=>{
          const next=rewrite(item.path);
          return next===null?[]:[{...item,path:next}];
        });
        if(config.files)config.files=Object.fromEntries(Object.entries(config.files).flatMap(([key,value])=>{
          const next=rewrite(key);
          return next===null?[]:[[next,value]];
        }));

        // Editing positions follow moved files; a copy starts at the top and deleted files drop theirs.
        if(config.positions&&!copied){
          const next={};
          for(const [key,value] of Object.entries(config.positions)){
            if(action==='delete'&&affected((oldFolder?oldFolder+'/':'')+key))continue;
            const moved=action==='copy'?key:rewrite(key);
            if(moved!==null)next[moved]=value;
          }
          config.positions=next;
          if(!Object.keys(next).length)delete config.positions;
        }
        for(const editor of [config.editor,config.workspaceDefaults?.editor,...Object.values(config.files||{}).map(value=>value.editor)])if(editor?.glossaries)editor.glossaries=editor.glossaries.map(rewrite).filter(path=>path!==null);
        for(const layer of [config,config.workspaceDefaults,...Object.values(config.files||{})])if(layer?.ai?.targets)for(const [kind,target] of Object.entries(layer.ai.targets)){
          const next=rewrite(target);if(next===null)delete layer.ai.targets[kind];else layer.ai.targets[kind]=next;
        }
        for(const [object,key] of [[config.project,'cover'],[config.formats?.latex,'main'],[config.publishing,'changelog']])if(object?.[key]){
          const next=rewrite(object[key]);
          if(next===null)delete object[key];

          else object[key]=next;
        }
        const records=config.richText?.documents;
        if(records&&action!=='delete'){
          const next={};
          for(const [key,record] of Object.entries(records)){
            const full=(oldFolder?oldFolder+'/':'')+key,target=affected(full)?destination+full.slice(path.length):null;
            const mapTarget=value=>affected(value)?destination+value.slice(path.length):value;
            if(action==='copy'&&!copied){
              next[key]=record;
              if(target)arriving.push({path:target,record:remapCsvRecord(structuredClone(record),full,target,mapTarget)});
              continue;
            }
            const moved=rewrite(key);
            if(moved!==null)next[moved]=remapCsvRecord(record,full,(newFolder?newFolder+'/':'')+moved,mapTarget);

            else if(target)arriving.push({path:target,record:remapCsvRecord(record,full,target,mapTarget)});
          }
          config.richText.documents=next;
          if(!Object.keys(next).length)delete config.richText.documents;
        }
      }
      const text=velaText(config);
      if(text!==doc.text){
        doc.text=text;
        doc.updatedAt=Date.now();
      }
    }catch{/* Invalid manifests remain intact for source repair. */}
  }
  for(const {path:file,record} of arriving)addFormatRecord(after,file,record);
  const previouslyReadable=new Set(readingDocuments(before).map(doc=>doc.id));
  if(action==='copy'||action==='move')for(const doc of after.documents.filter(doc=>(documentPath(doc)===destination||documentPath(doc).startsWith(destination+'/'))&&(action==='copy'
    ?previouslyReadable.has(before.documents.find(original=>documentPath(original)===path+documentPath(doc).slice(destination.length))?.id)
    :previouslyReadable.has(doc.id))))includeNewReadingFile(after,doc);
}
const withinDestination=(path,folder)=>path===folder||path.startsWith(folder+'/');
export function velaVisiblePaths(tree,configs){
  return tree.filter(item=>item.type==='blob'&&readable({name:item.path})).filter(item=>{
    const candidates=configs.filter(config=>!config.folder||item.path.startsWith(config.folder+'/')).sort((a,b)=>b.folder.length-a.folder.length);
    const project=candidates[0];
    return !!project&&(allFiles(project.config)||readingItems(project.config).some(entry=>entry.path===item.path.slice(project.folder?project.folder.length+1:0)));
  }).map(item=>item.path).sort();
}

/**
 * Where the formats of a TXT live: the nearest work .vela covering it and the TXT's path relative to that folder.
 * null without one (a .vela is created on the first format) or while that .vela has errors.
 */
export function formatHome(workspace,doc){
  const project=doc&&projectConfig(workspace,doc);
  if(!project||project.global||project.error||project.warning||!project.rawConfig||project.rawConfig.kind!=='workspace')return null;
  const key=documentPath(doc).slice(project.folder?project.folder.length+1:0);
  return {doc:project.doc,folder:project.folder,key,config:project.rawConfig,record:project.rawConfig.richText?.documents?.[key]||null};
}

/** The 0.9.7 sidecar beside a TXT (正文.txt.vela), if any. */
export const legacySidecar=(workspace,doc)=>doc&&workspace.documents.find(item=>documentPath(item)===sidecarPath(documentPath(doc)))||null;
const formatCache=new WeakMap();

/** Placed entries of a TXT for read-only use (reader, exports); [] without formats or with invalid ones. */
export function documentFormats(workspace,doc){
  const home=formatHome(workspace,doc),legacy=home?.record?null:legacySidecar(workspace,doc),source=home?.record||legacy?.text;
  if(!source)return [];
  const cached=formatCache.get(doc);
  if(cached&&cached.source===source&&cached.text===doc.text)return cached.entries;
  let entries=[];
  try{
    entries=home?.record?resolveRecord(doc.text,home.record).entries:resolveSidecar(doc.text,readSidecar(legacy.text)).entries;
  }catch{/* Reported when the TXT is opened for editing. */}
  formatCache.set(doc,{source,text:doc.text,entries});
  return entries;
}

// ---- Last editing position (positions, since 0.9.8.1) ----
// The work .vela covering a document keeps where it was last edited: positions["卷一/正文.txt"] =
// {at:[line, column], head:"first 12 characters of that line"} (1-based line, 0-based column). Documents outside a
// work use the global .vela with their full path. Written when leaving a document, saving or quitting, never per
// keystroke. `head` finds the line again after the text was changed outside Vela.
export const MAX_POSITIONS=500;
const POSITION_HEAD=12;

/** The .vela document and key holding the position of `doc`, or null when that .vela cannot be written. */
export function positionHome(workspace,doc){
  if(!doc||['VELA','GLY'].includes(documentKind(doc)))return null;
  const project=projectConfig(workspace,doc);
  if(project?.error||project?.warning)return null;
  if(project&&!project.global&&project.rawConfig?.kind==='workspace')return {doc:project.doc,key:documentPath(doc).slice(project.folder?project.folder.length+1:0)};
  const global=workspace.documents.find(item=>documentPath(item)===GLOBAL_VELA_PATH);
  return global?{doc:global,key:documentPath(doc)}:{doc:null,key:documentPath(doc)};
}
const validPosition=value=>value&&Array.isArray(value.at)&&value.at.length===2&&value.at.every(n=>Number.isInteger(n)&&n>=0)&&value.at[0]>=1&&(value.head===undefined||typeof value.head==='string');
export function readPosition(workspace,doc){
  const home=positionHome(workspace,doc);
  if(!home?.doc)return null;
  try{
    const value=JSON.parse(home.doc.text).positions?.[home.key];
    return validPosition(value)?value:null;
  }catch{
    return null;
  }
}

/** The position entry for offset `pos` in `text`. */
export function positionEntry(text,pos){
  const before=text.slice(0,pos),line=before.split('\n').length,start=before.lastIndexOf('\n')+1,end=text.indexOf('\n',start);
  return {at:[line,pos-start],head:text.slice(start,end<0?text.length:end).slice(0,POSITION_HEAD)};
}

/** The offset in `text` of a stored position: its line when the line still starts with `head`, else the nearest line that does, else the same line number. */
export function positionOffset(text,value){
  if(!validPosition(value))return 0;
  const lines=text.split('\n'),starts=[];
  let at=0;
  for(const line of lines){
    starts.push(at);
    at+=line.length+1;
  }
  let index=Math.min(value.at[0],lines.length)-1;
  if(value.head&&!lines[index].startsWith(value.head)){
    let found=-1;
    for(let d=1;d<lines.length&&found<0;d++)for(const i of [index-d,index+d])if(i>=0&&i<lines.length&&lines[i].startsWith(value.head)){
      found=i;
      break;
    }
    if(found>=0)index=found;
  }
  return starts[index]+Math.min(value.at[1],lines[index].length);
}

/**
 * The new text of the .vela holding `doc`'s position after storing `entry` (from positionEntry): {doc, text}, or
 * null when the position is unchanged or there is nowhere to write. `createGlobal` makes the global .vela when the
 * document is outside any work. The caller writes the text (documents.change) so saving and sync see it.
 */
export function positionUpdate(workspace,doc,entry,createGlobal){

  // At the top of a document there is nothing to resume: an entry is dropped instead of stored.
  const home=positionHome(workspace,doc),top=entry.at[0]===1&&entry.at[1]===0;
  if(!home||!home.doc&&(top||!createGlobal))return null;
  const target=home.doc||createGlobal();
  if(!target)return null;
  let config;
  try{
    config=parseVela(target.text);
  }catch{
    return null;
  }
  const current=config.positions?.[home.key];
  if(top?!current:current&&current.at[0]===entry.at[0]&&current.at[1]===entry.at[1]&&current.head===entry.head)return null;
  const positions={...config.positions};
  delete positions[home.key];
  if(!top)positions[home.key]=entry;
  const keys=Object.keys(positions);
  for(const key of keys.slice(0,Math.max(0,keys.length-MAX_POSITIONS)))delete positions[key];
  config.positions=positions;
  if(!keys.length)delete config.positions;
  return {doc:target,text:velaText(config)};
}

/** Stores the format record of the TXT at `path` in the nearest work .vela, creating one in its folder if needed. */
export function addFormatRecord(workspace,path,record){
  const homes=workspace.documents.filter(doc=>doc.name==='.vela'&&documentPath(doc)!==GLOBAL_VELA_PATH).map(doc=>({doc,folder:configFolder(documentPath(doc))})).filter(item=>!item.folder||path.startsWith(item.folder+'/')).sort((a,b)=>b.folder.length-a.folder.length);
  let home=homes[0],config;
  if(home){
    try{
      config=parseVela(home.doc.text);
    }catch{
      return false;
    }
    if(config.kind!=='workspace')return false;
  }
  else{
    const folder=configFolder(path);
    config=createVelaV2(folder?folder.split('/').at(-1):'内部文件夹'); // i18n-data: The default workspace name becomes configuration data.
    delete config.reading.items;
    delete config.chapters;
    delete config.editor;
    const doc=newDocument('.vela','');
    doc.path=(folder?folder+'/':'')+'.vela';
    workspace.documents.push(doc);
    home={doc,folder};
  }

  const key=path.slice(home.folder?home.folder.length+1:0);
  config.version=3;
  config.richText={...config.richText,documents:{...config.richText?.documents,[key]:record}};
  home.doc.text=velaText(config);
  home.doc.updatedAt=Date.now();
  return true;
}
