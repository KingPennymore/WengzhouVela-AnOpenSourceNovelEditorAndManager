// Key frames of storyboard v4 (storyboard.md): every scene woven, and no people in any of them. Havard and Riga are
// there only in what they leave: a spear, breath, tools, footprints, reins running out of the frame. The world and
// the horse Pipe are woven in the modelled manner of late-medieval Flemish tapestry; the two spirits, Arthur and
// Sinfran, in the older Viking manner (one silhouette, an inner contour, spirals at the joints).
window.FRAMES={};const frame=(id,fn)=>{window.FRAMES[id]=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';TINT.k=0;UI_LAYER.length=0;fn();ctx.setTransform(1,0,0,1,0,0);UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});};};
const line=id=>P.lines.find(l=>l.id===id);
const caption=id=>{const l=line(id);sampleCaption(l.zh,l.en);};
const R=RAMP;

// ---------------------------------------------------------------- figure kit
// A limb from a to b (and on to c), tapered from w0 to w1 (and w2): returns outline points for mshape.
function limbPts(pts,ws){const n=pts.length/2,L=[],Rr=[];for(let i=0;i<n;i++){const x=pts[i*2],y=pts[i*2+1],j0=Math.max(0,i-1),j1=Math.min(n-1,i+1),dx=pts[j1*2]-pts[j0*2],dy=pts[j1*2+1]-pts[j0*2+1],l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,w=ws[i]/2;L.push(x+nx*w,y+ny*w);Rr.push(x-nx*w,y-ny*w);}
  const out=[...L];for(let i=n-1;i>=0;i--)out.push(Rr[i*2],Rr[i*2+1]);return out;}
const ell=(cx,cy,rx,ry,n=14,rot=0)=>{const p=[];for(let i=0;i<n;i++){const a=i/n*TAU,x=Math.cos(a)*rx,y=Math.sin(a)*ry;p.push(cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot));}return p;};
function at(x,y,s,face,draw){ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);draw();ctx.restore();}
function hammerAt(hx,hy,ang,len=150){const ex=hx+Math.cos(ang)*len,ey=hy+Math.sin(ang)*len;mshape(limbPts([hx-Math.cos(ang)*26,hy-Math.sin(ang)*26,ex,ey],[12,12]),R.walnut,{lw:5});
  ctx.save();ctx.translate(ex,ey);ctx.rotate(ang);mshape([-14,-36,14,-36,18,32,-18,32],R.iron,{poly:true,lw:5,ang:0});ctx.restore();}
function tongsAt(x0,y0,x1,y1){wline([x0,y0,(x0+x1)/2,(y0+y1)/2-6,x1,y1],DYE.black,9);wline([x0,y0+12,(x0+x1)/2,(y0+y1)/2+8,x1,y1+4],DYE.black,9);}

