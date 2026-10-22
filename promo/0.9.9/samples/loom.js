// Loom: the woven register of the promo (the saga as a tapestry hanging by the hearth).
// A design is drawn at frame coordinates but scaled onto a grid of one pixel per weft pick (PW px across a warp, PH px
// down), snapped to the dye palette — two colours meeting interlock in comb teeth, as hatching does in real tapestry —
// streaked by uneven dye lots (abrash), then enlarged and woven: each pick becomes a ribbed bump of wool.

// Plant dyes on undyed wool, the palette of Överhogdal, Baldishol and Bayeux.
const DYE={
  wool:'#ddcfae',     // undyed ground
  bone:'#efe6d0',     // bleached: snow, claws, letters
  linen:'#c4b590',    // undyed, in shadow
  madderL:'#c46a4a',madder:'#a5412d',madderD:'#6e2a20',   // madder reds
  rust:'#7a2f22',
  bayL:'#a8613a',bay:'#7f3f26',bayD:'#4f2619',            // madder on walnut: a bay coat
  weldL:'#e3c36e',weld:'#cf9f3e',ochre:'#a77436',         // weld yellows
  greenL:'#97a066',green:'#62724a',moss:'#3f4b31',mossD:'#28301f', // woad over weld
  skyL:'#bcc7cc',sky:'#8ea2b3',woad:'#43607f',indigo:'#25324a',     // woad blues
  walnutL:'#8a6447',walnut:'#5b3d2c',umber:'#3a2a22',              // walnut hulls
  skinL:'#e6c3a2',skin:'#d6a685',skinD:'#a8765a',
  grey:'#9c9a90',
  black:'#1f1b1a',    // iron-black outline wool
};
// Tonal ramps (light, mid, dark) for modelled shapes: drawn as gradients, the loom turns them into hatched steps.
const RAMP={madder:[DYE.madderL,DYE.madder,DYE.madderD],bay:[DYE.bayL,DYE.bay,DYE.bayD],weld:[DYE.weldL,DYE.weld,DYE.ochre],
  green:[DYE.greenL,DYE.green,DYE.moss],moss:[DYE.green,DYE.moss,DYE.mossD],woad:[DYE.sky,DYE.woad,DYE.indigo],sky:[DYE.skyL,DYE.sky,DYE.woad],
  walnut:[DYE.walnutL,DYE.walnut,DYE.umber],skin:[DYE.skinL,DYE.skin,DYE.skinD],snow:[DYE.bone,DYE.skyL,DYE.sky],wool:[DYE.bone,DYE.wool,DYE.linen],
  iron:[DYE.grey,DYE.indigo,DYE.black],black:[DYE.indigo,DYE.black,DYE.black]};
const DYE_RGB=Object.values(DYE).map(rgbOf);
let PW=6,PH=4,GW=320,GH=270,ZOOM=1;

const WEAVE_TEX=new Map(),TILE=64;   // the cloth's shading repeats every TILE picks each way
const wrap=(v,n)=>((v%n)+n)%n;
// Shading of the cloth itself: warp ribs running down, each pick a bump of twisted wool, picks offset half a row on
// alternate warps; a few stray fibres. Grey values around 1 for a multiply pass. The pattern repeats every TILE picks,
// so that it can be laid under the picks at any whole-pick offset and stay with the cloth when the camera moves.
function weaveTexture(w,h,pw=PW,ph=PH){
  const key=`${w}x${h}/${pw}x${ph}`;if(WEAVE_TEX.has(key))return WEAVE_TEX.get(key);
  const tw=TILE*pw,th=TILE*ph,tile=document.createElement('canvas');tile.width=tw;tile.height=th;const g=tile.getContext('2d'),img=g.createImageData(tw,th),d=img.data;
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
    const col=Math.floor(x/pw),u=(x%pw+.5)/pw,yo=y+(col%2)*ph/2,row=wrap(Math.floor(yo/ph),TILE),v=(yo%ph+.5)/ph;
    const across=Math.pow(Math.sin(Math.PI*u),.7),down=Math.pow(Math.sin(Math.PI*v),.9);
    const twist=.07*Math.sin((u*pw*1.1+v*ph*1.6)*2.3+hash(col*31+row)*6),lot=(hash(col*7.3+row*1.9)-.5)*.1;
    const s=clamp(.56+.4*across*(.62+.38*down)+twist+lot,0,1.06),i=(y*tw+x)*4;
    d[i]=d[i+1]=d[i+2]=Math.round(Math.min(255,s*262));d[i+3]=255;}
  g.putImageData(img,0,0);
  g.globalCompositeOperation='screen';g.lineCap='round';
  for(let i=0;i<tw*th/900;i++){const x=hash(i*1.7)*tw,y=hash(i*3.1)*th,a=hash(i*5.3)*TAU,l=3+hash(i*7.9)*9;g.strokeStyle=`rgba(255,255,255,${.05+.08*hash(i)})`;g.lineWidth=.7;
    for(const [dx,dy] of [[0,0],[-tw,0],[0,-th],[-tw,-th]]){g.beginPath();g.moveTo(x+dx,y+dy);g.quadraticCurveTo(x+dx+Math.cos(a)*l*.6+2,y+dy+Math.sin(a)*l*.6,x+dx+Math.cos(a)*l,y+dy+Math.sin(a)*l);g.stroke();}}
  const c=document.createElement('canvas');c.width=w+tw;c.height=h+th;const cg=c.getContext('2d');cg.fillStyle=cg.createPattern(tile,'repeat');cg.fillRect(0,0,c.width,c.height);
  if(WEAVE_TEX.size>6)WEAVE_TEX.delete(WEAVE_TEX.keys().next().value);WEAVE_TEX.set(key,c);return c;
}

