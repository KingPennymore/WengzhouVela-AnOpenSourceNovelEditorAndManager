// 《炉火祈愿》× 文舟 0.9.9, storyboard v7 (storyboard.md): every frame woven on the loom (samples/loom.js) from the
// designs of storyboard/frames.js, animated over time. renderAt(t) here replaces the first film's in scenes.js;
// the interface layers (glossary, relations, map toolbar, outline) and subtitles still come from scene.html/scenes.js.
// The camera moves over the cloth rather than through the picture: zooms and pans keep the picks fixed to the design.

const flick=t=>.14+.22*Math.max(0,Math.sin(t*2.1)*Math.sin(t*3.7+1));
const W2=W/2,H2=H/2;
// Weave a design seen through a camera that is z times closer about (cx, cy), shaken by (sx, sy).
function wovenAt(t,draw,{z=1,cx=W2,cy=H2,sx=0,sy=0,seed=0,light=1,folds=1}={}){
  const ox=cx-z*cx+sx,oy=cy-z*cy+sy;
  weave(()=>{ctx.save();ctx.translate(ox,oy);ctx.scale(z,z);draw();ctx.restore();},{seed,flicker:flick(t),light,folds,zoom:z,x0:ox,y0:oy});
}
// The loom's way of changing a picture: the new one woven over the old from the top down, behind a scan line.
const SCAN=layerCanvas();
function reweave(t,t0,dur,oldFn,newFn){
  const k=seg(t,t0,t0+dur);if(k<=0)return oldFn();if(k>=1)return newFn();
  oldFn();SCAN.getContext('2d').drawImage(canvas,0,0);newFn();
  const y=Math.round(k*H);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(SCAN,0,y,W,H-y,0,y,W,H-y);
  ctx.fillStyle=rgba(DYE.weldL,.8);ctx.fillRect(0,y-3,W,6);ctx.restore();
}
const white=(a)=>{if(a<=0)return;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=clamp(a);rect(0,0,W,H,'#fbf7ee');ctx.restore();};
const black=(a)=>{if(a<=0)return;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=clamp(a);rect(0,0,W,H,'#000000');ctx.restore();};
// Snow falling as woven rosettes, drifting with the wind.
function wovenSnow(t,n,{seed=0,speed=40,wind=-20,size=1,y0=130,y1=920,col=DYE.bone}={}){
  for(let i=0;i<n;i++){const z=.6+.4*hash(seed+i*2.7),x=(((hash(seed+i)*W+t*wind*z)%W)+W)%W,y=y0+(((hash(seed+i*1.3)*(y1-y0)+t*speed*z)%(y1-y0))+(y1-y0))%(y1-y0);wFlake(x,y,size*(.6+.5*z),col);}}

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

// ================================================================ 03–04 · the wood after the battle, moving
// Riga's breath comes in slow puffs from behind the tree, every three seconds or so.
function breathAt(x,y,t,{s=1,len=300}={}){const ph=((t+.4)/3)%1;if(ph>.75)return;const grow=easeOut(clamp(ph/.35)),drift=ph*60*s;
  for(let k=0;k<3;k++){if(ph>.45+k*.1)continue;const p=[];for(let i=0;i<=10;i++){const u=i/10*grow;p.push(x-drift-u*len,y-k*30*s-u*len*.25-ph*40+Math.sin(u*9+k+t)*14*s);}wcurve(p,10*s,k===1?DYE.bone:DYE.skyL,{lw:5});}}
