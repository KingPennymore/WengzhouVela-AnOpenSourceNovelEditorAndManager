// Key frames of storyboard v5 (storyboard.md). Every scene is woven in the one manner approved for Arthur and Sinfran:
// 6×4 picks, flat dyes, each figure or object a single silhouette edged in dark wool with an inner contour, palmette
// trees, a Latin inscription above and lozenges below. No people anywhere: Havard and Riga are there only in what
// they leave (a spear, breath, a white-hot iron, footprints).
window.FRAMES={};const frame=(id,fn)=>{window.FRAMES[id]=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';TINT.k=0;UI_LAYER.length=0;fn();ctx.setTransform(1,0,0,1,0,0);UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});};};
const line=id=>P.lines.find(l=>l.id===id);
const caption=id=>{const l=line(id);sampleCaption(l.zh,l.en);};
const R=RAMP;

// A limb from a to b (and on to c), tapered from w0 to w1 (and w2): returns outline points for mshape.
function limbPts(pts,ws){const n=pts.length/2,L=[],Rr=[];for(let i=0;i<n;i++){const x=pts[i*2],y=pts[i*2+1],j0=Math.max(0,i-1),j1=Math.min(n-1,i+1),dx=pts[j1*2]-pts[j0*2],dy=pts[j1*2+1]-pts[j0*2+1],l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,w=ws[i]/2;L.push(x+nx*w,y+ny*w);Rr.push(x-nx*w,y-ny*w);}
  const out=[...L];for(let i=n-1;i>=0;i--)out.push(Rr[i*2],Rr[i*2+1]);return out;}
const ell=(cx,cy,rx,ry,n=14,rot=0)=>{const p=[];for(let i=0;i<n;i++){const a=i/n*TAU,x=Math.cos(a)*rx,y=Math.sin(a)*ry;p.push(cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot));}return p;};
function at(x,y,s,face,draw){ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);draw();ctx.restore();}
function snapshot(){const c=layerCanvas();c.getContext('2d').drawImage(canvas,0,0);return c;}
function vela98(t=6){
  const g=ctx.createRadialGradient(W*.7,H*.3,0,W*.7,H*.3,1300);g.addColorStop(0,'#1b3a2b');g.addColorStop(.45,'#0f2219');g.addColorStop(1,'#08120d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  glow(400,200,700,'#8ad0a8',.16);
  const wave=(amp,len,speed,base,phase,col)=>{ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=24)ctx.lineTo(x,H-260+base+amp*Math.sin(x/len+t*speed+phase)+amp*.4*Math.sin(x/(len*.43)-t*speed*1.3));ctx.lineTo(W,H);ctx.fillStyle=col;ctx.fill();};
  wave(18,180,.6,140,0,'rgba(138,208,168,.06)');wave(14,240,-.45,170,2,'rgba(138,208,168,.05)');wave(10,140,.8,205,4,'rgba(47,163,107,.07)');
  ctx.save();ctx.shadowColor='rgba(35,116,78,.55)';ctx.shadowBlur=80;ctx.shadowOffsetY=30;fillRR(870,250,180,180,50,'#257c67');ctx.restore();
  ctx.save();ctx.translate(870,250);ctx.scale(180/192,180/192);ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();
  const tw=measure('文舟 ',96,700),vw=measure('Vela',96,300);text('文舟 ',W/2-(tw+vw)/2,572,{size:96,weight:700,color:'#eef6f1',spacing:2});text('Vela',W/2-(tw+vw)/2+tw,572,{size:96,weight:300,color:'#8ad0a8',spacing:2});
  text('0.9.9 · 开源小说创作与阅读工具',W/2,650,{size:27,color:'#a9c2b4',align:'center'});
}
frame('01',()=>vela98());
// ================================================================ 05–08 · the spirits, in the older manner (6×4 picks)
function wSpring(){
  rect(0,0,W,H,DYE.wool);
  const sx=330,sy=300;for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([sx+Math.cos(a-.1)*70,sy+Math.sin(a-.1)*70,sx+Math.cos(a)*(i%2?104:124),sy+Math.sin(a)*(i%2?104:124),sx+Math.cos(a+.1)*70,sy+Math.sin(a+.1)*70],i%2?DYE.madder:DYE.weld,{lw:6});}
  wdisc(sx,sy,66,DYE.weld);wspiral(sx,sy,44,DYE.madder,{lw:10});
  wTree(120,846,600,{seed:1});wTree(1560,852,420,{seed:3});wTree(1800,846,600,{seed:4,leaf:DYE.weld,leaf2:DYE.madder});
  wGround(812);
}
const WBEAR4={
  body:[-232,0,-252,-70,-272,-160,-246,-226,-170,-252,-60,-262,30,-292,80,-286,118,-258,160,-232,208,-206,248,-186,266,-168,258,-150,214,-142,182,-138,150,-152,132,-130,134,-70,136,-22,166,-10,168,4,84,6,82,-60,70,-108,0,-112,-100,-110,-160,-118,-172,-70,-166,-20,-140,-8,-136,4],
  fore:[40,-120,96,-112,104,-30,118,-10,120,4,50,6,54,-60],hind:[-210,-110,-150,-120,-128,-40,-112,-10,-110,4,-190,6,-200,-60]};
