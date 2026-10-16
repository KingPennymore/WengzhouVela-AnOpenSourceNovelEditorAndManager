// Named styles for TXT formatting (.vela v3 `styles`). Properties come from a closed set, so the editor, the reader
// and exports can all render them and no arbitrary CSS reaches a page.

export const STYLE_FIELDS=Object.freeze({
  align:['left','center','right'],
  font:['serif','sans','kai','fangsong','mono'],
  size:['small','large'],
  color:['muted','accent','warning','danger'],
});
export const STYLE_LABELS=Object.freeze({align:{left:'左对齐',center:'居中',right:'右对齐'},font:{serif:'宋体',sans:'黑体',kai:'楷体',fangsong:'仿宋',mono:'等宽'},size:{small:'小',large:'大'},color:{muted:'淡色',accent:'强调色',warning:'警示色',danger:'醒目红'}});
/** Built-in styles; a workspace or global configuration may override them by ID or add its own. */
export const BUILTIN_STYLES=Object.freeze({
  system:Object.freeze({label:'系统提示',block:true,align:'center',frame:true,color:'accent'}),
  letter:Object.freeze({label:'书信',block:true,font:'kai',indent:2}),
  memory:Object.freeze({label:'回忆',block:true,font:'kai',color:'muted'}),
  aside:Object.freeze({label:'旁注',block:false,size:'small',color:'muted'}),
});
export const MAX_STYLES=32;
const ID=/^[a-z][a-z0-9-]{0,31}$/;

/** Validates one style definition; throws with a reason. */
export function validateStyle(id,value){
  if(!ID.test(id))throw Error('样式 ID 须为小写字母开头的字母、数字或连字符（最多 32 个）。');
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('样式 '+id+' 必须是对象。');
  if(typeof value.label!=='string'||!value.label.trim()||value.label.length>32)throw Error('样式 '+id+' 的名称须为 1–32 个字。');
  for(const key of ['block','frame','bold'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('样式 '+id+' 的 '+key+' 须为布尔值。');
  for(const [key,values] of Object.entries(STYLE_FIELDS))if(value[key]!==undefined&&!values.includes(value[key]))throw Error('样式 '+id+' 的 '+key+' 不支持此值。');
  if(value.indent!==undefined&&![0,2].includes(value.indent))throw Error('样式 '+id+' 的 indent 须为 0 或 2。');
  if(!value.block&&(value.align||value.frame||value.indent!==undefined))throw Error('行内样式 '+id+' 不能设置对齐、缩进或边框。');
}
export function validateStyles(styles){
  if(!styles||typeof styles!=='object'||Array.isArray(styles))throw Error('styles 必须是对象。');
  const entries=Object.entries(styles);if(entries.length>MAX_STYLES)throw Error('最多 '+MAX_STYLES+' 个样式。');
  for(const [id,value] of entries)validateStyle(id,value);
}
/** Built-ins with configured styles applied over them; invalid configured entries are skipped. */
export function resolveStyles(configured={}){
  const result={...BUILTIN_STYLES};
  for(const [id,value] of Object.entries(configured||{})){try{validateStyle(id,value);result[id]=value;}catch{/* Reported by the configuration parser. */}}
  return result;
}

const FONTS={serif:'"Songti SC","Noto Serif CJK SC","Source Han Serif SC",serif',sans:'"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif',kai:'"Kaiti SC",KaiTi,STKaiti,"楷体",serif',fangsong:'"FangSong",STFangsong,"仿宋",serif',mono:'"Cascadia Mono",Consolas,monospace'};
const THEME_COLORS={muted:'var(--muted)',accent:'var(--accent)',warning:'var(--warning)',danger:'var(--danger)'};
const FIXED_COLORS={muted:'#6b6b6b',accent:'#2f6f5e',warning:'#a86b00',danger:'#b3261e'};
/**
 * CSS declarations for a style. `theme` uses the app's colour tokens (editor and reader); exports use fixed colours
 * that read well on white paper and in e-readers.
 */
export function styleCss(value,{theme=true}={}){
  if(!value)return '';const colors=theme?THEME_COLORS:FIXED_COLORS,parts=[];
  if(value.font)parts.push('font-family:'+FONTS[value.font]);
  if(value.size)parts.push('font-size:'+(value.size==='small'?'.85em':'1.2em'));
  if(value.color)parts.push('color:'+colors[value.color]);
  if(value.bold)parts.push('font-weight:bold');
  if(value.block){
    if(value.align)parts.push('text-align:'+value.align);
    if(value.indent===0)parts.push('text-indent:0');if(value.indent===2)parts.push('padding-left:2em');
    if(value.frame)parts.push('border:1px solid '+(value.color?colors[value.color]:'currentColor'),'border-radius:4px','padding:.35em .8em','margin:.4em 0');
  }
  return parts.join(';');
}
/** A stylesheet with one `.style-<id>` rule per style, for HTML and EPUB exports. */
export const styleSheet=styles=>Object.entries(styles).map(([id,value])=>`.style-${id}{${styleCss(value,{theme:false})}}`).join('\n');