function battleAt(t){
  winterField({ground:800});
  for(const [tx,th,sd] of [[110,560,21],[360,420,22],[640,360,23],[900,330,24],[1150,380,25]])wTree(tx,812,th,{seed:sd,...WINTER});
  for(const [mx,my,mw] of [[300,900,220],[820,930,200],[1140,900,170]])wshape([mx-mw/2,my+10,mx-mw*.3,my-26,mx,my-36,mx+mw*.32,my-24,mx+mw/2,my+10],DYE.bone,{lw:7});
  for(const [sx,sy,l,a] of [[360,900,170,-.45],[700,880,140,.35],[980,910,200,-.2],[1220,890,110,.6]])brokenSpear(sx,sy,l,a);
  fallenHorse(560,926,1.0);shield(300,884,52);shield(1130,890,46,.42,DYE.woad,DYE.bone);helmet(860,930,.9,-.5);
  wTree(1650,850,820,{seed:26,...WINTER});
  standingSpear(1480,860,520,{rag:1+.12*Math.sin(t*4.3)+.06*Math.sin(t*9.1)});breathAt(1530,640,t);
  wovenSnow(t,26,{seed:3,speed:36,wind:-14,size:.9});
  borders('HIC RIGA IN SILVA LATET');
}
function spearAt(t,wind){
  winterField({ground:820,mountains:false});
  for(const [tx,th,sd] of [[140,420,31],[420,340,32],[700,300,33]])wTree(tx,830,th,{seed:sd,...WINTER});
  wTree(1740,850,1700,{seed:27,...WINTER});
  wshape([1440,840,1580,800,1700,794,1840,806,1960,850],DYE.bone,{lw:8});
  standingSpear(1420,850,560,{rag:1+wind*.6+.14*Math.sin(t*5.2)+.07*Math.sin(t*11)});breathAt(1560,560,t,{s:1.6,len:520});
  wovenSnow(t,30,{seed:9,speed:50,wind:-60-wind*400,size:1});
  if(wind>0){for(let k=0;k<7;k++){const p=[];for(let i=0;i<=12;i++){const u=i/12;p.push(W-u*W*1.15*wind,180+k*100+Math.sin(u*7+k+t*2)*30);}wcurve(p,12,k%2?DYE.bone:DYE.woad,{lw:5});}
    for(let i=0;i<90*wind;i++)wFlake(W-((hash(i*2.9)*W+t*500)%W)*wind,150+hash(i*6.3)*660,.8+hash(i)*.6,i%3?DYE.bone:DYE.sky);
    for(let k=0;k<4;k++)wspiral(W-260-k*360*wind,240+hash(k)*500,70,DYE.bone,{lw:14,turns:1.8+(t*.8)%1});}
  borders('HIC RIGA IN SILVA LATET');
}