// ---------------------------------------------------------------- the forge
function forgeRoom({look=0,raised=1,thread=0}={}){
  // a dark timbered room; the hearth at the back left throws its light across the planks in hatched bands
  for(let i=0;i<26;i++){const x=i*76-10;mshape([x,-10,x+76,-10,x+76,760,x,760],R.walnut,{poly:true,lw:5,ang:hash(i)>.5?1.2:1.9,bias:.15});}
  ctx.save();ctx.globalCompositeOperation='source-over';const fg=ctx.createRadialGradient(300,560,40,300,560,900);fg.addColorStop(0,'rgba(227,195,110,.95)');fg.addColorStop(.3,'rgba(196,106,74,.7)');fg.addColorStop(.7,'rgba(110,42,32,.25)');fg.addColorStop(1,'rgba(58,42,34,0)');ctx.fillStyle=fg;ctx.fillRect(0,0,W,760);ctx.restore();
  for(const y of [120,430])mshape([-10,y,W+10,y,W+10,y+34,-10,y+34],R.walnut,{poly:true,lw:5,ang:1.57});
  // window on the snow
  mshape([1420,170,1680,170,1680,470,1420,470],R.sky,{poly:true,lw:8,ang:1.4});for(let i=0;i<7;i++)spruceW(1440+i*40,470,60+hash(i)*70,R.moss);mshape([1420,430,1680,430,1680,470,1420,470],R.snow,{poly:true,line:null});
  wline([1550,170,1550,470],DYE.walnut,12);wline([1420,320,1680,320],DYE.walnut,12);ctx.strokeStyle=OUT;ctx.lineWidth=14;ctx.strokeRect(1420,170,260,300);
  // hearth of stone with its hood
  mshape([120,760,120,420,170,340,470,340,520,420,520,760],R.wool,{poly:true,ang:1.1});
  for(let r=0;r<8;r++)for(let c=0;c<5;c++){const bx=124+c*80+(r%2)*40,by=420+r*44;if(bx>500)continue;wline([bx,by,Math.min(bx+80,516),by],DYE.linen,4);}
  mshape([180,760,180,480,460,480,460,760],[DYE.weldL,DYE.madder,DYE.madderD],{poly:true,ang:-1.57});
  for(let i=0;i<6;i++){const fx=210+i*44,fh=120+hash(i*3)*100;mshape([fx-26,760,fx-10,760-fh*.6,fx,760-fh,fx+14,760-fh*.5,fx+26,760],i%2?R.weld:R.madder,{lw:5,ang:-1.57});}
  mshape([80,340,560,340,450,40,190,40],R.walnut,{poly:true,ang:.9});
  for(const [tx,ty,k] of [[740,180,0],[820,170,1],[900,190,0],[980,160,1]]){wline([tx,ty-40,tx,ty],DYE.black,5);if(k){wline([tx,ty,tx-14,ty+150,tx-10,ty+160],DYE.black,8);wline([tx,ty,tx+14,ty+150,tx+10,ty+160],DYE.black,8);}else{wline([tx,ty,tx,ty+120],DYE.walnutL,12);mshape([tx-26,ty+120,tx+26,ty+120,tx+26,ty+150,tx-26,ty+150],R.iron,{poly:true,lw:4});}}
  // the floor, earth going dark towards us
  mshape([-20,740,W+20,740,W+20,H+20,-20,H+20],[DYE.walnutL,DYE.walnut,DYE.umber],{poly:true,ang:1.57,line:null});
  for(let i=0;i<50;i++){const x=hash(i*1.3)*W,y=760+hash(i*2.9)*300;wline([x,y,x+20+hash(i)*30,y+4],DYE.umber,4);}
  // the anvil seen from the front quarter, on its stump
  const A=(x,y)=>[960+(x-960)*1.15,y];
  mshape([890,1060,1050,1060,1030,860,910,860].map((v,i)=>i%2?v:960+(v-960)*1.15),R.walnut,{poly:true,ang:.4});
  mshape([770,790,1130,790,1180,746,830,746].map((v,i)=>i%2?v:960+(v-960)*1.1),R.iron,{poly:true,ang:1.57,lw:6});
  mshape([770,790,1130,790,1110,836,1040,846,1050,866,900,866,910,846,820,836].map((v,i)=>i%2?v:960+(v-960)*1.1),R.black,{poly:true,lw:6});
  mshape([660,768,770,756,770,790,690,786],R.black,{poly:true,lw:5});
  mshape([900,746,1040,746,1052,730,890,730],[DYE.bone,DYE.weldL,DYE.weld],{poly:true,lw:5,line:DYE.ochre,ang:1.57});
  // nobody here: the hammer still raised over the iron, its haft running out of the frame; or laid down across the
  // anvil beside Riga's tongs, and between them the red thread
  if(raised){hammerAt(1200,-60,1.95,780);for(let i=0;i<22;i++){const a=-Math.PI*(.08+.84*hash(i*3+11)),r=60+hash(i*7+11)*300;wFlake(970+Math.cos(a)*r*1.3,730+Math.sin(a)*r,.5+hash(i)*.4,i%3?DYE.weldL:DYE.bone);}}
  else{hammerAt(1080,790,-2.9,200);}
  tongsAt(1320,850,1010,738);
  if(thread>0){ctx.save();ctx.setLineDash([26,18]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(880,770);ctx.bezierCurveTo(940,560,1180,560,1250,820);ctx.stroke();ctx.restore();}
  wFrame();
}
// A spruce woven in the modelled manner: dark green tiers, lit on the left, snow on the upper edges.
function spruceW(x,y,h,ramp=R.moss,{snow=true}={}){
  wline([x,y,x,y-h*.9],DYE.umber,Math.max(4,h*.03));
  const n=6;for(let i=0;i<n;i++){const k=i/n,yb=y-h*(.08+.8*k),w=h*.3*(1-k*.82),ht=h*.26;
    mshape([x,yb-ht,x+w*.5,yb-ht*.35,x+w,yb,x+w*.4,yb-ht*.08,x,yb+ht*.04,x-w*.4,yb-ht*.08,x-w,yb,x-w*.5,yb-ht*.35],ramp,{poly:true,lw:Math.max(3,h*.018),ang:.3});
    if(snow)mshape([x,yb-ht,x-w*.55,yb-ht*.25,x-w*.2,yb-ht*.32,x+w*.3,yb-ht*.3],R.snow,{poly:true,line:null});}
}
frame('09b',()=>{weave(()=>forgeRoom({raised:1}),{seed:21,flicker:.5,light:1.1,pw:4,ph:3});grade(0);caption('07');});
frame('10',()=>{weave(()=>forgeRoom({raised:0,thread:1}),{seed:21,flicker:.2,light:1.1,pw:4,ph:3});grade(0);ui(()=>relationOverlay(76));caption('09');});

// ================================================================ 01–02 · the logo as in the 0.9.8 film, then it burns from the corners
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
// the four burn fronts, one from each corner, already meeting near the middle; through them the woven wood
const CORNERS=[[0,0],[W,0],[0,H],[W,H]];
frame('02',()=>{
  wood();grade(0);const under=snapshot();vela98();
  const holes=CORNERS.map(([x,y],i)=>burnPath(x,y,640+i*30,1.3+i));
  ctx.save();ctx.beginPath();holes.forEach(hp=>{ctx.moveTo(hp[0],hp[1]);for(let i=2;i<hp.length;i+=2)ctx.lineTo(hp[i],hp[i+1]);ctx.closePath();});ctx.clip();ctx.drawImage(under,0,0);ctx.restore();
  holes.forEach(hp=>{ctx.save();path(hp);ctx.shadowColor='#ff6a10';ctx.shadowBlur=34;ctx.strokeStyle='#ff8c2e';ctx.lineWidth=8;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a6';ctx.lineWidth=2.4;ctx.stroke();ctx.restore();
    for(let i=0;i<24;i++){const k=Math.floor(hash(i*7.3+hp[0])*hp.length/2)*2,x=hp[k],y=hp[k+1];ctx.save();glow(x,y,26,'#ff8a2a',.5);ctx.fillStyle='#241309';ctx.beginPath();ctx.arc(x+(hash(i)-.5)*30,y+(hash(i*3)-.5)*30,3+hash(i*5)*6,0,TAU);ctx.fill();ctx.restore();}});
  caption('01');
});
function snapshot(){const c=layerCanvas();c.getContext('2d').drawImage(canvas,0,0);return c;}

// ================================================================ 03–04 · the wood after the battle, woven
// A verdure in winter: a high horizon, spruce woods going back in paler wools, the field of the fallen, and at the
// right a great spruce. Riga is behind it: his spear stands beside the trunk and his breath curls out past it.
function woodDesign({close=0,wind=0}={}){
  mshape([-20,-20,W+20,-20,W+20,470,-20,470],[DYE.bone,DYE.skyL,DYE.sky],{poly:true,line:null,ang:-1.57});for(const [y,w] of [[90,900],[170,1300],[250,700]]){const x=hash(y)*W*.6;mshape([x,y,x+w,y-10,x+w+60,y+6,x+40,y+14],DYE.skyL,{poly:true,line:null});}
  for(let i=0;i<8;i++){const x=i*280-60;mshape([x,520,x+150,330+hash(i)*70,x+300,520],R.sky,{poly:true,lw:5,ang:.3});mshape([x+150,330+hash(i)*70,x+110,380+hash(i)*60,x+190,380+hash(i)*60],R.snow,{poly:true,line:null});}
  for(let i=0;i<34;i++)spruceW(i*60+hash(i)*30-20,560+hash(i*2)*16,120+hash(i*3)*70,R.sky);
  mshape([-20,560,W+20,548,W+20,H+20,-20,H+20],R.snow,{poly:true,line:null,ang:1.57});
  for(let i=0;i<22;i++)spruceW(i*92+hash(i+40)*40-30,640+hash(i*5)*30,200+hash(i*7)*120,R.moss);
  mshape([-20,660,W+20,640,W+20,H+20,-20,H+20],R.snow,{poly:true,lw:5,ang:1.57,bias:-.1});
  // the fallen under the snow, broken spears, a shield, the red banner
  for(const [mx,my,mw,mh] of [[260,760,200,40],[640,740,160,30],[980,790,240,46],[1220,746,140,28],[480,820,130,26]])mshape([mx-mw/2,my,mx-mw*.3,my-mh*.8,mx,my-mh,mx+mw*.32,my-mh*.7,mx+mw/2,my],R.snow,{lw:5,ang:.6});
  for(const [sx,sy,l,a] of [[340,762,150,-.45],[700,742,120,.35],[1030,790,190,-.2],[1180,750,90,.6],[860,800,110,-.75],[540,820,80,.25]]){wline([sx,sy,sx+Math.sin(a)*l,sy-Math.cos(a)*l],DYE.umber,7);}
  mshape(ell(760,812,34,20),R.madder,{lw:5});wline([732,812,788,812],DYE.weld,6);
  wline([1100,800,1124,580],DYE.umber,8);mshape([1123,590,1060,598,1010,588,960,612,990,620,950,640,1010,628,1060,640,1120,632],R.madder,{poly:true,lw:5,ang:1.57});
  // boot prints from the left, going round behind the great spruce
  for(let i=0;i<13;i++){const k=i/12,x=lerp(60,1500,k)+(i%2?10:-10),y=lerp(930,860,k);mshape(ell(x,y,lerp(22,14,k),lerp(9,6,k)),R.sky,{line:null});}
  // the great spruce, the spear, the breath
  const TX=1650;mshape([TX-90,-20,TX+90,-20,TX+120,880,TX-130,880],R.walnut,{poly:true,ang:.2,bias:-.15});
  for(let i=0;i<16;i++){const y=hash(i*3.1)*860,x=TX-80+hash(i*5.3)*160;wline([x,y,x+(hash(i)-.5)*10,y+60+hash(i*2)*80],DYE.umber,5);}
  for(let i=0;i<6;i++){const by=-40+i*76,L=300+i*70,dr=60+i*14,pt=u=>[TX-30-L*u,by+dr*u*u];const p=[];for(let k=0;k<=12;k++){const [x,y]=pt(k/12);p.push(x,y);}for(let k=12;k>=0;k--){const [x,y]=pt(k/12);p.push(x+(k%2?10:-6),y+(26+30*(1-k/12))*(k%2?1.5:.7));}mshape(p,R.moss,{poly:true,lw:5,ang:1.4});const q=[];for(let k=0;k<=11;k++){const [x,y]=pt(k/12);q.push(x,y-6);}for(let k=11;k>=0;k--){const [x,y]=pt(k/12);q.push(x,y+10);}mshape(q,R.snow,{poly:true,line:null});}
  mshape([TX-250,890,TX-130,850,TX,846,TX+160,856,TX+300,890],R.snow,{lw:5,ang:1.57});
  wline([TX-150,860,TX-160,180],DYE.walnut,10);mshape([TX-160,96,TX-148,150,TX-154,184,TX-166,184,TX-172,150],R.iron,{poly:true,lw:4});
  mshape([TX-158,206,TX-230,214,TX-300,200,TX-262,226,TX-320,246,TX-240,238,TX-158,232],R.madder,{poly:true,lw:5,ang:1.57});
  // breath: small scalloped woven clouds drifting left and up past the trunk
  for(let i=0;i<4;i++){const bx=TX-170-i*130-wind*200,by=720-i*70,r=26+i*14;const p=[];for(let k=0;k<10;k++){const a=k/10*TAU,rr=r*(k%2?1:1.3);p.push(bx+Math.cos(a)*rr*1.5,by+Math.sin(a)*rr*.8);}mshape(p,R.snow,{lw:4,line:DYE.skyL,ang:1.4,ten:.8});}
  if(wind>0){for(let k=0;k<9;k++){const y=120+k*100,p=[];for(let i=0;i<=14;i++){const u=i/14;p.push(W+40-u*W*1.2*wind,y+Math.sin(u*8+k)*24);}wcurve(p,16,k%2?DYE.bone:DYE.skyL,{lw:5,line:DYE.sky});}
    for(let k=0;k<5;k++){const cx=W-200-k*330*wind,cy=200+hash(k)*600;wspiral(cx,cy,60+hash(k*3)*40,DYE.bone,{lw:14,turns:1.8});}}
  wFrame();
}
function wood(o={}){weave(()=>woodDesign(o),{seed:3,flicker:.15,pw:4,ph:3});}
frame('03',()=>{wood();grade(0);caption('01');});
frame('04a',()=>{wood();grade(0);const b=snapshot();ctx.save();ctx.translate(-1480*1.0,-140);ctx.scale(1.9,1.9);ctx.drawImage(b,0,0);ctx.restore();caption('02');});
frame('04b',()=>{wood({wind:.8});grade(0);});

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

// ================================================================ 09a · the blow, close
frame('09a',()=>{weave(()=>{
  mshape([-20,-20,W+20,-20,W+20,H+20,-20,H+20],R.walnut,{poly:true,line:null,ang:.2});
  mshape([-20,-20,900,-20,700,H+20,-20,H+20],[DYE.weldL,DYE.madder,DYE.walnut],{poly:true,line:null,ang:0});
  // the anvil, low and near, its horn to the left
  mshape([240,700,420,660,600,640,1460,640,1610,652,1630,700,1480,712,1300,730,1260,790,1250,900,1360,990,1380,1100,640,1100,660,990,770,900,760,790,700,735,560,712,380,712],R.iron,{ang:1.57,ten:.35,lw:7});
  mshape([600,640,1460,640,1440,664,620,664],[DYE.grey,DYE.sky,DYE.woad],{poly:true,lw:5,ang:1.57});
  mshape([780,612,1200,612,1210,646,770,646],[DYE.bone,DYE.weldL,DYE.weld],{poly:true,lw:6,line:DYE.ochre,ang:1.57});
  // the hammer face on the iron, the haft leaving the frame at the top right
  mshape(limbPts([1260,-40,1060,420,960,560],[40,38,36]),R.walnut,{lw:5,ang:.3});mshape([820,520,1000,560,980,620,800,580],R.iron,{poly:true,ang:1.3,lw:6});
  for(let i=0;i<40;i++){const a=-Math.PI*(.02+.96*hash(i*3.7)),r=40+hash(i*5.1)*420;wFlake(990+Math.cos(a)*r*1.4,620+Math.sin(a)*r*.7,.5+hash(i)*.7,i%3?DYE.weldL:DYE.bone);}
  wFrame();},{seed:9,flicker:.6,light:1.1,pw:4,ph:3});grade(0);caption('07');});

// ================================================================ 11 · the last spark
frame('11',()=>{weave(()=>{
  mshape([-20,-20,W+20,-20,W+20,H+20,-20,H+20],[DYE.walnut,DYE.umber,DYE.black],{poly:true,line:null,ang:1.57});
  for(let i=0;i<160;i++){const x=hash(i*1.3)*W,y=380+hash(i*2.7)*700;wline([x,y,x+10+hash(i)*30,y+2],hash(i*6.6)>.6?DYE.grey:DYE.umber,4);}
  mshape([1700,-20,1960,-20,1300,H+20,760,H+20],DYE.indigo,{poly:true,line:null});mshape([1780,-20,1900,-20,1180,H+20,940,H+20],DYE.woad,{poly:true,line:null});
  for(let i=0;i<20;i++)wFlake(1100+hash(i*3)*700,hash(i*5)*700,.6,DYE.bone);
  mshape(ell(960,640,120,64),[DYE.madderD,DYE.rust,DYE.umber],{line:null,ang:1.57});
  mshape(ell(960,640,30,16),R.madder,{lw:5});wFlake(960,636,1.3,DYE.bone);
  wFrame();},{seed:11,flicker:.1,light:.95,pw:4,ph:3});grade(0);});

// ================================================================ the bay horse Pipe, modelled
// Facing right, ground at y 0. The gallop follows the photograph: near foreleg planted and slightly back, far foreleg
// folded, near hind reaching under the belly, far hind pushing off behind. Black points, mane and tail.
const PIPE={
  barrel:[-200,-256,-186,-298,-144,-314,-60,-306,0,-304,60,-326,110,-350,160,-300,200,-250,210,-190,176,-160,100,-156,0,-156,-90,-168,-150,-180,-190,-214],
  neck:[64,-330,116,-386,168,-430,218,-462,254,-470,270,-430,256,-378,240,-320,226,-262,214,-206,150,-244,96,-292],
  head:[222,-458,246,-478,256,-502,266,-474,300,-450,334,-410,356,-372,352,-352,330,-350,300,-362,270,-372,246,-386,232,-420],
  mane:[60,-330,110,-388,168,-432,222,-468,236,-458,196,-420,150,-380,100,-328],
  tail:[-196,-282,-250,-282,-320,-250,-384,-200,-424,-150,-404,-138,-352,-168,-300,-200,-250,-232,-206,-250],
};
const GAITS={
  gallop:{farF:[[188,-196,232,-122,212,-70,224,-52],[52,32,24,22]],farH:[[-150,-214,-192,-110,-158,-36,-142,-8],[74,38,26,24]],nearF:[[152,-186,164,-92,142,-40,118,-8],[58,34,26,24]],nearH:[[-96,-206,-124,-124,-86,-76,-62,-50],[84,40,26,24]]},
  stand:{farF:[[124,-186,120,-92,124,-40,126,-6],[50,32,24,22]],farH:[[-148,-212,-178,-108,-156,-40,-152,-6],[72,38,26,24]],nearF:[[152,-186,158,-92,154,-40,152,-6],[58,34,26,24]],nearH:[[-110,-210,-150,-112,-130,-40,-126,-6],[84,40,26,24]]},
};
// Pipe in the manner of the bear: one bay silhouette (body, neck, head, mane, tail, near legs) edged in dark wool,
// an ochre contour inside the edge, spirals at shoulder and haunch, the far legs a darker shape behind; black hooves.
function hoofAt([p,w]){const n=p.length,x=p[n-2],y=p[n-1],dx=x-p[n-4],dy=y-p[n-3],l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l,h=w[3]*.6;
  wpoly([x-uy*h,y+ux*h,x+uy*h,y-ux*h,x+ux*20+uy*h*1.2,y+uy*20-ux*h*1.2,x+ux*20-uy*h*1.2,y+uy*20+ux*h*1.2],DYE.black,{lw:5});}
function pipe(x,y,s,{face=1,gait='gallop',saddle=true,bridle=true}={}){
  const G=GAITS[gait],T=f=>()=>at(x,y,s,face,f);
  wFigure(T(()=>{for(const k of ['farF','farH'])shape(limbPts(G[k][0],G[k][1]),'#fff');}),{fill:DYE.bayD,inner:null});
  T(()=>{hoofAt(G.farF);hoofAt(G.farH);})();
  wFigure(T(()=>{for(const k of ['barrel','neck','head','mane','tail'])shape(PIPE[k],'#fff');for(const k of ['nearF','nearH'])shape(limbPts(G[k][0],G[k][1]),'#fff');}),{fill:DYE.bay,inner:DYE.ochre,band:[17*s,26*s]});
  T(()=>{hoofAt(G.nearF);hoofAt(G.nearH);
    for(const [cx,cy,r,d] of [[-136,-246,54,1],[146,-280,42,-1]]){wspiral(cx,cy,r,DYE.black,{lw:20,dir:d});wspiral(cx,cy,r,DYE.ochre,{lw:9,dir:d});}
    for(let i=0;i<4;i++){const k=i/3;wline([lerp(96,214,k),lerp(-322,-452,k),lerp(70,190,k),lerp(-300,-430,k)],DYE.black,6);}
    for(let i=0;i<3;i++)wline([-230-i*14,-262+i*8,-310-i*16,-214+i*12,-392-i*8,-158+i*10],DYE.black,6);
    wdisc(330,-372,8,DYE.black,{line:null});wdisc(266,-428,7,DYE.bone,{line:null});
    if(bridle){wline([254,-482,300,-404,348,-372],DYE.black,6);wline([286,-372,334,-376],DYE.black,6);}
    if(saddle){wshape([-60,-312,70,-330,96,-250,-46,-236],DYE.weld,{lw:7});wline([-50,-262,86,-272],DYE.madder,10);}})();
}
// ================================================================ 12 · the road out of the village, from behind them
function winterVerdure({horizon=430}={}){
  mshape([-20,-20,W+20,-20,W+20,horizon+20,-20,horizon+20],[DYE.bone,DYE.skyL,DYE.sky],{poly:true,line:null,ang:-1.57});for(const [y,w] of [[90,900],[170,1300],[250,700]]){const x=hash(y)*W*.6;mshape([x,y,x+w,y-10,x+w+60,y+6,x+40,y+14],DYE.skyL,{poly:true,line:null});}
  for(let i=0;i<7;i++){const x=i*320-80;mshape([x,horizon+70,x+170,horizon-130+hash(i)*60,x+340,horizon+70],R.sky,{poly:true,lw:5,ang:.3});}
  mshape([-20,horizon+40,W+20,horizon+30,W+20,H+20,-20,H+20],R.snow,{poly:true,line:null,ang:1.57});
}
frame('12',()=>{weave(()=>{winterVerdure({horizon:400});
  // the road narrowing to the fork, trees on either hand
  mshape([600,H+20,1320,H+20,1010,480,930,480],R.sky,{poly:true,line:null,ang:1.57});mshape([930,480,1010,480,760,440,720,446],R.sky,{poly:true,line:null});mshape([930,480,1010,480,1240,440,1200,446],R.sky,{poly:true,line:null});
  for(let i=0;i<12;i++){const k=i/11,y=lerp(470,980,k*k),s=lerp(.35,1.6,k*k);spruceW(lerp(860,360,k*k)-hash(i)*40,y,260*s,R.moss);spruceW(lerp(1080,1600,k*k)+hash(i*3)*40,y+6,250*s,R.moss);}
  // hoof prints and boot prints coming up behind them
  for(let k=0;k<22;k++){const u=k/21,y=lerp(1060,500,Math.pow(u,.7)),sc=lerp(1,.25,Math.pow(u,.7));mshape(ell(lerp(880,950,Math.pow(u,.7)),y,20*sc,8*sc),R.woad,{line:null});mshape(ell(lerp(1040,980,Math.pow(u,.7))+(k%2?10:-10)*sc,y+12*sc,16*sc,7*sc),R.sky,{line:null});}
  wFrame();},{seed:12,flicker:.1,pw:4,ph:3});grade(0);caption('10');});

// ================================================================ 13 · the map, woven
frame('13',()=>{weave(()=>{
  mshape([-20,-20,W+20,-20,W+20,H+20,-20,H+20],R.wool,{poly:true,line:null,ang:1.2});
  for(let i=0;i<10;i++){const x=150+i*66+(i%2)*18,y=220+(i%3)*22,h=70+hash(i)*30;mshape([x-44,y,x,y-h,x+44,y],R.sky,{poly:true,lw:5,ang:.2});mshape([x,y-h,x-16,y-h*.6,x+14,y-h*.62],R.snow,{poly:true,line:null});}
  wcurve([1220,880,1460,700,1380,500,1600,380,1760,290,1700,160,1860,80],18,DYE.woad,{lw:5,line:DYE.indigo});
  [[640,600,14],[1000,570,12],[1260,220,10],[300,500,12],[1380,720,9]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++)spruceW(fx+(hash(j*20+i)-.5)*220,fy+(hash(j*20+i*3)-.5)*100,54,R.moss,{snow:false});});
  ctx.save();ctx.setLineDash([22,14]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=12;const pts=PLACES.map(p=>[p[1],p[2]]);for(let i=1;i<pts.length;i++){const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);ctx.stroke();}ctx.restore();
  PLACES.forEach(([name,x,y])=>{for(let k=0;k<3;k++){const hx=x-30+k*24,hy=y+(k===1?-8:0);mshape([hx-11,hy,hx-11,hy-18,hx+11,hy-18,hx+11,hy],R.wool,{poly:true,lw:4});mshape([hx-14,hy-18,hx,hy-34,hx+14,hy-18],R.madder,{poly:true,lw:4});}
    text(name,x,y+64,{size:40,weight:700,color:DYE.umber,font:SERIF,align:'center',spacing:4});});
  text('因舍森',330,130,{size:34,weight:700,color:DYE.umber,font:SERIF,spacing:8});text('柯戈德河',1680,330,{size:30,weight:700,color:DYE.indigo,font:SERIF,spacing:6});
  mshape([760,960,1160,960,1180,1010,740,1010],R.madder,{poly:true,lw:5});text('瑞 达 内',960,1000,{size:36,weight:700,color:DYE.bone,font:SERIF,align:'center',spacing:10});
  ctx.save();ctx.translate(1740,200);wdisc(0,0,56,DYE.weld,{lw:6});for(let k=0;k<8;k++){const a=k*Math.PI/4-Math.PI/2,r=k%2?54:96;wpoly([Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.3)*18,Math.sin(a+.3)*18,0,0,Math.cos(a-.3)*18,Math.sin(a-.3)*18],k%2?DYE.woad:DYE.madder,{lw:4});}ctx.restore();
  wFrame();},{seed:13,flicker:.1,pw:4,ph:3});grade(0);ui(()=>{mapToolbar(103);cursor(1176,360,1,.4);});caption('11');});

