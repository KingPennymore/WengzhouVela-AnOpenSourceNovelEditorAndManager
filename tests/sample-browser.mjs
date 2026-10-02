import {chromium} from 'playwright';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
async function documents(folder='测试文件',prefix=''){
  const docs=[];for(const item of await readdir(folder,{withFileTypes:true})){const path=prefix+item.name;if(item.isDirectory())docs.push(...await documents(folder+'/'+item.name,path+'/'));else docs.push({id:path,name:item.name,path,text:await readFile(folder+'/'+item.name,'utf8'),updatedAt:1,remote:null});}return docs;
}
const docs=await documents(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(documents=>{if(window.top!==window)return;if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents,openIds:[],activeId:null,settings:{libraryOpen:false}}));},docs);
await mkdir('test-results',{recursive:true});
const open=async path=>{await page.locator('#home-button').click();await page.locator(`[data-recent="${path}"]`).click();};
async function compile(path,engine){await open(path);await page.locator('[data-display=preview]').click();await page.locator('.tex-engine').selectOption(engine);await page.locator('.tex-compile').click();await page.waitForFunction(()=>!document.querySelector('.tex-compile').disabled,{},{timeout:180000});const log=await page.locator('.tex-log pre').textContent();await writeFile('test-results/sample-'+engine+'.log',log);assert.equal(await page.locator('.tex-status').textContent(),'编译完成',log.slice(-3000));assert.ok(await page.locator('canvas').evaluate(el=>el.width>0));const wait=page.waitForEvent('download');await page.locator('.tex-export').click();await(await wait).saveAs('test-results/sample-'+engine+'.pdf');return log;}
try{
  await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>!!window.editorManager);
  await page.locator('[data-view=reader]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-read]').length===54);console.log('PASS all 54 samples appear in reading library');
  await page.locator('[data-view=write]').click();
  const chinese=await compile('LaTeX/main.tex','xetex');assert.match(chinese,/Database file #1: references.bib/);assert.match(chinese,/makeindex|MakeIndex/i);console.log('PASS public Chinese multi-file TEX, macro, bibliography, index and PDF export');
  await compile('LaTeX/latin.tex','pdftex');console.log('PASS public Latin pdfLaTeX PDF');
  for(const [path,prefix,expected] of [['代码/example.js','fu','function'],['代码/example.py','de','def'],['代码/example.json','tr','true'],['LaTeX/latin.tex','\\fr','\\frac'],['HTML/index.html','<sec','section']]){
    console.log('CHECK highlighting/completion '+path);await open(path);await page.waitForFunction(()=>document.querySelectorAll('.cm-content span').length>0);await page.evaluate(prefix=>{const editor=editorManager.editor;editor.dispatch({selection:{anchor:editor.state.doc.length+prefix.length+1},changes:{from:editor.state.doc.length,insert:'\n'+prefix}});editor.focus();},prefix);await page.keyboard.press('Control+Space');await page.locator('.cm-tooltip-autocomplete').waitFor();assert.ok((await page.locator('.cm-tooltip-autocomplete').innerText()).includes(expected),path);await page.keyboard.press('Escape');await page.locator('#quick-undo').click();
  }
  console.log('PASS representative HTML, LaTeX, JavaScript, Python and JSON highlighting/completion');assert.deepEqual(errors,[]);await writeFile('test-results/sample-results.json',JSON.stringify({readingFiles:54,checks:['all reading entries','Chinese XeLaTeX multi-file PDF','pdfLaTeX PDF','highlighting and completions'],errors},null,2));
}finally{await browser.close();}
