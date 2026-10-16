// LaTeX editing and preview against a full build with the real WasmTeX engine:
// outline, completion, auto \end, live checks, continuous PDF, zoom, compile problems, and source ↔ PDF jumps.
// Run `npm run build` first and serve dist/web (node scripts/serve.mjs, or VELA_TEST_URL for another port).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openRecentFile} from './start-page-helper.mjs';

const source=String.raw`\documentclass{ctexart}
\begin{document}
\section{引言}
文舟编辑器第一段落用于定位测试。
\subsection{背景}
第二页的独特句子在这里。
\newpage
\section{结论}
最后一页的收尾文字。
\end{document}`;
const broken=String.raw`\documentclass{ctexart}
\begin{document}
正常文字。
\undefinedcommandhere
\end{document}`;
const url=process.env.VELA_TEST_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let failed=0;const check=async(name,run)=>{try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,'\n',error);}};
await mkdir('test-results',{recursive:true});

async function open(text,{viewport={width:1280,height:900}}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route=>route.abort());
  await context.addInitScript(text=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'tex',name:'main.tex',text,updatedAt:1}],activeId:'tex',openIds:['tex'],settings:{theme:'light'}}));},text);
  await page.goto(url);await openRecentFile(page,page.locator('[data-recent=tex]'));await page.waitForSelector('.cm-editor');
  return {page,context,errors};
}
const editorText=page=>page.evaluate(()=>window.velaEditorView?.state.doc.toString()??document.querySelector('.cm-content').innerText);
const cursorLine=page=>page.evaluate(()=>{const view=window.velaEditorView;return view.state.doc.lineAt(view.state.selection.main.head).number;});
const placeCursor=(page,text)=>page.evaluate(text=>{const view=window.velaEditorView,at=view.state.doc.toString().indexOf(text);view.dispatch({selection:{anchor:at+2}});view.focus();},text);
async function compile(page){await page.locator('[data-display=preview]').click();await page.locator('.tex-compile').click();await page.waitForFunction(()=>!document.querySelector('.tex-compile').disabled,{},{timeout:180000});}

