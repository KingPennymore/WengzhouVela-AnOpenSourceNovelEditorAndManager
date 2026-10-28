// .vela v3 document sidecars: formatting for a TXT kept beside it ("正文.txt" → "正文.txt.vela").
// The TXT stays plain. Entries carry absolute UTF-16 offsets into the LF-normalised text plus a text quote
// with 16 characters of context, so they can be found again after the TXT was edited outside Vela.
// See docs/VELA-V3-DESIGN.md.
import {textFingerprint} from './document-service.mjs';
import {MB} from './text-utils.mjs';

export const SIDECAR_SUFFIX='.vela';
export const MAX_SIDECAR_CHARS=4*MB;
export const MAX_ENTRIES=50000;
const CONTEXT=16,GROUPS=['marks','blocks','inserts'];
/** Formats the editor can apply. Other types in a sidecar are kept and re-anchored but not rendered. */
export const INLINE_TYPES=Object.freeze(['strong','emphasis']);
/** Inline formats that carry a value: `ruby` (the reading) and `style` (a named style ID). */
export const VALUE_TYPES=Object.freeze(['ruby','style']);
export const MAX_RUBY=64;
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

// ---- Records in .vela (richText.documents, since 0.9.8) ----
// A work's .vela keeps the formats of its TXT files under richText.documents["卷一/正文.txt"]. Each entry is
// anchored to a line: `at` is [line, from, to] (1-based line, UTF-16 columns), [line, from, endLine, to] when it
// spans lines, or [line] for paragraph formats and illustrations (after that line). `hash` identifies the line, so
// unchanged lines are found again wherever they moved; `quote` (marks) and `head` (the line's first characters)
// verify the place. `prefix`/`suffix` are written only where the quote occurs more than once in its line.

const LINE_CONTEXT=8,HEAD=12;
export const MAX_VELA_CHARS=8*MB;
const lineTable=text=>{const lines=text.split('\n'),starts=new Array(lines.length);let at=0;for(let i=0;i<lines.length;i++){starts[i]=at;at+=lines[i].length+1;}return {lines,starts};};
const occurrences=(line,quote)=>{let n=0;for(let at=line.indexOf(quote);at>=0&&n<2;at=line.indexOf(quote,at+1))n++;return n;};
const recordFailure=(path,message)=>Error('格式记录 '+path+' 无效：'+message);

function recordEntry(entry,text,{lines,starts}){
  const {id:_id,type,value,group='marks',from,to,at:_at,hash:_h,quote:_q,prefix:_p,suffix:_s,head:_hd,reason:_r,...rest}=entry;
  const out={type};if(value!==undefined)out.value=value;
  const line=lineOf(starts,Math.min(from,text.length)),content=lines[line];
  if(group==='marks'){
    const end=lineOf(starts,Math.min(to,text.length)),col=from-starts[line],endCol=to-starts[end];
    out.at=end===line?[line+1,col,endCol]:[line+1,col,end+1,endCol];out.hash=lineHash(content);out.quote=text.slice(from,to);
    if(end===line&&occurrences(content,out.quote)>1){out.prefix=content.slice(Math.max(0,col-LINE_CONTEXT),col);out.suffix=content.slice(endCol,endCol+LINE_CONTEXT);}
  }else{out.at=[line+1];out.hash=lineHash(content);if(content)out.head=content.slice(0,HEAD);}
  return Object.assign(out,rest);
}
/** The record for `text` from placed entries, keeping fields of `previous` that Vela does not manage. */
export function buildRecord(text,entries,review=[],previous={}){
  const table=lineTable(text),groups=Object.fromEntries(GROUPS.map(group=>[group,[]]));
  for(const entry of [...entries].sort((a,b)=>a.from-b.from||a.to-b.to))groups[entry.group||'marks'].push(recordEntry(entry,text,table));
  const {marks:_m,blocks:_b,inserts:_i,review:_r,text:_x,...rest}=previous||{};
  const record={text:{length:text.length,hash:textFingerprint(text),lines:table.lines.length},...rest};
  for(const group of GROUPS)if(groups[group].length)record[group]=groups[group];
  if(review.length)record.review=review.map(({from:_f,to:_t,id:_id,...entry})=>entry);
  return record;
}
export const recordEmpty=record=>!record||GROUPS.every(group=>!record[group]?.length)&&!record.review?.length;

