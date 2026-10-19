// 《炉火祈愿》× 文舟 0.9.9, storyboard v8 (storyboard.md): every frame woven on the loom (samples/loom.js) from the
// designs of storyboard/frames.js, animated over time. renderAt(t) here replaces the first film's in scenes.js;
// the interface layers (glossary, relations, map toolbar, outline) and subtitles still come from scene.html/scenes.js.
// The film is one long hanging seen through a window: the borders stay where they are, and the camera moves over the
// picture between them. Zooms and pans keep the picks fixed to the design; the shots run on into one another.

const flick=t=>.14+.22*Math.max(0,Math.sin(t*2.1)*Math.sin(t*3.7+1));
const W2=W/2,H2=H/2,SEED=3;
const black=(a)=>{if(a<=0)return;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=clamp(a);rect(0,0,W,H,'#000000');ctx.restore();};
// a value eased from key to key: [[t, v], …]
function keys(t,K){if(t<=K[0][0])return K[0][1];for(let i=1;i<K.length;i++)if(t<K[i][0]){const [t0,v0]=K[i-1],[t1,v1]=K[i];return lerp(v0,v1,easeInOut((t-t0)/(t1-t0)));}return K[K.length-1][1];}

// ================================================================ the window: borders woven apart, the picture between
const TOP=124,BOT=928;
// The bands, as one strip of cloth: texts [[words, x], …] sit along it at x (the middle of the words); off scrolls it.
function bandDesign(texts,off){
  rect(0,0,W,H,DYE.wool);rect(0,0,W,TOP,DYE.madder);rect(0,16,W,TOP-32,DYE.weld);rect(0,26,W,TOP-52,DYE.indigo);
  ctx.save();ctx.font=`700 64px ${SERIF}`;ctx.letterSpacing='14px';ctx.fillStyle=DYE.bone;ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [w,x] of texts){const sx=x-off;if(sx>-1500&&sx<W+1500)ctx.fillText(w,sx,TOP/2+4);}ctx.restore();
  for(const [,x] of texts)for(const dx of [-890,890]){const sx=x+dx-off;if(sx>-40&&sx<W+40)wdisc(sx,TOP/2,20,DYE.madder,{line:DYE.bone,lw:7});}
  wBorderBottom({y:BOT,h:H-BOT,off});
}
// words: an inscription, a list of them along the strip, or {a, b, k} while one changes into the other
const BAND=layerCanvas();
function bandsAt(t,words,{off=0,light=1}={}){
  const T=w=>typeof w==='string'?[[w,W2+off]]:w,one=w=>weave(()=>bandDesign(T(w),off),{seed:SEED,flicker:flick(t),light,x0:-off});
  if(words&&words.k!==undefined){const k=sm(clamp(words.k));if(k<=0)return one(words.a);if(k>=1)return one(words.b);
    // the old words fade out of the band and only then the new ones fade in, so the two never lie over each other
    const bare=w=>T(w).map(([,x])=>['',x]),[w0,w1,a]=k<.5?[words.a,bare(words.a),1-2*k]:[bare(words.b),words.b,2-2*k];
    one(w0);BAND.getContext('2d').drawImage(canvas,0,0);one(w1);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=a;ctx.drawImage(BAND,0,0);ctx.restore();}
  else one(words);
}
const change=(t,a,b,t0,dur=1)=>({a,b,k:seg(t,t0,t0+dur)});
// One frame: the picture woven through the camera (z, ox, oy: world point p lands on the screen at o + z·p), then
// cover() drawn over it in screen coordinates and woven with it, post() laid on unwoven; then the bands round it.
const INNER=layerCanvas();
function woven(t,draw,{z=1,ox=0,oy=0,gx=ox,gy=oy,light=1,cover=null,post=null,words='',band=0}={}){
  weave(()=>{ctx.save();ctx.translate(ox,oy);ctx.scale(z,z);draw();ctx.restore();if(cover)cover();},{seed:SEED,flicker:flick(t),light,zoom:z,x0:gx,y0:gy});
  if(post){ctx.save();ctx.setTransform(1,0,0,1,0,0);post();ctx.restore();}
  const g=INNER.getContext('2d');g.drawImage(canvas,0,0);
  bandsAt(t,words,{off:band,light});
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(0,TOP,W,BOT-TOP);ctx.clip();ctx.drawImage(INNER,0,0);ctx.restore();
  grade(0);
}
const centre=(z,x,y)=>({z,ox:W2-z*x,oy:H2-z*y});     // the camera on world point (x, y)
const about=(z,cx,cy)=>({z,ox:cx-z*cx,oy:cy-z*cy});  // the camera z times closer, (cx, cy) staying where it is
// The loom's way of changing a picture: the new one woven over the old from the top down, behind a scan line.
const SCAN=layerCanvas();
function reweave(t,t0,dur,oldFn,newFn){
  const k=seg(t,t0,t0+dur);if(k<=0)return oldFn();if(k>=1)return newFn();
  oldFn();SCAN.getContext('2d').drawImage(canvas,0,0);newFn();
  const y=Math.round(k*H);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(SCAN,0,y,W,H-y,0,y,W,H-y);
  ctx.fillStyle=rgba(DYE.weldL,.8);ctx.fillRect(0,y-3,W,6);ctx.restore();
}
// Snow falling as woven rosettes, drifting with the wind.
function wovenSnow(t,n,{seed=0,speed=40,wind=-20,size=1,y0=60,y1=1010,col=DYE.bone}={}){
  for(let i=0;i<n;i++){const z=.6+.4*hash(seed+i*2.7),x=(((hash(seed+i)*W+t*wind*z)%W)+W)%W,y=y0+(((hash(seed+i*1.3)*(y1-y0)+t*speed*z)%(y1-y0))+(y1-y0))%(y1-y0);wFlake(x,y,size*(.6+.5*z),col);}}
function wGroundSpan(y,x0,x1,cols){cols.forEach((c,i)=>{const p=[];for(let x=x0;x<=x1;x+=60)p.push(x,y+i*26+Math.sin(x/130+i*1.7)*10+Math.sin(x/47+i)*4);p.push(x1,H+60,x0,H+60);path(p);ctx.fillStyle=c;ctx.fill();ctx.strokeStyle=DYE.black;ctx.lineWidth=7;ctx.stroke();});}