function wBear4(x,y,s,{fur=DYE.walnut,far=DYE.umber,inner=DYE.ochre}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();};
  wFigure(T(()=>{shape(WBEAR4.fore,'#fff');shape(WBEAR4.hind,'#fff');}),{fill:far,inner:null});
  wFigure(T(()=>shape(WBEAR4.body,'#fff')),{fill:fur,inner,band:[17*s,26*s]});
  T(()=>{for(const [cx,cy,r,d] of [[-196,-166,58,1],[54,-206,48,-1]]){wspiral(cx,cy,r,DYE.black,{lw:20,dir:d});wspiral(cx,cy,r,inner,{lw:9,dir:d});}
    wdisc(112,-262,19,fur);wdisc(112,-262,8,inner,{line:null});wdisc(258,-164,8,DYE.black,{line:null});for(const [cx,cy] of [[166,-2],[120,-2],[-112,-2]])wClaws(cx,cy,0,3,20);})();
}
const GLOSS_A={t0:24.9,t1:35.4,x:W-620,y:150,sentence:'大熊阿瑟用它温暖的鼻息融化积雪，',term:'阿瑟',cat:'精魂',def:'大熊精魂'};
frame('05a',()=>{
  weave(()=>{wSpring();
    for(const [sx,sy,sw] of [[1250,836,220],[1490,846,150]])wshape([sx-sw/2,sy+8,sx-sw*.3,sy-30,sx,sy-40,sx+sw*.32,sy-28,sx+sw/2,sy+8],DYE.bone,{lw:7});
    for(let k=0;k<3;k++){const p=[];for(let i=0;i<=10;i++){const u=i/10;p.push(1110+u*260,690+k*36+u*80+Math.sin(u*9+k)*14);}wcurve(p,11,k===1?DYE.weld:DYE.madder,{lw:6});}
    for(const [fx,fy] of [[1180,862],[1300,868],[1400,858]])wSprout(fx,fy,1.2);
    wBear4(760,846,1.3);wBorderTop('HIC ARTHVR VRSVS NIVEM SOLVIT',{h:124});wBorderBottom();},{seed:5,flicker:.25});
  grade(0);ui(()=>glossaryOverlay(30.0,GLOSS_A));caption('03');
});
frame('05b',()=>{sampleBear();ui(()=>glossaryOverlay(33.4,GLOSS_A));});
frame('06',()=>{
  weave(()=>{rect(0,0,W,H,DYE.wool);wGround(900,{cols:[DYE.madder,DYE.rust,DYE.madder]});
    for(const [x,h,sd] of [[160,980,1],[520,860,2],[900,1020,3],[1280,880,4],[1680,1000,5]]){const y=930;wcurve([x,y+4,x+(hash(sd*3)-.5)*14,y-h*.3,x,y-h*.88],30,DYE.walnut);
      for(let i=0;i<7;i++){const k=.25+i*.11,d=i%2?1:-1,by=y-h*k,ex=x+d*h*.17,ey=by-h*.1;wcurve([x,by+h*.05,x+d*h*.09,by-h*.01,ex,ey],14,DYE.walnut,{lw:6});
        wPalmette(ex,ey,h*.085,-Math.PI/2+d*.7,ey>700?DYE.green:ey>520?DYE.weld:ey>360?DYE.ochre:ey>240?DYE.walnut:DYE.bone);}}
    for(let i=0;i<40;i++)wFlake(hash(i*3.3)*W,60+hash(i*7.1)*260,.8+hash(i)*.5,DYE.sky);wBorderBottom({y:H-110,h:110});},{seed:6,flicker:.2});
  grade(0);caption('04');
});
// Sinfran, slender as a real jackdaw: long wings folded to a long tail, a fine bill, a pale collar; still one woven
// silhouette with an inner contour, as the bear is. Facing right, feet on the twig at the origin.
const SINFRAN={body:[-294,-35,-291,-56,-168,-77,-84,-112,0,-143,53,-161,98,-168,129,-151,137,-133,129,-112,115,-98,105,-70,84,-35,28,-3,-42,-7,-154,-21],
  bill:[124,-150,140,-132,168,-76,126,-110],collar:[40,-160,72,-166,98,-150,108,-112,104,-80,82,-58,64,-100,48,-140],
  wing:[0,-140,-20,-230,-60,-320,-100,-400,-124,-372,-150,-420,-164,-374,-200,-400,-204,-348,-246,-360,-232,-312,-280,-300,-230,-246,-140,-180,-60,-140]};
function sinfran(x,y,s,{wings=0}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();};
  T(()=>{for(const dx of [0,26]){wline([dx+6,-10,dx,10],DYE.black,7);for(const a of [-.6,.1,.8])wline([dx,10,dx+Math.cos(a)*18,10+Math.sin(a)*8+4],DYE.black,5);}})();
  if(wings)wFigure(T(()=>{ctx.save();ctx.translate(30,-6);ctx.rotate(.16);ctx.scale(.8,.8);shape(SINFRAN.wing,'#fff');ctx.restore();}),{fill:DYE.black,inner:null});
  wFigure(T(()=>shape(SINFRAN.body,'#fff')),{fill:DYE.indigo,inner:DYE.sky,band:[10*s,15*s]});
  T(()=>{wshape(SINFRAN.collar,DYE.skyL,{lw:5});wpoly(SINFRAN.bill,DYE.black,{lw:4});wdisc(112,-140,6,DYE.bone,{line:null});
    if(!wings){for(let i=0;i<4;i++)wline([-20-i*36,-110+i*12,-170-i*30,-62+i*4],DYE.black,6);wspiral(-10,-100,30,DYE.black,{lw:12,dir:-1});wspiral(-10,-100,30,DYE.sky,{lw:5,dir:-1});}})();
  if(wings){wFigure(T(()=>{ctx.save();ctx.scale(.8,.8);shape(SINFRAN.wing,'#fff');ctx.restore();}),{fill:DYE.indigo,inner:DYE.sky,band:[9*s,14*s]});T(()=>{ctx.save();ctx.scale(.8,.8);for(let i=0;i<4;i++)wline([-50-i*40,-200+i*14,-110-i*40,-350+i*12],DYE.black,6);ctx.restore();wspiral(-14,-150,26,DYE.black,{lw:11,dir:-1});wspiral(-14,-150,26,DYE.sky,{lw:5,dir:-1});})();}
}
// the pine twig he sits on, needles in tufts as in the photograph
function pineTwig(x,y){wcurve([x-40,H+20,x-20,y+260,x+10,y+120,x,y],16,DYE.walnut,{lw:6});
  for(let i=0;i<9;i++){const k=i/8,tx=lerp(x-40,x,k)+(i%2?-10:10),ty=lerp(y+420,y+20,k);for(let j=-3;j<=3;j++){const a=-Math.PI/2+j*.32+(i%2?-.3:.3);wline([tx,ty,tx+Math.cos(a)*90,ty+Math.sin(a)*90],j%2?DYE.green:DYE.moss,5);}}}