try{
  await check('the outline lists LaTeX sections by printed title and level',async()=>{
    const {page,context}=await open(source);
    const titles=await page.evaluate(()=>{const button=document.querySelector('#outline-toggle');if(!document.body.classList.contains('show-outline'))button.click();return [...document.querySelectorAll('#outline-shell [data-row], #outline-shell button')].map(node=>node.textContent.trim()).filter(Boolean);});
    const text=titles.join('|');assert.match(text,/引言/);assert.match(text,/背景/);assert.match(text,/结论/);assert.doesNotMatch(text,/\\section/);
    await context.close();
  });
  await check('completion offers commands and environments; \\begin + Enter closes the environment',async()=>{
    const {page,context}=await open(source);
    await page.evaluate(()=>{const view=window.velaEditorView,line=view.state.doc.line(3);view.dispatch({selection:{anchor:line.from}});view.focus();});
    await page.keyboard.insertText('\\subsec');await page.keyboard.press('Control+Space');await page.locator('.cm-tooltip-autocomplete').waitFor();
    assert.match(await page.locator('.cm-tooltip-autocomplete').innerText(),/\\subsection/);await page.keyboard.press('Escape');
    await page.evaluate(()=>{const view=window.velaEditorView,at=view.state.doc.toString().indexOf('\\subsec');view.dispatch({changes:{from:at,to:at+7,insert:''}});});
    await page.evaluate(()=>{const view=window.velaEditorView,line=view.state.doc.line(4);view.dispatch({selection:{anchor:line.to}});view.focus();});
    await page.keyboard.press('Enter');await page.keyboard.insertText('\\begin{itemize}');await page.keyboard.press('Enter');
    const text=await editorText(page);assert.match(text,/\\begin\{itemize\}\n\t\\item \n\\end\{itemize\}/);
    await page.keyboard.insertText('第一项');assert.match(await editorText(page),/\\item 第一项/);
    await context.close();
  });
  await check('live checks mark unbalanced braces and mismatched environments',async()=>{
    const {page,context}=await open(source.replace('第二页的独特句子在这里。','\\textbf{没有闭合 \\begin{quote}'));
    await page.waitForSelector('.cm-lint-marker-error',{timeout:5000});
    await page.locator('.cm-lint-marker-error').first().hover();await page.waitForSelector('.cm-tooltip-lint');assert.match(await page.locator('.cm-tooltip-lint').first().innerText(),/花括号|\\begin\{quote\}/);
    await context.close();
  });
  await check('the preview shows every page in one scrolling column with zoom',async()=>{
    const {page,context,errors}=await open(source);await compile(page);
    assert.equal(await page.locator('.tex-status').textContent(),'编译完成');assert.match(await page.locator('.tex-time').textContent(),/\d+\.\d s/);
    assert.equal(await page.locator('.pdf-column .pdf-page').count(),2);await page.waitForFunction(()=>document.querySelector('.pdf-page canvas')?.width>0);
    const before=await page.locator('.pdf-page').first().evaluate(node=>node.getBoundingClientRect().width);
    await page.locator('.tex-zoom-in').click();await page.waitForFunction(width=>document.querySelector('.pdf-page').getBoundingClientRect().width>width+5,before);
    assert.equal(await page.locator('.tex-zoom-reset').textContent(),'110%');await page.locator('.tex-zoom-reset').click();
    await page.locator('.pdf-next').click();await page.waitForFunction(()=>document.querySelector('.pdf-position').textContent.startsWith('2 /'));
    await page.screenshot({path:'test-results/latex-preview-continuous.png'});assert.deepEqual(errors,[]);await context.close();
  });
  await check('locating the cursor line scrolls the PDF to its page and marks it',async()=>{
    const {page,context}=await open(source);await compile(page);
    await page.locator('[data-display=source]').click();await placeCursor(page,'最后一页的收尾文字');await page.locator('[data-display=preview]').click();
    await page.locator('.tex-locate').click();await page.waitForFunction(()=>/已定位到第 2 页/.test(document.querySelector('.tex-status').textContent),{},{timeout:15000}).catch(async error=>{console.log('status:',await page.locator('.tex-status').textContent(),'pages:',await page.locator('.pdf-page').count());throw error;});
    assert.equal(await page.locator('.pdf-page[data-page="2"] .pdf-sync-mark').count(),1);await context.close();
  });
  await check('double-clicking PDF text jumps to the source line',async()=>{
    const {page,context}=await open(source);await compile(page);
    const span=page.locator('.pdf-page[data-page="1"] .textLayer span').filter({hasText:'定位测试'}).first();await span.waitFor({timeout:20000});
    await span.dblclick();await page.waitForFunction(()=>!document.querySelector('#editor').hidden);
    assert.equal(await cursorLine(page),4);await context.close();
  });
  await check('compile errors are listed, jump to the line and appear in the editor',async()=>{
    const {page,context}=await open(broken);await page.locator('[data-display=preview]').click();await page.locator('.tex-compile').click();
    await page.waitForFunction(()=>!document.querySelector('.tex-compile').disabled,{},{timeout:180000});
    assert.equal(await page.locator('.tex-status').textContent(),'编译失败');
    const problem=page.locator('.tex-problems .tex-error.error').first();await problem.waitFor();assert.match(await page.locator('.tex-problem-summary').textContent(),/个错误/);
    assert.match(await problem.textContent(),/main\.tex:4/);await problem.click();await page.waitForFunction(()=>!document.querySelector('#editor').hidden);
    assert.equal(await cursorLine(page),4);await page.waitForSelector('.cm-lint-marker-error');await context.close();
  });
  await check('auto-compile is remembered across reloads',async()=>{
    const {page,context}=await open(source);await page.locator('[data-display=preview]').click();
    await page.locator('.tex-auto input').check();await page.reload();await openRecentFile(page,page.locator('[data-recent=tex]'));await page.locator('[data-display=preview]').click();
    assert.equal(await page.locator('.tex-auto input').isChecked(),true);await page.locator('.tex-auto input').uncheck();await context.close();
  });
  await check('the toolbar fits a phone width without horizontal scrolling',async()=>{
    const {page,context}=await open(source,{viewport:{width:390,height:844}});await page.locator('[data-display=preview]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/latex-preview-phone.png'});await context.close();
  });
}finally{await browser.close();}
if(failed){console.error(failed+' failed');process.exit(1);}
