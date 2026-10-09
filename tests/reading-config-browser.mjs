import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),p=await browser.newPage({viewport:{width:390,height:820}}),checks=[],errors=[];
p.on('pageerror',e=>errors.push(e.message));
const novel='第一章 航路。\n'+('海上的风带来远方的消息。\n').repeat(60)+'第二章 港湾！\n'+('灯塔照亮归来的船。\n').repeat(60);
const docs=[{id:'regional',name:'小说.txt',path:'项目/小说.txt',text:novel},{id:'outside',name:'散文.txt',path:'其他/散文.txt',text:novel},{id:'regional-config',name:'.vela',path:'项目/.vela',text:JSON.stringify({version:2,kind:'workspace',id:'regional',project:{name:'项目'},reader:{mode:'pages'},reading:{layout:{fontSize:17},items:[{id:'book',path:'小说.txt'}]}})}];
for(const doc of docs)doc.updatedAt=1;
await p.addInitScript(docs=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:docs,folders:['项目','其他'],activeId:'regional',openIds:['regional'],settings:{theme:'light',readingMode:'pages'}})),docs);
const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const tap=async(fraction=.5)=>{await p.waitForTimeout(380);const box=await p.locator('.reader-viewport').boundingBox();await p.mouse.click(box.x+box.width*fraction,box.y+box.height*.5);await p.waitForTimeout(380);};
try{
 await p.goto('http://127.0.0.1:4173');await p.locator('[data-recent]').filter({hasText:'小说.txt'}).click();await p.waitForSelector('.cm-editor');
 await check('设置创建全局配置并列出全部内部文件，搜索与选择保留相对路径',async()=>{
  await p.locator('#more-tools').click();await p.locator('#settings').click();await p.locator('#edit-global-vela').click();await p.waitForSelector('#vela-form');
  assert.equal(await p.locator('[name=readingFiles]').count(),2);await p.locator('[data-vela-select=none]').click();await p.locator('#vela-file-search').fill('其他');await p.locator('[data-vela-select=all]').click();await p.locator('#vela-file-search').fill('');
  for(const [name,value] of Object.entries({fontSize:25,lineHeight:2.2,marginTop:32,marginBottom:36,marginLeft:42,marginRight:48}))await p.locator(`#vela-form [name=${name}]`).fill(String(value));
  await p.locator('[name=readerMode]').selectOption('pages');await p.locator('#vela-form .primary').click();const config=JSON.parse((await state()).documents.find(d=>d.path==='.global.vela').text);assert.deepEqual(config.library.items.map(item=>item.path),['其他/散文.txt']);assert.equal(config.reader.layout.lineHeight,2.2);assert.equal(config.kind,'global');
 });
 await check('区域配置优先，全局回退应用字号、行距与四边留白',async()=>{
  await p.locator('[data-view=reader]').click();assert.equal(await p.locator('[data-read]').count(),1);await p.locator('[data-read=outside]').click();await p.waitForTimeout(400);
  const css=await p.locator('.reader-content').evaluate(e=>{const s=getComputedStyle(e);return {font:s.fontSize,line:s.lineHeight,left:s.paddingLeft,right:s.paddingRight,top:s.paddingTop,bottom:s.paddingBottom};});assert.deepEqual(css,{font:'25px',line:'55px',left:'42px',right:'48px',top:'32px',bottom:'36px'});
 });
 await check('章节标题独占居中页、页数与居中章节名去掉尾部标点',async()=>{
  const title=p.locator('.reader-section-title').first(),content=p.locator('.reader-content');assert.ok(await title.evaluate(e=>e.offsetHeight>400));assert.equal(await title.evaluate(e=>getComputedStyle(e).justifyContent),'center');assert.equal(await p.locator('#reader-footer-chapter').textContent(),'第一章 航路');assert.match(await p.locator('#reader-position').textContent(),/^1 \/ (?:[2-9]|[1-9]\d+)$/);assert.equal(await p.locator('.reader-viewport').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.ok(await title.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>await content.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
 });
 await check('四方向触摸滑动翻页及覆盖动画，不改变字号',async()=>{
  const before=await p.locator('.reader-content').evaluate(e=>getComputedStyle(e).fontSize);
  async function swipe(dx,dy){await p.locator('.reader-viewport').evaluate((e,{dx,dy})=>{const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;for(const [type,ex,ey] of [['pointerdown',x,y],['pointermove',x+dx,y+dy],['pointerup',x+dx,y+dy]])e.dispatchEvent(new PointerEvent(type,{pointerId:1,pointerType:'touch',clientX:ex,clientY:ey,bubbles:true}));},{dx,dy});}
  await swipe(-100,0);assert.equal(await p.locator('.reader-page-overlay,.reader-page-incoming').count(),2);await p.waitForTimeout(380);assert.equal(await p.locator('.reader-page-overlay,.reader-page-incoming').count(),0);assert.match(await p.locator('#reader-position').textContent(),/^2 \/ /);
  await swipe(0,-100);await p.waitForTimeout(380);assert.match(await p.locator('#reader-position').textContent(),/^3 \/ /);await swipe(100,0);await p.waitForTimeout(380);await swipe(0,100);await p.waitForTimeout(380);assert.match(await p.locator('#reader-position').textContent(),/^1 \/ /);assert.equal(await p.locator('.reader-content').evaluate(e=>getComputedStyle(e).fontSize),before);
 });
 await check('个人排版覆盖保留自选书库范围，GUI 配置保持保存',async()=>{
  await tap();await p.locator('#reader-back').click();await p.locator('#more-tools').click();await p.locator('#settings').click();await p.locator('[name=globalVelaOverride]').check();await p.locator('#dialog-submit').click();await p.locator('[data-view=write]').click();await p.locator('[data-view=reader]').click();assert.equal(await p.locator('[data-read]').count(),1);assert.equal(await p.locator('[data-read=outside]').count(),1);
 });
 await check('上下模式保留页数与行距，标题前留空并保持正文',async()=>{
  await p.locator('#more-tools').click();await p.locator('#settings').click();await p.locator('[name=readingMode]').selectOption('scroll');await p.locator('#dialog-submit').click();await p.locator('[data-read=outside]').click();await p.waitForTimeout(350);assert.match(await p.locator('#reader-position').textContent(),/^1 \/ (?:[2-9]|[1-9]\d+)$/);assert.equal(await p.locator('.reader-content').textContent(),novel);assert.ok(await p.locator('.reader-section-title').first().evaluate(e=>parseFloat(getComputedStyle(e).marginTop))>0);
 });
 assert.deepEqual(errors,[]);await writeFile('test-results/reading-config-results.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
}catch(error){console.log(errors,await p.locator('body').innerText());await p.screenshot({path:'test-results/reading-config-failure.png'});throw error;}finally{await browser.close();}
