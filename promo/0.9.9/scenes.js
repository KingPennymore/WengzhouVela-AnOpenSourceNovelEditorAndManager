// The nineteen shots of the storyboard (see storyboard.md), drawn with the primitives in scene.html.
// Interface overlays are queued in UI_LAYER and drawn after the colour grade, so they keep the app's own colours.
const SHOTS=[],UI_LAYER=[],ui=f=>UI_LAYER.push(f);const shot=(a,b,fn)=>SHOTS.push({a,b,fn});
const fogBand=(y0,y1,color,a)=>{const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,rgba(color,0));g.addColorStop(.5,rgba(tint(color),a));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(0,y0,W,y1-y0);};
const shake=(t,at,amount,decay=6)=>{if(t<at)return [0,0];const k=Math.exp(-(t-at)*decay)*amount;return [Math.sin(t*83)*k,Math.cos(t*71)*k];};
function walkPose(phase,amp=1){const a=TAU*phase;return {fF:[6+Math.sin(a)*20*amp,82-Math.max(0,Math.cos(a))*9*amp],fB:[2+Math.sin(a+Math.PI)*20*amp,82-Math.max(0,Math.cos(a+Math.PI))*9*amp],hF:[10-Math.sin(a)*12*amp,-14],hB:[4+Math.sin(a)*12*amp,-14],tor:.06};}

// ================================================================ 01–02 · the brand and the burning page
const PAPER={x:370,y:200,w:1180,h:700};
const PAGE_TEXT=['我死死地攥着手里的长枪，弓着身子，跪在牲畜和人的尸体中，','竖起耳朵听着从大路那边传来的、愈发清晰的马蹄声。','当这场战争结束后，人们会记住许多名字……'];
function paperSheet(a,ink){
  if(a<=0)return;ctx.save();ctx.globalAlpha*=a;
  ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=60;ctx.shadowOffsetY=20;poly([PAPER.x,PAPER.y,PAPER.x+PAPER.w,PAPER.y+6,PAPER.x+PAPER.w-4,PAPER.y+PAPER.h,PAPER.x+3,PAPER.y+PAPER.h-5],'#d7d5cf');ctx.shadowColor='transparent';
  poly([PAPER.x,PAPER.y,PAPER.x+PAPER.w*.55,PAPER.y+3,PAPER.x+PAPER.w*.3,PAPER.y+PAPER.h*.6],'#d9d7d1');
  poly([PAPER.x+PAPER.w,PAPER.y+6,PAPER.x+PAPER.w-4,PAPER.y+PAPER.h,PAPER.x+PAPER.w*.62,PAPER.y+PAPER.h*.8],'#d3d1ca');
  PAGE_TEXT.forEach((l,i)=>text(l,PAPER.x+110,PAPER.y+520+i*44,{size:24,color:'#8e8b84',font:SERIF,a:ink}));
  ctx.restore();
}
function brand(t,paper){
  const cx=W/2,p=seg(t,2,2.45),ink=mix('#eef2f4','#25282c',paper);if(p<=0)return;
  ctx.save();ctx.translate(cx-215,410);const s=.62*back(p);ctx.scale(s,s);ctx.translate(-96,-96);ctx.globalAlpha=clamp(p*2);
  ctx.shadowColor=`rgba(138,208,168,${.6*(1-seg(t,2,3.2))})`;ctx.shadowBlur=60;fillRR(0,0,192,192,44,'#257c67');ctx.shadowColor='transparent';ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();
  const title='文舟',ver='0.9.9';let x=cx-140;
  [...title].forEach((ch,i)=>{const q=seg(t,2.25+i*.08,2.65+i*.08);text(ch,x+(1-easeOut(q))*0,440+(1-easeOut(q))*40,{size:112,weight:800,color:ink,a:q});x+=measure(ch,112,800);});
  text(ver,x+24,440,{size:76,weight:300,color:mix('#8ad0a8','#257c67',paper),a:easeOut(seg(t,2.55,3)),spacing:2});
  // a hairline frame drawing itself around the title
  const fr=easeInOut(seg(t,2.5,3.5));if(fr>0){const bx=cx-330,by=330,bw=700,bh=150,per=2*(bw+bh);ctx.save();ctx.strokeStyle=rgba(paper>.5?'#5a5e63':'#dfe8ef',.7);ctx.lineWidth=1.2;ctx.setLineDash([per*fr,per]);rr(bx,by,bw,bh,6);ctx.stroke();ctx.restore();}
}
shot(0,4,t=>{
  rect(0,0,W,H,'#000000');
  const push=1+.035*t/4;ctx.save();ctx.translate(W/2,H/2);ctx.scale(push,push);ctx.translate(-W/2,-H/2);
  const paper=easeInOut(seg(t,2.2,4));paperSheet(paper*.96,paper);
  const gather=easeInOut(seg(t,0,2));
  for(let i=0;i<140;i++){const a=i*2.399,r0=1100*(.35+(i%7)*.08),r=lerp(r0,30+(i%5)*6,gather),x=W/2+Math.cos(a+t*.6)*r,y=430+Math.sin(a+t*.6)*r*.8;ctx.globalAlpha=(.25+.6*((i%4)/4))*(1-seg(t,2,2.3));ctx.fillStyle=i%3?'#bcd2e4':'#f1f4f6';ctx.beginPath();ctx.arc(x,y,2+(i%3),0,TAU);ctx.fill();}
  ctx.globalAlpha=1;if(t>=2){const ring=easeOut(seg(t,2,2.9));ctx.beginPath();ctx.arc(W/2,430,ring*900,0,TAU);ctx.strokeStyle=`rgba(220,232,240,${.5*(1-ring)})`;ctx.lineWidth=6;ctx.stroke();}
  brand(t,paper);ctx.restore();
});
function burnPath(cx,cy,R,t){const p=[];for(let i=0;i<96;i++){const a=i/96*TAU,c=Math.cos(a),s=Math.sin(a),r=R*(1+.34*(noise(c*1.6+4)+noise(s*1.6+9)-1)+.1*(noise(c*6+t*.6+2)+noise(s*6+t*.5)-1));p.push(cx+c*r,cy+s*r);}return p;}
shot(4,9,t=>{
  const lt=t-4;battlefield(9,{});
  const O=[1350,800],zoom=1.035+1.5*easeIn(seg(lt,.4,5)),R=lt<.55?0:12+1500*Math.pow(seg(lt,.55,4.9),1.75);
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(1.035,1.035);ctx.translate(-W/2,-H/2);ctx.translate(O[0],O[1]);ctx.scale(zoom/1.035,zoom/1.035);ctx.translate(-O[0],-O[1]);
  // the sheet with a hole burned through it
  ctx.save();ctx.beginPath();ctx.rect(-4000,-4000,9000,9000);if(R>0){const hp=burnPath(O[0],O[1],R,lt);ctx.moveTo(hp[0],hp[1]);for(let i=2;i<hp.length;i+=2)ctx.lineTo(hp[i],hp[i+1]);ctx.closePath();}
  ctx.clip('evenodd');rect(-4000,-4000,9000,9000,'#000000');paperSheet(.96,1);brand(4,1);
  // scorch before the paper gives way
  const sc=seg(lt,0,.7);if(sc>0){ctx.save();ctx.beginPath();ctx.rect(PAPER.x,PAPER.y,PAPER.w,PAPER.h);ctx.clip();glow(O[0],O[1],40+R*1.25+60*sc,'#3a2212',.85*sc);glow(O[0],O[1],18+R*1.08+20*sc,'#1e1009',.9*sc);ctx.restore();}
  ctx.restore();
  if(R>0){const hp=burnPath(O[0],O[1],R,lt);ctx.save();ctx.beginPath();ctx.rect(PAPER.x,PAPER.y,PAPER.w,PAPER.h);ctx.clip();
    path(hp);ctx.shadowColor='#ff6a10';ctx.shadowBlur=30;ctx.strokeStyle='#ff8c2e';ctx.lineWidth=7/zoom*1.035;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffe2a6';ctx.lineWidth=2/zoom*1.035;ctx.stroke();
    // charred flakes curling off the edge
    for(let i=0;i<40;i++){const a=hash(i*5.1)*TAU,age=(lt*.9+hash(i))%1,c=Math.cos(a),s=Math.sin(a),r=R*(1+.34*(noise(c*1.6+4)+noise(s*1.6+9)-1))*(1+age*.18)+8,x=O[0]+c*r,y=O[1]+s*r-age*60,sz=(6+hash(i*3)*10)*(1-age);
      ctx.save();ctx.translate(x,y);ctx.rotate(age*6+i);ctx.globalAlpha=1-age;poly([-sz,0,0,-sz*.6,sz,0,0,sz*.5],'#241309');poly([-sz,0,0,-sz*.6,0,0],'#ff7a22');ctx.restore();}
    ctx.restore();}
  ctx.restore();
  // embers drifting towards the lens
  if(lt>.6)for(let i=0;i<70;i++){const age=(lt*.55+hash(i*1.7))%1,a=hash(i*2.3)*TAU,d=(160+hash(i)*500)*(1+age*2.2),x=O[0]+Math.cos(a)*d*(.4+zoom*.4),y=O[1]+Math.sin(a)*d*.7-age*220,s=2+age*age*14;
    ctx.save();ctx.globalAlpha=(1-age)*seg(lt,.6,1.2);glow(x,y,s*4,'#ff8a2a',.6);ctx.fillStyle=age<.4?'#ffe6a8':'#ff9a40';ctx.beginPath();ctx.arc(x,y,s*.5,0,TAU);ctx.fill();ctx.restore();}
});

