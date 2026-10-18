// A 炉火祈愿 workspace for the real 文舟 web app: the manuscript, a glossary, the outline and relations, the map.
import {createOutline,outlineText} from '../../../web/outline.mjs';
import {addNode} from '../../../web/outline-tree.mjs';
import {relationValue,addRelationNode,connectRelation} from '../../../web/outline-collections.mjs';
import {createMap,mapText} from '../../../web/map.mjs';
import {glossaryText} from '../../../web/glossary.mjs';
import {createVelaV2,velaText} from '../../../web/vela.mjs';

const para=s=>'　　'+s;
export const MANUSCRIPT=['序章 此刻',
  para('我死死地攥着手里的长枪，弓着身子，跪在牲畜和人的尸体中……'),
  para('麦依尔曾对我说过，冬天是辛弗兰给予战士的怜悯。'),
  para('大熊阿瑟用它温暖的鼻息融化积雪，将露出的大地作为战场，吼叫着呼喊战争。而当战士们的血浸染大地时，辛弗兰就用它的翅膀扇起寒风，用寒冷与死亡恐吓战士们，让他们对战争望而却步。'),
  para('在今天之前，我都不曾领会这种仁慈。'),
  '第一章 萨卡莱特',
  para('每当我看着哈沃德用锤子砸在烧得发白的铁块上，滋滋作响的火星飞着溅射出来，我眼睛就移不开了。'),
  para('我害怕它们，但我的眼睛却会被它们吸引。'),
  para('“你会习惯的，人总是会习惯的。”')].join('\n');

export function outline({nodes=99,edge=2}={}){
  const v=createOutline('炉火祈愿');
  // the plot tree, as many nodes of it as have been added (in this order)
  let n=0;const add=(parent,title,summary)=>{if(n++>=nodes)return null;const id=addNode(v,parent,{child:!!parent,title});v.nodes[id].summary=summary;return id;};
  const root=add(null,'炉火祈愿 · 第一部','里加的回忆'),pro=root&&add(root,'序章 · 此刻','战后的冬天');
  for(const [t,s] of [['逃亡的松林','里加藏在大树后'],['大熊阿瑟','鼻息融雪，呼喊战争'],['寒鸦辛弗兰','扇起寒风，吓退战士']])pro&&add(pro,t,s);
  const one=root&&add(root,'一、萨卡莱特','里加长大的村子');
  for(const [t,s] of [['哈沃德的铁匠铺','烧得发白的铁'],['离开萨卡莱特','哈沃德送到岔路口'],['前往海尔加德','途经艾洛夫与盎讷']])one&&add(one,t,s);
  // the relations: Havard on the left, Riga on the right; edge 0 none, 1 drawn, 2 labelled
  const r=relationValue(v),havard=addRelationNode(r,'哈沃德'),riga=addRelationNode(r,'里加');
  r.nodes[havard].layout={x:150,y:90};r.nodes[riga].layout={x:510,y:90};
  if(edge>0){connectRelation(r,havard,riga);if(edge>1)r.edges[0].label='抚养与照料';}
  return v;
}
export function map(places=4){
  const v=createMap('瑞达内');
  const put=(q,r,c)=>{v.cells[q+','+r]=c;};
  for(let q=-6;q<=10;q++)for(let r=-4;r<=5;r++)if(Math.hypot(q+r/2-2,r)<7.5&&(q*7+r*13)%5===0)put(q,r,{type:'draw',fill:'#7fa58b'});
  [['萨卡莱特',-4,-2],['艾洛夫',0,1],['盎讷',4,-1],['海尔加德',8,2]].slice(0,places).forEach(([name,q,r])=>put(q,r,{type:'info',name}));
  return v;
}
export function seed({gly=[],plan={},mapPlaces=4,settings={}}={}){
  const make=(id,name,text,dir='炉火祈愿/')=>({id,name,path:dir+name,text,updatedAt:Date.now()});
  const config=createVelaV2('炉火祈愿');config.editor.glossaries=['设定.gly'];
  return {version:1,documents:[
    make('book','正文.txt',MANUSCRIPT),
    make('terms','设定.gly',glossaryText({version:1,entries:[{term:'里加',category:'人物',definition:'萨卡莱特的少年，本作的叙述者'},{term:'哈沃德',category:'人物',definition:'萨卡莱特的铁匠，抚养里加长大'},{term:'麦依尔',category:'人物',definition:''},...gly]})),
    make('plan','炉火祈愿.pcs',outlineText(outline(plan))),
    make('map','瑞达内.vlmp',mapText(map(mapPlaces))),
    make('config','.vela',velaText(config))],
    openIds:['book'],activeId:'book',settings:{theme:'dark',palette:'pine',...settings}};
}
