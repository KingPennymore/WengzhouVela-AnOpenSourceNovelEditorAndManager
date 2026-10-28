import {t,say} from './i18n.mjs';
import {validateMapImages} from './map-images.mjs';
import {readFormat,object,string,finite,optional,reference,ordered,writeFormat} from './structured-formats.mjs';
import {MB} from './text-utils.mjs';

export const cellKey=key=>typeof key==='string'&&/^-?(0|[1-9]\d*),-?(0|[1-9]\d*)$/.test(key)&&key.split(',').every(n=>Number.isSafeInteger(+n)&&Math.abs(+n)<=1000000)&&!key.split(',').includes('-0');

export function validatePalette(list){
  if(!Array.isArray(list)||!list.length||list.length>256)
    throw Error(t('调色板需要 1–256 项。'));
  const seen=new Set();
  for(const p of list){
    object(p,'调色板');
    string(p.id,'id');
    string(p.label,'label');
    if(!p.id||seen.has(p.id)||!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(p.color)||!['land','water','city','other'].includes(p.role))
      throw Error(t('调色板条目无效或重复。'));
    seen.add(p.id);
    if(p.cost!==undefined&&(!Number.isFinite(p.cost)||p.cost<=0||p.cost>1000))
      throw Error(t('地形成本无效。'));
  }
  return list;
}