// ================================================================ 03–04 · the pine wood where Riga hides
function corpse(x,y,s,seed,col,dark){
  ctx.save();ctx.translate(x,y);ctx.scale(s*(hash(seed)>.5?1:-1),s);
  poly([-60,0,-50,-16,-14,-24,22,-20,50,-9,58,0],col);poly([-50,-16,-14,-24,0,-10,-40,-6],dark);
  blob(66,-8,10,dark,6);if(hash(seed*3)>.4){ctx.save();ctx.translate(-20,-20);ctx.rotate(-.5);poly([-22,0,0,-30,22,0,0,8],dark);ctx.restore();}
  ctx.restore();
}
function brokenSpear(x,y,len,ang,col){const e=[x+Math.sin(ang)*len,y-Math.cos(ang)*len];limb([x,y],e,5,4,col);poly([e[0]-4,e[1],e[0]+5,e[1]+2,e[0]+1,e[1]-7],col);}
function sword(x,y,s,ang,col){ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.scale(s,s);poly([-4,0,4,0,3,-90,0,-96,-3,-90],col);poly([-18,-96,18,-96,18,-90,-18,-90],col);poly([-3,-96,3,-96,3,-124,-3,-124],col);blob(0,-128,6,col,6);ctx.restore();}
function lyingHorse(x,y,s,col,lite){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  poly([-150,0,-140,-50,-80,-78,20,-80,90,-60,120,-20,110,0],col);poly([-140,-50,-80,-78,20,-80,-30,-55],lite);
  poly([100,-30,150,-50,210,-20,240,0,120,0],col);poly([150,-50,175,-60,168,-40],col);
  limb([-120,-20],[-210,-40],20,10,col);limb([-110,-12],[-205,-8],18,10,col);limb([60,-30],[120,-70],16,9,col);
  poly([-160,-30,-150,-10,-190,20,-200,6],col);
  ctx.restore();
}
function bigPine(x,col,lite,needle){
  poly([x-120,H+20,x-95,-40,x+150,-40,x+175,H+20],col);
  poly([x-120,H+20,x-95,-40,x-20,-40,x-40,H+20],lite);
  for(let i=0;i<10;i++){const y=80+i*100+hash(i*4)*40;poly([x-90,y,x-30,y-14,x+10,y+30,x-70,y+40],mix(col,lite,.5));}
  // drooping, needled branches across the top of the frame
  for(let i=0;i<9;i++){const by=-90+i*62+hash(i)*30,bx=x-70,reach=280+hash(i*9)*460,droop=50+hash(i*2)*90,th=24+hash(i*5)*26,up=u=>[bx-reach*u,by+droop*u*u];
    const p=[];for(let k=0;k<=12;k++){const [px,py]=up(k/12);p.push(px,py-(k%2?th*.3:0)*(1-k/12));}
    for(let k=12;k>=0;k--){const [px,py]=up(k/12);p.push(px+(k%2?12:-8),py+th*(1-k/14)*(k%2?1.35:.6));}
    poly(p,i%3===1?mix(needle,lite,.45):needle);}
}
function battlefield(t,{camX=0}={}){
  grad(0,760,[[0,'#a5c8e8'],[.65,'#cfe0f0'],[1,'#dce8f2']]);
  glow(160,-60,1100,'#ffffff',.6);
  for(let i=0;i<5;i++){const y=150+i*70,x=((i*530-camX*.08-t*6)%2600+2600)%2600-500,w=500+hash(i)*400;ctx.save();ctx.globalAlpha=.55;poly([x,y,x+w,y-8,x+w+120,y+8,x+40,y+18],'#e9f2f9');ctx.restore();}
  ridge(11,620,170,'#87aad2','#a0bfdf',{off:camX*.12,step:280});
  for(let i=-4;i<40;i++){const wx=i*86+hash(i)*60,x=wx-camX*.3;if(x<-120||x>W+120)continue;pine(x,672+hash(i*2)*18,95+hash(i*3)*85,'#6c93c0','#84a9d1',{seed:i});}
  fogBand(560,740,'#e4eef7',.75);
  ground(690,'#d2e2f2',{off:camX*.5,amp:10,seed:3,bands:[[34,'#c3d7ec',0],[110,'#b1c9e3',1]]});
  for(let i=-2;i<16;i++){const wx=i*240+hash(i*5)*140,x=wx-camX*.55;if(x<-200||x>W+200)continue;pine(x,740+hash(i*7)*24,230+hash(i*8)*130,'#4a76a6','#6690bf',{seed:i+50,snow:'#bcd1e8'});}
  fogBand(700,820,'#dbe8f4',.45);
  // dappled light on the snow
  ctx.save();ctx.globalAlpha=.5;for(let i=0;i<14;i++){const x=((i*300+hash(i)*200-camX*.8)%3000+3000)%3000-400,y=800+hash(i*3)*120;blob(x,y,40+hash(i)*80,'#eef5fc',6,i,.25);}ctx.restore();
  // what is left of the battle, mid-ground
  ctx.save();ctx.translate(-camX*.85,0);
  [[260,860,1],[620,890,1.1],[1080,850,.9],[1460,900,1.2],[1780,870,1]].forEach(([x,y,s],i)=>corpse(x,y,s,i+3,'#3f6190','#33527d'));
  [[400,880,120,-.5],[900,870,160,.45],[1200,900,90,-.9],[1650,880,140,.3],[2050,880,110,-.35],[520,850,80,.2]].forEach(([x,y,l,a])=>brokenSpear(x,y,l,a,'#2c4670'));
  sword(1320,905,1.1,.18,'#2a4166');sword(760,880,.8,-.3,'#2e4870');
  ctx.restore();
  // foreground: a fallen horse, rocks, the great pine and Riga
  ctx.save();ctx.translate(-camX,0);
  lyingHorse(880,985,1.25,'#25406a','#2f4f7e');
  for(let i=0;i<12;i++){const x=i*240-80+hash(i*11)*80,y=1000+hash(i)*40,r=90+hash(i*2)*90;poly([x-r,H+40,x-r*.6,y-r*.3,x,y-r*.45,x+r*.7,y-r*.2,x+r,H+40],'#1d3254');poly([x-r*.6,y-r*.3,x,y-r*.45,x-r*.1,y],'#2b4672');}
  bigPine(2440,'#16263f','#1f3352','#121f35');
  kneelingRiga(t,2110,985,2.5);
  ctx.restore();
  shafts(t,1,{x:-200-camX*.2});
  snowfall(t,60,{seed:5,speed:26,wind:-18,size:3,alpha:.6});
}
const KNEEL={tor:.46,hd:.32,hF:[43,-66],hB:[41,-28],fF:[40,48],fB:[-40,46],ftF:0,ftB:-1.25,gF:1,gB:1};
function kneelingRiga(t,x,gy,s){
  const breath=Math.sin(t*1.7)*.018,p={...POSE,...KNEEL,x,y:gy-55*s,s,face:-1,tor:KNEEL.tor+breath};
  human(p,STYLE.soldier,{hold:(stage)=>{if(stage==='front')spear(47,52,-250);}});
}
shot(9,17,t=>{const lt=t-9,k=easeInOut(seg(lt,0,7.6)),camX=700*k,z=1+.16*k;ctx.save();ctx.translate(W*.72,H*.78);ctx.scale(z,z);ctx.translate(-W*.72,-H*.78);battlefield(t,{camX});ctx.restore();});
function bigHead(t){
  // Riga's profile at close-up scale, facing left: the same head outline as the figures, flat skin in two tones.
  const k=15;ctx.save();ctx.translate(1240,610);ctx.scale(-k,k);
  poly([-20,40,-17,14,-12,5,-8,1,7,1,12,5,17,13,22,40],SHADE('#2a2620'));poly([-10,0,7,0,12,5,8,10,-12,9],'#4f4237');poly([7,1,12,5,17,13,22,40,8,40],LIT('#2a2620'));
  poly(HEAD,SHADE(STYLE.soldier.skin));ctx.save();path(HEAD);ctx.clip();poly([1,4,20,4,20,-40,1,-40,-1,-20],LIT(STYLE.soldier.skin));ctx.restore();
  poly(HAT,SHADE(STYLE.soldier.hat));ctx.save();path(HAT);ctx.clip();poly([-2,-40,20,-40,20,-22,-2,-26],LIT(STYLE.soldier.hat));ctx.restore();poly(FLAP,STYLE.soldier.flap);
  ctx.restore();
  // breath leaving the mouth, blown away to the left
  for(let i=0;i<8;i++){const period=1.9,age=((t-17+i*period/3)%period)/period,kk=Math.floor((t-17+i*period/3)/period);if(t<17.2+i*.2)continue;
    const x=1240-10.5*k-age*380-hash(kk+i)*20,y=610-13.5*k-age*30+Math.sin(age*5+i)*8,r=14+age*70;ctx.save();ctx.globalAlpha=(1-age)*.4*(age<.12?age/.12:1);blob(x,y,r,'#f2f7fb',7,i,.6);ctx.restore();}
}
// A fist closed round a pole, in two flat tones (local units; the pole runs vertically through the origin).
function fist(skin,lit=.5){const F=[-15,-10,-8,-15,9,-15,16,-11,17,4,13,12,-2,15,-14,12,-17,2];poly(F,SHADE(skin));ctx.save();path(F);ctx.clip();poly([-20,-20,20,-20,20,-20+40*lit,-20,-24+40*lit],LIT(skin));ctx.restore();poly([-6,-15,6,-17,12,-14,4,-11,-6,-11],LIT(skin));}
function fists(t){
  // the spear, and the fist closing on it at chin height; the grip tightens as the hooves come near
  const grip=seg(t,19.3,19.9),sq=1-.05*grip;
  limb([830,-20],[830,H+40],30,32,'#232c3d');
  bone([900,780],[1080,1200],()=>twoTone([46,-6,54,90,62,460,-58,460,-50,120,-46,-6],'#3e4a3c',-4));
  ctx.save();ctx.translate(838,720);ctx.scale(6.2*sq,6.2);fist(STYLE.soldier.skin);ctx.restore();
}
shot(17,23,t=>{
  const lt=t-17,out=easeIn(seg(t,21.5,23)),z=1-out*.35;
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-W/2,-H/2);
  grad(0,H,[[0,'#9ec2e4'],[.6,'#c9dcee'],[1,'#d6e4f1']]);glow(200,0,900,'#ffffff',.5);
  ctx.save();ctx.translate(-120+lt*-8,0);for(let i=0;i<14;i++)pine(i*170+hash(i)*60,820+hash(i*3)*30,260+hash(i*2)*160,'#7b9fc8','#93b5da',{seed:i+80});ctx.restore();
  fogBand(600,900,'#e2edf7',.7);
  bigHead(t);fists(t);
  ctx.restore();
  // the gust: snow lifted in sheets from the right until it fills the frame
  const g=seg(t,21.2,23);if(g>0){for(let i=0;i<140*g;i++){const y=hash(i*2.1)*H,sp=900+hash(i)*900,x=W+200-((t-21.2)*sp+hash(i*3)*W)%(W+600),len=40+hash(i*5)*160;ctx.save();ctx.globalAlpha=.25+.5*hash(i*7);poly([x,y,x+len,y-6,x+len,y-2,x,y+3],'#f4f8fb');ctx.restore();}
    ctx.save();ctx.globalAlpha=easeIn(g)*.96;rect(0,0,W,H,'#e9f0f6');ctx.restore();}
});

