import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palettes,paletteFor} from '../web/palettes.mjs';
function luminance(hex){const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('五套配色提供完整深浅模式，正文和主要操作颜色具有可读对比度',()=>{
  assert.equal(palettes.length,5);assert.equal(paletteFor('',false).id,'pine');
  for(const palette of palettes)for(const mode of [palette.light,palette.dark]){assert.ok(contrast(mode.text,mode.paper)>=7,palette.name+' 正文');assert.ok(contrast(mode.accent,mode.paper)>=4.5,palette.name+' 操作');assert.ok(contrast(mode.muted,mode.paper)>=4,palette.name+' 状态');}
});

test('rendered palettes keep secondary text and actions readable on stacked tinted surfaces',()=>{
  const mix=(a,b,t)=>'#'+a.slice(1).match(/../g).map((c,i)=>Math.round(parseInt(c,16)*(1-t)+parseInt(b.slice(1+i*2,3+i*2),16)*t).toString(16).padStart(2,'0')).join('');
  for(const p of palettes)for(const dark of [false,true]){const c=paletteFor(p.id,dark).colors,tint=mix(c.paper,c.accent,31/255),surfaces=[c.bg,c.panel,c.paper,c.soft,tint,mix(tint,c.accent,31/255)];for(const key of ['text','muted','accent'])for(const bg of surfaces)assert.ok(contrast(c[key],bg)>=4.5,`${p.id} ${dark} ${key} ${bg}`);}
});
