import test from 'node:test';
import assert from 'node:assert/strict';
import {NounIndex,extractNouns} from '../web/noun-index.mjs';
test('正文候选识别人名、虚构地名，并滤掉常用词和句子',()=>{const index=new NounIndex();index.put(1,'林舟推开驾驶舱的门，望向星澜值守的灯塔。周衡望着青岚港。星澜说话。林舟停在北站检查站外。');const words=index.candidates().map(v=>v.label);for(const name of ['林舟','星澜','周衡','青岚港'])assert.ok(words.includes(name),name);for(const word of ['自己','我们','灯塔','星澜值守','推开','驾驶舱的门'])assert.ok(!words.includes(word),word);});
test('删除和替换区块清除旧候选，保留其他区块并支持重新插入',()=>{const index=new NounIndex();index.put(1,'林舟说道。');index.put(2,'星澜回答。');index.remove(1);assert.deepEqual(index.candidates().map(v=>v.label),['星澜']);index.put(2,'我们已经知道。');assert.equal(index.candidates().length,0);index.put(3,'林舟说道。');assert.equal(index.candidates()[0].label,'林舟');});
test('区块重叠只计入核心区间，候选与内存条目有界',()=>{assert.equal(extractNouns('林舟说道。青岚港。',5,9).some(([word])=>word==='林舟'),false);const index=new NounIndex();for(let i=0;i<400;i++)index.put(i,'林舟说道。'.repeat(800));assert.ok(index.candidates().length<=4096);assert.ok(index.terms.size<=30000);for(let i=0;i<400;i++)index.remove(i);assert.equal(index.terms.size,0);});
