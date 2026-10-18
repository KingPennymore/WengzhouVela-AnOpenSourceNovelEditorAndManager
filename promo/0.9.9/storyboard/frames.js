// Key frames of storyboard v3 (storyboard.md). Three registers: traces (the world, no people in it), the woven saga
// (loom.js, figures in the manner of the bear) and the manuscript page (transitions, the map).
window.FRAMES={};const frame=(id,fn)=>{window.FRAMES[id]=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';TINT.k=0;UI_LAYER.length=0;fn();ctx.setTransform(1,0,0,1,0,0);UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});};};
const line=id=>P.lines.find(l=>l.id===id);
const caption=id=>{const l=line(id);sampleCaption(l.zh,l.en);};

// ---------------------------------------------------------------- woven people, in the manner of the bear
// Facing right in local units (600 tall, feet at the origin): one silhouette for head, body and legs; the far arm
// darker behind it, the near arm laid over it with its own edge; tools after. o.face -1 mirrors.
const W_HEAD=[-34,-20,-36,-56,-24,-82,0,-94,26,-88,38,-70,40,-54,50,-40,42,-34,44,-26,38,-14,20,-6,0,0,-20,-6];
const W_BEARD=[28,-40,54,-32,58,-8,44,22,14,34,-10,10];
const W_HAIR={havard:[-30,-8,-50,-40,-52,-76,-34,-100,-4,-108,26,-98,10,-80,-20,-60],riga:[-30,-6,-44,-36,-42,-74,-24,-98,4,-104,30,-94,14,-84,-14,-62]};
const W_TUNIC=[-58,-492,-20,-514,22,-516,62,-494,74,-446,68,-392,56,-344,70,-280,90,-214,102,-190,-96,-190,-82,-250,-66,-330,-70,-420,-72,-468];
function wPerson(x,y,s,o){
  o={face:1,head:0,beard:false,hair:null,armW:46,legW:52,stepF:24,stepB:-30,fill:DYE.woad,far:DYE.indigo,inner:DYE.sky,apron:null,armN:[10,-480,40,-380,60,-300],armF:[-10,-480,10,-380,40,-310],...o};
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s*o.face,s);f();ctx.restore();};
  const arm=a=>{wcurve(a.slice(0,4),o.armW,'#fff',{line:null});wcurve(a.slice(2),o.armW*.82,'#fff',{line:null});wdisc(a[4],a[5],o.armW*.46,'#fff',{line:null});};
  const near=()=>{wFigure(T(()=>arm(o.armN)),{fill:o.fill,inner:null});
    T(()=>{const [sx,sy]=o.armN;wspiral(sx+6,sy+20,o.armW*.62,DYE.black,{lw:14,dir:-1});wspiral(sx+6,sy+20,o.armW*.62,o.inner,{lw:7,dir:-1});})();if(o.tool)T(o.tool)();};
  if(o.parts==='near')return near();
  if(o.toolUnder)T(o.toolUnder)();
  wFigure(T(()=>arm(o.armF)),{fill:o.far,inner:null});
  wFigure(T(()=>{
    ctx.save();ctx.translate(4,-508);ctx.rotate(o.head);ctx.scale(1.18,1.18);shape(W_HEAD,'#fff');if(o.beard)shape(W_BEARD,'#fff');if(o.hair)shape(W_HAIR[o.hair],'#fff');ctx.restore();
    shape(W_TUNIC,'#fff');
    for(const [hx,st] of [[16,o.stepF],[-16,o.stepB]]){shape(legShape([hx,-230,hx+st*.5,-110,hx+st,-18],o.legW,o.legW*.64),'#fff');const fx=hx+st;shape([fx-16,-24,fx+10,-28,fx+46,-8,fx+54,0,fx-18,2],'#fff');}
  }),{fill:o.fill,inner:o.inner,band:[14*s,21*s]});
  if(o.apron)wFigure(T(()=>shape([8,-440,54,-432,72,-206,0,-202],'#fff')),{fill:o.apron,inner:null});
  T(()=>wline([-68,-340,58,-344],DYE.black,11))();
  if(o.parts!=='body')near();
}
const HAVARD={fill:DYE.green,far:DYE.moss,inner:DYE.weld,beard:true,hair:'havard',armW:54,legW:60,stepF:34,stepB:-44};
const RIGA={fill:DYE.woad,far:DYE.indigo,inner:DYE.sky,hair:'riga',armW:42,legW:48,stepF:22,stepB:-28};
function hammer(hx,hy,ang,{len=150}={}){const ex=hx+Math.cos(ang)*len,ey=hy+Math.sin(ang)*len;wcurve([hx-Math.cos(ang)*20,hy-Math.sin(ang)*20,ex,ey],12,DYE.walnut,{lw:6});ctx.save();ctx.translate(ex,ey);ctx.rotate(ang);wpoly([-14,-34,14,-34,16,30,-16,30],DYE.black,{line:DYE.black,lw:4});wline([-8,-30,-8,26],DYE.sky,4);ctx.restore();}
function tongs(hx,hy,tx,ty){wline([hx,hy,(hx+tx)/2,(hy+ty)/2-6,tx,ty],DYE.black,9);wline([hx,hy+12,(hx+tx)/2,(hy+ty)/2+8,tx,ty+4],DYE.black,9);}