// ================================================================ 05 · Arthur
function springAt(t,{melt=0}={}){
  rect(0,0,W,H,DYE.wool);
  const sx=330,sy=300,sp=t*.15;for(let i=0;i<16;i++){const a=i/16*TAU+sp;wpoly([sx+Math.cos(a-.1)*70,sy+Math.sin(a-.1)*70,sx+Math.cos(a)*(i%2?104:124),sy+Math.sin(a)*(i%2?104:124),sx+Math.cos(a+.1)*70,sy+Math.sin(a+.1)*70],i%2?DYE.madder:DYE.weld,{lw:6});}
  wdisc(sx,sy,66,DYE.weld);wspiral(sx,sy,44,DYE.madder,{lw:10});
  wTree(120,846,600,{seed:1});wTree(1560,852,420,{seed:3});wTree(1800,846,600,{seed:4,leaf:DYE.weld,leaf2:DYE.madder});
  wGround(812);
}
function bearBreathAt(t){
  springAt(t);const melt=seg(t,25.5,29.6);
  for(const [sx,sy,sw] of [[1250,836,220],[1490,846,150]]){const w=sw*(1-.6*melt);wshape([sx-w/2,sy+8,sx-w*.3,sy-30*(1-.5*melt),sx,sy-40*(1-.5*melt),sx+w*.32,sy-28*(1-.5*melt),sx+w/2,sy+8],DYE.bone,{lw:7});}
  const br=(t-23)*1.4;for(let k=0;k<3;k++){const p=[],grow=.5+.5*Math.abs(Math.sin(br+k*.6));for(let i=0;i<=10;i++){const u=i/10*grow;p.push(1110+u*260,690+k*36+u*80+Math.sin(u*9+k+t*3)*14);}wcurve(p,11,k===1?DYE.weld:DYE.madder,{lw:6});}
  for(const [fx,fy,at] of [[1180,862,26.4],[1300,868,27.6],[1400,858,28.6]]){const g=easeOut(seg(t,at,at+1.2));if(g>0)wSprout(fx,fy+(1-g)*8,1.2*g);}
  wBear4(760,846,1.3);borders('HIC ARTHVR VRSVS NIVEM SOLVIT');
}
function bearRoarAt(t){
  springAt(t);const lt=t-30.15;
  for(const [bx,by,bs,f] of [[1560,240,1.1,1],[1660,290,.9,0],[1500,330,1,1],[1620,190,.8,0]])wBird(bx+lt*60,by-lt*40,bs,DYE.indigo,Math.floor(t*6+bx)%2);
  for(const [sx,sy,sw] of [[640,830,150],[1300,836,190],[360,850,120]]){wshape([sx-sw/2,sy+8,sx-sw*.3,sy-22,sx,sy-30,sx+sw*.32,sy-20,sx+sw/2,sy+8],DYE.bone,{lw:7});}
  for(const [fx,fy,fs,c] of [[740,848,1.1,DYE.madder],[790,860,.9,DYE.weld],[1210,850,1,DYE.weld],[1180,866,.8,DYE.madder],[560,866,.9,DYE.madder]])wFlower(fx,fy,fs,c);
  for(const [fx,fy] of [[690,858],[860,866],[1120,858],[1250,870],[1010,872]])wSprout(fx,fy,1.1);
  const mx=1000+110*.98,my=868-608*.98,roar=lt<3.2;
  if(roar)for(let i=0;i<3;i++){const r=70+i*46+((lt*90)%46);ctx.save();ctx.beginPath();ctx.arc(mx,my,r,-.8,.3);ctx.strokeStyle=i===1?DYE.madder:DYE.weld;ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();ctx.restore();}
  for(const [a,l,c] of [[-.7,130,DYE.madder],[-.35,170,DYE.weld],[0,140,DYE.madder]]){const p=[];for(let k=0;k<=10;k++){const r=60+k/10*l*(roar?1:.6),w=Math.sin(k*1.25+t*8)*16*(k/10);p.push(mx+Math.cos(a)*r-Math.sin(a)*w,my+Math.sin(a)*r+Math.cos(a)*w);}wcurve(p,12,c,{lw:6});}
  wBear(1000,868,.98);borders('HIC ARTHVR VRSVS BELLVM CLAMAT');
}
// 06 · the tall hanging, the camera tilting up it from the blood-soaked meadow to the frost
const TALL=2300;
function tallAt(){
  rect(0,-TALL+H,W,TALL,DYE.wool);wGround(900,{cols:[DYE.madder,DYE.rust,DYE.madder]});
  for(const [x,h,sd] of [[160,2000,1],[520,1800,2],[900,2150,3],[1280,1850,4],[1680,2050,5]]){const y=930;wcurve([x,y+4,x+(hash(sd*3)-.5)*14,y-h*.3,x,y-h*.9],34,DYE.walnut);
    for(let i=0;i<12;i++){const k=.14+i*.068,d=i%2?1:-1,by=y-h*k,ex=x+d*h*.09,ey=by-h*.05;wcurve([x,by+h*.03,x+d*h*.05,by-h*.005,ex,ey],14,DYE.walnut,{lw:6});
      const q=(930-ey)/TALL;wPalmette(ex,ey,90,-Math.PI/2+d*.7,q<.25?DYE.green:q<.42?DYE.weld:q<.58?DYE.ochre:q<.72?DYE.walnut:DYE.bone);}}
  for(let i=0;i<60;i++)wFlake(hash(i*3.3)*W,H-TALL+80+hash(i*7.1)*700,.8+hash(i)*.5,DYE.sky);
  wBorderBottom({y:H-110,h:110});wBorderTop('HIC SANGVIS ET NIX',{y:H-TALL,h:124});
}