// ================================================================ 05–06 · Arthur, the bear of spring
const SPRING={skyT:'#bcd9e8',skyB:'#f4e6b2',hill:'#9cbf74',hillL:'#b4d28a',tree:'#5b8e43',treeL:'#7cab5a',treeD:'#3f6b32',grass:'#86b25a',grass2:'#79a650',earth:'#a07c45'};
function bearState(t){
  const bx=lerp(500,760,easeOut(seg(t,23.2,26.4)));
  return {x:bx,phase:(bx-500)/150,walk:seg(t,23,23.4)*(1-seg(t,25.9,26.4)),head:easeInOut(seg(t,26.3,26.9))*(1-easeInOut(seg(t,28.3,28.8))),rear:easeInOut(seg(t,28.6,29.9)),jaw:easeOut(seg(t,29.9,30.2))*(1-easeInOut(seg(t,32.8,33.6)))*(1+.06*Math.sin(t*38)*seg(t,30.2,30.4)*(1-seg(t,32.4,32.8)))};
}
function grassBlades(t,y0,count,{seed=0,push=null,col1='#5f9440',col2='#8cbd5c',h=40}={}){
  for(let i=0;i<count;i++){const x=hash(seed+i)*W*1.1-60,y=y0+hash(seed+i*2)*(H-y0),hh=h*(.6+.8*hash(seed+i*3))*(.6+(y-y0)/(H-y0)*.8);let lean=Math.sin(t*1.6+x*.01)*.12;if(push)lean+=push(x,y);
    const tx=x+Math.sin(lean)*hh,ty=y-Math.cos(lean)*hh;poly([x-4,y,tx,ty,x+4,y],i%3?col1:col2);}
}
function springMeadow(t,{camX=0,camY=0,shake:[sx,sy]=[0,0],roar=0,bs}={}){
  grad(0,H,[[0,SPRING.skyT],[.55,'#e7ead0'],[1,SPRING.skyB]]);glow(260,40,900,'#fff4c8',.7);
  ctx.save();ctx.translate(sx,camY+sy);
  ridge(21,640,190,SPRING.hill,SPRING.hillL,{off:camX*.15,step:320});
  for(let i=-3;i<26;i++){const x=i*110+hash(i)*70-camX*.35;if(x<-150||x>W+150)continue;(i%3?leafTree:(a,b,c)=>pine(a,b,c,SPRING.treeD,SPRING.tree,{seed:i}))(x,690+hash(i*2)*20,150+hash(i*3)*110,SPRING.tree,SPRING.treeL,SPRING.treeD,i);}
  fogBand(600,760,'#f1efd6',.5);
  ground(720,SPRING.grass,{off:camX*.6,seed:7,amp:12,bands:[[60,SPRING.grass2,0],[160,'#6f9a47',2]]});
  ctx.save();ctx.translate(-camX,0);
  // patches of old snow; the one under Arthur's nose melts away
  [[260,860,90],[1300,900,120],[1700,820,70]].forEach(([x,y,r])=>{blob(x,y,r,'#eef3ee',7,x,.22);blob(x-r*.2,y-4,r*.6,'#f8fbf8',6,x,.2);});
  const melt=bs?easeInOut(seg(t,26.9,28.5)):1,mx=bs?bs.x+250:1000;poly([mx-170,820,mx-60,800,mx+90,806,mx+170,826,mx+40,842,mx-120,838],SPRING.earth);
  if(melt<1){ctx.save();ctx.translate(mx,822);ctx.scale(1-melt,1-melt*.7);blob(0,0,170,'#eef3ee',7,1,.16);blob(-30,-3,110,'#f8fbf8',6,2,.16);ctx.restore();}
  for(let i=0;i<9;i++){const g=seg(t,27.6+i*.08,28.4+i*.08)*(bs?1:1);if(g<=0)continue;const x=mx-130+i*32,h=22*g*(.6+hash(i));poly([x-3,826,x,826-h,x+3,826],'#7fbf4c');}
  if(bs)bear({x:bs.x,y:850,s:2.3,phase:bs.phase,walk:bs.walk,rear:bs.rear,head:bs.head,jaw:bs.jaw});
  ctx.restore();
  // breath melting the snow
  if(bs&&t>26.7&&t<28.6)for(let i=0;i<6;i++){const age=((t-26.7)*1.4+i/6)%1,x=bs.x+250-camX+age*40,y=800+age*16;ctx.save();ctx.globalAlpha=(1-age)*.35;blob(x,y,10+age*40,'#ffffff',6,i,.6);ctx.restore();}
  const head=bs?[bs.x+300-camX,560]:[900,600];
  grassBlades(t,860,150,{seed:3,push:roar>0?(x,y)=>Math.sign(x-head[0]||1)*roar*1.1*Math.exp(-Math.abs(x-head[0])/700):null});
  ctx.restore();
}
shot(23,36,t=>{
  const bs=bearState(t),roar=bs.jaw>.6?seg(t,30.2,30.6)*(1-seg(t,32.4,33)):0,camX=(bs.x-500)*.45,camY=60*bs.rear;
  springMeadow(t,{camX,camY,shake:shake(t,30.2,10,1.6),roar,bs});
  if(roar>0){ctx.save();ctx.globalAlpha=roar*.25;for(let i=0;i<5;i++){const r=((t-30.2)*700+i*220)%1100;ctx.strokeStyle='#fff8e0';ctx.lineWidth=4;ctx.beginPath();ctx.arc(bs.x-camX+300,560+camY*.4,r,-1.2,1.2);ctx.stroke();}ctx.restore();}
  // the wind carries winter away: the snow frame slides off to the right
  const wipe=easeInOut(seg(t,23,23.9));if(wipe<1){const x=wipe*(W+300);ctx.save();rect(x,0,W+300,H,'#e9f0f6');for(let i=0;i<60;i++){const y=hash(i)*H,l=80+hash(i*3)*300;ctx.globalAlpha=.6;poly([x-l,y,x+20,y-4,x+20,y+3],'#f6f9fb');}ctx.restore();}
  ui(()=>glossaryOverlay(t,{t0:24.9,t1:35.4,x:W-620,y:80,sentence:'大熊阿瑟用它温暖的鼻息融化积雪，',term:'阿瑟',cat:'精魂',def:'大熊精魂'}));
});
const CANOPY=(()=>{const a=[];for(let i=0;i<150;i++)a.push({x:hash(i*1.3)*(W+300)-150,y:-120-hash(i*2.9)*2500,r:70+hash(i*4.1)*130,rot:hash(i)*3});return a.sort((p,q)=>q.y-p.y);})();
shot(36,40,t=>{
  const lt=t-36,rise=easeInOut(seg(lt,0,3.9))*2700,cold=seg(lt,.8,3.6);
  const top=mix(SPRING.skyT,'#e9eff4',cold),bot=mix(SPRING.skyB,'#d2dde7',cold);grad(0,H,[[0,top],[1,bot]]);
  ctx.save();ctx.translate(0,rise);
  ctx.save();ctx.beginPath();ctx.rect(0,-50,W,H+60);ctx.clip();springMeadow(36,{camX:117,camY:60,bs:bearState(36)});ctx.restore();
  // blood spreading over the earth, then snow over the blood
  const red=easeOut(seg(lt,.15,1.2)),snow=easeInOut(seg(lt,.9,1.9));
  if(red>0){ctx.save();ctx.globalAlpha=.78*red;blob(980,900,1400*red,'#6e1d1c',9,.3,.16);ctx.restore();}
  if(snow>0){ctx.save();ctx.beginPath();ctx.rect(0,H-(H-640)*snow,W,H);ctx.clip();rect(0,600,W,H,'#eef2f5');ctx.restore();}
  // the canopy, greener low down and frosted high up
  for(const c of CANOPY){const h=seg(-c.y,150,2500),col=h<.4?mix('#4f8a3c','#c9a64a',h/.4):h<.7?mix('#c9a64a','#8a6a3e',(h-.4)/.3):mix('#8a6a3e','#e3ebf0',(h-.7)/.3),lite=mix(col,'#ffffff',.18);
    const sy=c.y+rise;if(sy<-300||sy>H+300)continue;poly([c.x-12,c.y+c.r*1.6,c.x+12,c.y+c.r*1.6,c.x+6,c.y,c.x-6,c.y],mix('#3a2a1e','#2b2f36',h));blob(c.x,c.y,c.r,col,6,c.rot,.7);blob(c.x-c.r*.25,c.y-c.r*.15,c.r*.55,lite,6,c.rot+1,.6);}
  ctx.restore();
  snowfall(t,Math.floor(120*cold),{seed:9,speed:80,wind:-40,size:3.5,alpha:.8*cold});
  const x7=seg(t,39.4,40);if(x7>0){ctx.save();ctx.globalAlpha=x7;ravenSky(40,{});ctx.restore();}
});

