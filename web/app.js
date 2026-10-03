import {icon} from './icons.mjs';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter} from '@codemirror/view';
import {history, historyKeymap, defaultKeymap, undo, redo, undoDepth, redoDepth} from '@codemirror/commands';
import {searchKeymap, openSearchPanel, highlightSelectionMatches} from '@codemirror/search';
import {languageSupport,loadLanguage} from './languages.mjs';
import {TexCompiler} from './tex-compiler.mjs';
import {PdfPreview} from './pdf-preview.mjs';
import {markdownMath} from './latex.mjs';
import {syntaxHighlighting, defaultHighlightStyle} from '@codemirror/language';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import Writer from '../vendor/acode-writer/src/core.js';
import {indentedLineWrapping} from '../vendor/acode/src/cm/indentedLineWrapping.ts';
import {scrollPastEndCustom} from '../vendor/acode/src/cm/scrollPastEnd.ts';
import {newDocument,validateWorkspace,chapterPosition,normalizeText,fileName,fileKind,documentKind,repoPath,MAX_TEXT_BYTES} from './model.mjs';
import {GitHub,deviceLogin} from './github.mjs';
import {native,transport,readWorkspace,saveWorkspace,exportText,openAuthorization,readEnvironment} from './platform.mjs';
import {guide,isOriginalDemo,previousGuideHashes} from './guide.mjs';
import {shortcuts,matchesKey} from './shortcuts.mjs';
import {SidebarLayout} from './sidebars.mjs';
import {UIShell,organizeSettings} from './ui-shell.mjs';
import {Reader} from './reader.mjs';
import {Subscriptions} from './subscriptions.mjs';
import {createVelaV2,velaText,projectConfig,projectWriter,includeNewReadingFile,rewriteVelaFiles,configFolder,readable,GLOBAL_VELA_PATH,globalConfig} from './vela.mjs';
import {renderVelaEditor} from './vela-view.mjs';
import {completionExtensions} from './completion.mjs';
import {initI18n,setLanguage,t} from './i18n.mjs';
import {fullWidthIndent,paragraphNewline} from './indent.mjs';
import {paragraphSelection} from './selection.mjs';
import {parseCsv,writeCsv,csvDelimiter} from './csv.mjs';
import {decodeFileText} from './file-text.mjs';
import {htmlPreview} from './html-preview.mjs';
import {csvTable} from './csv-view.mjs';
import {palettes,applyPalette,paletteFor} from './palettes.mjs';
import {inlineMarkup,lineMarkup,relativeResource,taskLists} from './markdown-tools.mjs';
import {bindTextZoom} from './gestures.mjs';
import {PluginRuntime} from './plugins.mjs';
import {readPluginZip,fromBase64,MAX_TEX_PLUGIN_BYTES} from './plugin-package.mjs';
import {documentPath,uniquePath,preparePaths,adoptFolder,folderTree} from './workspace.mjs';
import {applyRemoteFile,repositoryFolder,applyRepository} from './git-workspace.mjs';
import {chapterSettings,chapterMatcher} from './chapters.mjs';
import {glossaryPaths,glossaryTerms,parseGlossary,glossaryText,createGlossary} from './glossary.mjs';
import {renderGlossary} from './glossary-view.mjs';
import {applyFileOperation,restoreFile,itemPaths,copyDestination,basename,parentPath,within} from './file-manager.mjs';
import {DocumentService,diffLines} from './document-service.mjs';
import {EditorIndex} from './editor-index.mjs';
import {EditingTools} from './editing-view.mjs';
import {downloadPlan,commitPlan} from './sync-plan.mjs';
import {textFingerprint} from './document-service.mjs';
import {checkUpdates} from './updates.mjs';
import {highlightCode,highlightMarkdown} from './code-preview.mjs';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [id,name] of Object.entries({'theme':'theme','settings':'settings','mobile-library':'files','search-icon':'search','github-icon':'github','search-editor':'search','focus-toggle':'focus','outline-toggle':'outline','export-doc':'export','add-glossary':'glossary'})) $('#'+id).innerHTML=icon(name);
for(const [id,name,label] of [['refresh-folder','refresh','刷新'],['new-folder','newWorkspace','新建工作区'],['workspace-root','root','根目录'],['paste-file','paste','粘贴'],['open-trash','trash','回收站'],['import-doc','import','导入文件'],['new-doc','newFile','新建文件'],['close-outline','close','收起章节目录'],['append-chapter','newFile','追加章节'],['locate-chapter','locate','定位当前章节'],['md-code','code','Markdown 行内代码'],['md-list','list','Markdown 无序列表'],['md-task','task','Markdown 任务列表'],['md-quote','quote','Markdown 引用']]){const button=$('#'+id);button.innerHTML=icon(name);button.title=label;button.setAttribute('aria-label',label);}
for(const id of ['home-button','commands','plugins'])$('#'+id).innerHTML=icon(id==='home-button'?'home':id);
for(const [id,name] of Object.entries({'quick-save':'save','quick-undo':'undo','quick-redo':'redo','quick-top':'top','quick-bottom':'bottom','quick-chapter-top':'chapterTop','quick-chapter-bottom':'chapterBottom','quick-git':'git'})) {$('#'+id+' span').innerHTML=icon(name);$('#'+id).setAttribute('aria-label',$('#'+id).title);}
document.querySelectorAll('[data-view]').forEach(b=>b.innerHTML=icon(b.dataset.view)+(b.dataset.view==='subscriptions'?'<i class="update-dot" hidden></i>':''));
const gh=new GitHub(transport), md=new MarkdownIt({html:false,linkify:false,breaks:true});
// Local previews do not fetch remote images or open links inside the privileged WebView.
md.use(taskLists);md.use(markdownMath);
md.renderer.rules.image=(tokens,i,_options,env)=>{const token=tokens[i],src=token.attrGet('src')||'',alt=token.content||'图片';if(/^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(src))return `<img src="${src}" alt="${esc(alt)}">`;const path=relativeResource(env.path||'',src);return path?`<span class="workspace-image" data-workspace-image="${esc(path)}">[图片：${esc(alt)}]</span>`:`<span>[外部图片：${esc(alt)}]</span>`;};
let workspace,view,index,indexDoc,indexSettings='',saveTimer,statsTimer,toastTimer,outlineRevision='',documents,indexService,editing,outlineLimit=200;
let account=null,repositories=[],selectedRepo=null,selectedBranch='',selectedPath='',loadEpoch=0;
let isPreview=false,dirty=false,bootFailed=false,dialogHandler=null,dialogCancel=null,dialogBusy=false,dialogVersion=0;
let texCompiler,texPreview;
let plugins,home=false,csvRows=[],csvPage=0,csvColumnPage=0,environment=readEnvironment();
let textFontSize=16;
let remoteSelection=new Map(),remoteSelectionRepo='',remoteSelecting=false;
let selectedFolder='',pageName='write',reader,subscriptions,readerFullscreen=false,fullscreenTask=Promise.resolve();
const ui=new UIShell(environment);
const sidebars=new SidebarLayout(()=>view?.requestMeasure());
let fileClipboard=null;
const pluginExtras=new Compartment(),completer=new Compartment(),pluginKeys=new Compartment(),languages=new Compartment(),systemTheme=matchMedia('(prefers-color-scheme: dark)');
const editorStates=new Map();
const current=()=>workspace.documents.find(d=>d.id===workspace.activeId);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function fail(error){toast(error.message||String(error));}
function status(message,changed=false){$('#save-state').textContent=message;$('#save-state').classList.toggle('dirty',changed);}
function save(show=false){
  clearTimeout(saveTimer);saveTimer=null;
  if(bootFailed)return false;
  try{const clean=documents?documents.save():(saveWorkspace(workspace),true);dirty=!clean;status(clean?'已保存到本机':'未保存',!clean);renderTabDirty();if(show&&clean)toast('文件已保存到本机');return clean;}
  catch(e){dirty=true;status('保存失败 · 请导出备份',true);fail(new Error('保存失败：'+e.message));return false;}
}
function scheduleSave(){dirty=true;status('未保存',true);renderTabDirty();if(!saveTimer)saveTimer=setTimeout(()=>save(),1200);}
window.wenzhouSave=()=>save();
window.addEventListener('pagehide',()=>{if(dirty)save();});
window.addEventListener('blur',()=>{if(dirty)save();});
window.addEventListener('beforeunload',e=>{if(dirty&&!save()){e.preventDefault();e.returnValue='';}});
function ensureIndex(){const doc=view.state.doc,writer=projectWriter(workspace,current()),settings=JSON.stringify(writer);if(doc!==indexDoc||settings!==indexSettings||!index){if(!indexService||indexService.doc!==doc||settings!==indexSettings)indexService=new EditorIndex(doc,writer);index=indexService.value;indexDoc=doc;indexSettings=settings;outlineRevision='';}return index;}
function renderOutline(section){
  const idx=ensureIndex(),query=$('#chapter-search').value.trim().toLowerCase();
  const revision=JSON.stringify([current().id,query,idx.chapterCount,idx.total,idx.lineCount]);
  if(revision!==outlineRevision){const matches=idx.sections.map((s,i)=>({s,i})).filter(({s})=>s.title.toLowerCase().includes(query)),visible=matches.slice(0,outlineLimit);if(section&&!visible.some(({s})=>s===section)){const selected=matches.find(({s})=>s===section);if(selected)visible.push(selected);}$('#outline-list').innerHTML=visible.map(({s,i})=>`<button class="chapter" data-row="${s.row}"><span class="chapter-number">${String(i+1).padStart(2,'0')}</span><span>${esc(s.title)}<small>${t(s.count.toLocaleString()+' 字 · 行 '+(s.row+1))}</small></span></button>`).join('')+(matches.length>outlineLimit?`<button id="more-chapters" class="secondary">显示更多 · ${visible.length} / ${matches.length}</button>`:'')||'<p class="blank">没有匹配的章节。</p>';const more=$('#more-chapters');if(more)more.onclick=()=>{outlineLimit+=200;outlineRevision='';updateStats();};outlineRevision=revision;}
  $('#outline-list').querySelectorAll('[data-row]').forEach(b=>b.classList.toggle('active',Number(b.dataset.row)===section?.row));
}
function renderTabDirty(){document.querySelectorAll('.document-tab').forEach(tab=>{const id=tab.querySelector('[data-tab]')?.dataset.tab,marker=tab.querySelector('.tab-dirty');if(marker)marker.textContent=documents?.dirty.has(id)||id===workspace.activeId&&dirty?'●':'';});}
function updateStats(){
  if(!current()||!view){$('#chapter-count').textContent='';$('#word-count').textContent='';$('#current-chapter').textContent='';$('#cursor-position').textContent='';$('#selection-count').textContent='';return;}
  const idx=ensureIndex(),pos=view.state.selection.main.head,row=view.state.doc.lineAt(pos),section=Writer.sectionAt(idx,row.number-1);
  $('#chapter-count').textContent=`${idx.chapterCount} 章`;
  $('#word-count').textContent=`本章 ${section?.count||0} 字 · 全文 ${idx.total} 字`;
  $('#current-chapter').textContent=section?.title||'全文';
  $('#cursor-position').textContent=`行 ${row.number}，列 ${pos-row.from+1}`;
  const selection=view.state.selection.main;$('#selection-count').textContent=selection.empty?'':`选中 ${Writer.countText(view.state.sliceDoc(selection.from,selection.to),workspace.settings.writer.countMode)} 字`;
  renderOutline(section);
  $('#quick-undo').disabled=undoDepth(view.state)===0;$('#quick-redo').disabled=redoDepth(view.state)===0;
}
function languageFor(doc){return languageSupport(doc);}
function activateLanguage(doc){const name=doc.name,kind=doc.kind;loadLanguage(doc).then(extension=>{if(current()?.id===doc.id&&current()?.name===name&&current()?.kind===kind&&view)view.dispatch({effects:languages.reconfigure(extension)});}).catch(fail);}
function refreshFileType(doc){const effects=[languages.reconfigure(languageFor(doc)),completer.reconfigure(completionExtensions(doc,()=>({documents:workspace.documents,terms:glossaryTerms(workspace,doc),glossary:workspace.writingTools?.glossary||[],snippets:workspace.writingTools?.snippets||[],packages:(plugins?.records||[]).filter(record=>record.enabled).flatMap(record=>(record.texFiles||[]).map(file=>file.path))})))];if(workspace.activeId===doc.id&&view)view.dispatch({effects});else if(editorStates.has(doc.id))editorStates.set(doc.id,editorStates.get(doc.id).update({effects}).state);activateLanguage(doc);updateEditorVisibility();if(isPreview&&current())renderPreview();renderDocuments();}
function editorIndent(v,remove=false){if(v.composing)return false;const config=projectConfig(workspace,current())?.config?.editor;if(documentKind(current())==='TXT'&&config?.mode!=='code'&&config?.novelIndent!=='spaces')return fullWidthIndent(v,remove);const n=config?.indentSize||2;if(!remove){v.dispatch(v.state.replaceSelection(' '.repeat(n)));return true;}const line=v.state.doc.lineAt(v.state.selection.main.head),count=line.text.match(/^ +/)?.[0].length||0;v.dispatch({changes:{from:line.from,to:line.from+Math.min(n,count),insert:''}});return true;}
function makeState(doc){const editor=projectConfig(workspace,doc)?.config?.editor,position=workspace.editorPositions?.[doc.id];return EditorState.create({doc:doc.text,selection:position?{anchor:Math.min(doc.text.length,position.anchor),head:Math.min(doc.text.length,position.head)}:undefined,extensions:[history(),pluginExtras.of(plugins?.extensions()||[]),completer.of(editor?.completion===false?[]:completionExtensions(doc,()=>({documents:workspace.documents,terms:glossaryTerms(workspace,doc),glossary:workspace.writingTools?.glossary||[],snippets:workspace.writingTools?.snippets||[],packages:(plugins?.records||[]).filter(record=>record.enabled).flatMap(record=>(record.texFiles||[]).map(file=>file.path))}))),keymap.of([{key:'Enter',run:v=>documentKind(doc)==='TXT'&&editor?.mode!=='code'?paragraphNewline(v):false,shift:v=>documentKind(doc)==='TXT'&&editor?.mode!=='code'?paragraphNewline(v):false},{key:'Tab',run:v=>editorIndent(v)},{key:'Shift-Tab',run:v=>editorIndent(v,true)},...defaultKeymap,...historyKeymap,...searchKeymap]),pluginKeys.of(keymap.of(plugins?.bindings()||[])),lineNumbers(),highlightActiveLine(),highlightActiveLineGutter(),paragraphSelection(),highlightSelectionMatches(),languages.of(languageFor(doc)),syntaxHighlighting(defaultHighlightStyle),editor?.wrap===false?[]:indentedLineWrapping('same'),EditorView.theme({'.cm-content':{lineHeight:String(editor?.lineHeight||1.8),maxWidth:(editor?.maxWidth||1000)+'px',margin:'0 auto'}}),scrollPastEndCustom(.35),EditorView.contentAttributes.of({'aria-label':'文稿正文','spellcheck':'false'}),EditorView.updateListener.of(update=>{
  if(update.docChanged){const d=current();if(!d)return;const changes=[];update.changes.iterChanges((from,to,_a,_b,insert)=>changes.push({from,to,insert:insert.toString()}));documents.changeTree(d,update.state.doc,changes);if(indexService&&indexSettings===JSON.stringify(projectWriter(workspace,d))&&indexService.update(update)){index=indexService.value;indexDoc=update.state.doc;outlineRevision='';}scheduleSave();plugins?.emit('file-content-changed',plugins.manager.activeFile);if(!statsTimer)statsTimer=setTimeout(()=>{statsTimer=null;updateStats();if(document.body.classList.contains('show-library'))renderDocuments();},200);}
  if(update.selectionSet){const range=update.state.selection.main;workspace.editorPositions={...workspace.editorPositions,[workspace.activeId]:{anchor:range.anchor,head:range.head}};if(!update.docChanged)updateStats();}
  if(update.docChanged||update.selectionSet){$('#quick-undo').disabled=undoDepth(update.state)===0;$('#quick-redo').disabled=redoDepth(update.state)===0;}
})]});}
function renderDocuments(){
  const query=$('#doc-search').value.toLowerCase();
  const docs=workspace.documents.filter(d=>documentPath(d).toLowerCase().includes(query)||d.text.toLowerCase().includes(query));
  $('#doc-count').textContent=workspace.documents.length;
  $('#workspace-name').textContent='内部文件夹';
  $('#workspace-name').title=workspace.storage?.root||'';
  $('#selected-folder').textContent=selectedFolder||'/';$('#file-sort').value=workspace.settings.filesSort||'name';$('#paste-file').disabled=!fileClipboard;
  $('#document-tabs').innerHTML=workspace.openIds.map(id=>workspace.documents.find(d=>d.id===id)).filter(Boolean).map(d=>`<div class="document-tab ${d.id===workspace.activeId?'active':''}"><button class="tab-open" role="tab" aria-selected="${d.id===workspace.activeId}" data-tab="${esc(d.id)}"><span class="file-kind">${documentKind(d)}</span><strong>${esc(d.name)}</strong><span class="tab-dirty">${d.id===workspace.activeId&&dirty?'●':''}</span></button><button class="tab-close" data-close="${esc(d.id)}" title="关闭 ${esc(d.name)} (Ctrl+W)" aria-label="关闭 ${esc(d.name)}">×</button></div>`).join('');
  if(workspace.storage?.id||workspace.folders?.length){$('#doc-list').innerHTML=folderTree(workspace,docs,esc,selectedFolder,workspace.settings.filesSort);return;}
  $('#doc-list').innerHTML=docs.map(d=>`<div class="doc-item ${d.id===workspace.activeId?'active':''}"><button class="doc-open" data-doc="${esc(d.id)}"><span class="doc-symbol">${documentKind(d)}</span><span class="doc-info"><strong>${esc(d.name)}</strong><small>${new Date(d.updatedAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} · ${Writer.countText(d.text).toLocaleString()} 字${d.remote?' · Git':''}</small></span></button><button class="doc-menu" data-menu="${esc(d.id)}" title="文稿操作" aria-label="${esc(d.name)} 文稿操作">···</button></div>`).join('')||'<p class="blank">没有找到文稿。</p>';
}
function switchDocument(id){
  if(!workspace.documents.some(d=>d.id===id))return;
  if(view){editorStates.delete(workspace.activeId);editorStates.set(workspace.activeId,view.state);if(dirty&&!save())return;while(editorStates.size>8)editorStates.delete(editorStates.keys().next().value);}
  if(!workspace.openIds.includes(id))workspace.openIds.push(id);
  workspace.activeId=id;const doc=current();if(!doc)return;
  home=false;csvPage=0;csvColumnPage=0;$('#start-page').hidden=true;isPreview=['CSV','VELA','GLY'].includes(documentKind(doc));
  if(view)view.setState(editorStates.get(id)||makeState(doc));else view=new EditorView({state:makeState(doc),parent:$('#editor')});
  activateLanguage(doc);index=null;setFontSize(projectConfig(workspace,doc)?.config?.editor?.fontSize??workspace.settings.fontSize,false);$('#current-name').textContent=doc.name;
  updateEditorVisibility();renderDocuments();updateStats();if(isPreview)renderPreview();save();showView('write');plugins?.emit('switch-file',plugins.manager.activeFile);
}
function closeDocument(id){
  if(dirty&&!save())return;
  const position=workspace.openIds.indexOf(id);if(position<0)return;
  workspace.openIds=workspace.openIds.filter(open=>open!==id);
  if(workspace.activeId===id){if(workspace.openIds.length)switchDocument(workspace.openIds[Math.min(position,workspace.openIds.length-1)]);else showHome();}else{renderDocuments();save();}
}
function updateEditorVisibility(){
  renderDisplayOptions();const split=workspace.settings.splitPreview&&innerWidth>=1000&&isPreview&&!home;document.body.classList.toggle('split-preview',!!split);$('#markdown-tools').hidden=home||isPreview&&!split||documentKind(current())!=='MD';document.querySelectorAll('#markdown-tools button').forEach(button=>button.disabled=home||documentKind(current())!=='MD');$('#editor').hidden=home||isPreview&&!split;$('#preview').hidden=home||!isPreview;
  for(const id of ['search-editor','outline-toggle','focus-toggle','export-doc','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','append-chapter','locate-chapter'])$('#'+id).disabled=home;
  $('#add-glossary').disabled=home||isPreview||pageName!=='write';
  if(home){$('#quick-undo').disabled=true;$('#quick-redo').disabled=true;}
}
function renderDisplayOptions(){
  const doc=current();$('#display-options').hidden=home||!doc;if(!doc)return;
  const kind=documentKind(doc);$('#display-options').innerHTML=`<button data-format title="选择文件类型">${kind==='MD'?'Markdown':kind==='TXT'?'文本':kind}</button><button data-display="source" title="源码" aria-label="源码" class="${!isPreview?'selected':''}">${icon('code')}</button><button data-display="preview" title="预览" aria-label="预览" class="${isPreview?'selected':''}">${icon('preview')}</button>${native&&kind==='HTML'&&isPreview?`<button data-native-html title="在独立页面中调试 HTML" aria-label="独立预览">${icon('external')}</button>`:''}`;
}
$('#display-options').onclick=e=>{if(e.target.closest('[data-native-html]')){openNativeHtml();return;}const mode=e.target.closest('[data-display]');if(mode){isPreview=mode.dataset.display==='preview';updateEditorVisibility();if(isPreview)renderPreview();else view.focus();}if(e.target.closest('[data-format]')){const doc=current();openModal('文件类型',`<label>编辑格式<select name="kind">${[['','按扩展名识别'],['TXT','纯文本'],['MD','Markdown'],['HTML','HTML'],['CSV','CSV 表格'],['VELA','VELA 工作区配置'],['GLY','术语库'],['TEX','LaTeX'],['CODE','代码']].map(([value,label])=>`<option value="${value}" ${value===(doc.kind||'')?'selected':''}>${label}</option>`).join('')}</select></label>`,f=>{doc.kind=f.get('kind')||undefined;isPreview=['CSV','VELA','GLY'].includes(documentKind(doc));refreshFileType(doc);save();});}};
function showHome(){
  if(view){if(dirty&&!save())return;editorStates.set(workspace.activeId,view.state);view.destroy();view=null;}
  workspace.activeId=null;home=true;isPreview=false;index=null;$('#current-name').textContent='启动页';$('#start-page').hidden=false;updateEditorVisibility();renderHome();renderDocuments();updateStats();showView('write');setSidebar('outline',false);save();plugins?.emit('switch-file',null);
}
function renderHome(){
  const files=workspace.documents.filter(d=>documentKind(d)!=='VELA'),projects=workspace.documents.filter(d=>documentKind(d)==='VELA'&&documentPath(d)!==GLOBAL_VELA_PATH),recent=[...workspace.documents].sort((a,b)=>b.updatedAt-a.updatedAt);
  $('#start-page').innerHTML=`<header class="start-page-header">${icon('write')}<div><h1>文舟</h1></div></header><div class="start-stats"><div class="start-stat"><strong>${files.length}</strong>本地文件</div><div class="start-stat"><strong>${projects.length}</strong>工作区</div><div class="start-stat"><strong>${files.filter(readable).length}</strong>阅读文件</div></div><div class="start-primary"><button class="primary" data-start="new-doc" title="新建文件" aria-label="新建文件">${icon('newFile')}</button><button class="secondary" data-start="import-doc" title="导入文件" aria-label="导入文件">${icon('import')}</button><button class="secondary" data-start="quick-git" title="GitHub" aria-label="GitHub">${icon('github')}</button></div><div class="start-actions"><button data-start="guide" title="操作指南" aria-label="操作指南">${icon('guide')}</button><button data-start="commands" title="命令与快捷键" aria-label="命令与快捷键">${icon('commands')}</button><button data-start="plugins" title="Acode 插件" aria-label="Acode 插件">${icon('plugins')}</button><button data-start="settings" title="设置" aria-label="设置">${icon('settings')}</button></div><h2>最近文件</h2><div class="recent-files">${recent.map(d=>`<button data-recent="${esc(d.id)}"><span class="file-kind">${documentKind(d)}</span><div><strong data-user-content>${esc(d.name)}</strong><small data-user-content>${esc(parentPath(documentPath(d))||t('内部文件夹'))} · ${new Date(d.updatedAt).toLocaleDateString(workspace.settings.language==='en'?'en':'zh-CN')}</small></div></button>`).join('')||'<p class="blank">暂无本地文件</p>'}</div>`;
}
$('#start-page').onclick=e=>{const recent=e.target.closest('[data-recent]');if(recent)switchDocument(recent.dataset.recent);const action=e.target.closest('[data-start]');if(action){if(action.dataset.start==='guide'){const existing=workspace.documents.find(d=>d.name==='操作指南.txt');if(existing)switchDocument(existing.id);else addDocument(newDocument('操作指南.txt',guide));}else runAction(action.dataset.start);}};
$('#home-button').onclick=showHome;
function jump(position){if(!view)return;if(isPreview)togglePreview();view.dispatch({selection:{anchor:position},scrollIntoView:true});view.focus();updateStats();}
function renderPreview(){
  if(documentKind(current())!=='TEX')texPreview?.dispose();
  $('#preview').className='markdown';
  if(documentKind(current())==='VELA'){renderVela();return;}
  if(documentKind(current())==='GLY'){renderGlossary({root:$('#preview'),doc:current(),escape:esc,onSave:text=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.glossary'});if(!save())throw Error('保存失败');renderPreview();toast('术语库已保存');}});return;}
  const kind=documentKind(current()),text=view.state.doc.toString();$('#preview').classList.toggle('plain-preview',kind==='TXT');$('#preview').classList.toggle('csv-preview',kind==='CSV');$('#preview').classList.toggle('html-preview',kind==='HTML');
  if(kind==='CSV'){
    try{
      const separator=current().delimiter||csvDelimiter(text);csvRows=parseCsv(text,separator);
      const grid=csvTable(csvRows,csvPage,csvColumnPage,separator,esc);csvPage=grid.rowPage;csvColumnPage=grid.columnPage;$('#preview').innerHTML=grid.html;
      $('#csv-prev').onclick=()=>{csvPage--;renderPreview();};$('#csv-next').onclick=()=>{csvPage++;renderPreview();};
      if($('#csv-column-prev'))$('#csv-column-prev').onclick=()=>{csvColumnPage--;renderPreview();};if($('#csv-column-next'))$('#csv-column-next').onclick=()=>{csvColumnPage++;renderPreview();};
      $('#csv-delimiter').onchange=e=>{current().delimiter=e.target.value;csvPage=0;csvColumnPage=0;renderPreview();save();};
      $('#csv-add-row').onclick=()=>{csvRows.push(Array(grid.columns).fill(''));csvPage=Math.floor((csvRows.length-1)/grid.pageSize);applyCsv();renderPreview();};
      $('#csv-add-column').onclick=()=>{csvRows=csvRows.map(row=>[...row,...Array(grid.columns-row.length).fill(''),'']);csvColumnPage=Math.floor(grid.columns/50);applyCsv();renderPreview();};const tools=document.createElement('button');tools.className='secondary';tools.textContent='表格操作';$('#preview .csv-toolbar').append(tools);tools.onclick=()=>openModal('表格操作',`<label>操作<select name="action"><option value="delete-row">删除行</option><option value="delete-column">删除列</option><option value="sort">按列排序</option></select></label><label>行号<input name="row" type="number" min="1" max="${csvRows.length}" value="1"></label><label>列号<input name="column" type="number" min="1" max="${grid.columns}" value="1"></label><label class="checkbox"><input name="header" type="checkbox" checked>排序保留第一行表头</label><label class="checkbox"><input name="descending" type="checkbox">降序</label><p>修改后可以使用撤销恢复。</p>`,form=>{const action=form.get('action'),row=Number(form.get('row'))-1,column=Number(form.get('column'))-1;if(action==='delete-row'){csvRows.splice(row,1);if(!csvRows.length)csvRows=[['']];}else if(action==='delete-column'){csvRows=csvRows.map(row=>row.filter((_,i)=>i!==column));}else{const header=form.has('header')?csvRows.shift():null;csvRows.sort((a,b)=>String(a[column]||'').localeCompare(String(b[column]||''),workspace.settings.language,{numeric:true})*(form.has('descending')?-1:1));if(header)csvRows.unshift(header);}applyCsv();renderPreview();save();});
    }catch(e){$('#preview').innerHTML=`<p class="error">${esc(e.message)}</p><button class="secondary" id="csv-source">编辑 CSV 源码</button>`;$('#csv-source').onclick=togglePreview;}return;
  }
  if(kind==='HTML'){
    const frame=document.createElement('iframe');frame.title='HTML 文件预览';frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');$('#preview').replaceChildren(frame);
    if(native){
      if(!save()){frame.remove();return;}
      transport('previewHtml',{path:documentPath(current()),embedded:true,dark:workspace.settings.dark,fontSize:textFontSize}).then(src=>{
        if(!frame.isConnected||!isPreview)return;
        const url=new URL(src);if(url.origin!=='https://wenzhou-preview.local')throw new Error('HTML 预览地址无效。');frame.src=url.href;
      }).catch(error=>{if(frame.isConnected){frame.remove();$('#preview').textContent=error.message;}});
    }else frame.srcdoc=htmlPreview(text,{dark:workspace.settings.dark,fontSize:textFontSize});return;
  }
  if(kind==='TEX'){texPreview.mount($('#preview'),current());return;}if(['TXT','CODE'].includes(kind)){$('#preview').textContent=text;if(kind==='CODE'){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=text;pre.append(code);$('#preview').replaceChildren(pre);highlightCode(code,text,current().name).catch(fail);}return;}
  $('#preview').innerHTML=DOMPurify.sanitize(md.render(text,{path:documentPath(current())}),{FORBID_TAGS:['iframe','form','input','button','video','audio','style'],FORBID_ATTR:['style']});
  highlightMarkdown($('#preview'));
  if(native&&workspace.storage?.id)for(const placeholder of [...$('#preview').querySelectorAll('[data-workspace-image]')].slice(0,20)){transport('readWorkspaceAsset',{path:placeholder.dataset.workspaceImage}).then(src=>{if(!placeholder.isConnected)return;const img=document.createElement('img');img.alt=placeholder.textContent;img.src=src;placeholder.replaceWith(img);}).catch(error=>{if(placeholder.isConnected)placeholder.title=error.message;});}
}
function applyCsv(){const source=view.state.doc.toString(),separator=current().delimiter||csvDelimiter(source),prefix=/^\uFEFF?sep=([,;\t])\r?\n/i.test(source)?'sep='+separator+'\n':'';const text=prefix+writeCsv(csvRows,separator);if(text===view.state.doc.toString())return;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});updateStats();}
$('#preview').addEventListener('input',e=>{const cell=e.target.closest('[data-cell-row]');if(!cell)return;const row=Number(cell.dataset.cellRow),column=Number(cell.dataset.cellColumn);while(csvRows[row].length<=column)csvRows[row].push('');csvRows[row][column]=cell.value;applyCsv();});
$('#preview').addEventListener('paste',e=>{const cell=e.target.closest('[data-cell-row]'),text=e.clipboardData?.getData('text/plain');if(!cell||!text?.includes('\t'))return;try{const grid=parseCsv(text,'\t'),row=Number(cell.dataset.cellRow),column=Number(cell.dataset.cellColumn);for(const [r,values] of grid.entries()){csvRows[row+r]||=[];for(const [c,value] of values.entries())csvRows[row+r][column+c]=value;}e.preventDefault();applyCsv();renderPreview();}catch(error){fail(error);}});
async function openNativeHtml(){if(!save())return;try{await transport('previewHtml',{path:documentPath(current()),dark:workspace.settings.dark,language:workspace.settings.language,fontSize:textFontSize});}catch(error){fail(error);}}
function togglePreview(){if(!current()||!view)return;isPreview=!isPreview;updateEditorVisibility();if(isPreview)renderPreview();else view.focus();}
for(const [id,mark] of [['md-bold','**'],['md-italic','*'],['md-strike','~~'],['md-code','`']])$('#'+id).onclick=()=>inlineMarkup(view,mark);
for(const [id,prefix] of [['md-heading','# '],['md-list','- '],['md-task','- [ ] '],['md-quote','> ']])$('#'+id).onclick=()=>lineMarkup(view,prefix);
$('#markdown-tools').addEventListener('mousedown',e=>e.preventDefault());
$('#preview').addEventListener('click',e=>{if(e.target.closest('a')){e.preventDefault();toast('阅读预览中的外部链接不在应用内打开。');}});
function openModal(title,html,submit,options={}){
  ui.close();$('#dialog').classList.remove('settings-dialog');
  dialogVersion++;
  if($('#dialog').open)$('#dialog').close();
  $('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$('#dialog-error').textContent='';$('#dialog-submit').textContent=options.label||'确定';$('#dialog-submit').hidden=options.noSubmit||false;$('#dialog-submit').disabled=false;
  dialogHandler=submit;dialogCancel=options.cancel||null;dialogBusy=false;$('#dialog').showModal();
}
function closeModal(){if(dialogBusy)return;dialogCancel?.();dialogCancel=null;$('#dialog').close();}
$('#dialog-close').innerHTML=icon('close');$('#dialog-close').onclick=closeModal;$('#dialog-cancel').onclick=closeModal;
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('#dialog-form').onsubmit=async e=>{e.preventDefault();if(dialogBusy)return;const version=dialogVersion;dialogBusy=true;$('#dialog-submit').disabled=true;try{const result=await dialogHandler?.(new FormData(e.target));if(version===dialogVersion&&result!==false){dialogCancel=null;$('#dialog').close();}}catch(err){if(version===dialogVersion)$('#dialog-error').textContent=err.message;else fail(err);}finally{if(version===dialogVersion){dialogBusy=false;$('#dialog-submit').disabled=false;}}};
function addDocument(doc){doc.path=uniquePath(doc.path||(selectedFolder?selectedFolder+'/':'')+doc.name,itemPaths(workspace));doc.name=doc.path.split('/').at(-1);workspace.documents.unshift(doc);switchDocument(doc.id);includeNewReadingFile(workspace,doc);for(const item of workspace.documents.filter(d=>documentKind(d)==='VELA'&&d.id!==workspace.activeId))editorStates.delete(item.id);save();showView('write');plugins?.emit('new-file',plugins.file(doc));return doc;}
$('#new-doc').onclick=()=>openModal('新建文件','<label>文件名<input name="name" value="未命名小说.txt" required maxlength="160" autofocus></label><label>初始内容<select name="template"><option value="chapters">单文件章节模板</option><option value="empty">空白文件</option></select></label><small>支持 TXT、Markdown、HTML、CSV、LaTeX 和常见代码格式；TXT 小说的全部章节可写在同一文件中。</small>',form=>{addDocument(newDocument(fileName(form.get('name')),fileKind(fileName(form.get('name')))==='GLY'?glossaryText(createGlossary(fileName(form.get('name')))):form.get('template')==='chapters'&&['TXT','MD'].includes(fileKind(fileName(form.get('name'))))?(fileKind(fileName(form.get('name')))==='MD'?'# 第一章\n\n\n# 第二章\n\n':'第一章\n\n\n第二章\n\n'):''));});
$('#doc-search').oninput=renderDocuments;
$('#doc-list').onclick=e=>{const pathMenu=e.target.closest('[data-path-menu]');if(pathMenu){e.preventDefault();e.stopPropagation();fileMenu(pathMenu.dataset.pathMenu,pathMenu.dataset.directory==='true');return;}const folder=e.target.closest('[data-folder]');if(folder){selectedFolder=folder.dataset.folder;$('#selected-folder').textContent=selectedFolder;$('#doc-list').querySelectorAll('summary').forEach(el=>el.classList.toggle('selected-folder',el.dataset.folder===selectedFolder));}const doc=e.target.closest('[data-doc]');if(doc){selectedFolder=parentPath(documentPath(workspace.documents.find(d=>d.id===doc.dataset.doc)));loadSubscriptionDocument(workspace.documents.find(d=>d.id===doc.dataset.doc)).then(()=>switchDocument(doc.dataset.doc)).catch(fail);}const menu=e.target.closest('[data-menu]');if(menu)documentMenu(menu.dataset.menu);};
$('#refresh-folder').onclick=async()=>{try{if(dirty&&!save())return;if(!native){renderDocuments();toast('工作区已刷新');return;}const result=await transport('refreshFolder');if(view){view.destroy();view=null;}editorStates.clear();adoptFolder(workspace,result);showHome();toast('工作区已刷新');}catch(error){fail(error);}};
$('#new-folder').onclick=()=>newFolder(selectedFolder);
function newFolder(parent=''){openModal('新建工作区',`<label>相对路径<input name="path" value="${esc(parent?parent+'/':'')}" required placeholder="Novel/Volume-1"></label>`,f=>{const path=repoPath(f.get('path'));if(itemPaths(workspace).has(path))throw new Error('此路径已存在。');const previous=JSON.stringify(workspace),parts=path.split('/');workspace.folders=[...new Set([...(workspace.folders||[]),...parts.map((_,i)=>parts.slice(0,i+1).join('/'))])];const config=createVelaV2(basename(path)),defaults=globalConfig(workspace)?.config?.workspaceDefaults;for(const key of ['editor','reader','chapters'])if(defaults?.[key])config[key]=structuredClone(defaults[key]);if(defaults?.reading?.layout)config.reading.layout=structuredClone(defaults.reading.layout);const doc=newDocument('.vela',velaText(config));doc.path=path+'/.vela';workspace.documents.push(doc);if(!save()){workspace=JSON.parse(previous);throw new Error('文件夹创建失败。');}selectedFolder=path;renderDocuments();});}

$('#workspace-root').onclick=()=>{selectedFolder='';renderDocuments();};
$('#file-sort').onchange=e=>{workspace.settings.filesSort=e.target.value;renderDocuments();save();};
$('#paste-file').onclick=async()=>{try{if(!fileClipboard)return;if(fileClipboard.workspaceId!==(workspace.storage?.id||''))throw new Error('请切回复制或剪切项目所在的工作区。');const destination=fileClipboard.cut?(selectedFolder?selectedFolder+'/':'')+basename(fileClipboard.path):copyDestination(workspace,fileClipboard.path,selectedFolder);if(destination!==fileClipboard.path)await manageFile(fileClipboard.cut?'move':'copy',fileClipboard.path,destination);if(fileClipboard.cut)fileClipboard=null;renderDocuments();}catch(error){fail(error);}};
function documentMenu(id){const doc=workspace.documents.find(doc=>doc.id===id);if(doc)fileMenu(documentPath(doc),false,doc);}
function fileMenu(path,directory=false,doc=workspace.documents.find(doc=>documentPath(doc)===path)){
  openModal(directory?'文件夹操作':'文件操作',`<p>${esc(path)}</p><div class="button-row file-actions">${directory?'<button type="button" class="secondary" id="folder-new-file">新建文件</button><button type="button" class="secondary" id="folder-new-folder">新建工作区</button>':''}<button type="button" class="secondary" id="rename-doc">重命名</button><button type="button" class="secondary" id="move-file">移动</button><button type="button" class="secondary" id="copy-file">复制</button><button type="button" class="secondary" id="cut-file">剪切</button><button type="button" class="secondary" id="duplicate-doc">保存副本</button>${doc?'<button type="button" class="secondary" id="menu-export">导出文件</button>':''}<button type="button" class="secondary" id="file-properties">属性</button><button type="button" class="danger" id="delete-doc">移入回收站</button></div>`,null,{noSubmit:true});
  if(directory){$('#folder-new-file').onclick=()=>{selectedFolder=path;$('#new-doc').click();};$('#folder-new-folder').onclick=()=>newFolder(path);}
  $('#rename-doc').onclick=()=>renameItem(path);
  $('#move-file').onclick=()=>openModal('移动项目',`<label>目标路径<input name="path" required value="${esc(path)}"></label><small>填写包含文件名或文件夹名称的相对路径。</small>`,async f=>manageFile('move',path,repoPath(f.get('path'))));
  for(const [id,cut] of [['copy-file',false],['cut-file',true]])$('#'+id).onclick=()=>{fileClipboard={workspaceId:workspace.storage?.id||'',path,cut};closeModal();renderDocuments();toast(cut?'已剪切，请选择目标文件夹后粘贴':'已复制，请选择目标文件夹后粘贴');};
  $('#duplicate-doc').onclick=async()=>{try{await manageFile('copy',path,copyDestination(workspace,path));closeModal();}catch(error){$('#dialog-error').textContent=error.message;}};
  if(doc)$('#menu-export').onclick=()=>exportText(doc.name,doc.text).catch(fail);
  $('#file-properties').onclick=()=>showProperties(path,directory).catch(fail);
  $('#delete-doc').onclick=()=>openModal('移入回收站',`<p>将“${esc(path)}”${directory?'及其中全部文件':''}移入回收站？可在当前工作区的回收站中恢复。</p><small>不会删除 GitHub 中的文件。</small>`,async()=>manageFile('delete',path),{label:'移入回收站'});
}
function renameItem(path){openModal('重命名',`<label>名称<input name="name" required maxlength="160" value="${esc(basename(path))}"></label>`,async f=>{const name=repoPath(f.get('name'));if(name.includes('/'))throw new Error('名称不能包含斜杠。');const destination=(parentPath(path)?parentPath(path)+'/':'')+name;if(destination!==path)await manageFile('move',path,destination);});}
function applyFileState(result){
  const active=workspace.activeId,wasHome=home;if(view){editorStates.set(active,view.state);view.destroy();view=null;}
  adoptFolder(workspace,result);preparePaths(workspace);
  for(const id of editorStates.keys())if(!workspace.documents.some(doc=>doc.id===id))editorStates.delete(id);
  if(selectedFolder&&!workspace.folders.includes(selectedFolder))selectedFolder='';
  if(!wasHome&&workspace.documents.some(doc=>doc.id===active)){switchDocument(active);refreshFileType(current());}else showHome();
  renderDocuments();if(!save())throw new Error('操作已完成，但工作区状态未保存，请保留应用数据并重试保存。');
}
async function manageFile(action,path,destination=''){
  if(!save())throw new Error('请先保存或导出当前文稿。');
  const before=structuredClone(workspace);
  if(native)applyFileState(await transport('manageFiles',{action,path,destination}));
  else{const previous=JSON.stringify(workspace);try{applyFileOperation(workspace,action,path,destination);const result={storage:workspace.storage,documents:workspace.documents,folders:workspace.folders,entries:workspace.entries,repositories:workspace.repositories};applyFileState(result);}catch(error){workspace=JSON.parse(previous);throw error;}}
  workspace.treeRevision=(workspace.treeRevision||0)+1;rewriteVelaFiles(before,workspace,action,path,destination);for(const doc of workspace.documents.filter(doc=>documentKind(doc)==='VELA'))editorStates.delete(doc.id);if(current()&&documentKind(current())==='VELA'&&view){view.setState(makeState(current()));if(isPreview)renderPreview();}index=null;updateStats();save();
  toast(action==='delete'?'已移入回收站':action==='copy'?'已保存副本':'项目已移动或重命名');
}
async function showProperties(path,directory){
  if(!save())throw new Error('请先保存当前文稿。');const state=native?await transport('refreshFolder'):workspace;
  const entries=(state.entries||[]).filter(entry=>within(path,entry.path)),doc=workspace.documents.find(doc=>documentPath(doc)===path);
  const size=entries.reduce((sum,item)=>sum+(item.directory?0:item.size||0),0)||(!directory&&doc?new TextEncoder().encode(doc.text).length:0);
  openModal('属性',`<p>名称：${esc(basename(path))}</p><p>路径：${esc(path)}</p><p>工作区：${esc(workspace.storage?.label||'内部文件夹')}</p><p>类型：${directory?'文件夹':doc?documentKind(doc):'文件'}</p><p>大小：${size.toLocaleString()} 字节</p>${directory?`<p>文件：${entries.filter(item=>!item.directory).length}　文件夹：${entries.filter(item=>item.directory&&item.path!==path).length}</p>`:doc?`<p>修改时间：${esc(new Date(doc.updatedAt).toLocaleString('zh-CN'))}</p>`:''}`,null,{noSubmit:true});
}
$('#open-trash').onclick=()=>showTrash().catch(fail);
async function showTrash(){
  const items=native?await transport('listTrash'):workspace.trash||[];
  openModal('回收站',items.length?items.map(item=>`<div class="trash-row"><span>${esc(item.path)}<small>${esc(new Date(item.createdAt).toLocaleString('zh-CN'))}</small></span><button type="button" class="secondary" data-restore="${esc(item.id)}">恢复</button><button type="button" class="danger" data-permanent="${esc(item.id)}">永久删除</button></div>`).join(''):'<p>当前工作区的回收站为空。</p>',null,{noSubmit:true});
  const restore=async(id,permanent=false)=>{if(!save())throw new Error('请先保存文稿。');if(native)applyFileState(await transport('restoreTrash',{id,permanent}));else{restoreFile(workspace,id,permanent);applyFileState({storage:workspace.storage,documents:workspace.documents,folders:workspace.folders,entries:workspace.entries,repositories:workspace.repositories});}};
  $('#dialog-body').querySelectorAll('[data-restore]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await restore(button.dataset.restore);await showTrash();}catch(error){$('#dialog-error').textContent=error.message;button.disabled=false;}});
  $('#dialog-body').querySelectorAll('[data-permanent]').forEach(button=>button.onclick=()=>openModal('永久删除',`<p>永久删除“${esc(items.find(item=>item.id===button.dataset.permanent).path)}”？此操作无法恢复。</p>`,async()=>{await restore(button.dataset.permanent,true);setTimeout(()=>showTrash().catch(fail),0);},{label:'永久删除'}));
}
$('#current-name').ondblclick=()=>{if(current())renameDocument(current());};
function renameDocument(doc){renameItem(documentPath(doc));}
$('#document-tabs').onclick=e=>{const close=e.target.closest('[data-close]');if(close){closeDocument(close.dataset.close);return;}const b=e.target.closest('[data-tab]');if(b)switchDocument(b.dataset.tab);};
$('#outline-list').onclick=e=>{const b=e.target.closest('[data-row]');if(b){jump(view.state.doc.line(Number(b.dataset.row)+1).from);if(innerWidth<=1000)setSidebar('outline',false);}};
$('#chapter-search').oninput=()=>{outlineLimit=200;outlineRevision='';updateStats();};
$('#locate-chapter').onclick=()=>{$('#chapter-search').value='';outlineRevision='';updateStats();$('#outline-list .active')?.scrollIntoView({block:'center'});};
$('#append-chapter').onclick=()=>{const idx=ensureIndex();openModal('追加章节',`<label>章节标题<input name="title" required value="第${idx.chapterCount+1}章" placeholder="例如：第四章 标题"></label><small>在当前小说文件的末尾追加章节，保留现有正文。</small>`,f=>{const title=f.get('title').trim();if(title.includes('\n')||!chapterMatcher(projectWriter(workspace,current()))(title))throw new Error('未识别为章节标题，请使用标准标题或添加对应标题模板。');const end=view.state.doc.length,insert=(end?'\n\n':'')+title+'\n\n';if(isPreview)togglePreview();view.dispatch({changes:{from:end,insert},selection:{anchor:end+insert.length},scrollIntoView:true});view.focus();updateStats();});};
$('#search-editor').onclick=()=>{if(isPreview)togglePreview();openSearchPanel(view);};
$('#focus-toggle').onclick=()=>{document.body.classList.toggle('focus');sidebars.update();};
function setSidebar(name,open,animate=true){document.body.classList.toggle('show-'+name,open);if(open)document.body.classList.remove('focus');sidebars.update(animate);$('#mobile-library').setAttribute('aria-expanded',String(document.body.classList.contains('show-library')));$('#outline-toggle').setAttribute('aria-expanded',String(document.body.classList.contains('show-outline')));$('#mobile-library').classList.toggle('active-tool',document.body.classList.contains('show-library'));$('#outline-toggle').classList.toggle('active-tool',document.body.classList.contains('show-outline'));}
$('#outline-toggle').onclick=()=>{if(pageName==='reader'){reader?.toggleOutline();return;}setSidebar('outline',!document.body.classList.contains('show-outline'));};
$('#mobile-library').onclick=()=>{renderDocuments();workspace.settings.libraryOpen=!document.body.classList.contains('show-library');setSidebar('library',workspace.settings.libraryOpen,true);save();};
$('#close-outline').onclick=()=>setSidebar('outline',false);
$('#export-doc').onclick=()=>exportText(current().name,current().text).then(result=>{if(result!==false)toast('文稿已导出');}).catch(fail);
$('#import-doc').onclick=async()=>{if(native){try{const result=await transport('import',{});for(const file of result){if(typeof file.text==='string')addDocument(newDocument(fileName(file.name),normalizeText(file.text)));else if(typeof file.data==='string'){if(!save())return;const path=uniquePath((selectedFolder?selectedFolder+'/':'')+file.name,itemPaths(workspace));applyFileState(await transport('writeWorkspaceFiles',{files:[{path,data:file.data}]}));}}if(result.length)toast('文件已导入工作区');}catch(e){fail(e);}}else $('#file-input').click();};
$('#file-input').onchange=async e=>{try{for(const file of e.target.files){if(file.size>MAX_TEXT_BYTES)throw new Error('请选择 8 MB 以内的文本文件。');const text=decodeFileText(new Uint8Array(await file.arrayBuffer()));addDocument(newDocument(fileName(file.name),normalizeText(text)));}}catch(err){fail(err);}finally{e.target.value='';}};
async function checkWindowsUpdates(visible=false){if(visible)openModal('检查更新','<p>正在检查…</p>',null,{noSubmit:true});try{const result=await checkUpdates(transport,environment?.version||__VELA_HARMONY_VERSION__);workspace.updateInfo=result;save();if(visible){$('#dialog-body').innerHTML=result.available?`<p>${esc(result.version)}</p><pre class="history-diff">${esc(result.notes)}</pre><button id="open-release" type="button" class="primary">查看发布与安装包</button>`:'<p>当前已是最新版本。</p>';if($('#open-release'))$('#open-release').onclick=()=>transport('openRelease',{url:result.url}).catch(fail);}else if(result.available)toast('发现新版本 '+result.version+'，可在设置中查看。');}catch(error){if(visible)$('#dialog-error').textContent=error.message;}}
window.addEventListener('resize',()=>{if(workspace&&pageName==='write'){updateEditorVisibility();view?.requestMeasure();}});

function applyTheme(mode=workspace.settings.theme){
  workspace.settings.theme=mode;
  const dark=mode==='dark'||mode==='system'&&(environment?.dark??systemTheme.matches);
  workspace.settings.dark=dark;document.body.classList.toggle('dark',dark);workspace.settings.palette=applyPalette(document.body,workspace.settings.palette,dark);
  const label=mode==='system'?`跟随系统（${dark?'深色':'浅色'}），切换到浅色模式`:dark?'跟随系统模式':'切换到深色模式';
  const menuLabel=$('#theme .menu-label');$('#theme').innerHTML=icon(dark?'sun':'theme');if(menuLabel)$('#theme').append(menuLabel);$('#theme').title=label+' (Ctrl+Alt+T)';$('#theme').setAttribute('aria-label',label);
  const githubTheme=$('[data-toggle-theme]');if(githubTheme){githubTheme.innerHTML=icon(dark?'sun':'theme');githubTheme.title=label;githubTheme.setAttribute('aria-label',label);}
  if(native)transport('appearance',{dark,background:paletteFor(workspace.settings.palette,dark).colors.bg,foreground:paletteFor(workspace.settings.palette,dark).colors.text}).catch(fail);
  if(isPreview&&current()&&documentKind(current())==='HTML')renderPreview();
}
function cycleTheme(){applyTheme({system:'light',light:'dark',dark:'system'}[workspace.settings.theme]||'system');save();}
$('#theme').onclick=cycleTheme;
systemTheme.addEventListener('change',()=>{if(workspace?.settings.theme==='system')applyTheme();});
function applyEnvironment(value){environment=value;document.body.dataset.platform=value?.platform||'browser';ui.environment(value);for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--safe-'+edge,Math.max(0,Number(value?.[edge]||0))+'px');if(workspace?.settings.theme==='system')applyTheme();sidebars.update(false);}
window.addEventListener('wenzhouEnvironment',e=>applyEnvironment(e.detail));
if(environment)applyEnvironment(environment);
function setFontSize(value,persist=true){const size=Math.max(10,Math.min(40,Math.round(Number.isFinite(value)?value:16)));textFontSize=size;if(persist){const project=current()&&documentKind(current())!=='VELA'?projectConfig(workspace,current()):null;if(project?.config){const config=project.rawConfig||project.config;config.editor={...config.editor,fontSize:size};project.doc.text=velaText(config);project.doc.updatedAt=Date.now();editorStates.delete(project.doc.id);}else workspace.settings.fontSize=size;}document.documentElement.style.setProperty('--editor-font-size',size+'px');view?.requestMeasure();if(isPreview&&current()&&documentKind(current())==='HTML')renderPreview();}
if(!native||['android','windows'].includes(environment?.platform))bindTextZoom($('.paper'),()=>textFontSize,setFontSize,()=>{save();toast('文字字号 '+textFontSize+' px');});
window.wenzhouNativeScale=factor=>{if(!workspace||!Number.isFinite(factor)||factor<=0)return;if(pageName==='reader'&&reader?.id){reader.setSize(reader.size*factor);workspace.readerSizes={...workspace.readerSizes,[reader.id]:reader.size};}else if(pageName==='write')setFontSize(textFontSize*factor);save();};
let nativePinchSize=16;
window.wenzhouNativePinch=(ratio,phase)=>{if(!workspace)return;if(pageName==='reader'){if(phase==='start')nativePinchSize=reader.size||16;else if(phase==='move'&&reader.id)reader.setSize(nativePinchSize*ratio);else if(reader.id){workspace.readerSizes={...workspace.readerSizes,[reader.id]:reader.size};save();}return;}if(pageName!=='write')return;if(phase==='start')nativePinchSize=textFontSize;else if(phase==='move')setFontSize(nativePinchSize*ratio);else{save();toast('文字字号 '+textFontSize+' px');}};
$('#quick-save').onclick=()=>save(true);$('#quick-undo').onclick=()=>{if(!view)return;undo(view);if(isPreview)renderPreview();else view.focus();};$('#quick-redo').onclick=()=>{if(!view)return;redo(view);if(isPreview)renderPreview();else view.focus();};
$('#quick-top').onclick=()=>jump(0);$('#quick-bottom').onclick=()=>jump(view.state.doc.length);
$('#quick-chapter-top').onclick=()=>jump(chapterPosition(view.state.doc.toString(),ensureIndex(),view.state.selection.main.head,'top'));
$('#quick-chapter-bottom').onclick=()=>jump(chapterPosition(view.state.doc.toString(),ensureIndex(),view.state.selection.main.head,'bottom'));
// Keep the editor selection and mobile keyboard when operating the quick tools.
document.querySelectorAll('.quickbar button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
$('#quick-git').onclick=()=>gitDocument();
$('#settings').onclick=()=>{
  const s=workspace.settings.writer;
  openModal('编辑器设置',`<label>语言<select name="language"><option value="zh-CN" ${workspace.settings.language!=='en'?'selected':''}>简体中文</option><option value="en" ${workspace.settings.language==='en'?'selected':''}>English</option></select></label><label>外观<select name="theme">${[['system','跟随系统'],['light','浅色模式'],['dark','深色模式']].map(([value,label])=>`<option value="${value}" ${workspace.settings.theme===value?'selected':''}>${label}</option>`).join('')}</select></label><fieldset class="palette-options"><legend>配色方案</legend>${palettes.map(p=>`<label class="palette-choice"><input type="radio" name="palette" value="${p.id}" ${p.id===workspace.settings.palette?'checked':''}><span class="palette-swatches"><i style="background:${p.light.accent}"></i><i style="background:${p.light.soft}"></i><i style="background:${p.dark.paper}"></i></span><span>${p.name}</span></label>`).join('')}</fieldset><label>文字字号<input type="number" name="fontSize" min="10" max="40" value="${textFontSize}" required></label><label>阅读方式<select name="readingMode"><option value="scroll" ${workspace.settings.readingMode==='scroll'?'selected':''}>上下滑动</option><option value="pages" ${workspace.settings.readingMode==='pages'?'selected':''}>左右翻页</option><option value="double" ${workspace.settings.readingMode==='double'?'selected':''}>双页阅读</option></select></label><label class="checkbox"><input name="globalVelaOverride" type="checkbox" ${globalConfig(workspace)?.config?.reader?.appearancePolicy==='personal'?'checked':''}>统一使用我的阅读排版</label><p><button type="button" class="secondary" id="edit-global-vela">编辑全局 .vela</button></p><label>字数规则<select name="countMode"><option value="nonspace" ${s.countMode==='nonspace'?'selected':''}>非空白字符（含标点）</option><option value="letters" ${s.countMode==='letters'?'selected':''}>仅文字与数字</option></select></label><label class="checkbox"><input name="includeHeading" type="checkbox" ${s.includeHeading?'checked':''}>字数包含章节标题</label><p>自动识别标准中英章节标题；额外模板保存在工作区 .vela 配置中。</p><label>GitHub OAuth Client ID<input name="clientId" value="${esc(workspace.settings.clientId||'')}" placeholder="OAuth App Client ID"><small>可留空并使用个人访问令牌。应用内不需要 Client Secret。</small></label><div class="notice">文舟 ${environment?.version||(environment?.platform==='android'?__VELA_HARMONY_VERSION__+'-android.1':__VELA_HARMONY_VERSION__)}<br>开源小说创作 / 阅读工具</div><p><button type="button" class="secondary" id="create-vela" ${workspace.documents.some(doc=>documentKind(doc)==='VELA'&&documentPath(doc)!==GLOBAL_VELA_PATH&&configFolder(documentPath(doc))===currentScope())?'disabled':''}>创建 .vela 配置</button></p><p><button type="button" class="secondary" id="backup-all">导出全部文稿备份</button> <button type="button" class="secondary" id="show-licenses">开源许可</button>${environment?.platform==='windows'?'<button type="button" class="secondary" id="check-updates">检查更新</button><label class="checkbox"><input name="updateChecks" type="checkbox" '+(workspace.settings.updateChecks!==false?'checked':'')+'>自动检查更新</label>':''}</p>`,f=>{const configPriorityChanged=(globalConfig(workspace)?.config?.reader?.appearancePolicy==='personal')!==f.has('globalVelaOverride');workspace.settings.writer=chapterSettings({...s,titleTemplates:[],countMode:f.get('countMode'),includeHeading:f.has('includeHeading')});workspace.settings.clientId=f.get('clientId').trim();workspace.settings.language=f.get('language');if(environment?.platform==='windows')workspace.settings.updateChecks=f.has('updateChecks');workspace.settings.readingMode=f.get('readingMode');ensureGlobalVela();const global=globalConfig(workspace);if(global?.config){global.config.reader={...global.config.reader,appearancePolicy:f.has('globalVelaOverride')?'personal':'project',mode:f.get('readingMode')};global.doc.text=velaText(global.config);global.doc.updatedAt=Date.now();}workspace.settings.palette=f.get('palette')||'pine';setLanguage(workspace.settings.language);reader?.localize();if(home)renderHome();applyTheme(f.get('theme'));setFontSize(Number(f.get('fontSize')));index=null;save();updateStats();reader?.layout();if(pageName==='reader'&&configPriorityChanged)reader.home();if(pageName==='subscriptions')subscriptions.render();});
  organizeSettings($('#dialog-body'));
  if($('#check-updates'))$('#check-updates').onclick=()=>checkWindowsUpdates(true);
  $('#edit-global-vela').onclick=()=>{const doc=ensureGlobalVela();closeModal();if(!workspace.openIds.includes(doc.id))workspace.openIds.push(doc.id);switchDocument(doc.id);showView('write');isPreview=true;updateEditorVisibility();renderVela();save();};
  $('#create-vela').onclick=()=>{const folder=currentScope();if(workspace.documents.some(doc=>documentKind(doc)==='VELA'&&documentPath(doc)!==GLOBAL_VELA_PATH&&configFolder(documentPath(doc))===folder))return;const config=createVelaV2(folder?basename(folder):'内部文件夹');config.reading.items=workspace.documents.filter(doc=>readable(doc)&&(!folder||documentPath(doc).startsWith(folder+'/'))).map(doc=>({id:doc.id,path:documentPath(doc).slice(folder?folder.length+1:0)}));const doc=newDocument('.vela',velaText(config));doc.path=(folder?folder+'/':'')+'.vela';closeModal();addDocument(doc);};
  $('#backup-all').onclick=()=>exportText('Vela-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(workspace,null,2)).catch(fail);
  $('#show-licenses').onclick=()=>{const licenses=window.WENZHOU_LICENSES||[];openModal('开源许可',`<label>组件<select id="license-component">${licenses.map((item,i)=>`<option value="${i}">${esc(item.name)}</option>`).join('')}</select></label><textarea id="license-text" rows="15" readonly aria-label="许可全文" style="font-family:monospace;font-size:10px"></textarea>`,null,{noSubmit:true});const show=()=>{$('#license-text').value=licenses[Number($('#license-component').value)]?.text||'';};$('#license-component').onchange=show;show();};
};

function showView(name){
  if(dirty&&!save())return;ui.close();pageName=name;document.body.dataset.page=name;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  for(const page of ['write','github','subscriptions','reader'])$('#'+page+'-view').hidden=page!==name;
  $('#sidebar-logout').disabled=!account;$('#add-glossary').disabled=name!=='write'||home||isPreview;
  if(name==='github'){document.body.classList.remove('focus');renderGitHub();}
  if(name==='subscriptions')subscriptions?.enter();else subscriptions?.leave();
  if(name==='reader'){indexService=null;index=null;indexDoc=null;setSidebar('library',false);reader?.home();}else{reader?.leave();updateEditorVisibility();}
  sidebars.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#github-shortcut').onclick=()=>showView('github');$('#sidebar-logout').onclick=logout;

$('#github-view').addEventListener('click',e=>{if(e.target.closest('[data-return-write]'))showView('write');if(e.target.closest('[data-toggle-theme]'))cycleTheme();});
let githubOffline=false;
const githubTopbar=()=>`<div class="github-topbar"><button class="secondary" data-return-write="true">← 返回编辑器</button><div class="button-row"><span>GitHub 仓库管理</span><button data-toggle-theme="true" title="${workspace.settings.dark?'切换到浅色模式':'切换到深色模式'}" aria-label="${workspace.settings.dark?'切换到浅色模式':'切换到深色模式'}">${icon(workspace.settings.dark?'sun':'theme')}</button></div></div>`;
function renderGitHub(){
  const root=$('#github-view');
  if(!account){root.innerHTML=`${githubTopbar()}<div class="empty-state"><div class="large-icon">${icon('github')}</div><h2>连接 GitHub</h2><p>浏览与创建仓库、管理分支、读取文件并提交修改。</p><div class="button-row"><button class="primary" id="token-login">使用访问令牌</button><button class="secondary" id="device-login">设备授权登录</button><button class="secondary" id="check-connection">检测连接</button></div><p class="description">${native?(environment?.platform==='android'?'令牌使用 Android Keystore 加密保存在应用内部。':environment?.platform==='windows'?'令牌使用 Windows 安全存储加密保存在应用内部。':'令牌保存在鸿蒙安全资产存储中。'):'浏览器预览的令牌仅保留在内存中，刷新后需重新登录。'}</p></div>`;$('#device-login').onclick=loginDevice;$('#token-login').onclick=loginToken;$('#check-connection').onclick=checkGitHubConnection;return;}
  if(selectedRepo){renderRepository();return;}
  root.innerHTML=`${githubTopbar()}<header class="page-header"><div><span class="page-kicker">GITHUB / ${esc(account.login)}</span><h1>仓库 <span class="count-badge">${repositories.length}</span></h1></div><div class="account-actions"><button class="secondary" id="refresh-repos">刷新</button><button class="primary" id="create-repo">＋ 新建仓库</button><button class="secondary" id="commit-workspace">提交整个工作区</button><button class="secondary" id="logout">退出登录</button></div></header><label class="search-box" style="max-width:400px;margin-bottom:24px">${icon('search')}<input id="repo-search" aria-label="搜索仓库" placeholder="搜索仓库名称…"></label><div id="repo-grid" class="repo-grid"></div>`;
  if(githubOffline){const notice=document.createElement('p');notice.className='notice';notice.textContent=t('当前显示缓存的仓库列表；网络恢复后请刷新，写入操作暂不可用。');root.querySelector('.page-header').after(notice);$('#create-repo').disabled=true;$('#commit-workspace').disabled=true;}
  const list=()=>{$('#repo-grid').innerHTML=repositories.filter(r=>r.full_name.toLowerCase().includes($('#repo-search').value.toLowerCase())).map(r=>`<button class="repo-card" data-repo="${esc(r.full_name)}"><strong>⑂ ${esc(r.full_name)}</strong><p>${esc(r.description||'还没有仓库简介。')}</p><small>${r.private?'私有':'公开'} · ${esc(r.default_branch)}${r.archived?' · 已归档':''}</small></button>`).join('')||'<p class="blank">暂无仓库，或没有匹配结果。</p>';};list();$('#repo-search').oninput=list;
  $('#repo-grid').onclick=e=>{const b=e.target.closest('[data-repo]');if(b){selectedRepo=repositories.find(r=>r.full_name===b.dataset.repo);selectedBranch=selectedRepo.default_branch;selectedPath='';renderRepository();}};
  $('#refresh-repos').onclick=()=>loadRepositories();$('#create-repo').onclick=createRepository;$('#logout').onclick=logout;$('#commit-workspace').onclick=()=>commitWholeWorkspace().catch(fail);
}
async function loadRepositories(){const epoch=++loadEpoch;$('#github-view').innerHTML=githubTopbar()+'<p class="loading">正在读取 GitHub 仓库…</p>';try{const list=await gh.repositories();if(epoch!==loadEpoch)return;repositories=list;githubOffline=false;workspace.githubCache={login:account.login,checkedAt:Date.now(),repositories:list.slice(0,500).map(({full_name,name,description,default_branch,private:isPrivate,archived,permissions})=>({full_name,name,description,default_branch,private:isPrivate,archived,permissions}))};save();renderGitHub();}catch(e){if(epoch!==loadEpoch)return;githubOffline=true;if(workspace.githubCache?.login===account?.login)repositories=workspace.githubCache.repositories;renderGitHub();fail(e);}}
async function signedIn(user){githubOffline=false;account=user;$('#sidebar-logout').disabled=false;$('#account-label').textContent=user.login;selectedRepo=null;showView('github');await loadRepositories();}
async function checkGitHubConnection(){
  openModal('检测 GitHub 连接','<p>正在检测连接…</p>',null,{noSubmit:true});
  try{const result=await transport('connection');if(result.status!==200)throw new Error('GitHub 返回 HTTP '+result.status+'，请检查网络后重试。');$('#dialog-body').textContent='GitHub 连接正常，可以继续登录。';}
  catch(e){$('#dialog-body').textContent='连接检测未通过。';$('#dialog-error').textContent=e.message;}
}
function loginToken(){openModal('使用 GitHub 访问令牌','<label>个人访问令牌<input name="token" type="password" autocomplete="off" placeholder="github_pat_… 或 ghp_…" required></label><small>细粒度令牌需授予目标仓库 Contents 读写权限及 Metadata 读取权限；创建、修改仓库还需相应管理权限。令牌不会写入文稿或日志。</small>',async f=>{const token=f.get('token').trim();if(!token)throw new Error('请输入令牌。');const user=await transport('login',{token});$('#dialog-body input').value='';await signedIn(user);},{label:'验证并登录'});}
function loginDevice(){
  if(!native){openModal('GitHub 设备授权','<p>设备授权请在文舟应用中使用。浏览器预览可以使用个人访问令牌。</p>',()=>{setTimeout(loginToken,0);},{label:'使用访问令牌'});return;}
  openModal('登录 GitHub',`<label>OAuth Client ID<input name="clientId" required value="${esc(workspace.settings.clientId||'')}" placeholder="填写已启用 Device Flow 的 Client ID"></label><small>在 GitHub 开发者设置中注册 OAuth App 并启用 Device Flow。只填写 Client ID，无需 Client Secret。本次授权请求 repo 与 read:user 权限。</small>`,async f=>{const id=f.get('clientId').trim();if(!id)throw new Error('请填写 Client ID。');workspace.settings.clientId=id;save();setTimeout(()=>runDeviceLogin(id),0);},{label:'获取授权码'});
}
async function runDeviceLogin(id){
  const abort=new AbortController();
  openModal('在 GitHub 确认登录','<p>正在获取设备授权码…</p>',null,{noSubmit:true,cancel:()=>abort.abort()});
  try{await deviceLogin(transport,id,code=>{
    if(abort.signal.aborted)return;
    $('#dialog-body').innerHTML=`<p>请在 GitHub 页面输入以下授权码：</p><strong id="device-code">${esc(code.user_code)}</strong><button type="button" class="primary" id="open-auth">打开 GitHub 授权页面 ↗</button><p>请在 ${Math.ceil(code.expires_in/60)} 分钟内完成确认。完成后会自动登录。</p>`;$('#open-auth').onclick=()=>openAuthorization().catch(fail);
  },abort.signal);if(abort.signal.aborted)return;const user=await gh.user();dialogCancel=null;$('#dialog').close();await signedIn(user);}catch(e){if(!abort.signal.aborted)$('#dialog-error').textContent=e.message;}
}
async function logout(){try{await transport('logout',{});loadEpoch++;account=null;githubOffline=false;delete workspace.githubCache;save();$('#sidebar-logout').disabled=true;repositories=[];selectedRepo=null;$('#account-label').textContent='连接 GitHub';renderGitHub();toast('已退出，设备上的文稿保留。');}catch(e){fail(e);}}
function createRepository(){openModal('新建 GitHub 仓库','<label>仓库名称<input name="name" pattern="[A-Za-z0-9_.-]+" required placeholder="my-writing"></label><label>简介<textarea name="description" rows="2" maxlength="350"></textarea></label><label class="checkbox"><input name="private" type="checkbox" checked>设为私有仓库</label><small>将在当前账号下新建仓库并初始化 README。</small>',async f=>{await gh.createRepository(f.get('name').trim(),f.get('description'),f.has('private'));await loadRepositories();},{label:'创建仓库'});}
async function renderRepository(){
  const repo=selectedRepo,epoch=++loadEpoch,root=$('#github-view');if(!repo)return;
  root.innerHTML=`${githubTopbar()}<header class="page-header"><div><button class="text-button" id="back-repos">← 返回仓库列表</button><h1>${esc(repo.name)}</h1><p>${esc(repo.full_name)} · ${repo.private?'私有仓库':'公开仓库'}</p></div><div class="button-row"><button class="secondary" id="repo-pull">拉取整个仓库</button><button class="secondary" id="repo-settings">仓库设置</button><button class="secondary" id="repo-commit-workspace">提交整个工作区</button><button class="primary" id="repo-commit">提交当前文件</button></div></header><div class="repo-toolbar"><label>分支 <select id="branch-select" aria-label="选择分支"><option>${esc(selectedBranch)}</option></select></label><button class="secondary" id="create-branch">＋ 新建分支</button><button class="secondary" id="refresh-files">刷新</button></div><div class="remote-selection-tools"><button id="remote-multi" class="secondary">多选</button><button id="remote-select-all" class="secondary" hidden>全选本页</button><button id="remote-pull-selected" class="primary" hidden>拉取选中项</button><span id="remote-selected-count"></span><button id="remote-cancel-selection" class="secondary" hidden>取消多选</button></div><p class="path-label">${esc(selectedPath||'/')}</p><div class="file-list" id="file-list"><p class="loading">正在读取文件…</p></div>`;
  $('#back-repos').onclick=()=>{loadEpoch++;selectedRepo=null;renderGitHub();};$('#refresh-files').onclick=renderRepository;
  $('#repo-commit-workspace').onclick=()=>commitWholeWorkspace(repo.full_name,selectedBranch).catch(fail);$('#repo-commit').onclick=()=>commitDocument(repo.full_name,selectedBranch);$('#repo-pull').onclick=()=>pullWholeRepository();
  $('#repo-settings').onclick=()=>openModal('仓库设置',`<label>仓库名称<input name="name" required pattern="[A-Za-z0-9_.-]+" value="${esc(repo.name)}"></label><label>简介<textarea name="description" rows="3">${esc(repo.description||'')}</textarea></label><small>修改会直接更新 GitHub 仓库的名称与简介。</small>`,async f=>{const old=repo.full_name;const updated=await gh.updateRepository(old,{name:f.get('name').trim(),description:f.get('description')});for(const d of workspace.documents)if(d.remote?.repo===old)d.remote.repo=updated.full_name;for(const item of workspace.repositories||[])if(item.repo===old)item.repo=updated.full_name;save();repositories=repositories.map(r=>r.full_name===old?updated:r);selectedRepo=updated;renderRepository();},{label:'保存到 GitHub'});
  if(githubOffline||repo.permissions?.push===false||repo.archived){for(const selector of ['#repo-commit','#repo-commit-workspace','#create-branch']){const button=root.querySelector(selector);button.disabled=true;button.title=repo.archived?'仓库已归档':'当前账号只有读取权限';}}if(githubOffline||repo.permissions?.admin===false||repo.archived){$('#repo-settings').disabled=true;$('#repo-settings').title='此操作需要仓库管理权限';}
  $('#create-branch').onclick=()=>openModal('新建分支',`<p>从 ${esc(selectedBranch)} 创建分支。</p><label>分支名称<input name="name" placeholder="draft/chapter-one" required></label>`,async f=>{await gh.createBranch(repo.full_name,selectedBranch,f.get('name'));selectedBranch=f.get('name').trim();selectedPath='';renderRepository();},{label:'创建分支'});
  $('#branch-select').onchange=e=>{selectedBranch=e.target.value;selectedPath='';renderRepository();};
  try{
    const [branches,contents]=await Promise.all([gh.branches(repo.full_name),gh.contents(repo.full_name,selectedBranch,selectedPath)]);
    if(epoch!==loadEpoch)return;
    $('#branch-select').innerHTML=branches.map(b=>`<option value="${esc(b.name)}" ${b.name===selectedBranch?'selected':''}>${esc(b.name)}</option>`).join('');
    if(!Array.isArray(contents))throw new Error('当前路径不是文件夹。');
    if(remoteSelectionRepo!==repo.full_name+'/'+selectedBranch){remoteSelection.clear();remoteSelecting=false;remoteSelectionRepo=repo.full_name+'/'+selectedBranch;}
    contents.sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):a.type==='dir'?-1:1));
    $('#file-list').innerHTML=(selectedPath?'<div class="file-row"><button data-parent="true">↰ 上级目录</button></div>':'')+contents.map((f,i)=>`<div class="file-row" data-remote-row="${i}"><input type="checkbox" data-remote-select="${i}" aria-label="选择 ${esc(f.name)}" hidden><button data-file="${i}">${f.type==='dir'?'▱':'≡'} ${esc(f.name)}</button><small>${f.type==='dir'?'文件夹':Math.ceil(f.size/1024)+' KB'}</small>${f.type==='dir'?`<button data-browse="${i}" aria-label="打开 ${esc(f.name)}">↳</button>`:''}${f.type==='file'?`<button data-delete="${i}" title="删除远端文件" aria-label="删除 ${esc(f.name)}">×</button>`:''}</div>`).join('');
    setupRemoteSelection(contents);if(githubOffline||repo.permissions?.push===false||repo.archived)root.querySelectorAll('[data-delete]').forEach(button=>button.disabled=true);
    $('#file-list').onclick=async e=>{try{
      if(e.target.closest('[data-remote-select]'))return;
      const browse=e.target.closest('[data-browse]');if(browse){selectedPath=contents[Number(browse.dataset.browse)].path;renderRepository();return;}
      if(e.target.closest('[data-file]')&&(remoteSelecting||e.ctrlKey||e.metaKey)){if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(e.target.closest('[data-file]').dataset.file)]);window.__remoteHoldClick=false;return;}
      if(e.target.closest('[data-parent]')){selectedPath=selectedPath.split('/').slice(0,-1).join('/');renderRepository();return;}
      const open=e.target.closest('[data-file]'),del=e.target.closest('[data-delete]');
      if(open){const f=contents[Number(open.dataset.file)];if(f.type==='dir'){selectedPath=f.path;renderRepository();}else await openRemote(repo.full_name,selectedBranch,f.path);}
      if(del){const f=contents[Number(del.dataset.delete)],branch=selectedBranch;openModal('删除远端文件',`<p>将从 ${esc(repo.full_name)} 的 ${esc(branch)} 分支删除 ${esc(f.path)}。本地文稿不会删除。</p><label>提交说明<input name="message" required value="${esc('删除 '+f.name)}"></label>`,async data=>{await gh.deleteFile({repo:repo.full_name,branch,path:f.path,sha:f.sha,message:data.get('message')});renderRepository();},{label:'确认删除并提交'});}
    }catch(e){fail(e);}};
  }catch(e){if(epoch===loadEpoch)$('#file-list').innerHTML=`<p class="error" style="padding:16px">${esc(e.message)}</p>`;}
}
function toggleRemoteFile(file){remoteSelecting=true;if(remoteSelection.has(file.path))remoteSelection.delete(file.path);else remoteSelection.set(file.path,file);renderRemoteSelection();}
function renderRemoteSelection(){document.querySelectorAll('[data-remote-select]').forEach(input=>{input.hidden=!remoteSelecting;input.checked=remoteSelection.has(input.dataset.remotePath);input.closest('.file-row').classList.toggle('selected',input.checked);});for(const id of ['remote-select-all','remote-pull-selected','remote-cancel-selection'])if($('#'+id))$('#'+id).hidden=!remoteSelecting;if($('#remote-pull-selected'))$('#remote-pull-selected').disabled=!remoteSelection.size;if($('#remote-selected-count'))$('#remote-selected-count').textContent=remoteSelecting?t('已选 ')+remoteSelection.size:'';}
function setupRemoteSelection(contents){
  const list=$('#file-list');let timer,start;window.__remoteHoldClick=false;
  list.querySelectorAll('[data-remote-select]').forEach(input=>{input.dataset.remotePath=contents[Number(input.dataset.remoteSelect)].path;input.onchange=()=>toggleRemoteFile(contents[Number(input.dataset.remoteSelect)]);});
  const cancel=()=>{clearTimeout(timer);start=null;};list.onpointerdown=e=>{const row=e.target.closest('[data-remote-row]');if(!row||e.target.closest('input,[data-delete],[data-browse]'))return;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;},400);};list.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)cancel();};list.onpointerup=cancel;list.onpointercancel=cancel;list.oncontextmenu=e=>{const row=e.target.closest('[data-remote-row]');if(row){e.preventDefault();cancel();if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;}};
  $('#remote-multi').onclick=()=>{remoteSelecting=true;renderRemoteSelection();};$('#remote-select-all').onclick=()=>{remoteSelecting=true;for(const file of contents)remoteSelection.set(file.path,file);renderRemoteSelection();};$('#remote-cancel-selection').onclick=()=>{remoteSelection.clear();remoteSelecting=false;renderRemoteSelection();};$('#remote-pull-selected').onclick=()=>pullWholeRepository([...remoteSelection.keys()]);renderRemoteSelection();
}
async function openRemote(repo,branch,path){
  const file=await gh.readFile(repo,branch,path);if(!save())throw new Error('请先保存当前文稿。');
  const before=workspace.documents.find(d=>d.remote?.repo.toLowerCase()===repo.toLowerCase()&&d.remote.path===path);
  if(before&&before.text!==file.text&&before.remote?.lastSyncedText!==before.text){openModal('本地与远端内容冲突',`<p>本地文件已修改。覆盖前会保留本地历史；也可取消后手动合并。</p><pre>${esc(diffLines(before.text,file.text,100).added.join('\n'))}</pre>`,()=>{documents.checkpoint(before);documents.change(before,normalizeText(file.text));before.remote={repo,branch,path,sha:file.sha,lastSyncedText:normalizeText(file.text)};editorStates.delete(before.id);if(view&&workspace.activeId===before.id)view.setState(makeState(before));renderDocuments();save();},{label:'保留历史并覆盖'});return false;}
  const doc=applyRemoteFile(workspace,{repo,branch,path,text:normalizeText(file.text),sha:file.sha},workspace.repositories?.find(item=>item.repo.toLowerCase()===repo.toLowerCase())?.folder||'');
  editorStates.delete(doc.id);if(view&&workspace.activeId===doc.id){view.setState(makeState(doc));index=null;updateStats();if(isPreview)renderPreview();}renderDocuments();save();toast(before?'远端文件已覆盖本地同仓库文件':'已拉取远端文件');return true;
}
function pullWholeRepository(selection=null){
  const repo=selectedRepo,branch=selectedBranch;if(!repo)return;
  if(!native||!workspace.storage?.id){toast('请在应用中拉取仓库文件。');return;}
  const folder=repositoryFolder(workspace,repo.full_name),abort=new AbortController();
  openModal(selection?'拉取选中项':'拉取整个仓库',`${selection?'<p>'+selection.length+' 个选中项（文件夹包含全部子项）</p>':''}<p>${esc(repo.full_name)} / ${esc(branch)}</p><p>保存到当前工作区的“${esc(folder)}”文件夹。再次拉取会覆盖此仓库的同路径文件；本地独有文件保留。</p><p id="pull-progress"></p><button type="button" class="secondary" id="cancel-pull" hidden>取消拉取</button>`,async()=>{
    if(!save())throw new Error('请先保存当前文稿。');
    $('#cancel-pull').hidden=false;
    const result=await gh.pullRepository(repo.full_name,branch,{selection,signal:abort.signal,onProgress:p=>{$('#pull-progress').textContent=`拉取 ${p.done} / ${p.total} ${p.path}`;}});
    previewDownload(result,folder,async selected=>{await materializeDownload(selected,folder);restorePulledEditor('github');if(!save())throw new Error('文件已拉取，但关联信息保存失败，请刷新工作区。');remoteSelection.clear();remoteSelecting=false;renderRepository();toast(`已拉取 ${selected.files.length} 个文件到 ${folder}`);});return false;
  },{label:'拉取到工作区',cancel:()=>abort.abort()});
  $('#cancel-pull').onclick=()=>abort.abort();
}
function gitDocument(){if(!current()){showView('github');return;}if(!account){showView('github');toast('连接 GitHub 后，即可关联仓库并提交文稿。');return;}commitDocument();}
function commitDocument(suggestRepo,suggestBranch){
  if(!account){showView('github');return;}
  if(!repositories.length){showView('github');toast('请先新建或获得一个可写仓库。');return;}
  const doc=current();if(!doc){showView('write');showHome();toast('请先打开需要提交的文件。');return;}const remote=doc.remote;
  const initialRepo=suggestRepo||remote?.repo||repositories[0].full_name;
  const initialBranch=suggestBranch||remote?.branch||repositories.find(r=>r.full_name===initialRepo)?.default_branch||'main';
  openModal('提交文稿到 GitHub',`<p>将提交“${esc(doc.name)}”的当前内容。</p><label>仓库<select name="repo" id="commit-repo">${repositories.map(r=>`<option value="${esc(r.full_name)}" ${r.full_name===initialRepo?'selected':''}>${esc(r.full_name)}${r.private?'（私有）':''}</option>`).join('')}</select></label><label>分支<input name="branch" id="commit-branch" required value="${esc(initialBranch)}"></label><label>文件路径<input name="path" required value="${esc(remote?.path||doc.name)}"></label><label>提交说明<input name="message" required value="${esc('更新 '+doc.name)}"></label><small>只提交此文稿。已关联文件使用上次读取的版本；同名远端文件不会被自动覆盖。发生冲突时，请到仓库页打开远端副本进行对照。</small>${remote?'<p><button type="button" class="secondary" id="read-remote">拉取并覆盖此文件</button></p>':''}`,async f=>{
    if(!save())throw new Error('本地保存失败，请先导出备份。');
    const repo=f.get('repo'),branch=f.get('branch').trim(),path=repoPath(f.get('path'));
    const sha=remote&&remote.repo===repo&&remote.branch===branch&&remote.path===path?remote.sha:undefined;
    const text=doc.text;
    const result=await gh.commit({repo,branch,path,sha,text,message:f.get('message')});
    doc.remote={repo,branch,path,sha:result.content.sha,lastSyncedText:text};save();renderDocuments();toast('文稿已提交到 '+repo+' / '+branch);
  },{label:'提交到 GitHub'});
  $('#commit-repo').onchange=e=>{$('#commit-branch').value=repositories.find(r=>r.full_name===e.target.value)?.default_branch||'main';};
  if(remote)$('#read-remote').onclick=async()=>{try{if(await openRemote(remote.repo,remote.branch,remote.path))closeModal();}catch(e){$('#dialog-error').textContent=e.message;}};
}