// ---------------------------------------------------------------- the forge, woven
function wForge({look=0,raised=1,thread=0,seed=11}={}){
  rect(0,0,W,H,DYE.wool);
  // hearth and its hood on the left, flames in madder and weld
  wpoly([90,860,90,560,400,560,400,860],DYE.sky);for(let r=0;r<6;r++)for(let c=0;c<4;c++){const bx=90+c*78+(r%2)*39,by=560+r*50;if(bx<400-20)wpoly([bx,by,Math.min(bx+78,400),by,Math.min(bx+78,400),by+50,bx,by+50],r%2?DYE.sky:DYE.woad,{lw:6});}
  wpoly([150,860,150,680,340,680,340,860],DYE.umber);
  for(let i=0;i<5;i++){const fx=170+i*38,fh=90+hash(i*3+seed)*70;wshape([fx-22,860,fx-10,860-fh*.6,fx,860-fh,fx+12,860-fh*.5,fx+22,860],i%2?DYE.weld:DYE.madder,{lw:6});}
  wpoly([60,560,430,560,350,330,140,330],DYE.walnut);wpoly([170,330,320,330,310,150,180,150],DYE.walnut);
  // tools hanging on the wall
  for(const [tx,ty,k] of [[1480,260,0],[1560,250,1],[1640,270,0],[1720,240,1]]){wline([tx,ty-40,tx,ty],DYE.black,5);if(k)wline([tx,ty,tx-14,ty+150,tx-10,ty+160],DYE.black,8),wline([tx,ty,tx+14,ty+150,tx+10,ty+160],DYE.black,8);else{wline([tx,ty,tx,ty+120],DYE.walnut,12);wpoly([tx-26,ty+120,tx+26,ty+120,tx+26,ty+150,tx-26,ty+150],DYE.black);}}
  wGround(860,{cols:[DYE.walnut,DYE.umber,DYE.walnut]});
  // the anvil on its stump, the iron on it white hot
  wpoly([900,860,1020,860,1004,700,916,700],DYE.walnut);wpoly([850,640,1080,640,1060,668,1000,676,1010,700,910,700,920,676,880,668],DYE.black,{line:DYE.indigo});
  wpoly([918,628,1010,628,1016,640,912,640],DYE.bone,{line:DYE.weld,lw:6});
  // Havard on the left with the hammer, Riga on the right holding the iron in the tongs
  const hv=.9,rg=.8;
  wPerson(760,862,hv,{...HAVARD,head:-look*.32,
    armN:raised?[20,-480,112,-556,134,-660]:[10,-480,84,-392,190,-290],armF:[-10,-480,10,-380,48,-330],
    tool:raised?()=>hammer(134,-660,-2.25):()=>hammer(190,-290,.25,{len:70})});
  wPerson(1180,862,rg,{...RIGA,face:-1,head:.34,armN:[10,-480,64,-400,132,-368],armF:[-10,-480,44,-412,122,-386],tool:()=>tongs(132,-372,262,-292)});
  // sparks: little weld stars around the blow
  if(raised||1)for(let i=0;i<16;i++){const a=-Math.PI*(.1+.8*hash(i*3+seed)),r=60+hash(i*7+seed)*220;const sx=965+Math.cos(a)*r*1.3,sy=626+Math.sin(a)*r;wFlake(sx,sy,.55+hash(i)*.4,i%3?DYE.weld:DYE.bone);}
  // the thread of their bond, stitched from Havard to Riga
  if(thread>0){ctx.save();ctx.setLineDash([26,18]);ctx.lineCap='round';ctx.strokeStyle=DYE.madder;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(790,440);ctx.quadraticCurveTo(980,250,1160,470);ctx.stroke();ctx.restore();}
}
frame('09b',()=>{weave(()=>{wForge({raised:1});wBorderTop('HIC HAVARD FABER FERRVM CVDIT',{h:124});wBorderBottom();},{seed:21,flicker:.5,light:1.15});grade(0);caption('07');});
frame('10',()=>{weave(()=>{wForge({raised:0,look:1,thread:1});wBorderTop('HIC HAVARD FABER FERRVM CVDIT',{h:124});wBorderBottom();},{seed:21,flicker:.2,light:1.15});grade(0);ui(()=>relationOverlay(76));caption('09');});

// ---------------------------------------------------------------- more woven creatures
// The bear on all fours, head low over the snow (shot 05): the same outline-and-inner-line manner as the roaring one.
const WBEAR4={
  body:[-232,0,-252,-70,-272,-160,-246,-226,-170,-252,-60,-262,30,-292,80,-286,118,-258,160,-232,208,-206,248,-186,266,-168,258,-150,214,-142,182,-138,150,-152,132,-130,134,-70,136,-22,166,-10,168,4,84,6,82,-60,70,-108,0,-112,-100,-110,-160,-118,-172,-70,-166,-20,-140,-8,-136,4],
  fore:[40,-120,96,-112,104,-30,118,-10,120,4,50,6,54,-60],hind:[-210,-110,-150,-120,-128,-40,-112,-10,-110,4,-190,6,-200,-60],
};
function wBear4(x,y,s,{fur=DYE.walnut,far=DYE.umber,inner=DYE.ochre}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);f();ctx.restore();};
  wFigure(T(()=>{shape(WBEAR4.fore,'#fff');shape(WBEAR4.hind,'#fff');}),{fill:far,inner:null});
  wFigure(T(()=>shape(WBEAR4.body,'#fff')),{fill:fur,inner,band:[17*s,26*s]});
  T(()=>{for(const [cx,cy,r,d] of [[-196,-166,58,1],[54,-206,48,-1]]){wspiral(cx,cy,r,DYE.black,{lw:20,dir:d});wspiral(cx,cy,r,inner,{lw:9,dir:d});}
    wdisc(112,-262,19,fur);wdisc(112,-262,8,inner,{line:null});wdisc(258,-164,8,DYE.black,{line:null});
    for(const [cx,cy] of [[166,-2],[120,-2],[-112,-2]])wClaws(cx,cy,0,3,20);})();
}
// The jackdaw Sinfran, facing right in local units; perched with wings folded, or wings raised to beat.
const WRAVEN={body:[-230,-40,-150,-96,-70,-168,10,-218,56,-244,96,-236,128,-220,176,-206,132,-194,96,-190,82,-166,92,-118,64,-60,24,-34,-60,-40,-140,-46,-226,-22],
  wing:[10,-180,-10,-280,-40,-380,-60,-480,-80,-440,-104,-492,-114,-444,-150,-476,-156,-420,-196,-440,-188,-384,-226,-386,-196,-326,-120,-250,-50,-186]};
function wRaven(x,y,s,{face=-1,wings=0,fill=DYE.indigo,inner=DYE.sky,far=DYE.black}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);f();ctx.restore();};
  T(()=>{for(const dx of [16,40]){wline([dx+4,-36,dx,0],DYE.black,8);for(const a of [-.5,.2,.9])wline([dx,0,dx+Math.cos(a)*22,Math.sin(a)*10+6],DYE.black,6);}})();
  if(wings)wFigure(T(()=>{ctx.save();ctx.translate(46,-14);ctx.rotate(.12);shape(WRAVEN.wing,'#fff');ctx.restore();}),{fill:far,inner:null});
  wFigure(T(()=>shape(WRAVEN.body,'#fff')),{fill,inner,band:[14*s,22*s]});
  T(()=>{wpoly([120,-224,182,-206,122,-194],DYE.black,{lw:5});wdisc(100,-222,7,DYE.bone,{line:null});
    if(!wings){for(let i=0;i<4;i++)wline([-30-i*30,-120+i*12,-150-i*22,-72+i*8],DYE.black,7);wspiral(-10,-150,44,DYE.black,{lw:16,dir:-1});wspiral(-10,-150,44,inner,{lw:7,dir:-1});}})();
  if(wings){wFigure(T(()=>shape(WRAVEN.wing,'#fff')),{fill,inner,band:[12*s,19*s]});T(()=>{for(let i=0;i<4;i++)wline([-40-i*30,-300+i*20,-80-i*34,-420+i*14],DYE.black,6);wspiral(-14,-214,36,DYE.black,{lw:14,dir:-1});wspiral(-14,-214,36,inner,{lw:6,dir:-1});})();}
}
// Pipe standing: the gallop horse's body on four planted legs, head a little low.
const HSTAND={farF:[[126,-60,120,40,128,128],30,20],farH:[[-118,-56,-138,40,-112,128],34,20],nearF:[[150,-48,158,50,152,130],32,20],nearH:[[-140,-48,-164,40,-136,130],38,22]};
function wHorseStand(x,y,s,{face=1,coat=DYE.rust,far=DYE.umber,inner=DYE.ochre}={}){
  const T=f=>()=>{ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);f();ctx.restore();};
  wFigure(T(()=>[HSTAND.farF,HSTAND.farH].forEach(([p,a,b])=>shape(legShape(p,a,b),'#fff'))),{fill:far,inner:null});
  T(()=>[HSTAND.farF,HSTAND.farH].forEach(([p,a,b])=>hoof(p,b)))();
  wFigure(T(()=>{for(const k of ['barrel','neck','head','mane'])shape(WHORSE[k],'#fff');shape([-160,-122,-196,-110,-214,-60,-208,20,-190,30,-186,-30,-170,-76],'#fff');for(const k of ['nearF','nearH']){const [p,a,b]=HSTAND[k];shape(legShape(p,a,b),'#fff');}}),{fill:coat,inner,band:[17*s,26*s]});
  T(()=>{for(const k of ['nearF','nearH']){const [p,,b]=HSTAND[k];hoof(p,b);}for(const [cx,cy,r,d] of [[-110,-84,46,1],[128,-96,34,-1]]){wspiral(cx,cy,r,DYE.black,{lw:18,dir:d});wspiral(cx,cy,r,inner,{lw:8,dir:d});}wline([250,-302,302,-250,344,-232],DYE.black,6);
    wshape([-50,-140,62,-150,74,-72,-40,-66],DYE.weld,{lw:8});wline([-46,-84,70,-90],DYE.madder,10);})();
}
const meadow=(frost=0)=>{wGround(812,{cols:frost?[DYE.bone,DYE.sky,DYE.bone]:[DYE.green,DYE.ochre,DYE.moss]});};