// ================================================================ 01 · the logo, as the 0.9.8 film brings it in
function logoScene(t,{end=false}={}){
  const g=ctx.createRadialGradient(W*.7,H*.3,0,W*.7,H*.3,1300);g.addColorStop(0,'#1b3a2b');g.addColorStop(.45,'#0f2219');g.addColorStop(1,'#08120d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  glow(400+Math.sin(t*.13)*120,200+Math.cos(t*.1)*60,700,'#8ad0a8',.16);
  const wave=(amp,len,speed,base,phase,col)=>{ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=24)ctx.lineTo(x,H-260+base+amp*Math.sin(x/len+t*speed+phase)+amp*.4*Math.sin(x/(len*.43)-t*speed*1.3));ctx.lineTo(W,H);ctx.fillStyle=col;ctx.fill();};
  wave(18,180,.6,140,0,'rgba(138,208,168,.06)');wave(14,240,-.45,170,2,'rgba(138,208,168,.05)');wave(10,140,.8,205,4,'rgba(47,163,107,.07)');
  const lt=end?t-161:t;
  if(end)for(let i=0;i<22;i++){const age=((lt*.16+hash(i*3.3))%1),x=W*(.15+.7*hash(i*1.7))+Math.sin(lt*.8+i)*30,y=H+20-age*700,r=2+hash(i)*3;ctx.save();ctx.globalAlpha=Math.sin(Math.PI*age)*.8*seg(lt,.3,1.3);glow(x,y,r*6,'#ff7a1e',.45);ctx.fillStyle='#ffb46a';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
  const [ix,iy,is,i0,i1]=end?[885,200,150,.3,1.5]:[870,250,180,.3,1.5],ip=easeOut(seg(lt,i0,i1)),sc=end?.7+.3*ip:.6+.4*ip;
  ctx.save();ctx.globalAlpha=ip;ctx.translate(ix+is/2,iy+is/2);ctx.rotate(end?0:(1-ip)*-8*Math.PI/180);ctx.scale(sc,sc);ctx.translate(-is/2,-is/2);
  ctx.shadowColor='rgba(35,116,78,.55)';ctx.shadowBlur=80;ctx.shadowOffsetY=30;fillRR(0,0,is,is,is*.28,'#257c67');ctx.shadowColor='transparent';ctx.scale(is/192,is/192);ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();
  const size=end?92:96,ty=end?486:572,tw=measure('文舟 ',size,700),vw=measure('Vela',size,300),p1=easeOut(seg(lt,end?.8:.9,end?1.6:1.7)),p2=easeOut(seg(lt,end?1.2:1.25,end?2:2.05));
  text('文舟 ',W2-(tw+vw)/2,ty+(1-p1)*30,{size,weight:700,color:'#eef6f1',spacing:2,a:p1});text('Vela',W2-(tw+vw)/2+tw,ty+(1-p1)*30,{size,weight:300,color:'#8ad0a8',spacing:2,a:p1});
  if(end){text('0.9.9 · 让故事，自此起航。',W2,566+(1-p2)*30,{size:30,color:'#a9c2b4',align:'center',font:SERIF,spacing:4,a:p2});
    const p3=easeOut(seg(lt,2.2,3.2));if(p3>0){ctx.save();ctx.globalAlpha=p3;const bw=420;strokeRR(W2-bw/2,640,bw,58,29,'rgba(138,208,168,.4)',1.2);text('现已上架鸿蒙应用市场',W2,678,{size:24,color:'#8ad0a8',align:'center',spacing:3});ctx.restore();}}
  else text('0.9.9 · 开源小说创作与阅读工具',W2,650+(1-p2)*30,{size:27,color:'#a9c2b4',align:'center',a:p2});
}

// ================================================================ 03–08 · one strip: the battle, the great tree, Arthur's meadow
// As on the Bayeux hanging a tree parts one scene from the next: the camera pans along the strip past Riga's tree
// into Arthur's meadow, and after the roar tilts up one of its three tall trees to Sinfran on the top of it.
// Riga's breath comes in slow puffs from behind the tree, every three seconds or so.
function breathAt(x,y,t,{s=1,len=300}={}){const ph=((t+.4)/3)%1,drift=ph*60*s;
  // each band reaches out and draws back in again, the outer ones a little later, so nothing appears or vanishes at once
  for(let k=0;k<3;k++){const q=clamp((ph-k*.06)/.8),grow=Math.sin(Math.PI*q)*(q>0&&q<1?1:0);if(grow<.06)continue;const p=[];for(let i=0;i<=10;i++){const u=i/10*grow;p.push(x-drift-u*len,y-k*30*s-u*len*.25-ph*40+Math.sin(u*9+k+t)*14*s);}wcurve(p,10*s,k===1?DYE.bone:DYE.skyL,{lw:5});}}
// the winter field of storyboard 03, carried on to the right as far as the strip needs it
function winterSpan(x1,ground=800){rect(-100,0,x1+200,H,DYE.wool);const X=x1+40,dy=30*(X+40)/(W+80);
  for(let i=0;i<2;i++){const y=250+i*170;wpoly([-40,y,X,y-dy,X,y+44-dy,-40,y+44],DYE.sky,{lw:6});}
  for(let i=0;i*240-40<X;i++){const x=i*240-40;wpoly([x,ground+8,x+130,ground-250+hash(i)*80,x+260,ground+8],i%2?DYE.sky:DYE.woad,{lw:7});wpoly([x+130,ground-250+hash(i)*80,x+96,ground-190+hash(i)*80,x+164,ground-190+hash(i)*80],DYE.bone,{line:null});}
  wGroundSpan(ground,-60,x1+60,[DYE.bone,DYE.sky,DYE.bone]);}
function battleAt(t){
  winterSpan(DIV+200);
  for(const [tx,th,sd] of [[110,560,21],[360,420,22],[640,360,23],[900,330,24],[1150,380,25]])wTree(tx,812,th,{seed:sd,...WINTER});
  for(const [mx,my,mw] of [[300,900,220],[820,930,200],[1140,900,170]])wshape([mx-mw/2,my+10,mx-mw*.3,my-26,mx,my-36,mx+mw*.32,my-24,mx+mw/2,my+10],DYE.bone,{lw:7});
  for(const [sx,sy,l,a] of [[360,900,170,-.45],[700,880,140,.35],[980,910,200,-.2],[1220,890,110,.6]])brokenSpear(sx,sy,l,a);
  fallenHorse(560,926,1.0);shield(300,884,52);shield(1130,890,46,.42,DYE.woad,DYE.bone);helmet(860,930,.9,-.5);
  // Riga's tree: his spear stands beside it, his breath comes out past it
  wTree(1650,850,820,{seed:26,...WINTER});standingSpear(1480,860,520,{rag:1+.12*Math.sin(t*4.3)+.06*Math.sin(t*9.1)});breathAt(1530,640,t);
  wovenSnow(t,26,{seed:3,speed:36,wind:-14,size:.9});
}
// Arthur's meadow (its own coordinates; the strip puts it at BX, and it covers the strip from DIV on): spring at the
// foot, winter at the tops of the trees
const DIV=2300,BX=2688;                     // the tree between the two scenes, out of the picture until the pan; where the meadow is put
const TALL3=[[170,2150,41],[1560,2000,42],[1860,1900,43]],PERCH=[1560,812-2000];
const leafAt=a=>a<.3?DYE.green:a<.46?DYE.madder:a<.6?DYE.ochre:a<.76?DYE.walnut:DYE.bone; // spring, blood, autumn, frost
function tallTree(x,y,h,sd){
  wcurve([x,y+4,x+(hash(sd*3)-.5)*18,y-h*.35,x-(hash(sd)-.5)*14,y-h*.7,x,y-h],34,DYE.walnut);
  for(let i=0;i<14;i++){const k=.12+i*.058,d=i%2?1:-1,by=y-h*k,ex=x+d*h*.09,ey=by-h*.05;wcurve([x,by+h*.03,x+d*h*.05,by-h*.005,ex,ey],14,DYE.walnut,{lw:6});
    wPalmette(ex,ey,90,-Math.PI/2+d*.7,leafAt((y-ey)/h));}
  wspiral(x,y-h*.08,30,DYE.black,{lw:6,dir:hash(sd)>.5?1:-1});
}
function meadowAt(t){
  rect(DIV-BX,-2400,BX+W+500-DIV,H+2500,DYE.wool);
  // far up: snow peaks behind the trees, two bands of cloud, snow falling
  for(let i=0;i<2;i++){const y=-1420+i*130;wpoly([-500,y,W+500,y-30,W+500,y+14,-500,y+44],DYE.sky,{lw:6});}
  for(let i=0;i<12;i++){const x=i*240-560,g=-900,pk=g-260+hash(i+40)*80;wpoly([x,g+8,x+130,pk,x+260,g+8],i%2?DYE.sky:DYE.woad,{lw:7});wpoly([x+130,pk,x+96,pk+60,x+164,pk+60],DYE.bone,{line:null});}
  wshape([-500,-896,W+500,-896,W+500,-870,-500,-870],DYE.bone,{lw:6,ten:.2});
  for(let i=0;i<70;i++){const y=-1700+(((hash(i*7.1)*1300+t*30)%1300)),x=-300+hash(i*3.3)*(W+600)+Math.sin(t*.7+i)*20;wFlake(x,y,.8+hash(i)*.5,y<-1000?DYE.bone:DYE.sky);}
  // the sun over the meadow
  const sx=330,sy=300,sp=t*.15;for(let i=0;i<16;i++){const a=i/16*TAU+sp;wpoly([sx+Math.cos(a-.1)*70,sy+Math.sin(a-.1)*70,sx+Math.cos(a)*(i%2?104:124),sy+Math.sin(a)*(i%2?104:124),sx+Math.cos(a+.1)*70,sy+Math.sin(a+.1)*70],i%2?DYE.madder:DYE.weld,{lw:6});}
  wdisc(sx,sy,66,DYE.weld);wspiral(sx,sy,44,DYE.madder,{lw:10});
  for(const [x,h,sd] of TALL3)tallTree(x,812,h,sd);
  wGroundSpan(812,DIV-BX,W+500,[DYE.green,DYE.ochre,DYE.moss]);
}
function bearBreathParts(t){const melt=seg(t,25.5,29.6);
  for(const [sx,sy,sw] of [[1250,836,220],[1490,846,150]]){const w=sw*(1-.6*melt);wshape([sx-w/2,sy+8,sx-w*.3,sy-30*(1-.5*melt),sx,sy-40*(1-.5*melt),sx+w*.32,sy-28*(1-.5*melt),sx+w/2,sy+8],DYE.bone,{lw:7});}
  const br=(t-23)*1.4;for(let k=0;k<3;k++){const p=[],grow=.5+.5*Math.abs(Math.sin(br+k*.6));for(let i=0;i<=10;i++){const u=i/10*grow;p.push(1110+u*260,690+k*36+u*80+Math.sin(u*9+k+t*3)*14);}wcurve(p,11,k===1?DYE.weld:DYE.madder,{lw:6});}
  for(const [fx,fy,at] of [[1180,862,26.4],[1300,868,27.6],[1400,858,28.6]]){const g=easeOut(seg(t,at,at+1.2));if(g>0)wSprout(fx,fy+(1-g)*8,1.2*g);}
  wBear4(760,846,1.3);
}
function bearRoarParts(t){const lt=t-30.15;
  for(const [sx,sy,sw] of [[640,830,150],[1300,836,190],[360,850,120]]){wshape([sx-sw/2,sy+8,sx-sw*.3,sy-22,sx,sy-30,sx+sw*.32,sy-20,sx+sw/2,sy+8],DYE.bone,{lw:7});}
  for(const [fx,fy,fs,c] of [[740,848,1.1,DYE.madder],[790,860,.9,DYE.weld],[1210,850,1,DYE.weld],[1180,866,.8,DYE.madder],[560,866,.9,DYE.madder]])wFlower(fx,fy,fs,c);
  for(const [fx,fy] of [[690,858],[860,866],[1120,858],[1250,870],[1010,872]])wSprout(fx,fy,1.1);
  const mx=1000+110*.98,my=868-608*.98,roar=lt<3.2;
  if(roar)for(let i=0;i<3;i++){const r=70+i*46+((lt*90)%46);ctx.save();ctx.beginPath();ctx.arc(mx,my,r,-.8,.3);ctx.strokeStyle=i===1?DYE.madder:DYE.weld;ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();ctx.restore();}
  for(const [a,l,c] of [[-.7,130,DYE.madder],[-.35,170,DYE.weld],[0,140,DYE.madder]]){const p=[];for(let k=0;k<=10;k++){const r=60+k/10*l*(roar?1:.6),w=Math.sin(k*1.25+t*8)*16*(k/10);p.push(mx+Math.cos(a)*r-Math.sin(a)*w,my+Math.sin(a)*r+Math.cos(a)*w);}wcurve(p,12,c,{lw:6});}
  wBear(1000,868,.98);
  // the birds start up at the roar and fly on up the trees ahead of the camera
  for(const [bx,by,bs] of [[1500,240,1.1],[1600,290,.9],[1440,330,1],[1560,190,.8]])wBird(bx+lt*24,by-lt*172,bs,DYE.indigo,Math.floor(t*6+bx)%2);
}
// 07 · Sinfran on the top of the tree: perched, then three beats of the wings
function sinfranAt(x,y,s,ang){
  if(ang===null)return sinfran(x,y,s);
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();},sh=[0,-120],wing=(rot,far)=>()=>{ctx.save();ctx.translate(sh[0]+(far?30:0),sh[1]-(far?6:0));ctx.rotate(rot+(far?.16:0));ctx.translate(-sh[0],-sh[1]);ctx.scale(.8,.8);shape(SINFRAN.wing,'#fff');ctx.restore();};
  T(()=>{for(const dx of [0,26]){wline([dx+6,-10,dx,10],DYE.black,7);for(const a of [-.6,.1,.8])wline([dx,10,dx+Math.cos(a)*18,10+Math.sin(a)*8+4],DYE.black,5);}})();
  wFigure(T(wing(ang,1)),{fill:DYE.black,inner:null});
  wFigure(T(()=>shape(SINFRAN.body,'#fff')),{fill:DYE.indigo,inner:DYE.sky,band:[10*s,15*s]});
  T(()=>{wshape(SINFRAN.collar,DYE.skyL,{lw:5});wpoly(SINFRAN.bill,DYE.black,{lw:4});wdisc(112,-140,6,DYE.bone,{line:null});})();
  wFigure(T(wing(ang,0)),{fill:DYE.indigo,inner:DYE.sky,band:[9*s,14*s]});
  T(()=>{wspiral(-14,-150,26,DYE.black,{lw:11,dir:-1});wspiral(-14,-150,26,DYE.sky,{lw:5,dir:-1});})();
}
const BEATS=[44,46,48],WING=[null,.9,0,2.3]; // folded, half, raised, down
// Sinfran is drawn facing right; on his treetop he turns to face left, towards the wind he sends over the picture
const facingLeft=(x,draw)=>{ctx.save();ctx.translate(x,0);ctx.scale(-1,1);ctx.translate(-x,0);draw();ctx.restore();};
const beatsDone=t=>BEATS.filter(b=>t>=b).length;
function stripAt(t,{bear,wing}){
  // only what the camera can see; no clipping, as wFigure reads and writes the whole grid: the meadow covers the
  // strip from DIV on, and the tree there, winter on its left and spring on its right, covers the seam
  const c=stripCam(t),l=c.x-W2/c.z,r=c.x+W2/c.z;
  if(l<DIV)battleAt(t);
  if(r>DIV-300){ctx.save();ctx.translate(BX,0);meadowAt(t);if(t<41)(bear==='roar'?bearRoarParts:bearBreathParts)(t);if(t>34)facingLeft(PERCH[0],()=>sinfranAt(PERCH[0],PERCH[1],.96,wing));ctx.restore();}
  if(l<DIV+300&&r>DIV-300)wTree(DIV,850,800,{seed:27,leaf:DYE.sky,leaf2:DYE.green,trunk:DYE.walnut});
}
// the camera along the strip: a slow push towards the tree, the pan into the meadow, the climb to the treetop
const stripCam=t=>{const K=(v)=>keys(t,v);return {
  x:K([[9,960],[20.4,1060],[20.8,1060],[25.4,BX+960],[34.4,BX+960],[40.6,BX+1345]]),
  y:K([[9,540],[20.4,560],[20.8,560],[25.4,540],[34.4,540],[40.6,-1200]]),
  z:K([[9,1],[20.4,1.15],[20.8,1.15],[25.4,1],[34.4,1],[40.6,1.3]])};};
