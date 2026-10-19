import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {startSourceAppServer} from './source-app-server.mjs';
import {openRecentFile} from './start-page-helper.mjs';

const main=`VelaPlugins.register('test.formats',{activate(vela){
 window.formatQA={mounts:0,cleanups:0,aborts:0,api:vela};
 window.formatQA.unregister=vela.formats.register({id:'test.epub',extensions:['.epub'],sourceExtensions:['.vepub'],
 async importBytes(bytes,name){return {name:name.replace(/\\.epub$/i,'.vepub'),text:JSON.stringify({body:'第一章\\n正文 '+bytes.length})};},
 validate:JSON.parse,plainText:source=>JSON.parse(source).body,
 toHtml:source=>'<p>'+JSON.parse(source).body+'</p><script>window.BAD_BOOK=true</script>',
 render({root,doc,onChange,signal,exportBinary}){
   formatQA.mounts++;root.innerHTML='<textarea data-book-edit></textarea><button data-book-save>保存编辑</button><button data-book-export>导出 MOBI</button>';
   const input=root.querySelector('textarea');input.value=JSON.parse(doc.text).body;
   formatQA.lastChange=onChange;
   root.querySelector('[data-book-save]').onclick=()=>onChange(JSON.stringify({body:input.value}));
   root.querySelector('[data-book-export]').onclick=()=>exportBinary('book.mobi',new Uint8Array([0,1,2,3,255]),'application/x-mobipocket-ebook');
   signal.addEventListener('abort',()=>formatQA.aborts++,{once:true});
   return ()=>formatQA.cleanups++;
 }
 });
}});`;
const record={manifest:{id:'test.formats',name:'文档格式测试',version:'1.0.0',main:'main.js',vela:{api:'>=4 <5',requiredCapabilities:['document-formats-v2']}},files:{'main.js':Buffer.from(main).toString('base64')},enabled:true};
const seed={version:1,documents:[{id:'plain',name:'普通.txt',text:'普通正文',updatedAt:1}],activeId:'plain',openIds:['plain'],settings:{theme:'light'}};
const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,...(process.env.WENZHOU_CHROME?{executablePath:process.env.WENZHOU_CHROME}:{channel:'chrome'})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({seed,record})=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));if(!localStorage.getItem('wenzhou.plugins'))localStorage.setItem('wenzhou.plugins',JSON.stringify([record]));},{seed,record});
 await page.goto(server.url);await page.waitForFunction(()=>window.formatQA);await openRecentFile(page,page.locator('[data-recent="plain"]'));
 assert.ok((await page.locator('#file-input').getAttribute('accept')).includes('.epub'));
 await page.locator('#file-input').setInputFiles({name:'book.epub',mimeType:'application/epub+zip',buffer:Buffer.from('PK book fixture')});
 await page.locator('[data-book-edit]').waitFor();assert.match(await page.locator('#current-name').textContent(),/book.vepub/);
 await page.locator('[data-book-edit]').fill('第一章\n修改后的正文');await page.locator('[data-book-save]').click();
 await page.locator('#quick-save').click();
 let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
 const book=stored.documents.find(d=>d.name==='book.vepub');assert.equal(JSON.parse(book.text).body,'第一章\n修改后的正文');assert.equal(book.kind,'PLUGIN');
 const downloadEvent=page.waitForEvent('download');await page.locator('[data-book-export]').click();const download=await downloadEvent;
 assert.equal(download.suggestedFilename(),'book.mobi');assert.deepEqual(await readFile(await download.path()),Buffer.from([0,1,2,3,255]));
 console.log('PASS registered EPUB import, editable source save, and non-ZIP binary download');

 if(!await page.locator('[data-doc="plain"]').isVisible())await page.locator('#mobile-library').click();
 await page.locator('[data-doc="plain"]').click();assert.equal(await page.evaluate(()=>formatQA.cleanups),await page.evaluate(()=>formatQA.aborts));
 await page.evaluate(()=>formatQA.lastChange('{"body":"STALE"}'));
 assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),'普通正文');
 await page.locator('[data-doc="'+book.id+'"]').click();await page.locator('[data-book-edit]').waitFor();
 await page.locator('[data-view="reader"]').click();await page.locator('[data-read="'+book.id+'"]').click();
 await page.waitForFunction(()=>document.querySelector('.reader-content')?.textContent.includes('修改后的正文'));
 assert.equal(await page.locator('.reader-content script').count(),0);assert.equal(await page.evaluate(()=>window.BAD_BOOK),undefined);
 await page.locator('#reader-back').click();await page.locator('[data-view="write"]').click();await page.locator('[data-book-edit]').waitFor();
 console.log('PASS preview cleanup, stale callback isolation, and sanitized reading view');

 // A binary attachment can be opened even without a .vela project; the original stays binary.
 await page.evaluate(async()=>{
   const workspace=JSON.parse(localStorage.getItem('wenzhou.workspace'));
   workspace.entries=[{path:'原书.epub',name:'原书.epub',size:4,editable:false,directory:false}];
   const request=indexedDB.open('vela-project-api',2);
   await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>{for(const name of ['files','state','snapshots','trash'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};request.onerror=reject;request.onsuccess=resolve;});
   const db=request.result,tx=db.transaction('files','readwrite');
   tx.objectStore('files').put({blob:new Blob([new Uint8Array([80,75,0,255])]),revision:'r:book',modifiedAt:new Date(0).toISOString()},'原书.epub');
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject;});db.close();localStorage.setItem('wenzhou.workspace',JSON.stringify(workspace));
 });
 await page.addInitScript(()=>{const workspace=JSON.parse(localStorage.getItem('wenzhou.workspace'));workspace.entries=[{path:'原书.epub',name:'原书.epub',size:4,editable:false,directory:false}];localStorage.setItem('wenzhou.workspace',JSON.stringify(workspace));});
 await page.reload();await page.waitForFunction(()=>window.formatQA);await openRecentFile(page,page.locator('[data-recent="'+book.id+'"]'));
 if(!await page.locator('[data-project-file="原书.epub"]').isVisible())await page.locator('#mobile-library').click();
 await page.locator('[data-project-file="原书.epub"]').click();await page.locator('[data-book-edit]').waitFor();
 assert.equal(await page.locator('#current-name').textContent(),'原书.vepub');
 stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')));
 assert.ok(stored.entries.some(e=>e.path==='原书.epub'));assert.ok(!stored.documents.some(d=>d.name==='原书.epub'));
 console.log('PASS workspace binary attachment opens as a separate editable source');

 await page.locator('#more-tools').click();await page.locator('#plugins').click();
 const card=page.locator('.plugin-card').filter({hasText:'文档格式测试'});await card.locator('[data-plugin-enable]').click();
 await page.waitForFunction(()=>document.querySelector('#preview')?.textContent.includes('编辑源已保留'));
 await page.locator('#dialog-close').click();
 const before=await page.evaluate(()=>velaEditorView.state.doc.toString());await page.evaluate(()=>formatQA.lastChange('{"body":"LATE"}'));
 assert.equal(await page.evaluate(()=>velaEditorView.state.doc.toString()),before);
 const sourceId=await page.evaluate(()=>JSON.parse(localStorage.getItem('wenzhou.workspace')).documents.find(d=>d.name==='原书.vepub').id);
 await page.reload();await openRecentFile(page,page.locator('[data-recent="'+sourceId+'"]'));await page.waitForFunction(()=>document.querySelector('#preview')?.textContent.includes('编辑源已保留'));
 assert.ok(!errors.length,errors.join('\n'));
 console.log('PASS disabling and restarting preserve source documents and detach plugin edits');
}finally{await browser.close();await server.close();}