// ================================================================ 07–08 · Sinfran, the raven of winter
function branch(){
  poly([1960,420,1960,452,1500,474,1100,494,760,512,640,506,760,496,1100,478,1500,456],'#0e1217');
  [[1720,450,-.9,150],[1400,468,-1.2,120],[1180,482,.9,110],[920,496,-1.0,140],[820,500,.7,90]].forEach(([x,y,a,l],i)=>{const e=[x+Math.sin(a)*l,y-Math.cos(a)*l];limb([x,y],e,9,2,'#0e1217');limb([lerp(x,e[0],.5),lerp(y,e[1],.5)],[lerp(x,e[0],.5)-30,lerp(y,e[1],.5)-40],4,1,'#0e1217');});
  poly([1100,478,1300,470,1200,462],'#dfe7ee');poly([1500,456,1700,448,1600,442],'#dfe7ee');
}
function ravenState(t){
  const flaps=[44,46,48];let flap=-.15,fold=1-easeInOut(seg(t,43.45,43.85));
  for(const f of flaps){if(t>f-.45&&t<f+.4){const k=(t-(f-.45))/.85;flap=k<.47?lerp(-.15,-1,easeOut(k/.47)):lerp(-1,1,easeIn((k-.47)/.2))*(k<.67?1:1)-(k>.67?(k-.67)/.33*1.15:0);}}
  if(t>48.6)flap=Math.sin((t-48.6)*7.5)*.9*(1-seg(t,51.4,51.8));
  const path=[[43.5,1000,428],[44.4,985,340],[46.3,950,290],[48.4,900,260],[50.4,1000,400],[52.3,960,600]];
  let x=1000,y=428;for(let i=1;i<path.length;i++)if(t>=path[i-1][0]){const k=easeInOut(seg(t,path[i-1][0],path[i][0]));x=lerp(path[i-1][1],path[i][1],k);y=lerp(path[i-1][2],path[i][2],k);}
  const near=Math.pow(seg(t,48.8,52.7),2.6),s=2*Math.pow(40,near);
  return {x,y:y-(t<43.5?Math.sin(t*2)*2:0),s,flap,fold,look:t<41.8?0:t<43.3?.55*easeInOut(seg(t,41.8,42.5)):.55*(1-seg(t,43.3,43.6)),body:t<43.4?0:-.12*(1-near)};
}
function ravenSky(t,{camY=0}={}){
  const k1=easeOut(seg(t,44.05,44.7)),k2=seg(t,45.9,47),k3=easeInOut(seg(t,48,49));
  grad(0,H,[[0,mix('#e2eaf1','#c3ced8',k1)],[1,mix('#bccbd9','#8c9cad',k1)]]);
  ctx.save();ctx.translate(0,camY);
  ridge(31,700,230,mix('#8ea3b8','#4a5868',k1),mix('#a3b6c8','#5d6c7d',k1),{step:300});
  for(let i=0;i<30;i++)pine(i*70+hash(i)*40-40,790+hash(i*2)*20,90+hash(i*3)*70,mix('#6f8396','#2f3b48',k1),mix('#8597a8','#3d4a58',k1),{seed:i+200});
  ground(800,mix('#dfe7ee','#a9b6c3',k1),{seed:4,amp:8});
  branch();
  ctx.restore();
  if(k2>0)snowfall(t,Math.floor(260*k2),{seed:12,speed:520,wind:-700,size:4,alpha:.9*k2});
  if(k3>0){ctx.save();ctx.globalAlpha=k3*.82;rect(0,0,W,H,'#d9e2ea');ctx.restore();for(let i=0;i<90*k3;i++){const y=hash(i*1.9)*H,x=W-((t*1400+hash(i)*W*2)%(W*2)),l=120+hash(i*3)*420;ctx.save();ctx.globalAlpha=.35*k3;poly([x,y,x+l,y-10,x+l,y-4,x,y+4],'#ffffff');ctx.restore();}}
}
shot(40,55,t=>{
  const camY=60*easeInOut(seg(t,43.6,48.4)),r=ravenState(t);
  if(t<53){ravenSky(t,{camY});raven({x:r.x,y:r.y+camY,s:r.s,face:-1,flap:r.flap,fold:r.fold,look:r.look,body:r.body,perch:r.fold});}
  // after the wing has passed: dark, blowing snow
  const after=seg(t,52.6,53.4);if(after>0){ctx.save();ctx.globalAlpha=after;rect(0,0,W,H,'#151d29');ctx.restore();snowfall(t,220*after,{seed:14,speed:140,wind:-120,size:3.5,alpha:.85*after});}
  if(t>52.2&&t<53.6){const cover=Math.sin(Math.PI*seg(t,52.2,53.6));ctx.save();ctx.globalAlpha=cover;rect(0,0,W,H,'#05070a');ctx.restore();}
  ui(()=>glossaryOverlay(t,{t0:41.2,t1:48.2,x:60,y:80,sentence:'辛弗兰就用它的翅膀扇起寒风，',term:'辛弗兰',cat:'精魂',def:'寒鸦精魂',q:.82,keepTag:false}));
});
shot(55,59,t=>{
  const lt=t-55,warm=easeInOut(seg(lt,.3,1.6));
  rect(0,0,W,H,mix('#151d29','#1d130d',warm));glow(W/2,H*1.05,1100*warm+50,'#ff9a3c',.55*warm);
  for(let i=0;i<180;i++){const z=.4+.6*hash(14+i*2.7),x=((hash(14+i)*W+t*-120*z+Math.sin(t*.8+i)*12)%W+W)%W,y=((hash(14+i*1.31)*H+t*140*z)%H+H)%H,d=Math.hypot(x-W/2,y-H)/1300,c=clamp(warm*1.4-d*.6),s=3.5*z*(1+c*.6);
    const fade=1-seg(lt,2.2,3.6);if(fade<=0)break;ctx.save();ctx.globalAlpha=(.4+.6*z)*.85*fade;if(c>.3)glow(x,y,s*5,'#ff8a2a',.35*c);poly([x,y-s,x+s,y,x,y+s,x-s,y],mix('#ffffff','#ff9a3c',c));ctx.restore();}
  // one spark falls through the centre and lands on the anvil
  const f=easeIn(seg(lt,1.6,4)),fy=lerp(120,690,f),fs=4+f*10;glow(W/2,fy,fs*8,'#ffb050',.7*seg(lt,1.4,1.8));poly([W/2,fy-fs*2,W/2+fs,fy,W/2,fy+fs,W/2-fs,fy],'#fff2c8');
  if(lt>3.85){ctx.save();ctx.globalAlpha=seg(lt,3.85,4);rect(0,0,W,H,'#fff6e2');ctx.restore();}
});

// ================================================================ 09–11 · the forge
const FORGE={wall:'#2b1d15',wall2:'#33231a',wall3:'#24180f',floor:'#1f150f',stone:'#3a2a22',stoneL:'#4a372b',iron:'#1b1714',ironL:'#3a2e26'};
const HAMMERS=P.hammer;
// Hammer lift 0 (on the iron) .. 1 (raised). Havard rests the hammer while he speaks, then strikes once more.
function hammerLift(t){
  if(t<HAMMERS[0])return 1-easeIn(seg(t,HAMMERS[0]-.3,HAMMERS[0]));
  for(let i=0;i<HAMMERS.length;i++){const a=HAMMERS[i],b=HAMMERS[i+1]??Infinity;if(t>=a&&t<b){
    if(a===74.0)return t<75.2?.28*easeOut(seg(t,a,a+.5)):t<81.1?.28*(1-easeInOut(seg(t,75.2,75.7))):easeOut(seg(t,81.1,81.55))*(1-easeIn(seg(t,b-.3,b)));
    return Math.min(easeOut(seg(t,a,a+.55)),1-easeIn(seg(t,b-.3,b)));}}
  return 0;
}
const IRON=[968,738];
function havardForge(t,{sil=0}={}){
  const u=hammerLift(t),s=1.8,hip=[804,905-91*s],H0=[52,-9],H1=[6,-120],bulge=Math.sin(Math.PI*u)*16;
  const hand=[lerp(H0[0],H1[0],u)-bulge,lerp(H0[1],H1[1],u)-bulge*.6],ang=lerp(.08,-2.1,u),look=t>75.6&&t<81?-.38*easeInOut(seg(t,75.7,76.3))*(1-easeInOut(seg(t,80.4,81))):.32;
  human({...POSE,x:hip[0],y:hip[1],s,tor:.3+u*.06,hd:look,hF:hand,hB:[26,-26],fF:[24,85],fB:[-22,85]},STYLE.smith,{hold:(stage,J)=>{if(stage!=='hand')return;const w=J.wF,head=[w[0]+Math.cos(ang)*40,w[1]+Math.sin(ang)*40];limb([w[0]-Math.cos(ang)*6,w[1]-Math.sin(ang)*6],head,4,4,'#5b4030');ctx.save();ctx.translate(head[0],head[1]);ctx.rotate(ang+Math.PI/2);poly([-9,-7,9,-7,10,7,-10,7],'#27231f');poly([-9,-7,9,-7,6,-2,-8,-2],'#4a433b');ctx.restore();}});
}
function rigaForge(t){
  const s=1.5,hip=[1150,905-91*s],look=.55+.12*Math.sin(t*.9)+(t>71?.15:0);
  human({...POSE,x:hip[0],y:hip[1],s,face:-1,tor:.12,hd:look,hF:[46,-24],hB:[30,-20],fF:[14,85],fB:[-10,85]},STYLE.boy,{hold:(stage,J)=>{if(stage!=='front')return;const w=J.wF;limb(w,[w[0]+48,w[1]+4],4,3,'#2a2420');limb([w[0],w[1]+4],[w[0]+46,w[1]+10],4,3,'#2a2420');}});
}
function forgeWorld(t,{hide=false}={}){
  rect(-1200,-900,4400,3000,FORGE.wall);
  for(let i=0;i<26;i++){const x=-600+i*130,y=-500+(i%3)*40;poly([x,y,x+120,y+20,x+110,1000,x-10,980],i%2?FORGE.wall2:FORGE.wall3);}
  poly([-600,-260,2600,-300,2600,-240,-600,-200],'#1a110b');poly([-600,180,2600,150,2600,190,-600,220],'#1a110b');
  // tools on the wall
  [[1400,300],[1470,320],[1540,290],[1610,330]].forEach(([x,y],i)=>{limb([x,y],[x+(i%2?14:-10),y+180],6,5,'#140d09');poly([x-16,y+170,x+20,y+170,x+22,y+196,x-18,y+196],'#140d09');});
  // the furnace
  const fl=.85+.15*noise(t*6),fx=440,fy=650;
  poly([200,905,220,520,320,440,560,440,660,520,690,905],FORGE.stone);poly([220,520,320,440,440,440,360,560,240,905,200,905],FORGE.stoneL);
  poly([300,440,340,-200,540,-200,580,440],'#2e2019');
  poly([320,760,350,640,430,600,530,610,580,700,570,780],'#140b06');
  glow(fx,fy+40,520*fl,'#ff7a1e',.55);
  for(let i=0;i<7;i++){const h=60+70*noise(t*3+i*1.7),x=360+i*30;poly([x-18,780,x,780-h,x+16,780],i%2?'#ff8a2a':'#ffc85a');}
  poly([360,780,560,780,540,800,380,800],'#ffdd8a');
  // floor
  poly([-600,905,2600,905,2600,1600,-600,1600],FORGE.floor);for(let i=0;i<14;i++){const x=-200+i*180;poly([x,905,x+170,905,x+140,980,x-30,990],i%2?'#24190f':'#1a120c');}
  glow(IRON[0],IRON[1],420,'#ff9a3c',.25);
  // anvil on its stump
  poly([900,905,912,800,1020,800,1034,905],'#2a1c12');poly([900,905,912,800,950,800,940,905],'#3a281a');
  poly([870,742,1070,742,1066,770,1030,780,1010,800,920,800,906,780,876,770],FORGE.iron);poly([870,742,1070,742,1060,752,880,752],FORGE.ironL);poly([870,742,800,748,870,764],FORGE.iron);
  if(!hide){rigaForge(t);havardForge(t);}
  // the iron, white-hot when struck and cooling between blows
  let heat=.6;for(const h of HAMMERS)if(t>=h)heat=Math.max(.55,1-(t-h)*.18);
  glow(IRON[0],IRON[1]-4,80,'#ffd27a',.6*heat);poly([IRON[0]-46,IRON[1]-10,IRON[0]+52,IRON[1]-12,IRON[0]+54,IRON[1]+1,IRON[0]-48,IRON[1]+2],mix('#ff7a2a','#fff6d8',heat));
  for(const h of HAMMERS)sparkBurst(t,h,IRON[0]+20,IRON[1]-8,{seed:h*10,scale:1});
}
function withCam(cx,cy,z,draw,rot=0){ctx.save();ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.rotate(rot);ctx.translate(-cx,-cy);draw();ctx.restore();}
// Close-ups of the first two blows: a heavy hand, the hammer and the white iron.
function closeBlow(t,strike,{mirror=1,tilt=0,zoom=1}={}){
  const lt=t-strike,u=lt<0?1-easeIn(seg(lt,-.28,0)):easeOut(seg(lt,0,.6))*(lt<2.9?1:1),hit=lt>=0&&lt<.12;
  ctx.save();ctx.translate(W/2,H/2);ctx.rotate(tilt);ctx.scale(zoom*mirror,zoom);ctx.translate(-W/2,-H/2);if(hit){ctx.translate((Math.random?0:0)+Math.sin(lt*90)*6,Math.cos(lt*80)*5);}
  rect(-400,-400,W+800,H+800,'#24170f');glow(200,900,900,'#ff7a1e',.35);
  poly([-300,690,W+300,690,W+300,H+400,-300,H+400],FORGE.iron);poly([-300,690,W+300,690,W+300,712,-300,712],'#4a3a2e');poly([-300,712,W+300,712,W+300,760,-300,760],'#231c17');
  let heat=lt<0?.75:Math.max(.6,1-lt*.12);glow(W/2,680,320,'#ffd27a',.55*heat);poly([560,690,1380,690,1390,640,1340,628,600,632,548,650],mix('#ff7a2a','#fff6d8',heat));poly([600,632,1340,628,1300,646,640,650],mix('#ffb060','#ffffff',heat));
  const ang=lerp(.0,-.9,u),hx=lerp(940,1060,u),hy=lerp(500,-260,u);
  ctx.save();ctx.translate(hx,hy);ctx.rotate(ang);
  limb([90,0],[900,-40],70,64,'#5b4030');poly([90,-30,900,-70,900,-40,90,-8],'#6e5038');
  poly([-200,-140,140,-150,150,130,-210,130],'#2a2622');poly([-200,-140,140,-150,120,-100,-180,-96],'#4a433b');poly([-210,130,150,130,140,96,-200,92],'#1a1714');
  ctx.translate(560,-28);ctx.rotate(Math.PI/2);ctx.scale(7.2,7.2);fist(STYLE.smith.skin,.45);
  ctx.restore();
  if(hit){ctx.save();ctx.globalAlpha=1-lt/.12;rect(-400,-400,W+800,H+800,'#fff2d0');ctx.restore();}
  sparkBurst(t,strike,W/2+30,640,{seed:strike*7,scale:2.3,n:70});
  ctx.restore();
}
shot(59,71,t=>{
  if(t<62.6)closeBlow(t,59);
  else if(t<66.2)closeBlow(t,62.6,{mirror:-1,tilt:.1,zoom:1.25});
  else{const k=easeInOut(seg(t,66.35,68.8)),z=lerp(3.4,1.45,k);withCam(lerp(IRON[0],970,k),lerp(IRON[1]-30,690,k),z,()=>forgeWorld(t));}
  const lt=t-59;
});
const REL={x:520,y:70,w:880,h:290};
function relationOverlay(t){
  const a=seg(t,71.6,72.1)*(1-seg(t,81.3,81.8));if(a<=0)return;
  glass(REL.x,REL.y,REL.w,REL.h,a);ctx.save();ctx.globalAlpha*=a;
  text('人物关系.pcs',REL.x+28,REL.y+40,{size:17,weight:700,color:UI.text});chip(REL.x+164,REL.y+16,'关系图',{size:14});text('炉火祈愿',REL.x+REL.w-28,REL.y+40,{size:15,color:UI.muted,align:'right'});
  ctx.fillStyle=UI.line;ctx.fillRect(REL.x+20,REL.y+60,REL.w-40,1);
  const node=(x,y,name,role,col,p)=>{if(p<=0)return;ctx.save();ctx.globalAlpha*=clamp(p*1.4);ctx.translate(x,y);const s=back(p);ctx.scale(s,s);fillRR(-110,-38,220,76,16,'#22322a');strokeRR(-110,-38,220,76,16,col,1.6);
    ctx.beginPath();ctx.arc(-70,0,22,0,TAU);ctx.fillStyle=col;ctx.fill();text(name[0],-70,8,{size:22,weight:700,color:'#10241a',align:'center'});text(name,-38,-2,{size:22,weight:700,color:UI.text});text(role,-38,24,{size:14,color:UI.muted});ctx.restore();};
  const L=[REL.x+200,REL.y+170],R=[REL.x+REL.w-200,REL.y+170];
  const e=easeInOut(seg(t,73.6,74.8));if(e>0){const x0=L[0]+112,x1=lerp(x0,R[0]-114,e);ctx.strokeStyle=UI.accent;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(x0,L[1]);ctx.lineTo(x1,R[1]);ctx.stroke();if(e>.95)poly([x1+2,R[1],x1-14,R[1]-8,x1-14,R[1]+8],UI.accent);}
  const lp=easeOut(seg(t,74.8,75.3));if(lp>0){const lw=measure('抚养与照料',18,600)+36,mx=(L[0]+R[0])/2;ctx.save();ctx.globalAlpha*=lp;fillRR(mx-lw/2,L[1]-20-(1-lp)*10,lw,40,20,UI.tint);text('抚养与照料',mx,L[1]+7-(1-lp)*10,{size:18,weight:600,color:UI.accent,align:'center'});ctx.restore();}
  node(R[0],R[1],'里加','人物 · 萨卡莱特','#8ad0a8',seg(t,72.0,72.5));node(L[0],L[1],'哈沃德','人物 · 铁匠','#e5c27d',seg(t,72.8,73.3));
  ctx.restore();
}
shot(71,82,t=>{
  const k=easeInOut(seg(t,71,82));withCam(lerp(970,1010,k),lerp(690,575,easeInOut(seg(t,71,73.5))),lerp(1.45,1.5,k),()=>forgeWorld(t));
  ui(()=>relationOverlay(t));
});
shot(82,87,t=>{
  const lt=t-82,winter=easeInOut(seg(t,85,86.8));
  rect(0,0,W,H,mix('#1d140e','#d9dfe4',winter));
  for(let i=0;i<16;i++){const x=i*140-60+hash(i)*60,y=200+hash(i*2)*700,r=90+hash(i*3)*90;ctx.save();ctx.globalAlpha=1-winter;blob(x,y,r,i%2?'#24190f':'#170f0a',6,i,.6);ctx.restore();}
  glow(W/2,H/2,700,'#ff7a1e',.2*(1-seg(lt,.5,2.2)));
  // the last spark: lands, reddens, greys out
  const land=easeIn(seg(lt,0,.4)),sx=W/2+(1-land)*-160,sy=lerp(-40,560,land),c=seg(lt,.4,2.0),col=c<.3?mix('#fff2c8','#ff8a2a',c/.3):c<.7?mix('#ff8a2a','#8a1e10',(c-.3)/.4):mix('#8a1e10','#2a2622',(c-.7)/.3),r=9-c*2;
  if(lt<2.4){glow(sx,sy,90*(1-c),'#ff9a3c',.7*(1-c));blob(sx,sy,r,col,6,1);}
  // a white point grows into a snowflake
  const f=easeOut(seg(lt,2.2,3.6));if(f>0){ctx.save();ctx.translate(W/2,560);ctx.rotate(lt*.3);ctx.globalAlpha=1-seg(lt,4.2,5);const R=8+f*90;
    for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*TAU/6);poly([-4,0,0,-R,4,0],'#ffffff');poly([0,-R*.55,-R*.22,-R*.78,-R*.18,-R*.82,0,-R*.62],'#e9f1f8');poly([0,-R*.55,R*.22,-R*.78,R*.18,-R*.82,0,-R*.62],'#e9f1f8');ctx.restore();}blob(0,0,6+f*6,'#ffffff',6);ctx.restore();}
  const into=seg(t,85.6,87);if(into>0){ctx.save();ctx.globalAlpha=into;roadShot(t);ctx.restore();}
});

