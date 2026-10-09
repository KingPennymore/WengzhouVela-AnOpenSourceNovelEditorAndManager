import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeCorpus} from '../scripts/noun-corpus.mjs';

test('两百万汉字基准在生成阶段保存可验证的特殊名词位置',()=>{
  const {text,gold}=makeCorpus(20261011,2_000_000,'han');
  assert.equal([...text.matchAll(/\p{Script=Han}/gu)].length,2_000_000);
  assert.equal(gold.hanLength,2_000_000);assert.equal(gold.length,text.length);
  assert.equal(gold.sha256,createHash('sha256').update(text).digest('hex'));
  assert.equal(gold.entities.length,1000);assert.equal(new Set(gold.entities.map(e=>e.name)).size,1000);
  assert.equal(gold.entities.filter(e=>e.occurrences.length===1).length,200);
  for(const entity of gold.entities)for(const offset of entity.occurrences)assert.equal(text.slice(offset,offset+entity.name.length),entity.name);
});
test('固定种子可复现且不同种子会改变文章',()=>{
  const a=makeCorpus(17,40000),b=makeCorpus(17,40000),c=makeCorpus(18,40000);
  assert.equal(a.text.length,40000);assert.equal(a.gold.sha256,b.gold.sha256);assert.notEqual(a.gold.sha256,c.gold.sha256);
});
