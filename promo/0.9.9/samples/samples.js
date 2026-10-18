// Art-direction samples for the third version of the promo, drawn with the film's primitives (scene.html) and the
// loom (loom.js). node promo/0.9.9/samples/render.mjs → promo/0.9.9/samples/*.png

// ---------------------------------------------------------------- woven: the bear Arthur roars
// Upright, head thrown back, facing right; feet at the origin. Built of parts as the weavers built their animals, each
// edged in dark wool, with spirals at haunch and shoulder as on Viking beasts.
function wOval(cx,cy,rx,ry,rot=0,n=14){const p=[];for(let i=0;i<n;i++){const a=i/n*TAU,x=Math.cos(a)*rx,y=Math.sin(a)*ry;p.push(cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot));}return p;}
function innerLine(pts,fill,inner,w=46){ctx.save();smooth(pts);ctx.clip();smooth(pts);ctx.strokeStyle=inner;ctx.lineWidth=w;ctx.stroke();ctx.strokeStyle=fill;ctx.lineWidth=w-16;ctx.stroke();ctx.restore();smooth(pts);ctx.strokeStyle=DYE.black;ctx.lineWidth=LW;ctx.stroke();}
function wClaws(cx,cy,a,n=4,l=28){for(let i=0;i<n;i++){const b=a+(i-(n-1)/2)*.32,px=cx+Math.cos(b)*l*.5,py=cy+Math.sin(b)*l*.5;wshape([px-Math.sin(b)*6,py+Math.cos(b)*6,px+Math.cos(b+.15)*l,py+Math.sin(b+.15)*l,px+Math.sin(b)*6,py-Math.cos(b)*6],DYE.bone,{lw:5,ten:.5});}}
// The bear as in the first sample: one smooth outline with a second contour just inside it.
const WBEAR={
  body:[-70,0,-86,-34,-98,-92,-124,-150,-134,-214,-122,-282,-106,-352,-98,-420,-86,-470,-60,-512,-38,-548,-14,-578,14,-597,46,-617,78,-640,96,-649,106,-637,92,-622,70,-604,56,-592,76,-587,104,-585,108,-574,84,-560,56,-541,52,-506,64,-470,80,-420,90,-350,88,-280,72,-226,84,-186,86,-130,62,-72,50,-28,72,-19,98,-9,100,4,20,7],
  mouth:[56,-592,90,-621,103,-633,112,-596,106,-585,76,-587],
  armNear:[-14,-468,30,-492,82,-508,118,-534,140,-563,158,-572,172,-556,162,-532,140,-510,108,-482,66,-452,18,-430],
  armFar:[26,-446,92,-446,142,-474,170,-492,182,-476,154,-450,102,-414,40,-408],
  legFar:[16,-70,60,-46,116,-18,128,-2,40,6,6,-22],
};
function wBear(x,y,s,{fur=DYE.walnut,far=DYE.umber,inner=DYE.ochre}={}){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  const claws=(cx,cy,a,n=4,l=26)=>{for(let i=0;i<n;i++){const b=a+(i-(n-1)/2)*.28,px=cx+Math.cos(b)*10,py=cy+Math.sin(b)*10;wshape([px,py,px+Math.cos(b-.25)*l*.6,py+Math.sin(b-.25)*l*.6,px+Math.cos(b+.1)*l,py+Math.sin(b+.1)*l,px+Math.cos(b+.3)*l*.4,py+Math.sin(b+.3)*l*.4],DYE.bone,{lw:5});}};
  wshape(WBEAR.legFar,far);claws(124,-6,0,3,22);wshape(WBEAR.armFar,far);claws(178,-486,-.5,3,24);
  wshape(WBEAR.body,fur,{line:null});ctx.save();smooth(WBEAR.body);ctx.clip();smooth(WBEAR.body);ctx.strokeStyle=inner;ctx.lineWidth=52;ctx.stroke();ctx.strokeStyle=fur;ctx.lineWidth=34;ctx.stroke();
  wshape(WBEAR.mouth,DYE.madder,{lw:6});for(const [a,b] of [[92,-620],[100,-610],[104,-596]])wpoly([a,b,a+10,b+4,a+2,b+10],DYE.bone,{line:null});
  for(const [cx,cy,r,d] of [[-56,-206,58,1],[-18,-430,44,-1]]){wspiral(cx,cy,r,DYE.black,{lw:22,dir:d});wspiral(cx,cy,r,inner,{lw:10,dir:d});}
  ctx.restore();smooth(WBEAR.body);ctx.strokeStyle=DYE.black;ctx.lineWidth=LW;ctx.lineJoin='round';ctx.stroke();
  wdisc(-26,-572,17,fur);wdisc(-26,-572,7,inner,{line:null});
  claws(98,-2,0,3,22);
  wshape(WBEAR.armNear,fur);ctx.save();smooth(WBEAR.armNear);ctx.clip();wline([0,-452,60,-478,110,-500,146,-540],inner,10);ctx.restore();claws(168,-566,-.75,4,30);
  ctx.restore();
}
function wBird(x,y,s,col=DYE.indigo,flap=0){ctx.save();ctx.translate(x,y);ctx.scale(s,s);wshape([-30,0,-6,-6,14,-8,30,-12,24,-2,8,4,-14,6],col,{lw:6});wshape([-6,-6,-18,-34-flap*10,-2,-30,10,-8],col,{lw:6});ctx.restore();}

