// Loom: the woven register of the promo (the saga as a tapestry hanging by the hearth).
// A design is drawn at frame coordinates but scaled onto a grid of one pixel per weft pick (PW px across a warp, PH px
// down), snapped to the dye palette — two colours meeting interlock in comb teeth, as hatching does in real tapestry —
// streaked by uneven dye lots (abrash), then enlarged and woven: each pick becomes a ribbed bump of wool.

// Plant dyes on undyed wool, the palette of Överhogdal, Baldishol and Bayeux.
const DYE={
  wool:'#ddcfae',     // undyed ground
  bone:'#efe6d0',     // bleached: snow, claws, letters
  madder:'#a5412d',   // madder red
  rust:'#7a2f22',     // madder on brown
  weld:'#cf9f3e',     // weld yellow
  ochre:'#a77436',    // weld with tannin
  green:'#62724a',    // woad over weld
  moss:'#3f4b31',
  woad:'#43607f',     // woad blue
  sky:'#8ea2b3',      // pale woad
  indigo:'#25324a',
  walnut:'#5b3d2c',   // walnut hulls
  umber:'#3a2a22',
  black:'#1f1b1a',    // iron-black outline wool
  skin:'#d6a685',
};
const DYE_RGB=Object.values(DYE).map(rgbOf);
const PW=6,PH=4;

const WEAVE_TEX=new Map();
// Shading of the cloth itself: warp ribs running down, each pick a bump of twisted wool, picks offset half a row on
// alternate warps; a few stray fibres. Grey values around 1 for a multiply pass.
function weaveTexture(w,h,pw=PW,ph=PH){
  const key=`${w}x${h}/${pw}x${ph}`;if(WEAVE_TEX.has(key))return WEAVE_TEX.get(key);
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),img=g.createImageData(w,h),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const col=Math.floor(x/pw),u=(x%pw+.5)/pw,yo=y+(col%2)*ph/2,row=Math.floor(yo/ph),v=(yo%ph+.5)/ph;
    const across=Math.pow(Math.sin(Math.PI*u),.7),down=Math.pow(Math.sin(Math.PI*v),.9);
    const twist=.07*Math.sin((u*pw*1.1+v*ph*1.6)*2.3+hash(col*31+row)*6),lot=(hash(col*7.3+row*1.9)-.5)*.1;
    const s=clamp(.56+.4*across*(.62+.38*down)+twist+lot,0,1.06),i=(y*w+x)*4;
    d[i]=d[i+1]=d[i+2]=Math.round(Math.min(255,s*262));d[i+3]=255;}
  g.putImageData(img,0,0);
  g.globalCompositeOperation='screen';g.lineCap='round';
  for(let i=0;i<w*h/900;i++){const x=hash(i*1.7)*w,y=hash(i*3.1)*h,a=hash(i*5.3)*TAU,l=3+hash(i*7.9)*9;g.strokeStyle=`rgba(255,255,255,${.05+.08*hash(i)})`;g.lineWidth=.7;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l*.6+2,y+Math.sin(a)*l*.6,x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
  WEAVE_TEX.set(key,c);return c;
}