function wWinterSky({wind=0}={}){
  rect(0,0,W,H,DYE.wool);for(let i=0;i<2;i++){const y=250+i*170;wpoly([-40,y,W+40,y-30,W+40,y+14,-40,y+44],DYE.sky,{lw:6});}
  for(let i=0;i<9;i++){const x=i*240-40;wpoly([x,820,x+130,560+hash(i)*80,x+260,820],i%2?DYE.sky:DYE.woad,{lw:7});}
  for(const [x,h,sd] of [[300,420,7],[700,360,8]])wTree(x,850,h,{seed:sd,leaf:DYE.sky,leaf2:DYE.bone,trunk:DYE.indigo});
  wGround(812,{cols:[DYE.bone,DYE.sky,DYE.bone]});
  if(wind>0){for(let k=0;k<6;k++){const p=[];for(let i=0;i<=12;i++){const u=i/12;p.push(W-u*W*1.1,220+k*90+Math.sin(u*7+k)*30*wind);}wcurve(p,10,k%2?DYE.indigo:DYE.woad,{lw:5});}for(let i=0;i<80;i++)wFlake(hash(i*2.9)*W,150+hash(i*6.3)*660,.8+hash(i)*.6,i%3?DYE.bone:DYE.sky);}
}
const GLOSS_S={t0:41.2,t1:48.2,x:60,y:150,sentence:'辛弗兰就用它的翅膀扇起寒风，',term:'辛弗兰',cat:'精魂',def:'寒鸦精魂',q:.82,keepTag:false};
frame('07a',()=>{weave(()=>{wWinterSky();pineTwig(1240,560);sinfran(1240,556,1.25);wBorderTop('HIC SINFRAN MONEDVLA',{h:124});wBorderBottom();},{seed:7,flicker:.1});grade(0);ui(()=>glossaryOverlay(45.0,GLOSS_S));caption('05');});
frame('07b',()=>{weave(()=>{wWinterSky({wind:1});pineTwig(1240,560);sinfran(1240,556,1.25,{wings:1});wBorderTop('HIC SINFRAN VENTVM MOVET',{h:124});wBorderBottom();},{seed:7,flicker:.1});grade(0);caption('05');});
frame('08',()=>{
  weave(()=>{wWinterSky({wind:1});wBorderTop('HIC SINFRAN VENTVM MOVET',{h:124});},{seed:8,flicker:.1,light:.9});
  const edge=y=>980+Math.sin(y/70)*60+noise(y/30)*80;
  ctx.save();ctx.beginPath();ctx.moveTo(W,0);for(let y=0;y<=H;y+=12)ctx.lineTo(edge(y),y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#0d0907';ctx.fill();ctx.restore();
  for(let i=0;i<120;i++){const y=i/120*H,x0=edge(y),l=60+hash(i*3.3)*360,col=[DYE.bone,DYE.sky,DYE.woad,DYE.indigo][i%4];const pts=[];for(let k=0;k<=10;k++){const u=k/10;pts.push(x0+u*l,y+Math.sin(u*6+i)*14*u+u*u*40);}
    ctx.save();ctx.lineCap='round';ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)ctx.lineTo(pts[k],pts[k+1]);ctx.stroke();
    const ex=pts[pts.length-2],ey=pts[pts.length-1];ctx.strokeStyle='#ff8a2a';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(pts[pts.length-6],pts[pts.length-5]);ctx.lineTo(ex,ey);ctx.stroke();glow(ex,ey,18,'#ffb050',.7);ctx.restore();}
  for(let i=0;i<90;i++){const x=1200+hash(i*2.2)*720,y=hash(i*4.1)*H,s=1.5+hash(i)*4;ctx.save();glow(x,y,s*5,'#ff7a1e',.5);ctx.fillStyle=hash(i*9)>.5?'#ffe2a0':'#ff9a40';ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();ctx.restore();}
  ctx.save();glow(1540,980,260,'#fff3d0',.5);ctx.fillStyle='#fffbe8';ctx.beginPath();ctx.arc(1540,960,9,0,TAU);ctx.fill();ctx.restore();
  grade(0);caption('06');
});