// ================================================================ 01–02 · the manuscript, and it burns
const PAGE={x:330,y:120,w:1260,h:840};
function manuscript({lines=[],at=PAGE.y+600,size=30,head='炉火祈愿 · 第一部',file='正文.txt',seal=false}={}){
  rect(0,0,W,H,'#14110e');glow(760,300,1300,'#5a4630',.35);
  ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=70;ctx.shadowOffsetY=24;poly([PAGE.x,PAGE.y,PAGE.x+PAGE.w,PAGE.y+8,PAGE.x+PAGE.w-6,PAGE.y+PAGE.h,PAGE.x+4,PAGE.y+PAGE.h-6],'#e7dec8');ctx.restore();
  for(let i=0;i<1600;i++){const x=PAGE.x+hash(i*3.1)*PAGE.w,y=PAGE.y+hash(i*7.7)*PAGE.h;ctx.globalAlpha=.07;rect(x,y,1+hash(i)*4,1,'#6b5a40');}ctx.globalAlpha=1;
  text(head,PAGE.x+120,PAGE.y+100,{size:24,color:'#7a6648',font:SERIF,spacing:6});text(file,PAGE.x+PAGE.w-110,PAGE.y+PAGE.h-46,{size:20,color:'#9a8768',align:'right'});
  for(let i=0;i<lines.length+1;i++){ctx.fillStyle='rgba(120,100,70,.2)';ctx.fillRect(PAGE.x+90,at+i*70+14,PAGE.w-180,1.2);}
  lines.forEach((l,i)=>text(l,PAGE.x+120,at+i*70,{size,color:'#1d1a17',font:SERIF,spacing:1}));
}
const OPENING=['我死死地攥着手里的长枪，弓着身子，跪在牲畜和人的尸体中，','竖起耳朵听着从大路那边传来的、愈发清晰的马蹄声。','当这场战争结束后，人们会记住许多名字……'];
function pageBrand(){ctx.save();ctx.translate(W/2-250,330);ctx.scale(.5,.5);ctx.translate(-96,-96);fillRR(0,0,192,192,44,'#257c67');ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();
  text('文舟',W/2-170,366,{size:104,weight:800,color:'#25282c'});text('0.9.9',W/2+70,366,{size:70,weight:300,color:'#257c67',spacing:2});
  ctx.save();ctx.strokeStyle='rgba(90,94,99,.55)';ctx.lineWidth=1.2;rr(W/2-330,250,700,150,6);ctx.stroke();ctx.restore();}
frame('01',()=>{manuscript({lines:OPENING});pageBrand();grade(0);});
function snapshot(){const c=layerCanvas();c.getContext('2d').drawImage(canvas,0,0);return c;}
frame('02',()=>{
  sampleTraces({caption:false});const under=snapshot();
  manuscript({lines:OPENING});pageBrand();
  const O=[1260,720],hp=burnPath(O[0],O[1],330,1.2);
  ctx.save();path(hp);ctx.clip();ctx.drawImage(under,0,0);ctx.restore();
  ctx.save();glow(O[0],O[1],520,'#2a160a',.55);path(hp);ctx.shadowColor='#ff6a10';ctx.shadowBlur=34;ctx.strokeStyle='#ff8c2e';ctx.lineWidth=8;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a6';ctx.lineWidth=2.4;ctx.stroke();ctx.restore();
  for(let i=0;i<60;i++){const a=hash(i*5.1)*TAU,d=360+hash(i)*520,x=O[0]+Math.cos(a)*d,y=O[1]+Math.sin(a)*d*.7-hash(i*2)*120,s=2+hash(i*3)*6;ctx.save();ctx.globalAlpha=.8;glow(x,y,s*4,'#ff8a2a',.6);ctx.fillStyle='#ffd08a';ctx.beginPath();ctx.arc(x,y,s*.6,0,TAU);ctx.fill();ctx.restore();}
  grade(0);
});

