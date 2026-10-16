import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecord,resolveRecord,validateRecord,recordEmpty,buildSidecar,sidecarText,readSidecar,sidecarRecord} from '../web/rich-text.mjs';

const novel='第一章 风起\n\n　　林舟冷笑一声，转身离去。\n\n　　苏晚心中暗道不好。\n\n——完——';
const at=(text,quote,from=0)=>{const start=text.indexOf(quote,from);assert.ok(start>=0,quote);return {from:start,to:start+quote.length};};
const sample=()=>[{group:'marks',type:'strong',...at(novel,'林舟冷笑')},{group:'marks',type:'emphasis',...at(novel,'不好')},{group:'blocks',type:'align',value:'center',...at(novel,'——完——')},{group:'inserts',type:'image',src:'插图/1.png',from:novel.length,to:novel.length}];
const roundTrip=(text,entries,review=[])=>validateRecord(JSON.parse(JSON.stringify(buildRecord(text,entries,review))),'正文.txt');
const placed=(text,entries)=>entries.map(entry=>[entry.type,text.slice(entry.from,entry.to)]);

test('a record is anchored to lines and small: no ids, no whole-text line tables, context only when needed',()=>{
  const record=roundTrip(novel,sample());
  assert.deepEqual(record.text,{length:novel.length,hash:record.text.hash,lines:7});
  assert.deepEqual(record.marks[0],{type:'strong',at:[3,2,6],hash:record.marks[0].hash,quote:'林舟冷笑'});
  assert.deepEqual(record.blocks[0],{type:'align',value:'center',at:[7],hash:record.blocks[0].hash,head:'——完——'});
  assert.deepEqual(record.inserts[0],{type:'image',src:'插图/1.png',at:[7],hash:record.blocks[0].hash,head:'——完——'});
  const repeated='　　好，好，好。',twice=roundTrip(repeated,[{group:'marks',type:'strong',from:4,to:5}]);
  assert.deepEqual([twice.marks[0].prefix,twice.marks[0].suffix],['　　好，','，好。']);
  assert.equal(recordEmpty(buildRecord(novel,[])),true);assert.equal(recordEmpty(record),false);
  assert.throws(()=>validateRecord({text:{length:1,hash:'0'},marks:[{type:'strong',at:[0,1,2]}]},'a.txt'),/位置无效/);
});

test('unchanged text places every entry; added and removed paragraphs move entries with their lines',()=>{
  const record=roundTrip(novel,sample());
  let result=resolveRecord(novel,record);assert.equal(result.exact,true);
  assert.deepEqual(placed(novel,result.entries),[['strong','林舟冷笑'],['emphasis','不好'],['align','——完——'],['image','']]);
  assert.ok(result.entries.every(entry=>entry.id));
  const edited=novel.replace('第一章 风起\n','第一章 风起\n\n　　新加的一段。\n').replace('\n\n　　苏晚心中暗道不好。','\n\n　　插入。\n\n　　苏晚心中暗道不好。');
  result=resolveRecord(edited,record);assert.equal(result.exact,false);assert.equal(result.moved,0);assert.deepEqual(result.review,[]);
  assert.deepEqual(placed(edited,result.entries),[['strong','林舟冷笑'],['emphasis','不好'],['align','——完——'],['image','']]);
  assert.equal(result.entries.at(-1).from,edited.length);
});

test('rewritten text goes to review with the reason; review survives the next save',()=>{
  const record=roundTrip(novel,sample()),edited=novel.replace('林舟冷笑','林舟淡笑');
  const result=resolveRecord(edited,record);
  assert.equal(result.review.length,1);assert.match(result.review[0].reason,/林舟冷笑/);
  const again=resolveRecord(edited,roundTrip(edited,result.entries,result.review));
  assert.equal(again.review.length,1);assert.equal(again.entries.length,3);
});

test('a short quote in an edited line is found by its column neighbours, never guessed between lines',()=>{
  const text='他说：“好。”\n她说：“好。”\n',record=roundTrip(text,[{group:'marks',type:'strong',...at(text,'好',5)}]);
  const edited=text.replace('他说：','他低声说：').replace('她说：','她也低声说：'),result=resolveRecord(edited,record);
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].from,edited.indexOf('好',edited.indexOf('她')));
  // With a line added before them the edited lines cannot be matched by position: review, not a guess.
  const shifted='序\n'+edited,other=resolveRecord(shifted,record);
  assert.equal(other.entries.length+other.review.length,1);
  for(const entry of other.entries)assert.equal(entry.from,shifted.indexOf('好',shifted.indexOf('她')));
});