// Weave whatever draw() paints (in frame coordinates) and leave the cloth on the canvas.
// light: hearth glow from the lower left, flicker 0..1; folds: depth of the hanging folds.
function weave(draw,{seed=0,light=1,flicker=0,folds=1,pw=PW,ph=PH}={}){
  const gw=Math.ceil(W/pw),gh=Math.ceil(H/ph);
  ctx.save();ctx.setTransform(1/pw,0,0,1/ph,0,0);ctx.clearRect(0,0,W,H);draw();ctx.restore();
  const src=ctx.getImageData(0,0,gw,gh),s=src.data,out=new ImageData(gw,gh),o=out.data;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=(y*gw+x)*4,r=s[i],g=s[i+1],b=s[i+2];let b1=1e9,b2=1e9,c1=0,c2=0;
    for(let k=0;k<DYE_RGB.length;k++){const p=DYE_RGB[k],dr=r-p[0],dg=g-p[1],db=b-p[2],e=dr*dr*2+dg*dg*4+db*db*3;if(e<b1){b2=b1;c2=c1;b1=e;c1=k;}else if(e<b2){b2=e;c2=k;}}
    // hatching: where the drawn colour sits between two dyes, alternate picks take the other one
    const t=Math.sqrt(b1)/(Math.sqrt(b1)+Math.sqrt(b2)+1e-6),ci=t>((y%2)?.2:.4)?c2:c1,p=DYE_RGB[ci];
    const lot=1+.075*(noise(y*.11+ci*13.7+seed)-.5)*2+.03*(noise(x*.05+y*.9+ci)-.5)+(hash(x*3.7+y*11.3+seed)-.5)*.05;
    o[i]=p[0]*lot;o[i+1]=p[1]*lot;o[i+2]=p[2]*lot;o[i+3]=255;}
  const small=document.createElement('canvas');small.width=gw;small.height=gh;small.getContext('2d').putImageData(out,0,0);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,gw*pw,gh*ph);ctx.imageSmoothingEnabled=true;
  ctx.globalCompositeOperation='multiply';ctx.drawImage(weaveTexture(W,H,pw,ph),0,0);
  // the hanging's soft folds, then the hearth light raking across from the lower left
  if(folds>0){const g=ctx.createLinearGradient(0,0,W,0);for(let k=0;k<=24;k++){const v=Math.sin(k/24*TAU*3.4+seed)*.5+Math.sin(k/24*TAU*7.1+seed*2)*.2;g.addColorStop(k/24,`rgba(${v>0?'255,255,255':'60,40,30'},${Math.abs(v)*.12*folds})`);}ctx.globalCompositeOperation='soft-light';ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
  ctx.globalCompositeOperation='multiply';const f=1-flicker*.12,lg=ctx.createRadialGradient(W*.12,H*1.05,H*.2,W*.3,H*.7,H*1.7);lg.addColorStop(0,`rgba(255,240,214,${f})`);lg.addColorStop(.5,`rgba(244,226,200,${f})`);lg.addColorStop(1,`rgba(160,128,108,${f})`);ctx.fillStyle=lg;ctx.globalAlpha=light;ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='screen';ctx.globalAlpha=light*.5*f;glow(W*.1,H,H*.9,'#ff9a4a',.22);
  ctx.restore();
}