// ================================================================ 14 · the parting, as it is left in the snow
function prints(x,y,s,a,{ramp=R.sky,lw=0}={}){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s);mshape([-40,0,-38,-16,-10,-22,26,-20,42,-8,40,8,20,18,-14,18,-36,12],ramp,{line:lw?OUT:null,lw});mshape([-30,-4,-18,-12,10,-14,28,-10,30,0,14,8,-14,8],[DYE.woad,DYE.indigo,DYE.indigo],{line:null});ctx.restore();}
frame('14a',()=>{weave(()=>{winterVerdure({horizon:420});
  for(let i=0;i<8;i++)spruceW(80+i*80,560+hash(i)*20,260+hash(i*2)*80,R.moss);for(let i=0;i<5;i++)spruceW(1560+i*80,560+hash(i+9)*20,260+hash(i*5)*80,R.moss);
  mshape([500,H+20,1400,H+20,1040,520,960,520],R.sky,{poly:true,line:null,ang:1.57});
  pipe(1300,760,.95,{face:-1,gait:'stand'});
  // two pairs of prints toe to toe, one pair large, one small; the large pair, a step back, turned towards the village
  prints(860,880,1.3,0);prints(870,930,1.3,0);prints(1010,876,1.05,Math.PI);prints(1004,922,1.05,Math.PI);
  prints(700,900,1.3,.2);prints(560,930,1.3,.15);
  wFrame();},{seed:14,flicker:.15,pw:4,ph:3});grade(0);});