const ARTHVR=[['HIC RIGA IN SILVA LATET',W2],['HIC ARTHVR VRSVS NIVEM SOLVIT',BX+W2]];
function stripWords(t,bear,nb){
  if(bear!=='roar')return ARTHVR;
  if(nb===0){const roar=[ARTHVR[0],['HIC ARTHVR VRSVS BELLVM CLAMAT',BX+W2]],blood=[['HIC SANGVIS ET NIX',BX+W2]];
    return t<38?change(t,roar,blood,35.8):change(t,blood,[['HIC SINFRAN MONEDVLA',BX+W2]],39.6);}
  return change(t,[['HIC SINFRAN VENTVM MOVET',BX+W2]],[['HIC FERRVM HAVARDI CANDET',BX+W2]],55.6);
}
function stripFrame(t,bear,nb){
  const c=stripCam(t),cam=centre(c.z,c.x,c.y);let [sx,sy]=shake(t,30.15,16,5);for(const b of BEATS){const s=shake(t,b,10,6);sx+=s[0];sy+=s[1];}
  const w=windState(t);
  woven(t,()=>stripAt(t,{bear,wing:WING[nb]}),{z:c.z,ox:cam.ox+sx,oy:cam.oy+sy,words:stripWords(t,bear,nb),band:Math.min(c.x,BX+W2)-W2,cover:w.L>0||w.C>0?()=>windAt(t,w):null});
}

