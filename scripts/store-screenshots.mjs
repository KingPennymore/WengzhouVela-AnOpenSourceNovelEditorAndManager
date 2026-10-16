import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {startSourceAppServer} from '../tests/source-app-server.mjs';
import {openRecentFile} from '../tests/start-page-helper.mjs';
import {buildRecord} from '../web/rich-text.mjs';
import {glossaryText} from '../web/glossary.mjs';

// App-store screenshots of the main screens at the three store sizes: 9:16 phone (1080×1920), 3:2 tablet
// (1920×1280) and 16:9 desktop (1920×1080). Each shot is a PNG (≤ 5 MB); the first two sizes also get a WEBP
// (≤ 200 KB). Output: dist/store-screenshots/<size>/. Usage: node scripts/store-screenshots.mjs
const sizes=[
  {name:'9x16-1080x1920',ui:'android',viewport:{width:360,height:640},scale:3,webp:true},
  {name:'3x2-1920x1280',ui:'harmonyos',viewport:{width:960,height:640},scale:2,webp:true},
  {name:'16x9-1920x1080',ui:'windows',viewport:{width:1280,height:720},scale:1.5,webp:false},
];
const chapters=[
  ['第一章 雾港','　　雾从海上漫进港口的时候，林舟正坐在灯塔下的石阶上，把昨夜的航海日志一页页摊开晾干。\n　　“又起雾了。”守塔的老周提着油灯走下来，“今晚的船，怕是进不来了。”\n　　林舟没有抬头。日志最后一页写着一行陌生的字迹：潮水退去之前，去北岬找那艘没有名字的船。\n　　他认得自己的字，这一行不是他写的。'],
  ['第二章 无名船','　　北岬的礁石在退潮后露出黑色的脊背，像一群伏在水边的兽。\n　　那艘船就搁浅在礁石之间，船身漆成灰白，船首本该写名字的地方只有一块被磨平的木板。\n　　【系统提示：检测到未登记船只，是否登船？】\n　　林舟愣了一下，四下张望，礁石间只有风声。'],
  ['第三章 旧信','　　船舱里很干燥，桌上压着一封信，信封上写着他的名字。\n　　“阿舟：见字如面。等你读到这封信，灯塔大概已经熄过一次了。不要害怕，跟着潮水走。”\n　　落款只有一个字：岚。\n　　他把信折好放进怀里，舱外的雾忽然散了，海面上亮起一条细细的光路。'],
  ['第四章 光路','　　光路从船首一直铺到天边，像有人在海面上撒了一把碎银。\n　　老周说过，雾港的灯塔每熄一次，就会有人从海上回来。\n　　林舟解开缆绳，无名船轻轻一晃，顺着光路驶了出去。'],
  ['第五章 归航','　　天亮的时候，他看见了另一座灯塔。\n　　塔下站着一个穿灰衣的人，正朝他挥手。\n　　——第一卷完——'],
];
const novel=chapters.map(([title,body])=>title+'\n\n'+body).join('\n\n');
const at=(text,quote,n=0)=>{let i=-1;for(let k=0;k<=n;k++)i=novel.indexOf(quote,i+1);if(i<0)throw Error('missing '+quote);return {from:i,to:i+quote.length};};
const line=quote=>{const i=novel.indexOf(quote),from=novel.lastIndexOf('\n',i)+1,end=novel.indexOf('\n',i);return {from,to:end<0?novel.length:end};};
const entries=[
  {group:'marks',type:'strong',...at(novel,'潮水退去之前，去北岬找那艘没有名字的船')},
  {group:'marks',type:'emphasis',...at(novel,'这一行不是他写的')},
  {group:'marks',type:'ruby',value:'lán',...at(novel,'岚')},
  {group:'blocks',type:'style',value:'system',...line('【系统提示')},
  {group:'blocks',type:'style',value:'letter',...line('“阿舟：见字如面')},
  {group:'marks',type:'style',value:'aside',...at(novel,'像有人在海面上撒了一把碎银')},
  {group:'blocks',type:'align',value:'center',...line('——第一卷完——')},
];
const config={version:3,kind:'workspace',id:'fog-harbor',project:{name:'雾港灯塔',author:'文舟示例'},editor:{glossaries:['设定.gly']},reading:{},richText:{enabled:true,documents:{'正文.txt':buildRecord(novel,entries)}}};
const glossary=glossaryText({version:1,entries:[
  {term:'林舟',category:'人物',definition:'雾港的年轻航海记录员，负责每晚的航海日志。\n性格沉静，记性极好。',aliases:['阿舟']},
  {term:'老周',category:'人物',definition:'守塔人，在雾港灯塔住了三十年。',aliases:['周伯']},
  {term:'岚',category:'人物',definition:'旧信的落款人，身份未明。',aliases:[]},
  {term:'雾港',category:'地点',definition:'临海的小港口，常年起雾。',aliases:[]},
  {term:'北岬',category:'地点',definition:'港口北侧的礁石岬角，退潮时露出礁群。',aliases:['北角']},
  {term:'无名船',category:'物品',definition:'搁浅在北岬的灰白色帆船，船首名牌被磨平。',aliases:['灰船']},
  {term:'光路',category:'设定',definition:'灯塔熄灭后海面上出现的发光航道。',aliases:[]},
  {term:'航海日志',category:'物品',definition:'林舟的日志本，最后一页出现陌生字迹。',aliases:['日志']},
]});
const doc=(id,name,text)=>({id,name,path:'雾港灯塔/'+name,text,updatedAt:Date.now()});
const seed=theme=>({version:1,activeId:'book',openIds:['book','terms','config'],settings:{theme,richText:true,highlightTerms:true},documents:[doc('book','正文.txt',novel),doc('terms','设定.gly',glossary),doc('config','.vela',JSON.stringify(config,null,2)),doc('outline','大纲.md','# 雾港灯塔\n\n## 第一卷\n\n- 雾港：日志中出现陌生字迹\n- 北岬：无名船\n- 旧信：岚的来信\n')]});