// ================================================================ 03–04 · traces in the wood
frame('03',()=>sampleTraces());
// Close on the spear at the trunk's edge: the rag tugged left by the first wind, breath puffing out towards the road.
function spearClose({gust=0}={}){
  sampleTraces({caption:false});const bg=snapshot();ctx.save();ctx.filter='blur(14px)';ctx.translate(W/2,H/2);ctx.scale(1.6,1.6);ctx.translate(-W*.62,-H*.5);ctx.drawImage(bg,0,0);ctx.restore();
  // trunk filling the right of the frame
  ctx.save();ctx.beginPath();for(let y=-20;y<=H+20;y+=10)ctx.lineTo(1260+(noise(y/50)-.5)*18,y);ctx.lineTo(W+20,H+20);ctx.lineTo(W+20,-20);ctx.closePath();ctx.fillStyle='#262424';ctx.fill();ctx.clip();
  for(let i=0;i<220;i++){const x=1250+hash(i*1.7)*700,y0=hash(i*2.3)*H-80,l=80+hash(i*3.9)*260;ctx.strokeStyle=hash(i*5.1)>.45?'rgba(86,78,72,.55)':'rgba(10,10,12,.7)';ctx.lineWidth=3+hash(i)*7;ctx.beginPath();ctx.moveTo(x,y0);ctx.bezierCurveTo(x+(hash(i*7)-.5)*20,y0+l*.33,x+(hash(i*8)-.5)*20,y0+l*.66,x+(hash(i*9)-.5)*16,y0+l);ctx.stroke();}
  const dk=ctx.createLinearGradient(1260,0,1500,0);dk.addColorStop(0,'rgba(0,0,0,.45)');dk.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=dk;ctx.fillRect(1240,0,300,H);ctx.restore();
  // the spear: shaft worn smooth, iron socket rimed with frost, the madder rag
  ctx.save();ctx.translate(1180,H+40);ctx.rotate(-.04);const sh=ctx.createLinearGradient(-14,0,14,0);sh.addColorStop(0,'#3b2f26');sh.addColorStop(.6,'#5e4a3a');sh.addColorStop(1,'#2a221c');ctx.fillStyle=sh;ctx.fillRect(-13,-1200,26,1200);
  ctx.fillStyle='#2c3036';ctx.fillRect(-17,-860,34,120);ctx.fillStyle='#78838e';ctx.fillRect(-17,-860,8,120);
  for(let i=0;i<40;i++){ctx.fillStyle='rgba(240,246,250,.85)';ctx.fillRect(-17+hash(i)*34,-860+hash(i*3)*120,2+hash(i*5)*3,1.5);}
  const flap=gust?1.4:1;ctx.fillStyle='#8f3b2c';ctx.beginPath();ctx.moveTo(-12,-720);ctx.bezierCurveTo(-120*flap,-740,-200*flap,-690,-320*flap,-716);ctx.lineTo(-262*flap,-680);ctx.lineTo(-340*flap,-650);ctx.bezierCurveTo(-210*flap,-650,-110,-680,-12,-670);ctx.fill();
  ctx.fillStyle='#6c2b22';ctx.beginPath();ctx.moveTo(-12,-690);ctx.bezierCurveTo(-110,-690,-190*flap,-670,-262*flap,-680);ctx.lineTo(-340*flap,-650);ctx.bezierCurveTo(-210*flap,-650,-110,-680,-12,-670);ctx.fill();ctx.restore();
  // breath: two puffs from behind the trunk, blown left
  ctx.save();ctx.filter='blur(10px)';for(let p=0;p<2;p++)for(let i=0;i<8;i++){const k=i/7,x=1240-p*260-k*220,y=520-p*40-k*60+Math.sin(i)*10,r=(20+k*56)*(1-p*.25);ctx.globalAlpha=(.75*(1-k)+.15)*(1-p*.35);ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(x,y,r*1.4,r*.8,-.2,0,TAU);ctx.fill();}ctx.restore();
  snowfall(14,60,{seed:9,speed:30,wind:-60,size:3.2,alpha:.7});
  if(gust){{const L=layerCanvas(),g=L.getContext('2d');g.lineCap='round';for(let i=0;i<260;i++){const y=hash(i*2.1)*H,x=W-hash(i*3.7)*W*gust*1.3,l=120+hash(i)*520;g.globalAlpha=.25+.6*hash(i*5);g.strokeStyle='#f8f9fa';g.lineWidth=2+hash(i*7)*9;g.beginPath();g.moveTo(x,y);g.lineTo(x+l,y-l*.06);g.stroke();}ctx.save();ctx.filter='blur(3px)';ctx.drawImage(L,0,0);ctx.restore();}
    const g=ctx.createLinearGradient(W,0,0,0);g.addColorStop(0,'rgba(248,249,250,.95)');g.addColorStop(gust*.7,'rgba(248,249,250,.8)');g.addColorStop(Math.min(1,gust*.7+.25),'rgba(248,249,250,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
  grade(0);filmGrain();
}
frame('04a',()=>{spearClose();caption('02');});
frame('04b',()=>{spearClose({gust:.75});});

// ================================================================ 05 · the bear Arthur
function wSpring({melt=0}={}){
  rect(0,0,W,H,DYE.wool);
  const sx=330,sy=300;for(let i=0;i<16;i++){const a=i/16*TAU;wpoly([sx+Math.cos(a-.1)*70,sy+Math.sin(a-.1)*70,sx+Math.cos(a)*(i%2?104:124),sy+Math.sin(a)*(i%2?104:124),sx+Math.cos(a+.1)*70,sy+Math.sin(a+.1)*70],i%2?DYE.madder:DYE.weld,{lw:6});}
  wdisc(sx,sy,66,DYE.weld);wspiral(sx,sy,44,DYE.madder,{lw:10});
  wTree(120,846,600,{seed:1});wTree(1560,852,420,{seed:3});wTree(1800,846,600,{seed:4,leaf:DYE.weld,leaf2:DYE.madder});
  meadow();
}
frame('05a',()=>{
  // the white of the gust becomes a page; ink from 阿瑟 blooms and the tapestry shows through it
  weave(()=>{wSpring();wBear4(780,846,1.25);wBorderTop('HIC ARTHVR VRSVS',{h:124});wBorderBottom();},{seed:5,flicker:.2});grade(0);const woven=snapshot();
  const l3=line('03');manuscript({lines:['大熊阿瑟用它温暖的鼻息融化积雪，','将露出的大地作为战场，吼叫着呼喊战争。'],at:PAGE.y+600,size:40});
  const tx=PAGE.x+120+measure('大熊',40,400,SERIF),ty=PAGE.y+600,tw=measure('阿瑟',40,400,SERIF);
  fillRR(tx-3,ty-38,tw+6,50,6,'rgba(37,124,103,.22)');ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle='#257c67';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(tx,ty+12);ctx.lineTo(tx+tw,ty+12);ctx.stroke();ctx.restore();
  const cx=tx+tw/2,cy=ty-20,blot=[];for(let i=0;i<220;i++){const a=i/220*TAU,r=560*(1+.16*(noise(Math.cos(a)*2+4)+noise(Math.sin(a)*2+8)-1)+.06*(noise(a*9)-.5)+.02*(hash(i)-.5));blot.push(cx+Math.cos(a)*r*1.25,cy-170+Math.sin(a)*r*.82);}
  ctx.save();ctx.filter='blur(5px)';ctx.globalCompositeOperation='multiply';path(blot);ctx.fillStyle='rgba(28,24,22,.85)';ctx.fill();ctx.restore();
  for(let i=0;i<70;i++){const k=Math.floor(hash(i*3.3)*220),bx=blot[k*2],by=blot[k*2+1],a=Math.atan2(by-cy+170,bx-cx),l=20+hash(i*5)*90;ctx.save();ctx.filter='blur(1.2px)';ctx.strokeStyle='rgba(28,24,22,.7)';ctx.lineWidth=1+hash(i)*3;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+Math.cos(a+(hash(i*7)-.5)*.6)*l,by+Math.sin(a+(hash(i*7)-.5)*.6)*l);ctx.stroke();ctx.restore();}
  const inner=blot.map((v,i)=>i%2?cy-170+(v-cy+170)*.93:cx+(v-cx)*.93);ctx.save();ctx.filter='blur(6px)';path(inner);ctx.fillStyle='#000';ctx.globalCompositeOperation='destination-out';ctx.restore();
  ctx.save();path(inner);ctx.clip();ctx.drawImage(woven,0,0);const ring=ctx.createRadialGradient(cx,cy-170,300,cx,cy-170,720);ring.addColorStop(0,'rgba(20,16,14,0)');ring.addColorStop(1,'rgba(20,16,14,.75)');ctx.fillStyle=ring;ctx.fillRect(0,0,W,H);ctx.restore();
  text('大熊阿瑟用它温暖的鼻息融化积雪，',PAGE.x+120,ty,{size:40,color:'#1d1a17',font:SERIF,spacing:1});
});
frame('05b',()=>{
  weave(()=>{wSpring();
    for(const [sx,sy,sw] of [[1250,836,220],[1490,846,150]]){wshape([sx-sw/2,sy+8,sx-sw*.3,sy-30,sx,sy-40,sx+sw*.32,sy-28,sx+sw/2,sy+8],DYE.bone,{lw:7});}
    for(let k=0;k<3;k++){const p=[];for(let i=0;i<=10;i++){const u=i/10;p.push(1110+u*260,690+k*36+u*80+Math.sin(u*9+k)*14);}wcurve(p,11,k===1?DYE.weld:DYE.madder,{lw:6});}
    for(const [fx,fy] of [[1180,862],[1300,868],[1400,858]])wSprout(fx,fy,1.2);
    wBear4(760,846,1.3);wBorderTop('HIC ARTHVR VRSVS NIVEM SOLVIT',{h:124});wBorderBottom();},{seed:5,flicker:.25});
  grade(0);ui(()=>glossaryOverlay(30.0,{t0:24.9,t1:35.4,x:W-620,y:150,sentence:'大熊阿瑟用它温暖的鼻息融化积雪，',term:'阿瑟',cat:'精魂',def:'大熊精魂'}));caption('03');
});
frame('05c',()=>{sampleBear();ui(()=>glossaryOverlay(33.4,{t0:24.9,t1:35.4,x:W-620,y:150,sentence:'大熊阿瑟用它温暖的鼻息融化积雪，',term:'阿瑟',cat:'精魂',def:'大熊精魂'}));});

// ================================================================ 06 · spring rises into winter (a tall hanging, tilting up)
frame('06',()=>{
  weave(()=>{rect(0,0,W,H,DYE.wool);
    // the bottom of the frame is still the meadow, now soaked red; the crowns above go yellow, brown, then white
    wGround(900,{cols:[DYE.madder,DYE.rust,DYE.madder]});
    for(const [x,h,sd] of [[160,980,1],[520,860,2],[900,1020,3],[1280,880,4],[1680,1000,5]]){
      const tips=[];const y=930;wcurve([x,y+4,x+(hash(sd*3)-.5)*14,y-h*.3,x,y-h*.88],30,DYE.walnut);
      for(let i=0;i<7;i++){const k=.25+i*.11,d=i%2?1:-1,by=y-h*k,ex=x+d*h*.17,ey=by-h*.1;wcurve([x,by+h*.05,x+d*h*.09,by-h*.01,ex,ey],14,DYE.walnut,{lw:6});
        const hgt=1-ey/H,col=ey>700?DYE.green:ey>520?DYE.weld:ey>360?DYE.ochre:ey>240?DYE.walnut:DYE.bone;wPalmette(ex,ey,h*.085,-Math.PI/2+d*.7,col);}}
    for(let i=0;i<40;i++){const fx=hash(i*3.3)*W,fy=60+hash(i*7.1)*260;wFlake(fx,fy,.8+hash(i)*.5,DYE.sky);}
    wBorderBottom({y:H-110,h:110});},{seed:6,flicker:.2});
  grade(0);caption('04');
});

// ================================================================ 07 · the jackdaw Sinfran
function wWinterSky({wind=0}={}){
  rect(0,0,W,H,DYE.wool);
  for(let i=0;i<2;i++){const y=250+i*170;wpoly([-40,y,W+40,y-30,W+40,y+14,-40,y+44],DYE.sky,{lw:6});}
  for(let i=0;i<9;i++){const x=i*240-40;wpoly([x,820,x+130,560+hash(i)*80,x+260,820],i%2?DYE.sky:DYE.woad,{lw:7});}
  for(const [x,h,sd] of [[300,420,7],[700,360,8],[1100,400,9]])wTree(x,850,h,{seed:sd,leaf:DYE.sky,leaf2:DYE.bone,trunk:DYE.indigo});
  meadow(1);
  if(wind>0){for(let k=0;k<6;k++){const p=[];for(let i=0;i<=12;i++){const u=i/12;p.push(W-u*W*1.1,220+k*90+Math.sin(u*7+k)*30*wind);}wcurve(p,10,k%2?DYE.indigo:DYE.woad,{lw:5});}for(let i=0;i<80;i++)wFlake(hash(i*2.9)*W,150+hash(i*6.3)*660,.8+hash(i)*.6,i%3?DYE.bone:DYE.sky);}
}
const branchW=()=>{wcurve([W+40,520,1700,500,1500,540,1260,520],34,DYE.walnut);wcurve([1500,540,1420,470,1360,440],16,DYE.walnut,{lw:6});};
frame('07a',()=>{weave(()=>{wWinterSky();branchW();wRaven(1430,512,1.15);wBorderTop('HIC SINFRAN MONEDVLA',{h:124});wBorderBottom();},{seed:7,flicker:.1});
  grade(0);ui(()=>glossaryOverlay(45.0,{t0:41.2,t1:48.2,x:60,y:150,sentence:'辛弗兰就用它的翅膀扇起寒风，',term:'辛弗兰',cat:'精魂',def:'寒鸦精魂',q:.82,keepTag:false}));caption('05');});
frame('07b',()=>{weave(()=>{wWinterSky({wind:1});branchW();wRaven(1430,512,1.15,{wings:1});wBorderTop('HIC SINFRAN VENTVM MOVET',{h:124});wBorderBottom();},{seed:7,flicker:.1});grade(0);caption('05');});

// ================================================================ 08 · the woven snow comes loose and its threads catch fire
frame('08',()=>{
  weave(()=>{wWinterSky({wind:1});wBorderTop('HIC SINFRAN VENTVM MOVET',{h:124});},{seed:8,flicker:.1,light:.9});
  // the cloth ends in a ragged edge; everything right of it is loose weft, glowing at the ends, then sparks in the dark
  const edge=y=>980+Math.sin(y/70)*60+noise(y/30)*80;
  ctx.save();ctx.beginPath();ctx.moveTo(W,0);for(let y=0;y<=H;y+=12)ctx.lineTo(edge(y),y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#0d0907';ctx.fill();ctx.restore();
  for(let i=0;i<120;i++){const y=i/120*H,x0=edge(y),l=60+hash(i*3.3)*360,col=[DYE.bone,DYE.sky,DYE.woad,DYE.indigo][i%4];const pts=[];for(let k=0;k<=10;k++){const u=k/10;pts.push(x0+u*l,y+Math.sin(u*6+i)*14*u+u*u*40);}
    ctx.save();ctx.lineCap='round';ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)ctx.lineTo(pts[k],pts[k+1]);ctx.stroke();
    const ex=pts[pts.length-2],ey=pts[pts.length-1];ctx.strokeStyle='#ff8a2a';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(pts[pts.length-6],pts[pts.length-5]);ctx.lineTo(ex,ey);ctx.stroke();glow(ex,ey,18,'#ffb050',.7);ctx.restore();}
  for(let i=0;i<90;i++){const x=1200+hash(i*2.2)*720,y=hash(i*4.1)*H,s=1.5+hash(i)*4;ctx.save();glow(x,y,s*5,'#ff7a1e',.5);ctx.fillStyle=hash(i*9)>.5?'#ffe2a0':'#ff9a40';ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();ctx.restore();}
  ctx.save();glow(1540,980,260,'#fff3d0',.5);ctx.fillStyle='#fffbe8';ctx.beginPath();ctx.arc(1540,960,9,0,TAU);ctx.fill();ctx.restore();
  grade(0);caption('06');
});

// ================================================================ 09 · the forge
frame('09a',()=>{
  // close and low on the anvil: the hammer face comes down on iron burned white; nobody in the frame but the tools
  rect(0,0,W,H,'#120c09');glow(220,520,900,'#c2501a',.55);glow(220,560,380,'#ffb060',.4);
  for(const [x,h] of [[1500,300],[1600,260],[1700,320]]){ctx.fillStyle='rgba(30,22,18,.9)';ctx.fillRect(x,80,10,h);}
  ctx.save();ctx.translate(0,40);const A=[250,700,420,664,600,640,1460,640,1610,652,1630,700,1480,712,1300,730,1260,790,1250,900,1360,990,1380,1100,640,1100,660,990,770,900,760,790,700,735,560,712,380,712];smooth(A,.35);const ag=ctx.createLinearGradient(0,640,0,800);ag.addColorStop(0,'#5a4a42');ag.addColorStop(.12,'#2b2523');ag.addColorStop(1,'#141110');ctx.fillStyle=ag;ctx.fill();
  const rim=ctx.createLinearGradient(260,0,900,0);rim.addColorStop(0,'rgba(255,150,80,.6)');rim.addColorStop(1,'rgba(255,150,80,0)');ctx.fillStyle=rim;ctx.fillRect(260,640,700,10);
  // the iron
  ctx.save();ctx.shadowColor='#ffd27a';ctx.shadowBlur=60;ctx.fillStyle='#fff6dc';ctx.beginPath();ctx.roundRect(780,612,420,30,12);ctx.fill();ctx.restore();glow(990,626,300,'#ffb347',.6);
  ctx.restore();
  // the hammer head entering from above, its handle leaving the frame
  ctx.save();ctx.translate(1000,560);ctx.rotate(-.2);const hg=ctx.createLinearGradient(-44,0,0,0);hg.addColorStop(0,'#2a1f19');hg.addColorStop(1,'#5a4434');ctx.fillStyle=hg;ctx.fillRect(-44,-760,38,700);
    path([-120,-84,90,-84,104,-60,104,6,-120,6,-134,-20,-134,-60]);const sg2=ctx.createLinearGradient(0,-84,0,6);sg2.addColorStop(0,'#3a3a3e');sg2.addColorStop(1,'#18181a');ctx.fillStyle=sg2;ctx.fill();ctx.fillStyle='rgba(255,190,110,.8)';ctx.fillRect(-120,0,224,7);ctx.restore();
  sparkBurst(.16,0,1000,650,{n:90,seed:4,scale:1.5,spread:1.3});
  ctx.save();ctx.globalCompositeOperation='screen';glow(1000,650,420,'#ffd080',.35);ctx.restore();
  grade(0);filmGrain(.09);caption('07');
});
frame('09b',()=>{weave(()=>{wForge({raised:1});wBorderTop('HIC HAVARD FABER FERRVM CVDIT',{h:124});wBorderBottom();},{seed:21,flicker:.5,light:1.15});grade(0);caption('07');});
frame('10',()=>{weave(()=>{wForge({raised:0,look:1,thread:1});wBorderTop('HIC HAVARD FABER FERRVM CVDIT',{h:124});wBorderBottom();},{seed:21,flicker:.2,light:1.15});grade(0);ui(()=>relationOverlay(76));caption('09');});

// ================================================================ 11 · the last spark
frame('11',()=>{
  rect(0,0,W,H,'#0e0b0a');glow(1600,200,1100,'#2c3a4a',.5);
  for(let i=0;i<2600;i++){const x=hash(i*1.3)*W,y=420+hash(i*2.7)*660,s=1+hash(i*4.1)*4*(y/H);ctx.fillStyle=hash(i*6.6)>.7?'rgba(120,110,104,.5)':'rgba(40,34,32,.8)';ctx.fillRect(x,y,s,s*.6);}
  {const L=layerCanvas(),g=L.getContext('2d');g.fillStyle='rgba(120,150,190,.2)';g.beginPath();g.moveTo(1900,0);g.lineTo(2100,0);g.lineTo(1300,1080);g.lineTo(700,1080);g.fill();ctx.save();ctx.globalCompositeOperation='screen';ctx.filter='blur(60px)';ctx.drawImage(L,0,0);ctx.restore();}
  glow(960,640,160,'#7a1a08',.8);ctx.fillStyle='#4a1a10';ctx.beginPath();ctx.ellipse(960,640,26,14,0,0,TAU);ctx.fill();ctx.fillStyle='#a8401c';ctx.beginPath();ctx.ellipse(960,638,15,8,0,0,TAU);ctx.fill();
  // at its heart a white point already opening into a snowflake
  ctx.save();ctx.translate(960,636);ctx.strokeStyle='#f6f8fb';ctx.lineWidth=2;ctx.lineCap='round';for(let k=0;k<6;k++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-16);ctx.moveTo(0,-9);ctx.lineTo(4,-12);ctx.moveTo(0,-9);ctx.lineTo(-4,-12);ctx.stroke();}ctx.restore();glow(960,636,40,'#ffffff',.5);
  snowfall(3,30,{seed:2,speed:20,wind:-30,size:2.2,alpha:.4,x0:900,y0:0,w:1000,h:700});
  grade(0);filmGrain(.09);
});

