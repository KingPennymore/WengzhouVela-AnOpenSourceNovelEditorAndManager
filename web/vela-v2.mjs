import {repoPath,documentKind} from './model.mjs';
import {chapterSettings,chapterMatcher} from './chapters.mjs';
export const editorDefaults=Object.freeze({mode:'novel',fontSize:18,lineHeight:1.8,wrap:true,indentSize:2,novelIndent:'fullwidth-2',maxWidth:1000,completion:true});
export const readerDefaults=Object.freeze({mode:'auto',appearancePolicy:'project',motion:'system',titlePage:true,layout:{fontSize:20,lineHeight:1.9,marginTop:24,marginBottom:24,marginLeft:32,marginRight:32}});
const object=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' 必须是对象。');return value;};
const supported=path=>['TXT','MD','HTML','CSV','TEX','CODE','PDF'].includes(documentKind({name:path}));
const number=(obj,key,min,max)=>{if(Object.hasOwn(obj,key)&&(!Number.isFinite(obj[key])||obj[key]<min||obj[key]>max))throw Error(key+' 超出允许范围。');};
const choice=(obj,key,values)=>{if(Object.hasOwn(obj,key)&&!values.includes(obj[key]))throw Error(key+' 不支持此值。');};
export function itemId(path){let hash=2166136261;for(const char of path){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}return 'file-'+(hash>>>0).toString(16);}
export function validateItems(items){if(!Array.isArray(items)||items.length>5000)throw Error('阅读清单最多 5000 项。');const paths=new Set(),ids=new Set();return items.map(item=>{object(item,'阅读条目');const path=repoPath(item.path);if(!supported(path)||paths.has(path))throw Error('阅读清单有不支持或重复的路径。');const id=item.id||itemId(path);if(typeof id!=='string'||id.length>160||ids.has(id))throw Error('阅读条目 ID 重复或无效。');if(item.title!==undefined&&(typeof item.title!=='string'||item.title.length>160))throw Error('阅读标题无效。');paths.add(path);ids.add(id);return {...item,id,path};});}
export function parseV2(raw){
  object(raw,'配置');if(raw.version!==2||!['global','workspace'].includes(raw.kind))throw Error('第二版配置需要 kind: global 或 workspace。');
  const value=structuredClone(raw);if(value.kind==='workspace'){object(value.project,'project');if(typeof value.project.name!=='string'||!value.project.name.trim()||value.project.name.length>160)throw Error('工作区名称须为 1–160 字符。');if(typeof value.id!=='string'||!value.id||value.id.length>160)throw Error('工作区需要稳定 ID。');if(value.project.cover)repoPath(value.project.cover);}
  const editor=value.editor===undefined?{}:value.editor;object(editor,'editor');number(editor,'fontSize',10,40);number(editor,'lineHeight',1,3.5);number(editor,'indentSize',1,8);number(editor,'maxWidth',240,2400);choice(editor,'mode',['novel','code']);choice(editor,'novelIndent',['fullwidth-2','spaces']);for(const key of ['wrap','completion'])if(key in editor&&typeof editor[key]!=='boolean')throw Error(key+' 必须为布尔值。');
  const reader=value.reader===undefined?{}:value.reader,reading=value.reading===undefined?{}:value.reading;object(reader,'reader');object(reading,'reading');choice(reader,'mode',['auto','scroll','pages','double']);choice(reader,'appearancePolicy',['project','personal']);choice(reader,'motion',['system','none','slide']);if('titlePage' in reader&&typeof reader.titlePage!=='boolean')throw Error('titlePage 必须为布尔值。');
  for(const layout of [reader.layout,reading.layout])if(layout){object(layout,'layout');number(layout,'fontSize',10,40);number(layout,'lineHeight',1,3.5);for(const key of ['marginTop','marginBottom','marginLeft','marginRight'])number(layout,key,0,240);}
  if(value.chapters){object(value.chapters,'chapters');if(value.chapters.templates!==undefined&&(!Array.isArray(value.chapters.templates)||value.chapters.templates.some(item=>typeof item!=='string')))throw Error('chapters.templates 必须是字符串数组。');const settings=chapterSettings({titleTemplates:value.chapters.templates||[]});chapterMatcher(settings);value.chapters.templates=settings.titleTemplates;}
  if(value.kind==='workspace'){value.reading={...reading,items:validateItems(reading.items===undefined?[]:reading.items)};}
  if(value.library){object(value.library,'library');choice(value.library,'mode',['auto','manual']);if(value.library.items!==undefined)value.library.items=validateItems(value.library.items);if(value.library.showUnconfiguredFiles!==undefined&&typeof value.library.showUnconfiguredFiles!=='boolean')throw Error('showUnconfiguredFiles 必须为布尔值。');}
  if(value.files){object(value.files,'files');if(Object.keys(value.files).length>5000)throw Error('单文件配置最多 5000 项。');for(const [path,settings] of Object.entries(value.files)){repoPath(path);object(settings,'file settings');parseV2({version:2,kind:'global',editor:settings.editor,reader:settings.reader,reading:settings.reading,chapters:settings.chapters});}}
  if(value.workspaceDefaults){object(value.workspaceDefaults,'workspaceDefaults');parseV2({version:2,kind:'global',editor:value.workspaceDefaults.editor,reader:value.workspaceDefaults.reader,reading:value.workspaceDefaults.reading,chapters:value.workspaceDefaults.chapters});}
  const latex=value.formats?.latex;if(latex){object(latex,'latex');if(latex.main)repoPath(latex.main);choice(latex,'engine',['xetex','pdftex']);}
  if(value.publishing?.changelog)repoPath(value.publishing.changelog);
  return value;
}
export function createVelaV2(name,{global=false}={}){return parseV2(global?{version:2,kind:'global',editor:{},reader:{appearancePolicy:'project'},library:{mode:'auto',showUnconfiguredFiles:true}}:{version:2,kind:'workspace',id:crypto.randomUUID(),project:{name},chapters:{templates:[]},editor:{},reading:{items:[]}});}
export function mergeConfig(base,override){const result={...base};for(const [key,value] of Object.entries(override||{})){const next=value&&typeof value==='object'&&!Array.isArray(value)?mergeConfig(base?.[key]||{},value):structuredClone(value);Object.defineProperty(result,key,{value:next,writable:true,enumerable:true,configurable:true});}return result;}
export function effectiveVela(global,project,path=''){
  const inherited={editor:{...editorDefaults},reader:structuredClone(readerDefaults),chapters:{templates:[]}};
  const normalize=value=>value?JSON.parse(JSON.stringify({...value,files:undefined})):{};
  const g=normalize(global),p=normalize(project),file=project?.files?.[path]||{};let result=mergeConfig(mergeConfig(inherited,g),p);const recommended=mergeConfig(result.reader.layout,result.reading?.layout);result=mergeConfig(result,file);
  result.reading={...result.reading,layout:mergeConfig(mergeConfig(recommended,file.reader?.layout),file.reading?.layout)};
  if(g.reader?.appearancePolicy==='personal')result.reading.layout=mergeConfig(result.reading.layout,g.reader.layout);
  return {...result,version:2,kind:project?.kind||global?.kind||'workspace',project:project?.project||{name:'文稿'}};
}
export function effectiveFileVela(global,base,file){const result=mergeConfig(base,file);result.reading={...result.reading,items:base.reading.items,layout:mergeConfig(mergeConfig(base.reading.layout,file.reader?.layout),file.reading?.layout)};if(global?.reader?.appearancePolicy==='personal')result.reading.layout=mergeConfig(result.reading.layout,global.reader.layout);return result;}
