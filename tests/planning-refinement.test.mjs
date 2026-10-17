import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {guide} from '../web/guide.mjs';
import {guideIconSvg,guideIconImage} from '../web/guide-icons.mjs';
import {iconNames} from '../web/icons.mjs';
import {outlineNodeSize} from '../web/outline-card.mjs';
test('guide embeds maintained icon assets and rejects unrelated image addresses',()=>{const names=[...new Set([...guide.matchAll(/vela-guide-icons\/([\w-]+)\.svg/g)].map(m=>m[1]))];assert.ok(names.length>=40);assert.equal(readdirSync('docs/vela-guide-icons').length,names.length);for(const n of names){assert.ok(iconNames.includes(n));assert.equal(readFileSync('docs/vela-guide-icons/'+n+'.svg','utf8'),guideIconSvg(n)+'\n');assert.match(guideIconImage('vela-guide-icons/'+n+'.svg','图标',s=>s),/^<img .*data:image\/svg\+xml/);}assert.equal(guideIconImage('https://other.test/unknown.svg','',s=>s),null);assert.equal(guideIconSvg('unknown'),null);});
test('outline cards allocate separate capped sections while retaining their original content',()=>{const plain={title:'标题',summary:'概要',detail:'详情'},long={title:'标题'.repeat(100),summary:'概要'.repeat(200),detail:'详情'.repeat(1000)},copy=structuredClone(long);assert.ok(outlineNodeSize(long).height>outlineNodeSize(plain).height);assert.ok(outlineNodeSize(long).height<300);assert.deepEqual(long,copy);});
