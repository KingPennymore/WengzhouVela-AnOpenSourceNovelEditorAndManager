// Captures UI states of 文舟 Vela as material for the promo video.
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {glossaryText} from '../web/glossary.mjs';

const out='promo/shots';await mkdir(out,{recursive:true});
const para=s=>'　　'+s;
const ch1=['第一章 启航',
 para('清晨，雾气还没有从青岚港散去。林舟站在码头尽头，手里攥着一本边角卷起的航海日志。'),
 para('“星澜号今天出港吗？”周衡从仓库的阴影里走出来，肩上搭着一卷缆绳。'),
 para('林舟没有回答。他翻开日志的第一页，那里只写着一行字：向灯塔以外的海域航行。'),
 para('远处的灯塔在薄雾里一明一暗，像是谁在黑夜里眨了眨眼。潮水拍打着石阶，带来咸涩的风。'),
 para('“出港。”他终于合上日志，“不管雾散不散。”'),
 para('周衡笑了一下，把缆绳扔上甲板。星澜号的帆在晨光中缓缓升起，像一页刚刚落笔的稿纸。')].join('\n');
const ch2=['第二章 灯塔',para('灯塔的守夜人已经在这里住了三十年。他记得每一艘出港的船，也记得每一艘没有回来的船。'),para('林舟沿着石阶向上走，海风穿过门廊，带来远方的潮声。')].join('\n');
const ch3=['第三章 雾中来信',para('信封上没有署名，只画着一枚小小的船锚。'),para('“这是我父亲的笔迹。”林舟低声说。')].join('\n');
const more=Array.from({length:9},(_,i)=>`第${'四五六七八九十'[i]||'十'}${i>=7?['一','二'][i-7]:''}章 ${['潮汐','暗礁','星图','归港','旧友','远航','风暴','回声','新岸'][i]}\n`+para('海面上的光一层层铺开，故事还在继续。'.repeat(6))).join('\n');
const text=[ch1,ch2,ch3,more].join('\n');
const config=createVelaV2('星澜号');config.editor.glossaries=['人物.gly'];config.reading.items=[{id:'book',path:'星澜号.txt'}];
const make=(id,name,text,dir='星澜号/')=>({id,name,path:dir+name,text,updatedAt:Date.now()-1000*60*(id.length)});
const md='# 人物设定\n\n## 林舟\n- **身份**：星澜号领航员\n- **性格**：沉默、固执、相信灯塔\n\n## 周衡\n- **身份**：码头搬运工，林舟的旧友\n\n> 每一座灯塔，都是写给远航者的一封信。\n\n| 角色 | 首次登场 | 阵营 |\n| --- | --- | --- |\n| 林舟 | 第一章 | 星澜号 |\n| 周衡 | 第一章 | 青岚港 |\n| 守夜人 | 第二章 | 灯塔 |\n';
const docs=[make('book','星澜号.txt',text),make('note','人物设定.md',md),make('outline','大纲.md','# 大纲\n\n1. 启航\n2. 灯塔\n3. 雾中来信\n'),make('config','.vela',velaText(config)),
 make('terms','人物.gly',glossaryText({version:1,entries:[{term:'林舟',category:'人物',definition:'星澜号领航员，沉默而固执',aliases:['船长']},{term:'周衡',category:'人物',definition:'码头搬运工，林舟的旧友'},{term:'青岚港',category:'地点',definition:'故事开始的港口'},{term:'星澜号',category:'船只',definition:'林舟驾驶的帆船'}]})),
 make('poem','海边札记.txt','第一章 海边\n'+para('潮水退去以后，沙滩上留下了许多贝壳。'),'札记/'),make('city','城市.txt','第一章 城市\n'+para('城市的灯光像另一片海。'),'札记/')];
const seed=extra=>({version:1,documents:docs,openIds:['book','note','config'],activeId:'book',settings:{theme:'light',palette:'pine',readingMode:'double',...extra}});

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
async function open(name,{width=1440,height=900,profile='harmonyos',settings={},dark=false}={}){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<600?3:1.5,colorScheme:dark?'dark':'light',reducedMotion:'reduce'});
 await context.addInitScript(s=>localStorage.setItem('wenzhou.workspace',JSON.stringify(s)),seed(settings));
 const p=await context.newPage();p.on('pageerror',e=>console.error(name,e.message));
 await p.goto('http://127.0.0.1:4173/?ui='+profile);
 if(await p.locator('#start-page').isVisible())await p.locator('[data-recent=book]').click();
 await p.waitForSelector('.cm-editor');await p.waitForTimeout(400);
 return {p,context,shot:async n=>{await p.waitForTimeout(450);await p.screenshot({path:`${out}/${n}.png`});console.log('shot',n);}};
}
const cursorTo=(p,needle)=>p.evaluate(needle=>{const v=editorManager.editor,at=v.state.doc.toString().indexOf(needle);v.dispatch({selection:{anchor:at},scrollIntoView:true});v.focus();},needle);