window.sampleBear=()=>{
  ctx.setTransform(1,0,0,1,0,0);TINT.k=0;
  weave(()=>{
    rect(0,0,W,H,DYE.wool);
    // a sun with rays, a spring sky with no colour but the wool
    const sx=420,sy=300;for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([sx+Math.cos(a-.1)*70,sy+Math.sin(a-.1)*70,sx+Math.cos(a)*(i%2?104:124),sy+Math.sin(a)*(i%2?104:124),sx+Math.cos(a+.1)*70,sy+Math.sin(a+.1)*70],i%2?DYE.madder:DYE.weld,{lw:6});}
    wdisc(sx,sy,66,DYE.weld);wspiral(sx,sy,44,DYE.madder,{lw:10});
    for(const [bx,by,bs,f] of [[1560,240,1.1,1],[1660,290,.9,0],[1500,330,1,1],[1620,190,.8,0]])wBird(bx,by,bs,DYE.indigo,f);
    wTree(150,846,600,{seed:1});wTree(640,852,400,{seed:2,leaf:DYE.weld,leaf2:DYE.green});
    wTree(1440,852,420,{seed:3});wTree(1770,846,600,{seed:4,leaf:DYE.weld,leaf2:DYE.madder});
    wGround(812);
    // last snow, already going: the breath has melted it into soft lumps with earth showing between
    for(const [sx,sy,sw] of [[640,830,150],[1300,836,190],[360,850,120]]){wshape([sx-sw/2,sy+8,sx-sw*.3,sy-22,sx,sy-30,sx+sw*.32,sy-20,sx+sw/2,sy+8],DYE.bone,{lw:7});}
    for(const [fx,fy,fs,c] of [[740,848,1.1,DYE.madder],[790,860,.9,DYE.weld],[1210,850,1,DYE.weld],[1180,866,.8,DYE.madder],[560,866,.9,DYE.madder]])wFlower(fx,fy,fs,c);
    for(const [fx,fy] of [[690,858],[860,866],[1120,858],[1250,870],[1010,872]])wSprout(fx,fy,1.1);
    // the roar: rays of breath and three rings going out from the jaws
    const mx=1000+110*.98,my=868-608*.98;
    for(let i=0;i<3;i++){ctx.save();ctx.beginPath();ctx.arc(mx,my,70+i*46,-.8,.3);ctx.strokeStyle=i===1?DYE.madder:DYE.weld;ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();ctx.restore();}
    for(const [a,l,c] of [[-.7,130,DYE.madder],[-.35,170,DYE.weld],[0,140,DYE.madder]]){const p=[];for(let k=0;k<=10;k++){const r=60+k/10*l,w=Math.sin(k*1.25)*16*(k/10);p.push(mx+Math.cos(a)*r-Math.sin(a)*w,my+Math.sin(a)*r+Math.cos(a)*w);}wcurve(p,12,c,{lw:6});}
    wBear(1000,868,.98);
    wBorderTop('HIC ARTHVR VRSVS BELLVM CLAMAT',{h:124});wBorderBottom();
  },{seed:3,flicker:.2});
  grade(0);sampleCaption('大熊阿瑟用它温暖的鼻息融化积雪，将露出的大地作为战场，吼叫着呼喊战争。','The great bear Arthur melts the snow with his warm breath, takes the bare earth for a battlefield, and roars out his call to war.');
};