// ================================================================ 07 · Sinfran: perched, then three beats of the wings
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
const wingPose=t=>WING[BEATS.filter(b=>t>=b).length];
function ravenAt(t,pose){
  const wind=seg(t,43.6,49);wWinterSky({wind});
  if(wind>0)wovenSnow(t,Math.round(70*wind),{seed:7,speed:60+200*wind,wind:-120-500*wind,size:1,col:DYE.bone});
  pineTwig(1240,560);sinfranAt(1240,556,1.25,pose);
  // the great wing that sweeps across the lens at the end
  const k=seg(t,51.5,52.7);if(k>0&&k<1){const x=lerp(W+900,-1400,easeInOut(k));ctx.save();ctx.translate(x,H*.55);ctx.scale(6,6);wshape(SINFRAN.wing,DYE.indigo,{lw:3});ctx.restore();}
  if(t>52.3){const a=seg(t,52.3,54);for(let i=0;i<5;i++){const y=160+i*170;wpoly([-40,y,W+40,y-30,W+40,y+30*a+10,-40,y+60*a+20],DYE.bone,{line:null});}wovenSnow(t,120,{seed:17,speed:260,wind:-700,size:1.2});}
  borders(t<44?'HIC SINFRAN MONEDVLA':'HIC SINFRAN VENTVM MOVET');
}
// 08 · the woven snow comes loose from the right and its threads burn into sparks
let WINTER_CLOTH=null;
function unravelAt(t){
  if(!WINTER_CLOTH){weave(()=>{wWinterSky({wind:1});wovenSnow(55,120,{seed:17,size:1.2});borders('HIC SINFRAN VENTVM MOVET');},{seed:8,flicker:.1});grade(0);WINTER_CLOTH=snapshot();}
  ctx.drawImage(WINTER_CLOTH,0,0);const lt=t-55,front=W+60-easeInOut(seg(lt,0,3.3))*W*.8,edge=y=>front+Math.sin(y/70+lt)*60+noise(y/30+lt*.5)*80;
  ctx.save();ctx.beginPath();ctx.moveTo(W,0);for(let y=0;y<=H;y+=12)ctx.lineTo(edge(y),y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#0d0907';ctx.fill();ctx.restore();
  for(let i=0;i<120;i++){const y=i/120*H,x0=edge(y),l=60+hash(i*3.3)*360*(.5+.5*Math.sin(lt*2+i)),col=[DYE.bone,DYE.sky,DYE.woad,DYE.indigo][i%4];const pts=[];for(let k=0;k<=10;k++){const u=k/10;pts.push(x0+u*l,y+Math.sin(u*6+i+lt*3)*14*u+u*u*40);}
    ctx.save();ctx.lineCap='round';ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)ctx.lineTo(pts[k],pts[k+1]);ctx.stroke();
    const ex=pts[pts.length-2],ey=pts[pts.length-1];ctx.strokeStyle='#ff8a2a';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(pts[pts.length-6],pts[pts.length-5]);ctx.lineTo(ex,ey);ctx.stroke();glow(ex,ey,18,'#ffb050',.7);ctx.restore();}
  for(let i=0;i<110;i++){const age=(lt*.4+hash(i*2.2))%1,x=edge(hash(i*4.1)*H)+40+age*700,y=hash(i*4.1)*H-age*200,s=1.5+hash(i)*4;if(x>W+20)continue;ctx.save();ctx.globalAlpha=1-age*.7;glow(x,y,s*5,'#ff7a1e',.5);ctx.fillStyle=hash(i*9)>.5?'#ffe2a0':'#ff9a40';ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();ctx.restore();}
  // the brightest spark falls to the middle and lands
  const f=seg(t,57.6,59),fy=lerp(260,560,easeIn(f));if(f>0){ctx.save();glow(W2,fy,120+f*300,'#fff3d0',.6);ctx.fillStyle='#fffbe8';ctx.beginPath();ctx.arc(W2,fy,8+f*10,0,TAU);ctx.fill();ctx.restore();}
}

// ================================================================ 09–11 · the anvil, closing on the white-hot iron
function anvilAt(t){
  rect(0,0,W,H,DYE.wool);
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
  for(let k=0;k<5;k++){const ph=((t*.45+k/5)%1),p=[];for(let i=0;i<=8;i++){const u=i/8*(.3+.7*ph);p.push(910+k*45+Math.sin(u*8+k+t*2.5)*20,462-ph*120-u*260);}if(ph<.9)wcurve(p,10,k%2?DYE.bone:DYE.skyL,{lw:5});}
  borders('HIC FERRVM HAVARDI CANDET');
}
const anvilZoom=t=>t<71?lerp(1,1.6,easeInOut(seg(t,59,71))):t<82?lerp(1.6,3,easeInOut(seg(t,71,82))):lerp(3,9,easeIn(seg(t,82,86.4)));