// ================================================================ 19 · the end card, in the 0.9.8 manner
frame('19',()=>{
  const g=ctx.createRadialGradient(W*.7,H*.3,0,W*.7,H*.3,1300);g.addColorStop(0,'#1b3a2b');g.addColorStop(.45,'#0f2219');g.addColorStop(1,'#08120d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);glow(400,200,700,'#8ad0a8',.16);
  for(let i=0;i<22;i++){const x=W*(.15+.7*hash(i*1.7)),y=H-hash(i*3.3)*600,r=2+hash(i)*3;ctx.save();ctx.globalAlpha=.7;glow(x,y,r*6,'#ff7a1e',.45);ctx.fillStyle='#ffb46a';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
  ctx.save();ctx.shadowColor='rgba(35,116,78,.55)';ctx.shadowBlur=80;ctx.shadowOffsetY=30;fillRR(885,200,150,150,42,'#257c67');ctx.restore();ctx.save();ctx.translate(885,200);ctx.scale(150/192,150/192);ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();
  const tw=measure('文舟 ',92,700),vw=measure('Vela',92,300);text('文舟 ',W/2-(tw+vw)/2,486,{size:92,weight:700,color:'#eef6f1',spacing:2});text('Vela',W/2-(tw+vw)/2+tw,486,{size:92,weight:300,color:'#8ad0a8',spacing:2});
  text('0.9.9 · 让故事，自此起航。',W/2,566,{size:30,color:'#a9c2b4',align:'center',font:SERIF,spacing:4});
  const bw=420;strokeRR(W/2-bw/2,640,bw,58,29,'rgba(138,208,168,.4)',1.2);text('现已上架鸿蒙应用市场',W/2,678,{size:24,color:'#8ad0a8',align:'center',spacing:3});
});

// ================================================================ the winter ground the scenes share
const WINTER={leaf:DYE.sky,leaf2:DYE.bone,trunk:DYE.indigo};
function winterField({ground=812,mountains=true,bands=true}={}){
  rect(0,0,W,H,DYE.wool);
  if(bands)for(let i=0;i<2;i++){const y=250+i*170;wpoly([-40,y,W+40,y-30,W+40,y+14,-40,y+44],DYE.sky,{lw:6});}
  if(mountains)for(let i=0;i<9;i++){const x=i*240-40;wpoly([x,ground+8,x+130,ground-250+hash(i)*80,x+260,ground+8],i%2?DYE.sky:DYE.woad,{lw:7});wpoly([x+130,ground-250+hash(i)*80,x+96,ground-190+hash(i)*80,x+164,ground-190+hash(i)*80],DYE.bone,{line:null});}
  wGround(ground,{cols:[DYE.bone,DYE.sky,DYE.bone]});
}
const borders=(words)=>{wBorderTop(words,{h:124});wBorderBottom();};
// A woven object: whatever parts() paints becomes one silhouette with an edge and an inner contour, as the beasts are.
const wObj=(parts,fill,inner,s=1)=>wFigure(parts,{fill,inner,band:[14*s,21*s]});

// ================================================================ 02 · the logo burns away from the four corners
const CORNERS=[[0,0],[W,0],[0,H],[W,H]];
frame('02',()=>{
  weave(()=>battleDesign(),{seed:3,flicker:.15});grade(0);const under=snapshot();vela98();
  const holes=CORNERS.map(([x,y],i)=>burnPath(x,y,640+i*30,1.3+i));
  ctx.save();ctx.beginPath();holes.forEach(hp=>{ctx.moveTo(hp[0],hp[1]);for(let i=2;i<hp.length;i+=2)ctx.lineTo(hp[i],hp[i+1]);ctx.closePath();});ctx.clip();ctx.drawImage(under,0,0);ctx.restore();
  holes.forEach(hp=>{ctx.save();path(hp);ctx.shadowColor='#ff6a10';ctx.shadowBlur=34;ctx.strokeStyle='#ff8c2e';ctx.lineWidth=8;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a6';ctx.lineWidth=2.4;ctx.stroke();ctx.restore();
    for(let i=0;i<24;i++){const k=Math.floor(hash(i*7.3+hp[0])*hp.length/2)*2,x=hp[k],y=hp[k+1];ctx.save();glow(x,y,26,'#ff8a2a',.5);ctx.fillStyle='#241309';ctx.beginPath();ctx.arc(x+(hash(i)-.5)*30,y+(hash(i*3)-.5)*30,3+hash(i*5)*6,0,TAU);ctx.fill();ctx.restore();}});
  caption('01');
});

// ================================================================ 03–04 · the wood after the battle
// The fallen are shown as the Bayeux weavers showed them: a horse on its back with its legs in the air, shields and
// helmets in the snow, spears broken or standing. Riga is behind the great tree: his spear stands beside it, his
// breath comes out past it in cold wavy bands, as the bear's warm breath does in shot 05.
const FALLEN={body:[-200,0,-212,-70,-150,-132,-40,-142,80,-132,170,-92,204,-30,194,0],neck:[150,-104,224,-92,300,-52,340,-20,340,4,190,4],head:[296,-44,380,-44,424,-20,414,4,318,4],
  tail:[-196,-44,-276,-24,-324,4,-206,4],fore:[150,-14,236,-2,262,10,150,10],hind:[-120,-22,-40,-2,-30,10,-140,10]};
// a horse fallen in the snow: on its side, legs folded under it, head laid on the ground
function fallenHorse(x,y,s){const T=f=>()=>at(x,y,s,1,f);
  wObj(T(()=>{for(const k in FALLEN)shape(FALLEN[k],'#fff');}),DYE.walnut,DYE.ochre,s);
  T(()=>{wpoly([258,-4,274,8,262,14,248,4],DYE.black,{lw:4});wspiral(-60,-70,46,DYE.black,{lw:18});wspiral(-60,-70,46,DYE.ochre,{lw:8});wdisc(330,-36,12,DYE.walnut);
    for(const [cx,cy,w] of [[-120,-136,120],[40,-146,120],[220,-90,80]])wshape([cx-w/2,cy+10,cx-w*.2,cy-14,cx+w*.2,cy-16,cx+w/2,cy+10],DYE.bone,{lw:5});})();}
function shield(x,y,r,tilt=.4,c1=DYE.madder,c2=DYE.weld){ctx.save();ctx.translate(x,y);ctx.scale(1,tilt);wdisc(0,0,r,c1);for(let k=0;k<4;k++){const a=k*Math.PI/2;wpoly([0,0,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.6)*r,Math.sin(a+.6)*r],c2,{line:null});}wdisc(0,0,r*.3,DYE.sky);ctx.restore();}
function helmet(x,y,s,a=.3){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s);wshape([-40,0,-36,-34,-14,-60,0,-66,14,-60,36,-34,40,0],DYE.sky,{lw:7});wline([-40,-6,40,-6],DYE.indigo,10);wline([0,-6,0,24],DYE.indigo,9);ctx.restore();}
function brokenSpear(x,y,l,a){const ex=x+Math.sin(a)*l,ey=y-Math.cos(a)*l;wcurve([x,y,ex,ey],11,DYE.walnut,{lw:6});}
function standingSpear(x,y,l,{rag=1,head=true}={}){wcurve([x,y,x-4,y-l],16,DYE.walnut,{lw:7});
  if(head){wshape([x-4,y-l-110,x+14,y-l-40,x-4,y-l+4,x-22,y-l-40],DYE.sky,{lw:7,ten:.4});wline([x-4,y-l-96,x-4,y-l-6],DYE.indigo,6);}
  if(rag)wshape([x-6,y-l+40,x-90*rag,y-l+24,x-180*rag,y-l+50,x-140*rag,y-l+70,x-210*rag,y-l+96,x-100*rag,y-l+92,x-6,y-l+80],DYE.madder,{lw:6,ten:.6});}