export function parseMap(text){
  const v=readFormat(text,8*MB),grid=object(v.grid,'grid');
  if(!['pointy','flat'].includes(grid.orientation)||!Number.isFinite(grid.size)||grid.size<4||grid.size>256)
    throw Error(t('六边形方向或尺寸无效。'));
  if(grid.visible!==undefined&&typeof grid.visible!=='boolean')
    throw Error(t('六边形网格显示必须为布尔值。'));
  if(v.palette!=='inherit')
    validatePalette(v.palette);
  const cells=object(v.cells,'cells');
  if(Object.keys(cells).length>50000)
    throw Error(t('地图最多 50000 个格子。'));
  for(const [key,c] of Object.entries(cells)){
    if(!cellKey(key))
      throw Error(t('格子轴坐标无效。'));
    object(c,'格子');
    if(c.drawingBaked!==undefined&&typeof c.drawingBaked!=='boolean')
      throw Error(t('地形绘制标记无效。'));
    if(c.type!==undefined&&!['draw','info'].includes(c.type))
      throw Error(t('地图点类型无效。'));
    if(c.fill!==undefined)
      string(c.fill,'fill');
    if(c.type===undefined&&c.fill===undefined)
      throw Error(t('地图点类型无效。'));
    for(const k of ['name','note','category','symbol'])
      optional(c,k,string);
    optional(c,'link',reference);
  }
  if(v.info!==undefined){
    object(v.info,'info');
    for(const key of ['summary','detail'])
      optional(v.info,key,string);
    if(v.info.fields!==undefined){
      if(!Array.isArray(v.info.fields))
        throw Error(t('fields 必须是数组。'));
      for(const f of v.info.fields){
        object(f,'field');
        string(f.label,'label');
        string(f.value,'value');
      }
    }
  }
  if(v.drawing!==undefined){
    object(v.drawing,'drawing');
    if(!Number.isFinite(v.drawing.distance)||v.drawing.distance<1||v.drawing.distance>16)
      throw Error(t('相邻范围无效。'));
  }
  if(v.markers!==undefined){
    if(!Array.isArray(v.markers)||v.markers.length>5000)
      throw Error(t('信息点最多 5000 个。'));
    const ids=new Set();
    for(const m of v.markers){
      object(m,'marker');
      string(m.id,'id');
      if(!m.id||ids.has(m.id))
        throw Error(t('信息点 ID 无效或重复。'));
      ids.add(m.id);
      finite(m.x,'x');
      finite(m.y,'y');
      for(const k of ['name','note','category','symbol'])
        optional(m,k,string);
      optional(m,'link',reference);
      if(m.invalid!==undefined&&typeof m.invalid!=='boolean')
        throw Error(t('信息点标记无效。'));
    }
  }
  for(const [key,max] of [['arrows',2000],['symbols',5000],['generated',5000]]){
    if(!Array.isArray(v[key])||v[key].length>max)
      throw Error(say(`${key} 数量无效。`,`Invalid count for ${key}.`));
    const seen=new Set();
    for(const item of v[key]){
      object(item,key);
      string(item.id,'id');
      if(!item.id||seen.has(item.id))
        throw Error(t('图层 ID 无效或重复。'));
      seen.add(item.id);
      if(key==='arrows'){
        if(!Array.isArray(item.path)||item.path.length<2||item.path.some(k=>!cellKey(k)))
          throw Error(t('箭头路径无效。'));
        for(const k of ['style','color','head','label','faction'])
          optional(item,k,string);
        for(const k of ['width','curve'])
          optional(item,k,finite);
      }
      if(key==='arrows'&&((item.width!==undefined&&(item.width<.5||item.width>40))||(item.curve!==undefined&&(item.curve<0||item.curve>1))))
        throw Error(t('箭头粗细或弧度无效。'));
      if(key==='symbols'){
        string(item.type,'type');
        for(const k of ['x','y'])
          finite(item[k],k);
        for(const k of ['rotation','scale'])
          optional(item,k,finite);
        for(const k of ['affiliation','faction','label','echelon'])
          optional(item,k,string);
      }
      if(key==='symbols'&&item.scale!==undefined&&(item.scale<=0||item.scale>20))
        throw Error(t('符号缩放无效。'));
      if(key==='generated'){
        string(item.algorithm,'algorithm');
        if(item.algorithm==='terrain')
          optional(item,'label',string);
        const valid=paths=>Array.isArray(paths)&&paths.every(p=>Array.isArray(p)&&p.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite)));
        if(!valid(item.paths))
          throw Error(t('生成边界坐标无效。'));
        if(item.regions!==undefined&&(!Array.isArray(item.regions)||item.regions.length>5000||item.regions.some(r=>!r||!valid(r.paths)||typeof r.color!=='string'||!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(r.color))))
          throw Error(t('生成辖区无效。'));
        if(item.style!==undefined){
          object(item.style,'style');
          for(const k of ['stroke','fill'])
            optional(item.style,k,string);
          if(item.style.width!==undefined&&(!Number.isFinite(item.style.width)||item.style.width<0))
            throw Error(t('生成边界样式无效。'));
        }
      }
    }
  }
  if(v.labels!==undefined){
    object(v.labels,'labels');
    if(v.labels.hiddenCategories!==undefined&&(!Array.isArray(v.labels.hiddenCategories)||v.labels.hiddenCategories.length>5000||v.labels.hiddenCategories.some(c=>typeof c!=='string'||c.length>80)))
      throw Error(t('名称类别设置无效。'));
  }
  for(const point of [...Object.values(cells),...(v.markers||[])]){
    if(point.category!==undefined&&point.category.length>80)
      throw Error(t('类别最多 80 个字符。'));
    if(point.symbol!==undefined&&point.symbol.length>256)
      throw Error(t('元素图标标识过长。'));
  }
  validateMapImages(v);
  return v;
}

export const createMap=(name='地图')=>({
  version:1,
  name,
  grid:{orientation:'pointy',size:32},
  info:{summary:'',detail:'',fields:[]},
  palette:'inherit',
  drawing:{distance:3},
  cells:{},
  markers:[],
  arrows:[],
  symbols:[],
  generated:[]
});

export function mapText(v){
  const value=ordered(parseMap(JSON.stringify(v)),['version','name','grid','info','palette','drawing','cells','markers','arrows','images','symbols','generated']);
  value.cells=Object.fromEntries(Object.entries(value.cells).sort(([a],[b])=>{
    const [aq,ar]=a.split(',').map(Number),[bq,br]=b.split(',').map(Number);
    return ar-br||aq-bq;
  }));
  return JSON.stringify(value,null,2)+'\n';
}