test('a legacy 0.9.7 sidecar converts to a record with the same places',()=>{
  const legacy=readSidecar(sidecarText(buildSidecar('正文.txt',novel,sample())));
  const {record,entries}=sidecarRecord(novel,legacy);
  assert.deepEqual(placed(novel,resolveRecord(novel,validateRecord(record,'正文.txt')).entries),placed(novel,entries));
});

// The re-anchoring experiment from docs/VELA-V3-DESIGN.md, against line-anchored records: no entry may land on the
// wrong text, and the record is a fraction of a 0.9.7 sidecar.
test('external edits of a long, repetitive novel never misplace an entry',()=>{
  let seed=7;const rand=()=>{seed=seed+0x6D2B79F5>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},pick=list=>list[Math.floor(rand()*list.length)];
  const words=['他','她','说道','林舟','苏晚','只见','风雪','长剑','一声','冷笑','山门','师兄','不知','何时','已经','站在','门外','“','”','，','。','！','？','微微一怔','缓缓','抬起头','看着','远处','灯火','心中','暗道','不好','的','了','是','在','这','那','却','又','便','也'];
  const para=()=>'　　'+Array.from({length:20+Math.floor(rand()*60)},()=>pick(words)).join('');
  const lines=[];for(let c=1;c<=12;c++){lines.push('第'+c+'章 风雪夜归人'+c);for(let p=0;p<25;p++)lines.push(para());}
  const text=lines.join('\n'),entries=[];
  for(let i=0;i<600;i++){const length=rand()<0.6?1+Math.floor(rand()*4):5+Math.floor(rand()*20),from=Math.floor(rand()*(text.length-length));if(!text.slice(from,from+length).includes('\n'))entries.push({group:'marks',type:'strong',from,to:from+length});}
  const record=roundTrip(text,entries),starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);
  const legacySize=sidecarText(buildSidecar('正文.txt',text,entries)).length,size=JSON.stringify(record).length;
  assert.ok(size<legacySize*0.7,'record '+size+' vs sidecar '+legacySize);
  const original=resolveRecord(text,record).entries;
  const scenarios={
    insert:[{from:starts[1],to:starts[1],insert:para()+'\n'+para()+'\n'}],
    remove:[{from:starts[150],to:starts[151],insert:''}],
    typos:Array.from({length:30},()=>{const from=Math.floor(rand()*text.length);return text[from]==='\n'?null:{from,to:from+1,insert:'某'};}).filter(Boolean).filter((e,i,all)=>all.findIndex(o=>o.from===e.from)===i),
    appended:starts.slice(1).map(s=>({from:s-1,to:s-1,insert:'他想。'})),
    moveChapter:[{from:starts[52],to:starts[78],insert:''},{from:text.length,to:text.length,insert:'\n'+text.slice(starts[52],starts[78]-1)}],
  };
  for(const [name,edits] of Object.entries(scenarios)){
    let edited=text;for(const e of [...edits].sort((a,b)=>b.from-a.from))edited=edited.slice(0,e.from)+e.insert+edited.slice(e.to);
    const result=resolveRecord(edited,record);let wrong=0;
    const truth=(from,to)=>{for(const e of [...edits].sort((a,b)=>b.from-a.from)){const shift=e.insert.length-(e.to-e.from);if(e.to<=from){from+=shift;to+=shift;}else if(e.from<to&&e.to>from)return null;}return from;};
    const byQuote=result.entries.map(entry=>edited.slice(entry.from,entry.to));
    for(let i=0;i<result.entries.length;i++){
      const entry=result.entries[i],match=original.filter(item=>text.slice(item.from,item.to)===byQuote[i]);
      if(!match.length){wrong++;continue;}
      if(name!=='moveChapter'&&!match.some(item=>{const expected=truth(item.from,item.to);return expected===null||expected===entry.from;}))wrong++;
    }
    assert.equal(wrong,0,name);
    assert.equal(result.entries.length+result.review.length,original.length,name);
    assert.ok(result.entries.length>=original.length*0.95,name+' placed '+result.entries.length+' of '+original.length);
  }
});