// cold breath: three wavy bands drifting left from behind the trunk
function coldBreath(x,y,{len=300,s=1}={}){for(let k=0;k<3;k++){const p=[];for(let i=0;i<=10;i++){const u=i/10;p.push(x-u*len,y-k*30*s-u*len*.25+Math.sin(u*9+k)*14*s);}wcurve(p,10*s,k===1?DYE.bone:DYE.skyL,{lw:5});}}
function battleDesign(){
  winterField({ground:800});
  for(const [tx,th,sd] of [[110,560,21],[360,420,22],[640,360,23],[900,330,24],[1150,380,25]])wTree(tx,812,th,{seed:sd,...WINTER});
  // the field: drifts over the fallen, the horse on its back, shields, a helmet, spears
  for(const [mx,my,mw] of [[300,900,220],[820,930,200],[1140,900,170]])wshape([mx-mw/2,my+10,mx-mw*.3,my-26,mx,my-36,mx+mw*.32,my-24,mx+mw/2,my+10],DYE.bone,{lw:7});
  for(const [sx,sy,l,a] of [[360,900,170,-.45],[700,880,140,.35],[980,910,200,-.2],[1220,890,110,.6]])brokenSpear(sx,sy,l,a);
  fallenHorse(560,926,1.0);shield(300,884,52);shield(1130,890,46,.42,DYE.woad,DYE.bone);helmet(860,930,.9,-.5);
  // the great tree, the spear beside it, the breath
  wTree(1650,850,820,{seed:26,...WINTER});
  standingSpear(1480,860,520);coldBreath(1530,640);
  borders('HIC RIGA IN SILVA LATET');
}
frame('03',()=>{weave(()=>battleDesign(),{seed:3,flicker:.15});grade(0);caption('01');});
// Close on the spear and the breath; the rag tugged left as the wind comes up
function spearDesign({wind=0}={}){
  winterField({ground:820,mountains:false});
  for(const [tx,th,sd] of [[140,420,31],[420,340,32],[700,300,33]])wTree(tx,830,th,{seed:sd,...WINTER});
  wTree(1740,850,1700,{seed:27,...WINTER});
  wshape([1440,840,1580,800,1700,794,1840,806,1960,850],DYE.bone,{lw:8});
  standingSpear(1420,850,560,{rag:1+wind*.6});coldBreath(1560,560,{len:520,s:1.6});
  if(wind>0){for(let k=0;k<7;k++){const p=[];for(let i=0;i<=12;i++){const u=i/12;p.push(W-u*W*1.15*wind,180+k*100+Math.sin(u*7+k)*30);}wcurve(p,12,k%2?DYE.bone:DYE.woad,{lw:5});}
    for(let i=0;i<90;i++)wFlake(W-hash(i*2.9)*W*wind,150+hash(i*6.3)*660,.8+hash(i)*.6,i%3?DYE.bone:DYE.sky);
    for(let k=0;k<4;k++)wspiral(W-260-k*360*wind,240+hash(k)*500,70,DYE.bone,{lw:14,turns:1.8});}
  borders('HIC RIGA IN SILVA LATET');
}
frame('04a',()=>{weave(()=>spearDesign(),{seed:4,flicker:.15});grade(0);caption('02');});
frame('04b',()=>{weave(()=>spearDesign({wind:.85}),{seed:4,flicker:.15});grade(0);});

