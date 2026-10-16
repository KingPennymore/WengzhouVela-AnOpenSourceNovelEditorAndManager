import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSidecar,sidecarText,readSidecar,resolveSidecar,matchLines,findQuote,sidecarTarget} from '../web/rich-text.mjs';
import {parseVela,velaText} from '../web/vela.mjs';

const novel='第一章 风起\n\n　　林舟冷笑一声，转身离去。\n\n　　苏晚心中暗道不好。\n\n——完——';
const at=(text,quote,from=0)=>{const start=text.indexOf(quote,from);assert.ok(start>=0,quote);return {from:start,to:start+quote.length};};
const sample=()=>[{group:'marks',type:'strong',...at(novel,'林舟冷笑')},{group:'marks',type:'emphasis',...at(novel,'不好')},{group:'blocks',type:'align',value:'center',...at(novel,'——完——')}];
const roundTrip=(text,entries,previous)=>readSidecar(sidecarText(buildSidecar('正文.txt',text,entries,[],previous)));
const placed=(text,entries)=>entries.map(entry=>[entry.type,text.slice(entry.from,entry.to)]);

test('a sidecar round-trips and places entries by offset when the text is unchanged',()=>{
  const sidecar=roundTrip(novel,sample());
  assert.equal(sidecar.version,3);assert.equal(sidecar.kind,'document');assert.equal(sidecar.target,'正文.txt');
  const result=resolveSidecar(novel,sidecar);
  assert.equal(result.exact,true);assert.deepEqual(result.review,[]);
  assert.deepEqual(placed(novel,result.entries),[['strong','林舟冷笑'],['emphasis','不好'],['align','——完——']]);
  assert.deepEqual(sidecar.marks[0],{id:sidecar.marks[0].id,type:'strong',at:[novel.indexOf('林舟冷笑'),novel.indexOf('林舟冷笑')+4],quote:'林舟冷笑',prefix:novel.slice(novel.indexOf('林舟冷笑')-16<0?0:novel.indexOf('林舟冷笑')-16,novel.indexOf('林舟冷笑')),suffix:'一声，转身离去。\n\n　　苏晚心中'});
});

test('the file has one entry per line and keeps fields and entry types Vela does not know',()=>{
  const text=sidecarText(buildSidecar('正文.txt',novel,[...sample(),{group:'inserts',type:'image',src:'插图/1.png',from:novel.indexOf('——完——'),to:novel.indexOf('——完——')},{group:'marks',type:'future-mark',...at(novel,'转身')}],[],{publisher:{note:'keep'}}));
  const lines=text.split('\n');
  assert.ok(lines.some(line=>line.startsWith('    {"id":')&&line.includes('"type":"strong"')));
  assert.equal(lines.filter(line=>line.startsWith('    {')).length,5);
  const sidecar=readSidecar(text);assert.deepEqual(sidecar.publisher,{note:'keep'});assert.equal(sidecar.inserts[0].src,'插图/1.png');
  const edited='序\n'+novel,result=resolveSidecar(edited,sidecar);
  assert.deepEqual(result.entries.map(entry=>entry.type).sort(),['align','emphasis','future-mark','image','strong']);
  assert.equal(result.entries.find(entry=>entry.type==='image').from,edited.indexOf('——完——'));
});

test('after paragraphs are added or removed outside Vela, entries follow their lines exactly',()=>{
  const sidecar=roundTrip(novel,sample());
  const edited=novel.replace('第一章 风起\n','第一章 风起\n\n　　新加的一段。\n').replace('\n\n　　苏晚心中暗道不好。','\n\n　　插入。\n\n　　苏晚心中暗道不好。');
  const result=resolveSidecar(edited,sidecar);
  assert.equal(result.exact,false);assert.equal(result.moved,0);assert.deepEqual(result.review,[]);
  assert.deepEqual(placed(edited,result.entries),[['strong','林舟冷笑'],['emphasis','不好'],['align','——完——']]);
});

test('an entry whose text was rewritten goes to review with the reason; nothing is dropped',()=>{
  const sidecar=roundTrip(novel,sample()),edited=novel.replace('林舟冷笑','林舟淡笑');
  const result=resolveSidecar(edited,sidecar);
  assert.deepEqual(placed(edited,result.entries),[['emphasis','不好'],['align','——完——']]);
  assert.equal(result.review.length,1);assert.equal(result.review[0].type,'strong');assert.match(result.review[0].reason,/林舟冷笑/);
  // Review entries survive the next save and the next load.
  const again=resolveSidecar(edited,readSidecar(sidecarText(buildSidecar('正文.txt',edited,result.entries,result.review))));
  assert.equal(again.review.length,1);assert.equal(again.entries.length,2);
});

test('short quotes that appear several times are never guessed',()=>{
  const text='他说：“好。”\n她说：“好。”\n',entries=[{group:'marks',type:'strong',...at(text,'好',5)}];
  const sidecar=roundTrip(text,entries),edited=text.replace('他说：','他低声说：').replace('她说：','她也低声说：');
  const result=resolveSidecar(edited,sidecar);
  assert.equal(result.entries.length+result.review.length,1);
  for(const entry of result.entries)assert.equal(entry.from,edited.indexOf('好',edited.indexOf('她')));
  assert.equal(findQuote('好 好',{quote:'好',prefix:'',suffix:''}),null);
});