function validRecordEntry(entry,group,path,review=false){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw recordFailure(path,group+' 中有无效条目。');
  if(typeof entry.type!=='string'||!/^[a-z][\w-]{0,31}$/.test(entry.type))throw recordFailure(path,'条目类型无效。');
  for(const key of ['quote','prefix','suffix','head','hash','reason'])if(entry[key]!==undefined&&typeof entry[key]!=='string')throw recordFailure(path,key+' 必须是文字。');
  if(review)return;
  const at=entry.at,sizes=group==='marks'?[3,4]:[1];
  if(!Array.isArray(at)||!sizes.includes(at.length)||!at.every(value=>Number.isInteger(value)&&value>=0)||at[0]<1||at.length===4&&at[2]<at[0]||at.length===3&&at[2]<at[1])throw recordFailure(path,'条目位置无效。');
}
/** Validates richText.documents[path]; unknown fields and entry types are kept. */
export function validateRecord(record,path){
  if(!record||typeof record!=='object'||Array.isArray(record))throw recordFailure(path,'必须是对象。');
  const text=record.text;if(!text||typeof text!=='object'||!Number.isInteger(text.length)||text.length<0||typeof text.hash!=='string'||text.lines!==undefined&&(!Number.isInteger(text.lines)||text.lines<1))throw recordFailure(path,'text 摘要无效。');
  let count=0;
  for(const group of GROUPS){if(record[group]===undefined)continue;if(!Array.isArray(record[group]))throw recordFailure(path,group+' 必须是数组。');for(const entry of record[group])validRecordEntry(entry,group,path);count+=record[group].length;}
  if(record.review!==undefined){if(!Array.isArray(record.review))throw recordFailure(path,'review 必须是数组。');for(const entry of record.review){if(!GROUPS.includes(entry?.group))throw recordFailure(path,'待确认条目缺少 group。');validRecordEntry(entry,entry.group,path,true);}count+=record.review.length;}
  if(count>MAX_ENTRIES)throw recordFailure(path,'最多 '+MAX_ENTRIES+' 条。');
  return record;
}

/**
 * Places the entries of a record in `text`. Lines are found by their hash; an edited line is located between the
 * nearest found lines and its formats by their quote. Entries that cannot be placed safely go to `review` with a
 * reason, never to a guessed place. `moved` counts entries placed by searching inside edited lines.
 */