// ================================================================ 09–11 · the anvil, in pure profile, closing on the white-hot iron
// No hammer, no sparks: the iron lies on the anvil burning white and hisses; steam goes up off it in wavy bands.
const ANVIL=[-330,-150,-200,-176,-80,-190,240,-190,300,-180,310,-140,250,-128,180,-116,150,-80,150,-20,200,30,-160,30,-110,-20,-110,-80,-140,-112,-220,-124,-300,-132];
function anvilDesign(){
  rect(0,0,W,H,DYE.wool);
  // the hearth on the left, its flames as palmettes; tools hung on the wall
  wpoly([90,800,90,470,170,380,430,380,510,470,510,800],DYE.sky);wpoly([170,800,170,530,430,530,430,800],DYE.umber);
  for(let i=0;i<5;i++){const fx=200+i*50,fh=110+hash(i*3)*80;wshape([fx-24,800,fx-8,800-fh*.6,fx,800-fh,fx+12,800-fh*.5,fx+24,800],i%2?DYE.weld:DYE.madder,{lw:6});}
  wpoly([60,380,540,380,440,140,160,140],DYE.walnut);
  for(const [tx,ty,k] of [[1400,240,0],[1490,230,1],[1580,250,0],[1670,230,1]]){wline([tx,ty-40,tx,ty],DYE.black,5);if(k){wline([tx,ty,tx-14,ty+150,tx-10,ty+160],DYE.black,8);wline([tx,ty,tx+14,ty+150,tx+10,ty+160],DYE.black,8);}else{wline([tx,ty,tx,ty+120],DYE.walnut,12);wpoly([tx-26,ty+120,tx+26,ty+120,tx+26,ty+150,tx-26,ty+150],DYE.black);}}
  wGround(850,{cols:[DYE.walnut,DYE.umber,DYE.walnut]});
  // stump and anvil, each one silhouette with its inner line
  wObj(()=>wpoly([800,880,1120,880,1090,690,830,690],'#fff',{line:null}),DYE.walnut,DYE.ochre);
  wObj(()=>{ctx.save();ctx.translate(960,690);shape(ANVIL,'#fff');ctx.restore();},DYE.black,DYE.woad);
  // the iron, white at the heart, weld and madder at its edges; heat in rings; steam
  for(let k=3;k>=1;k--){ctx.save();ctx.beginPath();ctx.ellipse(1000,480,140+k*60,46+k*22,0,Math.PI,TAU);ctx.strokeStyle=k===1?DYE.weld:k===2?DYE.madder:DYE.rust;ctx.lineWidth=12;ctx.stroke();ctx.restore();}
  wshape([880,500,1120,500,1124,470,876,470],DYE.bone,{line:DYE.weld,lw:10,ten:.2});wline([900,486,1100,486],DYE.weldL,6);
  for(let k=0;k<4;k++){const p=[];for(let i=0;i<=8;i++){const u=i/8;p.push(920+k*55+Math.sin(u*8+k)*20,460-u*300);}wcurve(p,10,k%2?DYE.bone:DYE.skyL,{lw:5});}
  borders('HIC FERRVM HAVARDI CANDET');
}
function anvilAt(z,cx=1000,cy=486){weave(()=>{ctx.save();ctx.translate(cx,cy);ctx.scale(z,z);ctx.translate(-cx,-cy);anvilDesign();ctx.restore();},{seed:9,flicker:.4,light:1.05});grade(0);}
frame('09',()=>{anvilAt(1);caption('07');});
frame('10',()=>{anvilAt(1.7);ui(()=>relationOverlay(76));caption('09');});
// so close that the white of the iron fills the frame: then the white is snow
frame('11',()=>{anvilAt(6.5);ctx.save();ctx.globalAlpha=.55;rect(0,0,W,H,'#f3eee2');ctx.restore();});

// ================================================================ 12–18 · the trail, seen from straight above
// One long woven strip of snow that the camera follows. Havard walks ahead, Pipe (with Riga on him) behind; at the
// fork both stop, Riga gets down and walks up to Havard; then he goes back to the horse and the hoof prints break
// into a gallop and run on, through the rest of the film, into the unwoven warp. World x is in frame px, 1 m = 480 px.
const M=480,HY=390,PY=760,BS=1.36,HS=1.45,WALK_V=1.1*M,WALK_T0=87,STOP_T=114;
const XH0=300,XP0=XH0-2*M;                             // Havard leads Pipe by two metres
const trailWalk=(x0,t)=>x0+WALK_V*clamp(t-WALK_T0,0,STOP_T-WALK_T0);
const XS=trailWalk(XH0,STOP_T),XPS=trailWalk(XP0,STOP_T);      // where each of them stops
// the run: speed in px/s rising after "Hyah!", and the horse's position by integration
const RUN_T0=132.4,runV=t=>t<RUN_T0?0:lerp(1.6*M,5.2*M,easeOut(clamp((t-RUN_T0)/5)));
const RUN=(()=>{const a=[];let x=XPS;for(let t=RUN_T0;t<=162;t+=1/60){a.push(x);x+=runV(t)/60;}return a;})();
const runX=t=>t<=RUN_T0?XPS:RUN[Math.min(RUN.length-1,Math.round((t-RUN_T0)*60))];
const WARP_X=runX(153.6)+.2*M+340;                          // where the weaving stops
// A boot print from above, toe along +x when a=0: sole with a wide ball, a waist and a heel, pressed into the snow —
// the wall nearest the light (upper left) in shadow, the floor lit, the tread showing, the snow pushed up at the toe.
const SOLE=[50,0,47,-12,38,-18,22,-19,6,-15,-8,-11,-24,-13,-40,-13,-50,-8,-53,0,-50,8,-40,13,-24,13,-8,11,6,15,22,19,38,18,47,12];
function bootPrint(x,y,s,a,{left=false,age=1}={}){if(age<=0)return;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,left?-s:s);
  wshape(SOLE.map((v,i)=>v*1.14),DYE.bone,{line:null,ten:.8});
  smooth(SOLE,.8);ctx.fillStyle=DYE.woad;ctx.fill();ctx.save();smooth(SOLE,.8);ctx.clip();ctx.translate(5,6);smooth(SOLE,.8);ctx.fillStyle=DYE.sky;ctx.fill();
  for(let tx=-46;tx<46;tx+=11){if(tx>-14&&tx<2)continue;wline([tx,-16,tx,16],DYE.woad,4);}ctx.restore();
  smooth(SOLE,.8);ctx.strokeStyle=DYE.indigo;ctx.lineWidth=4;ctx.stroke();
  wshape([50,-12,62,-6,64,6,52,13,58,0],DYE.bone,{line:DYE.skyL,lw:3});ctx.restore();}