// ================================================================ 12–18 · two threads up the snow road
const TV=150,T12=86.6;                     // the threads' walking speed (px/s) and when they come in
const greenY=t=>H+40-TV*Math.max(0,t-T12),blueY=t=>greenY(t)+330;  // world y of each head while walking
const snap4=v=>Math.round(v/4)*4,offWalk=t=>snap4(Math.max(0,300-greenY(t)));                          // the camera rises once green reaches y 300
function roadWalkAt(t){const off=offWalk(t);topField(off);
  yarn(upPts(H+40,Math.max(-40,greenY(t)+off),-56,off),TH.havard);if(blueY(t)+off<H+40)yarn(upPts(H+40,blueY(t)+off,56,off),TH.riga);
  borders('HIC HAVARD ET RIGA PROFICISCVNTVR');}
// the twine: the run-in to the twist and as much of the twist as has been made by time t (k 0..1)
function twineAt(off,k){
  const cx=y=>roadX(y,off),ph=y=>(TW0-y)/(TW0-TW1)*TWN*Math.PI,lead=side=>sampleCurve(y=>[cx(y)+side*lerp(TWA,56,easeInOut(clamp((y-TW0)/160))),y],H+40,TW0,30);
  yarn(lead(-1),TH.havard);yarn(lead(1),TH.riga);const top=TW0-(TW0-TW1)*k;
  for(let i=0;i<TWN;i++){const y0=TW0-(TW0-TW1)*i/TWN;let y1=TW0-(TW0-TW1)*(i+1)/TWN;if(y0<=top)break;y1=Math.max(y1,top);
    const sg=s=>sampleCurve(y=>[cx(y)+s*TWA*Math.cos(ph(y)),y],y0+2,y1-2,14),fs=i%2?-1:1;yarn(sg(-fs),i%2?TH.riga:TH.havard);yarn(sg(fs),i%2?TH.havard:TH.riga);}
}
// after "Hyah!": the blue head runs up in surges, one to each stride of the gallop, landing on the beat
const RUN0=132.3,STRIDE=360;
const runD=t=>{if(t<=RUN0)return 0;const f=gallopPhase(t)-gallopPhase(RUN0);return STRIDE*(f-Math.sin(TAU*f)/TAU);};
const blueRunY=t=>TW1-OFF_K-runD(t);                                  // world y of the running blue head
const offRun=t=>snap4(Math.max(OFF_K,240-blueRunY(t)));
const FELL_W=blueRunY(153.6)-420;                                       // world y of the fell of the weaving
function roadRunAt(t){
  const off=t<RUN0?OFF_K:offRun(t),k=seg(t,116.4,120.2);topField(off);
  if(t<RUN0)twineAt(OFF_K,k);else{ctx.save();ctx.translate(0,off-OFF_K);twineAt(OFF_K,1);ctx.restore();const bx=y=>roadX(y,off)+30,top=Math.max(blueRunY(t)+off,FELL_W+off);
    yarn([roadX(TW1,off)+TWA*Math.cos(TWN*Math.PI),TW1+off-OFF_K,...upPts(TW1+off-OFF_K-30,top,30,off)],TH.riga);
    // snow thrown up behind the head as it runs
    const hy=blueRunY(t)+off,sp=gallopRate(t);if(hy>FELL_W+off)for(let kk=0;kk<5;kk++){const y=hy+60+kk*70;wline([bx(y)+70+kk*6,y,bx(y)+70+kk*6,y+30+sp*20],DYE.bone,6);wline([bx(y)-70-kk*6,y+20,bx(y)-70-kk*6,y+50+sp*20],DYE.bone,6);}}
  borders(t<RUN0?'HIC RIGA ET HAVARD VALEDICVNT':'HIC RIGA EQVITAT AD HELGARD');
  // above the fell: nothing woven yet, not even the border; the blue thread goes on in and out of the bare warp
  const fy=FELL_W+off;if(fy>-40){const wy=Math.min(H,fy);rect(0,0,W,wy,DYE.black);for(let x=6;x<W;x+=12)rect(x,0,6,wy,DYE.linen);
    for(let x=0;x<W;x+=34){const l=20+hash(x)*80;wline([x,wy,x+8,wy-l*.5,x+l*.3,wy-l],[DYE.bone,DYE.sky,DYE.wool][x%3],4);}
    const tx=roadX(FELL_W,off)+30,top=blueRunY(t)+off;for(let y=fy;y>Math.max(-10,top);y-=8)if(((y-fy)/8|0)%2===0)rect(tx-9,y-8,18,8,DYE.woad);}
}
// 13 · the map, drawn in as Havard names the places
function mapAt(t){rect(0,0,W,H,DYE.wool);
  for(let i=0;i<10;i++){const p=easeOut(seg(t,99.6+i*.1,100.3+i*.1));if(p<=0)continue;const x=150+i*66+(i%2)*18,y=300+(i%3)*22,h=(90+hash(i)*30)*p;wpoly([x-46,y,x,y-h,x+46,y],i%2?DYE.sky:DYE.woad,{lw:6});wpoly([x,y-h,x-16,y-h*.62,x+16,y-h*.62],DYE.bone,{line:null});}
  const rv=easeInOut(seg(t,99.2,101.4));if(rv>0){const R=[1220,900,1460,720,1380,520,1600,400,1760,310,1700,190,1860,140],n=Math.max(2,Math.round(R.length/2*rv));wcurve(R.slice(0,n*2),22,DYE.woad,{lw:6});}
  [[640,640,5],[1000,600,4],[1260,280,3],[300,540,4],[1380,760,3]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++){const p=easeOut(seg(t,100.2+j*.3+i*.06,100.6+j*.3+i*.06));if(p<=0)continue;const tx=fx+(i-(n-1)/2)*64,ty=fy+(i%2)*16;wline([tx,ty,tx,ty-56*p],DYE.indigo,9);wPalmette(tx,ty-50*p,44*p,-Math.PI/2,i%2?DYE.sky:DYE.bone);}});
  const pts=PLACES.map(p=>[p[1],p[2]+40]);ctx.save();ctx.setLineDash([24,16]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=14;
  for(let i=1;i<pts.length;i++){const p=easeInOut(seg(t,PLACES[i][3]()-1.1,PLACES[i][3]()-.1));if(p<=0)continue;const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);ctx.beginPath();for(let k=0;k<=30*p;k++){const u=k/30,x=(1-u)*(1-u)*ax+2*(1-u)*u*mx+u*u*bx,y=(1-u)*(1-u)*ay+2*(1-u)*u*my+u*u*by;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();
  PLACES.forEach(([name,x,y,at])=>{const p=seg(t,at(),at()+.45);if(p<=0)return;y+=40;const s=back(p);for(let k=0;k<3;k++){const hx=x+(-32+k*32)*s,hy=y+(k===1?-10:0)*s;wpoly([hx-14*s,hy,hx-14*s,hy-24*s,hx+14*s,hy-24*s,hx+14*s,hy],DYE.bone,{lw:5});wpoly([hx-18*s,hy-24*s,hx,hy-46*s,hx+18*s,hy-24*s],DYE.madder,{lw:5});}
    if(p>.4)text(name,x,y+70,{size:44,weight:700,color:DYE.black,font:SERIF,align:'center',spacing:4});});
  const cp=easeOut(seg(t,100.5,101.5));if(cp>0){ctx.save();ctx.translate(1720,300);ctx.scale(cp,cp);ctx.rotate(t*.1);for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([Math.cos(a-.12)*50,Math.sin(a-.12)*50,Math.cos(a)*(i%4?72:110),Math.sin(a)*(i%4?72:110),Math.cos(a+.12)*50,Math.sin(a+.12)*50],i%2?DYE.madder:DYE.weld,{lw:5});}wdisc(0,0,50,DYE.weld);wspiral(0,0,32,DYE.madder,{lw:9});ctx.restore();}
  borders('HIC VIA AD HELGARD');}