export function resolveRecord(text,record){
  const {lines,starts}=lineTable(text),entries=[],review=(record.review||[]).map(entry=>({...entry,id:newEntryId()}));let moved=0;
  const all=GROUPS.flatMap(group=>(record[group]||[]).map(entry=>({...entry,group,id:newEntryId()})));
  const exact=record.text.length===text.length&&record.text.hash===textFingerprint(text);
  const lineEnd=line=>starts[line]+lines[line].length;
  const finish=()=>{entries.sort((a,b)=>a.from-b.from||a.to-b.to);return {entries,review,exact,moved};};
  // Offsets of an entry on new line `line` with the stored columns; null when the stored text is not there.
  const place=(entry,line)=>{
    if(line<0||line>=lines.length)return null;
    if(entry.group==='blocks')return {from:starts[line],to:lineEnd(line)};
    if(entry.group==='inserts')return {from:lineEnd(line),to:lineEnd(line)};
    const at=entry.at,endLine=at.length===3?line:line+at[2]-at[0];if(endLine>=lines.length)return null;
    const from=starts[line]+at[1],to=(at.length===3?starts[line]:starts[endLine])+at.at(-1);
    if(at[1]>lines[line].length||to<from||to>text.length||entry.quote!==undefined&&text.slice(from,to)!==entry.quote)return null;
    return {from,to};
  };
  const done=(entry,placed)=>entries.push({...entry,...placed});
  const fail=entry=>review.push({...entry,reason:entry.group==='marks'&&entry.quote?'找不到原文“'+entry.quote.slice(0,24)+'”':'找不到所在段落“'+(entry.head||'').slice(0,12)+'”'});
  if(exact){for(const entry of all){const placed=place(entry,entry.at[0]-1);if(placed)done(entry,placed);else fail(entry);}return finish();}

  const byHash=new Map();lines.forEach((line,i)=>{const hash=lineHash(line),list=byHash.get(hash);if(list)list.push(i);else byHash.set(hash,[i]);});
  // Lines whose text is unique on both sides anchor everything else.
  const anchors=new Map(),pending=[];
  for(const entry of all){
    const old=entry.at[0]-1,found=entry.hash?byHash.get(entry.hash):null;
    if(anchors.has(old)){const placed=place(entry,anchors.get(old));if(placed){done(entry,placed);continue;}}
    if(found?.length===1){const placed=place(entry,found[0]);if(placed){done(entry,placed);anchors.set(old,found[0]);continue;}}
    pending.push(entry);
  }
  const oldCount=record.text.lines||Math.max(1,...all.map(entry=>entry.at.length===4?entry.at[2]:entry.at[0]));
  const sorted=[[-1,-1],...[...anchors].sort((a,b)=>a[0]-b[0]),[oldCount,lines.length]];
  const around=old=>{let before=sorted[0],after=sorted.at(-1);for(const pair of sorted){if(pair[0]<old&&pair[0]>=before[0])before=pair;if(pair[0]>old&&pair[0]<after[0])after=pair;}return {before,after};};
  const score=(line,col,entry)=>common(line.slice(Math.max(0,col-LINE_CONTEXT),col),entry.prefix||'',true)+common(line.slice(col+entry.quote.length,col+entry.quote.length+LINE_CONTEXT),entry.suffix||'',false);
  // The quote inside one line: unique there, or the one whose context matches clearly better.
  const inLine=(entry,line)=>{
    const content=lines[line],hits=[];for(let at=content.indexOf(entry.quote);at>=0&&hits.length<200;at=content.indexOf(entry.quote,at+1))hits.push(at);
    if(hits.length===1)return hits[0];if(!hits.length||!entry.prefix&&!entry.suffix)return null;
    const scored=hits.map(col=>({col,score:score(content,col,entry)})).sort((a,b)=>b.score-a.score);
    return scored[0].score>0&&scored[0].score>scored[1].score?scored[0].col:null;
  };
  const similar=(entry,line)=>!entry.head||common(lines[line],entry.head,false)>=Math.min(entry.head.length,4);
  for(const entry of pending){
    const old=entry.at[0]-1,{before,after}=around(old),ordered=after[1]>before[1],sameGap=ordered&&after[1]-before[1]===after[0]-before[0];
    const candidates=(entry.hash&&byHash.get(entry.hash)||[]).filter(line=>!ordered||line>before[1]&&line<after[1]);
    let placed=null;
    // Repeated lines (such as “——完——” after every chapter): the copy between the neighbouring anchors.
    if(candidates.length){const expected=before[1]+old-before[0],line=sameGap&&candidates.includes(expected)?expected:candidates.length===1?candidates[0]:null;if(line!==null)placed=place(entry,line);}
    // An edited line keeps its position between unchanged neighbours when no lines were added or removed there.
    if(!placed&&sameGap){
      const line=before[1]+old-before[0];
      if(entry.group!=='marks'){if(similar(entry,line)){placed=place(entry,line);if(placed)moved++;}}
      else if(entry.at.length===3&&entry.quote){const col=inLine(entry,line);if(col!==null){placed={from:starts[line]+col,to:starts[line]+col+entry.quote.length};moved++;}}
    }
    // Otherwise search the stretch between the neighbours, accepting only an unambiguous hit.
    if(!placed&&entry.group==='marks'&&entry.quote){
      const from=ordered&&before[1]>=0?starts[before[1]+1]??text.length:0,to=ordered&&after[1]<lines.length?starts[after[1]]:text.length;
      const hint=starts[Math.min(lines.length-1,Math.max(0,before[1]+old-before[0]))]+entry.at[1];
      const at=from<=to?findQuote(text,{quote:entry.quote,prefix:entry.prefix||'',suffix:entry.suffix||''},hint,{from,to}):null;
      if(at!==null){placed={from:at,to:at+entry.quote.length};moved++;}
    }
    if(!placed&&entry.group!=='marks'&&entry.head&&entry.head.length>=4){
      const first=ordered?before[1]+1:0,last=ordered?after[1]-1:lines.length-1,hits=[];for(let line=first;line<=last&&hits.length<2;line++)if(lines[line].startsWith(entry.head))hits.push(line);
      if(hits.length===1){placed=place(entry,hits[0]);if(placed)moved++;}
    }
    if(placed)done(entry,placed);else fail(entry);
  }
  return finish();
}

