import {repoPath,documentKind} from './model.mjs';
import {documentPath} from './workspace.mjs';
import {projectConfig,globalConfig} from './vela.mjs';
import {t,say} from './i18n.mjs';
import {glossaryCandidates} from './completion-core.mjs';
import {MB} from './text-utils.mjs';

export function parseGlossary(text){
  if(typeof text!=='string'||text.length>MB)throw Error(t('术语库最多 1 MB。'));
  let value;
  try{value=JSON.parse(text);}catch{throw Error(t('术语库不是有效的 JSON 文件。'));}
  if(!value||value.version!==1||!Array.isArray(value.entries)||value.entries.length>5000)
    throw Error(t('术语库需要 version: 1 和 entries 数组（最多 5000 项）。'));
  const terms=new Set(),
    ids=new Set();
  const entries=value.entries.map(entry=>{
    if(
      !entry||
      typeof entry.term!=='string'||
      !entry.term.trim()||
      entry.term.trim().length>120||
      /[\r\n\x00-\x1f]/.test(entry.term)
    )
      throw Error(t('词条须为 1–120 字符且不能换行。'));
    const term=entry.term.trim(),
      key=term.toLocaleLowerCase();
    if(terms.has(key))throw Error(say(`术语库包含重复词条：${term}`,`Duplicate glossary term: ${term}`));
    terms.add(key);
    const id=entry.id||crypto.randomUUID();
    if(typeof id!=='string'||!id||id.length>160||ids.has(id))throw Error(t('词条 ID 重复或无效。'));
    ids.add(id);
    if(entry.definition!==undefined&&(typeof entry.definition!=='string'||entry.definition.length>4000))
      throw Error(t('释义最多 4000 字符。'));
    if(entry.category!==undefined&&(typeof entry.category!=='string'||entry.category.length>120))
      throw Error(t('分类最多 120 字符。'));
    const aliases=entry.aliases||[];
    if(
      !Array.isArray(aliases)||
      aliases.length>32||
      aliases.some(alias=>typeof alias!=='string'||!alias.trim()||alias.length>120||/[\r\n\x00-\x1f]/.test(alias))
    )
      throw Error(t('别名须为词语数组（最多 32 项）。'));
    return {...entry,id,term,aliases:[...new Set(aliases.map(alias=>alias.trim()))]};
  });
  if(value.name!==undefined&&(typeof value.name!=='string'||value.name.length>160))throw Error(t('术语库名称最多 160 字符。'));
  return {...value,entries};
}
export const glossaryText=value=>JSON.stringify(parseGlossary(JSON.stringify(value)),null,2)+'\n';
export const createGlossary=(name='术语库')=>({version:1,name,entries:[]});
export function glossaryPaths(workspace,doc){
  const project=projectConfig(workspace,doc),
    relative=doc&&documentPath(doc).slice(project?.folder?project.folder.length+1:0),
    file=project?.rawConfig?.files?.[relative];
  const local=file?.editor?.glossaries??(!project?.global?project?.rawConfig?.editor?.glossaries:undefined),
    global=globalConfig(workspace)?.config?.editor?.glossaries;
  const paths=local??global??[],
    folder=local!==undefined?project?.folder||'':'';
  return paths.map(path=>(folder?folder+'/':'')+repoPath(path));
}
const cache=new WeakMap(),
  workspaceCache=new WeakMap();
export function glossaryTerms(workspace,doc){
  const paths=glossaryPaths(workspace,doc);
  let lookup=workspaceCache.get(workspace);
  if(
    !lookup||
    lookup.documents!==workspace.documents||
    lookup.length!==workspace.documents.length||
    lookup.revision!==workspace.treeRevision
  ){
    lookup={
      documents:workspace.documents,
      length:workspace.documents.length,
      revision:workspace.treeRevision,
      libraries:new Map(workspace.documents.map(source=>[documentPath(source),source])),
      results:new Map()
    };
    workspaceCache.set(workspace,lookup);
  }
  const key=JSON.stringify(paths),
    sources=paths.map(path=>lookup.libraries.get(path)).map(source=>(source&&documentKind(source)==='GLY'?source:undefined)),
    texts=sources.map(source=>source?.text),
    cached=lookup.results.get(key);
  if(cached&&texts.every((text,index)=>cached.texts[index]===text))return cached.result;
  const result=[],
    seen=new Map(),
    documents=lookup.libraries;
  for(const path of paths){
    const source=documents.get(path);
    if(!source||documentKind(source)!=='GLY')continue;
    let parsed=cache.get(source);
    if(parsed?.text!==source.text){
      try {
        parsed={text:source.text,value:parseGlossary(source.text)};
      } catch {
        parsed={text:source.text,value:null};
      }
      cache.set(source,parsed);
    }
    for(const entry of parsed.value?.entries||[]){
      const key=entry.term.toLocaleLowerCase(),
        previous=seen.get(key);
      if(previous){
        previous.sources.push(path);
        previous.aliases=[...new Set([...previous.aliases,...entry.aliases])];
        previous.definitions.push({source:path,text:entry.definition||''});
      } else {
        const next={
          ...entry,
          aliases:[...entry.aliases],
          source:path,
          sources:[path],
          definitions:[{source:path,text:entry.definition||''}]
        };
        seen.set(key,next);
        result.push(next);
      }
    }
  }
  lookup.results.set(key,{texts,result});
  if(lookup.results.size>16)lookup.results.delete(lookup.results.keys().next().value);
  return result;
}

export function glossaryCompletion(context,entries){
  const offset=Math.max(0,context.pos-120),
    text=context.state.doc.sliceString(offset,context.pos);
  const values=glossaryCandidates({text,position:text.length,explicit:context.explicit},entries,t);
  return values.length
    ?{
        from:offset+values[0].from,
        options:values.map(value=>({
          label:value.label,
          apply:value.insertText,
          type:'text',
          velaKind:value.kind,
          boost:value.score,
          detail:value.detail,
          info:value.info
        })),
        validFor:/^[\p{L}\p{N}_ \u3000'-]*$/u
      }
    :null;
}