// ================================================================ 12–18 · the road out of Sakalet
const ROAD_Y=860,GROUND_Y=640;
const WALK=P.walk; // [start, stop, strides per second]
const HORSE_S=1.05,STRIDE_WALK=150*HORSE_S;
const walkX=t=>-260+STRIDE_WALK*WALK[2]*(clamp(t,WALK[0],WALK[1])-WALK[0]);
// Distance covered at the gallop, integrated once from the shared rate curve.
const RIDE=(()=>{const a=[],dt=1/120;let x=0;for(let t=128;t<=162;t+=dt){a.push(x);const r=gallopRate(t),len=lerp(150,340,clamp((r-1)/1.1))*HORSE_S;x+=r*len*dt;}return a;})();
const rideX=t=>walkX(WALK[1])+RIDE[clamp(Math.floor((t-128)*120),0,RIDE.length-1)];
function trunkRow(cam,f,baseY,{seed=0,sp=170,col='#2b2f36',lite='#3a3f47',h=700,w=26,dark=0}={}){
  const ox=(cam.x-960)*f,i0=Math.floor((ox-300)/sp)-2,i1=Math.ceil((ox+W+300)/sp)+2;
  for(let i=i0;i<=i1;i++){const x=i*sp+hash(seed+i)*sp*.7-ox,ww=w*(.7+.6*hash(seed+i*2)),hh=h*(.8+.4*hash(seed+i*3)),y=baseY+hash(seed+i*5)*16;
    poly([x-ww/2,y+4,x+ww/2,y+4,x+ww*.3,y-hh,x-ww*.3,y-hh],mix(col,'#000000',dark));poly([x-ww/2,y+4,x-ww*.1,y+4,x-ww*.05,y-hh,x-ww*.3,y-hh],mix(lite,'#000000',dark));
    for(let b=0;b<3;b++){const by=y-hh*(.45+.18*b),dir=hash(seed+i*7+b)>.5?1:-1;limb([x,by],[x+dir*(40+hash(i+b)*50),by-30-hash(i*b)*30],5,1.5,mix(col,'#000000',dark));}
    if(hash(seed+i*9)>.35)pine(x,y-hh*.55,hh*.75,mix('#323a43','#000000',dark),mix('#414a54','#000000',dark),{seed:seed+i,trunk:'rgba(0,0,0,0)'});}
}
function roadWorld(t,cam,{dark=0,forest=0,cloud=0}={}){
  withTint('#0a0d12',dark,()=>{
    const sky=mix('#dfe4e9','#c6cdd4',cloud);grad(0,GROUND_Y+80,[[0,mix('#d6dce2','#b5bec7',cloud)],[1,mix('#eef1f3',sky,.5)]]);
    const sun=[1460-(cam.x-960)*.02,230];glow(sun[0],sun[1],380,'#fffaf0',.7*(1-cloud*.8));blob(sun[0],sun[1],58,mix('#f8f5ec','#d9dde1',cloud),12);
    for(let i=0;i<6;i++){const x=((i*480+t*(i%2?14:9)-(cam.x-960)*.03-(t>88&&t<91.5?0:0))%2800+2800)%2800-500,y=140+i*40,w=520+hash(i)*300,c=mix('#c9d0d7','#a9b2bc',cloud);poly([x,y,x+w*.3,y-30,x+w*.7,y-26,x+w,y+10,x+w*.8,y+28,x+w*.1,y+26],c);}
    // clouds sliding over the sun
    const cv=easeInOut(seg(t,88.4,91.2));if(cv>0&&cv<1.5){const x=lerp(2100,1150,cv);poly([x,150,x+260,110,x+560,130,x+680,220,x+520,300,x+120,290,x-60,230],'#aeb7c0');poly([x,150,x+260,110,x+300,170,x+40,220],'#bcc4cc');}
    ridge(41,GROUND_Y,120,'#a7b1bb','#b9c2ca',{off:(cam.x-960)*.08,step:300});
    trunkRow(cam,.22,GROUND_Y+20,{seed:3,sp:70,col:'#7d8893',lite:'#8b959f',h:150,w:8});
    fogBand(GROUND_Y-60,GROUND_Y+60,'#eef1f3',.7);
    ctx.save();ctx.translate(W/2,H/2);const z=cam.z,zf=1+(z-1)*.6;ctx.scale(zf,zf);ctx.translate(-960-(cam.x-960)*.55,-540-(cam.y-540)*.55);
    ground(GROUND_Y+10,'#e7ebee',{off:0,amp:6,seed:2});
    trunkRow({x:960},0,GROUND_Y+120,{seed:7,sp:forest>0?95:150,col:'#2d3138',lite:'#3c4149',h:560,w:22});
    ctx.restore();
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-cam.x,-cam.y);
    const x0=cam.x-W/z,x1=cam.x+W/z;
    poly([x0-200,GROUND_Y+150,x1+200,GROUND_Y+150,x1+200,1400,x0-200,1400],'#eef1f3');
    poly([x0-200,ROAD_Y-26,x1+200,ROAD_Y-26,x1+200,ROAD_Y+30,x0-200,ROAD_Y+30],'#dde3e8');
    poly([x0-200,ROAD_Y-8,x1+200,ROAD_Y-8,x1+200,ROAD_Y-2,x0-200,ROAD_Y-2],'#cfd6dc');poly([x0-200,ROAD_Y+12,x1+200,ROAD_Y+12,x1+200,ROAD_Y+18,x0-200,ROAD_Y+18],'#cfd6dc');
    poly([1180,ROAD_Y-26,1300,ROAD_Y-26,1640,GROUND_Y+152,1600,GROUND_Y+150],'#dde3e8');
    footprints(t);
    if(forest>0)trunkRow({x:cam.x},1,ROAD_Y+180,{seed:21,sp:420,col:'#22262c',lite:'#2d3239',h:900,w:46,dark:0});
    ctx.restore();
  });
}
// Hoof prints and boot prints left on the road while walking.
function footprints(t){
  if(t<WALK[0])return;const rate=WALK[2],end=Math.min(t,WALK[1]),phase=(end-WALK[0])*rate;
  for(let k=0;k<phase+1;k++)GAIT_OFF[1].forEach((off,i)=>{const ph=k+off;if(ph>phase)return;const tc=WALK[0]+ph/rate,x=walkX(tc)+[-62,-58,58,62][i]*HORSE_S+20,y=ROAD_Y+(i%2?-10:8);ctx.save();ctx.translate(x,y);ctx.scale(1,.45);ctx.beginPath();ctx.arc(0,0,9,Math.PI*.15,Math.PI*1.85);ctx.strokeStyle=tint('#a7b2bc');ctx.lineWidth=4;ctx.stroke();ctx.restore();});
  for(let k=0;k<phase*2+1;k++){const ph=k/2;if(ph>phase)break;const tc=WALK[0]+ph/rate,x=walkX(tc)+230+(k%2?14:-6),y=ROAD_Y+(k%2?-14:4);blob(x,y,9,'#a3aeb8',6,0,.4);}
}
// Where everyone is on the road at time t.
function roadCast(t){
  const hx=t<128?walkX(t):rideX(t),walking=t>=WALK[0]&&t<WALK[1];
  const rate=t>=128?gallopRate(t):walking?WALK[2]:0,gait=t>=128?(rate<1.35?(rate>0?1:0):2):walking?1:0,phase=t>=128?gallopPhase(t):(clamp(t,WALK[0],WALK[1])-WALK[0])*WALK[2];
  return {hx,gait,phase,rate};
}
function rider(t,seat,{tor=.08,hd=0,hands=[36,-14],sil=0}={}){
  human({...POSE,x:seat.x,y:seat.y,s:1.02,tor,hd,hF:hands,hB:[hands[0]-6,hands[1]+2],fF:[18,60],fB:[12,60],ftF:.3,ftB:.3,cape:tor},STYLE.boy,{sil});
}
function roadShot(t){
  const c=roadCast(t),cam=roadCam(t),cloud=easeInOut(seg(t,88.4,91.4))*.9;
  roadWorld(t,cam,{cloud});
  withCam(cam.x,cam.y,cam.z,()=>withTint('#3a434d',cloud*.15,()=>{
    const seat=horse({x:c.hx,y:ROAD_Y+6,s:HORSE_S,gait:c.gait,phase:c.phase,neck:c.gait?Math.sin(TAU*c.phase*2)*.03:.04,tail:t});
    // reins from the bit to Havard's hand, or slack once he lets go
    rider(t,seat,{hd:t>92.4?-.08:0});
    const hv=havardRoad(t,c,seat);
    ctx.strokeStyle=tint('#2a1d16');ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(seat.mouth[0],seat.mouth[1]);if(hv.holding)ctx.quadraticCurveTo((seat.mouth[0]+hv.hand[0])/2,Math.max(seat.mouth[1],hv.hand[1])+20,hv.hand[0],hv.hand[1]);else ctx.quadraticCurveTo(seat.mouth[0]-50,seat.mouth[1]+60,seat.x+38,seat.y-14);ctx.stroke();
  }));
}
function roadCam(t){const k=easeInOut(seg(t,87,98));return {x:lerp(760,walkX(WALK[1])+110,k),y:lerp(600,700,k),z:lerp(1.1,1.55,k)};}
function havardRoad(t,c,seat){
  const s=1.1,x=t<WALK[1]?walkX(t)+232:walkX(WALK[1])+232,y=ROAD_Y+8-91*s,walking=t<WALK[1];
  const face=t<92.25?1:t<92.55?Math.cos(Math.PI*seg(t,92.25,92.55)):-1;
  const pose=walking?walkPose((t-WALK[0])*WALK[2]*2):{tor:.02,hF:[10,-10],hB:[-2,-14],fF:[8,85],fB:[-6,85]};
  const hand=[x+(walking?-6:4)*s*Math.sign(face||1),y-12*s];
  human({...POSE,...pose,x,y,s,face:Math.abs(face)<.05?.05*Math.sign(face||1):face,hd:t>92.6?-.42*easeInOut(seg(t,92.6,93.2)):.05,hB:walking?[-18,-24]:pose.hB},STYLE.smithCoat);
  return {holding:walking||t<92.15,hand:[x-18*s,y-22*s]};
}
shot(87,98,t=>roadShot(t));
// The map Havard describes, drawn on the scene as a VLMP map: places, road, forests and rivers ink themselves in.
const PLACES=[['萨卡莱特',430,250,()=>99.7],['艾洛夫',820,420,()=>cue('11','Elof')],['盎讷',1170,330,()=>cue('11','Angne')],['海尔加德',1540,560,()=>cue('11','Helgard')]];
function mapLayer(t,a){
  if(a<=0)return;const ink='#4f3f2c';ctx.save();ctx.globalAlpha=a;
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#ece3cc');g.addColorStop(.78,'#e6dcc2');g.addColorStop(.86,'rgba(230,220,194,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=rgba(ink,.6);ctx.lineWidth=2;ctx.strokeRect(36,30,W-72,H-180);ctx.lineWidth=1;ctx.strokeRect(46,40,W-92,H-200);
  const rv=easeInOut(seg(t,99.2,101.2));if(rv>0){ctx.save();ctx.strokeStyle='#5d7a8c';ctx.lineWidth=5;ctx.lineCap='round';ctx.setLineDash([2400*rv,2400]);ctx.beginPath();ctx.moveTo(1220,880);ctx.bezierCurveTo(1460,700,1380,500,1600,380);ctx.bezierCurveTo(1760,290,1700,160,1880,60);ctx.stroke();ctx.restore();text('柯戈德河',1650,300,{size:22,color:'#5d7a8c',font:SERIF,a:rv,spacing:6});}
  // mountains of Insesen
  for(let i=0;i<9;i++){const p=easeOut(seg(t,99.8+i*.1,100.4+i*.1));if(p<=0)continue;const x=140+i*70+(i%2)*20,y=170+(i%3)*24,h=60*p;poly([x-38,y,x,y-h,x+38,y],rgba(ink,.18));poly([x-38,y,x,y-h,x-6,y],rgba(ink,.35));ctx.strokeStyle=rgba(ink,.8);ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-38,y);ctx.lineTo(x,y-h);ctx.lineTo(x+38,y);ctx.stroke();}
  text('因舍森',300,110,{size:22,color:ink,font:SERIF,a:seg(t,100.6,101.2),spacing:6});
  // forests: small low-poly trees
  [[640,600,9],[1000,560,8],[1250,200,7],[300,480,8],[1360,700,6]].forEach(([fx,fy,n],j)=>{for(let i=0;i<n;i++){const p=easeOut(seg(t,100.2+j*.3+i*.05,100.6+j*.3+i*.05));if(p<=0)continue;const x=fx+(hash(j*20+i)-.5)*180,y=fy+(hash(j*20+i*3)-.5)*90,h=34*p;poly([x-11,y,x,y-h,x+11,y],'#3f5e3a');poly([x-11,y,x,y-h,x-2,y],'#58784c');}});
  text('瑞达内',960,520,{size:64,color:rgba(ink,.16),font:SERIF,align:'center',a:seg(t,100,101.5),spacing:30});
  // compass
  ctx.save();ctx.globalAlpha*=seg(t,100.5,101.5);ctx.translate(1760,170);poly([0,-60,10,0,0,60,-10,0],rgba(ink,.7));poly([-50,0,0,-8,50,0,0,8],rgba(ink,.4));text('北',0,-70,{size:18,color:ink,font:SERIF,align:'center'});ctx.restore();
  // the road, inked from place to place as they are named
  const pts=PLACES.map(p=>[p[1],p[2]]);
  for(let i=1;i<pts.length;i++){const p=easeInOut(seg(t,PLACES[i][3]()-1.1,PLACES[i][3]()-.1));if(p<=0)continue;const [ax,ay]=pts[i-1],[bx,by]=pts[i],mx=(ax+bx)/2+(i%2?-40:40),my=(ay+by)/2+(i%2?60:-50);
    ctx.save();ctx.strokeStyle='#8a5a32';ctx.lineWidth=4;ctx.setLineDash([14,10]);ctx.beginPath();const N=40;for(let k=0;k<=N*p;k++){const u=k/N,x=(1-u)*(1-u)*ax+2*(1-u)*u*mx+u*u*bx,y=(1-u)*(1-u)*ay+2*(1-u)*u*my+u*u*by;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.restore();}
  PLACES.forEach(([name,x,y,at],i)=>{const p=seg(t,at(),at()+.45);if(p<=0)return;const s=back(p);
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);for(let k=0;k<3;k++){const hx=-30+k*22,hy=k===1?-8:0;poly([hx-10,hy,hx-10,hy-16,hx,hy-26,hx+10,hy-16,hx+10,hy],rgba(ink,.85));}
    ctx.beginPath();ctx.arc(0,24,9,0,TAU);ctx.fillStyle=UI.deep;ctx.fill();ctx.strokeStyle='#f4efe2';ctx.lineWidth=3;ctx.stroke();ctx.restore();
    text(name,x,y+68,{size:34,weight:700,color:ink,font:SERIF,align:'center',a:clamp(p*1.5),spacing:4});});
  ctx.restore();
}
function mapToolbar(t){
  const a=seg(t,100,100.5)*(1-seg(t,105.4,106));if(a<=0)return;const items=['绘制点','信息点','箭头','元素','边界'],w=640,x=W/2-w/2,y=24+(1-a)*-20;
  glass(x,y,w,60,a,16);ctx.save();ctx.globalAlpha*=a;text('瑞达内.vlmp',x+24,y+38,{size:16,color:UI.muted});
  items.forEach((l,i)=>{const ix=x+160+i*94;if(i===1)fillRR(ix-8,y+11,86,38,10,UI.tint);ctx.save();ctx.translate(ix+10,y+30);ctx.strokeStyle=i===1?UI.accent:UI.muted;ctx.lineWidth=2;ctx.beginPath();if(i===1){ctx.arc(0,-3,6,0,TAU);ctx.moveTo(0,3);ctx.lineTo(0,10);}else if(i===2){ctx.moveTo(-7,7);ctx.lineTo(7,-7);ctx.lineTo(1,-7);ctx.moveTo(7,-7);ctx.lineTo(7,-1);}else ctx.rect(-6,-6,12,12);ctx.stroke();ctx.restore();text(l,ix+24,y+36,{size:16,color:i===1?UI.accent:UI.text});});
  ctx.restore();
}
function mapCursor(t){
  const stops=PLACES.map(([,x,y,at])=>[at(),x,y+24]);if(t<99.2||t>stops[3][0]+1.2)return;let x=W*.6,y=H*.5;
  for(let i=0;i<stops.length;i++){const [at,sx,sy]=stops[i],prev=i?stops[i-1]:[99.2,W*.6,H*.5];if(t>=prev[0])({x,y}={x:lerp(prev[1],sx,easeInOut(seg(t,Math.max(prev[0],at-1.2),at-.05))),y:lerp(prev[2],sy,easeInOut(seg(t,Math.max(prev[0],at-1.2),at-.05)))});}
  const press=Math.max(...stops.map(([at])=>1-Math.min(1,Math.abs(t-at)/.15)));cursor(x+4,y+4,seg(t,99.2,99.6)*(1-seg(t,stops[3][0]+.6,stops[3][0]+1.2)),Math.max(0,press));
}
function mapCast(t,{points=0}={}){
  // Havard and Riga stay in front of the map; the camera eases back so the map takes the frame.
  const c=roadCast(t),k=easeInOut(seg(t,98.6,101.2))*(1-easeInOut(seg(t,115.8,117.6))),base=roadCam(98),cam={x:lerp(base.x,base.x+120,k),y:lerp(base.y,base.y-250,k),z:lerp(base.z,.95,k)};
  return {c,cam};
}
shot(98,116,t=>{
  const {c,cam}=mapCast(t),m=easeInOut(seg(t,98.8,100.4));
  ctx.save();ctx.translate(W/2,H*.8);ctx.scale(1,1-m*.08);ctx.translate(-W/2,-H*.8);roadWorld(t,cam,{cloud:.9});ctx.restore();
  mapLayer(t,m);
  withCam(cam.x,cam.y,cam.z,()=>withTint('#3a434d',.14,()=>{
    const seat=horse({x:c.hx,y:ROAD_Y+6,s:HORSE_S,neck:.04,tail:t*.7});rider(t,seat,{hd:-.12*easeInOut(seg(t,98.6,99.3))});
    const s=1.1,x=walkX(WALK[1])+232,y=ROAD_Y+8-91*s,face=t<98.1?-1:t<98.4?-Math.cos(Math.PI*seg(t,98.1,98.4)):1,pt=easeInOut(seg(t,98.4,99.1))*(1-easeInOut(seg(t,113.6,114.4)));
    human({...POSE,x,y,s,face:Math.abs(face)<.05?.05:face,tor:.02,hd:-.2*pt,hF:[lerp(10,62,pt),lerp(-10,-84,pt)],hB:[-2,-14],fF:[8,85],fB:[-6,85]},STYLE.smithCoat);
    ctx.strokeStyle=tint('#2a1d16');ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(seat.mouth[0],seat.mouth[1]);ctx.quadraticCurveTo(seat.mouth[0]-50,seat.mouth[1]+60,seat.x+38,seat.y-14);ctx.stroke();
  }));
  ui(()=>{mapToolbar(t);mapCursor(t);});
});
// 14 · the embrace
function hugCast(t){
  const s=1.1,hvx=walkX(WALK[1])+232,gy=ROAD_Y+8,seatX=walkX(WALK[1])+HORSE_SEAT[0]*HORSE_S,seatY=ROAD_Y+6+HORSE_SEAT[1]*HORSE_S;
  const jump=easeInOut(seg(t,117.6,118.4)),step=easeInOut(seg(t,118.8,119.7)),back=easeInOut(seg(t,123,123.5));
  const groundHip=gy-91*1.02;let rx=lerp(seatX,seatX+90,jump),ry=lerp(seatY,groundHip,jump)-Math.sin(Math.PI*jump)*40;
  if(t>118.4)rx=lerp(seatX+90,hvx-46,step)-back*24;
  if(t>127.4){const m=easeInOut(seg(t,127.4,128.3)),j=easeInOut(seg(t,128.3,129.2));rx=lerp(hvx-70,seatX+80,m);if(t>128.3){rx=lerp(seatX+80,seatX,j);ry=lerp(groundHip,seatY,j)-Math.sin(Math.PI*j)*50;}}
  return {s,hvx,gy,rx,ry,seated:t<117.6||t>129.2,jump,step};
}
function hugScene(t,cam){
  const h=hugCast(t),c=roadCast(Math.min(t,128)),seat=horse({x:walkX(WALK[1]),y:ROAD_Y+6,s:HORSE_S,neck:.04,tail:t*.7});
  const land=seg(t,118.35,118.9);if(land>0&&land<1)for(let i=0;i<8;i++){ctx.save();ctx.globalAlpha=(1-land)*.7;blob(h.rx+(i-4)*12*(1+land*2),h.gy-land*30*hash(i),8+land*10,'#f4f6f8',6,i);ctx.restore();}
  const hug=easeInOut(seg(t,119.6,120.3))*(1-easeInOut(seg(t,122.9,123.4))),hold=easeInOut(seg(t,120.9,121.5))*(1-easeInOut(seg(t,122.9,123.4))),pat=Math.max(0,Math.sin((t-122.2)*TAU*2.2))*(t>122.2&&t<122.9?1:0);
  const look=t>123.1?-.55*easeInOut(seg(t,123.1,123.6))*(1-easeInOut(seg(t,126.2,126.8))):0;
  const havard={...POSE,x:h.hvx,y:h.gy-91*h.s,s:h.s,face:-1,tor:.02+hold*.08,hd:look+hold*.25,hF:[lerp(10,40,hold),lerp(-10,-48,hold)-pat*6],hB:[lerp(-2,30,hold),lerp(-14,-40,hold)],fF:[8,85],fB:[-6,85]};
  const walking=t>118.8&&t<119.7||t>127.4&&t<128.3;
  const riga={...POSE,...(walking?walkPose((t-118.8)*2.2,.7):{}),x:h.rx,y:h.ry,s:1.02,face:t>127.4?-1:1,tor:.04+hug*.12,hd:hug*.35,hF:[lerp(12,46,hug),lerp(-14,-46,hug)],hB:[lerp(4,40,hug),lerp(-14,-40,hug)],fF:walking?walkPose((t-118.8)*2.2,.7).fF:[8,85],fB:walking?walkPose((t-118.8)*2.2,.7).fB:[-6,85]};
  if(h.seated){rider(t,{x:h.rx,y:h.ry});human(havard,STYLE.smithCoat);return;}
  if(t>128.3&&t<129.2){const j=seg(t,128.3,129.2);Object.assign(riga,{face:1,fF:[lerp(8,18,j),lerp(82,60,j)],fB:[lerp(-6,12,j),lerp(82,60,j)],hF:[36,-14]});}
  human(havard,STYLE.smithCoat,{parts:'body'});human(riga,STYLE.boy,{parts:'body'});human(havard,STYLE.smithCoat,{parts:'arm'});human(riga,STYLE.boy,{parts:'arm'});
}
shot(116,128,t=>{
  const base=roadCam(98),h=hugCast(t),k=easeInOut(seg(t,116.5,127.5)),cam={x:lerp(base.x,h.hvx-60,k),y:lerp(base.y,h.gy-150,k),z:lerp(base.z,1.75,k)};
  const map=1-easeInOut(seg(t,116,117.4));
  roadWorld(t,cam,{cloud:.9});
  if(map>0){mapLayer(115.9,map);}
  withCam(cam.x,cam.y,cam.z,()=>withTint('#2f363e',.22,()=>hugScene(t,cam)));
  snowfall(t,90,{seed:31,speed:40,wind:-14,size:2.6,alpha:.8});
});
// 15–18 · the gallop
function rideCam(t){
  const h=hugCast(127.9),base={x:h.hvx-60,y:h.gy-150,z:1.75},wide={x:h.hvx-140,y:620,z:1.12},c=roadCast(t);
  const toWide=easeInOut(seg(t,128,129.4)),track=easeInOut(seg(t,130.2,133.2)),rel=easeInOut(seg(t,152.4,156.2));
  let cam={x:lerp(base.x,wide.x,toWide),y:lerp(base.y,wide.y,toWide),z:lerp(base.z,wide.z,toWide)};
  const tz=1.45,tx=c.hx+(W/2-480)/tz,ty=650;cam.x=lerp(cam.x,tx,track);cam.y=lerp(cam.y,ty,track);cam.z=lerp(cam.z,tz,track);
  if(t>152.4){const o=(W/2-480)/1.45,frozen=rideX(152.4)+o;cam.x=lerp(c.hx+o,frozen+(c.hx-rideX(152.4))*.82,rel);}
  return cam;
}
function galloper(t,{sil=0}={}){
  const c=roadCast(t),lean=easeInOut(seg(t,131.8,132.6)),kick=t>129.4&&t<129.8?Math.sin(Math.PI*seg(t,129.4,129.8)):0;
  const seat=horse({x:c.hx,y:ROAD_Y+6,s:HORSE_S,gait:c.gait,phase:c.phase,neck:c.gait===2?.12+Math.sin(TAU*c.phase)*.06:.04,tail:t,sil,silCol:'#000000'});
  const h=hugCast(t);if(t<129.2){return;}
  human({...POSE,x:seat.x,y:seat.y,s:1.02,tor:lerp(.08,.85,lean),hd:lerp(0,-.5,lean),hF:[lerp(36,46,lean),lerp(-14,-2,lean)],hB:[lerp(30,40,lean),lerp(-12,0,lean)],fF:[18-kick*10,60],fB:[12,60],ftF:.3,ftB:.3,cape:lean+(c.gait===2?.4:0)},STYLE.boy,{sil,silCol:'#000000'});
  if(c.gait===2&&sil<.9)for(let i=0;i<10;i++){const age=((c.phase*2+i/10)%1),x=c.hx-80-age*160,y=ROAD_Y+4-age*40*hash(i)+age*age*30;ctx.save();ctx.globalAlpha=(1-age)*.6;blob(x,y,5+age*12,'#f4f6f8',6,i);ctx.restore();}
}
function havardWatching(t){
  const h=hugCast(t),s=h.s*lerp(1,.94,easeInOut(seg(t,128,129.4))),y=h.gy-lerp(0,26,easeInOut(seg(t,128,129.4)))-91*s;
  human({...POSE,x:h.hvx+lerp(0,40,seg(t,128,129.4)),y,s,face:-1,tor:.02,hd:-.32,hF:[10,-10],hB:[-2,-14],fF:[8,85],fB:[-6,85]},STYLE.smithCoat);
}
const OUTLINE=[['炉火祈愿 · 第一部',0],['序章 · 此刻',1],['逃亡的松林',2],['大熊阿瑟',2],['寒鸦辛弗兰',2],['一、萨卡莱特',1],['哈沃德的铁匠铺',2],['离开萨卡莱特',2],['前往海尔加德',2]];
// Nodes join on every third hoof beat of the gallop.
const OUTLINE_AT=(()=>{const a=[137.6];for(let k=Math.ceil(gallopPhase(138.2));a.length<OUTLINE.length;k+=3){let lo=128,hi=161;for(let i=0;i<40;i++){const m=(lo+hi)/2;gallopPhase(m)<k?lo=m:hi=m;}a.push(hi);}return a;})();
function outlinePanel(t){
  const x0=1150,y0=110,w=700,h=820,inA=easeOut(seg(t,137,137.8)),collapse=easeInOut(seg(t,151,152.1)),gone=easeIn(seg(t,152.1,153.2));if(inA<=0||gone>=1)return;
  ctx.save();ctx.translate((1-inA)*120+gone*260,0);ctx.globalAlpha=inA*(1-gone);
  glass(x0,y0,w,h*(1-collapse*.82),1,18);text('大纲.pcs',x0+28,y0+44,{size:18,weight:700,color:UI.text});chip(x0+124,y0+20,'大纲',{size:14});text('自动整理',x0+w-28,y0+44,{size:15,color:UI.muted,align:'right'});
  ctx.fillStyle=UI.line;ctx.fillRect(x0+20,y0+66,w-40,1);
  const rows=OUTLINE.map(([label,depth],i)=>({label,depth,y:y0+120+i*80,x:x0+40+depth*70,p:easeOut(seg(t,OUTLINE_AT[i],OUTLINE_AT[i]+.35))}));
  rows.forEach((r,i)=>{if(r.p<=0)return;const parent=[...rows.slice(0,i)].reverse().find(q=>q.depth<r.depth);const cy=lerp(r.y,rows[1].y,i>1?collapse:0),a=i>1?1-collapse:1;
    ctx.save();ctx.globalAlpha*=a;if(parent){const py=lerp(parent.y,rows[1].y,collapse);ctx.strokeStyle=rgba(UI.accent,.7);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(parent.x+18,py+22);ctx.lineTo(parent.x+18,lerp(py+22,cy,r.p));if(r.p>.6)ctx.lineTo(r.x-6,cy);ctx.stroke();}
    const bw=measure(r.label,r.depth?20:22,r.depth<2?700:500)+52;ctx.globalAlpha*=r.p;fillRR(r.x+(1-r.p)*30,cy-24,bw,48,12,r.depth===0?UI.deep:r.depth===1?'#2a3d33':'#22322a');strokeRR(r.x+(1-r.p)*30,cy-24,bw,48,12,r.depth===2?'#3a4f43':rgba(UI.accent,.6),1.2);
    ctx.beginPath();ctx.arc(r.x+20+(1-r.p)*30,cy,5,0,TAU);ctx.fillStyle=r.depth===0?'#eaf6ef':UI.accent;ctx.fill();text(r.label,r.x+34+(1-r.p)*30,cy+7,{size:r.depth?20:22,weight:r.depth<2?700:500,color:r.depth===0?'#f2fbf6':UI.text});ctx.restore();});
  if(collapse>0){text('第一章 · 6 个节点',x0+w-28,y0+168+lerp(0,0,collapse),{size:16,color:UI.muted,align:'right',a:collapse});}
  ctx.restore();
}
function rideShot(t){
  const cam=rideCam(t),dark=t<151?0:easeIn(seg(t,151,157))*.62,forest=seg(t,150,154);
  roadWorld(t,cam,{cloud:t<133?.9-seg(t,128,137)*.4:.5,dark,forest});
  withCam(cam.x,cam.y,cam.z,()=>withTint('#0a0d12',dark,()=>{
    if(t<136)withTint('#2f363e',.22*(1-seg(t,129,133)),()=>havardWatching(t));
    const inShade=t<156?0:easeInOut(seg(t,158,159.4));galloper(t,{sil:inShade});
    // foreground trunks rush past (and hide Havard)
    for(let i=0;i<14;i++){const wx=walkX(WALK[1])+420+i*620+hash(i*3)*300;ctx.save();poly([wx-40,ROAD_Y+260,wx+44,ROAD_Y+260,wx+30,-600,wx-30,-600],'#1d2126');poly([wx-40,ROAD_Y+260,wx-10,ROAD_Y+260,wx-12,-600,wx-30,-600],'#272c32');ctx.restore();}
  }));
  // the great shadow the riders run into
  if(t>155.4){const edge=lerp(W+400,-600,easeIn(seg(t,155.4,160.6))),p=[edge,-20];for(let k=0;k<=12;k++){const y=k/12*(H+40)-20;p.push(edge-(k%2?60+hash(k)*120:0)-Math.sin(k*1.3)*40,y);}p.push(edge,H+20,W+800,H+20,W+800,-20);poly(p,'#000000');}
  ui(()=>outlinePanel(t));
}
shot(128,161,t=>{rideShot(t);if(t>160.4){ctx.save();ctx.globalAlpha=seg(t,160.4,160.65);rect(0,0,W,H,'#000000');ctx.restore();}});