// ================================================================ 07–08 · Sinfran's wind, over the picture
// With every beat of his wings the wind blows harder: more streams, broader, faster, more snow; then the great wing
// passes the lens and the wind closes over the whole picture in broad bands; when it opens again, it is on the forge.
function windState(t){const beat=BEATS.reduce((a,b)=>a+easeOut(seg(t,b,b+1.4)),0),gone=easeInOut(seg(t,57,59.8));
  return {L:(.1*seg(t,40,42)+.24*beat+.18*easeOut(seg(t,51.5,52.8)))*(1-gone),C:easeInOut(seg(t,51.9,53.9))*(1-easeInOut(seg(t,57,59.6))),open:t>55};}
// how far the wind has carried things, so that the speed can rise without anything jumping
const WIND_X=(()=>{const a=[0];for(let i=1;i<=600;i++){const t=40+i*.05;a.push(a[i-1]+(500+1100*windState(t).L)*.05);}return a;})();
const windX=t=>{const f=clamp((t-40)/.05,0,599.999),i=Math.floor(f);return lerp(WIND_X[i],WIND_X[i+1],f-i);};
function windAt(t,{L,C,open}){
  const IH=BOT-TOP,X=windX(t);
  // the cover: eight bands across the picture, each widening until they overlap; it closes from the right, where
  // Sinfran is, and opens from the right too, as the wind blows on past to the left
  if(C>0){const n=8,sp=IH/n;for(let i=0;i<n;i++){const yc=TOP+(i+.5)*sp,up=[],dn=[];
    for(let x=-40;x<=W+40;x+=40){const u=x/W,cx=clamp(C*1.6-.6*(open?u:1-u)),h=cx*(sp/2+34);up.push(x,yc-h+Math.sin(x/150+X/220+i*1.3)*16*cx);dn.push(x,yc+h+Math.sin(x/170+X/260+i*2.1)*16*cx);}
    const p=[...up];for(let k=dn.length-2;k>=0;k-=2)p.push(dn[k],dn[k+1]);wpoly(p,i%2?DYE.skyL:DYE.bone,{line:null});}}
  // streams of wind, right to left, coming in one by one as the wind rises
  const m=3+12*L;for(let k=0;k<15;k++){const p=clamp(m-k);if(p<=0)break;const y=TOP+40+((k*.618+.11)%1)*(IH-80),len=(.25+.35*hash(k*1.3))*W*(.6+.6*L),span=W+len+240,
    head=W+120-(((X*(.8+.4*hash(k*2.1))+hash(k*3.7)*span)%span)),pts=[];for(let i=0;i<=12;i++){const u=i/12;pts.push(head+u*len,y+Math.sin(u*6+k+t*3)*(14+20*L)*u);}
    wcurve(pts,(6+16*L)*p,[DYE.bone,DYE.skyL,DYE.sky,DYE.woad][k%4],{lw:4+2*L});}
  // eddies turning in it
  for(let k=0;k<3;k++){const p=clamp((L-.35)*3-k*.4);if(p<=0)continue;const span=W+400,x=W+200-((X*.7+k*700)%span);wspiral(x,TOP+180+k*240,70*p,k%2?DYE.sky:DYE.bone,{lw:12,turns:1.8+(t*.8)%1});}
  // snow, more of it the harder it blows
  const ns=12+150*L;for(let i=0;i<162;i++){const p=clamp(ns-i);if(p<=0)break;const z=.6+.4*hash(i*2.7),span=W+80,x=W+40-(((hash(i)*span+X*z)%span)),y=TOP+((hash(i*1.3)*IH+t*(90+60*z))%IH);wFlake(x,y,p*(.6+.5*z)*(.9+.5*L),i%3?DYE.bone:DYE.sky);}
  // the great wing sweeping across the lens
  const k=seg(t,51.5,52.7);if(k>0&&k<1){const x=lerp(W+900,-1400,easeInOut(k));ctx.save();ctx.translate(x,H*.55);ctx.scale(6,6);wshape(SINFRAN.wing,DYE.indigo,{lw:3});ctx.restore();}
}

// ================================================================ 09–11 · the anvil, closing on the white-hot iron
function anvilAt(t){
  rect(-200,-200,W+400,H+400,DYE.wool);
  wpoly([90,800,90,470,170,380,430,380,510,470,510,800],DYE.sky);wpoly([170,800,170,530,430,530,430,800],DYE.umber);
  for(let i=0;i<5;i++){const fx=200+i*50,fh=(110+hash(i*3)*80)*(.8+.25*Math.sin(t*4+i*1.7));wshape([fx-24,800,fx-8,800-fh*.6,fx,800-fh,fx+12,800-fh*.5,fx+24,800],i%2?DYE.weld:DYE.madder,{lw:6});}
  wpoly([60,380,540,380,440,140,160,140],DYE.walnut);
  for(const [tx,ty,k] of [[1400,240,0],[1490,230,1],[1580,250,0],[1670,230,1]]){wline([tx,ty-40,tx,ty],DYE.black,5);if(k){wline([tx,ty,tx-14,ty+150,tx-10,ty+160],DYE.black,8);wline([tx,ty,tx+14,ty+150,tx+10,ty+160],DYE.black,8);}else{wline([tx,ty,tx,ty+120],DYE.walnut,12);wpoly([tx-26,ty+120,tx+26,ty+120,tx+26,ty+150,tx-26,ty+150],DYE.black);}}
  wGround(850,{cols:[DYE.walnut,DYE.umber,DYE.walnut]});
  wObj(()=>wpoly([800,880,1120,880,1090,690,830,690],'#fff',{line:null}),DYE.walnut,DYE.ochre);
  wObj(()=>{ctx.save();ctx.translate(960,690);shape(ANVIL,'#fff');ctx.restore();},DYE.black,DYE.woad);
  for(let k=3;k>=1;k--){const pulse=Math.sin(t*2.6-k*.9)*8;ctx.save();ctx.beginPath();ctx.ellipse(1000,480,140+k*60+pulse,46+k*22+pulse*.4,0,Math.PI,TAU);ctx.strokeStyle=k===1?DYE.weld:k===2?DYE.madder:DYE.rust;ctx.lineWidth=12;ctx.stroke();ctx.restore();}
  wshape([880,500,1120,500,1124,470,876,470],DYE.bone,{line:DYE.weld,lw:10,ten:.2});wline([900,486,1100,486],DYE.weldL,6);
  // steam going up off the iron in wavy bands, each rising and thinning
  for(let k=0;k<5;k++){const ph=((t*.45+k/5)%1),len=Math.sin(Math.PI*ph),p=[];if(len<.08)continue;for(let i=0;i<=8;i++){const u=i/8*len;p.push(910+k*45+Math.sin(u*8+k+t*2.5)*20,462-ph*120-u*260);}wcurve(p,10,k%2?DYE.bone:DYE.skyL,{lw:5});}
}
// the camera is already close when the wind opens on the forge, and keeps closing on the iron until it is all white
const anvilZoom=t=>t<82?keys(t,[[56,1.3],[71,1.6],[82,3]]):lerp(3,9,easeIn(seg(t,82,86.4)));
const whiteIn=a=>{if(a<=0)return;ctx.save();ctx.globalAlpha=clamp(a);rect(0,TOP,W,BOT-TOP,'#fbf7ee');ctx.restore();};
const ROAD_WORDS='HIC HAVARD ET RIGA PROFICISCVNTVR';