// A shod hoof from above, toe along +x: the round hoof, the horseshoe pressed deepest with its nail holes, the frog.
function hoofPrint(x,y,s,a=0,{deep=0}={}){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s);
  const HOOF=[24,0,21,-14,10,-23,-6,-24,-18,-18,-24,-8,-24,8,-18,18,-6,24,10,23,21,14];
  wshape(HOOF.map(v=>v*1.16),DYE.bone,{line:null});smooth(HOOF);ctx.fillStyle=DYE.sky;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(-2,0,17,-1.9,1.9);ctx.strokeStyle=deep?DYE.indigo:DYE.woad;ctx.lineWidth=9;ctx.stroke();ctx.restore();
  for(const b of [-1.3,-.6,.6,1.3])wdisc(-2+Math.cos(b)*17,Math.sin(b)*17,2.2,DYE.bone,{line:null});
  wline([-18,-7,6,0,-18,7],DYE.woad,4);smooth(HOOF);ctx.strokeStyle=DYE.indigo;ctx.lineWidth=4;ctx.stroke();
  if(deep)wshape([24,-10,34,-4,36,6,26,10,30,0],DYE.bone,{line:DYE.skyL,lw:3});ctx.restore();}
// Everything left in the snow by time t, as [time it appears, draw()].
function trail(){const P=[];
  // walking: Havard's steps, 0.75 m apart, alternating feet; Pipe's walk, hind print just behind each fore print
  for(let k=0,x=XH0-12*M;x<=XS;k++,x+=.75*M)P.push([WALK_T0+(x-XH0)/WALK_V,()=>bootPrint(x,HY+(k%2?38:-38),BS,0,{left:k%2===0})]);
  for(let k=0,x=XP0-12*M;x<=XPS;k++,x+=.8*M){const y=PY+(k%2?70:-70);P.push([WALK_T0+(x-XP0)/WALK_V,()=>{hoofPrint(x,y,HS);hoofPrint(x-40,y+(k%2?8:-8),HS*.95);}]);}
  // the stop: Havard steps down off his line and turns to face the horse
  P.push([116.4,()=>bootPrint(XS-.4*M,HY+130,BS,2.4,{left:true})]);
  P.push([117.0,()=>{bootPrint(XS-.75*M,HY+190,BS,Math.PI);bootPrint(XS-.75*M,HY+270,BS,Math.PI,{left:true});}]);
  P.push([116.2,()=>{hoofPrint(XPS+.3*M,PY-70,HS);hoofPrint(XPS+.3*M,PY+70,HS);}]);
  // Riga gets down on the near side and walks up to him: smaller prints, toe to toe at the end
  const RX=XS-.75*M-.62*M;
  P.push([117.2,()=>bootPrint(XPS+.6*M,PY-190,BS*.85,-.5,{left:true})]);
  P.push([117.8,()=>bootPrint(lerp(XPS+.6*M,RX,.5),HY+320,BS*.85,-.3)]);
  P.push([118.5,()=>{bootPrint(RX,HY+190,BS*.85,0,{left:true});bootPrint(RX,HY+270,BS*.85,0);}]);
  // after the parting: back to the horse, and the gallop, prints in fours, a stride apart, snow thrown up behind
  P.push([128.8,()=>bootPrint(lerp(XPS+.6*M,RX,.45),HY+390,BS*.85,2.9,{left:true})]);
  P.push([129.4,()=>bootPrint(XPS+.55*M,PY-110,BS*.85,2.7)]);
  let g=0;for(let t=RUN_T0+.3;t<160.6;t+=.42,g++){const x=runX(t),gp=g;if(x+1.3*M>WARP_X)break;P.push([t,()=>{
    for(const [dx,dy] of [[0,-56],[.3*M,56],[.9*M,-50],[1.2*M,60]])hoofPrint(x+dx,PY+dy,HS,0,{deep:1});
    for(let i=0;i<12;i++)wFlake(x-40-hash(gp*7+i)*.7*M,PY+(hash(gp*9+i)-.5)*220,.5+hash(gp+i)*.5,i%3?DYE.bone:DYE.sky);}]);}
  return P;}
const TRAIL=trail();
// Where the camera looks (world x of the frame centre) at time t.
function trailCam(t){
  const walk=(trailWalk(XH0,t)+trailWalk(XP0,t))/2-.2*M,stop=(XS+XPS)/2+.15*M;
  if(t<STOP_T)return walk;if(t<RUN_T0+.6)return stop;
  return lerp(stop,runX(t)+.2*M,easeInOut(clamp((t-RUN_T0-.6)/2.4)));}