// ---------------------------------------------------------------- woven: Riga rides for Helgard
// The flying gallop of medieval horses: forelegs reaching forward, hind legs stretched back. Origin under the belly.
const WHORSE={
  barrel:[-176,-70,-164,-124,-110,-146,-30,-138,50,-144,116,-160,170,-138,192,-88,172,-34,100,-8,-30,-4,-130,-12,-170,-38],
  neck:[84,-152,130,-214,180,-266,226,-290,254,-262,242,-220,216,-160,202,-90,168,-60],
  head:[220,-290,244,-310,252,-334,268,-312,304,-290,342,-252,352,-230,338,-220,302,-228,262,-246,236,-256],
  mane:[78,-150,112,-206,160,-262,206,-300,236,-312,224,-290,184,-258,140,-206,104,-150],
  tail:[-160,-122,-206,-140,-250,-126,-282,-90,-304,-36,-292,-22,-270,-56,-238,-92,-198,-90,-168,-76],
};
// A leg from three points (top, joint, hoof): tapered, muscled at the top, fine at the cannon.
function legShape(pts,w1,w2){
  const [x0,y0,x1,y1,x2,y2]=pts,nrm=(ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1;return [-dy/L,dx/L];};
  const [na,nb]=nrm(x0,y0,x1,y1),[ma,mb]=nrm(x1,y1,x2,y2),ja=(na+ma)/2,jb=(nb+mb)/2,mx=(x0+x1)/2,my=(y0+y1)/2;
  const side=k=>[x0+na*w1*.7*k,y0+nb*w1*.7*k,mx+na*w1*.5*k,my+nb*w1*.5*k,x1+ja*w2*.62*k,y1+jb*w2*.62*k,lerp(x1,x2,.5)+ma*w2*.4*k,lerp(y1,y2,.5)+mb*w2*.4*k,x2+ma*w2*.42*k,y2+mb*w2*.42*k];
  const A=side(1),B=side(-1),p=[...A];for(let i=B.length-2;i>=0;i-=2)p.push(B[i],B[i+1]);return p;}
function hoof(pts,w){const n=pts.length,x1=pts[n-4],y1=pts[n-3],x2=pts[n-2],y2=pts[n-1],dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,ma=-uy,mb=ux,h=w*.5;
  wpoly([x2+ma*h,y2+mb*h,x2-ma*h,y2-mb*h,x2+ux*18-ma*h*1.2,y2+uy*18-mb*h*1.2,x2+ux*18+ma*h*1.1,y2+uy*18+mb*h*1.1],DYE.black,{lw:4});}
