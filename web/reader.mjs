import {documentKind} from './model.mjs';
import {documentPath} from './workspace.mjs';
import {readingDocuments,projectConfig} from './vela.mjs';
import {parseCsv,csvDelimiter} from './csv.mjs';
import {bindTextZoom} from './gestures.mjs';
import {t} from './i18n.mjs';

export class Reader {
  constructor({root,workspace,markdown,sanitize,escape,save,html,assets,fail,load}){Object.assign(this,{root,workspace,markdown,sanitize,escape,save,html,assets,fail,load});this.id=null;this.page=0;this.epoch=0;this.resize=new ResizeObserver(()=>this.layout());this.resize.observe(root);}
  home(){this.epoch++;this.id=null;const workspace=this.workspace(),docs=readingDocuments(workspace),esc=this.escape;
    this.root.innerHTML=`<div class="reader-stage"><section class="reader-library"><header><h1>${t('阅读')}</h1><p>${t('开源小说创作 / 阅读工具')}</p><input id="reader-search" type="search" placeholder="${t('搜索文稿…')}" aria-label="${t('搜索文稿')}"></header><div class="reader-books"></div></section><section class="reader-document" inert></section></div>`;
    const list=()=>{const query=this.root.querySelector('#reader-search').value.toLowerCase();this.root.querySelector('.reader-books').innerHTML=docs.filter(doc=>(doc.name+' '+documentPath(doc)).toLowerCase().includes(query)).map(doc=>{const project=projectConfig(workspace,doc);return `<button class="reader-book" data-read="${esc(doc.id)}"><span class="book-cover">${documentKind(doc)}</span><strong>${esc(doc.name)}</strong><small>${esc(project?.config?.name||documentPath(doc))}</small></button>`;}).join('')||`<p class="blank">${t('没有可阅读的文件，请在工作区 .vela 中选择阅读文件。')}</p>`;};list();this.root.querySelector('#reader-search').oninput=list;
    this.root.querySelector('.reader-books').onclick=e=>{const button=e.target.closest('[data-read]');if(button)this.open(button.dataset.read).catch(this.fail);};
  }
  localize(){if(!this.id){if(this.root.childElementCount)this.home();return;}const root=this.root;root.querySelector('#reader-back').textContent='← '+t('书库');root.querySelector('.reader-header>span').textContent=t('只读');root.querySelector('#reader-prev').textContent='← '+t('上一页');root.querySelector('#reader-next').textContent=t('下一页')+' →';if(this.workspace().documents.find(doc=>doc.id===this.id)&&documentKind(this.workspace().documents.find(doc=>doc.id===this.id))==='CSV')this.renderCsv();const html=root.querySelector('#reader-html');if(html)html.textContent=t('打开 HTML 阅读');}
  leave(){this.epoch++;}
  async open(id){
    const workspace=this.workspace(),doc=readingDocuments(workspace).find(doc=>doc.id===id);if(!doc)return;
    const epoch=++this.epoch;await this.load?.(doc);if(epoch!==this.epoch||this.root.hidden)return;this.id=id;this.page=0;const project=projectConfig(workspace,doc),kind=documentKind(doc);this.size=workspace.readerSizes?.[id]??project?.config?.fontSize??workspace.settings.fontSize;
    workspace.readingRecent=id;const root=this.root.querySelector('.reader-document');root.inert=false;
    root.innerHTML=`<header class="reader-header"><button id="reader-back" class="secondary">← ${t('书库')}</button><strong>${this.escape(doc.name)}</strong><span>${t('只读')}</span></header><div class="reader-viewport" tabindex="0"><article class="reader-content" data-user-content></article></div><footer class="reader-pagebar"><button id="reader-prev" class="secondary">← ${t('上一页')}</button><span id="reader-position"></span><button id="reader-next" class="secondary">${t('下一页')} →</button></footer>`;
    const content=root.querySelector('.reader-content');content.style.fontSize=this.size+'px';
    if(kind==='HTML'){content.innerHTML=`<button id="reader-html" class="secondary">${t('打开 HTML 阅读')}</button>`;root.querySelector('#reader-html').onclick=()=>this.html(doc,this.size).catch(this.fail);}
    else if(kind==='CSV'){this.csv=parseCsv(doc.text,doc.delimiter||csvDelimiter(doc.text));this.csvRow=0;this.csvColumn=0;this.renderCsv();}
    else if(kind==='MD'){content.innerHTML=this.sanitize(this.markdown.render(doc.text,{path:documentPath(doc)}),{FORBID_TAGS:['iframe','form','input','button','video','audio','style'],FORBID_ATTR:['style','contenteditable']});this.assets?.(content);}
    else{content.textContent=doc.text;content.classList.add('reader-plain');}
    root.querySelector('#reader-back').onclick=()=>this.home();root.querySelector('#reader-prev').onclick=()=>this.turn(-1);root.querySelector('#reader-next').onclick=()=>this.turn(1);
    root.querySelector('.reader-viewport').onkeydown=e=>{if(workspace.settings.readingMode==='pages'&&['ArrowLeft','ArrowRight','PageUp','PageDown',' '].includes(e.key)){e.preventDefault();this.turn(['ArrowLeft','PageUp'].includes(e.key)?-1:1);}};
    bindTextZoom(root.querySelector('.reader-viewport'),()=>this.size,size=>this.setSize(size),()=>{workspace.readerSizes={...workspace.readerSizes,[id]:this.size};this.save();});
    let start=null;const viewport=root.querySelector('.reader-viewport');viewport.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.isPrimary)start={x:e.clientX,y:e.clientY};else start=null;});viewport.addEventListener('pointerup',e=>{if(start&&workspace.settings.readingMode==='pages'&&Math.abs(e.clientX-start.x)>60&&Math.abs(e.clientY-start.y)<50)this.turn(e.clientX<start.x?1:-1);start=null;});viewport.addEventListener('pointercancel',()=>start=null);
    this.root.querySelector('.reader-stage').classList.add('reading');this.root.querySelector('.reader-library').inert=true;this.save();requestAnimationFrame(()=>this.layout());
    if(kind==='HTML'){await new Promise(resolve=>setTimeout(resolve,180));if(epoch===this.epoch&&this.id===id)await this.html(doc,this.size);}
  }
  renderCsv(){const content=this.root.querySelector('.reader-content');if(!content)return;const rows=this.csv,columns=rows.reduce((max,row)=>Math.max(max,row.length),0),rowPages=Math.max(1,Math.ceil(rows.length/100)),columnPages=Math.max(1,Math.ceil(columns/50));content.innerHTML=`<div class="reader-csv-tools"><button data-csv-row="-1" ${this.csvRow?'':'disabled'}>←</button><span>${t('行')} ${this.csvRow+1} / ${rowPages}</span><button data-csv-row="1" ${this.csvRow+1<rowPages?'':'disabled'}>→</button><button data-csv-column="-1" ${this.csvColumn?'':'disabled'}>←</button><span>${t('列')} ${this.csvColumn+1} / ${columnPages}</span><button data-csv-column="1" ${this.csvColumn+1<columnPages?'':'disabled'}>→</button></div><table>`+rows.slice(this.csvRow*100,(this.csvRow+1)*100).map(row=>'<tr>'+row.slice(this.csvColumn*50,(this.csvColumn+1)*50).map(cell=>'<td>'+this.escape(cell)+'</td>').join('')+'</tr>').join('')+'</table>';content.querySelectorAll('[data-csv-row],[data-csv-column]').forEach(button=>button.onclick=()=>{if(button.dataset.csvRow)this.csvRow+=Number(button.dataset.csvRow);else this.csvColumn+=Number(button.dataset.csvColumn);this.page=0;this.renderCsv();this.layout();});}
  setSize(size){this.size=Math.max(10,Math.min(40,Math.round(size)));const content=this.root.querySelector('.reader-content');if(content){content.style.fontSize=this.size+'px';this.layout();}}
  layout(){if(!this.id||!this.root.offsetWidth)return;const paged=this.workspace().settings.readingMode==='pages';this.root.classList.toggle('reader-paged',paged);const viewport=this.root.querySelector('.reader-viewport'),content=this.root.querySelector('.reader-content');if(!viewport||!content)return;content.style.setProperty('--page-width',viewport.clientWidth+'px');this.turn(0);}
  turn(delta){if(!this.id)return;const viewport=this.root.querySelector('.reader-viewport'),content=this.root.querySelector('.reader-content'),paged=this.workspace().settings.readingMode==='pages';if(!viewport)return;
    content.style.transform='';const pages=paged?Math.max(1,Math.ceil((content.scrollWidth+48)/(viewport.clientWidth+48))):1;
    this.page=Math.max(0,Math.min(pages-1,this.page+delta));if(paged)content.style.transform=`translateX(${-this.page*(viewport.clientWidth+48)}px)`;
    this.root.querySelector('.reader-pagebar').hidden=!paged;this.root.querySelector('#reader-position').textContent=`${this.page+1} / ${pages}`;this.root.querySelector('#reader-prev').disabled=this.page===0;this.root.querySelector('#reader-next').disabled=this.page>=pages-1;
  }
}