// ================================================================ 12–18 · two threads up the snow road
const TV=150,T12=86.6,WSTOP=97.8;            // the threads' walking speed (px/s), when they come in, when they stop
const walked=t=>{const t1=WSTOP-.8;if(t<t1)return TV*Math.max(0,t-T12);const u=Math.min(1,(t-t1)/.8);return TV*(t1-T12+.8*(u-u*u/2));};
const greenY=t=>H+40-walked(t),blueY=t=>greenY(t)+330;  // world y of each head while walking
const softMax=(x,w)=>(x+Math.sqrt(x*x+w*w))/2-w/2,offWalk=t=>softMax(300-greenY(t),160);   // the camera rises once green reaches y 300
function roadWalkAt(t){const off=offWalk(t);topField(off);
  yarn(upPts(H+40,Math.max(-40,greenY(t)+off),-56,off),TH.havard);if(blueY(t)+off<H+40)yarn(upPts(H+40,blueY(t)+off,56,off),TH.riga);}
// the twine: the run-in to the twist and as much of the twist as has been made by time t (k 0..1)
function twineAt(off,k){
  const cx=y=>roadX(y,off),ph=y=>(TW0-y)/(TW0-TW1)*TWN*Math.PI,lead=side=>sampleCurve(y=>[cx(y)+side*lerp(TWA,56,easeInOut(clamp((y-TW0)/160))),y],H+40,TW0,30);
  yarn(lead(-1),TH.havard);yarn(lead(1),TH.riga);const top=TW0-(TW0-TW1)*k;
  for(let i=0;i<TWN;i++){const y0=TW0-(TW0-TW1)*i/TWN;let y1=TW0-(TW0-TW1)*(i+1)/TWN;if(y0<=top)break;y1=Math.max(y1,top);
    const sg=s=>sampleCurve(y=>[cx(y)+s*TWA*Math.cos(ph(y)),y],y0+2,y1-2,14),fs=i%2?-1:1;yarn(sg(-fs),i%2?TH.riga:TH.havard);yarn(sg(fs),i%2?TH.havard:TH.riga);}
}
// then the blue head runs up in surges, one to each stride of the gallop, landing on the beat
const RUN0=132.3,STRIDE=360,RUN_HEAD=420;
const runD=t=>{if(t<=RUN0)return 0;const f=gallopPhase(t)-gallopPhase(RUN0);return STRIDE*(f-Math.sin(TAU*f)/TAU);};
const blueRunY=t=>TW1-OFF_K-runD(t);                                  // world y of the running blue head
// the camera follows the run at its average pace, so the head stays in the picture, surging ahead and falling back
const runSmooth=t=>t<=RUN0?0:STRIDE*(gallopPhase(t)-gallopPhase(RUN0));
const offRun=t=>t<=RUN0?OFF_K:OFF_K+softMax(runSmooth(t)-(TW1-RUN_HEAD),160);
function roadRunAt(t){
  const off=offRun(t),k=seg(t,116.4,120.2);topField(off);
  if(t<RUN0)return twineAt(OFF_K,k);
  ctx.save();ctx.translate(0,off-OFF_K);twineAt(OFF_K,1);ctx.restore();const bx=y=>roadX(y,off)+30,top=blueRunY(t)+off;
  yarn([roadX(TW1,off)+TWA*Math.cos(TWN*Math.PI),TW1+off-OFF_K,...upPts(TW1+off-OFF_K-30,top,30,off)],TH.riga);
  // snow thrown up behind the head as it runs
  const sp=gallopRate(t);for(let kk=0;kk<5;kk++){const y=top+60+kk*70;wline([bx(y)+70+kk*6,y,bx(y)+70+kk*6,y+30+sp*20],DYE.bone,6);wline([bx(y)-70-kk*6,y+20,bx(y)-70-kk*6,y+50+sp*20],DYE.bone,6);}
}
// night coming on as Riga rides: the picture darkens, last of all round the running head; then the bands go too
function nightAt(t){const d=seg(t,145,158.6);if(d<=0)return;const off=offRun(t),hy=blueRunY(t)+off,hx=roadX(hy,off)+30,R=lerp(1500,240,easeInOut(d)),
  g=ctx.createRadialGradient(hx,hy,0,hx,hy,R);g.addColorStop(0,`rgba(0,0,0,${Math.pow(d,2.4)})`);g.addColorStop(1,`rgba(0,0,0,${Math.min(1,1.3*easeIn(d)+.25*d)})`);ctx.fillStyle=g;ctx.fillRect(0,TOP,W,BOT-TOP);}