const HLEGS={farF:[[126,-60,196,-8,268,40],30,20],farH:[[-110,-56,-104,14,-54,62],34,20],nearF:[[150,-48,224,-34,214,42],32,20],nearH:[[-136,-44,-186,28,-262,60],38,22]};
// The horse in the bear's manner: one silhouette (body, neck, head, mane, tail, near legs), far legs darker behind.
function wHorse(x,y,s,{coat=DYE.rust,far=DYE.umber,inner=DYE.ochre}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();};
  const far2=[HLEGS.farF,HLEGS.farH];
  wFigure(T(()=>far2.forEach(([p,a,b])=>shape(legShape(p,a,b),'#fff'))),{fill:far,inner:null});
  T(()=>far2.forEach(([p,a,b])=>hoof(p,b)))();
  wFigure(T(()=>{for(const k of ['barrel','neck','head','mane','tail'])shape(WHORSE[k],'#fff');for(const k of ['nearF','nearH']){const [p,a,b]=HLEGS[k];shape(legShape(p,a,b),'#fff');}}),{fill:coat,inner,band:[17*s,26*s]});
  T(()=>{for(const k of ['nearF','nearH']){const [p,,b]=HLEGS[k];hoof(p,b);}
    for(const [cx,cy,r,d] of [[-110,-84,46,1],[128,-96,34,-1]]){wspiral(cx,cy,r,DYE.black,{lw:18,dir:d});wspiral(cx,cy,r,inner,{lw:8,dir:d});}
    for(let i=0;i<3;i++)wline([-206-i*20,-118+i*14,-246-i*14,-100+i*22,-272-i*6,-62+i*14],DYE.black,5);
    wline([250,-302,302,-250,344,-232],DYE.black,6);})();
}
// The rider, the same way: hood, cloak, body and legs one silhouette; the near arm laid over it with its own edge.
function wRider(x,y,s,{cloth=DYE.woad,inner=DYE.sky}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();};
  wFigure(T(()=>{
    shape([30,-252,-30,-262,-110,-258,-190,-236,-250,-238,-200,-212,-140,-200,-60,-196,0,-180],'#fff');
    shape([-26,-150,30,-154,104,-232,82,-268,30,-256,-14,-204],'#fff');
    shape([68,-250,64,-288,74,-314,94,-326,116,-322,126,-310,128,-298,138,-286,129,-281,131,-273,126,-264,112,-258,98,-258,88,-246],'#fff');shape([72,-302,46,-292,22,-262,40,-254,66,-268],'#fff');
    wcurve([0,-146,60,-104,58,-92],36,'#fff',{line:null});wcurve([58,-92,40,-40],30,'#fff',{line:null,cap:'butt'});shape([20,-50,58,-48,76,-30,26,-24],'#fff');
  }),{fill:cloth,inner,band:[14*s,21*s]});
  wFigure(T(()=>{wcurve([68,-244,104,-212,124,-206,166,-214],28,'#fff',{line:null});wdisc(174,-212,16,'#fff',{line:null});}),{fill:cloth,inner:null});
  T(()=>{wspiral(52,-226,22,DYE.black,{lw:12,dir:-1});wspiral(52,-226,22,inner,{lw:6,dir:-1});wline([184,-212,260,-226,304,-248],DYE.black,5);})();
}
window.sampleRider=()=>{
  ctx.setTransform(1,0,0,1,0,0);TINT.k=0;
  weave(()=>{
    rect(0,0,W,H,DYE.wool);
    // winter: bare trees with frost on the twigs, snow falling as rosettes
    for(const [tx,th,sd] of [[120,600,5],[420,420,6],[1480,440,7],[1790,600,8]])wTree(tx,830,th,{seed:sd,leaf:DYE.sky,leaf2:DYE.bone,trunk:sd%2?DYE.walnut:DYE.indigo});
    for(let i=0;i<90;i++){const fx=hash(i*3.3)*W,fy=150+hash(i*7.1)*620;if(Math.abs(fx-860)<440&&fy>300&&fy<790)continue;wFlake(fx,fy,1+hash(i)*.6,i%4?DYE.woad:DYE.sky);}
    wGround(800,{cols:[DYE.bone,DYE.sky,DYE.bone]});
    for(let i=0;i<9;i++){const hx=180+i*120;wshape([hx,880+(i%2)*14,hx+16,872+(i%2)*14,hx+20,890+(i%2)*14,hx+4,896+(i%2)*14],DYE.woad,{lw:5});}
    wHorse(880,720,1.2);wRider(880+12*1.2,720-14*1.2,1.2);
    wBorderTop('HIC RIGA EQVITAT AD HELGARD',{h:124});wBorderBottom();
  },{seed:8,flicker:.4});
  grade(0);
};

