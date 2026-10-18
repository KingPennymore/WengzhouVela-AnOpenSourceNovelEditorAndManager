import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {seed} from './seed.mjs';
import {startSourceAppServer} from '../../../tests/source-app-server.mjs';

// Captures the real 文舟 web app, step by step, in the states the promo's interface shots go through:
// promo/0.9.9/ui/shots/*.jpg, plus ui/shots.js with each sequence's frame list and the points the drawn cursor visits.
// From the repository root:  node promo/0.9.9/ui/capture.mjs   (WENZHOU_CHROME=… for a particular Chromium)
// It serves the current web/ sources itself, as the browser tests do; VELA_PREVIEW_URL=… points it at a running app instead.
const dir=path.dirname(fileURLToPath(import.meta.url)),out=path.join(dir,'shots');
const server=process.env.VELA_PREVIEW_URL?null:await startSourceAppServer(),URL_=process.env.VELA_PREVIEW_URL||server.url;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.WENZHOU_CHROME});
const SEQ={},ONLY=process.env.ONLY?.split(','),want=n=>!ONLY||ONLY.includes(n);   // ONLY=relations,map … to redo some

async function app(name,{width,height,state={}}){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1.5,reducedMotion:'reduce'});
  await context.addInitScript(s=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(s));},seed(state));
  const p=await context.newPage();p.on('pageerror',e=>console.error(name,e.message));
  await p.goto(URL_+'/?ui=harmonyos');await p.waitForTimeout(800);
  const seq=SEQ[name]||={size:[width,height],frames:[],at:{}};   // a sequence may run over several page loads
  const shot=async(label,clip)=>{await p.waitForTimeout(350);const file=`${name}-${String(seq.frames.length).padStart(2,'0')}.jpg`;await p.screenshot({path:path.join(out,file),type:'jpeg',quality:88,clip});seq.frames.push([label,file]);console.log(file,label);};
  const mark=(key,[x,y])=>{seq.at[key]=[Math.round(x),Math.round(y)];return [x,y];};
  const centre=async sel=>{const b=await p.locator(sel).first().boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
  const open=async id=>{if(!await p.locator('#start-page').isVisible())await p.keyboard.press('Control+Alt+h');await p.locator('#start-page').waitFor();
    if(await p.locator('#start-page').getAttribute('data-panel')!=='recent')await p.locator('[data-start="recent"]').click();await p.locator(`[data-recent="${id}"]`).click();await p.waitForTimeout(600);};
  return {p,context,seq,shot,mark,centre,open};
}
// where the n-th occurrence of `needle` sits in the editor: its left and right edge on the middle of the line
const textBox=(p,needle)=>p.evaluate(needle=>{const w=document.createTreeWalker(document.querySelector('.cm-content'),NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())&&!n.data.includes(needle));const r=document.createRange(),i=n.data.indexOf(needle);r.setStart(n,i);r.setEnd(n,i+needle.length);const b=r.getClientRects()[0];return [b.left,b.right,(b.top+b.bottom)/2];},needle);

// ---------------------------------------------------------------- 术语库: select a name, 更多 → 加入词库, give it a definition
async function glossary(name,{find,term,definition,gly}){
  const {p,context,shot,mark,centre,open}=await app(name,{width:800,height:580,state:{gly,settings:{highlightTerms:true}}});
  await open('book');await shot('idle');
  const [x0,x1,y]=await textBox(p,find),start=x0+(find.indexOf(term))*(x1-x0)/find.length,end=start+term.length*(x1-x0)/find.length;
  mark('from',[start+2,y]);mark('to',[end-2,y]);
  await p.mouse.move(start+2,y);await p.mouse.down();await p.mouse.move((start+end)/2,y,{steps:3});await shot('half');
  await p.mouse.move(end-2,y,{steps:3});await shot('selected');await p.mouse.up();await p.waitForTimeout(500);await shot('menu');
  const more=mark('more',await centre('#selection-menu button:has-text("更多")'));await p.mouse.click(...more);await shot('more');
  const add=mark('add',await centre('#selection-menu button:has-text("加入词库")'));await p.mouse.move(...add);await shot('hover');
  await p.mouse.click(...add);await shot('dialog');
  const field=mark('field',await centre('#dialog [name=definition]'));await p.mouse.click(...field);await shot('focus');
  for(const ch of definition){await p.keyboard.type(ch);await shot('typed');}
  const submit=mark('submit',await centre('#dialog-submit'));await p.mouse.move(...submit);await shot('submit');
  await p.mouse.click(...submit);await p.waitForTimeout(120);await p.keyboard.press('Control+Home');await shot('saved');   // the caret back where it was
  await p.waitForTimeout(2600);await shot('done');
  await context.close();
}
if(want('arthur'))await glossary('arthur',{find:'大熊阿瑟',term:'阿瑟',definition:'大熊精魂'});
if(want('sinfran'))await glossary('sinfran',{find:'辛弗兰就用',term:'辛弗兰',definition:'寒鸦精魂',gly:[{term:'阿瑟',definition:'大熊精魂'}]});

