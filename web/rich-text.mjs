// .vela v3 document sidecars: formatting for a TXT kept beside it ("正文.txt" → "正文.txt.vela").
// The TXT stays plain. Entries carry absolute UTF-16 offsets into the LF-normalised text plus a text quote
// with 16 characters of context, so they can be found again after the TXT was edited outside Vela.
// See docs/VELA-V3-DESIGN.md.
import {textFingerprint} from './document-service.mjs';

export const SIDECAR_SUFFIX='.vela';
export const MAX_SIDECAR_CHARS=4*1024*1024;
export const MAX_ENTRIES=50000;
const CONTEXT=16,GROUPS=['marks','blocks','inserts'];
/** Formats the editor can apply. Other types in a sidecar are kept and re-anchored but not rendered. */
export const INLINE_TYPES=Object.freeze(['strong','emphasis']);
export const ALIGN_VALUES=Object.freeze(['center','right']);

export const sidecarPath=path=>path+SIDECAR_SUFFIX;
export const sidecarTarget=path=>/\.txt\.vela$/i.test(path)?path.slice(0,-SIDECAR_SUFFIX.length):null;
export const isSidecarRaw=raw=>raw?.kind==='document';

const failure=message=>Error('格式旁注无效：'+message);
const lineHash=line=>textFingerprint(line).padStart(8,'0');
/** Per-line hashes and lengths, so offsets can be mapped line by line without the previous text. */
export function textSummary(text){const lines=text.split('\n');return {length:text.length,hash:textFingerprint(text),lineHashes:lines.map(lineHash).join(''),lineLengths:lines.map(line=>line.length.toString(36)).join(',')};}

function validEntry(entry,group,length){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw failure(group+' 中有无效条目。');
  if(typeof entry.id!=='string'||!/^[\w-]{1,32}$/.test(entry.id))throw failure('条目 ID 无效。');
  if(typeof entry.type!=='string'||!/^[a-z][\w-]{0,31}$/.test(entry.type))throw failure('条目类型无效。');
  const at=entry.at,point=group==='inserts';
  if(!Array.isArray(at)||at.length!==(point?1:2)||!at.every(Number.isInteger)||at[0]<0||(!point&&at[1]<at[0])||at.at(-1)>length)throw failure('条目位置无效。');
  for(const key of ['quote','prefix','suffix'])if(entry[key]!==undefined&&typeof entry[key]!=='string')throw failure(key+' 必须是文字。');
}
/** Validates a parsed `kind: "document"` object. Unknown fields and entry types are preserved. */
export function parseDocumentVela(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.kind!=='document')throw failure('需要 kind: document。');
  if(raw.version!==3)throw failure('格式旁注需要 version: 3。');
  if(typeof raw.target!=='string'||!raw.target||/[\\/\x00-\x1f]/.test(raw.target)||raw.target.length>160)throw failure('target 须为同一文件夹中的文件名。');
  const text=raw.text;if(!text||typeof text!=='object'||!Number.isInteger(text.length)||text.length<0||typeof text.hash!=='string')throw failure('text 摘要无效。');
  if(text.lineHashes!==undefined&&(typeof text.lineHashes!=='string'||text.lineHashes.length%8||typeof text.lineLengths!=='string'||text.lineLengths.split(',').length!==text.lineHashes.length/8))throw failure('行摘要无效。');
  let count=0;
  for(const group of GROUPS){if(raw[group]===undefined)continue;if(!Array.isArray(raw[group]))throw failure(group+' 必须是数组。');for(const entry of raw[group])validEntry(entry,group,text.length);count+=raw[group].length;}
  if(raw.review!==undefined){if(!Array.isArray(raw.review))throw failure('review 必须是数组。');for(const entry of raw.review){if(!GROUPS.includes(entry?.group))throw failure('待确认条目缺少 group。');validEntry(entry,entry.group,Number.MAX_SAFE_INTEGER);}count+=raw.review.length;}
  if(count>MAX_ENTRIES)throw failure('最多 '+MAX_ENTRIES+' 条。');
  return structuredClone(raw);
}
export function readSidecar(source){if(typeof source!=='string'||source.length>MAX_SIDECAR_CHARS)throw failure('文件超过 4 MiB。');let raw;try{raw=JSON.parse(source);}catch{throw failure('不是有效的 JSON。');}return parseDocumentVela(raw);}

// ---- Re-anchoring ----