// ---------------------------------------------------------------- traces: the wood after the battle
// A spruce by its real habit: a narrow spire of drooping, needled fronds, whorl above whorl.
function spruce(x,y,h,col,seed=0,{snow=null,g=ctx}={}){
  const n=16+Math.floor(hash(seed)*5);g.fillStyle=col;g.fillRect(x-h*.012,y-h*.9,h*.024,h*.9);
  const frond=(k,side)=>{const j=hash(seed+k*13.1+side),yb=y-h*(.06+.9*k),L=h*.21*Math.pow(1-k,.85)*(.7+.6*j)+h*.012,dr=L*(.32+.2*hash(seed+k*3.3+side));
    const P=[x,yb-h*.035,x+side*L*.5,yb+dr*.1,x+side*L,yb+dr];
    for(let q=0;q<5;q++){const f=1-q/5;P.push(x+side*L*(f-.07),yb+dr*f+L*.12*(q%2?.2:1),x+side*L*(f-.13),yb+dr*(f-.1)+L*.05);}
    P.push(x,yb+h*.025);g.beginPath();g.moveTo(P[0],P[1]);for(let i=2;i<P.length;i+=2)g.lineTo(P[i],P[i+1]);g.closePath();g.fill();
    if(snow){g.save();g.fillStyle=snow;g.beginPath();g.moveTo(x,yb-h*.035);g.lineTo(x+side*L*.5,yb+dr*.1);g.lineTo(x+side*L*.92,yb+dr*.86);g.lineTo(x+side*L*.5,yb+dr*.1+L*.06);g.lineTo(x,yb-h*.01);g.closePath();g.fill();g.restore();g.fillStyle=col;}};
  for(let i=0;i<n;i++){const k=i/n;frond(k,-1);frond(k+.5/n,1);}
  g.beginPath();g.moveTo(x-h*.02,y-h*.92);g.lineTo(x,y-h);g.lineTo(x+h*.02,y-h*.92);g.fill();
}
function layerCanvas(){const c=document.createElement('canvas');c.width=W;c.height=H;return c;}
let GRAIN=null;
function filmGrain(a=.07){if(!GRAIN){GRAIN=layerCanvas();const g=GRAIN.getContext('2d'),im=g.createImageData(W,H),d=im.data;for(let i=0;i<d.length;i+=4){const v=128+(Math.random()-.5)*110;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}g.putImageData(im,0,0);}
  ctx.save();ctx.globalCompositeOperation='overlay';ctx.globalAlpha=a;ctx.drawImage(GRAIN,0,0);ctx.restore();}
