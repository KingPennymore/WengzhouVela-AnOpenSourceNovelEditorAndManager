import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

// Real PDF.js rendering with portrait and landscape pages, without a TeX compile.
function fixturePdf(){
  const stream='0 0.4 0.2 RG 2 w 10 10 575 822 re S';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << >> /Contents 6 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(pdf+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const bundle=await build({stdin:{contents:"import {PdfPreview} from './web/pdf-preview.mjs';window.PdfLayoutPreview=PdfPreview;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
const root=path.resolve('dist/web');
const server=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/pdf-layout.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle.outputFiles[0].text);return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>localStorage.setItem('wenzhou.workspace',JSON.stringify({version:1,documents:[{id:'tex',name:'排版验证.tex',text:'',updatedAt:1},{id:'guide',name:'操作指南.txt',text:'PDF layout test',updatedAt:1}],activeId:'tex',openIds:['tex'],settings:{theme:'light',libraryOpen:false}})));
const pdf=[...fixturePdf()];
await mkdir('test-results',{recursive:true});
async function contained(name){
  await page.waitForFunction(()=>{const pane=window.pdfLayoutPane,canvas=pane?.root.querySelector('canvas'),box=pane?.root.querySelector('.pdf-canvas');return !!pane?.pdf&&canvas?.width>0&&canvas.getBoundingClientRect().height<=box.clientHeight+1&&canvas.getBoundingClientRect().width<=box.clientWidth+1;});
  await page.waitForTimeout(220);
  const sizes=await page.evaluate(()=>{const pane=window.pdfLayoutPane,rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};return {canvas:rect(pane.root.querySelector('canvas')),box:rect(pane.root.querySelector('.pdf-canvas')),root:rect(pane.root),limit:rect(pane.root.closest('.reader-viewport')||pane.root.closest('.paper')),footer:rect(document.querySelector(pane.reading?'.reader-pagebar':'.quickbar'))};});
  assert.ok(sizes.box.height>0,JSON.stringify(sizes));assert.ok(sizes.canvas.bottom<=sizes.box.bottom+1,JSON.stringify(sizes));assert.ok(sizes.canvas.bottom<=sizes.limit.bottom+1,JSON.stringify(sizes));assert.ok(sizes.root.bottom<=sizes.footer.top+1,JSON.stringify(sizes));checks.push(name);console.log('PASS '+name);
}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('.cm-editor');await page.locator('[data-display=preview]').click();await page.addScriptTag({url:'/pdf-layout.js'});
  await page.evaluate(pdf=>{const compiler={compile:async()=>({ok:true,pdf:new Uint8Array(pdf),diagnostics:[]})};window.pdfLayoutPane=new PdfLayoutPreview({compiler,fail:error=>{throw error;}});window.pdfLayoutPane.mount(document.querySelector('#preview'),{name:'排版验证.tex'});return window.pdfLayoutPane.compile();},pdf);
  await contained('平板横屏整页 PDF 下边界位于预览区内');await page.screenshot({path:'test-results/pdf-tablet-landscape.png'});
  await page.locator('#mobile-library').click();await contained('侧栏展开后 PDF 同时适应可用宽度和高度');
  await page.evaluate(()=>{const log=document.querySelector('.tex-log');log.querySelector('pre').textContent='编译日志\n'.repeat(100);log.open=true;});await contained('展开编译日志后 PDF 自动缩小并保持页尾可见');
  await page.locator('.pdf-next').click();await page.waitForFunction(()=>window.pdfLayoutPane.page===2);await contained('横向 PDF 页面按实际宽高比适应预览区');
  await page.setViewportSize({width:800,height:1280});await contained('平板竖屏重新计算 PDF 尺寸');
  await page.setViewportSize({width:390,height:844});await contained('手机窄屏 PDF 保持完整显示');
  await page.setViewportSize({width:1920,height:600});await contained('低高度宽屏 PDF 不延伸到底栏之外');
  await page.evaluate(()=>{document.querySelector('.tex-log').open=false;window.pdfLayoutPane.zoom=2;return window.pdfLayoutPane.render();});
  assert.ok(await page.locator('.pdf-canvas').evaluate(box=>box.scrollHeight>box.clientHeight||box.scrollWidth>box.clientWidth));await page.locator('.pdf-canvas').evaluate(box=>box.scrollTop=box.scrollHeight);checks.push('主动放大后仅在 PDF 容器内部滚动');
  await page.evaluate(()=>window.pdfLayoutPane.dispose());await page.locator('[data-view=reader]').click();await page.locator('[data-read=guide]').click();
  await page.evaluate(pdf=>{window.pdfLayoutPane=new PdfLayoutPreview({compiler:{compile:async()=>({ok:true,pdf:new Uint8Array(pdf),diagnostics:[]})},fail:error=>{throw error;}});window.pdfLayoutPane.mount(document.querySelector('.reader-content'),{name:'阅读排版.tex'},{reading:true});},pdf);
  await contained('阅读模式 PDF 下边界保持在阅读底栏上方');await page.setViewportSize({width:1280,height:800});await contained('平板阅读模式整页 PDF 自动适配');await page.screenshot({path:'test-results/pdf-tablet-reading.png'});
  assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/pdf-layout-results.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
