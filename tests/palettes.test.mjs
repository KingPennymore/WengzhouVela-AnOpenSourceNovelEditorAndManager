import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palettes,paletteFor} from '../web/palettes.mjs';
function luminance(hex){const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('五套配色提供完整深浅模式，正文和主要操作颜色具有可读对比度',()=>{
  assert.equal(palettes.length,5);assert.equal(paletteFor('',false).id,'pine');
  for(const palette of palettes)for(const mode of [palette.light,palette.dark]){assert.ok(contrast(mode.text,mode.paper)>=7,palette.name+' 正文');assert.ok(contrast(mode.accent,mode.paper)>=4.5,palette.name+' 操作');assert.ok(contrast(mode.muted,mode.paper)>=4,palette.name+' 状态');}
});