function runAction(id){if(pageName==='reader'&&!['outline-toggle','settings','theme','mobile-library','commands','quick-git','plugins'].includes(id))return false;if(id==='toggle-display'){if(!home)togglePreview();return true;}if(id==='close-active'){if(current())closeDocument(current().id);return true;}const button=$('#'+id);if(button&&!button.disabled)button.click();return true;}
for(const [id,,keys,label] of shortcuts){const button=$('#'+id);if(button){button.title=`${label} (${keys})`;button.setAttribute('aria-keyshortcuts',keys.replaceAll('+','+'));}}
document.addEventListener('keydown',e=>{if(pageName==='reader'&&!(e.ctrlKey||e.metaKey))return;
  if(e.defaultPrevented||e.isComposing||$('#dialog').open||e.target.closest('.plugin-page'))return;
  const inField=e.target.closest('input,textarea,select');
  if(inField&&!inField.matches('[data-cell-row]'))return;
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();editing.search();return;}
  if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==='b'){e.preventDefault();editing.bookmark();return;}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&['+','=','-','0'].includes(e.key)){e.preventDefault();e.stopPropagation();if(pageName==='reader'){if(reader?.id){reader.setSize(e.key==='0'?16:reader.size+(['+','='].includes(e.key)?1:-1));workspace.readerSizes={...workspace.readerSizes,[reader.id]:reader.size};save();}return;}setFontSize(e.key==='0'?16:textFontSize+(['+','='].includes(e.key)?1:-1));save();return;}
  const shortcut=shortcuts.find(([,key])=>matchesKey(e,key));if(shortcut){e.preventDefault();e.stopPropagation();runAction(shortcut[0]);}
},true);
$('#commands').onclick=()=>{
  const items=[{name:'本地历史与恢复',key:'',run:showLocalHistory},...(editing?.commands()||[]),...shortcuts.map(([id,,key,name])=>({name,key,run:()=>runAction(id)})),...[...(plugins?.commands.values()||[])].map(command=>({name:command.description||command.name,key:typeof command.bindKey==='string'?command.bindKey:command.bindKey?.win||'',run:()=>command.exec(view)}))];
  openModal('命令与快捷键','<input id="command-search" placeholder="搜索命令" aria-label="搜索命令" autofocus><div id="command-list"></div><small>Tab：缩进两个全角空格；Shift+Tab：取消缩进。Ctrl+加号 / 减号 / 0：调整或重置文字字号。</small>',null,{noSubmit:true});
  const render=()=>{const query=$('#command-search').value.toLowerCase();$('#command-list').innerHTML=items.map((item,i)=>({item,i})).filter(({item})=>item.name.toLowerCase().includes(query)||item.key.toLowerCase().includes(query)).map(({item,i})=>`<button type="button" class="command-item" data-command="${i}"><span>${esc(item.name)}</span><kbd>${esc(item.key)}</kbd></button>`).join('');};render();$('#command-search').oninput=render;
  $('#command-list').onclick=e=>{const b=e.target.closest('[data-command]');if(b){closeModal();Promise.resolve(items[Number(b.dataset.command)].run()).catch(fail);}};
};
function showLocalHistory(){const doc=current();if(!doc)return;const versions=documents.history(doc);openModal('本地历史与恢复',`<div class="history-list">${versions.map((item,i)=>`<button type="button" class="secondary" data-history="${i}">${esc(new Date(item.createdAt).toLocaleString())} · r${item.revision} · ${item.text.length} 字符</button>`).join('')||'<p>暂无历史版本。保存修改后会保留之前的内容。</p>'}</div><pre id="history-diff" class="history-diff"></pre><button type="button" class="primary" id="restore-history" disabled>恢复所选版本</button>`,null,{noSubmit:true});let selected=-1;$('.history-list').onclick=e=>{const b=e.target.closest('[data-history]');if(!b)return;selected=Number(b.dataset.history);const diff=diffLines(documents.restore(doc,selected),doc.text);$('#history-diff').textContent=`行 ${diff.from}\n`+diff.removed.map(line=>'- '+line).join('\n')+'\n'+diff.added.map(line=>'+ '+line).join('\n')+(diff.truncated?'\n…':'' );$('#restore-history').disabled=false;};$('#restore-history').onclick=()=>{const text=documents.restore(doc,selected);documents.snapshot(doc,true);closeModal();if(view)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.restore'});else documents.change(doc,text,[],{important:true});save(true);};}
function showPlugins(){
  openModal('Acode 插件',`<p><button type="button" class="primary" id="install-plugin">从 ZIP 安装</button></p><small>支持 JavaScript / CodeMirror 插件。依赖 Android、Cordova、Ace 或未实现的 Acode 模块的插件会显示加载原因。</small><div class="plugin-list">${plugins.records.map((record,i)=>`<article class="plugin-card"><strong>${esc(record.manifest.name)}</strong><small>${esc(record.manifest.id)} · ${esc(record.manifest.version)}</small>${record.error?`<p class="error">${esc(record.error)}</p>`:''}<div class="button-row"><button type="button" class="secondary" data-plugin-enable="${i}">${record.enabled?'停用':'启用'}</button>${plugins.settingsPages.has(record.manifest.id)?`<button type="button" class="secondary" data-plugin-settings="${i}">插件设置</button>`:''}<button type="button" class="danger" data-plugin-remove="${i}">卸载</button></div></article>`).join('')||'<p class="blank">尚未安装插件。</p>'}</div>`,null,{noSubmit:true});
  $('#install-plugin').onclick=async()=>{if(native){try{const result=await transport('importPlugin');if(result)await installPluginBytes(fromBase64(result.data));}catch(e){$('#dialog-error').textContent=e.message;}}else $('#plugin-input').click();};
  $('.plugin-list').onclick=async e=>{try{
    const enable=e.target.closest('[data-plugin-enable]'),remove=e.target.closest('[data-plugin-remove]'),settings=e.target.closest('[data-plugin-settings]');
    if(enable){const record=plugins.records[Number(enable.dataset.pluginEnable)];await plugins.enable(record,!record.enabled);showPlugins();}
    if(remove){await plugins.remove(plugins.records[Number(remove.dataset.pluginRemove)]);showPlugins();}
    if(settings)showPluginSettings(plugins.records[Number(settings.dataset.pluginSettings)]);
  }catch(error){$('#dialog-error').textContent=error.message;}};
}
function showPluginSettings(record){
  const config=plugins.settingsPages.get(record.manifest.id);if(!config)return;
  const items=config.list||[];
  openModal(record.manifest.name+' · 设置',items.map((item,i)=>`<label>${esc(item.text||item.key||'设置')}<input name="${i}" ${item.checkbox?'type="checkbox" '+(item.value?'checked':''):`value="${esc(item.value??'')}"`}></label>`).join(''),async f=>{for(let i=0;i<items.length;i++)await config.cb?.(items[i].key,items[i].checkbox?f.has(String(i)):f.get(String(i)));plugins.save();});
}
async function installPluginBytes(bytes){const record=await plugins.install(readPluginZip(bytes));showPlugins();if(record.error)$('#dialog-error').textContent=record.error;else toast('插件已安装：'+record.manifest.name);}
$('#plugins').onclick=showPlugins;
$('#plugin-input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>MAX_TEX_PLUGIN_BYTES)throw new Error('宏包 ZIP 不能超过 64 MB。');await installPluginBytes(new Uint8Array(await file.arrayBuffer()));}catch(error){$('#dialog-error').textContent=error.message;}finally{e.target.value='';}};
function refreshPluginCommands(){for(const [id,state] of editorStates)editorStates.set(id,state.update({effects:[pluginKeys.reconfigure(keymap.of(plugins?.bindings()||[])),pluginExtras.reconfigure(plugins?.extensions()||[])]}).state);if(view&&pluginKeys.get(view.state)!==undefined)view.dispatch({effects:[pluginKeys.reconfigure(keymap.of(plugins?.bindings()||[])),pluginExtras.reconfigure(plugins?.extensions()||[])]});}
function pluginDialog(title,message,kind,value=''){return new Promise(resolve=>openModal(title,kind==='prompt'?`<label>${esc(title)}<input name="value" value="${esc(value)}"></label>`:`<p>${esc(message)}</p>`,f=>{resolve(kind==='prompt'?f.get('value'):true);},{cancel:()=>resolve(kind==='prompt'?null:false)}));}
function currentScope(){const project=projectConfig(workspace,current());if(project?.folder&&(!selectedFolder||within(project.folder,selectedFolder)))return project.folder;return selectedFolder|| (current()?parentPath(documentPath(current())):'');}
async function commitWholeWorkspace(repo=selectedRepo?.full_name||'',branch=selectedBranch||''){
  if(!account){showView('github');return;}if(!repositories.length){showView('github');toast('请先新建或获得一个可写仓库。');return;}if(!save())return;
  const folder=currentScope();for(const doc of workspace.documents.filter(doc=>doc.subscription&&(!folder||documentPath(doc).startsWith(folder+'/'))))await loadSubscriptionDocument(doc);
  const docs=workspace.documents.filter(doc=>!folder||documentPath(doc).startsWith(folder+'/'));
  const others=(workspace.entries||[]).filter(entry=>!entry.directory&&!docs.some(doc=>documentPath(doc)===entry.path)&&(!folder||entry.path.startsWith(folder+'/')));
  if(!docs.length&&!others.length){toast(t('当前工作区没有文件。'));return;}
  openModal('提交整个工作区',`<p>${t('工作区')}：<span data-user-content>${esc(folder||'/')}</span> · ${docs.length+others.length} ${t('文件')}</p><label>${t('仓库')}<select name="repo" required>${repositories.map(item=>`<option value="${esc(item.full_name)}" ${item.full_name===repo?'selected':''}>${esc(item.full_name)}</option>`).join('')}</select></label><label>${t('分支')}<input name="branch" required value="${esc(branch||repositories.find(item=>item.full_name===repo)?.default_branch||repositories[0]?.default_branch||'main')}"></label><label>${t('仓库目录')}<input name="prefix" placeholder="${t('留空提交到仓库根目录')}"></label><label>${t('提交说明')}<input name="message" required value="Update workspace"></label><p>${t('包含配置、文稿和附件；同路径文件覆盖，仓库其他文件保留。')}</p>`,async form=>{
    if(!save())throw new Error('请先保存文稿。');const files=docs.map(doc=>({path:documentPath(doc).slice(folder?folder.length+1:0),text:doc.text}));for(const entry of others){if(!native)throw new Error('浏览器不能读取此附件，请在应用中提交。');files.push({path:entry.path.slice(folder?folder.length+1:0),data:await transport('readWorkspaceFile',{path:entry.path})});}
    showCommitPreview({repo:form.get('repo'),branch:form.get('branch').trim(),prefix:form.get('prefix').trim(),folder,files,message:form.get('message')});return false;
  },{label:t('提交到 GitHub')});
}
function ensureGlobalVela(){
  const existing=globalConfig(workspace);if(existing)return existing.doc;
  const config=createVelaV2('全局默认配置',{global:true});
  const doc=newDocument(GLOBAL_VELA_PATH,velaText(config));doc.path=GLOBAL_VELA_PATH;workspace.documents.push(doc);renderDocuments();return doc;
}
function showCommitPreview(options){const association=workspace.repositories?.find(item=>item.folder===options.folder&&item.repo===options.repo&&item.branch===options.branch&&(item.prefix||'')===options.prefix),plan=commitPlan(options.files,association),labels={new:'新增',modified:'修改',unchanged:'未变化',deleted:'删除远端文件'};openModal('确认提交变更',`<p>${esc(options.repo)} / ${esc(options.branch)}</p><p>仅提交勾选的文件。个人配置、缓存和凭据文件默认不包含。</p><div class="sync-files">${plan.map((item,i)=>`<label class="checkbox"><input name="commitFiles" type="checkbox" value="${i}" ${['new','modified'].includes(item.state)?'checked':''}><span>${esc(item.file.path)}<small>${labels[item.state]}</small></span></label>`).join('')}</div><label>提交说明<input name="message" required value="${esc(options.message)}"></label>`,async form=>{const files=form.getAll('commitFiles').map(value=>plan[Number(value)].file);if(!files.length)throw Error('请选择变更。');if(association?.conflicts?.length)throw Error('仍有本地与远端冲突，请先拉取并处理这些文件：'+association.conflicts.join('、'));for(const file of files){const local=workspace.documents.find(doc=>documentPath(doc)===(options.folder?options.folder+'/':'')+file.path);if(typeof file.text==='string'&&local?.text!==file.text)throw Error('预览后文件已变化，请重新生成提交预览。');}const result=await gh.commitWorkspace({...options,files,message:form.get('message'),expectedHead:association?.commit});const baseFiles={...association?.baseFiles};for(const file of files){if(file.delete)delete baseFiles[file.path];else baseFiles[file.path]={hash:textFingerprint(file.text??file.data),sha:result.files?.find(entry=>entry.path===(options.prefix?options.prefix+'/':'')+file.path)?.sha};}workspace.repositories=(workspace.repositories||[]).filter(item=>item.folder!==options.folder);workspace.repositories.push({repo:options.repo,branch:options.branch,folder:options.folder,prefix:options.prefix,commit:result.sha,baseFiles});for(const file of files.filter(file=>!file.delete&&typeof file.text==='string')){const doc=workspace.documents.find(doc=>documentPath(doc)===(options.folder?options.folder+'/':'')+file.path);if(doc)doc.remote={repo:options.repo,branch:options.branch,path:(options.prefix?options.prefix+'/':'')+file.path,sha:baseFiles[file.path]?.sha||'',lastSyncedText:file.text};}save();toast(t('工作区已提交到 GitHub。'));},{label:'提交选中变更'});}
$('#add-glossary').onclick=()=>{
  const doc=current(),range=view?.state.selection.main;if(!doc||!range||range.empty){toast('请先选中要加入术语库的词汇。');return;}
  const selected=view.state.doc.sliceString(range.from,range.to).trim();if(!selected||selected.length>120||/[\r\n]/.test(selected)){toast('词条须为 1–120 字符且不能换行。');return;}
  const project=projectConfig(workspace,doc),scope=project&&!project.global?project.folder:parentPath(documentPath(doc)),configured=glossaryPaths(workspace,doc),sources=workspace.documents.filter(item=>documentKind(item)==='GLY'&&(!scope||documentPath(item).startsWith(scope+'/'))).sort((a,b)=>Number(configured.includes(documentPath(b)))-Number(configured.includes(documentPath(a))));
  openModal('选中词加入术语库',`<label>词条<input name="term" maxlength="120" required value="${esc(selected)}"></label><label>术语库文件<select name="source">${sources.map(item=>`<option value="${esc(item.id)}">${esc(documentPath(item))}</option>`).join('')}<option value="new">新建术语库</option></select></label><label>新术语库文件名<input name="filename" value="术语库.gly"></label><label>释义<textarea name="definition" maxlength="4000" rows="3"></textarea></label><p>加入后会将术语库关联到当前工作区配置。</p>`,form=>{
    if(project?.error)throw project.error;const existing=sources.find(item=>item.id===form.get('source'));let source=existing,path=source&&documentPath(source);
    if(!source){const name=fileName(form.get('filename'));if(!/\.(gly|glossary)$/i.test(name))throw Error('术语库文件需要 .gly 或 .glossary 后缀。');path=(scope?scope+'/':'')+name;if(itemPaths(workspace).has(path))throw Error('此路径已存在。');source={...newDocument(name,glossaryText(createGlossary(name))),path};}
    if(scope&&!path.startsWith(scope+'/'))throw Error('请选择当前工作区内的术语库。');
    const data=parseGlossary(source.text);data.entries.push({id:crypto.randomUUID(),term:form.get('term').trim(),definition:form.get('definition'),aliases:[]});const text=glossaryText(data);
    const configDoc=project&&!project.global?project.doc:newDocument('.vela',''),config=project&&!project.global?structuredClone(project.rawConfig):createVelaV2(scope?basename(scope):'内部文件夹');
    const relative=path.slice(scope?scope.length+1:0),paths=config.editor?.glossaries||[];config.editor={...config.editor,glossaries:[...new Set([...paths,relative])]};
    const configText=velaText(config);if(!workspace.documents.includes(configDoc)){configDoc.path=(scope?scope+'/':'')+'.vela';if(itemPaths(workspace).has(configDoc.path))throw Error('当前 .vela 配置无效，请先修复。');}
    if(existing){documents.change(source,text,[],{important:true});editorStates.delete(source.id);}else{source.text=text;workspace.documents.push(source);}
    if(!workspace.documents.includes(configDoc)){config.reading.items=workspace.documents.filter(item=>readable(item)&&(!scope||documentPath(item).startsWith(scope+'/'))).map(item=>({id:item.id,path:documentPath(item).slice(scope?scope.length+1:0)}));configDoc.text=velaText(config);workspace.documents.push(configDoc);}else{documents.change(configDoc,configText,[],{important:true});editorStates.delete(configDoc.id);}
    if(current()?.id===source.id)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});else if(current()?.id===configDoc.id)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:configDoc.text}});
    preparePaths(workspace);renderDocuments();if(!save())throw Error('保存失败');toast('词条已加入术语库');
  },{label:'添加词条'});
};
function renderVela(){
  renderVelaEditor({root:$('#preview'),doc:current(),workspace,escape:esc,onSave:text=>{const old=current();if(old.text!==text){workspace.configBackups={...workspace.configBackups,[old.id]:[...(workspace.configBackups?.[old.id]||[]),{text:old.text,createdAt:Date.now()}].slice(-5)};}view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});if(!save())throw new Error('保存失败');index=null;renderVela();toast('工作区配置已保存');}});
}
function restorePulledEditor(page){const preview=isPreview;if(workspace.activeId&&!home){switchDocument(workspace.activeId);isPreview=preview;updateEditorVisibility();if(isPreview)renderPreview();}else{showHome();}renderDocuments();showView(page);}
function previewDownload(result,folder,onApply){const plan=downloadPlan(workspace,result,folder),labels={new:'新增',remote:'远端更新',unchanged:'相同',conflict:'本地修改 · 覆盖需勾选'};openModal('确认拉取文件',`<p>${esc(result.repo)} · ${esc(folder)}</p><p>未勾选的文件保留本地内容。拉取不会自动打开文稿。</p><div class="sync-files">${plan.map((item,i)=>`<label class="checkbox"><input name="downloadFiles" type="checkbox" value="${i}" ${item.selected?'checked':''}><span>${esc(item.file.path)}<small>${labels[item.state]}</small></span></label>${item.state==='conflict'&&item.doc&&item.file.text!==null?`<details><summary>对照内容</summary><pre>${esc('- 本地\n'+item.doc.text.slice(0,12000)+'\n+ 远端\n'+item.file.text.slice(0,12000))}</pre></details>`:''}`).join('')}</div>`,async form=>{const selected=new Set(form.getAll('downloadFiles').map(Number));if(!selected.size)throw Error('请选择需要拉取的文件。');for(const [i,item] of plan.entries())if(selected.has(i)&&item.doc){documents.checkpoint(item.doc);if(item.beforeText!==(workspace.documents.find(doc=>doc.id===item.doc.id)?.text))throw Error('本地文稿已变化，请重新拉取。');}if(!save())throw Error('备份本地历史失败，未写入拉取文件。');const keptConflicts=plan.filter((item,i)=>item.state==='conflict'&&!selected.has(i)).map(item=>item.file.path);await onApply({...result,files:plan.filter((_,i)=>selected.has(i)).map(item=>item.file),keptConflicts});},{label:'写入选中文件'});}
async function materializeDownload(result,folder){const association=workspace.repositories?.find(item=>item.repo.toLowerCase()===result.repo.toLowerCase()),oldCommit=association?.commit;if(native){const materialized=await transport('writeWorkspaceFiles',{files:result.files.map(file=>({path:folder+'/'+file.path,data:file.data})),folders:[folder,...result.folders.map(path=>folder+'/'+path)]});if(view){view.destroy();view=null;}editorStates.clear();adoptFolder(workspace,materialized);}else if(result.files.some(file=>file.text===null))throw Error('二进制附件请在应用中拉取。');applyRepository(workspace,result,folder);if(result.keptConflicts?.length){const tracked=workspace.repositories.find(item=>item.repo.toLowerCase()===result.repo.toLowerCase());tracked.commit=oldCommit;tracked.conflicts=result.keptConflicts;}else{const tracked=workspace.repositories.find(item=>item.repo.toLowerCase()===result.repo.toLowerCase());if(tracked)tracked.conflicts=[];}}
async function pullSubscription(item){
  openModal('拉取文件',`<p data-user-content>${esc(item.repo)}</p>${item.snapshot.vela?'<label class="checkbox"><input name="readingOnly" type="checkbox" checked>仅拉取阅读清单</label>':''}<p>保存到内部文件夹；对应 .vela 配置会同时保留，同路径文件覆盖。</p>`,async form=>{
    if(!save())throw new Error('请先保存当前文稿。');const folder='Subscriptions/'+item.repo;let result;
    const client=new GitHub((_operation,payload)=>transport('publicApi',payload)),snapshot=item.snapshot.vela&&form.has('readingOnly')?await subscriptions.api.snapshot(item.repo):item.snapshot;
    result=await client.pullRepository(item.repo,snapshot.branch,{selection:item.snapshot.vela&&form.has('readingOnly')?[...snapshot.configs.map(config=>config.path),...snapshot.files.map(file=>file.path)]:null,includeDependencies:true});
    previewDownload(result,folder,async selected=>{await materializeDownload(selected,folder);for(const file of selected.files){const doc=workspace.documents.find(doc=>documentPath(doc)===folder+'/'+file.path);if(doc){doc.subscription={repo:item.repo,path:file.path,sha:file.sha,loadedSha:file.sha,contentHash:await textHash(doc.text)};editorStates.delete(doc.id);}}restorePulledEditor('subscriptions');save();toast('文件已拉取到内部文件夹。');});return false;
  },{label:t('拉取文件')});
}
async function cacheSubscription(item){
  const prefix='Subscriptions/'+item.repo+'/';let changed=false;
  for(const config of item.snapshot.configs){const path=prefix+config.path;const doc=workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);if(!doc)continue;if(doc.text!==config.text){const hash=await textHash(doc.text);if(doc.subscription.contentHash&&hash!==doc.subscription.contentHash||!doc.subscription.contentHash&&doc.remote?.lastSyncedText!==doc.text){doc.subscription={...doc.subscription,configurationConflict:true,sha:config.sha};changed=true;continue;}documents.checkpoint(doc);documents.change(doc,config.text);doc.subscription={repo:item.repo,path:config.path,sha:config.sha,loadedSha:config.sha,contentHash:await textHash(config.text)};editorStates.delete(doc.id);if(current()?.id===doc.id&&view){view.setState(makeState(doc));if(isPreview)renderPreview();}changed=true;}}
  for(const file of item.snapshot.files){const path=prefix+file.path;const doc=workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);if(doc)doc.subscription={...doc.subscription,repo:item.repo,path:file.path,sha:file.sha};}
  if(changed){preparePaths(workspace);renderDocuments();save();}
}
async function textHash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
async function loadSubscriptionDocument(doc,attempt=0){
  if(doc?.subscription?.configurationConflict)throw Error('本地 .vela 配置已修改，请在订阅拉取预览中对照并处理冲突。');
  if(doc?.subscription&&doc.subscription.loadedSha!==doc.subscription.sha){
    const target=doc.subscription.sha,initial=doc.text,hash=await textHash(initial),text=normalizeText(await subscriptions.api.blob(doc.subscription.repo,target));
    if(doc.subscription.sha!==target){if(attempt>0)throw new Error('远端文件持续变化，请刷新后重试。');return loadSubscriptionDocument(doc,attempt+1);}
    if(doc.text!==initial)throw new Error('读取期间本地文稿已修改，已保留本地内容，请重试。');
    if(initial&&(!doc.subscription.loadedSha||doc.subscription.contentHash&&hash!==doc.subscription.contentHash)){const copy=newDocument(doc.name,initial);copy.path=uniquePath(documentPath(doc),itemPaths(workspace));copy.name=basename(copy.path);workspace.documents.push(copy);}
    doc.text=text;doc.subscription.loadedSha=target;doc.subscription.contentHash=await textHash(text);doc.updatedAt=Date.now();editorStates.delete(doc.id);if(current()?.id===doc.id&&view){view.setState(makeState(doc));if(isPreview)renderPreview();updateStats();}if(!save())throw new Error('订阅文件保存失败。');
  }return doc;
}

