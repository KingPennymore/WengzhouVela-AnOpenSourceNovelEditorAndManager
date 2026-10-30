import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import Writer from '../vendor/acode-writer/src/core.js';
import {documentKind} from './model.mjs';
import {native,exportText,exportBinary} from './platform.mjs';
import {projectConfig,projectWriter} from './vela.mjs';
import {formatsOf} from './rich-text-editor.mjs';
import {chapterExport,chapterFileName} from './chapter-export.mjs';
import {chapterMarkdown,chapterHtml} from './rich-text-export.mjs';
import {epubFileName,MAX_COVER_BYTES,COVER_TYPES} from './epub-names.mjs';
import {loadEpubExport} from './lazy.mjs';

const $=s=>document.querySelector(s);
const missingNote=missing=>{const paths=[...new Set(missing||[])],tables=paths.filter(path=>/\.(csv|tsv)$/i.test(path)).length,images=paths.length-tables;
  return [images?say(`；${images} 张插图无法读取，已省略`,`; ${images} unreadable illustrations omitted`):'',tables?say(`；${tables} 个表格无法读取，导出中保留缺失说明`,`; ${tables} unreadable tables marked as missing in the export`):''].join('');};

/** Chapter, EPUB and whole-book exports of the open document. `app.view` and `app.workspace` are read on each use. */
export function createExportDialogs(app){
  const {current,ensureIndex,openModal,closeModal,toast,save,copyText,stylesFor,exportImages,exportTables}=app;
  function currentSectionIndex(sections){const row=app.view.state.doc.lineAt(app.view.state.selection.main.head).number-1;return Math.max(0,sections.findIndex(section=>row>=section.row&&row<section.endRow));}
  function chapterSelection(form,sections){
    const from=Number(form.get('from')),to=Number(form.get('to'));
    if(to<from)throw Error(t('结束章节不能在起始章节之前。'));
    return {from,to,result:chapterExport(app.view.state.doc.toString(),sections,{from,to,includeTitle:form.has('title'),stripMarkdown:form.has('plain')})};
  }
  /** Export one chapter or a range as TXT, or copy it to the clipboard; the document itself is not changed. */
  function showChapterExport(){
    if(!current()||!app.view)return;const sections=ensureIndex().sections,at=currentSectionIndex(sections),markdown=documentKind(current())==='MD',options=sections.map((section,index)=>`<option value="${index}"${index===at?' selected':''}>${esc(String(index+1).padStart(2,'0')+'　'+section.title)}</option>`).join('');
    const txt=documentKind(current())==='TXT',notes={txt:t('导出为 UTF-8 TXT，章节之间空一行；原文稿不会被修改。'),markdown:t('每段一个 Markdown 段落，章节标题为二级标题；粗体保留，着重号导出为斜体，Markdown 无法表示居中。'),html:t('离线 HTML，保留粗体、着重号和居中；复制时同时放入带格式内容，可粘贴到支持富文本的编辑器。')};
    openModal(t('导出章节'),`<label>${t('起始章节')}<select name="from">${options}</select></label>
      <label>${t('结束章节')}<select name="to">${options}</select></label>
      ${txt?`<label>${t('文件格式')}<select name="format"><option value="txt">${t('纯文本 TXT')}</option><option value="markdown">Markdown</option><option value="html">${t('HTML（保留格式）')}</option></select></label>`:''}<label class="checkbox"><input name="title" type="checkbox" checked>${t('包含章节标题')}</label>
      ${markdown?`<label class="checkbox"><input name="plain" type="checkbox" checked>${t('去除 Markdown 标记')}</label>`:''}<p><button type="button" class="secondary" id="copy-chapters">${t('复制到剪贴板')}</button>${txt?` <button type="button" class="secondary" id="chapter-epub">${t('导出 EPUB…')}</button>`:''}</p>
      <small id="chapter-export-note">${notes.txt}</small>`,async form=>{
      const {from,to,result,format,output}=await formattedSelection(form,sections);
      if(!result.text)throw Error(t('所选章节没有正文。'));
      const saved=await exportText(chapterFileName(current().name,sections,from,to).replace(/\.txt$/,{txt:'.txt',markdown:'.md',html:'.html'}[format]),output.text);
      if(saved!==false)toast(say(`已导出 ${result.chapters} 章${missingNote(output.missing)}`,`Exported ${result.chapters} chapters${missingNote(output.missing)}`));
    },{label:t('导出 TXT')});
    const epub=$('#chapter-epub');if(epub)epub.onclick=()=>{
      const form=new FormData($('#dialog-form'));
      closeModal();
      showEpubExport({from:Number(form.get('from')),to:Number(form.get('to')),includeTitle:form.has('title')});
    };
    const formatSelect=$('#dialog-body [name=format]');if(formatSelect)formatSelect.onchange=()=>{
      $('#dialog-submit').textContent={txt:t('导出 TXT'),markdown:t('导出 Markdown'),html:t('导出 HTML')}[formatSelect.value];
      $('#chapter-export-note').textContent=notes[formatSelect.value];
    };
    $('#copy-chapters').onclick=async()=>{
      const button=$('#copy-chapters');
      button.disabled=true;
      $('#dialog-error').textContent='';
      try{
        const {result,format,output}=await formattedSelection(new FormData($('#dialog-form')),sections);
        if(!result.text)throw Error(t('所选章节没有正文。'));
        const rich=format==='html'?await copyRich(output.html,result.text):(await copyText(format==='markdown'?output.text:result.text),false);
        closeModal();
        toast(say(`已复制 ${result.chapters} 章，共 ${Writer.countText(result.text,projectWriter(app.workspace,app.current()).countMode).toLocaleString()} 字${format==='html'&&!rich?'（此平台只能复制纯文本）':''}`,`Copied ${result.chapters} chapters, ${Writer.countText(result.text,projectWriter(app.workspace,app.current()).countMode).toLocaleString()} characters${format==='html'&&!rich?' (this platform supports plain text copying only)':''}`));
      }catch(cause){
        $('#dialog-error').textContent=t(cause.message);
      }finally{
        button.disabled=false;
      }
    };
  }
  /** The plain selection plus its Markdown or HTML form, using the formats currently in the editor. */
  async function formattedSelection(form,sections){
    const selection=chapterSelection(form,sections),format=form.get('format')||'txt',doc=current(),text=app.view.state.doc.toString(),entries=formatsOf(app.view.state)?.entries||[],options={from:selection.from,to:selection.to,includeTitle:form.has('title')};
    const output=format==='markdown'
      ?chapterMarkdown(text,sections,entries,options,{tables:await exportTables(doc,entries)})
      :format==='html'?chapterHtml(text,sections,entries,options,{title:doc.name.replace(/\.[^.]+$/,''),styles:stylesFor(doc),images:await exportImages(doc,entries),tables:await exportTables(doc,entries)}):selection.result;
    return {...selection,format,output};
  }
  /** Copies HTML with a plain-text fallback; returns false when only plain text could be copied. */
  async function copyRich(html,text){
    if(!native&&navigator.clipboard?.write&&window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
      return true;
    }
    await copyText(text);
    return false;
  }
  /** EPUB of a TXT chapter range with book information, formats and an optional cover. The identifier is kept per document. */
  function showEpubExport(defaults={}){
    const doc=current();if(!doc||!app.view||documentKind(doc)!=='TXT'){toast(t('请先打开 TXT 文稿。'));return;}
    const sections=ensureIndex().sections,project=projectConfig(app.workspace,doc),info=project?.rawConfig?.kind==='workspace'?project.rawConfig.project:{},from=defaults.from??0,to=defaults.to??sections.length-1;
    const options=selected=>sections.map((section,index)=>`<option value="${index}"${index===selected?' selected':''}>${esc(String(index+1).padStart(2,'0')+'　'+section.title)}</option>`).join('');
    openModal(t('导出 EPUB'),`<label>${t('书名')}<input name="book" required maxlength="1000" value="${esc(info?.name||doc.name.replace(/\.[^.]+$/,''))}"></label>
      <label>${t('作者')}<input name="author" maxlength="200" value="${esc(info?.author||'')}"></label>
      <label>${t('简介')}<textarea name="description" rows="3" maxlength="4000">${esc(info?.description||'')}</textarea></label>
      <label>${t('语言')}<input name="language" required maxlength="35" value="zh-CN"></label>
      <label>${t('起始章节')}<select name="from">${options(from)}</select></label>
      <label>${t('结束章节')}<select name="to">${options(to)}</select></label>
      <label class="checkbox"><input name="title" type="checkbox"${defaults.includeTitle===false?'':' checked'}>${t('包含章节标题')}</label>
      <label>${t('封面图片（可选）')}<input name="cover" type="file" accept="${Object.keys(COVER_TYPES).join(',')}"></label>
      <small>${t('每章一个页面，保留粗体、着重号和居中；包含 EPUB 3 目录和供旧阅读器使用的 NCX 目录。原文稿不会被修改。')}</small>`,async form=>{
      const start=Number(form.get('from')),end=Number(form.get('to'));
      if(end<start)throw Error(t('结束章节不能在起始章节之前。'));
      const file=form.get('cover');
      let cover=null;
      if(file&&file.size){
        if(file.size>MAX_COVER_BYTES)throw Error(t('封面图片不能超过 5 MB。'));
        if(!COVER_TYPES[file.type])throw Error(t('封面须为 JPEG、PNG、GIF 或 WebP 图片。'));
        cover={bytes:new Uint8Array(await file.arrayBuffer()),type:file.type};
      }
      const identifier=app.workspace.epubIdentifiers?.[doc.id]||'urn:uuid:'+crypto.randomUUID();
      const {buildEpub}=await loadEpubExport(),entries=formatsOf(app.view.state)?.entries||[],result=buildEpub({text:app.view.state.doc.toString(),sections,entries,styles:stylesFor(doc),images:await exportImages(doc,entries,true),tables:await exportTables(doc,entries),from:start,to:end,includeTitle:form.has('title'),cover,metadata:{title:form.get('book'),author:form.get('author'),description:form.get('description'),language:form.get('language').trim(),identifier}});
      if(app.workspace.epubIdentifiers?.[doc.id]!==identifier){app.workspace.epubIdentifiers={...app.workspace.epubIdentifiers,[doc.id]:identifier};save();}
      const saved=await exportBinary(epubFileName(form.get('book')),result.bytes,'application/epub+zip');
      if(saved!==false)toast(say(`已导出 EPUB：${result.chapters} 章${missingNote(result.missing)}`,`Exported EPUB: ${result.chapters} chapters${missingNote(result.missing)}`));
    },{label:t('导出 EPUB')});
  }
  async function exportBookHtml(){
    if(!current()||!app.view||documentKind(current())!=='TXT')return toast(t('请先打开 TXT 文稿。'));
    const sections=ensureIndex().sections,name=current().name.replace(/\.[^.]+$/,''),doc=current(),entries=formatsOf(app.view.state)?.entries||[],output=chapterHtml(app.view.state.doc.toString(),sections,entries,{from:0,to:sections.length-1},{title:name,styles:stylesFor(doc),images:await exportImages(doc,entries),tables:await exportTables(doc,entries)});
    if(await exportText(name+'.html',output.text)!==false)toast(say(`已导出带格式 HTML${missingNote(output.missing)}`,`Exported formatted HTML${missingNote(output.missing)}`));
  }
  async function copyCurrentChapter(){
    if(!current()||!app.view)return;
    const sections=ensureIndex().sections,at=currentSectionIndex(sections),result=chapterExport(app.view.state.doc.toString(),sections,{from:at,stripMarkdown:documentKind(current())==='MD'});
    if(!result.text)throw Error(t('当前章节没有正文。'));
    await copyText(result.text);
    toast(say(`已复制本章：${sections[at].title}`,`Copied chapter: ${sections[at].title}`));
  }
  return {showChapterExport,showEpubExport,exportBookHtml,copyCurrentChapter};
}