// ================================================================ 12 · the road out of the village, seen from above
frame('12',()=>{
  // the road out of the village runs away from us between black trunks and forks ahead; nobody on it, only
  // the hoof prints and boot prints that came this far side by side
  const HZ=430,VX=1000,pr=(x,z)=>[VX+x/z,HZ+520/z];
  grad(0,HZ+20,[[0,'#b9c4ce'],[1,'#e6e2d8']]);glow(1500,HZ-40,700,'#fff4dc',.6);
  {const L=layerCanvas(),g=L.getContext('2d');for(let i=0;i<70;i++)spruce(hash(i*1.7)*W*1.1-60,HZ+10+hash(i*2)*6,60+hash(i*3)*70,'#9aa6b1',i+300,{g});ctx.save();ctx.filter='blur(2px)';ctx.drawImage(L,0,0);ctx.restore();}
  fogBand(HZ-60,HZ+40,'#e6e3db',.7);
  const sg=ctx.createLinearGradient(0,HZ,0,H);sg.addColorStop(0,'#dcdfe0');sg.addColorStop(1,'#f3eee5');ctx.fillStyle=sg;ctx.fillRect(0,HZ+12,W,H);
  // trodden road and its fork
  const road=(x0,x1,z0,z1)=>{const [a,b]=pr(x0-150,z0),[c,d]=pr(x0+150,z0),[e,f]=pr(x1+150,z1),[g2,h]=pr(x1-150,z1);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.lineTo(e,f);ctx.lineTo(g2,h);ctx.closePath();ctx.fill();};
  ctx.save();ctx.filter='blur(4px)';ctx.fillStyle='rgba(176,188,202,.55)';road(0,0,.4,3.2);road(0,-900,3.2,9);road(0,900,3.2,9);ctx.restore();
  // trunks either side, their shadows laid across the snow by a low sun on the right
  for(let i=0;i<22;i++){const side=i%2?1:-1,z=.55+Math.floor(i/2)*.42,x=side*(420+hash(i)*260),[bx,by]=pr(x,z),w=46/z,h=1500/z;if(bx<-80||bx>W+80)continue;
    ctx.save();ctx.globalAlpha=.32;ctx.fillStyle='#6f87a6';const [sx,sy]=pr(x-900,z*.92);ctx.beginPath();ctx.moveTo(bx-w/2,by);ctx.lineTo(bx+w/2,by);ctx.lineTo(sx+w/3,sy);ctx.lineTo(sx-w/3,sy);ctx.fill();ctx.restore();
    ctx.fillStyle='#232223';ctx.fillRect(bx-w/2,by-h,w,h+2);ctx.fillStyle='rgba(236,180,130,.45)';ctx.fillRect(bx+w/2-w*.18,by-h,w*.18,h);}
  // the tracks: two lines of prints up the road, stopping at the fork
  for(let k=0;k<30;k++){const z=.5+k*.09;if(z>3.1)break;
    for(const [lx,hoof] of [[-60,1],[70,0]]){const [x,y]=pr(lx+(k%2?16:-16),z),sx=(hoof?28:22)/z,sy=sx*.38;ctx.fillStyle=hoof?'#91a3ba':'#9eafc4';ctx.beginPath();ctx.ellipse(x,y,sx,sy,0,0,TAU);ctx.fill();ctx.fillStyle='#f4f0e8';ctx.beginPath();ctx.ellipse(x-sx*.15,y-sy*.3,sx*.5,sy*.4,0,0,TAU);ctx.fill();}}
  {const [x,y]=pr(0,3.2);for(let k=0;k<8;k++){const a=hash(k)*TAU,r=40+hash(k*3)*60;ctx.fillStyle='#93a5bc';ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r,y+Math.sin(a)*r*.3,9,4,0,0,TAU);ctx.fill();}}
  {const L=layerCanvas(),g=L.getContext('2d');g.fillStyle='rgba(60,72,92,.3)';g.beginPath();g.ellipse(1500,300,800,260,-.1,0,TAU);g.fill();ctx.save();ctx.filter='blur(70px)';ctx.drawImage(L,0,0);ctx.restore();}
  snowfall(8,50,{seed:3,speed:22,wind:-10,size:2.4,alpha:.5});grade(0);filmGrain();caption('10');
});

