import {t,say} from './i18n.mjs';
import {planningDefaults,validatePlanning} from './planning-config.mjs';
import {validateStyles} from './rich-text-styles.mjs';
import {validateRecord} from './rich-text.mjs';
import {repoPath,documentKind} from './model.mjs';
import {chapterSettings,chapterMatcher} from './chapters.mjs';
export const editorDefaults=Object.freeze({mode:'novel',fontSize:18,lineHeight:1.8,wrap:true,indentSize:2,novelIndent:'fullwidth-2',maxWidth:1000,completion:true});
export const readerDefaults=Object.freeze({mode:'auto',appearancePolicy:'project',titlePage:true,layout:{fontSize:20,lineHeight:1.9,marginTop:24,marginBottom:24,marginLeft:32,marginRight:32}});
const object=(value,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw Error(say(`${t(label)} 必须是对象。`,`${t(label)} must be an object.`));
  return value;
};
const supported=path=>['TXT','MD','HTML','CSV','TEX','CODE','PDF'].includes(documentKind({name:path}));
const number=(obj,key,min,max)=>{
  if(Object.hasOwn(obj,key)&&(!Number.isFinite(obj[key])||obj[key]<min||obj[key]>max)) throw Error(say(`${key} 超出允许范围。`,`${key} is out of range.`));
};
const choice=(obj,key,values)=>{
  if(Object.hasOwn(obj,key)&&!values.includes(obj[key])) throw Error(say(`${key} 不支持此值。`,`${key} does not support this value.`));
};
export function itemId(path){
  let hash=2166136261;
  for(const char of path){
    hash^=char.codePointAt(0);
    hash=Math.imul(hash,16777619);
  }
  return 'file-'+(hash>>>0).toString(16);
}
export function validateItems(items){
  if(!Array.isArray(items)||items.length>5000) throw Error(t('阅读清单最多 5000 项。'));
  const paths=new Set(),ids=new Set();
  return items.map(item=>{
    object(item,t('阅读条目'));
    const path=repoPath(item.path);
    if(!supported(path)||paths.has(path)) throw Error(t('阅读清单有不支持或重复的路径。'));
    const id=item.id||itemId(path);
    if(typeof id!=='string'||id.length>160||ids.has(id)) throw Error(t('阅读条目 ID 重复或无效。'));
    if(item.title!==undefined&&(typeof item.title!=='string'||item.title.length>160)) throw Error(t('阅读标题无效。'));
    paths.add(path);
    ids.add(id);
    return {...item,id,path};
  });
}
export function parseV2(raw){
  object(raw,t('配置'));
  if(![2,3].includes(raw.version)||!['global','workspace'].includes(raw.kind)) throw Error(t('配置需要 version: 2 或 3，kind: global 或 workspace。'));
  if(raw.styles!==undefined){
    if(raw.version!==3) throw Error(t('styles 需要 version: 3。'));
    validateStyles(raw.styles);
  }
  if(raw.richText!==undefined) validateRichText(raw);
  const value=structuredClone(raw);
  if(value.kind==='workspace'){
    object(value.project,'project');
    if(typeof value.project.name!=='string'||!value.project.name.trim()||value.project.name.length>160) throw Error(t('工作区名称须为 1–160 字符。'));
    if(typeof value.id!=='string'||!value.id||value.id.length>160) throw Error(t('工作区需要稳定 ID。'));
    if(value.project.cover) repoPath(value.project.cover);
  }
  const editor=value.editor===undefined?{}:value.editor;
  object(editor,'editor');
  number(editor,'fontSize',10,40);
  number(editor,'lineHeight',1,3.5);
  number(editor,'indentSize',1,8);
  number(editor,'maxWidth',240,2400);
  choice(editor,'mode',['novel','code']);
  choice(editor,'novelIndent',['fullwidth-2','spaces']);
  for(const key of ['wrap','completion']) if(key in editor&&typeof editor[key]!=='boolean') throw Error(say(`${key} 必须为布尔值。`,`${key} must be a boolean.`));
  if(editor.glossaries!==undefined){
    if(!Array.isArray(editor.glossaries)||editor.glossaries.length>32||editor.glossaries.some(path=>typeof path!=='string'||!/\.(gly|glossary)$/i.test(path))) throw Error(t('editor.glossaries 须为术语库相对路径数组（最多 32 项）。'));
    editor.glossaries=editor.glossaries.map(repoPath);
    if(new Set(editor.glossaries).size!==editor.glossaries.length) throw Error(t('术语库路径不能重复。'));
  }
  const reader=value.reader===undefined?{}:value.reader,reading=value.reading===undefined?{}:value.reading;
  object(reader,'reader');
  object(reading,'reading');
  choice(reader,'mode',['auto','scroll','pages','double']);
  choice(reader,'appearancePolicy',['project','personal']);
  if('titlePage' in reader&&typeof reader.titlePage!=='boolean') throw Error(t('titlePage 必须为布尔值。'));
  for(const layout of [reader.layout,reading.layout]) if(layout){
    object(layout,'layout');
    number(layout,'fontSize',10,40);
    number(layout,'lineHeight',1,3.5);
    for(const key of ['marginTop','marginBottom','marginLeft','marginRight']) number(layout,key,0,240);
  }
  if(value.chapters){
    object(value.chapters,'chapters');
    if(value.chapters.templates!==undefined&&(!Array.isArray(value.chapters.templates)||value.chapters.templates.some(item=>typeof item!=='string'))) throw Error(t('chapters.templates 必须是字符串数组。'));
    const settings=chapterSettings({titleTemplates:value.chapters.templates||[]});
    chapterMatcher(settings);
    value.chapters.templates=settings.titleTemplates;
  }
  // Without reading.items a work reads every supported file in its folder; the list is written only when curated.
  if(value.kind==='workspace'){
    value.reading={...reading};
    if(reading.items!==undefined) value.reading.items=validateItems(reading.items);
  }
  if(value.library){
    object(value.library,'library');
    choice(value.library,'mode',['auto','manual']);
    if(value.library.items!==undefined) value.library.items=validateItems(value.library.items);
    if(value.library.showUnconfiguredFiles!==undefined&&typeof value.library.showUnconfiguredFiles!=='boolean') throw Error(t('showUnconfiguredFiles 必须为布尔值。'));
  }
  if(value.files){
    object(value.files,'files');
    if(Object.keys(value.files).length>5000) throw Error(t('单文件配置最多 5000 项。'));
    for(const [path,settings] of Object.entries(value.files)){
      repoPath(path);
      object(settings,'file settings');
      parseV2({version:2,kind:'global',editor:settings.editor,reader:settings.reader,reading:settings.reading,chapters:settings.chapters,formats:settings.formats});
    }
  }
  if(value.workspaceDefaults){
    object(value.workspaceDefaults,'workspaceDefaults');
    parseV2({version:2,kind:'global',editor:value.workspaceDefaults.editor,reader:value.workspaceDefaults.reader,reading:value.workspaceDefaults.reading,chapters:value.workspaceDefaults.chapters,formats:value.workspaceDefaults.formats});
  }
  validatePlanning(value.formats);
  const latex=value.formats?.latex;
  if(latex){
    object(latex,'latex');
    if(latex.main) repoPath(latex.main);
    choice(latex,'engine',['xetex','pdftex']);
  }
  if(value.publishing?.changelog) repoPath(value.publishing.changelog);
  return value;
}
export function createVelaV2(name,{global=false}={}){
  return parseV2(global
    ?{version:2,kind:'global',editor:{},reader:{appearancePolicy:'project'},library:{mode:'auto',showUnconfiguredFiles:true}}
    :{version:2,kind:'workspace',id:crypto.randomUUID(),project:{name},chapters:{templates:[]},editor:{},reading:{items:[]}});
}
/**
 * `richText` holds everything about TXT formatting: `enabled`, named `styles` and, per TXT (path relative to the
 * .vela folder), the format record in `documents`. Top-level `styles` from 0.9.7 are still read.
 */
