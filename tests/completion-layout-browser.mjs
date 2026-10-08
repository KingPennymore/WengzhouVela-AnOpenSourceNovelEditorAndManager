import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const config={version:2,kind:'workspace',id:'qa',project:{name:'航程'},editor:{glossaries:['人物.gly']},reading:{items:[]}};
const glossary={version:1,entries:[{id:'term',term:'阿德里蒙',category:'人物',definition:'航海记录者。'.repeat(80),aliases:[]},{id:'other',term:'阿德船长',definition:'另一名船员。'.repeat(80),aliases:[]}]};
glossary.entries.push({id:'place',term:'阿德港',definition:'港口。'.repeat(160),aliases:[]},{id:'tower',term:'阿德塔',definition:'灯塔。'.repeat(160),aliases:[]});
const seed={version:1,documents:[{id:'book',name:'正文.txt',path:'Novel/正文.txt',text:'阿德',updatedAt:1},{id:'config',name:'.vela',path:'Novel/.vela',text:JSON.stringify(config),updatedAt:1},{id:'terms',name:'人物.gly',path:'Novel/人物.gly',text:JSON.stringify(glossary),updatedAt:1}],openIds:['book'],activeId:'book',settings:{theme:'light'}};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
await mkdir('test-results/completion-layout',{recursive:true});
try{
 for(const [profile,width,height] of [['android',320,800],['android',390,420],['android',390,320],['harmonyos',1280,850],['windows',1440,960]]){
  const context=await browser.newContext({viewport:{width,height}});await context.addInitScript(seed=>localStorage.setItem('wenzhou.workspace',JSON.stringify(seed)),seed);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173/?ui='+profile);await page.locator('[data-recent=book]').click();await page.waitForSelector('.cm-editor');
  for(const nearBottom of [false,true]){
   await page.evaluate(nearBottom=>{const v=editorManager.editor,text=(nearBottom?'正文\n'.repeat(60):'')+'阿德',suffix='\n阿德里蒙出航 阿德船长到港 阿德里蒙归航';v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text+suffix},selection:{anchor:text.length},scrollIntoView:true});v.focus();},nearBottom);
   await page.keyboard.press('Control+Space');await page.waitForSelector('.vela-completion-info');await page.waitForTimeout(160);
   const popup=page.locator('.cm-tooltip-autocomplete'),list=popup.locator('ul'),info=popup.locator('.cm-completionInfo'),selected=list.locator('[aria-selected]');
   const a=await list.boundingBox(),b=await info.boundingBox(),box=await popup.boundingBox(),row=await selected.boundingBox();
   assert.ok(a.y+a.height<=b.y+1,JSON.stringify({profile,width,height,a,b}));assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1,JSON.stringify({box,width,height}));
   assert.ok(row.y>=a.y-1&&row.y+row.height<=a.y+a.height+1,JSON.stringify({a,row}));assert.ok(row.height<=28);assert.ok(await list.locator('li').count()>=4);
   assert.equal(await info.evaluate(el=>getComputedStyle(el).position),'static');assert.ok(await info.evaluate(el=>el.scrollHeight>el.clientHeight),JSON.stringify({selected:await selected.textContent(),info:await info.textContent(),bounds:await info.evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}))}));
   await page.screenshot({path:`test-results/completion-layout/${profile}-${width}-${height}-${nearBottom?'bottom':'top'}.png`});
   await page.keyboard.press('ArrowDown');assert.match(await list.locator('[aria-selected]').textContent(),/阿德/);await list.locator('li').nth(1).click();await page.waitForSelector('.cm-tooltip-autocomplete',{state:'hidden'});
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${profile} ${width}x${height}: candidate rows, scrolling details, edges and click selection`);await context.close();
 }
}finally{await browser.close();}