// A kneeling man gripping an upright spear, in profile (u forward, h up): only ever seen as a shadow.
function kneelingSilhouette(g){
  g.lineCap='round';g.lineJoin='round';const L=(pts,w)=>{g.lineWidth=w;g.beginPath();g.moveTo(pts[0],-pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],-pts[i+1]);g.stroke();};
  L([-52,5,6,5],14);L([6,7,-4,56],24);L([-2,56,40,55],22);L([40,55,43,7],15);L([36,2,62,2],9);
  L([-6,60,-14,88,14,112],34);g.beginPath();g.arc(32,-119,12.5,0,TAU);g.fill();
  L([14,108,26,84,34,92],10);L([16,104,30,78,34,70],10);
  L([34,-4,34,236],4.5);g.beginPath();g.moveTo(34,-266);g.lineTo(39,-244);g.lineTo(34,-232);g.lineTo(29,-244);g.closePath();g.fill();
}
window.sampleTraces=(opt={})=>{
  ctx.setTransform(1,0,0,1,0,0);TINT.k=0;const t=12,sun=[2080,300];
  grad(0,720,[[0,'#9fb0c2'],[.5,'#c9cfd3'],[1,'#e9e0cf']]);glow(sun[0],sun[1],1100,'#fff3da',.95);glow(sun[0],sun[1],380,'#ffffff',.6);
  // depth: hazy spruce walls, each nearer one darker and sharper
  const wall=(y,n,h0,h1,col,blur,seed,a=1)=>{const L=layerCanvas(),g=L.getContext('2d');for(let i=0;i<n;i++){const x=(i+hash(seed+i)*.8)/n*(W+200)-100;spruce(x,y+hash(seed+i*2)*14,lerp(h0,h1,hash(seed+i*3)),col,seed+i,{g});}ctx.save();ctx.filter=`blur(${blur}px)`;ctx.globalAlpha=a;ctx.drawImage(L,0,0);ctx.restore();};
  wall(610,60,90,170,'#b7c0c8',3,10);fogBand(520,660,'#e6e4dc',.8);
  wall(640,34,170,300,'#94a3b2',2,40);fogBand(560,700,'#e2e1da',.55);
  // snow field, lit from the low sun on the right
  const sg=ctx.createLinearGradient(0,620,W,1080);sg.addColorStop(0,'#cdd5dc');sg.addColorStop(.6,'#e4e4df');sg.addColorStop(1,'#f3ece0');ctx.fillStyle=sg;
  ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=40)ctx.lineTo(x,650+Math.sin(x/260)*8+noise(x/90)*10);ctx.lineTo(W,H);ctx.fill();
  wall(668,16,240,380,'#5d6b7a',1.2,70,.95);fogBand(620,760,'#e6e3db',.42);
  // what the battle left: low drifts over the fallen, spears and a banner, all throwing long shadows to the left
  ctx.save();ctx.filter='blur(1.4px)';
  for(const [mx,my,mw,mh] of [[260,770,190,34],[620,748,150,26],[930,782,240,40],[1240,756,130,22],[470,800,120,20]]){
    ctx.save();ctx.globalAlpha=.5;ctx.fillStyle='#8e9fb4';ctx.beginPath();ctx.ellipse(mx-mw*.9,my+mh*.35,mw*1.2,mh*.36,-.05,0,TAU);ctx.fill();ctx.restore();
    const gg=ctx.createLinearGradient(mx-mw/2,0,mx+mw/2,0);gg.addColorStop(0,'#aab7c6');gg.addColorStop(1,'#f4efe6');ctx.fillStyle=gg;ctx.beginPath();ctx.ellipse(mx,my,mw/2,mh,0,Math.PI,TAU);ctx.fill();}
  ctx.lineCap='round';
  for(const [sx,sy,l,a,w] of [[340,772,150,-.45,3],[700,750,120,.35,2.6],[1010,786,190,-.2,3.4],[1180,758,90,.6,2.4],[860,790,110,-.75,2.6],[520,800,80,.25,2.2]]){
    ctx.strokeStyle='rgba(120,138,160,.45)';ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-l*1.6,sy+l*.18);ctx.stroke();
    ctx.strokeStyle='#3c4148';ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.sin(a)*l,sy-Math.cos(a)*l);ctx.stroke();}
  // the banner: a torn strip of madder cloth on a broken pole
  ctx.strokeStyle='#3a3d42';ctx.lineWidth=3.6;ctx.beginPath();ctx.moveTo(1100,792);ctx.lineTo(1124,580);ctx.stroke();
  ctx.fillStyle='#8f3b2c';ctx.beginPath();ctx.moveTo(1123,590);ctx.bezierCurveTo(1060,600,1010,586,960,612);ctx.lineTo(990,620);ctx.lineTo(950,640);ctx.bezierCurveTo(1010,628,1060,640,1120,632);ctx.closePath();ctx.fill();
  ctx.fillStyle='#6c2b22';ctx.beginPath();ctx.moveTo(1120,614);ctx.bezierCurveTo(1070,620,1030,618,990,620);ctx.lineTo(950,640);ctx.bezierCurveTo(1010,628,1060,640,1120,632);ctx.fill();
  ctx.restore();
  // light through the trees
  ctx.save();ctx.globalCompositeOperation='screen';ctx.filter='blur(26px)';for(let i=0;i<6;i++){const x0=1500+i*90+hash(i)*60,w=30+hash(i*3)*70;ctx.fillStyle=`rgba(255,240,215,${.12+.1*hash(i*5)})`;ctx.beginPath();ctx.moveTo(x0+500,-40);ctx.lineTo(x0+500+w,-40);ctx.lineTo(x0-900+w*3,1000);ctx.lineTo(x0-900,1000);ctx.fill();}ctx.restore();
  // the great spruce in front, and the shadows it and the hidden man throw across the snow
  const TX=1640,TB=872;
  const sh=layerCanvas(),g=sh.getContext('2d');g.fillStyle='#000';
  g.beginPath();g.moveTo(TX-110,TB+4);g.lineTo(TX+90,TB+14);g.lineTo(TX-900,TB+130);g.lineTo(TX-1500,TB+190);g.lineTo(TX-1520,TB+120);g.closePath();g.fill();
  g.fillRect(TX-1100,TB-38,970,5);
  ctx.save();ctx.filter='blur(4px)';ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.45;
  const tintC=layerCanvas(),tg=tintC.getContext('2d');tg.drawImage(sh,0,0);tg.globalCompositeOperation='source-in';tg.fillStyle='#7088aa';tg.fillRect(0,0,W,H);ctx.drawImage(tintC,0,0);ctx.restore();
  // boot prints coming in from the left, going round behind the trunk
  for(let i=0;i<14;i++){const k=i/13,x=lerp(-20,TX-150,k)+(i%2?12:-12)*(1-k*.5),y=lerp(930,846,Math.pow(k,.8))+(i%2?6:-6)*(1-k),s=lerp(1.25,.62,k);
    ctx.save();ctx.translate(x,y);ctx.scale(s,s*.36);ctx.fillStyle='#f7f2ea';ctx.beginPath();ctx.ellipse(-4,-4,30,20,0,0,TAU);ctx.fill();
    const fg=ctx.createLinearGradient(-26,0,26,0);fg.addColorStop(0,'#d3d8de');fg.addColorStop(.5,'#a8b7c9');fg.addColorStop(1,'#8397b0');ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(0,0,26,16,0,0,TAU);ctx.fill();ctx.restore();}
  // the trunk: an uneven edge, flaring into roots, plated bark, a warm rim where the sun catches it
  const edge=(y,side)=>side*(86+Math.pow(Math.max(0,(y-TB+170)/170),2.4)*70)+(noise(y/40+side*9)-.5)*10;
  ctx.save();ctx.beginPath();for(let y=-20;y<=TB+16;y+=8)ctx.lineTo(TX+edge(y,-1),y);for(let y=TB+16;y>=-20;y-=8)ctx.lineTo(TX+edge(y,1),y);ctx.closePath();
  ctx.fillStyle='#2a2828';ctx.fill();ctx.clip();
  for(let i=0;i<160;i++){const x=TX-150+hash(i*1.7)*300,y0=hash(i*2.3)*TB-40,l=60+hash(i*3.9)*180,w=2+hash(i)*4;ctx.strokeStyle=hash(i*5.1)>.45?'rgba(84,76,70,.5)':'rgba(12,11,12,.65)';ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y0);ctx.bezierCurveTo(x+(hash(i*7)-.5)*14,y0+l*.33,x+(hash(i*8)-.5)*14,y0+l*.66,x+(hash(i*9)-.5)*10,y0+l);ctx.stroke();}
  const rim=ctx.createLinearGradient(TX+40,0,TX+150,0);rim.addColorStop(0,'rgba(255,200,150,0)');rim.addColorStop(1,'rgba(236,178,128,.8)');ctx.fillStyle=rim;ctx.fillRect(TX,-20,260,TB+40);
  const dk=ctx.createLinearGradient(TX-150,0,TX-40,0);dk.addColorStop(0,'rgba(0,0,0,.35)');dk.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=dk;ctx.fillRect(TX-260,-20,220,TB+40);
  ctx.restore();
  // a drift banked against the roots
  ctx.save();ctx.filter='blur(3px)';const dg=ctx.createLinearGradient(0,TB-34,0,TB+50);dg.addColorStop(0,'#fbf8f2');dg.addColorStop(1,'rgba(232,234,234,0)');ctx.fillStyle=dg;ctx.beginPath();ctx.ellipse(TX-10,TB+22,300,52,0,Math.PI,TAU);ctx.fill();ctx.restore();
  // the spear he holds, its butt in the snow behind the trunk, a rag of madder cloth tied below the head
  ctx.save();ctx.translate(TX-128,TB-40);ctx.rotate(-.035);ctx.fillStyle='#24211f';ctx.fillRect(-4,-640,8,640);
  ctx.beginPath();ctx.moveTo(0,-748);ctx.lineTo(13,-690);ctx.lineTo(6,-640);ctx.lineTo(-6,-640);ctx.lineTo(-13,-690);ctx.closePath();ctx.fillStyle='#3d4249';ctx.fill();
  ctx.beginPath();ctx.moveTo(0,-748);ctx.lineTo(0,-640);ctx.lineTo(13,-690);ctx.closePath();ctx.fillStyle='#8b949c';ctx.fill();ctx.fillStyle='#1a1817';ctx.fillRect(-7,-640,14,12);
  ctx.fillStyle='#8f3b2c';ctx.beginPath();ctx.moveTo(-4,-618);ctx.bezierCurveTo(-40,-610,-70,-596,-104,-600);ctx.lineTo(-86,-588);ctx.lineTo(-112,-574);ctx.bezierCurveTo(-70,-580,-36,-590,-4,-598);ctx.fill();
  ctx.fillStyle='#f3efe8';ctx.fillRect(-5,-642,10,3);ctx.restore();
  // breath drifting out past the trunk's edge: whoever knelt here is still there, out of sight
  ctx.save();ctx.filter='blur(8px)';for(let i=0;i<12;i++){const k=i/11,x=TX-112-k*330-hash(i)*16,y=732-k*170+Math.sin(i*1.9)*12,r=12+k*60;ctx.globalAlpha=(.8*(1-k)+.18);ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(x,y,r*1.35,r*.8,-.35,0,TAU);ctx.fill();}ctx.restore();
  // two heavy boughs overhead, near the lens and soft
  const BL=layerCanvas(),bg2=BL.getContext('2d');bg2.lineCap='round';
  for(const [bx,by,L,dr,seed] of [[TX+20,70,760,160,3],[TX+40,-40,560,110,7]]){const at=u=>[bx-L*u,by+dr*u*u];
    bg2.strokeStyle='#1c1f23';bg2.lineWidth=12;bg2.beginPath();for(let k=0;k<=20;k++){const [x,y]=at(k/20);k?bg2.lineTo(x,y):bg2.moveTo(x,y);}bg2.stroke();
    for(let k=0;k<70;k++){const u=k/70,[x,y]=at(u),l=(34+hash(seed+k)*48)*(1-u*.5);bg2.lineWidth=7*(1-u*.4);bg2.beginPath();bg2.moveTo(x,y);bg2.quadraticCurveTo(x-l*.2,y+l*.5,x-l*.45-6,y+l);bg2.stroke();}
    bg2.strokeStyle='#efeee9';bg2.lineWidth=9;bg2.beginPath();for(let k=0;k<=18;k++){const [x,y]=at(k/18*.94);k?bg2.lineTo(x,y-7):bg2.moveTo(x,y-7);}bg2.stroke();}
  ctx.save();ctx.filter='blur(4px)';ctx.drawImage(BL,0,0);ctx.restore();
  // falling snow, the nearest flakes big and soft
  snowfall(t,80,{seed:5,speed:26,wind:-18,size:2.4,alpha:.55});
  ctx.save();ctx.filter='blur(7px)';for(let i=0;i<9;i++){ctx.globalAlpha=.35+.3*hash(i);ctx.fillStyle='#fff8ee';ctx.beginPath();ctx.arc(hash(i*4.4)*W,hash(i*8.1)*700,8+hash(i*2)*14,0,TAU);ctx.fill();}ctx.restore();
  grade(0);filmGrain();if(opt.caption===false)return;
  sampleCaption('我死死地攥着手里的长枪，弓着身子，跪在牲畜和人的尸体中……','I gripped my spear for dear life, hunched over, kneeling among the bodies of beasts and men...');
};

function sampleCaption(zh,en){ctx.save();const g=ctx.createLinearGradient(0,H-230,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=g;ctx.fillRect(0,H-230,W,230);ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=12;
  const zl=wrapZh(zh,36,1500),el=wrapEn(en,21,1560),y=H-70-el.length*30-(zl.length-1)*50;
  zl.forEach((l,i)=>text(l,W/2,y+i*50,{size:36,weight:500,color:'#f7f4ee',align:'center',font:SERIF,spacing:1}));
  el.forEach((l,i)=>text(l,W/2,y+(zl.length-1)*50+44+i*30,{size:21,color:'rgba(236,238,240,.9)',align:'center',font:'Georgia,serif'}));ctx.restore();}
