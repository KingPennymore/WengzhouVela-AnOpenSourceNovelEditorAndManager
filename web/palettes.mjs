import {t,say} from './i18n.mjs';

const colors=(bg,panel,paper,text,muted,line,accent,soft,selection)=>({bg,panel,paper,text,muted,line,accent,soft,selection});
export const palettes=[
  {
    id:'pine',
    get name(){
      return t('青松');
    },
    light:colors('#eef3ef','#f4f8f5','#fcfefc','#28372f','#607167','#d9e5dc','#23744e','#e3f0e7','#70b58b66'),
    dark:colors('#161e1a','#1c2821','#202e25','#d5e5db','#96ac9e','#35483c','#8ad0a8','#2e4838','#70b58b66')
  },
  {
    id:'jade',
    get name(){
      return t('玉石');
    },
    light:colors('#edf4f1','#f3f9f6','#fdfffe','#273a35','#5c726a','#d7e7e0','#176e5e','#e0f0e9','#60bda366'),
    dark:colors('#15201c','#1b2c25','#20332a','#d3e8df','#92ada1','#344d40','#81d3b6','#2b4a3d','#60bda366')
  },
  {
    id:'bamboo',
    get name(){
      return t('墨竹');
    },
    light:colors('#f0f3e9','#f7f9f1','#fefff9','#333d2c','#65705a','#e0e6d5','#4e6c36','#eaf0df','#91ae6866'),
    dark:colors('#1c2117','#252e1e','#2b3524','#e0e8d6','#a0ae92','#47543a','#b3cf8e','#3d4d2e','#91ae6866')
  },
  {
    id:'wheat',
    get name(){
      return t('麦田');
    },
    light:colors('#f4f0e8','#faf7ef','#fffdf8','#3c362c','#756b5b','#e8e0d1','#886218','#f2e9d3','#ceb06c66'),
    dark:colors('#231e17','#2e271d','#352d21','#eae2d2','#b9a98c','#554936','#e5c27d','#4d3e25','#ceb06c66')
  },
  {
    id:'graphite',
    get name(){
      return t('石墨');
    },
    light:colors('#eef1f2','#f5f7f8','#ffffff','#2d373e','#616e77','#dce3e7','#52636d','#e6ecef','#90a5b266'),
    dark:colors('#1b2023','#232b30','#29333a','#dce3e7','#a0afb9','#46535d','#b0c4d1','#3b4a55','#90a5b266')
  }
];

const legibleCache=new WeakMap();
// Text has to survive both the plain surfaces and two translucent accent layers
// (the start-page background plus its resume card). Keep stored palette bases intact.
function legibleColors(base){
  if(legibleCache.has(base))return legibleCache.get(base);
  const value={...base},ink=luminance(base.paper)<.5?'#ffffff':'#000000';
  const surfaces=()=>[value.bg,value.panel,value.paper,value.soft,mix(value.paper,value.accent,31/255),mix(mix(value.paper,value.accent,31/255),value.accent,31/255)];
  for(let t=0;t<=1.001;t+=.02){value.accent=mix(base.accent,ink,Math.min(1,t));if(Math.min(...surfaces().map(bg=>contrast(value.accent,bg)))>=4.8)break;}
  for(const key of ['text','muted'])for(let t=0;t<=1.001;t+=.02){value[key]=mix(base[key],ink,Math.min(1,t));if(Math.min(...surfaces().map(bg=>contrast(value[key],bg)))>=4.8)break;}
  legibleCache.set(base,value);return value;
}
export function paletteFor(id,dark){
  const palette=palettes.find(item=>item.id===id)||custom.find(item=>item.id===id)||palettes[0];
  const colors=dark?palette.dark:palette.light;
  // Custom palettes keep the colours the writer chose; their editor already warns about low contrast.
  return {id:palette.id,colors:palettes.includes(palette)?legibleColors(colors):colors};
}
// Translucent accent layers for tints, focus rings and glows; Chromium 105 has no color-mix().
const accentLayers={tint:'1f',ring:'47',glow:'33'};

export function applyPalette(element,id,dark){
  const selected=paletteFor(id,dark);
  for(const [name,color] of Object.entries(selected.colors))
    element.style.setProperty('--'+name,color);
  for(const [name,alpha] of Object.entries(accentLayers))
    element.style.setProperty('--accent-'+name,selected.colors.accent+alpha);
  // Light-mode shadows take their tint from the palette's text colour; dark mode keeps the black shadows in design.css.
  const ink=selected.colors.text,
    shadows={'elev-1':`0 1px 2px ${ink}08,0 1px 3px ${ink}0d`,'elev-2':`0 10px 24px -12px ${ink}38,0 2px 6px ${ink}0f`,'elev-3':`0 28px 64px -20px ${ink}52,0 4px 14px ${ink}14`};
  for(const [name,value] of Object.entries(shadows))
    if(dark)
      element.style.removeProperty('--'+name);
    else
      element.style.setProperty('--'+name,value);
  return selected.id;
}

