import {icon} from './icons.mjs';
import {resolveAnchor} from './document-service.mjs';
import {searchFiles} from './editing-tools.mjs';
import {selectionOffsets} from './reading-position.mjs';
import {mountAnnotationList} from './annotation-list.mjs';
import {t} from './i18n.mjs';

export function mountReadingTools(reader) {
  reader.root.querySelector('#reader-tools').onclick=()=>show(reader,'search');
  reader.root.querySelector('#reader-notes').onclick=()=>show(reader,'notes');
}
function show(reader,mode='search') {
  reader.chrome(true);reader.closeTools?.();
  const panel=document.createElement('aside');panel.className='reader-tools-panel';
  const workspace=reader.workspace(),entries=workspace.annotations?.[reader.id]||[],esc=reader.escape;
  panel.innerHTML=`<header><strong>${t(mode==='search'?'全文搜索':'批注')}</strong><button data-tools-close class="ui-icon-button" aria-label="${t('关闭')}" title="${t('关闭')}">${icon('close')}</button></header>
    <section class="reader-search-section" ${mode==='search'?'':'hidden'}><input data-book-query type="search" placeholder="${t('全文搜索')}" aria-label="${t('全文搜索')}"><div class="reader-search-results"></div></section>
    <section class="reader-notes-section" ${mode==='notes'?'':'hidden'}><textarea rows="3" maxlength="10000" aria-label="${t('批注')}" placeholder="${t('在选中位置写下批注')}"></textarea><div class="button-row"><button data-reader-bookmark class="ui-button ui-button--secondary">${icon('bookmark')}<span>${t('添加书签')}</span></button><button data-reader-note class="ui-button ui-button--primary">${icon('annotation')}<span>${t('添加批注')}</span></button></div>
    <div class="reader-annotations"></div></section>`;
  reader.root.querySelector('.reader-document').append(panel);
  let timer,epoch=0,controller;
  const selected=reader.kind==='CSV'?reader.csvAnchor():selectionOffsets(reader.root.querySelector('.reader-content'));
  const list=mode==='notes'?mountAnnotationList(panel.querySelector('.reader-annotations'),{entries,escape:esc,onOpen:entry=>{
    if(entry.pdfPage||entry.csvCell)go(reader,entry);else{const resolved=resolveAnchor(reader.renderedText,entry);if(resolved.needsReview){reader.fail(Error(t('位置待确认')));return;}go(reader,resolved);}
  },onRemove:removed=>{const selected=new Set(removed);workspace.annotations[reader.id]=entries.filter(entry=>!selected.has(entry));reader.save();reader.renderMarks();show(reader,mode);}}):{dispose(){}};
  reader.closeTools=()=>{clearTimeout(timer);epoch++;controller?.abort();reader.pdfPane?.cancelSearch();list.dispose();panel.remove();};
  const input=panel.querySelector('[data-book-query]');if(mode==='search')input.focus({preventScroll:true});
  input.oninput=e=>{
    controller?.abort();reader.pdfPane?.cancelSearch();clearTimeout(timer);const current=++epoch,query=e.target.value;controller=new AbortController();const signal=controller.signal;
    timer=setTimeout(async()=>{try{
      const hits=query?(reader.pdfPane?.pdf?await reader.pdfPane.search(query):await searchFiles([{id:reader.id,name:reader.doc.name,text:reader.renderedText}],query,{limit:200,signal})):[];
      if(current!==epoch||!panel.isConnected)return;
      panel.querySelector('.reader-search-results').innerHTML=hits.map((hit,i)=>`<button data-reader-hit="${i}" data-user-content>${hit.pdfPage?t('页')+' '+hit.pdfPage:esc(reader.renderedText.slice(Math.max(0,hit.offset-16),hit.end+40))}</button>`).join('');
      panel.querySelectorAll('[data-reader-hit]').forEach(b=>b.onclick=()=>go(reader,hits[Number(b.dataset.readerHit)]));
    }catch(error){if(!signal.aborted&&panel.isConnected)reader.fail(error);}},180);
  };
  panel.onclick=e=>{
    if(e.target.closest('[data-tools-close]')){reader.closeTools?.();return;}
    if(e.target.closest('[data-reader-bookmark],[data-reader-note]')){
      if(entries.length>=1000){reader.fail(Error(t('每本文稿最多保存 1000 个标记。')));return;}
      const cell=reader.kind==='CSV'?(reader.csvAnchor()||selected):null,range=cell?null:selectionOffsets(reader.root.querySelector('.reader-content'))||selected,quote=cell?.quote||range?.quote||'';
      const offset=cell?cell.offset:range?range.from+(reader.windowModel?.chunks[reader.paged?reader.chunk:reader.scrollFrom??reader.chunk].from||0):reader.position?.offset||0;
      const entry={id:crypto.randomUUID(),kind:e.target.closest('[data-reader-note]')?'note':'bookmark',offset,end:offset+quote.length,quote,context:reader.renderedText.slice(Math.max(0,offset-32),offset),note:panel.querySelector('textarea').value,format:reader.kind==='MD'?'rendered':undefined,pdfPage:reader.pdfPane?.page,csvCell:cell?{row:cell.row,column:cell.column}:undefined,createdAt:Date.now()};
      workspace.annotations={...workspace.annotations,[reader.id]:[...entries,entry]};reader.save();reader.renderMarks();show(reader,mode);
    }
  };
}
function go(reader,anchor) {
  if(reader.kind==='CSV'){reader.goCsv(anchor);reader.persist();}
  else {reader.searchHit=anchor.end>anchor.offset?{offset:anchor.offset,end:anchor.end}:null;if(anchor.pdfPage&&reader.pdfPane){reader.pdfPane.page=anchor.pdfPage;reader.pdfPane.render().catch(reader.fail);}else{reader.position={offset:anchor.offset,context:anchor.quote?.slice(0,64)};reader.layout();reader.persist();}}
  reader.closeTools?.();reader.chrome(false);
}