test('line matching keeps order and leaves a moved chapter to quote matching',()=>{
  const map=matchLines(['a','b','c','d','e'],['a','x','d','e','b','c']);
  assert.deepEqual([...map],[0,-1,-1,2,3]);
  assert.deepEqual([...matchLines(['','a','','b',''],['','a','','','b',''])],[0,1,2,4,5]);
});

test('sidecar paths and .vela parsing for version 3',()=>{
  assert.equal(sidecarTarget('卷一/正文.txt.vela'),'卷一/正文.txt');assert.equal(sidecarTarget('.vela'),null);assert.equal(sidecarTarget('笔记.md.vela'),null);
  const workspace=parseVela(JSON.stringify({version:3,kind:'workspace',id:'w',project:{name:'航程'},richText:{enabled:true}}));
  assert.equal(workspace.richText.enabled,true);
  assert.throws(()=>parseVela(JSON.stringify({version:2,kind:'workspace',id:'w',project:{name:'航程'},richText:{enabled:true}})),/version: 3/);
  assert.throws(()=>parseVela(JSON.stringify({version:4,kind:'workspace',id:'w',project:{name:'航程'}})),/version: 2 或 3/);
  const document=parseVela(sidecarText(buildSidecar('正文.txt',novel,sample())));
  assert.equal(document.kind,'document');assert.equal(velaText(document),sidecarText(document));
  assert.throws(()=>readSidecar('{"version":3,"kind":"document","target":"a.txt","text":{"length":3,"hash":"0"},"marks":[{"id":"x","type":"strong","at":[2,9]}]}'),/位置无效/);
  assert.throws(()=>readSidecar('{"version":2,"kind":"document","target":"a.txt","text":{"length":0,"hash":"0"}}'),/version: 3/);
});

// The re-anchoring experiment from docs/VELA-V3-DESIGN.md as a regression check: no entry may land on the wrong text.
test('external edits of a long, repetitive novel never misplace an entry',()=>{
  let seed=7;const rand=()=>{seed=seed+0x6D2B79F5>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},pick=list=>list[Math.floor(rand()*list.length)];
  const words=['他','她','说道','林舟','苏晚','只见','风雪','长剑','一声','冷笑','山门','师兄','不知','何时','已经','站在','门外','“','”','，','。','！','？','微微一怔','缓缓','抬起头','看着','远处','灯火','心中','暗道','不好','的','了','是','在','这','那','却','又','便','也'];
  const para=()=>'　　'+Array.from({length:20+Math.floor(rand()*60)},()=>pick(words)).join('');
  const lines=[];for(let c=1;c<=12;c++){lines.push('第'+c+'章 风雪夜归人'+c);for(let p=0;p<25;p++)lines.push(para());}
  const text=lines.join('\n'),entries=[];
  for(let i=0;i<600;i++){const length=rand()<0.6?1+Math.floor(rand()*4):5+Math.floor(rand()*20),from=Math.floor(rand()*(text.length-length));if(!text.slice(from,from+length).includes('\n'))entries.push({group:'marks',type:'strong',from,to:from+length});}
  const sidecar=roundTrip(text,entries),starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);
  const scenarios={
    insert:[{from:starts[1],to:starts[1],insert:para()+'\n'+para()+'\n'}],
    remove:[{from:starts[150],to:starts[151],insert:''}],
    typos:Array.from({length:30},()=>{const from=Math.floor(rand()*text.length);return text[from]==='\n'?null:{from,to:from+1,insert:'某'};}).filter(Boolean).filter((e,i,all)=>all.findIndex(o=>o.from===e.from)===i),
    appended:starts.slice(1).map(s=>({from:s-1,to:s-1,insert:'他想。'})),
    moveChapter:[{from:starts[52],to:starts[78],insert:''},{from:text.length,to:text.length,insert:'\n'+text.slice(starts[52],starts[78]-1)}],
  };
  for(const [name,edits] of Object.entries(scenarios)){
    let edited=text;for(const e of [...edits].sort((a,b)=>b.from-a.from))edited=edited.slice(0,e.from)+e.insert+edited.slice(e.to);
    const result=resolveSidecar(edited,sidecar);let wrong=0;
    // Where the entry truly is now: shifted by edits before it; null when an edit touched it.
    const truth=([from,to])=>{for(const e of [...edits].sort((a,b)=>b.from-a.from)){const shift=e.insert.length-(e.to-e.from);if(e.to<=from){from+=shift;to+=shift;}else if(e.from<to&&e.to>from)return null;}return from;};
    for(const entry of result.entries){const original=sidecar.marks.find(item=>item.id===entry.id),expected=truth(original.at);if(edited.slice(entry.from,entry.to)!==original.quote||expected!==null&&name!=='moveChapter'&&entry.from!==expected)wrong++;}
    assert.equal(wrong,0,name);
    assert.equal(result.entries.length+result.review.length,sidecar.marks.length,name);
    assert.ok(result.entries.length>=sidecar.marks.length*0.95,name+' placed '+result.entries.length+' of '+sidecar.marks.length);
  }
});
