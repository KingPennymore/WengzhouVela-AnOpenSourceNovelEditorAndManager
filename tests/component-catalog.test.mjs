import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalog,catalogText,catalogBlocker,catalogStatus} from '../web/component-catalog.mjs';

const entry=(extra={})=>({id:'vela.component.ebook-reader',kind:'plugin',title:'电子书阅读组件',version:'1.1.0',tag:'v0.9.8',name:'Vela-Ebook-Reader-1.1.0.zip',bytes:100,sha256:'a'.repeat(64),...extra});

test('the catalog keeps valid entries as download items and skips malformed ones',()=>{
  const {items,skipped}=parseCatalog(JSON.stringify({format:1,components:[entry(),entry({id:'vela.component.tex',kind:'tex',name:'Vela-TeX-0.1.2.zip',tag:'tex-0.1.2'}),entry({sha256:'x'}),entry({id:'vela.component.ebook-reader',version:'2.0.0'}),entry({id:'evil',name:'../a.zip'})]}));
  assert.deepEqual(items.map(item=>[item.key,item.kind,item.version]),[['plugin.ebook-reader','plugin','1.1.0'],['tex','tex','1.1.0']]);
  assert.equal(skipped,3,'bad hash, duplicate ID and unsafe name');
  assert.throws(()=>parseCatalog('{"format":2,"components":[]}'),/格式不受支持/);assert.throws(()=>parseCatalog('not json'),/JSON/);assert.throws(()=>parseCatalog('x'.repeat(300*1024)),/256 KB/);
});

test('blockers, install states and the generated text',()=>{
  assert.equal(catalogBlocker({minApp:'0.9.9'},{appVersion:'0.9.8'}),'需要文舟 0.9.9 或更新版本');assert.equal(catalogBlocker({minApp:'0.9.8'},{appVersion:'0.9.8-android.1'}),'');
  assert.equal(catalogBlocker({platforms:['windows']},{platform:'android'}),'此平台不可用');
  assert.deepEqual(['','1.0.0','1.1.0','1.2.0'].map(version=>catalogStatus({version:'1.1.0'},version)),['missing','update','current','newer']);
  const text=catalogText([entry(),entry({version:'1.2.0',name:'Vela-Ebook-Reader-1.2.0.zip'}),entry({id:'vela.component.tex',kind:'tex',note:'',minApp:null})],{updated:'2026-10-16T00:00:00Z'});
  const value=JSON.parse(text);assert.deepEqual(value.components.map(item=>[item.id,item.version]),[['vela.component.ebook-reader','1.2.0'],['vela.component.tex','1.1.0']]);
  assert.equal('note' in value.components[1]||'minApp' in value.components[1],false,'empty fields are left out');
});