async function boot(){try{
  const raw=readWorkspace();
  if(raw)workspace=validateWorkspace(JSON.parse(raw));else{const doc=newDocument('操作指南.txt',guide);workspace={version:1,documents:[doc],openIds:[doc.id],activeId:doc.id,settings:{theme:'system'}};}
  workspace.settings={language:'zh-CN',readingMode:'scroll',theme:'system',palette:'pine',fontSize:16,clientId:'',...workspace.settings,writer:chapterSettings(workspace.settings?.writer)};
  documents=new DocumentService({workspace:()=>workspace,write:saveWorkspace});for(const doc of workspace.documents)documents.register(doc);
  editing=new EditingTools({workspace:()=>workspace,current,view:()=>view,documents,index:()=>view&&ensureIndex(),matcher:()=>chapterMatcher(projectWriter(workspace,current())),invalidate:id=>editorStates.delete(id),scope:currentScope,modal:openModal,close:closeModal,escape:esc,open:switchDocument,jump,save,toast,fail,split:()=>{workspace.settings.splitPreview=!workspace.settings.splitPreview;if(!isPreview)togglePreview();else updateEditorVisibility();save();}});
  if(!['system','light','dark'].includes(workspace.settings.theme))workspace.settings.theme='system';
  preparePaths(workspace);
  if(native){const folder=await transport('initializeStorage');if(folder.storage.id){adoptFolder(workspace,folder,{migrate:!workspace.storage?.id});preparePaths(workspace);}else workspace.storage=folder.storage;}
  for(const doc of workspace.documents){const demo=await isOriginalDemo(doc);if(demo||doc.name==='未命名小说.txt'&&!doc.remote&&doc.text.startsWith('文舟操作指南\n')){const old=documentPath(doc),target=(parentPath(old)?parentPath(old)+'/':'')+'操作指南.txt';doc.path=uniquePath(target,new Set([...itemPaths(workspace)].filter(path=>path!==old)));doc.name=basename(doc.path);if(demo)doc.text=guide;editorStates.delete(doc.id);}}
  for(const doc of workspace.documents.filter(doc=>doc.name==='操作指南.txt'&&!doc.remote)){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.text))),b=>b.toString(16).padStart(2,'0')).join('');if(previousGuideHashes.includes(hash)){doc.text=guide;doc.updatedAt=Date.now();}}
  workspace.settings.writer=chapterSettings({...workspace.settings.writer,titleTemplates:[]});
  plugins=new PluginRuntime({documentHistory:doc=>documents.history(doc),configuration:doc=>projectConfig(workspace,doc)?.config,documentInfo:doc=>({...documents.receipt(doc),historyCount:documents.history(doc).length}),chapters:doc=>Writer.buildIndex(doc.text,projectWriter(workspace,doc),chapterMatcher(projectWriter(workspace,doc))).sections,compileTex:(doc,options)=>texCompiler.compile(doc,options),getView:()=>view,getDoc:current,getFiles:()=>workspace.documents,setText:(id,text)=>{const doc=workspace.documents.find(doc=>doc.id===id);if(!doc)throw new Error('文稿不存在');if(new TextEncoder().encode(text).length>MAX_TEXT_BYTES)throw new Error('文件超过 8 MB');if(doc.id===workspace.activeId&&view)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});else{documents.change(doc,text,[],{important:true});editorStates.delete(id);}if(!save())throw new Error('保存失败');if(isPreview&&id===workspace.activeId)renderPreview();return true;},addFile:(name,text)=>addDocument(newDocument(fileName(name),text)),toast,fail,refreshCommands:refreshPluginCommands,message:(title,message)=>pluginDialog(title,message,'alert'),confirm:(title,message)=>pluginDialog(title,message,'confirm'),prompt:(title,value)=>pluginDialog(title,'','prompt',value)});
  initI18n(workspace.settings.language);
  texCompiler=new TexCompiler({workspace:()=>workspace,plugins:()=>plugins,project:doc=>projectConfig(workspace,doc)});
  texPreview=new PdfPreview({compiler:texCompiler,fail,jump:(path,line)=>{const folder=projectConfig(workspace,current())?.folder||parentPath(documentPath(current())),doc=workspace.documents.find(doc=>documentPath(doc)===(folder?folder+'/':'')+path)||current();if(!doc)return;switchDocument(doc.id);isPreview=false;updateEditorVisibility();view.dispatch({selection:{anchor:view.state.doc.line(Math.max(1,Math.min(view.state.doc.lines,line))).from},scrollIntoView:true});view.focus();}});
  if(environment?.platform==='windows'&&workspace.settings.updateChecks!==false&&Date.now()-(workspace.updateInfo?.checkedAt||0)>86400000)checkWindowsUpdates();
  reader=new Reader({root:$('#reader-view'),workspace:()=>workspace,latex:(root,doc,onReady)=>{const pane=new PdfPreview({compiler:texCompiler,fail,readingMode:()=>reader?.config?.reader?.mode?(reader.config.reader?.mode==='auto'?($('#reader-view').clientWidth>=1000?'double':'scroll'):reader.config.reader?.mode):workspace.settings.readingMode});pane.mount(root,doc,{reading:true,onReady});if(doc.binary){const epoch=pane.epoch;transport('readWorkspaceFile',{path:documentPath(doc)}).then(data=>{if(pane.epoch===epoch)return pane.openFile(fromBase64(data));}).catch(fail);}return pane;},onChrome:(open,visible)=>{if(native&&readerFullscreen!==open){readerFullscreen=open;fullscreenTask=fullscreenTask.catch(()=>{}).then(()=>transport('fullscreen',{enabled:open})).catch(fail);}document.body.classList.toggle('reader-open',open);document.body.classList.toggle('reader-chrome-visible',visible);$('#outline-toggle').disabled=!open;sidebars.update();},markdown:md,sanitize:DOMPurify.sanitize,escape:esc,save,fail,load:loadSubscriptionDocument,html:async(doc,size,layout)=>{if(native){if(save())await transport('previewHtml',{path:documentPath(doc),dark:workspace.settings.dark,reading:true,fontSize:size,layout,titlePage:reader.config?.reader?.titlePage!==false,motion:reader.config?.reader?.motion||'system',readingMode:reader.config?.reader?.mode?(reader.config.reader?.mode==='auto'?($('#reader-view').clientWidth>=1000?'double':'scroll'):reader.config.reader?.mode):workspace.settings.readingMode,language:workspace.settings.language});}else{const content=$('#reader-view .reader-content');content.innerHTML='';const frame=document.createElement('iframe');frame.title='HTML';frame.sandbox='';frame.srcdoc=htmlPreview(doc.text,{dark:workspace.settings.dark,fontSize:size});content.append(frame);}}});
  subscriptions=new Subscriptions({root:$('#subscriptions-view'),nav:$('[data-view=subscriptions]'),workspace:()=>workspace,transport,save,escape:esc,modal:openModal,fail,cache:cacheSubscription,pull:pullSubscription,renderMarkdown:text=>DOMPurify.sanitize(md.render(text),{FORBID_TAGS:['iframe','form','input','button','style'],FORBID_ATTR:['style']})});subscriptions.dot();subscriptions.refresh();
  chapterMatcher(workspace.settings.writer);applyTheme();setFontSize(workspace.settings.fontSize,false);setSidebar('library',workspace.settings.libraryOpen===true,false);
  if(workspace.documents.some(d=>d.name==='操作指南.txt')&&workspace.openIds.includes(workspace.activeId))switchDocument(workspace.activeId);else showHome();
  try{await plugins.boot();}catch(error){toast('插件读取失败：'+error.message);}
  if(native){try{const user=await gh.user();account=user;$('#sidebar-logout').disabled=false;$('#account-label').textContent=user.login;repositories=await gh.repositories();}catch{if(workspace.githubCache?.login){account={login:workspace.githubCache.login};repositories=workspace.githubCache.repositories||[];githubOffline=true;$('#sidebar-logout').disabled=false;$('#account-label').textContent=account.login+' · '+t('离线');}}}
}catch(e){bootFailed=true;$('#editor').innerHTML=`<div class="blank"><h2>无法读取本地文稿</h2><p>${esc(e.message)}</p><p>原始数据已保留，请勿清除应用数据。可先导出原始文件进行恢复。</p><button id="recover-data" class="primary">导出原始数据</button></div>`;$('#recover-data').onclick=()=>exportText('文舟-恢复数据.json',readWorkspace()||'').catch(fail);document.querySelectorAll('button').forEach(b=>{if(b.id!=='recover-data')b.disabled=true;});}}
window.wenzhouBack=()=>{if(pageName==='reader'&&reader?.id){reader.home();return true;}if(pageName!=='write'){showView('write');return true;}return false;};
boot();