/** A legacy sidecar (0.9.7, `正文.txt.vela`) as a record, so its formats open and are saved into .vela. */
export function sidecarRecord(text,sidecar){const {entries,review}=resolveSidecar(text,sidecar);return {record:buildRecord(text,entries,review),entries,review};}

// ---- Reading and export ----

/**
 * Splits text[from, to) into runs, each with the inline formats active on all of it: `strong`, `emphasis` and
 * `style:<id>`. Ruby is handled by inlineSegments. Joined runs equal the text.
 */
export function inlineRuns(text,from,to,marks){
  const key=mark=>mark.type==='style'?'style:'+mark.value:mark.type;
  const active=marks.filter(mark=>mark.group==='marks'&&(INLINE_TYPES.includes(mark.type)||mark.type==='style'&&typeof mark.value==='string')&&mark.from<to&&mark.to>from);
  if(!active.length)return to>from?[{text:text.slice(from,to),types:[]}]:[];
  const points=[...new Set([from,to,...active.flatMap(mark=>[mark.from,mark.to]).filter(at=>at>from&&at<to)])].sort((a,b)=>a-b),runs=[];
  for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1];runs.push({text:text.slice(start,end),types:[...new Set(active.filter(mark=>mark.from<=start&&mark.to>=end).map(key))].sort()});}
  return runs;
}
/**
 * Runs of text[from, to) grouped under ruby: plain items are runs, ruby items are {ruby, runs} covering the base
 * text. Overlapping ruby entries keep the earlier one. Joined text equals text[from, to).
 */
export function inlineSegments(text,from,to,marks){
  const rubies=marks.filter(mark=>mark.group==='marks'&&mark.type==='ruby'&&typeof mark.value==='string'&&mark.value&&mark.from>=from&&mark.to<=to&&mark.to>mark.from).sort((a,b)=>a.from-b.from),items=[];let at=from;
  for(const ruby of rubies){if(ruby.from<at)continue;items.push(...inlineRuns(text,at,ruby.from,marks));items.push({ruby:ruby.value,runs:inlineRuns(text,ruby.from,ruby.to,marks)});at=ruby.to;}
  items.push(...inlineRuns(text,at,to,marks));return items;
}
/** Line start → alignment value for paragraph alignment entries. */
export const alignedLines=entries=>new Map(entries.filter(entry=>entry.group==='blocks'&&entry.type==='align'&&ALIGN_VALUES.includes(entry.value)).map(entry=>[entry.from,entry.value]));
/** Line start → named style ID for paragraph styles. */
export const styledLines=entries=>new Map(entries.filter(entry=>entry.group==='blocks'&&entry.type==='style'&&typeof entry.value==='string').map(entry=>[entry.from,entry.value]));
/** Line end → images inserted after that line, in order. */
export function imagesByLine(text,entries){
  const map=new Map();
  for(const entry of entries.filter(entry=>entry.group==='inserts'&&entry.type==='image'&&typeof entry.src==='string').sort((a,b)=>a.from-b.from)){
    const end=text.indexOf('\n',Math.min(entry.from,text.length)),at=end<0?text.length:end;if(!map.has(at))map.set(at,[]);map.get(at).push(entry);
  }
  return map;
}
/** Relative image path inside the workspace; no absolute, parent or URL paths. */
export function imagePath(value){
  const path=String(value||'').trim().replace(/\\/g,'/');
  if(!path||path.startsWith('/')||/^[a-z][\w+.-]*:/i.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x1f]/.test(path))throw Error('请填写工作区内的相对路径，例如 插图/雪夜.png。');
  if(!/\.(png|jpe?g|gif|webp)$/i.test(path))throw Error('插图须为 PNG、JPEG、GIF 或 WebP 图片。');
  return path;
}
