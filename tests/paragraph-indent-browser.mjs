import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const [profile,width,height] of [['windows',1440,960],['harmonyos',1280,850],['android',390,844]]){
  const context=await browser.newContext({viewport:{width,height}});
  await context.addInitScript(()=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'book',name:'正文.txt',path:'正文.txt',text:'　　正文',updatedAt:1}],openIds:['book'],activeId:'book',settings:{theme:'light'}})));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto((process.env.VELA_TEST_URL||'http://127.0.0.1:4173')+'/?ui='+profile);await page.locator('[data-recent=book]').click();await page.waitForSelector('.cm-editor');
  const replace=async text=>page.evaluate(text=>{const v=editorManager.editor;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus();},text);
  const value=()=>page.evaluate(()=>({text:editorManager.editor.state.doc.toString(),head:editorManager.editor.state.selection.main.head}));
  for(const indent of ['　　','　','    ','\t　 ','']){
   const text=indent+'正文';await replace(text);await page.keyboard.press('Enter');
   assert.deepEqual(await value(),{text:text+'\n'+indent,head:text.length+1+indent.length});
   await page.keyboard.type('下一段');assert.equal((await value()).text,text+'\n'+indent+'下一段');
  }
  await replace('　　正文');await page.keyboard.press('Shift+Enter');assert.equal((await value()).text,'　　正文\n　　');
  await page.keyboard.press('Control+z');assert.equal((await value()).text,'　　正文');await page.keyboard.press('Control+Shift+z');assert.equal((await value()).text,'　　正文\n　　');
  assert.deepEqual(errors,[]);console.log('PASS '+profile+': exact paragraph indentation, caret, typing, Shift+Enter, undo and redo');await context.close();
 }
}finally{await browser.close();}
