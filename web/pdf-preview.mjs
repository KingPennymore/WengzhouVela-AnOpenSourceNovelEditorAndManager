import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportPdf} from './tex-compiler.mjs';
import {t} from './i18n.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf/pdf.worker.mjs',location.href).href;
const escape=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// A separate canvas per visible page keeps large PDFs from allocating all pages at once.
export class PdfPreview {
  constructor({compiler,fail,jump}){Object.assign(this,{compiler,fail,jump});this.epoch=0;}
  dispose(){this.epoch++;this.renderEpoch=(this.renderEpoch||0)+1;this.onPage=null;this.abort?.abort();this.renderTask?.cancel();this.loading?.destroy();this.resize?.disconnect();}
  mount(root,doc,{reading=false,onReady}={}){
    this.dispose();this.root=root;this.doc=doc;this.reading=reading;this.onReady=onReady;this.page=1;this.zoom=1;this.compiling=false;this.pdf=null;this.renderEpoch=0;
    root.classList.add('tex-pdf');root.innerHTML=`<div class="tex-tools"><select class="tex-engine" aria-label="${t('编译引擎')}"><option value="xetex">XeLaTeX</option><option value="pdftex">pdfLaTeX</option></select><button class="primary tex-compile">${t('编译 PDF')}</button><button class="secondary tex-cancel" hidden>${t('取消')}</button><button class="secondary tex-export" disabled>${t('导出 PDF')}</button><span class="tex-status" role="status"></span></div><details class="tex-log"><summary>${t('编译日志')}</summary><div class="tex-diagnostics"></div><pre></pre></details><div class="pdf-tools"><button class="pdf-previous" disabled>←</button><span class="pdf-position"></span><button class="pdf-next" disabled>→</button></div><div class="pdf-canvas"><canvas></canvas><div class="pdf-text textLayer"></div></div>`;
    root.querySelector('.tex-compile').onclick=()=>this.compile().catch(this.fail);root.querySelector('.tex-cancel').onclick=()=>this.abort?.abort();root.querySelector('.tex-export').onclick=()=>exportPdf(doc.name,this.bytes).catch(this.fail);root.querySelector('.pdf-previous').onclick=()=>this.turn(-1);root.querySelector('.pdf-next').onclick=()=>this.turn(1);
    this.resize=new ResizeObserver(()=>{if(this.pdf)this.render().catch(this.fail);});this.resize.observe(root.querySelector('.pdf-canvas'));
    if(reading){root.classList.add('tex-reading');this.compile().catch(this.fail);}
  }
  async compile(){
    if(this.compiling)return;this.compiling=true;const epoch=this.epoch,root=this.root;this.abort=new AbortController();root.querySelector('.tex-compile').disabled=true;root.querySelector('.tex-cancel').hidden=false;root.querySelector('.tex-status').textContent=t('正在编译…');const log=root.querySelector('.tex-log pre');log.textContent='';root.querySelector('.tex-diagnostics').innerHTML='';
    try{const result=await this.compiler.compile(this.doc,{engine:root.querySelector('.tex-engine').value,signal:this.abort.signal,onLog:line=>{if(epoch===this.epoch)log.textContent=(log.textContent+'\n'+line).slice(-100000);}});if(epoch!==this.epoch)return;
      root.querySelector('.tex-diagnostics').innerHTML=result.diagnostics.map(item=>`<button class="tex-error" data-line="${Number(item.line)||0}" data-file="${escape(item.file||'')}">${escape(item.file||'')}:${Number(item.line)||0} ${escape(item.message)}</button>`).join('');root.querySelectorAll('.tex-error').forEach(button=>button.onclick=()=>{if(!this.reading)this.jump?.(button.dataset.file,Number(button.dataset.line));});
      if(!result.ok||!result.pdf){root.querySelector('.tex-log').open=true;throw new Error(t('编译失败，请查看日志与缺失宏包。'));}this.bytes=result.pdf;this.page=1;await this.load();root.querySelector('.tex-status').textContent=t('编译完成');root.querySelector('.tex-export').disabled=false;
    }catch(error){if(epoch!==this.epoch)return;root.querySelector('.tex-status').textContent=this.abort.signal.aborted?t('已取消'):t('编译失败');throw error;}finally{if(epoch===this.epoch){this.compiling=false;root.querySelector('.tex-compile').disabled=false;root.querySelector('.tex-cancel').hidden=true;}}
  }
  async load(){this.renderTask?.cancel();await this.loading?.destroy();this.loading=pdfjs.getDocument({data:this.bytes.slice(),isEvalSupported:false,useSystemFonts:true,cMapUrl:new URL('./pdf/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./pdf/fonts/',location.href).href});this.pdf=await this.loading.promise;await this.render();this.onReady?.(this);}
  async render(){
    if(!this.pdf||!this.root.isConnected)return;this.renderTask?.cancel();const epoch=++this.renderEpoch,page=await this.pdf.getPage(this.page);if(epoch!==this.renderEpoch)return;const canvas=this.root.querySelector('canvas'),box=this.root.querySelector('.pdf-canvas');if(!box.clientWidth||!box.clientHeight)return;const base=page.getViewport({scale:1}),scale=Math.min(box.clientWidth/base.width,box.clientHeight/base.height)*this.zoom,viewport=page.getViewport({scale}),density=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(viewport.width*density));canvas.height=Math.max(1,Math.floor(viewport.height*density));canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    this.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:undefined});try{await this.renderTask.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;return;}
    this.root.querySelector('.pdf-position').textContent=`${this.page} / ${this.pdf.numPages}`;this.root.querySelector('.pdf-previous').disabled=this.page===1;this.root.querySelector('.pdf-next').disabled=this.page===this.pdf.numPages;this.onPage?.(this.page,this.pdf.numPages);
  }
  turn(delta){if(!this.pdf)return;this.page=Math.max(1,Math.min(this.pdf.numPages,this.page+delta));this.render().catch(this.fail);}
}