/** Old line → new line for unchanged lines: common head and tail, then lines unique on both sides kept in order. */
export function matchLines(before,after){
  const map=new Int32Array(before.length).fill(-1);let head=0;
  while(head<before.length&&head<after.length&&before[head]===after[head]){map[head]=head;head++;}
  let tail=0;while(tail<before.length-head&&tail<after.length-head&&before[before.length-1-tail]===after[after.length-1-tail]){map[before.length-1-tail]=after.length-1-tail;tail++;}
  const count=(list,from,to)=>{const seen=new Map();for(let i=from;i<to;i++)seen.set(list[i],seen.has(list[i])?-1:i);return seen;};
  const a=count(before,head,before.length-tail),b=count(after,head,after.length-tail),pairs=[];
  for(const [key,i] of a)if(i>=0&&b.get(key)>=0)pairs.push([i,b.get(key)]);
  pairs.sort((x,y)=>x[0]-y[0]);
  // Longest increasing run of new positions keeps the order; lines that moved are left to quote matching.
  const tails=[],links=new Int32Array(pairs.length);
  for(let k=0;k<pairs.length;k++){let lo=0,hi=tails.length;while(lo<hi){const mid=lo+hi>>1;if(pairs[tails[mid]][1]<pairs[k][1])lo=mid+1;else hi=mid;}links[k]=lo?tails[lo-1]:-1;tails[lo]=k;}
  for(let k=tails.at(-1)??-1;k>=0;k=links[k])map[pairs[k][0]]=pairs[k][1];
  // Grow around anchors so repeated lines (blank lines, “……”) next to an unchanged line match too.
  const used=new Uint8Array(after.length);for(const k of map)if(k>=0)used[k]=1;
  for(let i=0;i<before.length;i++)if(map[i]>=0)for(let j=i+1,k=map[i]+1;j<before.length&&k<after.length&&map[j]<0&&!used[k]&&before[j]===after[k];j++,k++){map[j]=k;used[k]=1;}
  for(let i=before.length-1;i>=0;i--)if(map[i]>=0)for(let j=i-1,k=map[i]-1;j>=0&&k>=0&&map[j]<0&&!used[k]&&before[j]===after[k];j--,k--){map[j]=k;used[k]=1;}
  return map;
}
const common=(a,b,fromEnd)=>{let n=0;while(n<a.length&&n<b.length&&(fromEnd?a[a.length-1-n]===b[b.length-1-n]:a[n]===b[n]))n++;return n;};
/** Finds `quote` by its context. Returns null rather than guessing between equally good places. */
export function findQuote(text,entry,hint=0,region=null){
  const quote=entry.quote||'';if(!quote)return null;
  const hits=[];for(let at=text.indexOf(quote,region?.from||0);at>=0&&hits.length<5000&&(!region||at+quote.length<=region.to);at=text.indexOf(quote,at+1))hits.push(at);
  if(!hits.length)return null;
  const scored=hits.map(at=>({at,score:common(text.slice(Math.max(0,at-CONTEXT),at),entry.prefix||'',true)+common(text.slice(at+quote.length,at+quote.length+CONTEXT),entry.suffix||'',false)})).sort((x,y)=>y.score-x.score||Math.abs(x.at-hint)-Math.abs(y.at-hint));
  const [best,second]=scored,needed=quote.length<2?12:6;
  if(hits.length===1&&quote.length>=4&&best.score>=Math.min(needed,(entry.prefix||'').length+(entry.suffix||'').length))return best.at;
  if(best.score<needed||second&&second.score>=best.score)return null;
  return best.at;
}
const starts=lengths=>{const out=new Array(lengths.length);let at=0;for(let i=0;i<lengths.length;i++){out[i]=at;at+=lengths[i]+1;}return out;};
const lineOf=(lineStarts,offset)=>{let lo=0,hi=lineStarts.length-1;while(lo<hi){const mid=lo+hi+1>>1;if(lineStarts[mid]<=offset)lo=mid;else hi=mid-1;}return lo;};

/**
 * Places every entry of a sidecar in `text`. Entries whose text can no longer be found go to `review`
 * with a reason; nothing is dropped. `moved` counts entries placed by searching instead of by offset.
 */