function validateRichText(raw){
  if(raw.version!==3) throw Error(t('richText 需要 version: 3。'));
  const value=object(raw.richText,'richText');
  if(value.enabled!==undefined&&typeof value.enabled!=='boolean') throw Error(t('richText.enabled 必须为布尔值。'));
  if(value.styles!==undefined) validateStyles(value.styles);
  if(value.documents!==undefined){
    object(value.documents,'richText.documents');
    const keys=Object.keys(value.documents);
    if(keys.length>5000) throw Error(t('richText.documents 最多 5000 个文稿。'));
    for(const key of keys){
      if(repoPath(key)!==key||!/\.txt$/i.test(key)) throw Error(say(`richText.documents 的键须为 TXT 相对路径：${key}`,`richText.documents keys must be relative TXT paths: ${key}`));
      validateRecord(value.documents[key],key);
    }
  }
}
/** Named styles a configuration defines: richText.styles over 0.9.7 top-level styles. */
export const configStyles=config=>({...config?.styles,...config?.richText?.styles});
export function mergeConfig(base,override){
  const result={...base};
  for(const [key,value] of Object.entries(override||{})){
    const next=value&&typeof value==='object'&&!Array.isArray(value)?mergeConfig(base?.[key]||{},value):structuredClone(value);
    Object.defineProperty(result,key,{value:next,writable:true,enumerable:true,configurable:true});
  }
  return result;
}
export function effectiveVela(global,project,path=''){
  const inherited={formats:structuredClone(planningDefaults),editor:{...editorDefaults},reader:structuredClone(readerDefaults),chapters:{templates:[]}};
  // Format records are read through formatRecord(), not inherited; leaving them out keeps this cheap for large works.
  const normalize=value=>value
    ?JSON.parse(JSON.stringify({...value,files:undefined,positions:undefined,richText:value.richText&&{...value.richText,documents:undefined}}))
    :{};
  const g=normalize(global),p=normalize(project),file=project?.files?.[path]||{};
  let result=mergeConfig(mergeConfig(inherited,g),p);
  const recommended=mergeConfig(result.reader.layout,result.reading?.layout);
  result=mergeConfig(result,file);
  result.reading={...result.reading,layout:mergeConfig(mergeConfig(recommended,file.reader?.layout),file.reading?.layout)};
  if(g.reader?.appearancePolicy==='personal') result.reading.layout=mergeConfig(result.reading.layout,g.reader.layout);
  return {...result,version:2,kind:project?.kind||global?.kind||'workspace',project:project?.project||{name:'文稿'}}; // i18n-data: default name stored in .vela
}
export function effectiveFileVela(global,base,file){
  const result=mergeConfig(base,file);
  result.reading={...result.reading,items:base.reading.items,layout:mergeConfig(mergeConfig(base.reading.layout,file.reader?.layout),file.reading?.layout)};
  if(global?.reader?.appearancePolicy==='personal') result.reading.layout=mergeConfig(result.reading.layout,global.reader.layout);
  return result;
}