// ---------------------------------------------------------------- drawing kit for designs (frame coordinates)
// Shapes are smooth closed curves filled flat and edged in dark wool; limbs are thick strokes edged the same way.
const LW=9; // outline: a pick and a half across
function wshape(pts,fill,{line=DYE.black,lw=LW,ten=1}={}){smooth(pts,ten);ctx.fillStyle=fill;ctx.fill();if(line){ctx.strokeStyle=line;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.stroke();}}
function wpoly(pts,fill,{line=DYE.black,lw=LW}={}){path(pts);ctx.fillStyle=fill;ctx.fill();if(line){ctx.strokeStyle=line;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.stroke();}}
// A curve through points, open; drawn as a band of `w` with an outline.
function wcurve(pts,w,fill,{line=DYE.black,lw=LW,cap='round'}={}){
  const trace=()=>{ctx.beginPath();ctx.moveTo(pts[0],pts[1]);if(pts.length===4)ctx.lineTo(pts[2],pts[3]);else{for(let i=2;i<pts.length-2;i+=2){const mx=(pts[i]+pts[i+2])/2,my=(pts[i+1]+pts[i+3])/2;ctx.quadraticCurveTo(pts[i],pts[i+1],mx,my);}ctx.lineTo(pts[pts.length-2],pts[pts.length-1]);}};
  ctx.save();ctx.lineCap=cap;ctx.lineJoin='round';if(line){trace();ctx.strokeStyle=line;ctx.lineWidth=w+lw*2;ctx.stroke();}trace();ctx.strokeStyle=fill;ctx.lineWidth=w;ctx.stroke();ctx.restore();
}
function wline(pts,col,lw=LW){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length-2;i+=2){const mx=(pts[i]+pts[i+2])/2,my=(pts[i+1]+pts[i+3])/2;ctx.quadraticCurveTo(pts[i],pts[i+1],mx,my);}ctx.lineTo(pts[pts.length-2],pts[pts.length-1]);ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();ctx.restore();}
function wdisc(x,y,r,fill,{line=DYE.black,lw=LW}={}){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();if(line){ctx.strokeStyle=line;ctx.lineWidth=lw;ctx.stroke();}}
// The Viking-art joint: a spiral at shoulder and haunch.
function wspiral(x,y,r,col,{turns=1.6,lw=LW,dir=1}={}){ctx.save();ctx.beginPath();for(let a=0;a<=turns*TAU;a+=.08){const k=a/(turns*TAU),rr=r*k;const px=x+Math.cos(a*dir)*rr,py=y+Math.sin(a*dir)*rr;a?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.lineCap='round';ctx.stroke();ctx.restore();}

// Borders: a band of lettering above (as the Bayeux inscriptions run), lozenges below.
function wBorderTop(words,{y=0,h=150,ground=DYE.indigo,letters=DYE.bone,off=0}={}){
  rect(0,y,W,h,DYE.madder);rect(0,y+16,W,h-32,DYE.weld);rect(0,y+26,W,h-52,ground);
  ctx.save();ctx.font=`700 64px ${SERIF}`;ctx.letterSpacing='14px';ctx.fillStyle=letters;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(words,W/2-off,y+h/2+4);ctx.restore();
  for(const x of [70,W-70]){wdisc(x-off*0,y+h/2,20,DYE.madder,{line:DYE.bone,lw:7});}
}
function wBorderBottom({y=H-150,h=150,off=0}={}){
  rect(0,y,W,h,DYE.madder);rect(0,y+10,W,h-20,DYE.indigo);rect(0,y+22,W,h-44,DYE.madder);
  const m=y+h/2,s=56;for(let i=-2;i<W/s/2+3;i++){const x=i*s*2-((off%(s*2))+s*2)%(s*2);
    wpoly([x,m-38,x+s,m,x,m+38,x-s,m],DYE.weld,{line:DYE.indigo,lw:8});wpoly([x,m-16,x+22,m,x,m+16,x-22,m],DYE.indigo,{line:null});
    wpoly([x+s,m-14,x+s+12,m,x+s,m+14,x+s-12,m],DYE.bone,{line:null});}
}
// Ground of the field: strips of earth as the Bayeux ground runs, wavy and of several colours.
function wGround(y,{off=0,cols=[DYE.green,DYE.ochre,DYE.moss]}={}){
  cols.forEach((c,i)=>{const p=[];for(let x=-60;x<=W+60;x+=60)p.push(x,y+i*26+Math.sin((x+off)/130+i*1.7)*10+Math.sin((x+off)/47+i)*4);p.push(W+60,H,-60,H);path(p);ctx.fillStyle=c;ctx.fill();ctx.strokeStyle=DYE.black;ctx.lineWidth=7;ctx.stroke();});
}
// A tree as the tapestries draw them: a trunk that splits into curling branches, each ending in a palmette.
function wPalmette(x,y,r,a,col,vein=DYE.black){const p=[x,y];for(let j=-2;j<=2;j++){const b=a+j*.38,rr=r*(1-Math.abs(j)*.12);p.push(x+Math.cos(b-.17)*rr*.78,y+Math.sin(b-.17)*rr*.78,x+Math.cos(b)*rr,y+Math.sin(b)*rr,x+Math.cos(b+.17)*rr*.78,y+Math.sin(b+.17)*rr*.78);}
  wshape(p,col,{lw:7,ten:.6});for(let j=-1;j<=1;j++){const b=a+j*.38;wline([x,y,x+Math.cos(b)*r*.6,y+Math.sin(b)*r*.6],vein,5);}}
function wTree(x,y,h,{leaf=DYE.green,leaf2=DYE.weld,trunk=DYE.walnut,seed=0,bare=false,frost=false}={}){
  const top=y-h*.5;
  // branches: S-curves out and up, interlacing over the trunk
  const br=[[-1,.42,.95],[1,.5,.9],[-1,.66,.7],[1,.72,.66],[0,.86,.5]];
  const tips=br.map(([d,k,l],i)=>{const by=y-h*k,ex=x+d*h*.3*l+(d?0:(hash(seed)-.5)*20),ey=y-h*(k+.2*l)-(d?0:h*.08);
    wcurve([x,by+h*.1,x+d*h*.16*l,by-h*.02,x+d*h*.05*l,by-h*.12*l,ex,ey],16,trunk,{lw:7});return [ex,ey,d];});
  wcurve([x,y+4,x+(hash(seed*3)-.5)*14,y-h*.3,x,top-h*.38],30,trunk);
  tips.forEach(([ex,ey,d],i)=>{if(bare){if(frost)wdisc(ex,ey,9,DYE.bone,{lw:5});return;}const a=-Math.PI/2+d*.7;wPalmette(ex,ey,h*.16,a,i%2?leaf2:leaf);});
  wspiral(x,y-h*.24,h*.05,DYE.black,{lw:6,dir:hash(seed)>.5?1:-1});
}
// Stylised flowers and sprouts, and snow as little white rosettes.
function wFlower(x,y,s=1,col=DYE.madder){wline([x,y,x+2*s,y-18*s,x,y-34*s],DYE.moss,6*s);for(const a of [-.9,0,.9])wshape([x,y-34*s,x+Math.sin(a-.3)*10*s,y-34*s-Math.cos(a-.3)*10*s,x+Math.sin(a)*16*s,y-34*s-Math.cos(a)*16*s,x+Math.sin(a+.3)*10*s,y-34*s-Math.cos(a+.3)*10*s],col,{lw:5*s});}
function wSprout(x,y,s=1){wline([x,y,x,y-20*s],DYE.moss,6*s);wshape([x,y-14*s,x-14*s,y-26*s,x-4*s,y-22*s],DYE.green,{lw:4*s});wshape([x,y-18*s,x+14*s,y-30*s,x+4*s,y-24*s],DYE.green,{lw:4*s});}
function wFlake(x,y,s=1,col=DYE.bone){ctx.save();ctx.strokeStyle=col;ctx.lineWidth=6*s;ctx.lineCap='round';for(let k=0;k<3;k++){const a=k*Math.PI/3;ctx.beginPath();ctx.moveTo(x-Math.cos(a)*12*s,y-Math.sin(a)*12*s*1.3);ctx.lineTo(x+Math.cos(a)*12*s,y+Math.sin(a)*12*s*1.3);ctx.stroke();}ctx.restore();}

// A figure in the manner of the bear: everything parts() paints (any colour) is merged into one silhouette, filled
// with a single dye, edged in dark wool, with a second contour of `inner` running inside the edge. Works on the pick
// grid inside weave(), so the edge and the inner line step exactly as woven lines do. Distances are in frame px.
function chamfer(m,v,gw,gh){const n=gw*gh,d=new Float32Array(n);for(let i=0;i<n;i++)d[i]=m[i]===v?1e9:0;
  const X=PW,Y=PH,D=Math.hypot(PW,PH),at=(x,y)=>x<0||y<0||x>=gw||y>=gh?1e9:d[y*gw+x];
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const i=y*gw+x;if(d[i])d[i]=Math.min(d[i],at(x-1,y)+X,at(x,y-1)+Y,at(x-1,y-1)+D,at(x+1,y-1)+D);}
  for(let y=gh-1;y>=0;y--)for(let x=gw-1;x>=0;x--){const i=y*gw+x;if(d[i])d[i]=Math.min(d[i],at(x+1,y)+X,at(x,y+1)+Y,at(x+1,y+1)+D,at(x-1,y+1)+D);}
  return d;}
function wFigure(parts,{fill=DYE.walnut,inner=DYE.ochre,line=DYE.black,band=[17,26],edge=[6,4]}={}){
  const gw=Math.ceil(W/PW),gh=Math.ceil(H/PH),bg=ctx.getImageData(0,0,gw,gh);
  ctx.save();ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.strokeStyle='#fff';parts();ctx.restore();
  const mk=ctx.getImageData(0,0,gw,gh).data,n=gw*gh,m=new Uint8Array(n);for(let i=0;i<n;i++)m[i]=mk[i*4+3]>110?1:0;
  const din=chamfer(m,1,gw,gh),dout=chamfer(m,0,gw,gh),F=rgbOf(fill),I=inner?rgbOf(inner):null,L=rgbOf(line),o=bg.data;
  for(let i=0;i<n;i++){let c=null;
    if(m[i])c=din[i]<=edge[0]?L:I&&din[i]>band[0]&&din[i]<=band[1]?I:F;else if(dout[i]<=edge[1])c=L;
    if(c){o[i*4]=c[0];o[i*4+1]=c[1];o[i*4+2]=c[2];o[i*4+3]=255;}}
  ctx.putImageData(bg,0,0);
}
