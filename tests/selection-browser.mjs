import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openRecentFile} from './start-page-helper.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {createVelaV2,velaText} from '../web/vela.mjs';
import {glossaryText} from '../web/glossary.mjs';
import {settled} from './wait-helpers.mjs';

// Multi-line selections in a long glossary-highlighted manuscript: the selection bar sits above the selected text (or,
// when the selection starts above the visible editor, pinned below the editor toolbar), term definitions never cover
// the cursor line, nothing pops up mid-drag, the bar hides/follows/dismisses predictably, and a
// selection update stays cheap on a large document (a hidden 6000-row tree stands in for a large workspace's file tree
// and outline, which the old i18n observer re-walked on every status-bar change). Runs against the sources (no build) unless VELA_TEST_URL is set.
const config=createVelaV2('航程');config.editor.glossaries=['人物.gly'];
const doc=(id,name,text)=>({id,name,path:'Novel/'+name,text,updatedAt:1});
const lines=[];for(let i=0;i<4000;i++)lines.push(i%40===0?`第${i/40+1}章 航程`:`林舟站在港口，望着远处的灯塔。海风吹过，潮水一遍遍拍打着石阶，第${i}行。`);
const seed={version:1,documents:[doc('book','正文.txt',lines.join('\n')),doc('config','.vela',velaText(config)),doc('terms','人物.gly',glossaryText({version:1,entries:[{term:'林舟',definition:'航海记录者，负责航海日志与夜间值守。',category:'人物',aliases:['舟']},{term:'灯塔',definition:'航程的目的地',aliases:[]}]}))],activeId:'book',openIds:['book'],settings:{theme:'light',highlightTerms:true}};
const server=process.env.VELA_TEST_URL?null:await startSourceAppServer(),url=process.env.VELA_TEST_URL||server.url;
const browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[],errors=[];
await mkdir('test-results/selection',{recursive:true});
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const overlap=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
const box=r=>r&&{left:r.left,top:r.top,right:r.right,bottom:r.bottom};

async function open(options){
  const context=await browser.newContext(options);await context.addInitScript(seed=>{if(!localStorage.getItem('wenzhou.workspace'))localStorage.setItem('wenzhou.workspace',JSON.stringify(seed));},seed);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'/?ui=harmonyos');await openRecentFile(p,p.locator('[data-recent=book]'));await p.waitForSelector('.vela-term');await settled(p);return p;
}
// Geometry of the selection bar, every painted selection rectangle, the cursor line and any term definition.
const geometry=p=>p.evaluate(()=>{const v=velaEditorView,m=document.querySelector('#selection-menu'),tip=document.querySelector('.cm-tooltip-hover'),r=v.state.selection.main,line=v.coordsAtPos(r.head,r.head===r.to&&!r.empty?-1:1),rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom};};
  return {menu:m.hidden?null:rect(m),pinned:m.classList.contains('selection-pinned'),tip:tip?rect(tip):null,selection:[...document.querySelectorAll('.cm-selectionBackground')].map(rect).filter(b=>b.right-b.left>1&&b.bottom-b.top>1),line:line&&{left:v.contentDOM.getBoundingClientRect().left,right:v.contentDOM.getBoundingClientRect().right,top:line.top,bottom:line.bottom},range:[r.from,r.to],editor:rect(v.scrollDOM)};});
const assertClear=(g,label)=>{assert.ok(g.menu,label+': bar shown');assert.equal(g.pinned,false,label+': bar pinned');assert.ok(g.menu.bottom<=Math.min(...g.selection.map(s=>s.top))+.5,label+': bar not above the selection');for(const s of g.selection)assert.ok(!overlap(g.menu,s),label+': bar covers selection '+JSON.stringify({menu:g.menu,s}));if(g.line)assert.ok(!overlap(g.menu,g.line),label+': bar covers cursor line');};
const lineBox=(p,n)=>p.locator('.cm-line').nth(n).boundingBox();