try{
 // Desktop editor: file sidebar + outline
 {const {p,context,shot}=await open('editor');
  await p.locator('#mobile-library').click();await p.locator('#outline-toggle').click();await cursorTo(p,'远处的灯塔');await shot('01-editor');
  await p.keyboard.press('Control+Shift+k');await p.waitForTimeout(300);await shot('02-commands');await p.keyboard.press('Escape');
  await p.evaluate(()=>{const v=editorManager.editor,d=v.state.doc.toString(),a=d.indexOf('林舟没有回答');v.dispatch({selection:{anchor:a,head:d.indexOf('\n',a)}});});await shot('03-selection');
  await p.locator('#settings').click();await shot('04-settings');await p.locator('#dialog-cancel').click();
  await p.locator('[data-tab=note], [data-id=note]').first().click().catch(()=>{});
  await context.close();}
 // Glossary panel + term highlighting
 {const {p,context,shot}=await open('glossary',{settings:{glossaryPanel:true,highlightTerms:true}});
  await p.locator('#outline-toggle').click().catch(()=>{});await cursorTo(p,'第一章');await p.waitForTimeout(400);await shot('05-glossary');
  await p.evaluate(()=>{const v=editorManager.editor,d=v.state.doc.toString(),a=d.indexOf('周衡笑了一下');v.dispatch({changes:{from:a,insert:'星'},selection:{anchor:a+1}});v.focus();});
  await p.keyboard.press('Control+Space');await p.waitForSelector('.cm-tooltip-autocomplete').catch(()=>{});await shot('06-completion');
  await context.close();}
 // Markdown preview + .vela GUI
 {const {p,context,shot}=await open('markdown');
  await p.locator('#mobile-library').click();
  await p.keyboard.press('Control+Alt+h');await p.locator('[data-recent=note]').click();await p.locator('[data-display=preview]').click().catch(()=>{});await shot('07-markdown');
  await p.keyboard.press('Control+Alt+h');await shot('08-home');
  await p.locator('[data-recent=config]').click();await p.locator('[data-display=preview]').click().catch(()=>{});await shot('09-vela');
  await context.close();}
 // Reader
 {const {p,context,shot}=await open('reader');
  await p.locator('[data-view=reader]').click();await shot('10-library');
  await p.locator('[data-read=book]').click();await p.waitForTimeout(500);await shot('11-reader');
  await context.close();}
 // GitHub + subscriptions
 {const {p,context,shot}=await open('github');
  await p.locator('[data-view=github]').click();await shot('12-github');
  await p.locator('[data-view=subscriptions]').click();await shot('13-subscriptions');
  await context.close();}
 // Themes, light & dark
 for(const palette of ['pine','jade','bamboo','wheat','graphite'])for(const dark of [false,true]){
  const {p,context,shot}=await open('theme',{settings:{palette,theme:dark?'dark':'light'},dark});
  await p.locator('#outline-toggle').click();await cursorTo(p,'远处的灯塔');await shot(`theme-${palette}-${dark?'dark':'light'}`);await context.close();}
 // Mobile
 {const {p,context,shot}=await open('mobile',{width:390,height:844,profile:'android'});
  await cursorTo(p,'远处的灯塔');await shot('20-mobile-editor');
  await p.locator('#outline-toggle').click().catch(()=>{});await shot('21-mobile-outline');
  await p.locator('[data-view=reader]').click();await shot('22-mobile-library');
  await p.locator('[data-read=book]').click();await p.waitForTimeout(500);await shot('23-mobile-reader');
  await context.close();}
 {const {p,context,shot}=await open('mobile-dark',{width:390,height:844,profile:'harmonyos',settings:{theme:'dark',palette:'jade'},dark:true});
  await cursorTo(p,'远处的灯塔');await shot('24-mobile-dark');await context.close();}
 // Windows profile
 {const {p,context,shot}=await open('windows',{profile:'windows',settings:{palette:'wheat'}});
  await p.locator('#mobile-library').click();await p.locator('#outline-toggle').click();await cursorTo(p,'远处的灯塔');await shot('25-windows');await context.close();}
}finally{await browser.close();}
