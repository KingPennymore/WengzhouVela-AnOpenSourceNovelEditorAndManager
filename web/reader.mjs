import {documentKind} from './model.mjs';
import {documentPath} from './workspace.mjs';
import {readingDocuments,projectConfig,projectWriter,readingLayout} from './vela.mjs';
import {displayChapterTitle,chapterOffset,renderPlainChapters,fitReadingLayout,swipeDirection,readingPageInfo,readingGeometry,spreadStart,paginatedPages} from './reader-layout.mjs';
import {parseCsv,csvDelimiter} from './csv.mjs';
import {bindTextZoom} from './gestures.mjs';
import {resolveReadingOffset,characterRect,visibleTextOffset} from './reading-position.mjs';
import Writer from '../vendor/acode-writer/src/core.js';
import {chapterMatcher} from './chapters.mjs';
import {t} from './i18n.mjs';

export class Reader {
  constructor(options){Object.assign(this,options);this.id=null;this.page=0;this.epoch=0;this.resize=new ResizeObserver(()=>this.layout());this.resize.observe(this.root);window.addEventListener('pagehide',()=>this.persist());document.addEventListener('keydown',event=>this.handleKey(event));}
  handleKey(event){
    if(!this.id||this.root.hidden||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||event.target.closest?.('input,textarea,select,button,[contenteditable=true]'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown',' '].includes(event.key)){event.preventDefault();this.turn(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)?-1:1);}else if(event.key==='Escape'){event.preventDefault();this.chrome();}
  }
  stop(){this.cancelAnimation();this.pdfPane?.dispose();this.pdfPane=null;clearTimeout(this.positionTimer);clearInterval(this.clockTimer);this.persist();}
  cancelAnimation(){for(const animation of this.animations||[])animation.cancel();this.animations=[];this.overlay?.remove();this.incoming?.remove();this.overlay=null;this.incoming=null;this.root.querySelector('.reader-viewport')?.classList.remove('reader-turning');}
  home(){this.stop();this.epoch++;this.id=null;this.onChrome?.(false,false);const workspace=this.workspace(),docs=readingDocuments(workspace),esc=this.escape;
    this.root.classList.remove('reader-paged','reader-double');this.root.innerHTML=`<div class="reader-stage"><section class="reader-library"><header><h1>${t('阅读')}</h1><p>${t('开源小说创作 / 阅读工具')}</p><input id="reader-search" type="search" placeholder="${t('搜索文稿…')}" aria-label="${t('搜索文稿')}"></header><div class="reader-books"></div></section><section class="reader-document" inert></section></div>`;
    const list=()=>{const query=this.root.querySelector('#reader-search').value.toLowerCase();this.root.querySelector('.reader-books').innerHTML=docs.filter(doc=>(doc.name+' '+documentPath(doc)).toLowerCase().includes(query)).map(doc=>{const project=projectConfig(workspace,doc);return `<button class="reader-book" data-read="${esc(doc.id)}"><span class="book-cover">${documentKind(doc)}</span><strong>${esc(doc.name)}</strong><small>${esc(project?.config?.name||documentPath(doc))}</small></button>`;}).join('')||`<p class="blank">${t('没有可阅读的文件，请在工作区 .vela 中选择阅读文件。')}</p>`;};list();this.root.querySelector('#reader-search').oninput=list;
    this.root.querySelector('.reader-books').onclick=e=>{const button=e.target.closest('[data-read]');if(button)this.open(button.dataset.read).catch(this.fail);};
  }
  localize(){if(!this.id){if(this.root.childElementCount)this.home();return;}this.root.querySelector('#reader-back').textContent='← '+t('书库');this.root.querySelector('#reader-chapter').title=t('当前章节');this.clock();if(this.kind==='CSV')this.renderCsv();const html=this.root.querySelector('#reader-html');if(html)html.textContent=t('打开 HTML 阅读');}
  leave(){this.stop();this.id=null;this.epoch++;this.onChrome?.(false,false);}
  chrome(show=!this.chromeVisible){this.chromeVisible=show;this.root.classList.toggle('reader-chrome-visible',show);this.onChrome?.(true,show);if(!show)this.root.querySelector('.reader-outline')?.remove();}
  async open(id){
    this.stop();const workspace=this.workspace(),doc=readingDocuments(workspace).find(doc=>doc.id===id);if(!doc)return;getSelection()?.removeAllRanges();
    const epoch=++this.epoch;await this.load?.(doc);if(epoch!==this.epoch||this.root.hidden)return;this.id=id;this.page=0;this.doc=doc;this.kind=documentKind(doc);const project=projectConfig(workspace,doc);this.readingLayout=readingLayout(project?.config?.reading.layout);this.size=(project?.global&&workspace.settings.globalVelaOverride?project.config?.fontSize:workspace.readerSizes?.[id])??project?.config?.fontSize??workspace.settings.fontSize;
    this.position=workspace.readerPositions?.[id]||null;workspace.readingRecent=id;const root=this.root.querySelector('.reader-document');root.inert=false;
    root.innerHTML=`<header class="reader-header"><button id="reader-back" class="secondary">← ${t('书库')}</button><strong data-user-content>${this.escape(doc.name)}</strong><span id="reader-chapter" data-user-content title="${t('当前章节')}"></span></header><div class="reader-viewport" tabindex="0" aria-label="${t('阅读正文')}"><article class="reader-content" data-user-content></article></div><footer class="reader-pagebar"><time id="reader-clock"></time><span id="reader-footer-chapter" data-user-content></span><span class="reader-progress"><span id="reader-position"></span><span id="reader-percent"></span></span></footer>`;
    const content=root.querySelector('.reader-content');content.style.fontSize=this.size+'px';
    if(this.kind==='HTML'){content.innerHTML=`<button id="reader-html" class="secondary">${t('打开 HTML 阅读')}</button>`;root.querySelector('#reader-html').onclick=()=>this.html(doc,this.size,this.readingLayout).catch(this.fail);}
    else if(this.kind==='CSV'){this.csv=parseCsv(doc.text,doc.delimiter||csvDelimiter(doc.text));this.csvRow=this.position?.csvRow||0;this.csvColumn=this.position?.csvColumn||0;this.renderCsv();}
    else if(this.kind==='TEX'){this.pdfPane=this.latex(content,doc,pane=>{pane.page=Math.max(1,Math.min(pane.pdf.numPages,this.position?.pdfPage||1));pane.onPage=(page,pages,end=page)=>{this.position={pdfPage:page,updatedAt:Date.now()};this.root.querySelector('#reader-position').textContent=`${page}${end!==page?'–'+end:''} / ${pages}`;this.root.querySelector('#reader-percent').textContent=`${Math.round(end/pages*100)}%`;this.persist();};pane.render().catch(this.fail);});}
    else if(this.kind==='MD'){content.innerHTML=this.sanitize(this.markdown.render(doc.text,{path:documentPath(doc)}),{FORBID_TAGS:['iframe','form','input','button','video','audio','style'],FORBID_ATTR:['style','contenteditable']});this.assets?.(content);}
    else{content.textContent=doc.text;content.classList.add('reader-plain');}
    const writer=projectWriter(workspace,doc),sections=Writer.buildIndex(doc.text,writer,chapterMatcher(writer)).sections;
    if(!['HTML','CSV','TEX','MD'].includes(this.kind))renderPlainChapters(content,doc.text,sections);
    if(this.kind==='MD')content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading=>heading.classList.add('reader-section-title'));
    this.chapters=sections.map(section=>({...section,offset:!['MD','HTML','CSV','TEX'].includes(this.kind)?chapterOffset(doc.text,section.row):Math.max(0,content.textContent.indexOf(section.title.replace(/^#{1,6}\s+/,'')))}));
    root.querySelector('#reader-back').onclick=()=>this.home();const viewport=root.querySelector('.reader-viewport');
    viewport.onkeydown=e=>this.handleKey(e);
    viewport.addEventListener('scroll',()=>{if(!this.restoring&&!this.paged)this.capture();},{passive:true});
    bindTextZoom(viewport,()=>this.size,size=>this.setSize(size),()=>{workspace.readerSizes={...workspace.readerSizes,[id]:this.size};this.persist();});
    let start=null,dragged=false,pointers=new Set();viewport.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);if(pointers.size===1){start={x:e.clientX,y:e.clientY};dragged=false;}else{start=null;dragged=true;}});viewport.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)dragged=true;});viewport.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);start=null;dragged=true;});
    viewport.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(start&&dragged&&e.pointerType==='touch'&&this.paged){const direction=swipeDirection(e.clientX-start.x,e.clientY-start.y);if(direction)this.turn(direction);}start=null;});
    viewport.onclick=e=>{const selection=getSelection();if(dragged||e.target.closest('a,button,input,select')||(selection?.toString()&&viewport.contains(selection.anchorNode)))return;const box=viewport.getBoundingClientRect(),fraction=(e.clientX-box.left)/box.width;if(fraction<.3)this.turn(-1);else if(fraction>.7)this.turn(1);else this.chrome();};
    this.root.querySelector('.reader-stage').classList.add('reading');this.root.querySelector('.reader-library').inert=true;this.chrome(false);this.clock();this.clockTimer=setInterval(()=>this.clock(),30000);this.save();requestAnimationFrame(()=>this.layout());
    this.assets?.(content);if(this.kind==='HTML'){await new Promise(resolve=>setTimeout(resolve,180));if(epoch===this.epoch&&this.id===id)await this.html(doc,this.size,this.readingLayout);}
  }
  clock(){const clock=this.root.querySelector('#reader-clock');if(clock)clock.textContent=new Date().toLocaleTimeString(this.workspace().settings.language==='en'?'en-GB':'zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
  renderCsv(){const content=this.root.querySelector('.reader-content');if(!content)return;const rows=this.csv,columns=rows.reduce((max,row)=>Math.max(max,row.length),0),rowPages=Math.max(1,Math.ceil(rows.length/100)),columnPages=Math.max(1,Math.ceil(columns/50));this.csvRow=Math.max(0,Math.min(rowPages-1,this.csvRow));this.csvColumn=Math.max(0,Math.min(columnPages-1,this.csvColumn));content.innerHTML=`<div class="reader-csv-tools"><button data-csv-row="-1" ${this.csvRow?'':'disabled'}>←</button><span>${t('行')} ${this.csvRow+1} / ${rowPages}</span><button data-csv-row="1" ${this.csvRow+1<rowPages?'':'disabled'}>→</button><button data-csv-column="-1" ${this.csvColumn?'':'disabled'}>←</button><span>${t('列')} ${this.csvColumn+1} / ${columnPages}</span><button data-csv-column="1" ${this.csvColumn+1<columnPages?'':'disabled'}>→</button></div><table>`+rows.slice(this.csvRow*100,(this.csvRow+1)*100).map(row=>'<tr>'+row.slice(this.csvColumn*50,(this.csvColumn+1)*50).map(cell=>'<td>'+this.escape(cell)+'</td>').join('')+'</tr>').join('')+'</table>';content.querySelectorAll('[data-csv-row],[data-csv-column]').forEach(button=>button.onclick=()=>{if(button.dataset.csvRow)this.csvRow+=Number(button.dataset.csvRow);else this.csvColumn+=Number(button.dataset.csvColumn);this.page=0;this.renderCsv();this.position=null;this.layout();this.capture();});}
  setSize(size){if(this.pdfPane){this.size=Math.max(10,Math.min(40,Math.round(size)));this.pdfPane.zoom=this.size/16;this.pdfPane.render().catch(this.fail);return;}this.size=Math.max(10,Math.min(40,Math.round(size)));const content=this.root.querySelector('.reader-content');if(content){content.style.fontSize=this.size+'px';this.layout();}}
  layout(){
    if(!this.id||!this.root.offsetWidth)return;
    this.cancelAnimation();if(this.kind==='TEX'){this.root.classList.remove('reader-paged','reader-double');this.pdfPane?.render().catch(this.fail);return;}
    const viewport=this.root.querySelector('.reader-viewport'),content=this.root.querySelector('.reader-content');if(!viewport||!content)return;
    this.restoring=true;this.geometry=readingGeometry(this.workspace().settings.readingMode,viewport.clientWidth);this.paged=this.geometry.paged;this.root.classList.toggle('reader-paged',this.paged);this.root.classList.toggle('reader-double',this.paged&&this.geometry.columns===2);
    const layout=fitReadingLayout(this.readingLayout,this.geometry.pageWidth,viewport.clientHeight);
    for(const [key,value] of Object.entries(layout))content.style.setProperty('--reader-'+key,key==='lineHeight'?String(value):value+'px');
    content.style.setProperty('--reader-page-height',Math.max(80,viewport.clientHeight-layout.marginTop-layout.marginBottom)+'px');
    content.style.setProperty('--page-width',this.geometry.pageWidth+'px');content.style.setProperty('--reader-gap',this.geometry.gap+'px');content.style.transform='';
    this.pages=this.paged?paginatedPages(content,this.geometry):1;
    if(this.position){const offset=resolveReadingOffset(content.textContent,this.position),rect=characterRect(content,offset);if(rect){if(this.paged)this.page=Math.floor((rect.left-content.getBoundingClientRect().left)/this.geometry.stride);else viewport.scrollTop+=rect.top-viewport.getBoundingClientRect().top;}else if(!this.paged)viewport.scrollTop=this.position.ratio*Math.max(0,viewport.scrollHeight-viewport.clientHeight);}
    this.page=spreadStart(this.page,this.pages,this.geometry.columns);if(this.paged)content.style.transform=`translateX(${-this.page*this.geometry.stride}px)`;
    this.restoring=false;this.capture();
  }
  turn(delta){
    if(!this.id)return;if(this.pdfPane){this.pdfPane.turn(delta);return;}
    const viewport=this.root.querySelector('.reader-viewport'),content=this.root.querySelector('.reader-content');if(!viewport)return;
    if(this.paged){
      const next=spreadStart(this.page+delta*this.geometry.columns,this.pages,this.geometry.columns);if(next===this.page)return;
      this.cancelAnimation();const direction=Math.sign(next-this.page),width=viewport.clientWidth;
      const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
      const layer=className=>{const element=document.createElement('div');element.className=className;element.inert=true;element.setAttribute('aria-hidden','true');const clone=content.cloneNode(true);clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));element.append(clone);viewport.append(element);return element;};
      if(animate)this.overlay=layer('reader-page-overlay');
      this.page=next;const base=-this.page*this.geometry.stride;content.style.transform=`translateX(${base}px)`;this.capture();
      if(animate){this.incoming=layer('reader-page-incoming');viewport.classList.add('reader-turning');const animation=this.incoming.animate([{transform:`translateX(${direction*width}px)`},{transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});this.animations=[animation];const overlay=this.overlay;animation.finished.then(()=>{if(this.overlay===overlay)this.cancelAnimation();}).catch(()=>{});}
    }else{viewport.scrollBy({top:delta*viewport.clientHeight,behavior:'instant'});this.capture();}
  }
  capture(){
    if(!this.id||this.kind==='TEX')return;const viewport=this.root.querySelector('.reader-viewport'),content=this.root.querySelector('.reader-content');if(!viewport||!content)return;
    const offset=visibleTextOffset(content,viewport,this.paged),info=readingPageInfo({paged:this.paged,page:this.page,pages:this.pages,columns:this.geometry?.columns,scrollTop:viewport.scrollTop,scrollHeight:viewport.scrollHeight,height:viewport.clientHeight});
    this.position={offset,context:content.textContent.slice(offset,offset+64),ratio:info.ratio,csvRow:this.csvRow||0,csvColumn:this.csvColumn||0,mode:this.paged?'pages':'scroll',updatedAt:Date.now()};
    this.root.querySelector('#reader-position').textContent=`${info.page}${info.end&&info.end!==info.page?'–'+info.end:''} / ${info.pages}`;this.root.querySelector('#reader-percent').textContent=`${Math.round(Math.max(0,Math.min(1,info.ratio))*100)}%`;
    const section=[...(this.chapters||[])].reverse().find(section=>section.offset<=offset),title=displayChapterTitle(section?.title||t('全文'));
    this.root.querySelector('#reader-chapter').textContent=title;this.root.querySelector('#reader-footer-chapter').textContent=title;
    clearTimeout(this.positionTimer);this.positionTimer=setTimeout(()=>this.persist(),350);
  }
  persist(){if(this.id&&this.position){const workspace=this.workspace();workspace.readerPositions={...workspace.readerPositions,[this.id]:this.position};this.save();}}
  toggleOutline(){const existing=this.root.querySelector('.reader-outline');if(existing){existing.remove();return;}this.chrome(true);const panel=document.createElement('aside');panel.className='reader-outline';panel.innerHTML=`<header><strong>${t('章节目录')}</strong><button data-reader-close aria-label="${t('关闭')}">×</button></header><input type="search" placeholder="${t('筛选章节标题')}"><div></div>`;const render=()=>{const query=panel.querySelector('input').value.toLowerCase();panel.querySelector('div').innerHTML=(this.chapters||[]).filter(s=>s.title.toLowerCase().includes(query)).map(s=>`<button data-reader-offset="${s.offset}" data-user-content>${this.escape(s.title)}</button>`).join('');};panel.querySelector('input').oninput=render;panel.onclick=e=>{if(e.target.closest('[data-reader-close]'))panel.remove();const button=e.target.closest('[data-reader-offset]');if(button){this.position={offset:Number(button.dataset.readerOffset)};this.layout();panel.remove();this.chrome(false);this.persist();}};render();this.root.querySelector('.reader-document').append(panel);}
}
