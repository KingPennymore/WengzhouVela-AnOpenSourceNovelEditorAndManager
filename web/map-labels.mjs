const halos=new Map();
export function labelHalo(color){
 if(halos.has(color))return halos.get(color);
 let channels;if(/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color))channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 else if(/^#[\da-f]{3}$/i.test(color))channels=[1,2,3].map(i=>parseInt(color[i]+color[i],16));
 else channels=String(color).match(/[\d.]+/g)?.slice(0,3).map(Number)||[38,59,52];
 const linear=channels.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}),halo=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722>.179?'#101010':'#ffffff';
 if(halos.size>=64)halos.clear();halos.set(color,halo);return halo;
}
export function drawMapLabel(ctx,text,x,y,{color='#263b34',scale=1,maxWidth}={}){
 if(!text)return;ctx.save();ctx.strokeStyle=labelHalo(color);ctx.lineWidth=3/scale;ctx.lineJoin='round';ctx.fillStyle=color;
 const args=maxWidth===undefined?[text,x,y]:[text,x,y,maxWidth];ctx.strokeText(...args);ctx.fillText(...args);ctx.restore();
}
export const svgLabelStyle=color=>`fill="${color}" stroke="${labelHalo(color)}" stroke-width="3" stroke-linejoin="round" paint-order="stroke fill"`;