function trailDesign(t,{words}={}){
  const cam=trailCam(t),ox=W/2-cam;rect(0,0,W,H,DYE.bone);
  // the snow's own lie: long drifts, stones and dead grass poking through, all moving with the ground
  const i0=Math.floor((cam-W)/280),i1=Math.ceil((cam+W)/280);
  for(let i=i0;i<=i1;i++){const x=i*280+ox,h1=hash(i*1.7),h2=hash(i*2.3),h3=hash(i*3.1);
    wpoly([x-200,180+h1*620,x+260,170+h1*620,x+300,190+h1*620,x-160,198+h1*620],DYE.wool,{line:null});
    if(h2>.55){const sx=x+h3*200,sy=h2>.8?300+h1*100:860-h1*60;wshape(ell(sx,sy,16+h3*12,10+h3*6),DYE.grey,{lw:4});wshape(ell(sx-4,sy-4,10+h3*6,5),DYE.bone,{line:null});}
    if(h3>.6){const gx=x+h1*220,gy=h3>.8?250:870;for(let k=-2;k<=2;k++)wline([gx+k*7,gy,gx+k*12,gy-26-hash(i+k)*14],DYE.ochre,5);}}
  // tree crowns along both edges, nearer the eye than the ground and so sliding past faster
  const px=W/2-cam*1.3,j0=Math.floor((cam*1.3-W)/520),j1=Math.ceil((cam*1.3+W)/520);
  for(let j=j0;j<=j1;j++)for(const [ty,r] of [[190,110],[968,120]]){const tx=j*520+px+hash(j*5+ty)*200,rr=r*(.85+.3*hash(j*7+ty));if(hash(j*3+ty)<.25)continue;
    for(let k=0;k<7;k++){const a=k/7*TAU+hash(j);wPalmette(tx+Math.cos(a)*rr*.25,ty+Math.sin(a)*rr*.25,rr*.75,a,k%2?DYE.sky:DYE.bone);}wdisc(tx,ty,rr*.22,DYE.indigo);}
  // the prints laid so far
  ctx.save();ctx.translate(ox,0);for(const [at,draw] of TRAIL)if(t>=at)draw();ctx.restore();
  // past the end of the weaving: bare warp on the dark wall
  const wx=WARP_X+ox;if(wx<W+40){rect(wx,0,W-wx+40,H,DYE.black);for(let x=Math.ceil((wx+6)/12)*12;x<W;x+=12)rect(x,0,6,H,DYE.linen);
    for(let y=0;y<H;y+=34){const l=20+hash(y)*90;wline([wx,y,wx+l*.5,y+8,wx+l,y+l*.3],[DYE.bone,DYE.sky,DYE.wool][y%3],4);}}
  borders(words||(t<116?'HIC HAVARD ET RIGA PROFICISCVNTVR':t<RUN_T0?'HIC RIGA ET HAVARD VALEDICVNT':'HIC RIGA EQVITAT AD HELGARD'));
}
// the frame at time t: woven, then darkened at the very end
function trailFrame(t){weave(()=>trailDesign(t),{seed:12,flicker:.12+.1*Math.sin(t*3)});grade(0);
  if(t>155.6){ctx.save();ctx.globalAlpha=clamp((t-155.6)/4.4)*.96;rect(0,0,W,H,'#050403');ctx.restore();}}
window.trailFrame=trailFrame;
frame('12a',()=>{trailFrame(89);caption('10');});
frame('12b',()=>{trailFrame(96.5);caption('10');});
frame('14a',()=>{trailFrame(117.9);});
frame('14b',()=>{trailFrame(124);caption('12');});
frame('15a',()=>{trailFrame(133.6);caption('13');});
frame('15b',()=>{trailFrame(136.5);});
frame('16',()=>{trailFrame(147);ui(()=>outlinePanel(150.4));});
frame('17',()=>{trailFrame(153.6);caption('14');});
frame('18',()=>{trailFrame(158.4);});

// ================================================================ 13 · Havard's directions, a woven map
frame('13',()=>{weave(()=>{rect(0,0,W,H,DYE.wool);
  for(let i=0;i<10;i++){const x=150+i*66+(i%2)*18,y=300+(i%3)*22,h=90+hash(i)*30;wpoly([x-46,y,x,y-h,x+46,y],i%2?DYE.sky:DYE.woad,{lw:6});wpoly([x,y-h,x-16,y-h*.62,x+16,y-h*.62],DYE.bone,{line:null});}
  wcurve([1220,900,1460,720,1380,520,1600,400,1760,310,1700,190,1860,140],22,DYE.woad,{lw:6});
  [[640,640,5],[1000,600,4],[1260,280,3],[300,540,4],[1380,760,3]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++){const tx=fx+(i-(n-1)/2)*64,ty=fy+(i%2)*16;wline([tx,ty,tx,ty-56],DYE.indigo,9);wPalmette(tx,ty-50,44,-Math.PI/2,i%2?DYE.sky:DYE.bone);}});
  ctx.save();ctx.setLineDash([24,16]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=14;const pts=PLACES.map(p=>[p[1],p[2]+40]);for(let i=1;i<pts.length;i++){const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);ctx.stroke();}ctx.restore();
  PLACES.forEach(([name,x,y])=>{y+=40;for(let k=0;k<3;k++){const hx=x-32+k*32,hy=y+(k===1?-10:0);wpoly([hx-14,hy,hx-14,hy-24,hx+14,hy-24,hx+14,hy],DYE.bone,{lw:5});wpoly([hx-18,hy-24,hx,hy-46,hx+18,hy-24],DYE.madder,{lw:5});}
    text(name,x,y+70,{size:44,weight:700,color:DYE.black,font:SERIF,align:'center',spacing:4});});
  ctx.save();ctx.translate(1720,300);for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([Math.cos(a-.12)*50,Math.sin(a-.12)*50,Math.cos(a)*(i%4?72:110),Math.sin(a)*(i%4?72:110),Math.cos(a+.12)*50,Math.sin(a+.12)*50],i%2?DYE.madder:DYE.weld,{lw:5});}wdisc(0,0,50,DYE.weld);wspiral(0,0,32,DYE.madder,{lw:9});ctx.restore();
  borders('HIC VIA AD HELGARD');},{seed:13,flicker:.1});grade(0);ui(()=>{mapToolbar(103);cursor(1176,410,1,.4);});caption('11');});