// ================================================================ 19 · 文舟
shot(161,169.01,t=>{
  rect(0,0,W,H,'#000000');const lt=t-161,cx=W/2,cy=410,s=1+.04*seg(lt,0,8);
  for(let i=0;i<26;i++){const age=((lt*.16+hash(i*3.3))%1),x=W*(.15+.7*hash(i*1.7))+Math.sin(lt*.8+i)*30,y=H+20-age*700,r=2+hash(i)*3;ctx.save();ctx.globalAlpha=Math.sin(Math.PI*age)*.85*seg(lt,.4,1.4);glow(x,y,r*6,'#ff7a1e',.45);ctx.fillStyle='#ffb46a';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
  ctx.save();ctx.translate(cx,cy);ctx.scale(s,s);ctx.translate(-cx,-cy);
  const g=easeOut(seg(lt,.5,2.4));glow(cx,cy,140+520*g,'#fff1d6',.55*g*(1-.4*seg(lt,2,3.2)));
  const lp=easeOut(seg(lt,1.2,2.4));if(lp>0){ctx.save();ctx.translate(cx,cy);ctx.scale(.9*lp+.1,.9*lp+.1);ctx.translate(-96,-96);ctx.globalAlpha=lp;ctx.shadowColor='rgba(255,236,200,.6)';ctx.shadowBlur=70;fillRR(0,0,192,192,44,'#257c67');ctx.shadowColor='transparent';ctx.fillStyle='#f7faf5';ctx.fill(LOGO);ctx.restore();}
  text('文舟',cx,cy+210,{size:104,weight:800,color:'#f4efe6',align:'center',a:easeOut(seg(lt,2.4,3.1)),font:SERIF,spacing:24});
  text('0.9.9',cx,cy+282,{size:44,weight:300,color:'#8ad0a8',align:'center',a:easeOut(seg(lt,2.9,3.5)),spacing:8});
  text('让故事，自此起航。',cx,cy+372,{size:40,color:'#e9e3d8',align:'center',font:SERIF,a:easeOut(seg(lt,3.5,4.2)),spacing:10});
  const b=easeOut(seg(lt,4.2,4.8));if(b>0){const bw=400;ctx.save();ctx.globalAlpha=b;strokeRR(cx-bw/2,cy+418,bw,56,28,'rgba(138,208,168,.7)',1.5);text('现已上架鸿蒙应用市场',cx,cy+455,{size:24,color:'#cfe8da',align:'center',spacing:4});ctx.restore();}
  ctx.restore();
  const out=seg(lt,6.6,8);if(out>0){ctx.save();ctx.globalAlpha=out;rect(0,0,W,H,'#000000');ctx.restore();}
});

// ================================================================ frame
function renderAt(t){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';TINT.k=0;
  const s=SHOTS.find(x=>t>=x.a&&t<x.b)||SHOTS[SHOTS.length-1];UI_LAYER.length=0;ctx.save();s.fn(t);ctx.restore();
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;TINT.k=0;grade(t);UI_LAYER.forEach(f=>{ctx.save();f();ctx.restore();});
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;TINT.k=0;subtitles(t);
}
window.renderAt=renderAt;
document.fonts.load(`40px ${SERIF}`,'文舟').catch(()=>{}).then(()=>document.fonts.ready).then(()=>{
  renderAt(Number(params.get('t'))||0);window.promoReady=true;
  if(params.get('record')==='1'||params.has('t'))return;
  const button=document.getElementById('play');button.hidden=false;
  button.onclick=()=>{button.hidden=true;const audio=new Audio('soundtrack.wav');audio.play().catch(()=>{});const t0=performance.now();
    const tick=()=>{const t=audio.duration?audio.currentTime:(performance.now()-t0)/1000;renderAt(clamp(t,0,DURATION));if(t<DURATION)requestAnimationFrame(tick);else button.hidden=false;};requestAnimationFrame(tick);};
});

// Model sheet of the characters in their key poses (review aid: node promo/0.9.9/render.mjs chars).
window.characterSheet=()=>{
  ctx.setTransform(1,0,0,1,0,0);rect(0,0,W,H,'#e8ecef');TINT.k=0;
  const g=880;ctx.fillStyle='#c9d0d6';ctx.fillRect(0,g,W,4);ctx.fillRect(0,430,W,3);
  human({...POSE,x:110,y:430-91*2.2,s:2.2},STYLE.smith);
  human({...POSE,x:250,y:430-91*2.1,s:2.1,face:-1,fF:[16,85],fB:[-12,85],hF:[16,0],hB:[-10,2]},STYLE.boy);
  human({...POSE,...KNEEL,x:470,y:430-55*2,s:2,face:-1},STYLE.soldier,{hold:(st)=>{if(st==='front')spear(47,52,-200);}});
  ctx.save();ctx.translate(560,0);for(let i=0;i<3;i++){const ph=i*.33;horse({x:260+i*480,y:430,s:1.2,gait:i?2:1,phase:i?ph:.2});}
  const seat=horse({x:-2000,y:0});ctx.restore();
  const b=[{x:200},{x:760,head:1},{x:1350,rear:1,jaw:1}];b.forEach(o=>bear({y:g,s:1.9,phase:.3,walk:o.head||o.rear?0:1,...o}));
  raven({x:1640,y:600,s:2.4,face:-1,perch:1});raven({x:1700,y:820,s:1.6,face:-1,fold:0,flap:-.8});raven({x:1500,y:800,s:1.6,face:-1,fold:0,flap:.8});
};