// ================================================================ 13 · the map, drawn in as Havard names the places
// Each place is put in with 文舟's 信息点 tool (mapApp below): the houses are woven where the pointer clicks, the name
// once it has been typed into the panel and saved.
const MAP_PTS=PLACES.map(([name,x,y,at],i)=>{const click=i?at()-.6:100.2,save=click+.85+name.length*.12;return {name,x,y:y+40,click,save};});
function mapAt(t){rect(0,0,W,H,DYE.wool);
  for(let i=0;i<10;i++){const p=easeOut(seg(t,99.6+i*.1,100.3+i*.1));if(p<=0)continue;const x=150+i*66+(i%2)*18,y=300+(i%3)*22,h=(90+hash(i)*30)*p;wpoly([x-46,y,x,y-h,x+46,y],i%2?DYE.sky:DYE.woad,{lw:6});wpoly([x,y-h,x-16,y-h*.62,x+16,y-h*.62],DYE.bone,{line:null});}
  const rv=easeInOut(seg(t,99.2,101.4));if(rv>0){const R=[1220,900,1460,720,1380,520,1600,400,1760,310,1700,190,1860,140],n=Math.max(2,Math.round(R.length/2*rv));wcurve(R.slice(0,n*2),22,DYE.woad,{lw:6});}
  [[640,640,5],[1000,600,4],[1260,280,3],[300,540,4],[1380,760,3]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++){const p=easeOut(seg(t,100.2+j*.3+i*.06,100.6+j*.3+i*.06));if(p<=0)continue;const tx=fx+(i-(n-1)/2)*64,ty=fy+(i%2)*16;wline([tx,ty,tx,ty-56*p],DYE.indigo,9);wPalmette(tx,ty-50*p,44*p,-Math.PI/2,i%2?DYE.sky:DYE.bone);}});
  const pts=PLACES.map(p=>[p[1],p[2]+40]);ctx.save();ctx.setLineDash([24,16]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=14;
  for(let i=1;i<pts.length;i++){const p=easeInOut(seg(t,MAP_PTS[i].click-1.1,MAP_PTS[i].click-.1));if(p<=0)continue;const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);ctx.beginPath();for(let k=0;k<=30*p;k++){const u=k/30,x=(1-u)*(1-u)*ax+2*(1-u)*u*mx+u*u*bx,y=(1-u)*(1-u)*ay+2*(1-u)*u*my+u*u*by;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();
  MAP_PTS.forEach(({name,x,y,click,save})=>{const p=seg(t,click,click+.45);if(p<=0)return;const s=back(p);for(let k=0;k<3;k++){const hx=x+(-32+k*32)*s,hy=y+(k===1?-10:0)*s;wpoly([hx-14*s,hy,hx-14*s,hy-24*s,hx+14*s,hy-24*s,hx+14*s,hy],DYE.bone,{lw:5});wpoly([hx-18*s,hy-24*s,hx,hy-46*s,hx+18*s,hy-24*s],DYE.madder,{lw:5});}
    if(t>=save)text(name,x,y+70,{size:44,weight:700,color:DYE.black,font:SERIF,align:'center',spacing:4});});
  const cp=easeOut(seg(t,100.5,101.5));if(cp>0){ctx.save();ctx.translate(1740,790);ctx.scale(cp,cp);ctx.rotate(t*.1);for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([Math.cos(a-.12)*50,Math.sin(a-.12)*50,Math.cos(a)*(i%4?72:110),Math.sin(a)*(i%4?72:110),Math.cos(a+.12)*50,Math.sin(a+.12)*50],i%2?DYE.madder:DYE.weld,{lw:5});}wdisc(0,0,50,DYE.weld);wspiral(0,0,32,DYE.madder,{lw:9});ctx.restore();}
}
// The road seen from higher and higher up until it is a spot on the map at Sakarlet, and later the other way: the
// road picture drawn into the map at scale k (1: the whole picture, as the road shot has it), framed in dark wool.
const HOME=[PLACES[0][1],PLACES[0][2]+40];
function insetAt(k,draw){if(k<=0)return;const cx=lerp(HOME[0],W2,k),cy=lerp(HOME[1],H2,k);
  ctx.save();ctx.translate(cx,cy);ctx.scale(k,k);ctx.translate(-W2,-H2);ctx.beginPath();ctx.rect(0,TOP,W,BOT-TOP);ctx.clip();draw();ctx.restore();
  const lw=9*clamp((1-k)*12);if(lw>.5){ctx.save();ctx.strokeStyle=DYE.black;ctx.lineWidth=lw;ctx.strokeRect(cx-k*W2,cy+k*(TOP-H2),k*W,k*(BOT-TOP));ctx.restore();}}
const outOf=t=>1-easeIn(seg(t,WSTOP,99.4)),into=t=>easeIn(seg(t,115,116.6));

// ================================================================ 文舟 itself: the real app, as ui/capture.mjs captured it
// Each interface moment replays one captured sequence of the web app in a window over the cloth: its frames keyed in
// time and cross-faded, with a pointer drawn going to the points the capture recorded (in CSS px of the capture).
const APP=window.UI_SHOTS||{},APP_IMG={},APP_DPR=1.5;
for(const q of Object.values(APP))for(const [,f] of q.frames)if(!APP_IMG[f]){const i=new Image();i.src='ui/shots/'+f;APP_IMG[f]=i;}
window.uiReady=Promise.all(Object.values(APP_IMG).map(i=>i.decode().catch(()=>{})));
// keys [[t, frame], …] → the frame showing at t, the one before it and how far the new one has faded in (.12 s)
function appAt(keys,t){let i=-1;for(let j=0;j<keys.length;j++)if(t>=keys[j][0])i=j;if(i<0)return null;return {f:keys[i][1],g:i?keys[i-1][1]:null,k:seg(t,keys[i][0],keys[i][0]+.12)};}
// part src [x, y, w, h] (CSS px) of a frame of sequence q, put at (x, y) on the film at s film px per CSS px
function appBlit(q,f,src,x,y,s,a){const img=APP_IMG[APP[q]?.frames[f]?.[1]];if(!img?.complete||!img.naturalWidth)return;ctx.save();ctx.globalAlpha=a;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,src[0]*APP_DPR,src[1]*APP_DPR,src[2]*APP_DPR,src[3]*APP_DPR,x,y,src[2]*s,src[3]*s);ctx.restore();}
// a window of w × h CSS px at (x, y): shadow, rounded corners, the frames cross-fading in it; paint(f, alpha) draws a frame
function appWindow(keys,t,{x,y,w,h,s,a=1,r=14,paint}){const at=appAt(keys,t);if(!at||a<=0)return;const fw=w*s,fh=h*s;
  ctx.save();ctx.globalAlpha=a;ctx.shadowColor='rgba(10,6,2,.6)';ctx.shadowBlur=40;ctx.shadowOffsetY=16;fillRR(x,y,fw,fh,r,'#18211c');ctx.restore();
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,fw,fh,r);ctx.clip();if(at.g!==null&&at.k<1)paint(at.g,a);paint(at.f,at.g!==null?a*at.k:a);ctx.restore();
  strokeRR(x+.5,y+.5,fw-1,fh-1,r,`rgba(138,208,168,${.28*a})`,1);}
// the pointer: path [[t, [x, y]], …] in film px, eased from point to point; a press shows at each time in presses
function pointerAt(path,t){if(t<=path[0][0])return path[0][1];for(let i=1;i<path.length;i++)if(t<path[i][0]){const [t0,p0]=path[i-1],[t1,p1]=path[i],k=easeInOut((t-t0)/(t1-t0));return [lerp(p0[0],p1[0],k),lerp(p0[1],p1[1],k)];}return path[path.length-1][1];}
function pointer(path,t,a,presses=[]){if(a<=0)return;const [x,y]=pointerAt(path,t),press=Math.max(0,...presses.map(c=>1-Math.min(1,Math.abs(t-c)/.15)));cursor(x,y,a,press);}
const inWin=(o,[cx,cy])=>[o.x+cx*o.s,o.y+cy*o.s];