try{
  const p=await open({viewport:{width:1280,height:850}});
  await check('desktop drag-select: no definition or bar while dragging, bar clear of the selection after release',async()=>{
    const start=await lineBox(p,3),term=await p.locator('.cm-line').nth(6).locator('.vela-term').first().boundingBox();
    await p.mouse.move(start.x+60,start.y+start.height/2);await p.mouse.down();await p.mouse.move(term.x+6,term.y+term.height/2,{steps:10});await p.waitForTimeout(700);
    let g=await geometry(p);assert.equal(g.tip,null,'definition popped up mid-drag');assert.equal(g.menu,null,'bar shown mid-drag');
    await p.mouse.up();await p.waitForSelector('#selection-menu:not([hidden])');g=await geometry(p);assert.ok(g.range[1]>g.range[0]);assertClear(g,'after drag');
    await p.mouse.move(term.x+4,term.y+term.height/2);await p.waitForTimeout(700);assert.equal((await geometry(p)).tip,null,'definition over a selection');
    await p.screenshot({path:'test-results/selection/desktop-drag.png'});
  });
  await check('a click that collapses the selection hides the bar at once',async()=>{
    const line=await lineBox(p,12);await p.mouse.click(line.x+100,line.y+line.height/2);assert.equal(await p.locator('#selection-menu').isHidden(),true);await p.waitForTimeout(400);assert.equal(await p.locator('#selection-menu').isHidden(),true);
  });
  await check('double click, triple click and Shift+click selections place the bar clear of the text',async()=>{
    const line=await lineBox(p,8);await p.mouse.dblclick(line.x+250,line.y+line.height/2);await p.waitForSelector('#selection-menu:not([hidden])');assertClear(await geometry(p),'double click');
    await p.mouse.click(line.x+250,line.y+line.height/2,{clickCount:3});await p.waitForSelector('#selection-menu:not([hidden])');assertClear(await geometry(p),'triple click');
    const end=await lineBox(p,14);await p.keyboard.down('Shift');await p.mouse.click(end.x+120,end.y+end.height/2);await p.keyboard.up('Shift');await p.waitForSelector('#selection-menu:not([hidden])');assertClear(await geometry(p),'shift click');
  });
  await check('Shift+arrow extension hides the stale bar and shows it again once the selection settles',async()=>{
    await p.keyboard.press('Shift+ArrowDown');assert.equal(await p.locator('#selection-menu').isHidden(),true);await p.waitForSelector('#selection-menu:not([hidden])');assertClear(await geometry(p),'shift arrow');
  });
  await check('typing over the selection removes the bar immediately',async()=>{
    await p.keyboard.type('潮');assert.equal(await p.locator('#selection-menu').isHidden(),true);await p.keyboard.press('Control+z');
  });
  await check('the bar follows a scrolled selection and stays closed after Escape until the next gesture',async()=>{
    await p.evaluate(()=>{const v=velaEditorView,l=v.state.doc.line(14);v.dispatch({selection:{anchor:l.from+2,head:l.from+12},scrollIntoView:true});v.focus();});await p.waitForSelector('#selection-menu:not([hidden])');const before=(await geometry(p)).menu;
    await p.evaluate(()=>velaEditorView.scrollDOM.scrollTop+=60);await settled(p);await p.waitForSelector('#selection-menu:not([hidden])').catch(()=>{});let g=await geometry(p);assertClear(g,'after scroll');assert.ok(Math.abs(before.top-60-g.menu.top)<2,'bar did not follow the scroll');
    await p.keyboard.press('Escape');await p.locator('#selection-menu').waitFor({state:'hidden'}).catch(()=>{});assert.equal(await p.locator('#selection-menu').isHidden(),true,'bar came back after Escape');
    await p.keyboard.press('Shift+ArrowRight');await p.waitForSelector('#selection-menu:not([hidden])');
  });
  await check('Copy keeps the selection and does not reopen the bar',async()=>{
    await p.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:url});const range=(await geometry(p)).range;await p.locator('#selection-menu button',{hasText:'复制'}).click();await p.waitForTimeout(450);
    assert.deepEqual((await geometry(p)).range,range);assert.equal(await p.locator('#selection-menu').isHidden(),true);
  });
  await check('term definitions open away from the cursor line and only without a selection',async()=>{
    for(const [cursorLine,termLine] of [[12,8],[5,9]]){
      await p.evaluate(n=>{const v=velaEditorView;v.dispatch({selection:{anchor:v.state.doc.line(n).from+3}});v.focus();},cursorLine);await p.mouse.move(5,5);await p.waitForTimeout(100);
      const term=await p.locator('.cm-line').nth(termLine-1).locator('.vela-term').first().boundingBox();await p.mouse.move(term.x+5,term.y+term.height/2);await p.waitForSelector('.cm-tooltip-hover .vela-term-tip');
      const g=await geometry(p);assert.ok(!overlap(g.tip,g.line),'definition covers the cursor line '+JSON.stringify(g));assert.ok(!overlap(g.tip,{left:term.x,top:term.y,right:term.x+term.width,bottom:term.y+term.height}),'definition covers its term');
    }
    await p.evaluate(()=>{const v=velaEditorView;v.dispatch({selection:{anchor:v.state.doc.line(8).from,head:v.state.doc.line(8).to}});});await p.waitForTimeout(100);assert.equal((await geometry(p)).tip,null,'selection did not close the definition');
  });
  await check('multiple ranges keep the bar on the main range',async()=>{
    await p.evaluate(()=>{const v=velaEditorView,a=v.state.doc.line(9),b=v.state.doc.line(13);const s=v.state.selection.constructor;v.dispatch({selection:s.create([s.range(a.from+2,a.from+8),s.range(b.from+2,b.from+8)],1),userEvent:'select.pointer'});v.focus();});
    await p.waitForSelector('#selection-menu:not([hidden])');assertClear(await geometry(p),'multi-range');
  });
  await check('selection updates on a 4000-line manuscript stay cheap (scripting per update)',async()=>{
    const cdp=await p.context().newCDPSession(p);await cdp.send('Performance.enable');const metric=async()=>(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='ScriptDuration').value;
    await p.evaluate(()=>{const tree=document.createElement('div');tree.id='large-tree-fixture';tree.hidden=true;tree.innerHTML=Array.from({length:6000},(_,i)=>`<button title="文件 ${i}"><span>文件 ${i}.txt</span><small>${i} 字</small></button>`).join('');document.body.append(tree);});
    const before=await metric();const steps=await p.evaluate(async()=>{const v=velaEditorView;v.focus();let i=0;await new Promise(done=>{const step=()=>{if(++i>60)return done();v.dispatch({selection:{anchor:300,head:300+i*1500},userEvent:'select.pointer'});requestAnimationFrame(step);};requestAnimationFrame(step);});return i-1;});
    const all=await p.evaluate(async()=>{const v=velaEditorView,t=performance.now();v.dispatch({selection:{anchor:0,head:v.state.doc.length}});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;});
    const perUpdate=(await metric()-before)*1000/steps;console.log('  script ms per selection update',perUpdate.toFixed(2),'select-all frame ms',all.toFixed(1));
    assert.ok(perUpdate<6,'selection update scripting '+perUpdate.toFixed(2)+' ms');assert.ok(all<120,'select all took '+all.toFixed(1)+' ms');
    await p.evaluate(()=>document.querySelector('#large-tree-fixture').remove());await p.waitForFunction(()=>/选中 [\d,]+ 字/.test(document.querySelector('#selection-count')?.textContent)).catch(()=>{});assert.match(await p.locator('#selection-count').textContent(),/选中 [\d,]+ 字/);
  });
  await p.context().close();

  const m=await open({viewport:{width:390,height:780},hasTouch:true,isMobile:true});
  await check('phone: the bar sits clear of the selection and of the selection handles',async()=>{
    for(const n of [6,12,18]){await m.evaluate(n=>{const v=velaEditorView,l=v.state.doc.line(n);v.dispatch({selection:{anchor:l.from+3,head:l.from+20},userEvent:'select.pointer',scrollIntoView:true});v.focus();},n);await m.waitForSelector('#selection-menu:not([hidden])');const g=await geometry(m);assertClear(g,'phone line '+n);
      const bottom=Math.max(...g.selection.map(s=>s.bottom)),top=Math.min(...g.selection.map(s=>s.top));assert.ok(g.menu.bottom<=top&&bottom>top,'bar not above the selection '+JSON.stringify(g));assert.ok(g.menu.left>=0&&g.menu.right<=390,'bar off screen');await m.evaluate(()=>velaEditorView.dispatch({selection:{anchor:0}}));}
    await m.screenshot({path:'test-results/selection/phone.png'});
  });
  await check('phone: a selection starting above the editor pins the bar just below the editor toolbar',async()=>{
    await m.evaluate(()=>{const v=velaEditorView;v.dispatch({selection:{anchor:0,head:v.state.doc.line(400).to},userEvent:'select.pointer'});v.focus();});await m.waitForSelector('#selection-menu:not([hidden])');await m.evaluate(()=>velaEditorView.scrollDOM.scrollTop=300);await m.waitForTimeout(600);await m.waitForSelector('#selection-menu.selection-pinned:not([hidden])');const g=await geometry(m);
    assert.ok(g.menu.top>=g.editor.top&&g.menu.top<=g.editor.top+20,'pinned bar not below the toolbar '+JSON.stringify({menu:g.menu,editor:g.editor}));assert.ok(g.menu.left>=0&&g.menu.right<=390,'bar off screen');await m.screenshot({path:'test-results/selection/phone-pinned.png'});
    await m.evaluate(()=>velaEditorView.dispatch({selection:{anchor:5}}));await m.waitForFunction(()=>document.querySelector('#selection-menu').hidden);
  });
  await check('phone preview: whole-text selections show the bar without flicker, scrolled or not',async()=>{
    await m.locator('[data-display=preview]').click();await m.waitForFunction(()=>document.querySelector('#preview')?.textContent.length>200);await settled(m);
    for(const scrolled of [false,true]){
      const g=await m.evaluate(async scrolled=>{const preview=document.querySelector('#preview'),menu=document.querySelector('#selection-menu'),scroller=[preview,...preview.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+50&&/(auto|scroll)/.test(getComputedStyle(e).overflowY))||document.scrollingElement;if(scrolled)scroller.scrollTop=600;
        await new Promise(r=>setTimeout(r,300));let toggles=0;new MutationObserver(r=>toggles+=r.length).observe(menu,{attributes:true,attributeFilter:['hidden']});const range=document.createRange();range.selectNodeContents(preview);getSelection().removeAllRanges();getSelection().addRange(range);
        await new Promise(r=>setTimeout(r,1500));const b=menu.getBoundingClientRect(),edge=preview.getBoundingClientRect();return {toggles,hidden:menu.hidden,menu:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},selection:[...range.getClientRects()].filter(r=>r.width>1&&r.bottom>edge.top&&r.top<edge.bottom).map(r=>({left:r.left,top:Math.max(r.top,edge.top),right:r.right,bottom:Math.min(r.bottom,edge.bottom)}))};},scrolled);
      assert.equal(g.hidden,false,'no bar for the preview selection');assert.ok(g.toggles<=2,'bar flickered '+g.toggles+' times');assert.ok(g.menu.left>=0&&g.menu.right<=390,'bar off screen');
      await m.screenshot({path:`test-results/selection/phone-preview${scrolled?'-scrolled':''}.png`});await m.evaluate(()=>getSelection().removeAllRanges());await m.waitForTimeout(250);
    }
  });
  await m.context().close();
  assert.deepEqual(errors,[]);
  console.log(`selection browser checks passed (${checks.length})`);
}finally{await browser.close();await server?.close();}