const out='dist/store-screenshots',server=await startSourceAppServer();
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
const converter=await (await browser.newContext()).newPage();
// Re-encode in a blank page (the app's CSP blocks data: images), lowering quality until the WEBP is ≤ 200 KB.
async function webp(png){
  return converter.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
    for(let q=.9;q>.2;q-=.05){const url=c.toDataURL('image/webp',q),bytes=Math.ceil((url.length-23)*3/4);if(bytes<=200*1024)return {data:url.slice(url.indexOf(',')+1),q};}throw Error('WEBP over 200 KB');},png.toString('base64'));
}
const report=[];
async function shoot(page,size,name){
  await page.waitForTimeout(500);const png=await page.screenshot({type:'png'});
  if(png.length>5*1024*1024)throw Error(name+' PNG over 5 MB');
  const dir=`${out}/${size.name}`;await writeFile(`${dir}/${name}.png`,png);let line=`${size.name}/${name}.png ${(png.length/1024).toFixed(0)} KB`;
  if(size.webp){const w=await webp(png),buf=Buffer.from(w.data,'base64');await writeFile(`${dir}/${name}.webp`,buf);line+=`, webp ${(buf.length/1024).toFixed(0)} KB (q ${w.q.toFixed(2)})`;}
  report.push(line);console.log(line);
}
async function open(size,theme='light'){
  const context=await browser.newContext({viewport:size.viewport,deviceScaleFactor:size.scale,isMobile:size.ui==='android',hasTouch:size.ui==='android',colorScheme:theme});
  await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},seed(theme));
  const page=await context.newPage();page.on('pageerror',e=>console.error('pageerror',e.message));
  await page.goto(`${server.url}/?ui=${size.ui}`);await openRecentFile(page,page.locator('[data-recent=book]'));await page.waitForSelector('.cm-editor');await page.waitForTimeout(600);
  return page;
}
const select=(page,quote)=>page.evaluate(quote=>{const v=velaEditorView,i=v.state.doc.toString().indexOf(quote);v.dispatch({selection:{anchor:i,head:i+quote.length},scrollIntoView:true});v.focus();},quote);
try{
  for(const size of sizes){
    await mkdir(`${out}/${size.name}`,{recursive:true});
    let page=await open(size);
    await shoot(page,size,'01-写作与TXT格式');
    await select(page,'他认得自己的字');await page.waitForSelector('#selection-menu:not([hidden])');await page.locator('.selection-more-toggle').click();await shoot(page,size,'02-选区菜单');
    await page.keyboard.press('Escape');await select(page,'像有人在海面上撒了一把碎银');await page.waitForTimeout(300);await page.locator('#format-style').click();await page.locator('#format-style-panel').waitFor();await shoot(page,size,'03-样式面板');
    await page.keyboard.press('Escape');await page.locator('[data-view=reader]').click();await page.locator('[data-read=book]').click();await page.waitForTimeout(900);await shoot(page,size,'04-阅读');
    await page.context().close();
    page=await open(size);
    await page.evaluate(()=>document.querySelector('[data-tab=terms]')?.click());await page.waitForSelector('.glossary-page');await shoot(page,size,'05-术语库');
    await page.locator('.glossary-row').first().click();await page.waitForSelector('.glossary-detail');await shoot(page,size,'06-词条详情');
    await page.evaluate(()=>document.querySelector('[data-tab=config]')?.click());await page.locator('#vela-form').waitFor();await shoot(page,size,'07-作品配置');
    await page.locator('[data-vela-page="format"]').click();await shoot(page,size,'08-TXT格式记录');
    await page.locator('#more-tools').click();await page.locator('#plugins').click();await page.waitForTimeout(800);await shoot(page,size,'09-插件与组件');
    await page.context().close();
    page=await open(size,'dark');await shoot(page,size,'10-深色模式');await page.context().close();
  }
  await writeFile(`${out}/README.txt`,report.join('\n')+'\n');
}finally{await browser.close();await server.close();}