// Weave whatever draw() paints (in frame coordinates) and leave the cloth on the canvas.
// light: hearth glow from the lower left, flicker 0..1; folds: depth of the hanging folds.
// zoom: the camera is that much closer to the cloth, so every pick is that much larger; (x0, y0) is where a pick
// boundary falls on the screen, so that when the camera moves the picks stay fixed to the design instead of crawling.
// Everything that varies from pick to pick (dye lots, hatching, the shading of the wool) is keyed to the pick's place on
// the cloth (kx, ky: how many whole picks the cloth has moved), never to its place on the screen, or a moving camera
// would deal every pick a new random shade each frame and the cloth would shimmer.
function weave(draw,{seed=0,light=1,flicker=0,folds=1,pw=6,ph=4,zoom=1,x0=0,y0=0}={}){
  pw*=zoom;ph*=zoom;PW=pw;PH=ph;ZOOM=zoom;const X0=x0,Y0=y0;x0=((x0%pw)+pw)%pw-pw;y0=((y0%ph)+ph)%ph-ph;
  const kx=Math.round((X0-x0)/pw),ky=Math.round((Y0-y0)/ph);
  const gw=Math.ceil((W-x0)/pw),gh=Math.ceil((H-y0)/ph);GW=gw;GH=gh;
  ctx.save();ctx.setTransform(1/pw,0,0,1/ph,-x0/pw,-y0/ph);ctx.clearRect(x0,y0,W-x0,H-y0);draw();ctx.restore();
  const src=ctx.getImageData(0,0,gw,gh),s=src.data,out=new ImageData(gw,gh),o=out.data;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=(y*gw+x)*4,r=s[i],g=s[i+1],b=s[i+2];let b1=1e9,b2=1e9,c1=0,c2=0;
    for(let k=0;k<DYE_RGB.length;k++){const p=DYE_RGB[k],dr=r-p[0],dg=g-p[1],db=b-p[2],e=dr*dr*2+dg*dg*4+db*db*3;if(e<b1){b2=b1;c2=c1;b1=e;c1=k;}else if(e<b2){b2=e;c2=k;}}
    // hatching: where the drawn colour sits between two dyes, alternate picks take the other one
    const cx=x-kx,cy=y-ky,t=Math.sqrt(b1)/(Math.sqrt(b1)+Math.sqrt(b2)+1e-6),ci=t>(wrap(cy,2)?.2:.4)?c2:c1,p=DYE_RGB[ci];
    const lot=1+.075*(noise(cy*.11+ci*13.7+seed)-.5)*2+.03*(noise(cx*.05+cy*.9+ci)-.5)+(hash(cx*3.7+cy*11.3+seed)-.5)*.05;
    o[i]=p[0]*lot;o[i+1]=p[1]*lot;o[i+2]=p[2]*lot;o[i+3]=255;}
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  if(zoom===1){const small=document.createElement('canvas');small.width=gw;small.height=gh;small.getContext('2d').putImageData(out,0,0);
    ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,x0,y0,gw*pw,gh*ph);ctx.imageSmoothingEnabled=true;
    ctx.globalCompositeOperation='multiply';ctx.drawImage(weaveTexture(W+12,H+8,pw,ph),x0-wrap(-kx,TILE)*pw,y0-wrap(-ky,TILE)*ph);}
  else{ // picks of a fractional size: each pixel finds its pick and its place in the pick, so colour and wool line up
    const img=ctx.createImageData(W,H),d=img.data,col=new Int32Array(W),A=new Float32Array(W),V=[new Int32Array(H),new Int32Array(H)],D=[new Float32Array(H),new Float32Array(H)];
    for(let x=0;x<W;x++){const c=Math.floor((x-x0)/pw),u=((x-x0)-c*pw+.5)/pw;col[x]=c;A[x]=Math.pow(Math.sin(Math.PI*clamp(u,0,1)),.7);}
    for(let p=0;p<2;p++)for(let y=0;y<H;y++){const yo=(y-y0)+p*ph/2,r=Math.floor(yo/ph),v=(yo-r*ph+.5)/ph;V[p][y]=r-ky;D[p][y]=Math.pow(Math.sin(Math.PI*clamp(v,0,1)),.9);}
    for(let y=0;y<H;y++){const cr=Math.min(gh-1,Math.max(0,Math.floor((y-y0)/ph)));for(let x=0;x<W;x++){const c=Math.min(gw-1,Math.max(0,col[x])),p=wrap(c-kx,2),i=(cr*gw+c)*4,j=(y*W+x)*4;
      const sh=clamp(.56+.4*A[x]*(.62+.38*D[p][y])+(hash((c-kx)*7.3+V[p][y]*1.9)-.5)*.1,0,1.06)*1.027;d[j]=o[i]*sh;d[j+1]=o[i+1]*sh;d[j+2]=o[i+2]*sh;d[j+3]=255;}}
    ctx.putImageData(img,0,0);}
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
  wcurve([x,y+4,x+(hash(seed*3)-.5)*14,y-h*.3,x,top-h*.38],h<300?h*.08:Math.max(30,h*.05),trunk);
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
function wFigure(parts,{fill=DYE.walnut,inner=DYE.ochre,line=DYE.black,band=[17,26],edge=null}={}){
  const gw=GW,gh=GH,bg=ctx.getImageData(0,0,gw,gh);edge=edge||[PW,PH];band=band.map(v=>v*ZOOM);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,gw,gh);ctx.restore();ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle='#fff';parts();ctx.restore();
  const mk=ctx.getImageData(0,0,gw,gh).data,n=gw*gh,m=new Uint8Array(n);for(let i=0;i<n;i++)m[i]=mk[i*4+3]>110?1:0;
  const din=chamfer(m,1,gw,gh),dout=chamfer(m,0,gw,gh),F=rgbOf(fill),I=inner?rgbOf(inner):null,L=rgbOf(line),o=bg.data;
  for(let i=0;i<n;i++){let c=null;
    if(m[i])c=din[i]<=edge[0]?L:I&&din[i]>band[0]&&din[i]<=band[1]?I:F;else if(dout[i]<=edge[1])c=L;
    if(c){o[i*4]=c[0];o[i*4+1]=c[1];o[i*4+2]=c[2];o[i*4+3]=255;}}
  ctx.putImageData(bg,0,0);
}

