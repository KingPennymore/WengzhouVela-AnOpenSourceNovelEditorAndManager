import test from 'node:test';
import assert from 'node:assert/strict';
import {NounIndex,extractNouns} from '../web/noun-index.mjs';
test('缺少 Intl.Segmenter 时仍提供本地上下文候选',async()=>{
  const original=Intl.Segmenter;
  try{Intl.Segmenter=undefined;const {NounIndex:Fallback}=await import('../web/noun-index.mjs?without-segmenter');const index=new Fallback();index.put(1,'欧阳若水说道。旅人抵达青岚港时，天还没亮。');assert.ok(index.candidates().some(c=>c.label==='欧阳若水'));assert.ok(index.candidates().some(c=>c.label==='青岚港'));}
  finally{Intl.Segmenter=original;}
});
test('正文候选识别人名、虚构地名，并滤掉常用词和句子',()=>{const index=new NounIndex();index.put(1,'林舟推开驾驶舱的门，望向星澜值守的灯塔。周衡望着青岚港。星澜说话。林舟停在北站检查站外。');const words=index.candidates().map(v=>v.label);for(const name of ['林舟','星澜','周衡','青岚港'])assert.ok(words.includes(name),name);for(const word of ['自己','我们','灯塔','星澜值守','推开','驾驶舱的门'])assert.ok(!words.includes(word),word);});
test('删除和替换区块清除旧候选，保留其他区块并支持重新插入',()=>{const index=new NounIndex();index.put(1,'林舟说道。');index.put(2,'星澜回答。');index.remove(1);assert.deepEqual(index.candidates().map(v=>v.label),['星澜']);index.put(2,'我们已经知道。');assert.equal(index.candidates().length,0);index.put(3,'林舟说道。');assert.equal(index.candidates()[0].label,'林舟');});
test('区块重叠只计入核心区间，候选与内存条目有界',()=>{assert.equal(extractNouns('林舟说道。青岚港。',5,9).some(([word])=>word==='林舟'),false);const index=new NounIndex();for(let i=0;i<400;i++)index.put(i,'林舟说道。'.repeat(800));assert.ok(index.candidates().length<=4096);assert.ok(index.terms.size<=30000);for(let i=0;i<400;i++)index.remove(i);assert.equal(index.terms.size,0);});
test('复姓、含常用字的人名、昵称及音译姓名不依赖词典切分',()=>{
  const index=new NounIndex();index.put(1,'欧阳若水说道。李不言把信收好。何有光没有说话。林向晚望向窗外。小满挥手。艾莉娅·维斯回答。');
  const words=index.candidates().map(v=>v.label);
  for(const name of ['欧阳若水','李不言','何有光','林向晚','小满','艾莉娅·维斯'])assert.ok(words.includes(name),name);
  for(const fragment of ['欧阳','若水','艾莉娅','维斯','李不'])assert.ok(!words.includes(fragment),fragment);
});
test('只出现一次但有强上下文的专名进入候选，后续副词不进入姓名',()=>{
  const index=new NounIndex();index.put(1,'顾知遥忽然俯身拾起铜扣。旅人抵达栖鹤群岛时，船已靠岸。她加入沉星书院之后，便很少回家。');
  const words=index.candidates().map(v=>v.label);
  for(const name of ['顾知遥','栖鹤群岛','沉星书院'])assert.ok(words.includes(name),name);
  assert.ok(!words.some(w=>w.includes('忽然')||w.includes('抵达')||w.includes('之后')));
});
test('跨区块实体只计算一次，删除所有区块释放词项与缓存',()=>{
  const text='普通段落。'.repeat(20)+'欧阳澄秋说道。',at=text.indexOf('欧阳'),index=new NounIndex();
  index.put(1,text.slice(0,at+2+32),0,at+2);index.put(2,text.slice(at+2-32),32,text.length-at-2+32);
  assert.equal(index.candidates().find(v=>v.label==='欧阳澄秋')?.count,1);
  index.remove(1);index.remove(2);assert.deepEqual(index.candidates(),[]);assert.equal(index.blocks.size,0);assert.equal(index.terms.size,0);
});
test('邻接证据与强证据在替换后撤销，弱片段不会残留',()=>{
  const index=new NounIndex();index.put(1,'慕容初晴说道。');index.put(2,'慕容初晴回答。');
  assert.equal(index.candidates().find(v=>v.label==='慕容初晴').count,2);
  index.put(1,'我们明天继续。');assert.equal(index.candidates().find(v=>v.label==='慕容初晴').count,1);
  index.put(2,'他们已经走了。');assert.deepEqual(index.candidates(),[]);
});
test('反复出现的音译名按最长字串提供，并补全固定尾字、去掉“某某人”',()=>{
  const index=new NounIndex();index.put(1,'萨伦德尔推开门。萨伦德尔的信放在桌上。他们从维斯塔兰出发，维斯塔兰人都认识他。科尔瓦斯尾的商人在等。科尔瓦斯尾很远。科尔瓦斯尾下雪了。');
  const words=index.candidates().map(v=>v.label);
  for(const name of ['萨伦德尔','维斯塔兰','科尔瓦斯尾'])assert.ok(words.includes(name),name);
  for(const word of ['维斯塔兰人','科尔瓦斯','伦德尔'])assert.ok(!words.includes(word),word);
});
test('日常名词、带助词的短语和半句不进入候选',()=>{
  const index=new NounIndex();index.put(1,'他在小溪边捡起铁锤，安静地坐在马车上，喘息之机很短。他在小溪边又捡起铁锤，安静地看着远方。驶向尚未命名的岛屿。');
  const words=index.candidates().map(v=>v.label);
  for(const word of ['小溪边','安静地','喘息之机','小溪','马车','尚未命名'])assert.ok(!words.includes(word),word);
});
test('多种间隔号、紧邻地名后缀与句尾虚字',()=>{
  const index=new NounIndex();index.put(1,'杨娜⋅厄里克西侬点点头。河水从布伦斯湖发源，向东流去。英格瓦点点头。英格瓦说道。白阿客不愿意。白阿客说道。');
  const words=index.candidates().map(v=>v.label);
  for(const name of ['杨娜⋅厄里克西侬','布伦斯湖','英格瓦','白阿客'])assert.ok(words.includes(name),name);
  for(const word of ['英格瓦点','白阿客不','厄里克西'])assert.ok(!words.includes(word),word);
});