// ---- Custom palettes: three base colours per mode; the other tokens are derived so they stay consistent. ----
export const MAX_CUSTOM_PALETTES=8;
const HEX=/^#[0-9a-f]{6}$/i;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=values=>'#'+values.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>{
  const x=rgb(a),y=rgb(b);
  return hex(x.map((v,i)=>v+(y[i]-v)*t));
};
const luminance=color=>{
  const [r,g,b]=rgb(color).map(v=>{
    v/=255;
    return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;
  });
  return .2126*r+.7152*g+.0722*b;
};
/** WCAG 2 contrast ratio of two #rrggbb colours. */

export function contrast(a,b){
  const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);
  return (x+.05)/(y+.05);
}
/** Full token set from {accent, paper, text}. */

export function derivePalette({accent,paper,text},dark=false){
  for(const value of [accent,paper,text])
    if(!HEX.test(value||''))
      throw Error(t('颜色须为 #rrggbb 格式。'));
  // Same layering as the built-in palettes: background darkest, panel between, paper brightest.
  const bg=dark?mix(paper,'#000000',.3):mix(mix(paper,accent,.06),text,.02),panel=mix(paper,bg,.55),ink=mix(text,accent,.5);
  // Secondary text keeps 4.5:1 on the darkest surface it sits on; low-contrast bases move it back towards the text colour.
  let muted=mix(text,paper,dark?.32:.3);
  for(let t=dark?.32:.3;t>0&&Math.min(contrast(muted,bg),contrast(muted,panel))<4.5;t-=.02)
    muted=mix(text,paper,Math.max(0,t-.02));
  return colors(bg,panel,paper,text,muted,mix(paper,ink,dark?.2:.13),accent,mix(paper,accent,dark?.18:.1),accent+'66');
}
/** Readability notes for a base set: text on paper needs 4.5:1, the accent 3:1. */

export function paletteWarnings({accent,paper,text}){
  const notes=[];
  const body=contrast(text,paper),mark=contrast(accent,paper);
  if(body<4.5)
    notes.push(say(
      `正文与纸张对比度 ${body.toFixed(1)}:1，低于 4.5:1，长时间阅读会吃力`,
      `Text-to-paper contrast is ${body.toFixed(1)}:1, below 4.5:1; long reading may be tiring`
    ));
  if(mark<3)
    notes.push(say(
      `强调色与纸张对比度 ${mark.toFixed(1)}:1，低于 3:1，按钮和标记可能看不清`,
      `Accent-to-paper contrast is ${mark.toFixed(1)}:1, below 3:1; buttons and markers may be hard to see`
    ));
  return notes;
}

export function validateCustomPalette(value){
  if(!value||typeof value!=='object')
    throw Error(t('配色无效。'));
  if(typeof value.id!=='string'||!/^custom-[a-z0-9]{1,16}$/.test(value.id))
    throw Error(t('配色 ID 无效。'));
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>16)
    throw Error(t('配色名称须为 1–16 个字。'));
  for(const mode of ['light','dark'])
    derivePalette(value[mode]||{},mode==='dark');
  return {id:value.id,name:value.name.trim(),light:{...value.light},dark:{...value.dark}};
}
let custom=[];
/** Registers the person's custom palettes (base colours) so paletteFor and applyPalette can use them. */

export function setCustomPalettes(list=[]){
  custom=[];
  for(const item of (Array.isArray(list)?list:[]).slice(0,MAX_CUSTOM_PALETTES)){
    try{
      const value=validateCustomPalette(item);
      custom.push({...value,custom:true,base:{light:value.light,dark:value.dark},light:derivePalette(value.light),dark:derivePalette(value.dark,true)});
    }catch{/* An invalid entry is skipped; the rest still load. */
    }
  }
  return custom;
}
export const customPalettes=()=>custom;
export const allPalettes=()=>[...palettes,...custom];
export const newPaletteId=()=>'custom-'+Math.random().toString(36).slice(2,10);
/** Starting point for a new custom palette, based on an existing palette. */

export function paletteBase(id){
  const found=allPalettes().find(item=>item.id===id)||palettes[0];
  if(found.base)
    return structuredClone(found.base);
  return {light:{accent:found.light.accent,paper:found.light.paper,text:found.light.text},dark:{accent:found.dark.accent,paper:found.dark.paper,text:found.dark.text}};
}