// ---------------------------------------------------------------- modelled drawing (the Flemish manner)
// A shape filled with a gradient across its ramp, light coming from the upper left (ang), edged in dark brown.
const OUT=DYE.umber;
function bbox(p){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}return [x0,y0,x1,y1];}
function rampFill(p,ramp,ang=.9,bias=0){const [x0,y0,x1,y1]=bbox(p),cx=(x0+x1)/2,cy=(y0+y1)/2,r=Math.max(x1-x0,y1-y0)/2,dx=Math.cos(ang)*r,dy=Math.sin(ang)*r;
  const g=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy);g.addColorStop(0,ramp[0]);g.addColorStop(clamp(.42+bias,.05,.95),ramp[1]);g.addColorStop(1,ramp[2]);return g;}
function mshape(p,ramp,{ang=.15,bias=0,line=OUT,lw=6,ten=1,poly=false}={}){if(poly)path(p);else smooth(p,ten);ctx.fillStyle=typeof ramp==='string'?ramp:rampFill(p,ramp,ang,bias);ctx.fill();if(line){ctx.strokeStyle=line;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.stroke();}}
// Fold lines: open curves in the dark of the ramp, with a lit edge beside them.
function mfold(pts,dark,lit=null,lw=6){wline(pts,dark,lw);if(lit){ctx.save();ctx.translate(-5,-2);wline(pts,lit,lw*.6);ctx.restore();}}
// The narrow border of a Flemish tapestry: madder selvage, a woad line inside it.
function wFrame(){ctx.save();ctx.lineJoin='miter';ctx.strokeStyle=DYE.madderD;ctx.lineWidth=52;ctx.strokeRect(0,0,W,H);ctx.strokeStyle=DYE.madder;ctx.lineWidth=36;ctx.strokeRect(0,0,W,H);ctx.strokeStyle=DYE.woad;ctx.lineWidth=8;ctx.strokeRect(30,30,W-60,H-60);ctx.restore();}