// ================================================================ the film
function filmFrame(t){
  const W1=(fn,o={})=>wovenAt(t,fn,o);
  if(t<4.5){logoScene(t);black(1-seg(t,0,.8));return;}
  if(t<9){W1(()=>battleAt(t),{seed:3});grade(0);const under=snapshot();logoScene(t);
    const R=120+Math.pow(seg(t,4.5,8.9),1.5)*1450,holes=CORNERS.map(([x,y],i)=>burnPath(x,y,R*(1+i*.04),t+i));
    ctx.save();ctx.beginPath();holes.forEach(hp=>{ctx.moveTo(hp[0],hp[1]);for(let i=2;i<hp.length;i+=2)ctx.lineTo(hp[i],hp[i+1]);ctx.closePath();});ctx.clip();ctx.drawImage(under,0,0);ctx.restore();
    holes.forEach((hp,j)=>{ctx.save();path(hp);ctx.shadowColor='#ff6a10';ctx.shadowBlur=34;ctx.strokeStyle='#ff8c2e';ctx.lineWidth=8;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a6';ctx.lineWidth=2.4;ctx.stroke();ctx.restore();
      for(let i=0;i<20;i++){const k=Math.floor(hash(i*7.3+j)*hp.length/2)*2,age=(t*.8+hash(i+j*9))%1,x=hp[k]+(hash(i)-.5)*30,y=hp[k+1]-age*60;ctx.save();ctx.globalAlpha=1-age;glow(x,y,26,'#ff8a2a',.5);ctx.fillStyle='#241309';ctx.beginPath();ctx.arc(x,y,3+hash(i*5)*6,0,TAU);ctx.fill();ctx.restore();}});
    return;}
  if(t<17){W1(()=>battleAt(t),{seed:3,z:1+.22*easeInOut(seg(t,9,17)),cx:1500,cy:620});return grade(0);}
  if(t<23.1){const wind=easeIn(seg(t,20.4,23));W1(()=>spearAt(t,wind),{seed:4});grade(0);return white(seg(t,22.2,23.1));}
  if(t<36){const [sx,sy]=shake(t,30.15,16,5);
    reweave(t,30.15,.35,()=>{W1(()=>bearBreathAt(t),{seed:5,sx,sy});grade(0);},()=>{W1(()=>bearRoarAt(t),{seed:5,sx,sy});grade(0);});
    white(1-seg(t,23.1,24));ui(()=>glossaryOverlay(t,GLOSS_A));return;}
  if(t<40){const k=easeInOut(seg(t,36,39.6)),oy=k*(TALL-H);W1(()=>tallAt(),{seed:6,sy:Math.round(oy/4)*4});return grade(0);}
  if(t<55){const [sx,sy]=BEATS.reduce((a,b)=>{const s=shake(t,b,10,6);return [a[0]+s[0],a[1]+s[1]];},[0,0]),pose=wingPose(t),prev=WING[Math.max(0,BEATS.filter(b=>t>=b).length-1)],b=BEATS.filter(b=>t>=b).pop();
    if(b!==undefined&&t<b+.3)reweave(t,b,.3,()=>{W1(()=>ravenAt(t,prev),{seed:7,sx,sy});grade(0);},()=>{W1(()=>ravenAt(t,pose),{seed:7,sx,sy});grade(0);});
    else{W1(()=>ravenAt(t,pose),{seed:7,sx,sy});grade(0);}
    ui(()=>glossaryOverlay(t,GLOSS_S));return;}
  if(t<59){unravelAt(t);return;}
  if(t<86.6){const z=anvilZoom(t);W1(()=>anvilAt(t),{seed:9,z,cx:1000,cy:486});grade(0);white(1-seg(t,59,59.5));white(seg(t,84.6,86.4));ui(()=>relationOverlay(t));return;}
  if(t<98){W1(()=>{roadWalkAt(t);},{seed:12});grade(0);white(1-seg(t,86.6,88.4));
    return;}
  if(t<116){reweave(t,98,.6,()=>{W1(()=>roadWalkAt(98),{seed:12});grade(0);},()=>{W1(()=>mapAt(t),{seed:13});grade(0);});ui(()=>{mapToolbar(t);mapCursor(t);});return;}
  if(t<156.2){const draw=()=>{W1(()=>roadRunAt(t),{seed:14});grade(0);};if(t<116.6)reweave(t,116,.6,()=>{W1(()=>mapAt(115.9),{seed:13});grade(0);},draw);else draw();ui(()=>outlinePanel(t));return;}
  if(t<161){W1(()=>roadRunAt(t),{seed:14,light:1-seg(t,156,160)*.4});grade(0);black(seg(t,156.2,160.6));return;}
  logoScene(t,{end:true});black(seg(t,167.4,169));
}
function renderAt(t){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';TINT.k=0;UI_LAYER.length=0;
  ctx.save();filmFrame(t);ctx.restore();
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;subtitles(t);
}
window.renderAt=renderAt;