export function resolveSidecar(text,sidecar){
  const entries=[],review=[...(sidecar.review||[])];let moved=0;
  const all=GROUPS.flatMap(group=>(sidecar[group]||[]).map(entry=>({...entry,group})));
  const exact=sidecar.text.length===text.length&&sidecar.text.hash===textFingerprint(text);
  let mapOffset=null,regionOf=()=>null;
  if(!exact&&sidecar.text.lineHashes){
    const oldHashes=sidecar.text.lineHashes.match(/.{8}/g)||[],oldLengths=sidecar.text.lineLengths.split(',').map(value=>parseInt(value,36)),newLines=text.split('\n'),newLengths=newLines.map(line=>line.length);
    const map=matchLines(oldHashes,newLines.map(lineHash)),oldStarts=starts(oldLengths),newStarts=starts(newLengths);
    mapOffset=offset=>{const line=lineOf(oldStarts,offset),target=map[line];return target<0?null:{line,offset:newStarts[target]+offset-oldStarts[line],target};};
    // Where an edited line should now be: between the nearest unchanged lines before and after it.
    regionOf=offset=>{const line=lineOf(oldStarts,offset);let before=line-1,after=line+1;while(before>=0&&map[before]<0)before--;while(after<map.length&&map[after]<0)after++;const from=before<0?0:newStarts[map[before]]+newLengths[map[before]]+1,to=after>=map.length?text.length:newStarts[map[after]];return from<=to?{from,to}:null;};
  }
  for(const entry of all){
    const from=entry.at[0],to=entry.at.at(-1),point=entry.group==='inserts';
    if(exact){entries.push({...entry,from,to});continue;}
    let placed=null;
    if(mapOffset){const start=mapOffset(from),end=point?start:mapOffset(to);if(start&&end&&end.target-start.target===end.line-start.line&&(point?(entry.prefix||'')===text.slice(Math.max(0,start.offset-(entry.prefix||'').length),start.offset):text.slice(start.offset,end.offset)===(entry.quote??'')))placed={from:start.offset,to:end.offset};}
    if(!placed&&!point){const region=regionOf(from);let at=region?findQuote(text,entry,from,region):null;if(at===null)at=findQuote(text,entry,from);if(at!==null){placed={from:at,to:at+entry.quote.length};moved++;}}
    if(!placed&&point){const at=entry.prefix?findQuote(text,{quote:entry.prefix,prefix:'',suffix:entry.suffix},from):null;if(at!==null){placed={from:at+entry.prefix.length,to:at+entry.prefix.length};moved++;}}
    if(placed)entries.push({...entry,...placed});else review.push({...entry,reason:entry.quote?'找不到原文“'+entry.quote.slice(0,24)+'”':'找不到插入位置'});
  }
  entries.sort((a,b)=>a.from-b.from||a.to-b.to);
  return {entries,review,exact,moved};
}

// ---- Writing ----

const randomId=()=>Math.random().toString(36).slice(2,10);
export const newEntryId=randomId;
/** Plain object for one entry, in key order: id, type, value, at, quote, prefix, suffix, then anything else. */
function entryObject(entry,text){
  const {id,type,value,group,from,to,at:_at,quote:_q,prefix:_p,suffix:_s,reason:_r,...rest}=entry,point=group==='inserts';
  const out={id:id||randomId(),type};if(value!==undefined)out.value=value;
  out.at=point?[from]:[from,to];if(!point)out.quote=text.slice(from,to);
  out.prefix=text.slice(Math.max(0,from-CONTEXT),from);out.suffix=text.slice(to,to+CONTEXT);
  return Object.assign(out,rest);
}
/** One entry per line, so Git merges and conflicts land on individual entries. */
export function sidecarText(sidecar){
  const head={...sidecar};const lists={};for(const key of [...GROUPS,'review'])if(Array.isArray(head[key])){lists[key]=head[key];delete head[key];}
  const parts=Object.entries(head).map(([key,value])=>JSON.stringify(key)+': '+JSON.stringify(value));
  for(const [key,list] of Object.entries(lists))parts.push(JSON.stringify(key)+': '+(list.length?'[\n'+list.map(item=>'    '+JSON.stringify(item)).join(',\n')+'\n  ]':'[]'));
  const result='{\n  '+parts.join(',\n  ')+'\n}\n';
  if(result.length>MAX_SIDECAR_CHARS)throw failure('格式条目过多，旁注超过 4 MiB。');
  return result;
}
/** Builds the sidecar for `text` from placed entries, keeping fields of `previous` that Vela does not manage. */
export function buildSidecar(target,text,entries,review=[],previous={}){
  const groups=Object.fromEntries(GROUPS.map(group=>[group,[]]));
  for(const entry of [...entries].sort((a,b)=>a.from-b.from||a.to-b.to))groups[entry.group||'marks'].push(entryObject(entry,text));
  const {marks:_m,blocks:_b,inserts:_i,review:_r,version:_v,kind:_k,target:_t,text:_x,...rest}=previous;
  const sidecar={version:3,kind:'document',target,text:textSummary(text),...rest};
  for(const group of GROUPS)if(groups[group].length||previous[group])sidecar[group]=groups[group];
  if(review.length)sidecar.review=review.map(({from:_f,to:_to,...entry})=>entry);
  return sidecar;
}