// ---------------------------------------------------------------- 关系: drag Havard to Riga, label the relation
if(want('relations')){
  // the drag itself is drawn in the film (a line following the cursor); the app is captured before and after it
  {const {p,context,shot,mark,centre,open}=await app('relations',{width:800,height:520,state:{plan:{edge:0}}});
    await open('plan');await p.locator('button[title=关系]').click();await shot('nodes');
    mark('handle',await centre('.relations-plane [aria-label=拖出连线]'));mark('riga',await centre('.relations-plane [data-node]:has-text("里加")'));await context.close();}
  const {p,context,shot,mark,centre,open}=await app('relations',{width:800,height:520,state:{plan:{edge:1}}});
  await open('plan');await p.locator('button[title=关系]').click();await shot('linked');
  const edge=mark('edge',await p.locator('.relations-plane [data-relation] path').first().evaluate(e=>{const l=e.getTotalLength(),q=e.getPointAtLength(l/2),m=e.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f];}));
  await p.locator('.relations-plane [data-relation]').first().dispatchEvent('click');await shot('detail');
  const label=mark('label',await centre('.outline-detail [name=label]'));await p.mouse.click(...label);await shot('focus');
  for(const ch of '抚养与照料'){await p.keyboard.type(ch);await shot('typed');}
  const save=mark('save',await centre('.outline-detail button:has-text("保存关系")'));await p.mouse.move(...save);await shot('hover');
  await p.mouse.click(...save);await shot('saved');
  await context.close();}

// ---------------------------------------------------------------- 地图: the 信息点 tool, a point at each place, named
if(want('map')){const {p,context,seq,shot,mark,centre,open}=await app('map',{width:1000,height:640,state:{mapPlaces:0}});
  await open('map');const bar=await p.locator('button[title=浏览]').boundingBox(),strip={x:0,y:bar.y-2,width:620,height:bar.height+6};seq.strip=strip;
  await shot('bar',strip);const tool=mark('tool',await centre('button[title=信息点]'));await p.mouse.click(...tool);await shot('bar-info',strip);
  for(const [i,place] of ['萨卡莱特','艾洛夫','盎讷','海尔加德'].entries()){
    await p.mouse.click(260+i*120,300+(i%2)*60);await p.waitForTimeout(300);
    const panel=await p.locator('text=保存信息点').locator('xpath=ancestor::*[contains(@class,"map-details") or self::aside or self::section][1]').boundingBox().catch(()=>null)
      ||await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='保存信息点');let e=b;while(e&&e.getBoundingClientRect().height<300)e=e.parentElement;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
    const clip={x:panel.x+2,y:panel.y+2,width:panel.width-4,height:panel.height-4};seq.panel=clip;
    await shot('new',clip);const field=await centre('[name=name]');if(!i)mark('name',field);await p.mouse.click(...field);await p.keyboard.press('Control+a');
    for(const ch of place){await p.keyboard.type(ch);await shot(place,clip);}
    const save=await centre('button:has-text("保存信息点")');if(!i)mark('save',save);await p.mouse.click(...save);await p.waitForTimeout(200);}
  await context.close();}

// ---------------------------------------------------------------- 大纲: the plot tree growing a node at a time, then a branch folded
if(want('outline')){for(let k=1;k<=10;k++){const {p,context,seq,shot,open}=await app('outline-'+k,{width:860,height:1720,state:{plan:{nodes:Math.min(k,9)}}});
  await open('plan');await p.locator('button[title=大纲]').click();if(k===10){const fold=p.locator('.outline-graph-card:has-text("一、萨卡莱特") [aria-label=折叠], .outline-graph-card:has-text("一、萨卡莱特") [title=折叠]').first(),b=await fold.boundingBox();SEQ['outline-10'].at.fold=[Math.round(b.x+b.width/2),Math.round(b.y+b.height/2)];await fold.click();}
  const plane=await p.locator('.outline-plane').boundingBox(),cards=await p.locator('.outline-plane [data-node]').evaluateAll(b=>b.map(x=>{const r=x.getBoundingClientRect();return [r.y,r.bottom];}));
  await shot(k===10?'folded':'nodes');SEQ['outline-'+k].cards=cards;SEQ['outline-'+k].plane=[plane.y,plane.y+plane.height];
  await context.close();}}

// a partial run (ONLY=…) keeps the other sequences already written
const file=path.join(dir,'shots.js'),before=ONLY?await readFile(file,'utf8').then(t=>JSON.parse(t.slice(t.indexOf('=')+1).trim().replace(/;$/,'')),()=>({})):{};
await writeFile(file,'// Written by ui/capture.mjs: the frames of each interface sequence and where things are on them (CSS px).\nwindow.UI_SHOTS='+JSON.stringify({...before,...SEQ})+';\n');
await browser.close();server?.close();