// 术语库 · select the name in the manuscript, 更多 → 加入词库, type the definition, 添加词条; q stretches the timing
function glossaryApp(t,q,t0,{x,y,s=.86,stretch=1}){
  const lt=(t-t0)/stretch;if(lt<0||lt>5.6||!APP[q])return;const A=APP[q].at,[w,h]=APP[q].size,T=v=>t0+v*stretch;
  const open=easeOut(seg(lt,0,.4)),a=open*(1-seg(lt,5.1,5.5)),o={x,y:y+(1-open)*16,s};
  const keys=[[0,0],[1.0,1],[1.2,2],[1.5,3],[1.95,4],[2.3,5],[2.5,6],[2.95,7],[3.15,8],[3.35,9],[3.55,10],[3.75,11],[4.2,12],[4.4,13]].map(([v,f])=>[T(v),f]);
  appWindow(keys,t,{...o,w,h,a,paint:(f,al)=>appBlit(q,f,[0,0,w,h],o.x,o.y,s,al)});
  const P=k=>inWin(o,A[k]),mid=inWin(o,[(A.from[0]+A.to[0])/2,A.from[1]]);
  pointer([[T(.3),inWin(o,[w*.72,h*.8])],[T(.9),P('from')],[T(1.05),mid],[T(1.25),P('to')],[T(1.55),P('to')],[T(1.9),P('more')],[T(2.25),P('add')],[T(2.9),P('field')],[T(3.8),P('field')],[T(4.2),P('submit')]],t,a*seg(lt,.25,.55),[.9,1.95,2.45,2.95,4.35].map(T));
}
// 关系 · drag from Havard's handle to Riga, open the relation, label it 抚养与照料, save
const REL_WIN={x:1236,y:150,s:.8};
function relationsApp(t){if(t<71.6||t>81.8||!APP.relations)return;const A=APP.relations.at,[w,h]=APP.relations.size;
  const open=easeOut(seg(t,71.6,72)),a=open*(1-seg(t,81.3,81.8)),o={...REL_WIN,y:REL_WIN.y+(1-open)*16};
  appWindow([[71.6,0],[73.7,1],[74.3,2],[74.9,3],[75.15,4],[75.35,5],[75.55,6],[75.75,7],[75.95,8],[76.6,9],[76.95,10]],t,{...o,w,h,a,paint:(f,al)=>appBlit('relations',f,[0,0,w,h],o.x,o.y,o.s,al)});
  const path=[[72,inWin(o,[w*.6,h*.85])],[72.5,inWin(o,A.handle)],[72.62,inWin(o,A.handle)],[73.55,inWin(o,A.riga)],[73.85,inWin(o,A.riga)],[74.2,inWin(o,A.edge)],[74.75,inWin(o,A.label)],[76.2,inWin(o,A.label)],[76.6,inWin(o,A.save)]];
  // while the pointer drags, the new line follows it out of the handle
  if(t>72.62&&t<73.7){const [hx,hy]=inWin(o,A.handle),[px,py]=pointerAt(path,t);ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#8ad0a8';ctx.lineWidth=1.6;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(px,py);ctx.stroke();ctx.restore();}
  pointer(path,t,a*seg(t,71.9,72.2),[72.62,73.65,74.25,74.8,76.9]);
}
// 地图 · the 信息点 tool: the woven map is the canvas; the app's toolbar sits above it and its panel at the side
// (both captured as crops: strip and panel give where they were on the app's page)
const MAP_BAR={x:690,y:142,s:.86},MAP_PANEL={x:1586,y:150,s:.78};
function mapApp(t){const M=APP.map;if(!M||t<99.2||t>112.6)return;const bar=M.strip,pan=M.panel,a=easeOut(seg(t,99.2,99.6))*(1-seg(t,112.1,112.6));
  const bo={...MAP_BAR,y:MAP_BAR.y-(1-easeOut(seg(t,99.2,99.6)))*20},bw=bar.width,bh=bar.height;
  appWindow([[99.2,0],[99.9,1]],t,{...bo,w:bw,h:bh,a,r:12,paint:(f,al)=>appBlit('map',f,[0,0,bw,bh],bo.x,bo.y,bo.s,al)});
  // the panel: a new point at each click, its name typed letter by letter
  const keys=[];let f=2;MAP_PTS.forEach(({name,click,save})=>{keys.push([click+.05,f++]);for(let j=0;j<name.length;j++)keys.push([click+.6+j*.12,f++]);});
  const pa=easeOut(seg(t,MAP_PTS[0].click,MAP_PTS[0].click+.3))*(1-seg(t,111.4,111.9)),po={...MAP_PANEL,x:MAP_PANEL.x+(1-pa)*30};
  if(t>MAP_PTS[0].click)appWindow(keys,t,{...po,w:pan.width,h:pan.height,a:pa,r:12,paint:(g,al)=>appBlit('map',g,[0,0,pan.width,pan.height],po.x,po.y,po.s,al)});
  const tool=[bo.x+(M.at.tool[0]-bar.x)*bo.s,bo.y+(M.at.tool[1]-bar.y)*bo.s],name=[po.x+(M.at.name[0]-pan.x)*po.s,po.y+(M.at.name[1]-pan.y)*po.s],save=[po.x+(M.at.save[0]-pan.x)*po.s,po.y+(M.at.save[1]-pan.y)*po.s];
  const path=[[99.4,[W*.52,H*.62]],[99.85,tool]],presses=[99.9];
  MAP_PTS.forEach(({x,y,click,save:sv})=>{path.push([click-.05,[x,y-24]],[click+.4,name],[sv-.25,name],[sv-.05,save]);presses.push(click,click+.45,sv);});
  path.push([111.6,save]);pointer(path,t,a*seg(t,99.3,99.6)*(1-seg(t,111.2,111.6)),presses);
}
// 大纲 · the plot tree growing a node to each third stride, the window scrolling to keep the newest in view; at the
// end the Sakarlet branch is folded. The window is the top and bottom of the capture with the canvas scrolled between.
const OUT_WIN={x:1150,y:140,w:860,h:934,s:700/860};
function outlineApp(t){const o0=APP['outline-1'];if(!o0)return;const inA=easeOut(seg(t,137,137.8)),gone=easeIn(seg(t,152.1,153.2));if(inA<=0||gone>=1)return;
  const o={...OUT_WIN,x:OUT_WIN.x+(1-inA)*120+gone*260},a=inA*(1-gone),[p0,p1]=o0.plane,full=o0.size[1],vis=o.h-p0-(full-p1);
  const keys=OUTLINE_AT.map((at,i)=>[at,i+1]);keys.push([151.35,10]);
  // (folding leaves the canvas where it was, as the app does)
  const want=k=>{const c=APP['outline-'+Math.min(k,9)].cards;return clamp(Math.max(...c.map(v=>v[1]))+36-p0-vis,0,p1-p0-vis);};
  let scroll=0;for(let i=0;i<keys.length;i++){const [at,k]=keys[i];if(t<at)break;scroll=lerp(i?want(keys[i-1][1]):0,want(k),easeInOut(seg(t,at,at+.7)));}
  const paint=(k,al)=>{const q='outline-'+k;appBlit(q,0,[0,0,o.w,p0],o.x,o.y,o.s,al);appBlit(q,0,[0,p0+scroll,o.w,vis],o.x,o.y+p0*o.s,o.s,al);appBlit(q,0,[0,p1,o.w,full-p1],o.x,o.y+(p0+vis)*o.s,o.s,al);};
  appWindow(keys,t,{...o,a,paint});
  const fold=APP['outline-10'].at.fold,fp=[o.x+fold[0]*o.s,o.y+(fold[1]-scroll)*o.s];
  pointer([[150.3,[o.x+o.w*o.s+60,o.y+500]],[151.15,fp],[151.9,fp],[152.6,[o.x+o.w*o.s+80,fp[1]+60]]],t,a*seg(t,150.3,150.7),[151.3]);
}

// ================================================================ the opening burn: from the four corners to the middle
// A burn field over the frame: 0 at each corner, 1 in the middle, roughened by noise so the fronts eat in unevenly.
// As the threshold rises the frame chars, glows at the edge and gives way to the tapestry behind; the logo goes last.
const BW=480,BH=270,BURN=(()=>{const f=new Float32Array(BW*BH),n2=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=sm(x-xi),yf=sm(y-yi),h=(a,b)=>hash(a*57.13+b*311.7);return lerp(lerp(h(xi,yi),h(xi+1,yi),xf),lerp(h(xi,yi+1),h(xi+1,yi+1),xf),yf);};
  const half=Math.hypot(BW,BH)/2;for(let y=0;y<BH;y++)for(let x=0;x<BW;x++){let d=1e9;for(const [cx,cy] of [[0,0],[BW,0],[0,BH],[BW,BH]])d=Math.min(d,Math.hypot(x-cx,y-cy));
    f[y*BW+x]=d/half+.16*(n2(x/26,y/26)-.5)+.07*(n2(x/7,y/7)-.5);}return f;})();
