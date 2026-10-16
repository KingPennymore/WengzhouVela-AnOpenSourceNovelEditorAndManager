import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportPdf} from './tex-compiler.mjs';
import {t} from './i18n.mjs';
import {mountTexComponents} from './tex-component-view.mjs';
import {plainTexLine,findInPages,findSourceLine} from './latex-sync.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf/pdf.worker.mjs',location.href).href;
const escape=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const storage={get:key=>{try{return localStorage.getItem(key);}catch{return null;}},set:(key,value)=>{try{localStorage.setItem(key,value);}catch{}}};
const ZOOMS=[0.5,0.67,0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.5,3];

/**
 * TeX / PDF preview. Editing uses a continuous, lazily rendered page column with zoom, optional auto-compile,
 * a structured problem list and text-based jumps between source and PDF (WasmTeX does not produce SyncTeX yet).
 * Reading mode keeps whole-page turning (single or double) for the reader.
 */
export class PdfPreview {
  constructor({compiler,fail,jump,readingMode,source,onDiagnostics}){Object.assign(this,{compiler,fail,jump,readingMode,source,onDiagnostics});this.epoch=0;this.queued=false;}
  cancelRendering(){for(const task of this.renderTasks||[])task.cancel();for(const task of this.textTasks||[])task.cancel();this.textTasks=[];this.renderTasks=[];for(const slot of this.slots||[])this.release(slot);}
  dispose(){this.epoch++;this.searchEpoch=(this.searchEpoch||0)+1;this.renderEpoch=(this.renderEpoch||0)+1;this.onPage=null;clearTimeout(this.autoTimer);this.abort?.abort();this.cancelRendering();this.observer?.disconnect();this.loading?.destroy();this.resize?.disconnect();this.root=null;this.slots=[];this.pageTexts=null;}
  get continuous(){return !this.reading;}
  mount(root,doc,{reading=false,onReady}={}){
    // Re-rendering the same preview (split view, file refresh) keeps the PDF; an edit only arms auto-compile.
    if(this.root===root&&this.doc?.id===doc.id&&this.reading===reading&&root.querySelector(':scope>.tex-tools')){root.classList.add('tex-pdf');root.classList.toggle('tex-continuous',this.continuous);root.classList.toggle('tex-reading',reading);this.doc=doc;this.changed();return;}
    this.dispose();this.root=root;this.doc=doc;this.reading=reading;this.onReady=onReady;this.page=1;this.zoom=Number(storage.get('vela.pdf.zoom'))||1;this.compiling=false;this.pdf=null;this.renderEpoch=0;this.slots=[];
    const isPdf=/\.pdf$/i.test(doc.name),auto=storage.get('vela.tex.autoCompile')==='1';
    root.classList.add('tex-pdf');root.classList.toggle('tex-continuous',this.continuous);
    root.innerHTML=`<div class="tex-tools" role="toolbar" aria-label="${t('排版工具')}">
      <select class="tex-engine" aria-label="${t('编译引擎')}"><option value="xetex">XeLaTeX</option><option value="pdftex">pdfLaTeX</option></select>
      <button class="primary tex-compile" title="${t('编译 PDF')} (Ctrl+Enter)">${t('编译 PDF')}</button><button class="secondary tex-cancel" hidden>${t('取消')}</button>
      <label class="checkbox tex-auto" title="${t('停止输入 2 秒后自动编译')}"><input type="checkbox" ${auto?'checked':''}>${t('自动编译')}</label>
      <button class="secondary tex-export" disabled>${t('导出 PDF')}</button>
      <span class="tex-zoom" role="group" aria-label="${t('缩放')}"><button class="secondary tex-zoom-out" aria-label="${t('缩小')}">−</button><button class="secondary tex-zoom-reset" aria-label="${t('适合宽度')}">100%</button><button class="secondary tex-zoom-in" aria-label="${t('放大')}">+</button></span>
      ${this.source&&!reading&&!isPdf?`<button class="secondary tex-locate" title="${t('在 PDF 中定位光标所在行')} (Ctrl+Alt+J)">${t('定位到 PDF')}</button>`:''}
      <span class="tex-status" role="status" aria-live="polite"></span><span class="tex-time"></span></div>
      <div class="tex-problems" hidden><div class="tex-problem-summary"></div><div class="tex-diagnostics"></div></div>
      <details class="tex-log"><summary>${t('编译日志')}</summary><pre></pre></details>
      <div class="pdf-tools"><button class="pdf-previous" disabled aria-label="${t('上一页')}">←</button><span class="pdf-position"></span><button class="pdf-next" disabled aria-label="${t('下一页')}">→</button></div>
      <div class="pdf-canvas" tabindex="0" aria-label="${t('PDF 页面')}"><p class="tex-empty">${isPdf?'':t('点击“编译 PDF”生成预览。')}</p></div>`;
    if(this.compiler?.assets&&!isPdf)mountTexComponents(root,this.compiler,this.fail);
    const $=selector=>root.querySelector(selector);
    $('.tex-compile').onclick=()=>this.compile().catch(this.fail);$('.tex-cancel').onclick=()=>this.abort?.abort();$('.tex-export').onclick=()=>exportPdf(doc.name,this.bytes).catch(this.fail);
    $('.pdf-previous').onclick=()=>this.turn(-1);$('.pdf-next').onclick=()=>this.turn(1);
    $('.tex-auto input').onchange=event=>{storage.set('vela.tex.autoCompile',event.target.checked?'1':'0');if(event.target.checked)this.changed();};
    $('.tex-zoom-in').onclick=()=>this.setZoom(ZOOMS.find(value=>value>this.zoom+0.001)||this.zoom);$('.tex-zoom-out').onclick=()=>this.setZoom([...ZOOMS].reverse().find(value=>value<this.zoom-0.001)||this.zoom);$('.tex-zoom-reset').onclick=()=>this.setZoom(1);
    if($('.tex-locate'))$('.tex-locate').onclick=()=>this.locate().catch(this.fail);
    $('.pdf-canvas').addEventListener('dblclick',event=>this.reverse(event));
    this.resize=new ResizeObserver(()=>{if(this.pdf)this.render().catch(this.fail);});this.resize.observe($('.pdf-canvas'));
    const config=this.compiler?.host?.project?.(doc)?.config;$('.tex-engine').value=config?.formats?.latex?.engine||'xetex';
    this.showZoom();
    if(reading){root.classList.add('tex-reading');if(!isPdf)this.compile().catch(this.fail);}
    if(isPdf){$('.tex-tools').querySelectorAll('.tex-engine,.tex-compile,.tex-cancel,.tex-auto,.tex-export,.tex-status').forEach(node=>node.hidden=true);$('.tex-log').hidden=true;if(reading)$('.tex-tools').hidden=true;}
  }
  /** The source changed: with auto-compile on, compile once typing pauses (and once more if a compile is running). */
  changed(){if(!this.root||this.reading||storage.get('vela.tex.autoCompile')!=='1'||/\.pdf$/i.test(this.doc?.name||''))return;clearTimeout(this.autoTimer);this.autoTimer=setTimeout(()=>{if(this.compiling)this.queued=true;else this.compile().catch(()=>{});},2000);}
  setZoom(value){this.zoom=Math.max(0.5,Math.min(3,value));storage.set('vela.pdf.zoom',String(this.zoom));this.showZoom();if(this.pdf)this.render().catch(this.fail);}
  showZoom(){const node=this.root?.querySelector('.tex-zoom-reset');if(node)node.textContent=Math.round(this.zoom*100)+'%';}
  async openFile(bytes){if(!(bytes instanceof Uint8Array)||bytes.length>32*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('PDF 无效或超过 32 MB。');this.bytes=bytes;await this.load();}
  async outline(){const items=await this.pdf?.getOutline()||[],result=[];const walk=async list=>{for(const item of list){if(result.length>=1000)return;try{const dest=typeof item.dest==='string'?await this.pdf.getDestination(item.dest):item.dest;if(dest){const page=typeof dest[0]==='number'?dest[0]+1:(await this.pdf.getPageIndex(dest[0]))+1;result.push({title:item.title,pdfPage:page});}}catch{}await walk(item.items||[]);}};await walk(items);return result;}
  cancelSearch(){this.searchEpoch=(this.searchEpoch||0)+1;}
  /** Plain text of every page, cached per PDF; used by search and by source ↔ PDF jumps. */
  async texts(){if(this.pageTexts)return this.pageTexts;const pdf=this.pdf,texts=[];for(let number=1;number<=pdf.numPages;number++){const content=await (await pdf.getPage(number)).getTextContent();texts.push(content.items.map(item=>item.str||'').join(''));if(number%5===0)await new Promise(resolve=>setTimeout(resolve,0));if(pdf!==this.pdf)return [];}return this.pageTexts=texts;}
  async search(query){const epoch=this.searchEpoch=(this.searchEpoch||0)+1,results=[];for(let number=1;number<=this.pdf.numPages;number++){if(epoch!==this.searchEpoch)return [];const page=await this.pdf.getPage(number),content=await page.getTextContent(),text=content.items.map(item=>item.str||'').join(' ');if(text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))results.push({pdfPage:number,quote:query});if(results.length>=200)break;if(number%5===0)await new Promise(resolve=>setTimeout(resolve,0));}return results;}
  status(text){const node=this.root?.querySelector('.tex-status');if(node)node.textContent=text;}
  showProblems(diagnostics){
    const root=this.root,box=root.querySelector('.tex-problems'),errors=diagnostics.filter(item=>item.severity!=='warning'),warnings=diagnostics.filter(item=>item.severity==='warning');
    box.hidden=!diagnostics.length;root.querySelector('.tex-problem-summary').textContent=diagnostics.length?[errors.length?errors.length+' '+t('个错误'):'',warnings.length?warnings.length+' '+t('个警告'):''].filter(Boolean).join(' · '):'';
    root.querySelector('.tex-diagnostics').innerHTML=[...errors,...warnings].map(item=>`<button class="tex-error ${item.severity==='warning'?'warning':'error'}" data-line="${Number(item.line)||0}" data-file="${escape(item.file||'')}"><span class="tex-problem-place">${escape(item.file||'')}${item.line?':'+Number(item.line):''}</span> ${escape(item.message)}</button>`).join('');
    root.querySelectorAll('.tex-error').forEach(button=>button.onclick=()=>{if(!this.reading&&Number(button.dataset.line))this.jump?.(button.dataset.file,Number(button.dataset.line));});
  }
  async compile(){
    if(!this.root)return;if(this.compiling){this.queued=true;return;}this.compiling=true;this.queued=false;const epoch=this.epoch,root=this.root,started=Date.now();this.abort=new AbortController();
    root.querySelector('.tex-compile').disabled=true;root.querySelector('.tex-cancel').hidden=false;this.status(t('正在编译…'));root.classList.add('tex-busy');root.querySelector('.tex-time').textContent='';const log=root.querySelector('.tex-log pre');log.textContent='';
    try{
      const result=await this.compiler.compile(this.doc,{engine:root.querySelector('.tex-engine').value,signal:this.abort.signal,onLog:line=>{if(epoch===this.epoch)log.textContent=(log.textContent+'\n'+line).slice(-100000);}});if(epoch!==this.epoch)return;
      const diagnostics=Array.isArray(result.diagnostics)?result.diagnostics:[];this.showProblems(diagnostics);this.onDiagnostics?.(this.doc,diagnostics);
      if(!result.ok||!result.pdf){if(!diagnostics.length)root.querySelector('.tex-log').open=true;throw new Error(t('编译失败，请查看日志与缺失宏包。'));}
      // Keep the reader where it was: same page and offset within the page when the new PDF loads.
      this.bytes=result.pdf;const keep=this.continuous?this.scrollAnchor():null;if(!this.continuous)this.page=1;await this.load(keep);
      this.status(t('编译完成'));root.querySelector('.tex-time').textContent=((Date.now()-started)/1000).toFixed(1)+' s';root.querySelector('.tex-export').disabled=false;
    }catch(error){if(epoch!==this.epoch)return;this.status(this.abort.signal.aborted?t('已取消'):t('编译失败'));if(!this.abort.signal.aborted)throw error;}
    finally{if(epoch===this.epoch){this.compiling=false;root.classList.remove('tex-busy');root.querySelector('.tex-compile').disabled=false;root.querySelector('.tex-cancel').hidden=true;if(this.queued){this.queued=false;this.changed();}}}
  }
  async load(anchor){this.cancelRendering();await this.loading?.destroy();this.pageTexts=null;this.loading=pdfjs.getDocument({data:this.bytes.slice(),isEvalSupported:false,useSystemFonts:true,cMapUrl:new URL('./pdf/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./pdf/fonts/',location.href).href});this.pdf=await this.loading.promise;if(!this.reading)this.page=Math.min(this.page||1,this.pdf.numPages);await this.render(anchor);this.onReady?.(this);}
  render(anchor){return this.continuous?this.renderContinuous(anchor):this.renderPaged();}
  scrollAnchor(){const box=this.root?.querySelector('.pdf-canvas'),slot=(this.slots||[]).find(item=>item.wrap.offsetTop+item.wrap.offsetHeight>box.scrollTop);return slot?{page:slot.number,offset:(box.scrollTop-slot.wrap.offsetTop)/Math.max(1,slot.wrap.offsetHeight)}:null;}
  /** Page boxes are sized up front; canvases are drawn only near the viewport and released when far away. */
  async renderContinuous(anchor){
    if(!this.pdf||!this.root?.isConnected)return;const box=this.root.querySelector('.pdf-canvas');if(!box.clientWidth)return;
    anchor||=this.slots?.length?this.scrollAnchor():null;this.cancelRendering();this.observer?.disconnect();const epoch=++this.renderEpoch,pdf=this.pdf;
    const sizes=[];for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number);sizes.push(page.getViewport({scale:1}));if(epoch!==this.renderEpoch)return;}
    const available=box.clientWidth-24,fit=available/Math.max(...sizes.map(size=>size.width)),scale=Math.max(0.2,fit*this.zoom),column=document.createElement('div');column.className='pdf-pages pdf-column';
    this.slots=sizes.map((size,index)=>{const wrap=document.createElement('div');wrap.className='pdf-page';wrap.dataset.page=String(index+1);wrap.style.width=size.width*scale+'px';wrap.style.height=size.height*scale+'px';column.append(wrap);return {number:index+1,wrap,scale,drawn:false};});
    box.replaceChildren(column);
    if(anchor){const slot=this.slots[Math.min(this.slots.length,anchor.page)-1];if(slot)box.scrollTop=slot.wrap.offsetTop+anchor.offset*slot.wrap.offsetHeight;}
    this.observer=new IntersectionObserver(entries=>{for(const entry of entries){const slot=this.slots.find(item=>item.wrap===entry.target);if(!slot)continue;if(entry.isIntersecting)this.draw(slot,epoch).catch(error=>{if(error?.name!=='RenderingCancelledException')this.fail?.(error);});else if(Math.abs(entry.boundingClientRect.top-box.getBoundingClientRect().top)>box.clientHeight*3)this.release(slot);}},{root:box,rootMargin:'100% 0px'});
    for(const slot of this.slots)this.observer.observe(slot.wrap);
    box.onscroll=()=>this.trackPage();this.trackPage();
  }
  trackPage(){const box=this.root?.querySelector('.pdf-canvas');if(!box||!this.slots?.length)return;const middle=box.scrollTop+box.clientHeight/3,slot=this.slots.find(item=>item.wrap.offsetTop+item.wrap.offsetHeight>=middle)||this.slots.at(-1);this.page=slot.number;this.root.querySelector('.pdf-position').textContent=`${slot.number} / ${this.slots.length}`;this.root.querySelector('.pdf-previous').disabled=slot.number===1;this.root.querySelector('.pdf-next').disabled=slot.number===this.slots.length;this.onPage?.(slot.number,this.slots.length,slot.number);}
  async draw(slot,epoch){
    if(slot.drawn||epoch!==this.renderEpoch)return;slot.drawn=true;const page=await this.pdf.getPage(slot.number);if(epoch!==this.renderEpoch){slot.drawn=false;return;}
    const viewport=page.getViewport({scale:slot.scale}),density=Math.min(2,devicePixelRatio||1),canvas=document.createElement('canvas'),layer=document.createElement('div');
    layer.className='textLayer';layer.style.setProperty('--scale-factor',String(slot.scale));layer.style.setProperty('--total-scale-factor',String(slot.scale));
    canvas.width=Math.max(1,Math.floor(viewport.width*density));canvas.height=Math.max(1,Math.floor(viewport.height*density));canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    slot.wrap.querySelectorAll(':scope>canvas,:scope>.textLayer').forEach(node=>node.remove());slot.wrap.prepend(canvas,layer);const text=new pdfjs.TextLayer({textContentSource:page.streamTextContent(),container:layer,viewport});slot.text=text;this.textTasks.push(text);text.render().catch(()=>{});
    const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:undefined});slot.task=task;this.renderTasks.push(task);
    try{await task.promise;}catch(error){slot.drawn=false;if(error?.name!=='RenderingCancelledException')throw error;}finally{slot.task=null;}
  }
  release(slot){if(!slot)return;slot.task?.cancel();slot.text?.cancel();slot.task=slot.text=null;if(slot.drawn){slot.drawn=false;slot.wrap.querySelectorAll(':scope>canvas,:scope>.textLayer').forEach(node=>node.remove());}}
  async renderPaged(){
    if(!this.pdf||!this.root?.isConnected)return;this.cancelRendering();const epoch=++this.renderEpoch,box=this.root.querySelector('.pdf-canvas');if(!box.clientWidth||!box.clientHeight)return;
    this.columns=this.reading&&this.readingMode?.()==='double'&&box.clientWidth>=760?2:1;this.page=Math.max(1,Math.min(Math.floor((this.pdf.numPages-1)/this.columns)*this.columns+1,Math.floor((this.page-1)/this.columns)*this.columns+1));const end=Math.min(this.pdf.numPages,this.page+this.columns-1),numbers=Array.from({length:end-this.page+1},(_,index)=>this.page+index),pages=await Promise.all(numbers.map(number=>this.pdf.getPage(number)));if(epoch!==this.renderEpoch)return;
    const bases=pages.map(page=>page.getViewport({scale:1})),gap=this.columns===2?24:0,width=(box.clientWidth-gap)/this.columns,scale=Math.min(width/Math.max(...bases.map(base=>base.width)),box.clientHeight/Math.max(...bases.map(base=>base.height)))*this.zoom,density=Math.min(2,devicePixelRatio||1),group=document.createElement('div');group.className='pdf-pages';group.style.gap=gap+'px';box.replaceChildren(group);
    for(const page of this.visiblePages||[])if(!numbers.includes(page.pageNumber))page.cleanup();this.visiblePages=pages;this.textTasks=[];this.renderTasks=pages.map(page=>{const viewport=page.getViewport({scale}),wrap=document.createElement('div'),canvas=document.createElement('canvas'),layer=document.createElement('div');wrap.className='pdf-page';wrap.dataset.page=String(page.pageNumber);wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';layer.className='textLayer';layer.style.setProperty('--scale-factor',String(scale));layer.style.setProperty('--total-scale-factor',String(scale));canvas.width=Math.max(1,Math.floor(viewport.width*density));canvas.height=Math.max(1,Math.floor(viewport.height*density));canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';wrap.append(canvas,layer);group.append(wrap);const text=new pdfjs.TextLayer({textContentSource:page.streamTextContent(),container:layer,viewport});this.textTasks.push(text);text.render().catch(()=>{});return page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:undefined});});
    if(this.columns===2&&pages.length===1){const blank=document.createElement('div');blank.setAttribute('aria-hidden','true');blank.style.width=group.firstElementChild.style.width;blank.style.flexShrink='0';group.append(blank);}
    try{await Promise.all(this.renderTasks.map(task=>task.promise));}catch(error){if(error.name!=='RenderingCancelledException')throw error;return;}if(epoch!==this.renderEpoch)return;
    this.root.querySelector('.pdf-position').textContent=`${this.page}${end!==this.page?'–'+end:''} / ${this.pdf.numPages}`;this.root.querySelector('.pdf-previous').disabled=this.page===1;this.root.querySelector('.pdf-next').disabled=end===this.pdf.numPages;this.onPage?.(this.page,this.pdf.numPages,end);
  }
  turn(delta){
    if(!this.pdf)return;
    if(this.continuous){this.scrollToPage(Math.max(1,Math.min(this.pdf.numPages,(this.page||1)+delta)));return;}
    const columns=this.columns||1;this.page=Math.max(1,Math.min(Math.floor((this.pdf.numPages-1)/columns)*columns+1,this.page+delta*columns));this.render().catch(this.fail);
  }
  scrollToPage(number,fraction=0){const box=this.root?.querySelector('.pdf-canvas'),slot=this.slots?.[number-1];if(!box||!slot)return;box.scrollTop=Math.max(0,slot.wrap.offsetTop+fraction*slot.wrap.offsetHeight-box.clientHeight/3);this.trackPage();}
  /** Source → PDF: find the cursor line's text in the PDF and flash the spot. */
  async locate(){
    if(!this.pdf){this.status(t('请先编译 PDF。'));return false;}const line=this.source?.();const query=plainTexLine(line?.text||'');
    if(!query){this.status(t('当前行没有可定位的正文。'));return false;}
    const hit=findInPages(await this.texts(),query);if(!hit){this.status(t('未在 PDF 中找到当前行。'));return false;}
    if(this.continuous)this.scrollToPage(hit.page,hit.fraction);else{this.page=hit.page;await this.render();}
    this.flash(hit.page,hit.fraction);this.status(t('已定位到第')+' '+hit.page+' '+t('页'));return true;
  }
  flash(page,fraction){const slot=this.root?.querySelector(`.pdf-page[data-page="${page}"]`);if(!slot)return;const mark=document.createElement('div');mark.className='pdf-sync-mark';mark.style.top=Math.max(0,Math.min(96,fraction*100))+'%';slot.append(mark);setTimeout(()=>mark.remove(),1600);}
  /** PDF → source: double-click a word in the PDF to jump to the matching source line. */
  reverse(event){
    if(this.reading||!this.jump||/\.pdf$/i.test(this.doc?.name||''))return;const span=event.target.closest('.textLayer span');if(!span)return;
    const selected=String(getSelection?.()||'').trim(),text=(span.textContent||'').trim(),query=text.length>=selected.length?text:selected;
    const hit=findSourceLine(this.compiler?.host?.workspace?.()?.documents||[],this.doc,query,this.compiler?.host?.project?.(this.doc)?.folder);
    if(hit)this.jump(hit.path,hit.line);else this.status(t('未在源码中找到这段文字。'));
  }
}