// ================================================================ 13 · Havard's directions, inked on the page as a map
frame('13',()=>{
  const ink='#3f3226';rect(0,0,W,H,'#14110e');
  ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=60;poly([40,30,W-40,36,W-44,H-40,44,H-34],'#e8dcc0');ctx.restore();
  for(let i=0;i<30;i++){glow(hash(i*3)*W,hash(i*7)*H,60+hash(i)*160,'#b89a68',.12);}
  ctx.strokeStyle=rgba(ink,.7);ctx.lineWidth=2.4;ctx.strokeRect(70,64,W-140,H-210);ctx.lineWidth=1;ctx.strokeRect(82,76,W-164,H-234);
  // the mountains of Insesen, hatched
  for(let i=0;i<10;i++){const x=150+i*66+(i%2)*18,y=210+(i%3)*22,h=64+hash(i)*30;ctx.fillStyle=rgba(ink,.12);ctx.beginPath();ctx.moveTo(x-40,y);ctx.lineTo(x,y-h);ctx.lineTo(x+40,y);ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-40,y);ctx.lineTo(x,y-h);ctx.lineTo(x+40,y);ctx.stroke();ctx.lineWidth=1.2;for(let k=1;k<5;k++){ctx.beginPath();ctx.moveTo(x-k*7,y-h+k*14);ctx.lineTo(x-k*7+8,y);ctx.stroke();}}
  text('因舍森',330,124,{size:26,color:ink,font:SERIF,spacing:8});
  // the river Kogod
  ctx.save();ctx.strokeStyle='#4d6a7c';ctx.lineWidth=4;ctx.lineCap='round';for(const o of [0,10]){ctx.beginPath();ctx.moveTo(1220+o,880);ctx.bezierCurveTo(1460+o,700,1380+o,500,1600+o,380);ctx.bezierCurveTo(1760+o,290,1700+o,160,1860+o,80);ctx.stroke();}ctx.restore();text('柯戈德河',1680,330,{size:24,color:'#4d6a7c',font:SERIF,spacing:6});
  // forests as little inked spruces
  [[640,610,14],[1000,570,12],[1260,220,10],[300,500,12],[1380,720,9]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++){const x=fx+(hash(j*20+i)-.5)*220,y=fy+(hash(j*20+i*3)-.5)*100;ctx.strokeStyle=ink;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-34);for(let k=0;k<4;k++){const yy=y-8-k*7,w=12-k*2.6;ctx.moveTo(x-w,yy+5);ctx.lineTo(x,yy);ctx.lineTo(x+w,yy+5);}ctx.stroke();}});
  text('瑞达内',960,540,{size:70,color:rgba(ink,.14),font:SERIF,align:'center',spacing:34});
  // compass rose
  ctx.save();ctx.translate(1740,200);ctx.strokeStyle=ink;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,46,0,TAU);ctx.stroke();for(let k=0;k<8;k++){const a=k*Math.PI/4,r=k%2?40:70;poly([Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.25)*14,Math.sin(a+.25)*14,0,0,Math.cos(a-.25)*14,Math.sin(a-.25)*14],k%2?rgba(ink,.35):rgba(ink,.85));}text('北',0,-82,{size:20,color:ink,font:SERIF,align:'center'});ctx.restore();
  // the road, dashed from place to place, each place a cluster of roofs
  const pts=PLACES.map(p=>[p[1],p[2]]);ctx.save();ctx.strokeStyle='#8a5a32';ctx.lineWidth=4;ctx.setLineDash([14,10]);for(let i=1;i<pts.length;i++){const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);ctx.stroke();}ctx.restore();
  PLACES.forEach(([name,x,y])=>{ctx.save();ctx.translate(x,y);for(let k=0;k<3;k++){const hx=-30+k*22,hy=k===1?-8:0;ctx.fillStyle=rgba(ink,.15);ctx.strokeStyle=ink;ctx.lineWidth=1.8;path([hx-10,hy,hx-10,hy-16,hx,hy-28,hx+10,hy-16,hx+10,hy]);ctx.fill();ctx.stroke();}
    ctx.beginPath();ctx.arc(0,24,9,0,TAU);ctx.fillStyle=UI.deep;ctx.fill();ctx.strokeStyle='#f4efe2';ctx.lineWidth=3;ctx.stroke();ctx.restore();text(name,x,y+68,{size:34,weight:700,color:ink,font:SERIF,align:'center',spacing:4});});
  grade(0);ui(()=>{mapToolbar(103);cursor(1176,360,1,.4);});caption('11');
});