frame('14b',()=>{weave(()=>{
  mshape([-20,-20,W+20,-20,W+20,H+20,-20,H+20],R.snow,{poly:true,line:null,ang:1.2});
  for(let i=0;i<30;i++){const x=hash(i*3)*W,y=hash(i*5)*H;mshape(ell(x,y,180+hash(i)*160,24),i%2?DYE.bone:DYE.skyL,{line:null});}
  prints(760,560,3,0);prints(790,700,3,0);prints(1130,540,2.5,Math.PI);prints(1120,676,2.5,Math.PI);
  for(let k=0;k<4;k++)prints(560-k*260,640+(k%2?70:-50),3,-.05);
  for(let k=0;k<5;k++){const x=1380+k*130,y=600+(k%2?-30:30)-k*16;mshape(ell(x,y,40,26),R.sky,{line:null});mshape(ell(x+8,y,18,12),DYE.bone,{line:null});}
  for(let i=0;i<50;i++)wFlake(hash(i*2.1)*W,hash(i*4.7)*H,.8+hash(i)*.5,DYE.bone);
  wFrame();},{seed:15,flicker:.1,pw:4,ph:3});grade(0);caption('12');});

// ================================================================ 15–18 · the ride, kept close on Pipe so the rider stays out of frame
frame('15a',()=>{weave(()=>{winterVerdure({horizon:420});
  for(let i=0;i<9;i++)spruceW(80+i*80,560+hash(i)*20,260+hash(i*2)*80,R.moss);for(let i=0;i<5;i++)spruceW(1560+i*80,560+hash(i+9)*20,260+hash(i*5)*80,R.moss);
  mshape([500,H+20,1400,H+20,1040,520,960,520],R.sky,{poly:true,line:null,ang:1.57});
  // Havard's prints stay by the road; the hoof prints lengthen into a run, snow kicked up behind them
  prints(620,900,1.3,-.2);prints(640,950,1.3,-.2);
  for(let k=0;k<9;k++){const u=k/8,x=lerp(960,1020,u),y=lerp(1000,560,Math.pow(u,.8)),sc=lerp(1.2,.35,u),gap=k%2?14:-14;mshape(ell(x+gap*sc,y,26*sc,12*sc),R.woad,{line:null});mshape(ell(x+gap*sc+4*sc,y-2*sc,12*sc,5*sc),DYE.bone,{line:null});}
  for(let i=0;i<40;i++){const a=-Math.PI*(.2+.6*hash(i*2.3)),r=20+hash(i*4.1)*160;wFlake(1000+Math.cos(a)*r,640+Math.sin(a)*r*.6,.6+hash(i*7)*.5,DYE.bone);}
  wFrame();},{seed:16,flicker:.1,pw:4,ph:3});grade(0);caption('13');});