const BURN_HOLE=layerCanvas(),BURN_LAYER=document.createElement('canvas');BURN_LAYER.width=BW;BURN_LAYER.height=BH;
function burnAt(t,under){
  const r=-.05+1.25*easeInOut(seg(t,4.5,8.9)),g=BURN_LAYER.getContext('2d'),hole=g.createImageData(BW,BH),char=g.createImageData(BW,BH),fire=g.createImageData(BW,BH),hd=hole.data,cd=char.data,fd=fire.data;
  for(let i=0;i<BW*BH;i++){const e=BURN[i]-r,j=i*4;
    if(e<0){hd[j+3]=255;}
    else if(e<.11){const c=e/.11;cd[j]=40;cd[j+1]=22;cd[j+2]=12;cd[j+3]=255*(1-c)*(1-c);}         // charred band, darkest at the edge
    else if(e<.2){cd[j]=110;cd[j+1]=70;cd[j+2]=30;cd[j+3]=110*(1-(e-.11)/.09);}               // the heat browning it first
    if(e>-.012&&e<.022){const c=1-Math.abs(e-.005)/.017,fl=.75+.25*Math.sin(i*.37+t*21);fd[j]=255;fd[j+1]=130+110*c;fd[j+2]=40*c;fd[j+3]=255*clamp(c)*fl;}}
  // the logo frame, charred; through the holes the tapestry; along the fronts the fire
  logoScene(t);g.putImageData(char,0,0);ctx.save();ctx.drawImage(BURN_LAYER,0,0,W,H);ctx.restore();
  const hg=BURN_HOLE.getContext('2d');hg.globalCompositeOperation='source-over';hg.clearRect(0,0,W,H);g.putImageData(hole,0,0);hg.imageSmoothingEnabled=true;hg.drawImage(BURN_LAYER,0,0,W,H);
  hg.globalCompositeOperation='source-in';hg.drawImage(under,0,0);ctx.drawImage(BURN_HOLE,0,0);
  g.putImageData(fire,0,0);ctx.save();ctx.globalCompositeOperation='lighter';ctx.filter='blur(6px)';ctx.drawImage(BURN_LAYER,0,0,W,H);ctx.filter='none';ctx.globalAlpha=.9;ctx.drawImage(BURN_LAYER,0,0,W,H);ctx.restore();
  // embers lifting off the fronts
  for(let i=0;i<160;i++){const x=hash(i*3.7)*BW|0,y=hash(i*5.3)*BH|0,e=BURN[y*BW+x]-r;if(e<-.06||e>.03)continue;const age=(t*.7+hash(i))%1,px=x*W/BW+Math.sin(t*3+i)*12,py=y*H/BH-age*90;
    ctx.save();ctx.globalAlpha=(1-age)*.9;glow(px,py,14,'#ff8a2a',.6);ctx.fillStyle=age<.4?'#ffe2a6':'#ff8a2a';ctx.beginPath();ctx.arc(px,py,1.5+hash(i*2)*2.5,0,TAU);ctx.fill();ctx.restore();}
}

// ================================================================ the film
// Scenes, each a function of t that leaves a finished frame. They run on into one another: a pan or a tilt along
// the cloth, the wind closing and opening, the white of the iron, the road shrinking into the map and growing out.
const SCENES={
  open:t=>{if(t<4.5){logoScene(t);black(1-seg(t,0,.8));return;}stripFrame(t,'breath',0);burnAt(t,snapshot());},
  strip:t=>{
    if(t<30.15||t>=30.65){const nb=beatsDone(t),b=BEATS[nb-1];
      if(nb&&t<b+.4)reweave(t,b,.4,()=>stripFrame(t,'roar',nb-1),()=>stripFrame(t,'roar',nb));
      else stripFrame(t,t<30.15?'breath':'roar',nb);}
    else reweave(t,30.15,.5,()=>stripFrame(t,'breath',0),()=>stripFrame(t,'roar',0));
    ui(()=>glossaryApp(t,'arthur',24.7,{x:1188,y:148}));ui(()=>glossaryApp(t,'sinfran',41.3,{x:44,y:148,stretch:1.15}));},
  anvil:t=>{const w=windState(t);
    woven(t,()=>anvilAt(t),{...about(anvilZoom(t),1000,486),cover:w.L>0||w.C>0?()=>windAt(t,w):null,post:()=>whiteIn(seg(t,84.6,86.4)),
      words:t<70?change(t,'HIC SINFRAN VENTVM MOVET','HIC FERRVM HAVARDI CANDET',55.6):change(t,'HIC FERRVM HAVARDI CANDET',ROAD_WORDS,85.8,1.2)});
    ui(()=>relationsApp(t));},
  walk:t=>{woven(t,()=>roadWalkAt(t),{gy:offWalk(t),post:()=>whiteIn(1-seg(t,86.6,88.6)),
      words:t<92?change(t,'HIC FERRVM HAVARDI CANDET',ROAD_WORDS,85.8,1.2):change(t,ROAD_WORDS,'HIC VIA AD HELGARD',98)});},
  map:t=>{woven(t,()=>{mapAt(t);insetAt(outOf(t),()=>roadWalkAt(WSTOP));insetAt(into(t),()=>roadRunAt(t));},{gy:t<99.2?offWalk(WSTOP):0,
      words:t<108?change(t,ROAD_WORDS,'HIC VIA AD HELGARD',98):change(t,'HIC VIA AD HELGARD','HIC RIGA ET HAVARD VALEDICVNT',115.4)});
    ui(()=>mapApp(t));},
  run:t=>{woven(t,()=>roadRunAt(t),{gy:offRun(t),post:()=>nightAt(t),
      words:t<124?change(t,'HIC VIA AD HELGARD','HIC RIGA ET HAVARD VALEDICVNT',115.4):change(t,'HIC RIGA ET HAVARD VALEDICVNT','HIC RIGA EQVITAT AD HELGARD',RUN0-.3)});
    if(t<153.3)ui(()=>outlineApp(t));black(seg(t,158.6,160.6));},
  end:t=>{logoScene(t,{end:true});black(1-seg(t,161,161.9));black(seg(t,167.4,169));},
};
// [start, scene, dissolve into it (s)]: the one dissolve is under the whiteout, where both pictures are covered
const CUTS=[[0,'open',0],[9,'strip',0],[56.2,'anvil',.8],[86.6,'walk',0],[WSTOP,'map',0],[116.6,'run',0],[161,'end',0]];
function dissolve(t,t0,dur,A,B){const k=sm(seg(t,t0,t0+dur));if(k<=0)return A();if(k>=1)return B();
  A();SCAN.getContext('2d').drawImage(canvas,0,0);B();ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1-k;ctx.drawImage(SCAN,0,0);ctx.restore();}
function filmFrame(t){
  let i=CUTS.length-1;while(i>0&&t<CUTS[i][0])i--;
  const [at,name]=CUTS[i],next=CUTS[i+1];
  // inside the second half of a dissolve the next scene has begun; inside the first half the next one is fading in
  if(next&&next[2]>0&&t>=next[0]-next[2]/2)return dissolve(t,next[0]-next[2]/2,next[2],()=>SCENES[name](t),()=>SCENES[next[1]](t));
  if(i>0&&CUTS[i][2]>0&&t<at+CUTS[i][2]/2)return dissolve(t,at-CUTS[i][2]/2,CUTS[i][2],()=>SCENES[CUTS[i-1][1]](t),()=>SCENES[name](t));
  SCENES[name](t);
}
function renderAt(t){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';TINT.k=0;UI_LAYER.length=0;
  ctx.save();filmFrame(t);ctx.restore();
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;subtitles(t);
}
window.renderAt=renderAt;