// ================================================================ 14 · the parting
frame('14a',()=>{weave(()=>{wWinterSky();
    wHorseStand(1500,712,.95,{face:-1});
    wPerson(1070,862,.9,{...HAVARD,face:-1,head:.3,parts:'body',armN:[10,-480,120,-410,226,-366],armF:[-10,-480,20,-390,60,-340]});
    wPerson(950,862,.8,{...RIGA,head:.5,stepF:10,armN:[10,-480,110,-452,196,-450],armF:[-10,-480,60,-440,150,-450]});
    wPerson(1070,862,.9,{...HAVARD,face:-1,head:.3,parts:'near',armN:[10,-480,120,-410,226,-366]});
    wBorderTop('HIC RIGA ET HAVARD VALEDICVNT',{h:124});wBorderBottom();},{seed:14,flicker:.15});grade(0);});
frame('14b',()=>{
  // the snow where they stood: two pairs of prints toe to toe; hoof prints leading on; one pair turned back to the road
  const sg=ctx.createLinearGradient(0,0,0,H);sg.addColorStop(0,'#d6dce2');sg.addColorStop(1,'#f2ede4');ctx.fillStyle=sg;ctx.fillRect(0,0,W,H);
  {const L=layerCanvas(),g=L.getContext('2d');for(let i=0;i<14;i++){g.globalAlpha=.22;g.fillStyle=i%2?'#ffffff':'#c4cdd8';g.beginPath();g.ellipse(hash(i*3)*W,hash(i*5)*H,320,46,0,0,TAU);g.fill();}ctx.save();ctx.filter='blur(30px)';ctx.drawImage(L,0,0);ctx.restore();}
  const boot=(x,y,a,s,deep=1)=>{ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s*.55);ctx.fillStyle='#fbf8f2';ctx.beginPath();ctx.ellipse(-3,-4,44,22,0,0,TAU);ctx.fill();const g=ctx.createLinearGradient(-40,0,40,0);g.addColorStop(0,'#c3ccd6');g.addColorStop(.55,'#8297b0');g.addColorStop(1,`rgba(92,114,146,${deep})`);ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-40,0);ctx.bezierCurveTo(-40,-18,30,-20,40,-6);ctx.bezierCurveTo(44,6,30,18,0,16);ctx.bezierCurveTo(-30,14,-40,10,-40,0);ctx.fill();ctx.restore();};
  boot(820,620,0,1.5);boot(830,690,0,1.5);boot(1060,616,Math.PI,1.25);boot(1052,680,Math.PI,1.25);
  for(let k=0;k<6;k++)boot(700-k*150,600+(k%2?60:0)+k*24,0,1.5-k*.03);
  for(let k=0;k<7;k++){const x=1240+k*110,y=600+(k%2?-30:30)-k*20;ctx.fillStyle='#8196b0';ctx.beginPath();ctx.ellipse(x,y,30,18,0,0,TAU);ctx.fill();ctx.fillStyle='#eeebe5';ctx.beginPath();ctx.ellipse(x+6,y,13,8,0,0,TAU);ctx.fill();}
  snowfall(20,60,{seed:6,speed:18,wind:-6,size:2.6,alpha:.6});grade(0);filmGrain();caption('12');
});

