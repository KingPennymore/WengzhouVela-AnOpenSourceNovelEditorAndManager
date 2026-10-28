import {t,say} from './i18n.mjs';
// Named styles for TXT formatting (.vela `richText.styles`). Properties come from a closed set, so the editor, the
// reader and exports can all render them and no arbitrary CSS reaches a page. Every style applies to a whole paragraph
// or to selected characters; on characters, alignment and indent do not apply and a frame is drawn around the text.
// `block` only records which of the two the style is meant for first (and keeps 0.9.7 able to read the style).

export const STYLE_FIELDS=Object.freeze({
  align:['left','center','right'],
  font:['serif','sans','kai','fangsong','mono'],
  size:['small','large'],
  color:['muted','accent','warning','danger']
});
export const STYLE_LABELS=Object.freeze({
  align:{
    get left(){
      return t('左对齐');
    },
    get center(){
      return t('居中');
    },
    get right(){
      return t('右对齐');
    }
  },
  font:{
    get serif(){
      return t('宋体');
    },
    get sans(){
      return t('黑体');
    },
    get kai(){
      return t('楷体');
    },
    get fangsong(){
      return t('仿宋');
    },
    get mono(){
      return t('等宽');
    }
  },
  size:{
    get small(){
      return t('小');
    },
    get large(){
      return t('大');
    }
  },
  color:{
    get muted(){
      return t('淡色');
    },
    get accent(){
      return t('强调色');
    },
    get warning(){
      return t('警示色');
    },
    get danger(){
      return t('醒目红');
    }
  }
});
/** Built-in styles; a workspace or global configuration may override them by ID or add its own. */
export const BUILTIN_STYLES=Object.freeze({
  system:Object.freeze({
    get label(){
      return t('系统提示');
    },
    block:true,
    align:'center',
    frame:true,
    color:'accent'
  }),
  letter:Object.freeze({
    get label(){
      return t('书信');
    },
    block:true,
    font:'kai',
    indent:2
  }),
  memory:Object.freeze({
    get label(){
      return t('回忆');
    },
    block:true,
    font:'kai',
    color:'muted'
  }),
  aside:Object.freeze({
    get label(){
      return t('旁注');
    },
    block:false,
    size:'small',
    color:'muted'
  })
});
export const MAX_STYLES=32;
const ID=/^[a-z][a-z0-9-]{0,31}$/;

/** Validates one style definition; throws with a reason. */
export function validateStyle(id,value){
  if(!ID.test(id))throw Error(t('样式 ID 须为小写字母开头的字母、数字或连字符（最多 32 个）。'));
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error(say(`样式 ${id} 必须是对象。`,`Style ${id} must be an object.`));
  if(typeof value.label!=='string'||!value.label.trim()||value.label.length>32)
    throw Error(say(`样式 ${id} 的名称须为 1–32 个字。`,`The name of style ${id} must contain 1–32 characters.`));
  for(const key of ['block','frame','bold'])
    if(value[key]!==undefined&&typeof value[key]!=='boolean')
      throw Error(say(`样式 ${id} 的 ${key} 须为布尔值。`,`${key} in style ${id} must be a boolean.`));
  for(const [key,values] of Object.entries(STYLE_FIELDS))
    if(value[key]!==undefined&&!values.includes(value[key]))
      throw Error(say(`样式 ${id} 的 ${key} 不支持此值。`,`Unsupported ${key} value in style ${id}.`));
  if(value.indent!==undefined&&![0,2].includes(value.indent))
    throw Error(say(`样式 ${id} 的 indent 须为 0 或 2。`,`indent in style ${id} must be 0 or 2.`));
}
export function validateStyles(styles){
  if(!styles||typeof styles!=='object'||Array.isArray(styles))throw Error(t('styles 必须是对象。'));
  const entries=Object.entries(styles);
  if(entries.length>MAX_STYLES)throw Error(say(`最多 ${MAX_STYLES} 个样式。`,`At most ${MAX_STYLES} styles are allowed.`));
  for(const [id,value] of entries)validateStyle(id,value);
}
/** Built-ins with configured styles applied over them; invalid configured entries are skipped. */
export function resolveStyles(configured={}){
  const result={...BUILTIN_STYLES};
  for(const [id,value] of Object.entries(configured||{})){
    try {
      validateStyle(id,value);
      result[id]=value;
    } catch {
      /* Reported by the configuration parser. */
    }
  }
  return result;
}

const FONTS={
  serif:'"Songti SC","Noto Serif CJK SC","Source Han Serif SC",serif',
  sans:'"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif',
  // i18n-data: font family names
  kai:'"Kaiti SC",KaiTi,STKaiti,"楷体",serif',
  fangsong:'"FangSong",STFangsong,"仿宋",serif', // i18n-data
  mono:'"Cascadia Mono",Consolas,monospace'
};
const THEME_COLORS={muted:'var(--muted)',accent:'var(--accent)',warning:'var(--warning)',danger:'var(--danger)'};
const FIXED_COLORS={muted:'#6b6b6b',accent:'#2f6f5e',warning:'#a86b00',danger:'#b3261e'};
/**
 * CSS declarations for a style. `theme` uses the app's colour tokens (editor and reader); exports use fixed colours
 * that read well on white paper and in e-readers. `inline` gives the declarations for characters inside a paragraph.
 */
export function styleCss(value,{theme=true,inline=false}={}){
  if(!value)return '';
  const colors=theme?THEME_COLORS:FIXED_COLORS,
    parts=[],
    border='1px solid '+(value.color?colors[value.color]:'currentColor');
  if(value.font)parts.push('font-family:'+FONTS[value.font]);
  if(value.size)parts.push('font-size:'+(value.size==='small'?'.85em':'1.2em'));
  if(value.color)parts.push('color:'+colors[value.color]);
  if(value.bold)parts.push('font-weight:bold');
  if(inline){
    if(value.frame)parts.push('border:'+border,'border-radius:3px','padding:0 .2em');
    return parts.join(';');
  }
  if(value.align)parts.push('text-align:'+value.align);
  if(value.indent===0)parts.push('text-indent:0');
  if(value.indent===2)parts.push('padding-left:2em');
  if(value.frame)parts.push('border:'+border,'border-radius:4px','padding:.35em .8em','margin:.4em 0');
  return parts.join(';');
}
/** Whether a style is meant for paragraphs first (it sets alignment, indent or a frame, or says so). */
export const paragraphStyle=value=>!!(value?.block||value?.align||value?.indent!==undefined||value?.frame);
/** A stylesheet with `.style-<id>` for paragraphs and `span.style-<id>` for characters, for HTML and EPUB exports. */
export const styleSheet=styles=>
  Object.entries(styles)
    .flatMap(([id,value])=>[
      `.style-${id}{${styleCss(value,{theme:false})}}`,
      `span.style-${id}{${styleCss(value,{theme:false,inline:true})}}`
    ])
    .join('\n');
