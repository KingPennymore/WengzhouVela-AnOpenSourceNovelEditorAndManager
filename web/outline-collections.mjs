export const outlineMode=mode=>mode==='relations'?'relations':'outline';
export function outlineGroups(value){return [{id:'outline',value},...(value.relations?[{id:'relations',value:value.relations}]:[])];}
export function relationValue(value){return value.relations||={nodes:{},edges:[]};}
export function addRelationNode(value,title='新节点'){const id='r-'+crypto.randomUUID();value.nodes[id]={title,children:[]};return id;}
export function connectRelation(value,from,to){if(from===to||!value.nodes[from]||!value.nodes[to]||value.edges.some(e=>e.from===from&&e.to===to||e.from===to&&e.to===from))return false;value.edges.push({id:'e-'+crypto.randomUUID(),from,to,label:'',style:'solid',direction:'forward'});return true;}
export function removeRelationNode(value,id){if(!value.nodes[id])return false;delete value.nodes[id];value.edges=value.edges.filter(e=>e.from!==id&&e.to!==id);return true;}
export function relationDegrees(value){const adjacent=new Map(Object.keys(value.nodes).map(id=>[id,new Set()]));for(const e of value.edges)if(e.from!==e.to){adjacent.get(e.from)?.add(e.to);adjacent.get(e.to)?.add(e.from);}return Object.fromEntries([...adjacent].map(([id,neighbors])=>[id,neighbors.size]));}
export function relationSize(degree){const scale=1+Math.min(.75,Math.sqrt(Math.max(0,degree))*.16);return {width:Math.round(160*scale),height:Math.round(72*scale)};}