// ================================================================ 15–18 · the ride
frame('15a',()=>{weave(()=>{wWinterSky();
    wHorseStand(820,712,1.05);wRider(820+12*1.05,712-14*1.05,1.05);
    wPerson(1330,862,.9,{...HAVARD,face:-1,head:-.42,armN:[10,-480,40,-380,64,-300],armF:[-10,-480,10,-380,40,-310]});
    wBorderTop('HIC HAVARD RIGAM DIMITTIT',{h:124});wBorderBottom();},{seed:15,flicker:.15});grade(0);caption('13');});
frame('15b',()=>sampleRider());
frame('16',()=>{sampleRider();ui(()=>outlinePanel(150.4));});
frame('17',()=>{
  weave(()=>{rect(0,0,W,H,DYE.wool);for(const [tx,th,sd] of [[120,600,5],[420,420,6]])wTree(tx,830,th,{seed:sd,leaf:DYE.sky,leaf2:DYE.bone,trunk:DYE.indigo});
    for(let i=0;i<50;i++){const fx=hash(i*3.3)*1100,fy=150+hash(i*7.1)*600;wFlake(fx,fy,1+hash(i)*.5,DYE.woad);}
    wGround(800,{cols:[DYE.bone,DYE.sky,DYE.bone]});wHorse(1020,720,1.1);wRider(1020+12*1.1,720-14*1.1,1.1);
    wBorderTop('HIC RIGA EQVITAT AD HELGARD',{h:124});wBorderBottom();},{seed:17,flicker:.3});
  // ahead of him the weaving stops: bare warp, the last picks loose, the wall behind showing through
  const edge=y=>1420+Math.sin(y/90)*40+noise(y/26)*50;
  ctx.save();ctx.beginPath();ctx.moveTo(W,0);for(let y=0;y<=H;y+=10)ctx.lineTo(edge(y),y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#0f0b09';ctx.fill();ctx.clip();
  for(let x=1300;x<W;x+=PW*2){ctx.strokeStyle='rgba(222,207,174,.75)';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(x+Math.sin(x)*2,0);ctx.lineTo(x+Math.sin(x*1.7)*4,H);ctx.stroke();}ctx.restore();
  for(let i=0;i<60;i++){const y=hash(i*2.3)*H,x0=edge(y),l=30+hash(i*5.1)*140;ctx.strokeStyle=[DYE.bone,DYE.sky,DYE.wool][i%3];ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x0,y);ctx.quadraticCurveTo(x0+l*.5,y+10,x0+l,y+l*.4);ctx.stroke();}
  grade(0);caption('14');
});
frame('18',()=>{
  // the rider, last of all, a pale outline going into the dark, the bare warp behind him
  weave(()=>{rect(0,0,W,H,DYE.black);wHorse(860,720,1.1,{coat:DYE.umber,far:DYE.black,inner:DYE.walnut});wRider(860+12*1.1,720-14*1.1,1.1,{cloth:DYE.umber,inner:DYE.walnut});},{seed:18,light:.6,folds:0});
  ctx.save();ctx.globalCompositeOperation='screen';for(let x=0;x<W;x+=PW*2){ctx.strokeStyle=`rgba(222,207,174,${.16*(1-x/W)})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+Math.sin(x)*3,H);ctx.stroke();}ctx.restore();
  const g=ctx.createLinearGradient(300,0,1700,0);g.addColorStop(0,'rgba(5,4,3,.2)');g.addColorStop(.55,'rgba(5,4,3,.55)');g.addColorStop(1,'rgba(5,4,3,.97)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.filter='blur(30px)';ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(W,0);ctx.bezierCurveTo(1500,200,1350,500,1240,H);ctx.lineTo(W,H);ctx.fill();ctx.restore();
});
frame('19',()=>{renderAt(166.6);});