// the gallop of the photograph, the whole horse, running free: no saddle, no bridle
function gallopDesign({x=900}={}){winterVerdure({horizon:420});
  for(let i=0;i<14;i++)spruceW(i*150+hash(i)*60-40,600+hash(i*2)*30,240+hash(i*3)*120,R.moss);
  mshape([-20,860,W+20,846,W+20,940,-20,960],R.sky,{poly:true,line:null,ang:1.57});
  for(let i=0;i<14;i++)mshape(ell(x-560-i*110,904+(i%2)*14,16,7),R.woad,{line:null});
  for(let i=0;i<70;i++){const fx=hash(i*3.3)*W,fy=60+hash(i*7.1)*700;wFlake(fx,fy,.7+hash(i)*.5,DYE.bone);}
  pipe(x,900,1.35,{saddle:false,bridle:false});
  for(let i=0;i<24;i++){const a=-Math.PI*(.15+.7*hash(i*2.3)),r=20+hash(i*4.1)*120;wFlake(x-150*1.35+Math.cos(a)*r,890+Math.sin(a)*r*.5,.6+hash(i*7)*.5,DYE.bone);}
  wFrame();}
frame('15b',()=>{weave(()=>gallopDesign(),{seed:17,flicker:.3,pw:4,ph:3});grade(0);});
frame('16',()=>{weave(()=>gallopDesign({x:620}),{seed:17,flicker:.3,pw:4,ph:3});grade(0);ui(()=>outlinePanel(150.4));});
frame('17',()=>{
  weave(()=>gallopDesign({x:820}),{seed:17,flicker:.3,pw:4,ph:3});
  const edge=y=>1440+Math.sin(y/90)*40+noise(y/26)*50;
  ctx.save();ctx.beginPath();ctx.moveTo(W,0);for(let y=0;y<=H;y+=10)ctx.lineTo(edge(y),y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#0f0b09';ctx.fill();ctx.clip();
  for(let x=1300;x<W;x+=8){ctx.strokeStyle='rgba(222,207,174,.75)';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(x+Math.sin(x)*2,0);ctx.lineTo(x+Math.sin(x*1.7)*4,H);ctx.stroke();}ctx.restore();
  for(let i=0;i<70;i++){const y=hash(i*2.3)*H,x0=edge(y),l=30+hash(i*5.1)*140;ctx.strokeStyle=[DYE.bone,DYE.sky,DYE.moss][i%3];ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x0,y);ctx.quadraticCurveTo(x0+l*.5,y+10,x0+l,y+l*.4);ctx.stroke();}
  grade(0);caption('14');
});
frame('18',()=>{
  weave(()=>{rect(0,0,W,H,DYE.black);for(let x=0;x<W;x+=8)wline([x,0,x,H],DYE.umber,2);pipe(760,900,1.35,{saddle:false,bridle:false});},{seed:18,light:.55,folds:0,pw:4,ph:3});
  const g=ctx.createLinearGradient(200,0,1500,0);g.addColorStop(0,'rgba(5,4,3,.45)');g.addColorStop(.5,'rgba(5,4,3,.75)');g.addColorStop(1,'rgba(5,4,3,.98)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
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
