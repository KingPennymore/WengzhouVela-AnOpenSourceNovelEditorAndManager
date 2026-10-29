import {sameRepository} from './sync-repository.mjs';
import {SyncWorkflow} from './sync-workflow.mjs';
import {switchRepositoryBranch,inspectBranchAttachments} from './repository-navigation.mjs';
import {showSyncCleanup} from './sync-cleanup.mjs';
import {syncTarget,syncTargetMarkup} from './sync-target.mjs';
import {syncBlobCache} from './sync-blob-cache.mjs';
import {createGitClient,providerOptions,serverField,showTokenLogin} from './git-login.mjs';
import {gitIdentity,gitHostKey,sameGitHost} from './git-host.mjs';
import {applyFontPreference,normalizeFontName} from './app-core/system-fonts.mjs';
import {mountFontSettings} from './app-core/font-settings.mjs';
import { WorkspaceSession, bindSessionLifecycle } from './app-core/workspace-session.mjs';
import { createAppCommands, bindAppShortcuts } from './app-core/command-bus.mjs';
import { layoutShell as layoutAppShell } from './app-core/shell-layout.mjs';
import { bindPlatformEnvironment } from './app-core/platform-environment.mjs';
import {
  loadWorkspace,
  createDocumentSession,
  prepareWorkspace,
} from './app-core/workspace-startup.mjs';
import {renderVelaEditor} from './vela-view.mjs';
import {registerMapDirectory} from './map-directory.mjs';
import {SidebarViews} from './sidebar-views.mjs';
import {ViewContext,BackgroundTasks} from './extension-services.mjs';
import {bindPanelTapGuard,movedBeyond,SWIPE_SLOP} from './tap-guard.mjs';
bindPanelTapGuard();
import {bindAppChoices} from './app-choices.mjs';
const closeAppChoices=bindAppChoices();
import {outlineMarkers,outlineMarksChanged} from './outline-markers.mjs';
import {startPageMarkup,setStartPanel} from './start-page.mjs';
import {templatesFor,templateText} from './file-templates.mjs';
import {renderComponentDocument,componentText,isComponentDocument,documentProvider,documentSourceProvider,documentImportExtensions,onDocumentFormatsChange} from './document-components.mjs';
import {prepareDocumentImport,documentImportLimit,readDocumentBytes,binaryDocumentName,BINARY_DOCUMENT_EXTENSIONS} from './document-import.mjs';
import {bindSelectionMenu} from './selection-menu.mjs';
import {bindStylePanel} from './format-style-panel.mjs';
import {readImportedArchive} from './imported-archive.mjs';
import {isTexComponentArchive} from './tex-component.mjs';
import {icon,fileIcon} from './icons.mjs';
import {planningTopSheet} from './planning-sheet.mjs';
import {EditorState,Compartment,Transaction} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter} from '@codemirror/view';
import {history, historyKeymap, defaultKeymap, undo, redo, undoDepth, redoDepth} from '@codemirror/commands';
import {searchKeymap, openSearchPanel, highlightSelectionMatches} from '@codemirror/search';
import {languageSupport,loadLanguage} from './languages.mjs';
import {TexCompiler} from './tex-compiler.mjs';
import {syntaxHighlighting, defaultHighlightStyle} from '@codemirror/language';
import Writer from '../vendor/acode-writer/src/core.js';
import {indentedLineWrapping} from '../vendor/acode/src/cm/indentedLineWrapping.ts';
import {scrollPastEndCustom} from '../vendor/acode/src/cm/scrollPastEnd.ts';
import {newDocument,chapterPosition,normalizeText,fileName,fileKind,documentKind,repoPath,MAX_TEXT_BYTES} from './model.mjs';
import {GitHub} from './github.mjs';
import {native,transport,readWorkspace,saveWorkspace,saveWorkspaceAsync,exportText,exportBinary,readEnvironment} from './platform.mjs';
import {shortcuts,matchesKey} from './shortcuts.mjs';
import {SidebarLayout} from './sidebars.mjs';
import {reconcilePanel,textInfoCache} from './document-panels.mjs';
import {UIShell,organizeSettings} from './ui-shell.mjs';
import {createVelaV2,velaText,projectConfig,projectWriter,includeNewReadingFile,rewriteVelaFiles,configFolder,readable,GLOBAL_VELA_PATH,globalConfig,formatHome,legacySidecar,addFormatRecord,configStyles,readPosition,positionEntry,positionOffset,positionUpdate} from './vela.mjs';
import {completionExtensions} from './completion.mjs';
import {syncTextEqual,preserveVelaPositions,mergeVelaTexts} from './vela-sync.mjs';
import {initI18n,setLanguage,t,say} from './i18n.mjs';
import {fullWidthIndent,paragraphNewline} from './indent.mjs';
import {ProjectService} from './project-service.mjs';
import {projectBackend} from './project-backend.mjs';
import {paragraphSelection} from './selection.mjs';
import {decodeFileText} from './file-text.mjs';
import {loadCsvTable,collectCsvTables} from './csv-embed.mjs';
import {showCsvInsert} from './csv-insert.mjs';
import {palettes,applyPalette,paletteFor,allPalettes,customPalettes,setCustomPalettes,MAX_CUSTOM_PALETTES} from './palettes.mjs';
import {showPaletteEditor as openPaletteEditor} from './palette-editor.mjs';
import {newFileHtml,bindNewFile,assertNewFile} from './new-file.mjs';
import {folderPickerHtml,bindFolderPicker} from './folder-picker.mjs';
import {initMotion,crossfadeTheme} from './motion.mjs';
import {inlineMarkup,lineMarkup} from './markdown-tools.mjs';
import {bindTextZoom} from './gestures.mjs';
import {PluginRuntime} from './plugins.mjs';
import {PluginUiHost} from './plugin-ui.mjs';
import {readWorkspaceBackup,prepareBackupRestore,mergeBackupRestore} from './workspace-backup.mjs';
import {createExportDialogs} from './export-dialogs.mjs';
import {renderPlainChapters} from './reader-layout.mjs';
import {textPoint,invalidateTextIndex} from './reading-position.mjs';
import {loadOutlineView,loadMapView,loadPdfPreview,loadReader,loadLatexEditor,loadMarkdownPreview,loadHtmlPreview,loadGuide,loadSubscriptions,loadUpdateView,loadComponentDownloads,loadGlossaryView,chunkFailure} from './lazy.mjs';
import {readPluginZip,fromBase64} from './plugin-package.mjs';
import {documentPath,uniquePath,preparePaths,adoptFolder,folderTree,gitFileState} from './workspace.mjs';
import {applyRemoteFile,repositoryFolder,resolveRepositoryConflict} from './git-workspace.mjs';
import {chapterSettings,chapterMatcher} from './chapters.mjs';
import {glossaryPaths,glossaryTerms,parseGlossary,glossaryText,createGlossary} from './glossary.mjs';
import {beginViewSession} from './view-session.mjs';
import {mountIncrementalList} from './incremental-list.mjs';
import {renderGlossaryPanel} from './glossary-panel.mjs';
import {applyFileOperation,restoreFile,itemPaths,copyDestination,basename,parentPath,within} from './file-manager.mjs';
import {fileOperationCopy,fileViewTarget} from './file-manager.mjs';
import {diffLines} from './document-service.mjs';
import {EditorIndex} from './editor-index.mjs';
import {EditingTools} from './editing-view.mjs';
import {previewCommit} from './sync-commit.mjs';
import {conflictMarkup,bindConflict} from './sync-conflicts.mjs';
import {SyncActivity} from './sync-status.mjs';
import {bindViewport} from './viewport.mjs';
import {editorSearch} from './search-panel.mjs';
import {diffMarkup} from './sync-preview.mjs';
import {readSidecar,sidecarRecord,buildRecord,resolveRecord,recordEmpty,sidecarPath,sidecarTarget,imagePath} from './rich-text.mjs';
import {richTextExtensions,formatsOf,setFormats,toggleInline,toggleAlign,toggleBlock,clearStyles,clearFormats,applyStyle,styleAt,setRuby,rubyAt,insertImage,updateImage,blockStyleAt,settleReview,isFormatActive,formatStyles,imageLoader,tableLoader} from './rich-text-editor.mjs';
import {resolveStyles,validateStyles,STYLE_FIELDS,STYLE_LABELS,BUILTIN_STYLES,paragraphStyle} from './rich-text-styles.mjs';
import {highlightCode,highlightMarkdown} from './code-preview.mjs';
import {escapeHtml as esc,textBytes,MB,formatBytes} from './text-utils.mjs';

const $=s=>document.querySelector(s);

for(const [id,name] of Object.entries({'theme':'theme','settings':'settings','mobile-library':'files','search-icon':'search','github-icon':'github','search-editor':'search','focus-toggle':'focus','outline-toggle':'outline','export-doc':'export','add-glossary':'glossary'})) $('#'+id).innerHTML=icon(name);
function renderAppLabels(){
  for(const [id,name,label] of [
    ['refresh-folder','refresh','刷新'],
    ['new-folder','newWorkspace','新建文件夹'],
    ['workspace-root','root','根目录'],
    ['paste-file','paste','粘贴'],
    ['open-trash','trash','回收站'],
    ['import-doc','import','导入文件'],
    ['new-doc','newFile','新建文件'],
    ['close-outline','close','收起章节目录'],
    ['append-chapter','newFile','追加章节'],
    ['locate-chapter','locate','定位当前章节'],
    ['md-code','code','Markdown 行内代码'],
    ['md-list','list','Markdown 无序列表'],
    ['md-task','task','Markdown 任务列表'],
    ['md-quote','quote','Markdown 引用']
  ]){
    const button=$('#'+id);
    button.innerHTML=icon(name);
    button.title=t(label);
    button.setAttribute('aria-label',t(label));
  }
  for(const [id,label] of [
    ['plugin-document-toolbar','插件文稿工具'],
    ['plugin-bottom-toolbar','插件快捷操作'],
    ['plugin-library-sidebar','插件文件工具'],
    ['plugin-outline-sidebar','插件章节工具'],
    ['plugin-library-sidebar-panels','插件文件面板'],
    ['plugin-outline-sidebar-panels','插件章节面板'],
  ])document.getElementById(id)?.setAttribute('aria-label',t(label));
  // The DOM pass skips the file name element as user content, so its fixed hint is set here.
  $('#current-name').title=t('双击重命名文件');
  for(const [id,,keys,label] of shortcuts){
    const button=document.getElementById(id);
    if(button){
      button.title=say(`${label} (${keys})`,`${t(label)} (${keys})`);
      if(id.startsWith('quick-'))button.setAttribute('aria-label',button.title);
      if(id==='outline-toggle'&&button.planningOriginal){
        button.planningOriginal.title=button.title;
        button.planningOriginal.label=t(label);
      }
    }
  }
}
renderAppLabels();
for(const id of ['home-button','commands','plugins','check-update'])$('#'+id).innerHTML=icon(id==='home-button'?'home':id==='check-update'?'update':id);
for(const [id,name] of Object.entries({'quick-save':'save','quick-undo':'undo','quick-redo':'redo','quick-top':'top','quick-bottom':'bottom','quick-chapter-top':'chapterTop','quick-chapter-bottom':'chapterBottom','quick-git':'git'})) {
  $('#'+id+' span').innerHTML=icon(name);
  $('#'+id).setAttribute('aria-label',$('#'+id).title);
}
document.querySelectorAll('[data-view]').forEach(b=>b.innerHTML=icon(b.dataset.view)+(b.dataset.view==='subscriptions'?'<i class="update-dot" hidden></i>':''));
let gh=new GitHub(transport);
const gitName=()=>gh.provider==='gitea'?'Gitea':gh.provider==='gitee'?'Gitee':'GitHub';
const setGitServer=()=>{if(gh.provider==='gitea'){gh=createGitClient(transport,'gitea',$('#gitea-instance')?.value||gh.server);workspace.settings.giteaServer=gh.server;save();}};
let workspace,view,index,indexDoc,indexSettings='',statsTimer,toastTimer,outlineRevision='',documents,indexService,editing,outlineLimit=200;
let account=null,repositories=[],selectedRepo=null,selectedBranch='',selectedPath='',loadEpoch=0;
let isPreview=false,dialogHandler=null,dialogCancel=null,dialogBusy=false,dialogVersion=0;
let dialogReturnFocus=null,dialogSubmitLabel='确定',dialogDisabledFields=[];
// Split feature instances are created on first use (web/lazy.mjs).
let texCompiler,texPreview,PdfPreview,createTexPreview,Reader,createReader,md,sanitize,htmlPreview,glossaryView,createSubscriptions;
const ensureMarkdown=()=>loadMarkdownPreview().then(module=>{md=module.md;sanitize=module.sanitize;return module;});
const ensureSubscriptions=()=>subscriptions?Promise.resolve(subscriptions):loadSubscriptions().then(module=>subscriptions??=createSubscriptions(module.Subscriptions));
function chunkLoading(root){root.innerHTML=`<p class="blank" role="status">${t('正在读取…')}</p>`;}
const ensurePdfPreview=()=>PdfPreview?Promise.resolve(PdfPreview):loadPdfPreview().then(module=>PdfPreview=module.PdfPreview);
const ensureTexPreview=()=>texPreview?Promise.resolve(texPreview):ensurePdfPreview().then(()=>texPreview??=createTexPreview());
const ensureReader=()=>reader?Promise.resolve(reader):Promise.all([loadReader(),ensureMarkdown()]).then(([module])=>{Reader=module.Reader;return reader??=createReader();});
let plugins,projects,projectLocked=false,home=false,csvEditor=null,environment=readEnvironment();
let textFontSize=16,mapTrail=[],mapNavigating=false;
function mapBack(){const id=mapTrail.pop();if(!id)return false;mapNavigating=true;try{switchDocument(id);if(current()?.id!==id){mapTrail.push(id);return false;}return true;}finally{mapNavigating=false;}}
const selectionMenu=bindSelectionMenu({getView:()=>view,getDoc:()=>pageName==='reader'?reader?.doc:current(),addGlossary:text=>addSelectionToGlossary(text,pageName==='reader'?reader?.doc:current()),extraItems:selection=>selection.view?[...(['TXT','MD','TEX'].includes(documentKind(current()))?[{label:t('链接到大纲节点…'),run:()=>linkOutlineSelection()}]:[]),...(pluginUi?.selectionItems(selection)||[])]:[],fail});
const stylePanel=bindStylePanel({button:$('#format-style'),escape:esc,getState:()=>{
  const doc=current();
  if(!view||!doc||!formatsOf(view.state)||!richTextEnabled(doc))return null;
  return {styles:stylesFor(doc),hasSelection:!view.state.selection.main.empty,active:styleAt(view.state)};
},apply:(id,scope)=>formatCommand(v=>applyStyle(v,id,scope))(),clear:()=>formatCommand(v=>clearStyles(v))(),manage:()=>showStyleManager()});
let remoteSelection=new Map(),remoteSelectionRepo='',remoteSelecting=false;
let selectedFolder='',pageName='write',reader,subscriptions,readerFullscreen=false,fullscreenTask=Promise.resolve();
const ui=new UIShell(environment);
// Plugin slots live inside existing regions; empty slots stay hidden so the default interface is unchanged.
const pluginRoots={'top-toolbar':null};
{
  const tools=document.createElement('div');
  tools.id='plugin-document-toolbar';
  tools.className='markdown-tools plugin-action-strip';
  tools.hidden=true;
  tools.setAttribute('role','toolbar');
  tools.setAttribute('aria-label',t('插件文稿工具'));
  $('#markdown-tools').after(tools);
  pluginRoots['document-toolbar']=tools;
}
for(const [location,parent,before,label] of [['bottom-toolbar',$('.quickbar'),null,'插件快捷操作'],['library-sidebar',$('#library'),$('#doc-list'),'插件文件工具'],['outline-sidebar',$('#outline'),$('#outline-list'),'插件章节工具']]){
  const root=document.createElement('div');
  root.id='plugin-'+location;
  root.className='plugin-action-strip';
  root.hidden=true;
  root.setAttribute('role',location==='bottom-toolbar'?'group':'toolbar');
  root.setAttribute('aria-label',t(label));
  parent.insertBefore(root,before);
  pluginRoots[location]=root;
}
for(const [location,parent,label] of [['library-sidebar',$('#library'),'插件文件面板'],['outline-sidebar',$('#outline'),'插件章节面板']]){
  const root=document.createElement('div');
  root.id='plugin-'+location+'-panels';
  root.className='plugin-panels';
  root.hidden=true;
  root.setAttribute('aria-label',t(label));
  parent.append(root);
  pluginRoots[location+'-panels']=root;
}
const builtinControls=Object.fromEntries([['top-toolbar',['search-editor','outline-toggle','focus-toggle','theme','add-glossary','commands','plugins','settings','export-doc']],['bottom-toolbar',['quick-save','quick-undo','quick-redo','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','quick-git']],['library-sidebar',['new-doc','import-doc','new-folder','refresh-folder','paste-file','open-trash','file-sort']],['outline-sidebar',['append-chapter','locate-chapter']]].flatMap(([location,ids])=>ids.map(id=>[id,{location,element:()=>document.getElementById(id),get title(){
  const element=document.getElementById(id);
  return element?.getAttribute('aria-label')||element?.title||element?.textContent.trim()||id;
}}])));
// Read-only hooks for automated checks; plugins use vela.editor.view instead.
Object.defineProperty(window,'velaEditorView',{get:()=>view,configurable:true});
const pluginUi=new PluginUiHost({roots:pluginRoots,shell:ui,builtins:()=>builtinControls,onError:error=>fail(error)});initMotion();
const sidebars=new SidebarLayout(()=>view?.requestMeasure());
const extensionContext=new ViewContext(()=>{
  const doc=workspace?.documents.find(d=>d.id===workspace.activeId),selection=view?.state.selection.main;
  return {file:doc?{id:doc.id,name:doc.name,path:documentPath(doc)}:null,kind:doc?documentKind(doc):null,mode:isPreview?'preview':'source',page:pageName,selection:!home&&pageName==='write'&&isPreview&&['MAP','OUTLINE'].includes(doc?documentKind(doc):null)?$('#preview').planningApi?.selection?.()||null:selection?{from:selection.from,to:selection.to}:null};
});
const sidebarViews=new SidebarViews({context:()=>extensionContext.get(),onLayout:()=>sidebars.update(),open:(side,open)=>setSidebar(side==='left'?'library':'outline',open),onError:fail});
const extensionTasks=new BackgroundTasks();
const mapDirectory=registerMapDirectory({sidebars:sidebarViews,context:extensionContext,snapshot:()=>planningPreview()&&documentKind(current())==='MAP'?$('#preview').planningApi?.snapshot():null,navigate:spec=>$('#preview').planningApi?.navigate(spec),apply:async patch=>{
  const doc=current(),expected=doc.text,{applyPlanningChanges}=await import('./planning-transactions.mjs');
  return applyExtensionPlanning(doc.id,applyPlanningChanges('MAP',expected,[{op:'update',collection:'labels',id:'map',patch}]),expected);
},escape:esc,fail});
extensionContext.subscribe(()=>sidebarViews.refresh());
new MutationObserver(()=>extensionContext.changed()).observe(document.body,{attributes:true,attributeFilter:['class','style','data-page']});
document.addEventListener('visibilitychange',()=>{sidebarViews.refresh();extensionContext.changed();});
bindViewport(()=>{layoutShell();sidebars.update(false);view?.requestMeasure();});
let fileClipboard=null;
const sourceRendering=new Compartment(),gutters=new Compartment(),formatEnv=new Compartment(),pluginExtras=new Compartment(),projectReadonly=new Compartment(),completer=new Compartment(),pluginKeys=new Compartment(),languages=new Compartment(),systemTheme=matchMedia('(prefers-color-scheme: dark)');
const editorStates=new Map(),editorScrolls=new Map();
const editorIndexes=new WeakMap();
const session = new WorkspaceSession({
  locked: () => projectLocked,
  animating: () => !!sidebars.frame,
  flush: () => {
    if (documents) flushFormats();
  },
  write: () => (documents ? documents.save() : (saveWorkspace(workspace), true)),
  writeAsync: async () =>
    documents
      ? documents.saveAsync(saveWorkspaceAsync)
      : (await saveWorkspaceAsync(workspace), true),
  report: (message, changed) => {
    status(message, changed);
    renderTabDirty();
  },
  changed: () => projects?.changed(),
  toast,
  fail,
});
const current=()=>workspace.documents.find(d=>d.id===workspace.activeId);
async function openExtensionDocument(id,{selection,chapter,object,collection,signal}={}){
 signal?.throwIfAborted();const doc=workspace.documents.find(d=>d.id===id);if(!doc)throw Object.assign(Error(t('文稿不存在。')),{code:'E_NOT_FOUND'});
 let range=selection;if(chapter!==undefined){
    if(!Number.isInteger(chapter)||chapter<0)throw Error(t('章节序号无效。'));
    const sections=Writer.buildIndex(doc.text,projectWriter(workspace,doc),chapterMatcher(projectWriter(workspace,doc))).sections,section=sections[chapter];
    if(!section)throw Error(t('章节不存在。'));
    const lines=doc.text.split('\n');
    range={from:lines.slice(0,section.row).reduce((n,line)=>n+line.length+1,0)};
  }
 if(range&&(!Number.isInteger(range.from)||range.from<0||range.from>doc.text.length||range.to!==undefined&&(!Number.isInteger(range.to)||range.to<range.from||range.to>doc.text.length)))throw Error(t('文本范围无效。'));
 switchDocument(id);if(current()?.id!==id)throw Error(t('未能切换文稿。'));
 if(range){if(isPreview)togglePreview();view.dispatch({selection:{anchor:range.from,head:range.to??range.from},scrollIntoView:true});view.focus();}
 if(object){
    if(!['MAP','OUTLINE'].includes(documentKind(doc)))throw Error(t('当前文件不支持对象定位。'));
    if(!isPreview){isPreview=true;updateEditorVisibility();renderPreview();}
    for(let i=0;i<120&&!$('#preview').planningApi;i++){signal?.throwIfAborted();await new Promise(resolve=>requestAnimationFrame(resolve));}
    signal?.throwIfAborted();
    if(current()?.id!==id||!$('#preview').planningApi)throw Error(t('规划预览尚未就绪。'));
    $('#preview').planningApi.navigate({id:object,collection});
  }
 return {id};
}
async function applyExtensionPlanning(id,next,expected){
 if(projectLocked)throw Error(t('项目正在提交，请稍后编辑。'));const doc=workspace.documents.find(d=>d.id===id);if(!doc||doc.text!==expected)throw Object.assign(Error(t('文稿已变化，请重新读取。')),{code:'E_CONFLICT'});
 if(current()?.id===id&&planningPreview()&&$('#preview').planningApi?.apply)return $('#preview').planningApi.apply(next,expected);
 return plugins.host.setText(id,next);
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
/** A notice that waits for the current toast instead of replacing it. */
function toastLater(message){if($('#toast').hidden)toast(message);else setTimeout(()=>toastLater(message),600);}
function fail(error){toast(t(error.message||String(error)));}
const syncActivity=new SyncActivity(()=>renderSyncStatus());
const syncWorkflow = new SyncWorkflow({
  workspace: () => workspace, save, openModal, escape: esc,
  checkpoint: doc => documents.checkpoint(doc),
  readFile: native ? path => transport('readWorkspaceFile', {path}) : null,
  writeFiles: native ? payload => transport('writeWorkspaceFiles', payload) : null,
  adopt: materialized => {
    if(view){view.destroy();view=null;}
    editorStates.clear();adoptFolder(workspace,materialized);
  },
  changed: () => {projects.changed('sync');renderSyncStatus();},
});
const syncBusy = () => syncWorkflow.active || syncActivity.busy;
function renderSyncStatus(){
  const doc=workspace?.documents.find(d=>d.id===workspace.activeId),root=$('#sync-state');
  if(!root)return;
  const label=doc?.remote?syncActivity.label(doc.id,!syncTextEqual(documentPath(doc),doc.remote.lastSyncedText,doc.text),doc.remote):t('未关联远端');
  root.hidden=!doc?.remote&&!syncActivity.items.has(doc?.id);
  root.textContent=label;
  root.title=[label,syncTarget(doc?.remote),doc?.remote?.syncedAt?say(`上次同步：${new Date(doc.remote.syncedAt).toLocaleString()}`,`Last synced: ${new Date(doc.remote.syncedAt).toLocaleString()}`):'',t('远端是否有新修改，需要刷新或拉取后确认。')].join('\n');
  root.dataset.state=syncActivity.items.get(doc?.id)?.state||'idle';
}

function activeUndoDepth(){return isPreview&&documentKind(current())==='MAP'?$('#preview').mapHistoryDepth?.().undo||0:view?undoDepth(view.state):0;}
function activeRedoDepth(){return isPreview&&documentKind(current())==='MAP'?$('#preview').mapHistoryDepth?.().redo||0:view?redoDepth(view.state):0;}
function status(message,changed=false){$('#save-state').textContent=t(message);$('#save-state').classList.toggle('dirty',changed);renderSyncStatus();}
function save(show = false) {
  return session.save(show);
}
function scheduleSave(delay = 1200) {
  session.scheduleSave(delay);
}
function scheduleWorkspaceSave() {
  session.scheduleWorkspaceSave();
}
const sessionLifecycle = bindSessionLifecycle(
  window,
  document,
  session,
  () => rememberPosition(workspace?.activeId, view?.state),
  () => !!documents?.dirty.size,
);
window.wenzhouSave = sessionLifecycle.save;
function ensureIndex(){
  const doc=view.state.doc,writer=documentKind(current())==='TEX'?{...projectWriter(workspace,current()),tex:true}:projectWriter(workspace,current()),settings=JSON.stringify(writer);
  if(doc!==indexDoc||settings!==indexSettings||!index){
    if(!indexService||indexService.doc!==doc||settings!==indexSettings){
      const cached=editorIndexes.get(doc);
      indexService=cached?.settings===settings&&cached.service.doc===doc?cached.service:new EditorIndex(doc,writer);
    }
    editorIndexes.set(doc,{settings,service:indexService});
    index=indexService.value;
    indexDoc=doc;
    indexSettings=settings;
    outlineRevision='';
  }
  return index;
}
function renderOutline(section){
  const idx=ensureIndex(),query=$('#chapter-search').value.trim().toLowerCase();
  const revision=JSON.stringify([current().id,query,idx.chapterCount,idx.total,idx.lineCount]);
  if(revision!==outlineRevision){
    const matches=idx.sections.map((s,i)=>({s,i})).filter(({s})=>s.title.toLowerCase().includes(query)),visible=matches.slice(0,outlineLimit);
    if(section&&!visible.some(({s})=>s===section)){const selected=matches.find(({s})=>s===section);if(selected)visible.push(selected);}
    $('#outline-list').innerHTML=visible.map(({s,i})=>`<button class="chapter" data-row="${s.row}"><span class="chapter-number">${String(i+1).padStart(2,'0')}</span><span>${esc(s.title)}<small>${say(`${s.count.toLocaleString()} 字 · 行 ${s.row+1}`,`${s.count.toLocaleString()} characters · line ${s.row+1}`)}</small></span></button>`).join('')+(matches.length>outlineLimit?`<button id="more-chapters" class="secondary">${say(`显示更多 · ${visible.length} / ${matches.length}`,`Show more · ${visible.length} / ${matches.length}`)}</button>`:'')||`<p class="blank">${t('没有匹配的章节。')}</p>`;
    const more=$('#more-chapters');
    if(more)more.onclick=()=>{outlineLimit+=200;outlineRevision='';updateStats();};
    outlineRevision=revision;
  }
  const active=section?.row??-1,list=$('#outline-list');if(list.dataset.activeRow===String(active)&&list.dataset.activeRevision===outlineRevision)return;list.dataset.activeRow=String(active);list.dataset.activeRevision=outlineRevision;
  list.querySelectorAll('[data-row]').forEach(b=>b.classList.toggle('active',Number(b.dataset.row)===section?.row));
}
function renderTabDirty(){
  renderSyncStatus();
  document.querySelectorAll('.document-tab').forEach(tab=>{
    const id=tab.querySelector('[data-tab]')?.dataset.tab,marker=tab.querySelector('.tab-dirty');
    if(marker)marker.textContent=documents?.dirty.has(id)||id===workspace.activeId&&session.dirty?'●':'';
  });
}
const planningPreview=()=>!home&&pageName==='write'&&isPreview&&['OUTLINE','MAP'].includes(documentKind(current()));
function updateStats(){
  renderSyncStatus();
  if(!current()||!view){$('#chapter-count').textContent='';$('#word-count').textContent='';$('#current-chapter').textContent='';$('#cursor-position').textContent='';$('#selection-count').textContent='';return;}
  if(isPreview&&documentKind(current())==='CSV'){
    $('#chapter-count').textContent='';
    $('#current-chapter').textContent=t('表格');
    $('#word-count').textContent='';
    $('#cursor-position').textContent='';
    $('#selection-count').textContent='';
    $('#quick-undo').disabled=activeUndoDepth()===0;
    $('#quick-redo').disabled=activeRedoDepth()===0;
    return;
  }
  if(planningPreview()){
    $('#chapter-count').textContent='';
    $('#current-chapter').textContent=t(documentKind(current())==='MAP'?'点绘地图':'剧情与关系');
    $('#word-count').textContent=$('#preview').planningSummary?.()||'';
    $('#cursor-position').textContent='';
    $('#selection-count').textContent='';
    $('#outline-list').replaceChildren();
    $('#quick-undo').disabled=activeUndoDepth()===0;
    $('#quick-redo').disabled=activeRedoDepth()===0;
    return;
  }
  if(isComponentDocument(current())&&isPreview){
    try{
      const text=componentText(current().text,current().name);
      $('#word-count').textContent=say(`全文 ${Writer.countText(text).toLocaleString()} 字`,`Total ${Writer.countText(text).toLocaleString()} characters`);
      $('#current-chapter').textContent=t('富文本');
      $('#cursor-position').textContent='';
      $('#chapter-count').textContent='';
      $('#selection-count').textContent='';
      $('#outline-list').replaceChildren();
      $('#quick-undo').disabled=activeUndoDepth()===0;
      $('#quick-redo').disabled=activeRedoDepth()===0;
      return;
    }catch{}
  }
  const idx=ensureIndex(),pos=view.state.selection.main.head,row=view.state.doc.lineAt(pos),section=Writer.sectionAt(idx,row.number-1);
  $('#chapter-count').textContent=say(`${idx.chapterCount} 章`,`${idx.chapterCount} chapters`);
  $('#word-count').textContent=say(`本章 ${section?.count||0} 字 · 全文 ${idx.total} 字`,`Chapter ${section?.count||0} chars · Total ${idx.total} chars`);
  $('#current-chapter').textContent=section?.title||t('全文');
  $('#cursor-position').textContent=say(`行 ${row.number}，列 ${pos-row.from+1}`,`Ln ${row.number}, Col ${pos-row.from+1}`);
  renderSelectionCount();
  renderOutline(section);
  $('#quick-undo').disabled=activeUndoDepth()===0;$('#quick-redo').disabled=activeRedoDepth()===0;
}
// Counting is linear in the selection, so long selections (drag or Shift-extend over chapters) are counted once
// they stop changing instead of on every selection update.
let selectionCountTimer=0;
function renderSelectionCount(){
  clearTimeout(selectionCountTimer);const selection=view.state.selection.main,output=$('#selection-count'),count=()=>say(`选中 ${Writer.countText(view.state.sliceDoc(selection.from,selection.to),workspace.settings.writer.countMode)} 字`,`${Writer.countText(view.state.sliceDoc(selection.from,selection.to),workspace.settings.writer.countMode)} selected chars`);
  if(selection.empty)output.textContent='';else if(selection.to-selection.from<=4000)output.textContent=count();else{
    const state=view.state;
    selectionCountTimer=setTimeout(()=>{if(view?.state===state)output.textContent=count();},160);
  }
}
function languageFor(doc){return languageSupport(doc);}
function activateLanguage(doc){
  if(isPreview&&['OUTLINE','MAP'].includes(documentKind(doc)))return;
  const name=doc.name,kind=doc.kind;
  loadLanguage(doc).then(extension=>{if(current()?.id===doc.id&&current()?.name===name&&current()?.kind===kind&&view)view.dispatch({effects:languages.reconfigure(extension)});}).catch(fail);
}
function refreshFileType(doc){
  const effects=[languages.reconfigure(languageFor(doc)),completer.reconfigure(projectConfig(workspace,doc)?.config?.editor?.completion===false
    ?[]
    :completionExtensions(doc,()=>({documents:workspace.documents,autoNouns:workspace.settings.autoNouns,highlightTerms:workspace.settings.highlightTerms,terms:glossaryTerms(workspace,doc),glossary:workspace.writingTools?.glossary||[],snippets:workspace.writingTools?.snippets||[],packages:(plugins?.records||[]).filter(record=>record.enabled).flatMap(record=>(record.texFiles||[]).map(file=>file.path)),entries:(workspace.entries||[]).filter(item=>!item.directory).map(item=>item.path)})))];
  if(workspace.activeId===doc.id&&view)view.dispatch({effects});else if(editorStates.has(doc.id))editorStates.set(doc.id,editorStates.get(doc.id).update({effects}).state);
  activateLanguage(doc);
  updateEditorVisibility();
  if(isPreview&&current())renderPreview();
  renderDocuments();
}
function editorIndent(v,remove=false){
  if(v.composing)return false;
  const config=projectConfig(workspace,current())?.config?.editor;
  if(documentKind(current())==='TXT'&&config?.mode!=='code'&&config?.novelIndent!=='spaces')return fullWidthIndent(v,remove);
  const n=config?.indentSize||2;
  if(!remove){v.dispatch(v.state.replaceSelection(' '.repeat(n)));return true;}
  const line=v.state.doc.lineAt(v.state.selection.main.head),count=line.text.match(/^ +/)?.[0].length||0;
  v.dispatch({changes:{from:line.from,to:line.from+Math.min(n,count),insert:''}});
  return true;
}
// TXT formatting lives in the work's .vela (richText.documents), see docs/VELA-V3-DESIGN.md. 0.9.7 sidecars beside
// the TXT (正文.txt.vela) are read and, on the next save, moved into the .vela.
const brokenFormats=new Set(),formatSeen=new Map();
const sidecarOf=doc=>legacySidecar(workspace,doc);
/** What the formats of `doc` were when loaded: its record in .vela, a legacy sidecar, or nothing. */
const formatStamp=doc=>{const record=formatHome(workspace,doc)?.record;if(record)return 'record:'+JSON.stringify(record);const legacy=sidecarOf(doc);return legacy?'sidecar:'+legacy.text:null;};
function richTextEnabled(doc){
  if(documentKind(doc)!=='TXT')return false;
  const project=projectConfig(workspace,doc);
  return !!formatHome(workspace,doc)?.record||!!sidecarOf(doc)||project?.config?.richText?.enabled===true||project?.config?.richText?.enabled!==false&&workspace.settings.richText===true;
}
/** Formats of `doc` placed in its current text; text edited outside Vela is re-anchored and leftovers go to review. */
function loadFormats(doc){
  brokenFormats.delete(doc.id);formatSeen.set(doc.id,formatStamp(doc));
  // While the work's .vela has errors its formats are not written; format commands say so.
  const project=projectConfig(workspace,doc);if(project&&!project.global&&(project.warning||project.error))brokenFormats.add(doc.id);
  const home=formatHome(workspace,doc),legacy=home?.record?null:sidecarOf(doc);if(!home?.record&&!legacy)return {};
  try{let result,previous=0;
    if(home?.record){result=resolveRecord(doc.text,home.record);previous=home.record.review?.length||0;}
    else{const sidecar=readSidecar(legacy.text);previous=sidecar.review?.length||0;const converted=sidecarRecord(doc.text,sidecar);result={...resolveRecord(doc.text,converted.record),moved:0};}
    const fresh=result.review.length-previous;
    if(result.moved||fresh>0)setTimeout(()=>toast(say(`${doc.name}：正文在文舟外有改动${result.moved?'，已按原文重新定位 '+result.moved+' 处格式':''}${fresh>0?'，'+fresh+' 处格式待确认':''}。`,`${doc.name}: text changed outside Vela${result.moved?'; relocated '+result.moved+' formats':''}${fresh>0?'; '+fresh+' formats need review':''}.`)),0);
    return {entries:result.entries,review:result.review,source:home?.record||{}};}
  catch(error){
    brokenFormats.add(doc.id);
    setTimeout(()=>toast(say(`${doc.name} 的格式未加载：${t(error.message)} 格式记录保持原样。`,`Formats for ${doc.name} were not loaded: ${t(error.message)} Format records are preserved.`)),0);
    return {};
  }
}
/** Replaces the open editor state of a configuration document after it was rewritten. */
function refreshConfigState(configDoc){editorStates.delete(configDoc.id);if(current()?.id===configDoc.id&&view){view.setState(makeState(configDoc));if(isPreview)renderPreview();}}
/**
 * Writes the format record of each open TXT whose formats or text changed into its work's .vela (creating one in
 * the TXT's folder when no .vela covers it). Formats changed elsewhere meanwhile are reloaded, not overwritten.
 */
function flushFormats(){
  const states=new Map(editorStates);if(view&&current())states.set(current().id,view.state);
  for(const [id,state] of states){
    const doc=workspace.documents.find(item=>item.id===id),value=formatsOf(state);if(!doc||!value||brokenFormats.has(id)||documentKind(doc)!=='TXT'||state.doc.toString()!==doc.text)continue;
    const stamp=formatStamp(doc),legacy=sidecarOf(doc);
    if(formatSeen.has(id)&&stamp!==formatSeen.get(id)){
      if(current()?.id===id&&view)view.dispatch({effects:setFormats.of({entries:[],review:[],...loadFormats(doc)}),annotations:Transaction.addToHistory.of(false)});else editorStates.delete(id);
      continue;
    }
    const home=formatHome(workspace,doc);
    if(!home?.record&&!legacy&&!value.entries.length&&!value.review.length)continue;
    let record;try{record=buildRecord(doc.text,value.entries,value.review,value.source||{});}catch(error){fail(error);continue;}
    const empty=recordEmpty(record),next='record:'+JSON.stringify(record);
    if(home){
      if(!legacy&&(empty?!home.record:stamp===next))continue;
      const config=structuredClone(home.config),records={...config.richText?.documents};if(empty)delete records[home.key];else records[home.key]=record;
      config.version=3;config.richText={...config.richText,documents:records};if(!Object.keys(records).length)delete config.richText.documents;
      let text;try{text=velaText(config);}catch(error){fail(error);continue;}
      if(text!==home.doc.text)documents.change(home.doc,text);
      refreshConfigState(home.doc);
    }else if(!empty){
      // A .vela that became invalid after the TXT was opened is left for the user to fix; formats are not written.
      const project=projectConfig(workspace,doc);if(project&&!project.global&&(project.warning||project.error)){brokenFormats.add(id);continue;}
      const before=workspace.documents.length;if(!addFormatRecord(workspace,documentPath(doc),record)){
        toast(say(`${doc.name} 的格式未保存：作品配置 .vela 无法写入。`,`Formats for ${doc.name} were not saved: the work’s .vela configuration cannot be written.`));
        continue;
      }
      if(workspace.documents.length>before){
        workspace.treeRevision=(workspace.treeRevision||0)+1;
        renderDocuments();
        toast(say(`已在“${parentPath(documentPath(doc))||t('内部文件夹')}”创建作品配置 .vela，用于保存 TXT 格式。`,`Created a .vela configuration in “${parentPath(documentPath(doc))||t('内部文件夹')}” to save TXT formats.`));
      }
      else{const created=formatHome(workspace,doc);if(created)refreshConfigState(created.doc);}
    }
    formatSeen.set(id,empty?null:formatStamp(doc));
    // The 0.9.7 sidecar is now in .vela; it goes to the trash (restorable) instead of staying beside the TXT.
    if(legacy&&(home||!empty))retireSidecar(legacy);
  }
}
// Moving the sidecar to the trash is a file operation that rebuilds the editor, so it waits for a quiet moment:
// the editor page, no dialog, no typing for a while.
let lastKeyAt=0;document.addEventListener('keydown',()=>{lastKeyAt=Date.now();},true);
const retiring=new Set();
function retireSidecar(legacy){
  if(retiring.has(legacy.id))return;
  retiring.add(legacy.id);
  const path=documentPath(legacy),attempt=()=>{
    if(!workspace.documents.some(doc=>doc.id===legacy.id)){
      retiring.delete(legacy.id);
      return;
    }
    if(pageName!=='write'||$('#dialog').open||view?.composing||Date.now()-lastKeyAt<1500){
      setTimeout(attempt,1500);
      return;
    }
    manageFile('delete',path,'',{quiet:true}).then(()=>toastLater(say(`旧版格式旁注 ${basename(path)} 已并入作品配置 .vela，原文件移入回收站。`,`Legacy format sidecar ${basename(path)} was merged into the work’s .vela and moved to trash.`))).catch(error=>toast(say(`旧版格式旁注未能移走：${t(error.message)}`,`Could not move the legacy format sidecar: ${t(error.message)}`))).finally(()=>retiring.delete(legacy.id));
  };
  setTimeout(attempt,1500);
}
// Illustrations are workspace image files; only the native apps can read them (as data URLs).
const imageCache=new Map(),imageLoaders=new Map();
const canReadImages=()=>native&&!!workspace.storage?.id;
function workspaceImagePath(doc,src){const folder=parentPath(documentPath(doc));return (folder?folder+'/':'')+src;}
function loadWorkspaceAsset(path){
  if(!canReadImages())return null;
  if(!imageCache.has(path))imageCache.set(path,transport('readWorkspaceAsset',{path}).catch(error=>{imageCache.delete(path);throw error;}));
  return imageCache.get(path);
}
const loadWorkspaceImage=(doc,src)=>loadWorkspaceAsset(workspaceImagePath(doc,src));
function imageLoaderFor(doc){
  if(!canReadImages())return null;
  if(!imageLoaders.has(doc.id))imageLoaders.set(doc.id,src=>loadWorkspaceImage(workspace.documents.find(item=>item.id===doc.id)||doc,src));
  return imageLoaders.get(doc.id);
}
const tableLoaders=new Map();
const loadWorkspaceTable=(doc,src)=>loadCsvTable(workspace,doc,src,{readFile:native?path=>transport('readWorkspaceFile',{path}):null,loadDocument:loadSubscriptionDocument});
function tableLoaderFor(doc){if(!tableLoaders.has(doc.id))tableLoaders.set(doc.id,src=>loadWorkspaceTable(workspace.documents.find(item=>item.id===doc.id)||doc,src));return tableLoaders.get(doc.id);}
const exportTables=(doc,entries)=>collectCsvTables(entries,src=>loadWorkspaceTable(doc,src));
const stylesFor=doc=>resolveStyles(configStyles(projectConfig(workspace,doc)?.config));
const formatEnvironment=doc=>[formatStyles.of(stylesFor(doc)),imageLoader.of(imageLoaderFor(doc)),tableLoader.of(tableLoaderFor(doc))];
/** Re-reads style definitions and the image loader for the open TXT (after configuration changes or switching). */
function refreshFormatEnvironment(){
  const doc=current();
  if(!view||!doc||!formatsOf(view.state))return;
  const styles=stylesFor(doc);
  if(JSON.stringify(styles)!==JSON.stringify(view.state.facet(formatStyles))||view.state.facet(imageLoader)!==imageLoaderFor(doc)||view.state.facet(tableLoader)!==tableLoaderFor(doc))view.dispatch({effects:formatEnv.reconfigure(formatEnvironment(doc))});
}
/** Images an export needs, read from the workspace: src → data URL, or src → {bytes,type} for EPUB. Unreadable ones are left out. */
async function exportImages(doc,entries,bytes=false){
  const map=new Map();
  for(const src of new Set(entries.filter(entry=>entry.group==='inserts'&&entry.type==='image'&&entry.src).map(entry=>entry.src))){
    const pending=loadWorkspaceImage(doc,src);
    if(!pending)continue;
    try{
      const url=await pending;
      if(!bytes){
        map.set(src,url);
        continue;
      }
      const match=/^data:(image\/[a-z0-9+.-]+);base64,(.*)$/i.exec(url);
      if(!match)continue;
      const raw=atob(match[2]),data=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
      map.set(src,{type:match[1].toLowerCase(),bytes:data});
    }catch{/* Reported as missing by the export. */}
  }
  return map;
}
function renderFormatTools(){
  const tools=$('#format-tools');if(!tools)return;const doc=current(),value=view&&formatsOf(view.state),show=!home&&!isPreview&&!!doc&&!!value&&richTextEnabled(doc);tools.hidden=!show;if(!show){
    stylePanel.close();
    return;
  }
  const state=view.state,line=state.doc.lineAt(state.selection.main.head),aligned=value.entries.find(entry=>entry.group==='blocks'&&entry.type==='align'&&entry.from===line.from)?.value;
  $('#format-strong').setAttribute('aria-pressed',String(isFormatActive(state,'strong')));$('#format-emphasis').setAttribute('aria-pressed',String(isFormatActive(state,'emphasis')));
  $('#format-center').setAttribute('aria-pressed',String(aligned==='center'));$('#format-right').setAttribute('aria-pressed',String(aligned==='right'));
  $('#format-ruby').setAttribute('aria-pressed',String(!!rubyAt(state)));
  // The style button names the style under the cursor: the characters' first, else the paragraph's.
  const styles=stylesFor(doc),active=styleAt(state),name=(styles[active.chars]===BUILTIN_STYLES[active.chars]?t(styles[active.chars]?.label||''):styles[active.chars]?.label)||(styles[active.paragraph]===BUILTIN_STYLES[active.paragraph]?t(styles[active.paragraph]?.label||''):styles[active.paragraph]?.label)||'';
  $('#format-style-label').textContent=name||t('样式');$('#format-style').classList.toggle('active',!!name);$('#format-style').title=name?say(`命名样式：${name}${active.chars?'（文字）':'（整段）'}`,`Named style: ${name}${active.chars?' (text)':' (paragraph)'}`):t('命名样式：作用于选中文字或整段');
  const review=$('#format-review');review.hidden=!value.review.length;review.textContent=say(`待确认 ${value.review.length}`,`${value.review.length} need review`);
  stylePanel.refresh();
}
const formatBlocked=()=>{if(view.state.readOnly){toast(t('项目正在提交，请稍后再改格式。'));return true;}if(brokenFormats.has(current().id)){toast(t('格式无法保存：作品配置 .vela 或其中的格式记录有错误，请先修复。'));return true;}return false;};
const guardFormat=()=>{if(!view||!richTextEnabled(current()))return false;return !formatBlocked();};
function showRubyDialog(){
  if(!guardFormat())return;const range=view.state.selection.main;if(range.empty){toast(t('请先选中要注音的文字。'));return;}
  const base=view.state.sliceDoc(range.from,range.to),existing=rubyAt(view.state);if(base.includes('\n')){toast(t('注音不能跨段落。'));return;}
  openModal(t('注音'),`<p>${say(`为“${esc(base.slice(0,40))}”注音。读音显示在文字上方，TXT 正文不变。`,`Add pronunciation to “${esc(base.slice(0,40))}”. It appears above the text; the TXT text stays unchanged.`)}</p>
    <label>${t('读音')}<input name="reading" maxlength="64" value="${esc(existing)}" autofocus placeholder="${t('例如 lín zhōu')}"></label>
    ${existing?`<p><button type="button" class="danger" id="remove-ruby">${t('删除注音')}</button></p>`:''}`,form=>{
    const value=form.get('reading').trim();
    if(!value)throw Error(t('请填写读音，或点“删除注音”。'));
    setRuby(view,value);
    renderFormatTools();
    view.focus();
  },{label:t('确定')});
  const remove=$('#remove-ruby');if(remove)remove.onclick=()=>{setRuby(view,'');closeModal();renderFormatTools();view.focus();};
}
const workspaceImages=doc=>{
  const folder=parentPath(documentPath(doc)),prefix=folder?folder+'/':'';
  return (workspace.entries||[]).filter(entry=>!entry.directory&&/\.(png|jpe?g|gif|webp)$/i.test(entry.path)&&entry.path.startsWith(prefix)).map(entry=>entry.path.slice(prefix.length)).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
};
/** Insert an illustration after the current paragraph, or edit/remove the one with `id`. */
function showTableDialog(id){
  if(!guardFormat())return;
  try{showCsvInsert({doc:current,view:()=>view,workspace:()=>workspace,escape:esc,openModal,root:()=>$('#dialog-body'),
    readOnly:()=>projectLocked||view.state.readOnly,load:loadWorkspaceTable,save,close:closeModal,fail,changed:()=>{renderDocuments();renderFormatTools();},
    create:({path,text,delimiter})=>{if(/[<>:"|?*]/.test(path))throw Error(t('文件路径包含不支持的字符。'));if(itemPaths(workspace).has(path))throw Error(t('同名文件已存在，请修改文件路径。'));
      for(const doc of workspace.documents)if(path.startsWith(documentPath(doc)+'/'))throw Error(t('目标父路径不是文件夹。'));
      for(const entry of workspace.entries||[])if(!entry.directory&&path.startsWith(entry.path+'/'))throw Error(t('目标父路径不是文件夹。'));
      const doc=newDocument(basename(path),text);doc.path=path;doc.delimiter=delimiter;workspace.documents.push(doc);
      const parts=parentPath(path).split('/').filter(Boolean);workspace.folders=[...new Set([...(workspace.folders||[]),...parts.map((_,i)=>parts.slice(0,i+1).join('/'))])];},
    open:async path=>{
      try{const doc=workspace.documents.find(item=>documentPath(item)===path);if(doc){await loadSubscriptionDocument(doc);switchDocument(doc.id);}else await openLazyProjectDocument(path);}catch(error){fail(error);}
    }},id);}catch(error){
    fail(error);
  }
}
function showImageDialog(id){
  if(!guardFormat())return;const doc=current(),entry=id?formatsOf(view.state).entries.find(item=>item.id===id&&item.group==='inserts'):null,list=workspaceImages(doc),canImport=canReadImages();
  openModal(entry?t('编辑插图'):t('插入插图'),`<label>${t('图片路径')}<input name="src" required list="workspace-images" value="${esc(entry?.src||'')}" placeholder="${t('插图/雪夜.png')}"><datalist id="workspace-images">${list.map(path=>`<option value="${esc(path)}">`).join('')}</datalist><small>${say(`相对于本文所在文件夹${list.length?t('，可从列表选择工作区中的图片'):''}。插图放在${entry?t('原来的位置'):t('光标所在段落之后')}。`,`Relative to this document’s folder${list.length?t('，可从列表选择工作区中的图片'):''}. The illustration is placed ${entry?t('原来的位置'):t('光标所在段落之后')}.`)}</small></label>
    <label>${t('说明（可选）')}<input name="alt" maxlength="200" value="${esc(entry?.alt||'')}"></label>
    ${canImport?`<p><button type="button" class="secondary" id="import-image">${t('从本机导入图片…')}</button></p>`:`<small>${t('浏览器预览不能读取或导入工作区图片，插图显示为占位框；在应用中可正常显示和导出。')}</small>`}${entry?`<p><button type="button" class="danger" id="remove-image">${t('删除插图')}</button></p>`:''}`,form=>{
    const src=imagePath(form.get('src')),alt=form.get('alt').trim();
    if(entry)updateImage(view,entry.id,{src,alt});else insertImage(view,{src,alt});
    renderFormatTools();
    view.focus();
  },{label:entry?t('保存'):t('插入')});
  const remove=$('#remove-image');if(remove)remove.onclick=()=>{updateImage(view,entry.id,null);closeModal();renderFormatTools();view.focus();};
  // WebViews do not open a chooser for <input type=file>, so the image comes from the app's own system picker.
  const button=$('#import-image');if(button)button.onclick=async()=>{$('#dialog-error').textContent='';button.disabled=true;try{
    const picked=await transport('import',{}),file=Array.isArray(picked)?picked[0]:picked;if(!file)return;
    const extension=(file.name.match(/\.(png|jpe?g|gif|webp)$/i)||[])[1];if(!extension||typeof file.data!=='string')throw Error(t('请选择 PNG、JPEG、GIF 或 WebP 图片。'));
    if(file.data.length*3/4>8*MB)throw Error(t('插图不能超过 8 MB。'));
    // i18n-data: file names, matching text and editable defaults stay as written
    const name=file.name.replace(/[\\/:*?"<>|\x00-\x1f]+/g,'_').slice(-80)||'插图.png',existing=new Set(workspaceImages(doc));let relative='插图/'+name;for(let i=2;existing.has(relative);i++)relative='插图/'+name.replace(/(\.[^.]+)?$/,` (${i})$1`);
    if(!save())throw Error(t('请先保存当前文稿。'));const target=workspaceImagePath(doc,relative);applyFileState(await transport('writeWorkspaceFiles',{files:[{path:target,data:file.data}],folders:[parentPath(target)]}));
    $('#dialog-body [name=src]').value=relative;toast(say(`已导入 ${relative}`,`Imported ${relative}`));
  }catch(error){$('#dialog-error').textContent=t(error.message);}finally{button.disabled=false;}};
}
/** Where named styles are saved: the workspace .vela of this TXT, or the global configuration. */
function styleConfigDoc(doc){
  const project=projectConfig(workspace,doc);
  if(project?.error)throw Error(say(`作品配置有错误，请先修复：${t(project.error.message)}`,`Repair the work configuration first: ${t(project.error.message)}`));
  if(project&&!project.global&&project.rawConfig?.kind==='workspace')return project.doc;
  return ensureGlobalVela();
}
/** Edits the named styles of the open TXT's work, or of the .vela `target` (from the .vela editor's format page). */
function showStyleManager(selected='',target=null){
  const doc=current();if(!target&&(!doc||documentKind(doc)!=='TXT')){toast(t('请先打开 TXT 文稿。'));return;}
  let configDoc=target;if(!configDoc)try{configDoc=styleConfigDoc(doc);}catch(error){fail(error);return;}
  const config=JSON.parse(configDoc.text),configured=configStyles(config),styles=resolveStyles(configured),id=selected&&styles[selected]?selected:'',style=id?styles[id]:{label:'',block:true},global=documentPath(configDoc)===GLOBAL_VELA_PATH;
  const choice=(name,values,current,empty)=>`<select name="${name}"><option value="">${empty}</option>${values.map(value=>`<option value="${value}"${current===value?' selected':''}>${t(STYLE_LABELS[name][value])}</option>`).join('')}</select>`;
  openModal(t('管理样式'),`<label>${t('样式')}<select name="pick"><option value="">${t('新建样式…')}</option>${Object.entries(styles).map(([key,value])=>`<option value="${esc(key)}"${key===id?' selected':''}>${esc(configured[key]?value.label:t(value.label))}${configured[key]?'':BUILTIN_STYLES[key]?t('（内置）'):''}</option>`).join('')}</select></label>
    ${id?'':`<label>${t('样式 ID')}<input name="id" required maxlength="32" pattern="[a-z][a-z0-9-]{0,31}" placeholder="${t('例如 whisper')}"><small>${t('小写字母开头，可含数字和连字符，保存后不能修改。')}</small></label>`}<label>${t('名称')}<input name="label" required maxlength="32" value="${esc(style.label||'')}"></label>
    <label>${t('常用于')}<select name="block"><option value="block"${paragraphStyle(style)?' selected':''}>${t('整段')}</option><option value="inline"${paragraphStyle(style)?'':' selected'}>${t('选中文字')}</option></select><small>${t('样式都可用于整段或选中的字，这里只决定样式面板默认的作用范围。')}</small></label>
    <label>${say(`对齐（仅整段）${choice('align',STYLE_FIELDS.align,style.align,t('默认'))}`,`Alignment (paragraph only)${choice('align',STYLE_FIELDS.align,style.align,t('默认'))}`)}</label>
    <label>${t('缩进（仅整段）')}<select name="indent"><option value="">${t('默认')}</option><option value="0"${style.indent===0?' selected':''}>${t('无缩进')}</option><option value="2"${style.indent===2?' selected':''}>${t('整段缩进两字')}</option></select></label>
    <label>${say(`字体${choice('font',STYLE_FIELDS.font,style.font,t('默认'))}`,`Font${choice('font',STYLE_FIELDS.font,style.font,t('默认'))}`)}</label>
    <label>${say(`字号${choice('size',STYLE_FIELDS.size,style.size,t('默认'))}`,`Font size${choice('size',STYLE_FIELDS.size,style.size,t('默认'))}`)}</label>
    <label>${say(`颜色${choice('color',STYLE_FIELDS.color,style.color,t('默认'))}`,`Colour${choice('color',STYLE_FIELDS.color,style.color,t('默认'))}`)}</label>
    <label class="checkbox"><input type="checkbox" name="bold"${style.bold?' checked':''}>${t('加粗')}</label>
    <label class="checkbox"><input type="checkbox" name="frame"${style.frame?' checked':''}>${t('边框')}</label>
    ${id&&(configured[id]||!BUILTIN_STYLES[id])?`<p><button type="button" class="danger" id="delete-style">${BUILTIN_STYLES[id]?t('恢复内置设置'):t('删除样式')}</button></p>`:''}<small>${say(`保存到${global?t('全局配置（.global.vela）'):t('作品配置（.vela）')}，配置升为第三版。已用此样式的文字会立即更新；删除样式后，这些文字保留标记但不再显示样式。`,`Save to ${global?t('全局配置（.global.vela）'):t('作品配置（.vela）')} and upgrade the configuration to version 3. Text using this style updates immediately. Deleting the style keeps its markers but removes its appearance.`)}</small>`,form=>{
    const key=id||form.get('id').trim(),block=form.get('block')==='block',next={label:form.get('label').trim(),block};
    for(const name of ['font','size','color'])if(form.get(name))next[name]=form.get(name);
    if(form.has('bold'))next.bold=true;
    if(form.get('align'))next.align=form.get('align');
    if(form.get('indent')!=='')next.indent=Number(form.get('indent'));
    if(form.has('frame'))next.frame=true;
    // 0.9.7 accepts alignment, indent and frames only on paragraph styles.
    if(next.align||next.indent!==undefined||next.frame)next.block=true;
    if(!id&&styles[key])throw Error(t('已有此 ID 的样式。'));
    writeStyles(configDoc,{...configured,[key]:next});
    toast(say(`样式“${next.label}”已保存`,`Style “${next.label}” saved`));
  },{label:t('保存样式')});
  $('#dialog-body [name=pick]').onchange=event=>{closeModal();showStyleManager(event.target.value,target);};
  const remove=$('#delete-style');if(remove)remove.onclick=()=>{const next={...configured};delete next[id];writeStyles(configDoc,next);closeModal();toast(BUILTIN_STYLES[id]?t('已恢复内置样式'):t('样式已删除'));};
}
function writeStyles(configDoc,styles){
  // Styles belong to the formatting part of .vela (richText.styles); 0.9.7 top-level styles move there.
  validateStyles(styles);const config=JSON.parse(configDoc.text);config.version=3;delete config.styles;config.richText={...config.richText};if(Object.keys(styles).length)config.richText.styles=styles;else delete config.richText.styles;if(!Object.keys(config.richText).length)delete config.richText;
  const text=velaText(config);if(text!==configDoc.text){documents.change(configDoc,text,[],{important:true});editorStates.delete(configDoc.id);}
  save();refreshFormatEnvironment();renderFormatTools();
}
function showFormatReview(){
  const value=view&&formatsOf(view.state);if(!value?.review.length){toast(t('没有待确认的格式。'));return;}const names={strong:t('粗体'),emphasis:t('着重号'),align:t('对齐')};
  openModal(t('格式待确认'),`<p>${t('正文在文舟外改动后，下面的格式找不到原来的文字。在正文中选中正确的文字后点“应用到选区”，或删除。')}</p>
    ${value.review.map(item=>`<div class="trash-row"><span>${esc(names[item.type]||item.type)}${say('：',': ')}${esc((item.quote||'').slice(0,40))}<small>${esc(item.reason||'')}</small></span><button type="button" class="secondary" data-apply="${esc(item.id)}">${t('应用到选区')}</button><button type="button" class="danger" data-drop="${esc(item.id)}">${t('删除')}</button></div>`).join('')}<p><button type="button" class="danger" id="drop-all-review">${t('全部删除')}</button></p>`,null,{noSubmit:true});
  const settle=(id,apply)=>{
    try{settleReview(view,id,{apply});closeModal();renderFormatTools();if(!apply&&formatsOf(view.state).review.length)showFormatReview();}catch(error){$('#dialog-error').textContent=t(error.message);}
  };
  $('#dialog-body').querySelectorAll('[data-apply]').forEach(button=>button.onclick=()=>settle(button.dataset.apply,true));
  $('#dialog-body').querySelectorAll('[data-drop]').forEach(button=>button.onclick=()=>settle(button.dataset.drop,false));
  $('#drop-all-review').onclick=()=>{for(const item of [...formatsOf(view.state).review])settleReview(view,item.id);closeModal();renderFormatTools();};
}
// Line numbers help code but not novel paragraphs, which wrap over many lines; TXT in novel mode hides them unless asked.
const gutterExtensions=doc=>documentKind(doc)==='TXT'&&projectConfig(workspace,doc)?.config?.editor?.mode!=='code'&&!workspace.settings.novelLineNumbers?[]:[lineNumbers(),highlightActiveLineGutter()];
function refreshGutters(){
  for(const [id,state] of editorStates){const doc=workspace.documents.find(item=>item.id===id);if(doc)editorStates.set(id,state.update({effects:gutters.reconfigure(gutterExtensions(doc))}).state);}
  if(view&&current())view.dispatch({effects:gutters.reconfigure(gutterExtensions(current()))});
}
function sourceRenderExtensions(doc){
  const editor=projectConfig(workspace,doc)?.config?.editor;
  return [
    outlineMarkers(()=>projectConfig(workspace,doc)?.config?.formats?.outline?.showEditorMarkers===false?[]:documents?.outlineAnchors.entries(doc)||[],openOutlineMarkers),
    gutters.of(gutterExtensions(doc)),
    languages.of(languageFor(doc)),
    syntaxHighlighting(defaultHighlightStyle),
    editor?.wrap===false?[]:indentedLineWrapping('same')
  ];
}
function makeState(doc){
  const editor=projectConfig(workspace,doc)?.config?.editor,position=workspace.editorPositions?.[doc.id];
  const csvLineBreak=documentKind(doc)==='CSV'?'\n':null;
  return EditorState.create({doc:doc.text,selection:position?{anchor:Math.min(doc.text.length,position.anchor),head:Math.min(doc.text.length,position.head)}:undefined,extensions:[
    csvLineBreak?EditorState.lineSeparator.of(csvLineBreak):[],
    projectReadonly.of(EditorState.readOnly.of(projectLocked)),
    history(),
    sourceRendering.of(isPreview&&['OUTLINE','MAP'].includes(documentKind(doc))?[]:sourceRenderExtensions(doc)),
    documentKind(doc)==='TXT'?[richTextExtensions(loadFormats(doc)),formatEnv.of(formatEnvironment(doc))]:[],
    pluginExtras.of(plugins?.extensions()||[]),
    completer.of(editor?.completion===false
    ?[]
    :completionExtensions(doc,()=>({documents:workspace.documents,autoNouns:workspace.settings.autoNouns,highlightTerms:workspace.settings.highlightTerms,terms:glossaryTerms(workspace,doc),glossary:workspace.writingTools?.glossary||[],snippets:workspace.writingTools?.snippets||[],packages:(plugins?.records||[]).filter(record=>record.enabled).flatMap(record=>(record.texFiles||[]).map(file=>file.path))}))),
    keymap.of([
    {key:'Enter',run:v=>documentKind(doc)==='TXT'&&editor?.mode!=='code'?paragraphNewline(v):false,shift:v=>documentKind(doc)==='TXT'&&editor?.mode!=='code'?paragraphNewline(v):false},
    {key:'Tab',run:v=>editorIndent(v)},
    {key:'Shift-Tab',run:v=>editorIndent(v,true)},
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap
  ]),
    pluginKeys.of(keymap.of(plugins?.bindings()||[])),
    highlightActiveLine(),
    paragraphSelection(),
    highlightSelectionMatches(),
    editorSearch(),
    EditorView.theme({'.cm-content':{lineHeight:String(editor?.lineHeight||1.8),maxWidth:(editor?.maxWidth||1000)+'px',margin:'0 auto'}}),
    scrollPastEndCustom(.35),
    EditorView.contentAttributes.of({'aria-label':t('文稿正文'),'spellcheck':'false'}),
    EditorView.updateListener.of(update=>{
  if(update.docChanged){
      if(!planningPreview()&&(update.view.hasFocus||update.transactions.some(tr=>tr.isUserEvent('input')||tr.isUserEvent('delete')||tr.isUserEvent('undo')||tr.isUserEvent('redo'))))setSidebar('outline',false);
      const d=current();
      if(!d)return;
      const changes=[];
      update.changes.iterChanges((from,to,_a,_b,insert)=>changes.push({from,to,insert:insert.toString()}));
      documents.changeTree(d,update.state.doc,changes);
      if(documents.outlineAnchors.entries(d).length)queueMicrotask(()=>{
        if(view&&current()?.id===d.id)view.dispatch({effects:outlineMarksChanged.of(null)});
      });
      if(documentKind(d)!=='CSV'&&indexService&&indexSettings===JSON.stringify(projectWriter(workspace,d))&&indexService.update(update)){
        index=indexService.value;
        indexDoc=update.state.doc;
        outlineRevision='';
      }
      scheduleSave();
      projects?.changed('editor',[documentPath(d)]);
      plugins?.emit('file-content-changed',plugins.activeFile);
      if(!statsTimer)statsTimer=setTimeout(()=>{
        statsTimer=null;
        updateStats();
        if(document.body.classList.contains('show-library'))renderDocuments();
      },200);
    }
  if(!update.docChanged&&formatsOf(update.state)!==formatsOf(update.startState)){scheduleSave();renderFormatTools();}
  if(update.selectionSet){
      renderFormatTools();
      selectionMenu.changed();
      const range=update.state.selection.main;
      workspace.editorPositions={...workspace.editorPositions,[workspace.activeId]:{anchor:range.anchor,head:range.head}};
      if(!update.docChanged)updateStats();
    }
  if(update.docChanged&&isPreview&&documentKind(current())==='TEX')texPreview?.changed();
  if(update.docChanged||update.selectionSet){extensionContext.changed();$('#quick-undo').disabled=activeUndoDepth()===0;$('#quick-redo').disabled=activeRedoDepth()===0;}
})
  ]});
}
const documentTextInfo=textInfoCache(text=>Writer.countText(text));
let fileListRevision='';
function renderDocuments(){
  const query=$('#doc-search').value.toLowerCase();
  const allPaths=new Set(workspace.documents.map(documentPath));
  const docs=workspace.documents.filter(d=>!allPaths.has(sidecarTarget(documentPath(d)))&&(!query||documentPath(d).toLowerCase().includes(query)||documentTextInfo(d).includes(query)));
  $('#doc-count').textContent=workspace.documents.length;
  $('#selected-folder').textContent=selectedFolder;$('#file-sort').value=workspace.settings.filesSort||'name';$('#paste-file').disabled=!fileClipboard;
  reconcilePanel($('#document-tabs'),workspace.openIds.map(id=>workspace.documents.find(d=>d.id===id)).filter(Boolean).map(d=>`<div class="document-tab ${d.id===workspace.activeId?'active':''}"><button class="tab-open" role="tab" aria-selected="${d.id===workspace.activeId}" data-tab="${esc(d.id)}"><span class="file-kind">${(documentKind(d)==='OUTLINE'?'PCS':documentKind(d)==='MAP'?'VLMP':fileIcon(documentKind(d)))}</span><strong>${esc(d.name)}</strong><span class="tab-dirty">${d.id===workspace.activeId&&session.dirty?'●':''}</span></button><button class="tab-close" data-close="${esc(d.id)}" title="${say(`关闭 ${esc(d.name)} (Ctrl+W)`,`Close ${esc(d.name)} (Ctrl+W)`)}" aria-label="${say(`关闭 ${esc(d.name)}`,`Close ${esc(d.name)}`)}">×</button></div>`).join(''));
  const revision=JSON.stringify([workspace.storage?.id,workspace.folders,workspace.entries,workspace.settings.filesSort,workspace.settings.language,docs.map(doc=>[doc.id,doc.name,documentPath(doc),documentKind(doc),doc.updatedAt,doc.text.length,documentTextInfo(doc).count(),!!doc.remote,gitFileState(workspace,doc)])]);
  if(revision===fileListRevision){renderDocumentSelection();return;}fileListRevision=revision;
  if(workspace.storage?.id||workspace.folders?.length||workspace.entries?.length){reconcilePanel($('#doc-list'),folderTree(workspace,docs,esc,selectedFolder,workspace.settings.filesSort));renderTabDirty();return;}
  reconcilePanel($('#doc-list'),docs.map(d=>`<div class="doc-item ${d.id===workspace.activeId?'active':''}"><button class="doc-open" data-doc="${esc(d.id)}"><span class="doc-symbol">${fileIcon(documentKind(d))}</span><span class="doc-info"><strong>${esc(d.name)}<span class="git-file-state">${gitFileState(workspace,d)}</span></strong><small>${say(`${new Date(d.updatedAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} · ${documentTextInfo(d).count().toLocaleString()} 字${d.remote?' · Git':''}`,`${new Date(d.updatedAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} · ${documentTextInfo(d).count().toLocaleString()} characters${d.remote?' · Git':''}`)}</small></span></button><button class="doc-menu" data-menu="${esc(d.id)}" title="${t('文稿操作')}" aria-label="${say(`${esc(d.name)} 文稿操作`,`${esc(d.name)} document actions`)}">···</button></div>`).join('')||`<p class="blank">${t('没有找到文稿。')}</p>`);renderTabDirty();
}
function renderDocumentSelection(){
  const tabs=[...document.querySelectorAll('#document-tabs [data-tab]')];
  if(tabs.length!==workspace.openIds.length||tabs.some((button,i)=>button.dataset.tab!==workspace.openIds[i])){renderDocuments();return;}
  for(const button of document.querySelectorAll('[data-tab]')){
    const active=button.dataset.tab===workspace.activeId;
    button.setAttribute('aria-selected',String(active));
    button.closest('.document-tab').classList.toggle('active',active);
  }
  const selectedFile=$('#doc-list').querySelector(`[data-doc="${CSS.escape(workspace.activeId||'')}"]`)?.closest('.doc-item');
  for(const row of $('#doc-list').querySelectorAll('.doc-item.active'))if(row!==selectedFile)row.classList.remove('active');
  selectedFile?.classList.add('active');
  $('#selected-folder').textContent=selectedFolder;
  for(const summary of document.querySelectorAll('#doc-list summary[data-folder]'))summary.classList.toggle('selected-folder',summary.dataset.folder===selectedFolder);
  renderTabDirty();
}
/** Stores where the document was left (state: its editor state) in its .vela; true when the .vela changed. */
function rememberPosition(id,state){
  const doc=workspace?.documents.find(item=>item.id===id);if(!doc||!state||!documents||state.doc.toString()!==doc.text)return false;
  const update=positionUpdate(workspace,doc,positionEntry(doc.text,state.selection.main.head));if(!update)return false;
  documents.change(update.doc,update.text);refreshConfigState(update.doc);return true;
}
// Editor state keeps the caret but not the viewport offset; remember both across tab changes.
function rememberScroll(id){if(!view||!id)return;editorScrolls.set(id,{top:view.scrollDOM.scrollTop,left:view.scrollDOM.scrollLeft});while(editorScrolls.size>64)editorScrolls.delete(editorScrolls.keys().next().value);}
function restoreScroll(id){const saved=editorScrolls.get(id);if(!saved||!view)return;requestAnimationFrame(()=>{if(view&&current()?.id===id){view.scrollDOM.scrollTop=saved.top;view.scrollDOM.scrollLeft=saved.left;}});}
/** Opens a document at its stored position (only when no editor state of this session is reused). */
function restorePosition(doc){
  const value=readPosition(workspace,doc);
  if(!value||!view)return;
  const at=Math.min(positionOffset(doc.text,value),view.state.doc.length);
  view.dispatch({selection:{anchor:at},effects:EditorView.scrollIntoView(at,{y:'center'}),annotations:Transaction.addToHistory.of(false)});
}
function switchDocument(id){
  $('#start-page').viewSession?.dispose();
  if(!workspace.documents.some(d=>d.id===id))return;
  $('#preview').viewSession?.dispose();
  if(!mapNavigating&&current()?.id!==id)mapTrail=[];
  selectionMenu.hide();$('#preview').odfDispose?.();
  if(!workspace.documents.some(d=>d.id===id))return;
  if(view){
    editorStates.delete(workspace.activeId);
    editorStates.set(workspace.activeId,view.state);
    if(session.dirty&&!save())return;
    if(workspace.activeId!==id){rememberPosition(workspace.activeId,view.state);rememberScroll(workspace.activeId);}
    while(editorStates.size>8)editorStates.delete(editorStates.keys().next().value);
  }
  $('#preview').planningDispose?.();$('#preview').planningDispose=null;pluginUi.mountPlanning(null,null);
  const alreadyOpen=workspace.openIds.includes(id);if(!alreadyOpen)workspace.openIds.push(id);
  workspace.activeId=id;const doc=current();if(!doc)return;
  home=false;csvEditor?.reset();$('#start-page').hidden=true;isPreview=['CSV','VELA','GLY','VODT','PLUGIN','OUTLINE','MAP'].includes(documentKind(doc));
  // A file operation recreates the view; the kept state (undo history, formats) is reused while the text is unchanged.
  const kept=editorStates.get(id),reused=!!kept&&kept.doc.toString()===doc.text;if(view)view.setState(reused?kept:makeState(doc));else view=new EditorView({state:reused?kept:makeState(doc),parent:$('#editor')});if(!reused)restorePosition(doc);else restoreScroll(id);
  if(isPreview&&['OUTLINE','MAP'].includes(documentKind(doc))&&sourceRendering.get(view.state)?.length)view.dispatch({effects:sourceRendering.reconfigure([])});
  activateLanguage(doc);index=null;setFontSize(projectConfig(workspace,doc)?.config?.editor?.fontSize??workspace.settings.fontSize,false);$('#current-name').textContent=doc.name;
  updateEditorVisibility();if(alreadyOpen)renderDocumentSelection();else renderDocuments();updateStats();if(isPreview)renderPreview();scheduleWorkspaceSave();if(pageName!=='write'||document.body.dataset.page!=='write')showView('write');else sidebars.update();plugins?.emit('switch-file',plugins.activeFile);
}
function closeDocument(id){
  if(session.dirty&&!save())return;if(workspace.activeId!==id)rememberPosition(id,editorStates.get(id));
  const position=workspace.openIds.indexOf(id);if(position<0)return;
  workspace.openIds=workspace.openIds.filter(open=>open!==id);
  if(workspace.activeId===id){if(workspace.openIds.length)switchDocument(workspace.openIds[Math.min(position,workspace.openIds.length-1)]);else showHome();}else{renderDocuments();save();}
}
function updateGlossaryPanel(){
  const root=$('#glossary-panel');root.hidden=!workspace.settings.glossaryPanel||home||isPreview||!['TXT','MD'].includes(documentKind(current()));
  if(root.hidden){root.panelDispose?.();root.replaceChildren();root.glossaryTerms=null;return;}
  const terms=glossaryTerms(workspace,current());if(root.glossaryTerms===terms)return;root.glossaryTerms=terms;
  renderGlossaryPanel(root,terms,{escape:esc,onClose:()=>{
    workspace.settings.glossaryPanel=false;
    updateGlossaryPanel();
    save();
  },onOpen:path=>{
    const doc=workspace.documents.find(d=>documentPath(d)===path);
    if(doc)switchDocument(doc.id);
  }});
}
function updateEditorVisibility(){
  ui.editorContext(pageName,home);
  extensionContext.changed();
  document.body.classList.toggle('start-open',home&&pageName==='write');
  updateGlossaryPanel();
  const planning=planningPreview();
  document.body.dataset.planning=planning?documentKind(current()):'';
  const detail=$('#outline-toggle');
  if(planning){
    if(!detail.planningOriginal){
      detail.planningOriginal={html:detail.innerHTML,title:detail.title,label:detail.getAttribute('aria-label')};
      detail.innerHTML=icon('info');
    }
    detail.title=t('显示详情');
    detail.setAttribute('aria-label',t('显示详情'));
  }else if(!planning&&detail.planningOriginal){
    detail.innerHTML=detail.planningOriginal.html;
    detail.title=detail.planningOriginal.title;
    detail.setAttribute('aria-label',detail.planningOriginal.label);
    delete detail.planningOriginal;
  }
  renderDisplayOptions();const split=workspace.settings.splitPreview&&innerWidth>=1000&&isPreview&&!home&&!isComponentDocument(current());document.body.classList.toggle('split-preview',!!split);$('#markdown-tools').hidden=home||isPreview&&!split||documentKind(current())!=='MD';document.querySelectorAll('#markdown-tools button').forEach(button=>button.disabled=home||documentKind(current())!=='MD');$('#editor').hidden=home||isPreview&&!split;$('#preview').hidden=home||!isPreview;refreshFormatEnvironment();renderFormatTools();layoutShell();
  for(const id of ['search-editor','outline-toggle','focus-toggle','export-doc','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','append-chapter','locate-chapter','export-chapters'])$('#'+id).disabled=home;
  for(const id of ['search-editor','quick-top','quick-bottom','quick-chapter-top','quick-chapter-bottom','append-chapter','locate-chapter','export-chapters'])if(planning)$('#'+id).disabled=true;$('#add-glossary').disabled=home||isPreview||pageName!=='write';
  if(home){$('#quick-undo').disabled=true;$('#quick-redo').disabled=true;}
}
function renderDisplayOptions(){
  const doc=current();$('#display-options').hidden=home||!doc;if(!doc)return;
  const kind=documentKind(doc);$('#display-options').innerHTML=`<button data-format title="${t('选择文件类型')}">${kind==='OUTLINE'?'PCS':kind==='MAP'?'VLMP':kind==='MD'?'Markdown':kind==='TXT'?t('文本'):kind}</button><button data-display="source" title="${t('源码')}" aria-label="${t('源码')}" class="${!isPreview?'selected':''}">${icon('code')}</button><button data-display="preview" title="${t('预览')}" aria-label="${t('预览')}" class="${isPreview?'selected':''}">${icon('preview')}</button>${native&&kind==='HTML'&&isPreview?`<button data-native-html title="${t('在独立页面中调试 HTML')}" aria-label="${t('独立预览')}">${icon('external')}</button>`:''}`;
}
$('#display-options').onclick=e=>{
  if(e.target.closest('[data-native-html]')){openNativeHtml();return;}
  const mode=e.target.closest('[data-display]');
  if(mode){
    $('#preview').viewSession?.dispose();
    csvEditor?.dispose();
    $('#preview').odfDispose?.();
    if(mode.dataset.display==='source'&&['OUTLINE','MAP'].includes(documentKind(current()))&&view.state.doc.toString()!==current().text)view.setState(makeState(current()));
    $('#preview').planningDispose?.();
    $('#preview').planningDispose=null;
    pluginUi.mountPlanning(null,null);
    isPreview=mode.dataset.display==='preview';
    if(['OUTLINE','MAP'].includes(documentKind(current())))view.dispatch({effects:sourceRendering.reconfigure(isPreview?[]:sourceRenderExtensions(current()))});
    updateEditorVisibility();
    if(isPreview)renderPreview();else{
      activateLanguage(current());
      view.focus();
    }
  }
  if(e.target.closest('[data-format]')){
    const doc=current();
    openModal(t('文件类型'),`<label>${t('编辑格式')}<select name="kind">${[['',t('按扩展名识别')],['TXT',t('纯文本')],['MD','Markdown'],['HTML','HTML'],['CSV',t('CSV 表格')],['VELA',t('VELA 工作区配置')],['GLY',t('术语库')],['OUTLINE',t('大纲')],['MAP',t('地图')],['TEX','LaTeX'],['CODE',t('代码')]].map(([value,label])=>`<option value="${value}" ${value===(doc.kind||'')?'selected':''}>${label}</option>`).join('')}</select></label>`,f=>{
      doc.kind=f.get('kind')||undefined;
      isPreview=['CSV','VELA','GLY','VODT','PLUGIN','OUTLINE','MAP'].includes(documentKind(doc));
      refreshFileType(doc);
      save();
    });
  }
};
function showHome(){
  $('#preview').viewSession?.dispose();csvEditor?.dispose();
  if(view){
    if(session.dirty&&!save())return;
    $('#preview').planningDispose?.();
    $('#preview').planningDispose=null;
    pluginUi.mountPlanning(null,null);
    editorStates.set(workspace.activeId,view.state);
    rememberPosition(workspace.activeId,view.state);
    rememberScroll(workspace.activeId);
    view.destroy();
    view=null;
  }
  ui.close();selectionMenu.hide();$('#preview').planningDispose?.();$('#preview').planningDispose=null;pluginUi.mountPlanning(null,null);$('#preview').odfDispose?.();document.body.classList.remove('focus');
  workspace.activeId=null;home=true;isPreview=false;index=null;$('#current-name').textContent=t('启动页');$('#start-page').hidden=false;$('#start-page').dataset.panel='actions';updateEditorVisibility();renderHome();renderDocuments();updateStats();showView('write');setSidebar('outline',false);save();plugins?.emit('switch-file',null);
}
function renderHome(){
  $('#current-name').textContent=t('启动页');
  const mounted=beginViewSession($('#start-page'));
  const files=workspace.documents.filter(d=>documentKind(d)!=='VELA'),projects=workspace.documents.filter(d=>documentKind(d)==='VELA'&&documentPath(d)!==GLOBAL_VELA_PATH),recent=[...workspace.documents].sort((a,b)=>b.updatedAt-a.updatedAt);
  const panel=$('#start-page').dataset.panel||'actions';
  const recentItem=d=>`<button data-recent="${esc(d.id)}"><span class="file-kind">${fileIcon(documentKind(d))}</span><div><strong data-user-content>${esc(d.name)}</strong><small data-user-content>${esc(parentPath(documentPath(d))||t('内部文件夹'))} · ${new Date(d.updatedAt).toLocaleDateString(workspace.settings.language==='en'?'en':'zh-CN')}</small></div></button>`;
  $('#start-page').innerHTML=startPageMarkup({files:files.length,projects:projects.length,reading:files.filter(readable).length,recentMarkup:''});
  mountIncrementalList($('#start-page .recent-files'),{items:recent,renderItem:recentItem,signal:mounted.signal,empty:t('暂无本地文件')});
  setStartPanel($('#start-page'),panel,{focus:false});
}
$('#start-page').onclick=async e=>{
  const recent=e.target.closest('[data-recent]');if(recent){switchDocument(recent.dataset.recent);return;}
  const action=e.target.closest('[data-start]');if(!action)return;
  const name=action.dataset.start;
  if(name==='recent'||name==='back'){setStartPanel($('#start-page'),name==='recent'?'recent':'actions');return;}
  if(name==='guide'){
    const target=workspace,find=()=>target.documents.find(d=>/^操作指南\.(txt|md)$/i.test(d.name)); // i18n-data: the guide's file name
    const existing=find();if(existing){switchDocument(existing.id);return;}
    action.disabled=true;
    try{
      const {guide}=await loadGuide();if(workspace!==target)return;
      const existing=find();
      if(existing)switchDocument(existing.id);else addDocument(newDocument('操作指南.md',guide)); // i18n-data: the guide's file name
    }catch(error){fail(error);}finally{action.disabled=false;}
  }
  else runAction(name);
};
$('#home-button').onclick=showHome;
/**
 * In the TXT and Markdown previews, chapter and position jumps scroll the preview instead of switching back to the
 * source. The editor cursor follows, so the chapter in the status bar and chapter-relative jumps stay right.
 */
function previewJump(position){
  const kind=documentKind(current()),root=$('#preview');if(!isPreview||!['TXT','MD'].includes(kind)||root.hidden)return false;
  const top=root.getBoundingClientRect().top;let target=null;
  if(position<=0)root.scrollTop=0;
  else if(position>=view.state.doc.length)root.scrollTop=root.scrollHeight;
  else if(kind==='TXT'){
    const point=textPoint(root,position);
    if(point){
      const range=document.createRange();
      range.setStart(point.node,point.offset);
      range.collapse(true);
      const rect=range.getClientRects()[0];
      target=rect?.height?rect:point.node.parentElement?.getBoundingClientRect();
    }
  }
  else{
    // Markdown renders differently from its source: find the heading or paragraph with the line's text, else scroll in proportion.
    const line=view.state.doc.lineAt(position),title=line.text.replace(/^\s*#{1,6}\s+/,'').replace(/\s+#+\s*$/,'').trim(),blocks=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')];
    const element=title&&(blocks.find(item=>item.textContent.trim()===title)||blocks.find(item=>item.textContent.trim().startsWith(title.slice(0,40))));
    if(element)target=element.getBoundingClientRect();else root.scrollTop=(root.scrollHeight-root.clientHeight)*(line.number-1)/Math.max(1,view.state.doc.lines-1);
  }
  if(target)root.scrollTop+=target.top-top-16;
  view.dispatch({selection:{anchor:position}});updateStats();return true;
}
function jump(position){if(!view)return;if(isPreview&&previewJump(position))return;if(isPreview)togglePreview();view.dispatch({selection:{anchor:position},scrollIntoView:true});view.focus();updateStats();}
async function jumpOutlineAnchor(node){
 const anchors=node.anchors||[];if(!anchors.length){
    toast(t('此节点尚未链接正文。'));
    return;
  }const go=async anchor=>{
    await hydratePlanningDocuments({paths:[anchor.path]});
    const target=workspace.documents.find(d=>documentPath(d)===anchor.path);
    if(!target){anchor.invalid=true;anchor.needsReview=true;documents.outlineAnchors.mark(anchor);documents.flushOutlineAnchors();save();renderPreview();toast(t('文件不存在'));return;}
    const resolved=documents.outlineAnchors.locate(target,anchor);
    documents.flushOutlineAnchors();
    save();
    if(resolved.needsReview){renderPreview();toast(t('待确认锚点'));return;}
    switchDocument(target.id);
    isPreview=false;
    updateEditorVisibility();
    view.dispatch({selection:{anchor:resolved.offset,head:resolved.end},scrollIntoView:true});
    view.focus();
    view.dom.classList.add('outline-anchor-flash');
    setTimeout(()=>view?.dom.classList.remove('outline-anchor-flash'),1000);
  };
 if(anchors.length===1)return go(anchors[0]);openModal(t('选择正文锚点'),`<label>${t('锚点')}<select name="anchor">${anchors.map((a,i)=>`<option value="${i}">${esc(a.label||a.path)}</option>`).join('')}</select></label>`,f=>go(anchors[Number(f.get('anchor'))]));
}
function openOutlineMarkers(entries){
  const go=async entry=>{
    const doc=workspace.documents.find(d=>d.id===entry.outlineId);
    if(!doc)return;
    const module=await loadOutlineView();
    module.selectOutlineNode(doc.id,entry.nodeId,entry.collection);
    switchDocument(doc.id);
  };
  if(entries.length===1)return go(entries[0]).catch(fail);
  openModal(t('链接的大纲节点'),`<label>${t('节点')}<select name="node">${entries.map((e,i)=>`<option value="${i}">${esc(e.title)}</option>`).join('')}</select></label>`,f=>go(entries[Number(f.get('node'))]));
}
function linkOutlineSelection(){
 const source=current();if(!view||!source||!['TXT','MD','TEX'].includes(documentKind(source)))return;const text=view.state.doc.toString(),range=view.state.selection.main,line=view.state.doc.lineAt(range.head),from=range.empty?line.from:range.from,to=range.empty?line.to:range.to;if(from===to)return;
 const sources=workspace.documents.filter(d=>documentKind(d)==='OUTLINE').flatMap(doc=>{
    try{const value=documents.outlineAnchors.open(doc);return [{doc,value,collection:'outline'}].filter(item=>Object.keys(item.value.nodes).length);}catch{return [];}
  });if(!sources.length){
    toast(t('请先在大纲中添加节点。'));
    return;
  }
 openModal(t('链接到大纲节点…'),`<label>${t('大纲文件')}<select name="outline">${sources.map((s,i)=>`<option value="${i}">${esc(documentPath(s.doc)+(s.collection==='relations'?' · '+t('关系'):''))}</option>`).join('')}</select></label><label>${t('节点')}<select name="node"></select></label><label>${t('锚点名称')}<input name="label" value="${esc(text.slice(from,to).slice(0,32))}"></label>`,f=>{
    if(source.text!==text)throw Error(t('文稿已变化，请重新选择。'));
    const item=sources[Number(f.get('outline'))],node=item.value.nodes[f.get('node')];
    node.anchors||=[];
    node.anchors.push({id:'a-'+crypto.randomUUID(),path:documentPath(source),offset:from,end:to,quote:text.slice(from,to),prefix:text.slice(Math.max(0,from-32),from),label:f.get('label')});
    const output=documents.outlineAnchors.text(item.doc);
    documents.change(item.doc,output);
    documents.outlineAnchors.accept(item.doc,output);
    editorStates.delete(item.doc.id);
    save();
    view?.dispatch({effects:outlineMarksChanged.of(null)});
  });
 const select=$('#dialog-body [name=outline]'),nodes=$('#dialog-body [name=node]'),refresh=()=>nodes.innerHTML=Object.entries(sources[Number(select.value)].value.nodes).map(([id,n])=>`<option value="${esc(id)}">${esc(n.title)}</option>`).join('');select.onchange=refresh;refresh();
}
let previewRevision=0;
async function renderPreview(){const revision=++previewRevision;$('#preview').viewSession?.dispose();csvEditor?.dispose();
  $('#preview').odfDispose?.();
  $('#preview').planningDispose?.();$('#preview').planningDispose=null;pluginUi.mountPlanning(null,null);
  $('#preview').classList.toggle('velaodt-preview',documentKind(current())==='VODT');
  if(isComponentDocument(current())){
    const doc=current();
    renderComponentDocument({root:$('#preview'),doc,manage:showPlugins,exportText,exportBinary,onChange:text=>{
      if(projectLocked||current()!==doc||!isPreview)throw Error(t('请先打开当前文稿再编辑。'));
      view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.richtext'});
    },onCopy:text=>{
      // i18n-data: file names, matching text and editable defaults stay as written
      const dot=doc.name.lastIndexOf('.'),copy=newDocument(doc.name.slice(0,dot)+'-可编辑副本'+doc.name.slice(dot),text);
      if(documentKind(doc)==='PLUGIN'){
        copy.kind='PLUGIN';
        copy.formatId=doc.formatId;
      }
      return addDocument(copy);
    },onError:fail,onGlossary:addSelectionToGlossary});
    return;
  }

  if(documentKind(current())!=='TEX')texPreview?.dispose();
  $('#preview').className='markdown';
  if(documentKind(current())==='VELA'){renderVela();return;}
  const previewDoc=current();
  if((['MD','OUTLINE','MAP'].includes(documentKind(previewDoc))&&!md)||(documentKind(previewDoc)==='GLY'&&!glossaryView)||(documentKind(previewDoc)==='HTML'&&!native&&!htmlPreview)){
    chunkLoading($('#preview'));
    try{
      if(['MD','OUTLINE','MAP'].includes(documentKind(previewDoc)))await ensureMarkdown();
      else if(documentKind(previewDoc)==='GLY')glossaryView=await loadGlossaryView();
      else ({htmlPreview}=await loadHtmlPreview());
    }catch(error){if(revision===previewRevision&&current()===previewDoc&&isPreview)chunkFailure($('#preview'),error,renderPreview);return;}
    if(revision!==previewRevision||current()!==previewDoc||!isPreview)return;
  }
  if(['OUTLINE','MAP'].includes(documentKind(current()))){
    const doc=current(),loader=documentKind(doc)==='OUTLINE'?loadOutlineView:loadMapView;
    chunkLoading($('#preview'));
    loader().then(module=>{
      if(current()!==doc||!isPreview||revision!==previewRevision)return;
      $('#preview').planningDispose?.();
      pluginUi.mountPlanning(null,null);
      (module.renderOutline||module.renderMap)({root:$('#preview'),doc,escape:esc,uiHost:pluginUi,files:[...workspace.documents.map(d=>({path:documentPath(d),name:d.name,kind:documentKind(d)})),...(workspace.entries||[]).filter(e=>!e.directory&&!workspace.documents.some(d=>documentPath(d)===e.path)).map(e=>({path:e.path,name:basename(e.path),kind:fileKind(e.path)}))],writeLinkedText:async(path,text,expected)=>{
        const linked=workspace.documents.find(d=>documentPath(d)===path);
        if(!linked||linked.text!==expected)throw Error(t('文稿已变化，请重新选择。'));
        documents.change(linked,text);
        editorStates.delete(linked.id);
        if(!save())throw Error(t('保存失败'));
      },readLinkedText:async path=>{
        await hydratePlanningDocuments({paths:[path]});
        return workspace.documents.find(d=>documentPath(d)===path)?.text;
      },onOpenGlossary:async(path,entry)=>{
        await hydratePlanningDocuments({paths:[path]});
        const target=workspace.documents.find(d=>documentPath(d)===path);
        if(!target)throw Error(t('文件不存在'));
        const {selectGlossaryEntry}=await loadGlossaryView();
        selectGlossaryEntry(target.id,entry);
        switchDocument(target.id);
      },getLinkInfo:async path=>{
        await hydratePlanningDocuments({paths:[path]});
        const linked=workspace.documents.find(d=>documentPath(d)===path);
        if(!linked)return null;
        if(documentKind(linked)==='MAP'){
          const value=module.parseMap(linked.text);
          return {name:value.name||linked.name,summary:value.info?.summary||''};
        }
        return {name:linked.name,summary:linked.text.slice(0,180)};
      },config:projectConfig(workspace,doc)?.config?.formats,getAnchorValue:()=>documentKind(doc)==='OUTLINE'?documents.outlineAnchors.open(doc):null,onJump:node=>jumpOutlineAnchor(node).catch(fail),onHistoryChange:()=>{
        updateStats();
        extensionContext.changed();
      },onContextChange:()=>extensionContext.changed(),onInfoDirectory:()=>mapDirectory.showDirectory(),onInfoLabels:()=>mapDirectory.showLabels(),nodeDrafts:workspace.outlineNodeDrafts||=( {} ),onDraftChange:()=>save(),onSave:async text=>{
        if(current()!==doc||projectLocked)throw Error(t('请先保存当前文稿。'));
        view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.planning'});
        if(documentKind(doc)==='OUTLINE')documents.outlineAnchors.accept(doc,text);
        if(!save())throw Error(t('保存失败'));
      },onBack:mapTrail.length?mapBack:null,breadcrumbs:mapTrail.map(id=>workspace.documents.find(d=>d.id===id)?.name||''),exportText,exportBinary,onOpen:async path=>{
        await hydratePlanningDocuments({paths:[path]});
        if(current()!==doc)return;
        const target=workspace.documents.find(d=>documentPath(d)===path);
        if(target){
          if(target.id===doc.id){
            toast(t('已在当前文件'));
            return;
          }
          const previousTrail=mapTrail.slice();
          if(documentKind(doc)==='MAP'&&documentKind(target)==='MAP'){
            mapTrail.push(doc.id);
            mapNavigating=true;
          }
          try{
            switchDocument(target.id);
            if(current()?.id!==target.id)mapTrail=previousTrail;
          }catch(error){
            mapTrail=previousTrail;
            throw error;
          }finally{
            mapNavigating=false;
          }
        }else toast(t('文件不存在'));
      },markdown:text=>sanitize(md.render(text)),notify:toast});
    }).catch(error=>{
      if(revision===previewRevision&&current()===doc&&isPreview)chunkFailure($('#preview'),error,renderPreview);
    });
    return;
  }
  if(documentKind(current())==='GLY'){
    const doc=current();
    const {renderGlossary}=glossaryView;
    let expected=doc.text;
    renderGlossary({root:$('#preview'),doc,escape:esc,onCopy:copyText,notify:toast,onSave:text=>{
      if(text===expected)return;
      if(projectLocked||!workspace.documents.includes(doc)||doc.text!==expected)throw Error(t('文稿已变化，请重新预览。'));
      if(current()===doc&&view)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.glossary'});else{
        const kept=editorStates.get(doc.id);
        if(kept)editorStates.set(doc.id,kept.update({changes:{from:0,to:kept.doc.length,insert:text},userEvent:'input.glossary'}).state);
        documents.change(doc,text,[],{important:true});
      }
      expected=text;
      if(!save())throw Error(t('保存失败'));
    }});
    return;
  }
  const kind=documentKind(current()),text=view.state.doc.toString();$('#preview').classList.toggle('plain-preview',kind==='TXT');$('#preview').classList.toggle('csv-preview',kind==='CSV');$('#preview').classList.toggle('html-preview',kind==='HTML');
  if(kind==='CSV'){
    const doc=current();
    if(csvEditor)csvEditor.render();
    else import('./csv-editor.mjs').then(({CsvEditor})=>{
      if(!isPreview||current()!==doc||revision!==previewRevision)return;
      csvEditor=new CsvEditor({root:$('#preview'),doc:current,source:()=>view.state.doc.toString(),
        readOnly:()=>projectLocked||view.state.readOnly,escape:esc,openModal,save:scheduleWorkspaceSave,fail,language:()=>workspace.settings.language,
        sourceMode:offset=>{
        if(isPreview)togglePreview();
        if(Number.isInteger(offset))view.dispatch({selection:{anchor:Math.min(offset,view.state.doc.length)},scrollIntoView:true});
        view.focus();
      },undo:()=>{
        undo(view);
        csvEditor.render();
      },redo:()=>{
        redo(view);
        csvEditor.render();
      },change:changes=>{
        if(changes.length)view.dispatch({changes,userEvent:'input.csv'});
        updateStats();
      }});
      csvEditor.render();
    }).catch(fail);
    return;
  }
  if(kind==='HTML'){
    const frame=document.createElement('iframe');frame.title=t('HTML 文件预览');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');$('#preview').replaceChildren(frame);
    if(native){
      if(!save()){frame.remove();return;}
      transport('previewHtml',{path:documentPath(current()),embedded:true,dark:workspace.settings.dark,fontSize:textFontSize}).then(src=>{
        if(!frame.isConnected||!isPreview)return;
        const url=new URL(src);if(url.origin!=='https://wenzhou-preview.local')throw new Error(t('HTML 预览地址无效。'));frame.src=url.href;
      }).catch(error=>{if(frame.isConnected){frame.remove();$('#preview').textContent=t(error.message);}});
    }else frame.srcdoc=htmlPreview(text,{dark:workspace.settings.dark,fontSize:textFontSize});return;
  }
  if(kind==='TEX'){
    const doc=current();
    if(texPreview){texPreview.mount($('#preview'),doc);return;}
    ensureTexPreview().then(preview=>{if(current()?.id===doc.id)preview.mount($('#preview'),doc);}).catch(error=>{if(current()?.id===doc.id)chunkFailure($('#preview'),error,()=>renderPreview());});
    return;
  }if(kind==='TXT'){
    const doc=current();
    renderPlainChapters($('#preview'),text,ensureIndex().sections,{formats:formatsOf(view.state)?.entries||[],styles:stylesFor(doc),loadImage:imageLoaderFor(doc),loadTable:tableLoaderFor(doc)});
    invalidateTextIndex($('#preview'));
    return;
  }
  if(['TXT','CODE'].includes(kind)){
    $('#preview').textContent=text;
    if(kind==='CODE'){
      const pre=document.createElement('pre'),code=document.createElement('code');
      code.textContent=text;
      pre.append(code);
      $('#preview').replaceChildren(pre);
      highlightCode(code,text,current().name).catch(fail);
    }
    return;
  }
  $('#preview').innerHTML=sanitize(md.render(text,{path:documentPath(current())}),{FORBID_TAGS:['iframe','form','input','button','video','audio','style'],FORBID_ATTR:['style']});
  highlightMarkdown($('#preview'));
  if(native&&workspace.storage?.id)for(const placeholder of [...$('#preview').querySelectorAll('[data-workspace-image]')].slice(0,20)){
    transport('readWorkspaceAsset',{path:placeholder.dataset.workspaceImage}).then(src=>{
      if(!placeholder.isConnected)return;
      const img=document.createElement('img');
      img.alt=placeholder.textContent;
      img.src=src;
      placeholder.replaceWith(img);
    }).catch(error=>{
      if(placeholder.isConnected)placeholder.title=error.message;
    });
  }
}
async function openNativeHtml(){
  if(!save())return;
  try{await transport('previewHtml',{path:documentPath(current()),dark:workspace.settings.dark,language:workspace.settings.language,fontSize:textFontSize});}catch(error){fail(error);}
}
function togglePreview(){
  if(!current()||!view)return;
  $('#preview').viewSession?.dispose();
  csvEditor?.dispose();
  $('#preview').odfDispose?.();
  $('#preview').planningDispose?.();
  $('#preview').planningDispose=null;
  pluginUi.mountPlanning(null,null);
  if(isPreview&&['OUTLINE','MAP'].includes(documentKind(current()))&&view.state.doc.toString()!==current().text)view.setState(makeState(current()));
  isPreview=!isPreview;
  updateEditorVisibility();
  if(isPreview)renderPreview();else view.focus();
}
for(const [id,mark] of [['md-bold','**'],['md-italic','*'],['md-strike','~~'],['md-code','`']])$('#'+id).onclick=()=>inlineMarkup(view,mark);
for(const [id,prefix] of [['md-heading','# '],['md-list','- '],['md-task','- [ ] '],['md-quote','> ']])$('#'+id).onclick=()=>lineMarkup(view,prefix);
$('#markdown-tools').addEventListener('mousedown',e=>e.preventDefault());
$('#format-tools').addEventListener('mousedown',e=>{if(!e.target.closest('select'))e.preventDefault();});
// Toolbar faces: letter glyphs for type styles, line icons for the rest; names and shortcuts are in aria-label/title.
for(const [id,name] of [
  ['md-bold','bold'],
  ['md-italic','italic'],
  ['md-strike','strike'],
  ['md-code','code'],
  ['md-heading','heading'],
  ['md-list','listBullet'],
  ['md-task','listTask'],
  ['md-quote','blockQuote'],
  ['format-strong','bold'],
  ['format-emphasis','emphasis'],
  ['format-center','alignCenter'],
  ['format-right','alignRight'],
  ['format-clear','clearFormat'],
  ['format-ruby','ruby'],
  ['format-image','image'],
  ['format-table','table']
])$('#'+id).innerHTML=icon(name);
for(const button of document.querySelectorAll('#markdown-tools button,#format-tools button'))if(!button.title&&button.getAttribute('aria-label'))button.title=button.getAttribute('aria-label');
function layoutShell() {
  layoutAppShell(document, innerWidth, !!home);
}
const formatCommand=run=>()=>{if(!view||!richTextEnabled(current())||formatBlocked())return;if(run(view)===false)toast(t('请先选中要设置格式的文字。'));renderFormatTools();view.focus();};
$('#format-strong').onclick=formatCommand(v=>toggleInline(v,'strong'));
$('#format-emphasis').onclick=formatCommand(v=>toggleInline(v,'emphasis'));
$('#format-center').onclick=formatCommand(v=>toggleAlign(v,'center'));
$('#format-right').onclick=formatCommand(v=>toggleAlign(v,'right'));
$('#format-clear').onclick=formatCommand(v=>{if(clearFormats(v)===null)toast(v.state.selection.main.empty?t('光标所在段落没有格式可清除。'):t('选中的文字没有格式可清除。'));});
$('#format-review').onclick=()=>showFormatReview();
$('#format-style .format-style-icon').innerHTML=icon('style');$('#format-style .format-style-caret').innerHTML=icon('chevronDown');
$('#format-ruby').onclick=()=>showRubyDialog();
$('#format-image').onclick=()=>showImageDialog();
$('#format-table').onclick=()=>showTableDialog();
$('#editor').addEventListener('vela-table-settings',event=>showTableDialog(event.detail.id));
$('#editor').addEventListener('click',e=>{const figure=e.target.closest('.vela-format-image');if(figure&&view)showImageDialog(figure.dataset.formatImage);});
$('#preview').addEventListener('click',e=>{if(e.target.closest('a')){e.preventDefault();toast(t('阅读预览中的外部链接不在应用内打开。'));}});
function openModal(title,html,submit,options={}){
  if(!$('#dialog').open){const origin=document.activeElement;dialogReturnFocus=origin?.closest('#toolbar-overflow')?ui.toggle:origin;}
  ui.close();const mounted=beginViewSession($('#dialog-body'));$('#dialog-body').trashDispose?.();$('#dialog').classList.remove('settings-dialog','trash-dialog');
  dialogVersion++;
  if($('#dialog').open)$('#dialog').close();
  $('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$('#dialog-error').textContent='';$('#dialog').removeAttribute('aria-describedby');dialogSubmitLabel=options.label||t('确定');$('#dialog-submit').hidden=options.noSubmit||false;$('#dialog-submit').classList.toggle('destructive',!!options.destructive);$('#dialog-cancel').textContent=options.noSubmit&&!options.cancel?t('关闭'):t('取消');
  dialogHandler=submit;dialogCancel=options.cancel||null;setDialogBusy(false);$('#dialog').showModal();return mounted;
}
function setDialogBusy(busy){
  dialogBusy=busy;
  $('#dialog').setAttribute('aria-busy',String(busy));
  if(busy){
    dialogDisabledFields=[...$('#dialog-body').querySelectorAll('input,select,textarea')].map(field=>({field,disabled:field.disabled}));
    for(const {field} of dialogDisabledFields)field.disabled=true;
  }else{
    for(const {field,disabled} of dialogDisabledFields)if(field.isConnected)field.disabled=disabled;
    dialogDisabledFields=[];
  }
  for(const id of ['dialog-submit','dialog-close','dialog-cancel'])$('#'+id).disabled=busy;
  $('#dialog-submit').textContent=busy?t('正在处理…'):t(dialogSubmitLabel);
}
function closeModal(){if(dialogBusy)return;dialogCancel?.();dialogCancel=null;$('#dialog').close();}
$('#dialog-close').innerHTML=icon('close');$('#dialog-close').onclick=closeModal;$('#dialog-cancel').onclick=closeModal;
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('#dialog').addEventListener('close',()=>{
  if($('#dialog').open)return;
  $('#dialog-body').viewSession?.dispose();
  $('#dialog-body').trashDispose?.();
  const active=document.activeElement;
  if(!active||active===document.body||active.closest('#dialog')||!active.getClientRects().length){
    const target=dialogReturnFocus?.isConnected&&!dialogReturnFocus.disabled&&!dialogReturnFocus.closest('[inert],[hidden]')&&dialogReturnFocus.getClientRects().length
      ?dialogReturnFocus
      :document.querySelector('#editor:not([hidden]) .cm-content')||ui.toggle;
    target?.focus({preventScroll:true});
  }
  dialogReturnFocus=null;
});
$('#dialog-form').addEventListener('invalid',e=>{e.target.scrollIntoView({block:'nearest'});},true);
$('#dialog-form').onsubmit=async e=>{
  e.preventDefault();
  if(dialogBusy)return;
  const version=dialogVersion,data=new FormData(e.target),focused=document.activeElement;
  let failed=false;
  $('#dialog-error').textContent='';
  $('#dialog').removeAttribute('aria-describedby');
  setDialogBusy(true);
  try{
    const result=await dialogHandler?.(data);
    if(version===dialogVersion&&result!==false){
      dialogCancel=null;
      $('#dialog').close();
    }
  }catch(err){
    failed=true;
    if(version===dialogVersion){
      $('#dialog-error').textContent=t(err.message);
      $('#dialog').setAttribute('aria-describedby','dialog-error');
    }else fail(err);
  }finally{
    if(version===dialogVersion){
      setDialogBusy(false);
      if(failed&&focused?.isConnected&&focused.closest('#dialog-body'))focused.focus({preventScroll:true});
    }
  }
};
$('#dialog-form').addEventListener('submit',()=>{const check=$('#dialog-body [name=updateChecks]');if(check)workspace.settings.updateChecks=check.checked;});
function addDocument(doc){
  const format=documentSourceProvider(doc.name);
  if(format&&documentKind(doc)!=='VODT'){doc.kind='PLUGIN';doc.formatId=format.id;}
  if(projectLocked)throw new Error(t('项目正在提交，请稍后新建文件。'));
  doc.path=uniquePath(doc.path||(selectedFolder?selectedFolder+'/':'')+doc.name,itemPaths(workspace));
  doc.name=doc.path.split('/').at(-1);
  workspace.documents.unshift(doc);
  switchDocument(doc.id);
  includeNewReadingFile(workspace,doc);
  for(const item of workspace.documents.filter(d=>documentKind(d)==='VELA'&&d.id!==workspace.activeId))editorStates.delete(item.id);
  save();
  showView('write');
  plugins?.emit('new-file',plugins.file(doc));
  return doc;
}
$('#new-doc').onclick=()=>{
 openModal(t('新建文件'),newFileHtml(workspace,selectedFolder,esc),form=>{
    const name=fileName(form.get('name')),folder=form.get('folder');
    assertNewFile(workspace,name,folder);
    selectedFolder=folder;
    const template=form.has('skeleton')&&templatesFor(name).some(o=>o.id==='format')?'format':'empty';
    addDocument(newDocument(name,templateText(name,template,projectConfig(workspace,{name,path:(folder?folder+'/':'')+name})?.config?.formats)));
  });bindNewFile($('#dialog-body'),workspace);
};
$('#doc-search').oninput=renderDocuments;
$('#doc-list').onclick=e=>{
  if(projectLocked)return;
  const lazy=e.target.closest('[data-project-file]');
  if(lazy){const path=lazy.dataset.projectFile;openLazyProjectDocument(path).then(()=>{if(innerWidth<=600&&current()&&documentPath(current())===path&&!home)setSidebar('library',false);}).catch(fail);return;}
  const pathMenu=e.target.closest('[data-path-menu]');
  if(pathMenu){e.preventDefault();e.stopPropagation();fileMenu(pathMenu.dataset.pathMenu,pathMenu.dataset.directory==='true');return;}
  const folder=e.target.closest('[data-folder]');
  if(folder){
    selectedFolder=folder.dataset.folder;
    $('#selected-folder').textContent=selectedFolder;
    $('#doc-list').querySelectorAll('summary').forEach(el=>el.classList.toggle('selected-folder',el.dataset.folder===selectedFolder));
  }
  const doc=e.target.closest('[data-doc]');
  if(doc){
    selectedFolder=parentPath(documentPath(workspace.documents.find(d=>d.id===doc.dataset.doc)));
    loadSubscriptionDocument(workspace.documents.find(d=>d.id===doc.dataset.doc)).then(()=>{
      switchDocument(doc.dataset.doc);
      if(innerWidth<=600&&current()?.id===doc.dataset.doc&&!home)setSidebar('library',false);
    }).catch(fail);
  }
  const menu=e.target.closest('[data-menu]');
  if(menu)documentMenu(menu.dataset.menu);
};
$('#refresh-folder').onclick=async()=>{
  try{
    if(session.needsSave&&!await session.saveBackground())return;
    if(native){
      const context=fileViewContext(),result=await transport('refreshFolder');
      applyFileState(result,{context,persist:false});
      projects.changed('external');
      scheduleWorkspaceSave();
    }else renderDocuments();
    toast(t('工作区已刷新'));
  }catch(error){
    fail(error);
  }
};
$('#new-folder').onclick=()=>newFolder(selectedFolder);
function newFolder(parent=''){
  openModal(t('新建文件夹'),`<label>${t('文件夹名称')}<input name="name" required maxlength="160" autofocus></label>${folderPickerHtml(workspace,{selected:parent,escape:esc})}<label class="checkbox"><input name="workspace" type="checkbox">${t('同时建立作品设置')}</label>`,f=>{
    const folder=f.get('folder'),name=repoPath(f.get('name')),path=repoPath((folder?folder+'/':'')+name);
    if(name.includes('/'))throw Error(t('文件夹名称不能包含斜杠。'));
    if(itemPaths(workspace).has(path))throw new Error(t('此路径已存在。'));
    const previous=JSON.stringify(workspace),parts=path.split('/');
    workspace.folders=[...new Set([...(workspace.folders||[]),...parts.map((_,i)=>parts.slice(0,i+1).join('/'))])];
    if(f.has('workspace')){
      const config=createVelaV2(basename(path)),defaults=globalConfig(workspace)?.config?.workspaceDefaults;
      for(const key of ['editor','reader','chapters'])if(defaults?.[key])config[key]=structuredClone(defaults[key]);
      if(defaults?.reading?.layout)config.reading.layout=structuredClone(defaults.reading.layout);
      const doc=newDocument('.vela',velaText(config));
      doc.path=path+'/.vela';
      workspace.documents.push(doc);
    }
    if(!save()){
      workspace=JSON.parse(previous);
      throw new Error(t('文件夹创建失败。'));
    }
    selectedFolder=path;
    renderDocuments();
  });
  bindFolderPicker($('#dialog-body'));
}

$('#workspace-root').onclick=()=>{selectedFolder='';renderDocuments();};
$('#file-sort').onchange=e=>{workspace.settings.filesSort=e.target.value;renderDocuments();save();};
$('#paste-file').onclick=async()=>{
  try{
    if(!fileClipboard)return;
    if(fileClipboard.workspaceId!==(workspace.storage?.id||''))throw new Error(t('请切回复制或剪切项目所在的工作区。'));
    const destination=fileClipboard.cut?(selectedFolder?selectedFolder+'/':'')+basename(fileClipboard.path):copyDestination(workspace,fileClipboard.path,selectedFolder);
    if(destination!==fileClipboard.path)await manageFile(fileClipboard.cut?'move':'copy',fileClipboard.path,destination);
    if(fileClipboard.cut)fileClipboard=null;
    renderDocuments();
  }catch(error){
    fail(error);
  }
};
function documentMenu(id){const doc=workspace.documents.find(doc=>doc.id===id);if(doc)fileMenu(documentPath(doc),false,doc);}
function fileMenu(path,directory=false,doc=workspace.documents.find(doc=>documentPath(doc)===path)){
  openModal(directory?t('文件夹操作'):t('文件操作'),`<p>${esc(path)}</p>
    <div class="button-row file-actions">${directory?`<button type="button" class="secondary" id="folder-new-file">${t('新建文件')}</button><button type="button" class="secondary" id="folder-new-folder">${t('新建文件夹')}</button>`:''}<button type="button" class="secondary" id="rename-doc">${t('重命名')}</button><button type="button" class="secondary" id="move-file">${t('移动')}</button><button type="button" class="secondary" id="copy-file">${t('复制')}</button><button type="button" class="secondary" id="cut-file">${t('剪切')}</button><button type="button" class="secondary" id="duplicate-doc">${t('保存副本')}</button>${doc?`<button type="button" class="secondary" id="menu-export">${t('导出文件')}</button>`:''}<button type="button" class="secondary" id="file-properties">${t('属性')}</button><button type="button" class="danger" id="delete-doc">${t('移入回收站')}</button></div>`,null,{noSubmit:true});
  if(directory){$('#folder-new-file').onclick=()=>{selectedFolder=path;$('#new-doc').click();};$('#folder-new-folder').onclick=()=>newFolder(path);}
  $('#rename-doc').onclick=()=>renameItem(path);
  $('#move-file').onclick=()=>{
    openModal(t('移动项目'),`<p>${esc(basename(path))}</p>${folderPickerHtml(workspace,{selected:parentPath(path),exclude:directory?path:'',escape:esc})}`,async f=>{
      const folder=f.get('folder'),destination=(folder?folder+'/':'')+basename(path);
      if(destination!==path)await manageFile('move',path,destination);
    });
    bindFolderPicker($('#dialog-body'));
  };
  for(const [id,cut] of [['copy-file',false],['cut-file',true]])$('#'+id).onclick=()=>{
    fileClipboard={workspaceId:workspace.storage?.id||'',path,cut};
    closeModal();
    renderDocuments();
    toast(cut?t('已剪切，请选择目标文件夹后粘贴'):t('已复制，请选择目标文件夹后粘贴'));
  };
  $('#duplicate-doc').onclick=async()=>{try{await manageFile('copy',path,copyDestination(workspace,path));closeModal();}catch(error){$('#dialog-error').textContent=t(error.message);}};
  if(doc)$('#menu-export').onclick=()=>exportText(doc.name,doc.text).catch(fail);
  $('#file-properties').onclick=()=>showProperties(path,directory).catch(fail);
  $('#delete-doc').onclick=()=>openModal(t('移入回收站'),`<p>${say(`将“${esc(path)}”${directory?t('及其中全部文件'):''}移入回收站？可在当前工作区的回收站中恢复。`,`Move “${esc(path)}”${directory?t('及其中全部文件'):''} to trash? You can restore it from this workspace’s trash.`)}</p><small>${t('不会删除 GitHub 中的文件。')}</small>`,async()=>manageFile('delete',path),{label:t('移入回收站')});
}
function renameItem(path){
  openModal(t('重命名'),`<label>${t('名称')}<input name="name" required maxlength="160" value="${esc(basename(path))}"></label>`,async f=>{
    const name=repoPath(f.get('name'));
    if(name.includes('/'))throw new Error(t('名称不能包含斜杠。'));
    const destination=(parentPath(path)?parentPath(path)+'/':'')+name;
    if(destination!==path)await manageFile('move',path,destination);
  });
}
function fileViewContext(){
  return {id:workspace.activeId,openIds:[...workspace.openIds],wasHome:home,preview:isPreview,name:current()?.name,kind:documentKind(current()),doc:current(),state:view?.state,scroll:view?{top:view.scrollDOM.scrollTop,left:view.scrollDOM.scrollLeft}:null};
}
function applyFileState(result,{context=fileViewContext(),persist=true}={}){
  const oldId=context.id;if(view&&oldId){editorStates.set(oldId,view.state);rememberScroll(oldId);}
  adoptFolder(workspace,result);preparePaths(workspace);
  const live=new Set(workspace.documents.map(doc=>doc.id));for(const id of editorStates.keys())if(!live.has(id))editorStates.delete(id);
  if(selectedFolder&&!workspace.folders.includes(selectedFolder))selectedFolder='';
  const target=context.wasHome?null:fileViewTarget(workspace.documents,oldId,context.openIds),doc=workspace.documents.find(d=>d.id===target);
  if(doc&&view&&target===oldId&&view.state.doc.toString()===doc.text){
    workspace.activeId=target;
    home=false;
    isPreview=context.preview;
    $('#current-name').textContent=doc.name;
    if(context.name!==doc.name||context.kind!==documentKind(doc))refreshFileType(doc);else updateEditorVisibility();
  }
  else if(doc){if(view){view.destroy();view=null;}workspace.activeId=target;switchDocument(target);if(target===oldId){isPreview=context.preview;updateEditorVisibility();if(isPreview)renderPreview();}}
  else if(!context.wasHome)showHome();
  else{workspace.activeId=null;renderHome();}
  renderDocuments();updateStats();if(persist)scheduleWorkspaceSave();
}
let fileOperationBusy=false;
async function manageFile(action,path,destination='',{quiet=false}={}){
  if(fileOperationBusy)throw Error(t('正在处理…'));fileOperationBusy=true;
  try{
    await hydratePlanningDocuments();
    if(session.needsSave&&!await session.saveBackground())throw new Error(t('请先保存或导出当前文稿。'));
    const context=fileViewContext(),before=fileOperationCopy(workspace),companion=sidecarPath(path);
    const operations=[{path,destination}];if(sidecarTarget(companion)&&before.documents.some(doc=>documentPath(doc)===companion))operations.push({path:companion,destination:action==='delete'?'':sidecarPath(destination)});
    if(native){
      let result;
      for(const operation of operations){
        try{
          result=await transport('manageFiles',{action,...operation});
        }catch(error){
          if(operation===operations[0])throw error;
          toast(say(`格式旁注未能一并处理：${t(error.message)}`,`Could not process the format sidecar: ${t(error.message)}`));
        }
      }
      applyFileState(result,{context,persist:false});
    }
    else{
      const candidate=fileOperationCopy(workspace),changes=[];
      for(const operation of operations){
        applyFileOperation(candidate,action,operation.path,operation.destination);
        const record=action==='delete'?candidate.trash.at(-1):null;
        if(record)record.projectPayload=true;
        changes.push(record?{kind:'delete',path:operation.path,trashId:record.id}:{kind:action,from:operation.path,to:operation.destination});
      }
      rewriteVelaFiles(before,candidate,action,path,destination);
      await projects.backend.call('apply','host',{root:'',changes,workspace:JSON.stringify(candidate),expected:[]});workspace=candidate;applyFileState(candidate,{context,persist:false});
    }
    if(native)rewriteVelaFiles(before,workspace,action,path,destination);
    workspace.treeRevision=(workspace.treeRevision||0)+1;
    for(const doc of workspace.documents.filter(doc=>['VELA','OUTLINE','MAP'].includes(documentKind(doc))))editorStates.delete(doc.id);
    if(current()&&['VELA','OUTLINE','MAP'].includes(documentKind(current()))&&view){view.setState(makeState(current()));if(isPreview)renderPreview();}
    index=null;updateStats();if(!await session.saveBackground())throw new Error(t('操作已完成，但工作区状态未保存，请重试保存。'));
    projects.changed('external');if(!quiet)toast(action==='delete'?t('已移入回收站'):action==='copy'?t('已保存副本'):t('项目已移动或重命名'));
  }finally{fileOperationBusy=false;}
}

async function showProperties(path,directory){
  if(!save())throw new Error(t('请先保存当前文稿。'));const state=native?await transport('refreshFolder'):workspace;
  const entries=(state.entries||[]).filter(entry=>within(path,entry.path)),doc=workspace.documents.find(doc=>documentPath(doc)===path);
  const size=entries.reduce((sum,item)=>sum+(item.directory?0:item.size||0),0)||(!directory&&doc?textBytes(doc.text):0);
  openModal(t('属性'),`<p>${say(`名称：${esc(basename(path))}`,`Name: ${esc(basename(path))}`)}</p>
    <p>${say(`路径：${esc(path)}`,`Path: ${esc(path)}`)}</p>
    <p>${say(`工作区：${esc(workspace.storage?.label||t('内部文件夹'))}`,`Workspace: ${esc(workspace.storage?.label||t('内部文件夹'))}`)}</p>
    <p>${say(`类型：${directory?t('文件夹'):doc?documentKind(doc):t('文件')}`,`Type: ${directory?t('文件夹'):doc?documentKind(doc):t('文件')}`)}</p>
    <p>${say(`大小：${size.toLocaleString()} 字节`,`Size: ${size.toLocaleString()} bytes`)}</p>
    ${directory
    ?`<p>${say(`文件：${entries.filter(item=>!item.directory).length}　文件夹：${entries.filter(item=>item.directory&&item.path!==path).length}`,`Files: ${entries.filter(item=>!item.directory).length} · Folders: ${entries.filter(item=>item.directory&&item.path!==path).length}`)}</p>`
    :doc?`<p>${say(`修改时间：${esc(new Date(doc.updatedAt).toLocaleString('zh-CN'))}`,`Modified: ${esc(new Date(doc.updatedAt).toLocaleString('zh-CN'))}`)}</p>`:''}`,null,{noSubmit:true});
}
$('#open-trash').onclick=()=>showTrash().catch(fail);
const trashItems=()=>native?transport('listTrash'):Promise.resolve(workspace.trash||[]);
async function showTrash(){
  openModal(t('回收站'),`<p role="status">${t('正在读取…')}</p>`,null,{noSubmit:true});$('#dialog').classList.add('trash-dialog');
  const version=dialogVersion,[items,{mountTrash}]=await Promise.all([trashItems(),import('./trash-view.mjs')]);
  if(version!==dialogVersion||!$('#dialog').open)return;
  mountTrash($('#dialog-body'),{items,escape:esc,apply:async(ids,permanent,progress)=>{
    if(fileOperationBusy)throw Error(t('正在处理…'));fileOperationBusy=true;setDialogBusy(true);
    try{
      if(session.needsSave&&!await session.saveBackground())throw new Error(t('请先保存文稿。'));
      const context=fileViewContext(),all=await trashItems(),byId=new Map(all.map(item=>[item.id,item])),expanded=new Set(ids),failed=[],errors=[];
      for(const id of ids){
        const item=byId.get(id);
        if(item&&!item.directory&&sidecarTarget(sidecarPath(item.path))){
          const companion=all.filter(entry=>entry.path===sidecarPath(item.path)).sort((a,b)=>b.createdAt-a.createdAt)[0];
          if(companion)expanded.add(companion.id);
        }
      }
      if(native){
        const wanted=[...expanded];
        let result;
        for(let start=0;start<wanted.length;start+=1000){
          const batch=await transport('restoreTrash',{ids:wanted.slice(start,start+1000),permanent});
          result=batch.state;
          failed.push(...batch.failed);
          for(const error of batch.errors)errors.push((byId.get(error.id)?.path||error.id)+' · '+error.message);
          progress(Math.min(start+1000,wanted.length),wanted.length);
        }
        if(result)applyFileState(result,{context,persist:false});
      }
      else{
        const candidate=fileOperationCopy(workspace),payloads=[];
        for(const id of expanded){if(byId.get(id)?.projectPayload)payloads.push(id);restoreFile(candidate,id,permanent);}
        if(payloads.length)await projects.backend.call('restoreTrashPayload','host',{ids:payloads,permanent,workspace:JSON.stringify(candidate)});
        workspace=candidate;applyFileState(candidate,{context,persist:false});progress(expanded.size,expanded.size);
      }
      if(!await session.saveBackground())throw new Error(t('操作已完成，但工作区状态未保存，请重试保存。'));
      projects.changed('external');return {items:await trashItems(),failed,errors};
    }finally{fileOperationBusy=false;setDialogBusy(false);}
  }});
}

$('#current-name').ondblclick=()=>{if(current())renameDocument(current());};
function renameDocument(doc){renameItem(documentPath(doc));}
$('#document-tabs').onclick=e=>{
  const close=e.target.closest('[data-close]');
  if(close){closeDocument(close.dataset.close);return;}
  const b=e.target.closest('[data-tab]');
  if(b&&b.dataset.tab!==workspace.activeId)switchDocument(b.dataset.tab);
};
$('#outline-list').onclick=e=>{const b=e.target.closest('[data-row]');if(b){jump(view.state.doc.line(Number(b.dataset.row)+1).from);if(innerWidth<=600)setSidebar('outline',false);}};
$('#chapter-search').oninput=()=>{outlineLimit=200;outlineRevision='';updateStats();};
$('#export-chapters').onclick=()=>showChapterExport();
$('#locate-chapter').onclick=()=>{$('#chapter-search').value='';outlineRevision='';updateStats();$('#outline-list .active')?.scrollIntoView({block:'center'});};
$('#append-chapter').onclick=()=>{
  const idx=ensureIndex();
  // i18n-data: file names, matching text and editable defaults stay as written
  openModal(t('追加章节'),`<label>${t('章节标题')}<input name="title" required value="第${idx.chapterCount+1}章" placeholder="${t('例如：第四章 标题')}"></label><small>${t('在当前小说文件的末尾追加章节，保留现有正文。')}</small>`,f=>{
    const title=f.get('title').trim();
    if(title.includes('\n')||!chapterMatcher(projectWriter(workspace,current()))(title))throw new Error(t('未识别为章节标题，请使用标准标题或添加对应标题模板。'));
    const end=view.state.doc.length,insert=(end?'\n\n':'')+title+'\n\n';
    if(isPreview)togglePreview();
    view.dispatch({changes:{from:end,insert},selection:{anchor:end+insert.length},scrollIntoView:true});
    view.focus();
    updateStats();
  });
};
$('#search-editor').onclick=()=>{if(isPreview)togglePreview();openSearchPanel(view);};
$('#focus-toggle').onclick=()=>{document.body.classList.toggle('focus');sidebars.update();};
function setSidebar(name,open,animate=true){
  if(name==='outline'&&open&&innerWidth<=600)document.body.classList.remove('show-library');
  if(name==='library'&&open){document.body.classList.remove('show-outline');reader?.root.querySelector('.reader-outline')?.remove();}
  document.body.classList.toggle('show-'+name,open);
  if(open)document.body.classList.remove('focus');
  sidebars.update(animate);
  sidebarViews.refresh();
  extensionContext.changed();
  $('#mobile-library').setAttribute('aria-expanded',String(document.body.classList.contains('show-library')));
  $('#outline-toggle').setAttribute('aria-expanded',String(document.body.classList.contains('show-outline')));
  $('#mobile-library').classList.toggle('active-tool',document.body.classList.contains('show-library'));
  $('#outline-toggle').classList.toggle('active-tool',document.body.classList.contains('show-outline'));
}
$('#outline-toggle').onclick=()=>{
  if(pageName==='reader'){reader?.toggleOutline();return;}
  if(planningPreview()&&sidebarViews.selected.right!=='builtin'){setSidebar('outline',!document.body.classList.contains('show-outline'));return;}
  if(planningPreview()){
    $('#preview').planningToggleDetails?.();
    $('#outline-toggle').setAttribute('aria-expanded',String(!!$('#preview').querySelector('.outline-detail:not([hidden]),.planning-sheet:not([data-closing])')));
    return;
  }
  setSidebar('outline',!document.body.classList.contains('show-outline'));
};
$('#mobile-library').onclick=()=>{
  workspace.settings.libraryOpen=!document.body.classList.contains('show-library');
  if(workspace.settings.libraryOpen)renderDocuments();
  setSidebar('library',workspace.settings.libraryOpen,true);
  scheduleWorkspaceSave();
};
$('#close-outline').onclick=()=>{setSidebar('outline',false);$('#outline-toggle').focus({preventScroll:true});};
$('#export-doc').onclick=()=>exportText(current().name,current().text).then(result=>{if(result!==false)toast(t('文稿已导出'));}).catch(fail);
const defaultImportAccept=$('#file-input').accept;
async function importSelectedDocument(bytes,name){
  const target=workspace,folder=selectedFolder,result=await prepareDocumentImport(bytes,name,decodeFileText);
  if(workspace!==target)throw Error(t('工作区已切换，请重新导入。'));
  const doc=Object.assign(newDocument(fileName(result.name),result.kind||/\.(csv|tsv)$/i.test(result.name)?result.text:normalizeText(result.text)),result);
  doc.path=(folder?folder+'/':'')+doc.name;
  return addDocument(doc);
}
$('#import-doc').onclick=async()=>{if(native){try{
  const result=await transport('import',{binaryExtensions:[...BINARY_DOCUMENT_EXTENSIONS,...documentImportExtensions()]});
  for(const file of result){
    if(documentProvider(file.name)||documentSourceProvider(file.name))await importSelectedDocument(typeof file.data==='string'?fromBase64(file.data):new TextEncoder().encode(file.text),file.name);
    else if(typeof file.text==='string'&&!binaryDocumentName(file.name))await importSelectedDocument(new TextEncoder().encode(file.text),file.name);
    else if(typeof file.data==='string'){
          if(!save())return;
          const path=uniquePath((selectedFolder?selectedFolder+'/':'')+file.name,itemPaths(workspace));
          applyFileState(await transport('writeWorkspaceFiles',{files:[{path,data:file.data}]}));
        }
  }
  if(result.length){projects.changed('import');toast(t('文件已导入工作区'));}
}catch(e){fail(e);}}else $('#file-input').click();};
$('#file-input').onchange=async e=>{
  try{
    for(const file of e.target.files){
      if(file.size>documentImportLimit(file.name))throw Error(t('文件超过文档导入大小限制。'));
      await importSelectedDocument(new Uint8Array(await file.arrayBuffer()),file.name);
    }
    projects.changed('import');
  }catch(err){
    fail(err);
  }finally{
    e.target.value='';
  }
};
let updateCheckPromise=null;
async function checkWindowsUpdates(visible=false){
  if(updateCheckPromise&&!visible)return updateCheckPromise;
  const mounted=visible?openModal(t('检查更新'),`<p>${t('正在读取…')}</p>`,null,{noSubmit:true}):null;
  updateCheckPromise=(async()=>{
    try{
      const {checkAppUpdates}=await loadUpdateView();
      const descriptor=await texCompiler?.assets.descriptor().catch(()=>null);
      if(mounted&&!mounted.alive())return null;
      return await checkAppUpdates({openModal,dialogOpen:()=>$('#dialog')?.open===true,transport,native,platform:environment?.platform||'',current:environment?.version||__VELA_HARMONY_VERSION__,lite:descriptor?!descriptor.builtin:true,installed:new Map((plugins?.records||[]).filter(record=>!record.builtin).map(record=>[record.manifest.id,record.manifest.version])),openPlugins:showPlugins,toast,remember:result=>{
        workspace.updateInfo={available:result.available,version:result.version,checkedAt:result.checkedAt};
        scheduleWorkspaceSave();
      }},{visible});
    }catch(error){
      if(!visible)throw error;
      if(mounted?.alive())chunkFailure(mounted.root,error,()=>checkWindowsUpdates(true));
      return null;
    }
  })();
  try{return await updateCheckPromise;}finally{if(!visible)updateCheckPromise=null;}
}
window.addEventListener('resize',()=>{
  if(workspace&&pageName==='write'){
    if(innerWidth<=600&&document.body.classList.contains('show-library')&&document.body.classList.contains('show-outline'))setSidebar('library',false,false);
    updateEditorVisibility();
    view?.requestMeasure();
  }
});

// The last painted look and the newest system-bar request; a later switch cancels a delayed bar update.
let themeLook='',appearanceToken=0;
function applyTheme(mode=workspace.settings.theme){
  workspace.settings.theme=mode;
  const dark=mode==='dark'||mode==='system'&&(environment?.dark??systemTheme.matches);
  workspace.settings.dark=dark;
  // Only a real colour change cross-fades; re-applying the same look (settings saved, system event) stays instant.
  const look=dark+JSON.stringify(paletteFor(workspace.settings.palette,dark).colors),starting=!themeLook,changed=look!==themeLook;
  themeLook=look;
  const paint=()=>{
    document.body.classList.toggle('dark',dark);
    workspace.settings.palette=applyPalette(document.body,workspace.settings.palette,dark);
    window.velaStartup?.remember(workspace.settings,{light:paletteFor(workspace.settings.palette,false).colors,dark:paletteFor(workspace.settings.palette,true).colors});
    const follows=!dark===(environment?.dark??systemTheme.matches);
    const label=(mode==='system'
      ?say(`跟随系统（${dark?'深色':'浅色'}），`,`System (${dark?'dark':'light'}), `)
      :'')+say(
      `切换到${dark?'浅色':'深色'}模式${follows?'（跟随系统）':''}`,
      `Switch to ${dark?'light':'dark'} mode${follows?' (system)':''}`,
    );
    const menuLabel=$('#theme .menu-label');
    $('#theme').innerHTML=icon(dark?'sun':'theme');
    if(menuLabel)$('#theme').append(menuLabel);
    $('#theme').title=label+' (Ctrl+Alt+T)';
    $('#theme').setAttribute('aria-label',label);
    const githubTheme=$('[data-toggle-theme]');if(githubTheme){githubTheme.innerHTML=icon(dark?'sun':'theme');githubTheme.title=label;githubTheme.setAttribute('aria-label',label);}
    if(isPreview&&current()&&documentKind(current())==='HTML')renderPreview();
  };
  // Native bars cannot fade, so they switch shortly after the page fade starts. `theme` and both backgrounds let the
  // native shell paint the next cold start in the right colour before this page has loaded.
  const token=++appearanceToken,bars=(delay=0)=>{
    if(!native)return;
    const colors=value=>paletteFor(workspace.settings.palette,value).colors,send=()=>{
      if(token===appearanceToken)transport('appearance',{dark,background:colors(dark).bg,foreground:colors(dark).text,theme:mode,light:colors(false).bg,night:colors(true).bg}).catch(fail);
    };
    if(delay)setTimeout(send,delay);else send();
  };
  if(changed&&!starting)crossfadeTheme(paint).then(bars);else{paint();bars();}
}
const showPaletteEditor=(id,from)=>openPaletteEditor({workspace,openModal,closeModal,applyTheme,save,toast},id,from);
// Every press flips what is on screen; when the new look matches the system it follows the system again, so the
// first press is never a no-op (the old system → light → dark cycle did nothing on a light system).
function cycleTheme(){const dark=!workspace.settings.dark,system=environment?.dark??systemTheme.matches;applyTheme(dark===system?'system':dark?'dark':'light');save();}
$('#theme').onclick=cycleTheme;
systemTheme.addEventListener('change',()=>{if(workspace?.settings.theme==='system')applyTheme();});
bindPlatformEnvironment(window, document, environment, (value) => {
  environment = value;
  ui.environment(value);
  if (workspace?.settings.theme === 'system') applyTheme();
  sidebars.update(false);
});
function applyWorkspaceFont() {
  applyFontPreference(document, workspace?.settings.fontFamily);
  const reflow = () => {view?.requestMeasure();reader?.layout();};
  reflow();
  document.fonts.ready.then(reflow);
}
function setFontSize(value,persist=true){
  const size=Math.max(10,Math.min(40,Math.round(Number.isFinite(value)?value:16)));
  textFontSize=size;
  if(persist){
    const project=current()&&documentKind(current())!=='VELA'?projectConfig(workspace,current()):null;
    if(project?.config){
      const config=project.rawConfig||project.config;
      config.editor={...config.editor,fontSize:size};
      project.doc.text=velaText(config);
      project.doc.updatedAt=Date.now();
      editorStates.delete(project.doc.id);
    }else workspace.settings.fontSize=size;
  }
  document.documentElement.style.setProperty('--editor-font-size',size+'px');
  view?.requestMeasure();
  if(isPreview&&current()&&documentKind(current())==='HTML')renderPreview();
}
if(!native||['android','windows'].includes(environment?.platform))bindTextZoom($('.paper'),()=>textFontSize,setFontSize,()=>{save();toast(say(`文字字号 ${textFontSize} px`,`Font size ${textFontSize} px`));});
window.wenzhouNativeScale=factor=>{
  if(planningPreview())return;
  if(!workspace||!Number.isFinite(factor)||factor<=0)return;
  if(pageName==='reader'&&reader?.id){reader.setSize(reader.size*factor);workspace.readerSizes={...workspace.readerSizes,[reader.id]:reader.size};}else if(pageName==='write')setFontSize(textFontSize*factor);
  save();
};
let nativePinchSize=16;
window.wenzhouNativePinch=(ratio,phase)=>{
  if(planningPreview())return;
  if(!workspace)return;
  if(pageName==='reader'){
    if(phase==='start')nativePinchSize=reader.size||16;else if(phase==='move'&&reader.id)reader.setSize(nativePinchSize*ratio);else if(reader.id){
      workspace.readerSizes={...workspace.readerSizes,[reader.id]:reader.size};
      save();
    }
    return;
  }
  if(pageName!=='write')return;
  if(phase==='start')nativePinchSize=textFontSize;else if(phase==='move')setFontSize(nativePinchSize*ratio);else{save();toast(say(`文字字号 ${textFontSize} px`,`Font size ${textFontSize} px`));}
};
$('#quick-save').onclick=()=>{
  if(isPreview&&documentKind(current())==='OUTLINE'){
    const text=documents.outlineAnchors.text(current());
    if(text!==current().text){
      view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.planning'});
      documents.outlineAnchors.accept(current(),text);
    }
  }
  save(true);
};$('#quick-undo').onclick=()=>{
  if(!view)return;
  if(isPreview&&documentKind(current())==='MAP'){$('#preview').mapUndo?.();return;}
  undo(view);
  if(isPreview)renderPreview();else view.focus();
};$('#quick-redo').onclick=()=>{
  if(!view)return;
  if(isPreview&&documentKind(current())==='MAP'){$('#preview').mapRedo?.();return;}
  redo(view);
  if(isPreview)renderPreview();else view.focus();
};
$('#quick-top').onclick=()=>jump(0);$('#quick-bottom').onclick=()=>jump(view.state.doc.length);
$('#quick-chapter-top').onclick=()=>jump(chapterPosition(view.state.doc.toString(),ensureIndex(),view.state.selection.main.head,'top'));
$('#quick-chapter-bottom').onclick=()=>jump(chapterPosition(view.state.doc.toString(),ensureIndex(),view.state.selection.main.head,'bottom'));
// Keep the editor selection and mobile keyboard when operating the quick tools.
document.querySelectorAll('.quickbar button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
$('#quick-git').onclick=()=>gitDocument();
$('#settings').onclick=()=>{
  const s=workspace.settings.writer;
  openModal(t('编辑器设置'),`<label>${t('语言')}<select name="language"><option value="zh-CN" ${workspace.settings.language!=='en'?'selected':''}>${t('简体中文')}</option><option value="en" ${workspace.settings.language==='en'?'selected':''}>English</option></select></label>
    <label>${t('外观')}<select name="theme">${[['system',t('跟随系统')],['light',t('浅色模式')],['dark',t('深色模式')]].map(([value,label])=>`<option value="${value}" ${workspace.settings.theme===value?'selected':''}>${label}</option>`).join('')}</select></label>
    <fieldset class="palette-options"><legend>${t('配色方案')}</legend>${allPalettes().map(p=>`<label class="palette-choice${p.custom?' custom':''}"><input type="radio" name="palette" value="${p.id}" ${p.id===workspace.settings.palette?'checked':''}><span class="palette-swatches"><i style="background:${p.light.accent}"></i><i style="background:${p.light.soft}"></i><i style="background:${p.dark.paper}"></i></span><span>${esc(p.custom?p.name:t(p.name))}</span>${p.custom?`<button type="button" class="text-button palette-edit" data-edit-palette="${p.id}" aria-label="${say(`编辑配色 ${esc(p.custom?p.name:t(p.name))}`,`Edit palette ${esc(p.custom?p.name:t(p.name))}`)}">${t('编辑')}</button>`:''}</label>`).join('')}${customPalettes().length<MAX_CUSTOM_PALETTES?`<button type="button" class="palette-add" id="new-palette">${t('＋ 自定义配色')}</button>`:''}</fieldset>
    <label>${t('文字字号')}<input type="number" name="fontSize" min="10" max="40" value="${textFontSize}" required></label>
    <label>${t('阅读方式')}<select name="readingMode"><option value="scroll" ${workspace.settings.readingMode==='scroll'?'selected':''}>${t('上下滑动')}</option><option value="pages" ${workspace.settings.readingMode==='pages'?'selected':''}>${t('左右翻页')}</option><option value="double" ${workspace.settings.readingMode==='double'?'selected':''}>${t('双页阅读')}</option></select></label>
    <label class="checkbox"><input name="globalVelaOverride" type="checkbox" ${globalConfig(workspace)?.config?.reader?.appearancePolicy==='personal'?'checked':''}>${t('统一使用我的阅读排版')}</label>
    <p><button type="button" class="secondary" id="edit-global-vela">${t('编辑全局 .vela')}</button></p>
    <label class="checkbox"><input name="autoNouns" type="checkbox" ${workspace.settings.autoNouns!==false?'checked':''}>${t('正文名词候选补全')}</label>
    <small>${t('本地推测人名、地名等候选，不自动加入术语库。')}</small><label class="checkbox"><input name="glossaryPanel" type="checkbox" ${workspace.settings.glossaryPanel?'checked':''}>${t('正文与术语库同屏')}</label>
    <label class="checkbox"><input name="highlightTerms" type="checkbox" ${workspace.settings.highlightTerms?'checked':''}>${t('正文术语高亮与释义')}</label>
    <label class="checkbox"><input name="novelLineNumbers" type="checkbox" ${workspace.settings.novelLineNumbers?'checked':''}>${t('小说模式显示行号')}</label>
    <label class="checkbox"><input name="richText" type="checkbox" ${workspace.settings.richText?'checked':''}>${t('TXT 格式工具')}<small>${t('粗体、着重号、注音、插图和样式；格式保存在作品配置 .vela 中，TXT 正文不变')}</small></label>
    <label>${t('字数规则')}<select name="countMode"><option value="nonspace" ${s.countMode==='nonspace'?'selected':''}>${t('非空白字符（含标点）')}</option><option value="letters" ${s.countMode==='letters'?'selected':''}>${t('仅文字与数字')}</option></select></label>
    <label class="checkbox"><input name="includeHeading" type="checkbox" ${s.includeHeading?'checked':''}>${t('字数包含章节标题')}</label>
    <p>${t('自动识别标准中英章节标题；额外模板保存在工作区 .vela 配置中。')}</p>
    <div class="notice">${say(`文舟 ${environment?.version||(environment?.platform==='android'?__VELA_HARMONY_VERSION__+'-android.1':__VELA_HARMONY_VERSION__)}`,`Vela ${environment?.version||(environment?.platform==='android'?__VELA_HARMONY_VERSION__+'-android.1':__VELA_HARMONY_VERSION__)}`)}<br>${t('开源小说创作 / 阅读工具')}</div>
    <p><button type="button" class="secondary" id="create-vela" ${workspace.documents.some(doc=>documentKind(doc)==='VELA'&&documentPath(doc)!==GLOBAL_VELA_PATH&&configFolder(documentPath(doc))===currentScope())?'disabled':''}>${t('创建 .vela 配置')}</button></p>
    <p><button type="button" class="secondary" id="backup-all">${t('导出全部文稿备份')}</button> <button type="button" class="secondary" id="restore-backup">${t('恢复文稿备份')}</button> <button type="button" class="secondary" id="show-licenses">${t('开源许可')}</button>${native
    ?`<button type="button" class="secondary" id="check-updates">${t('检查更新')}</button><label class="checkbox"><input name="updateChecks" type="checkbox" ${workspace.settings.updateChecks!==false?'checked':''}>${t('自动检查更新')}</label>`
    :''}</p>`,f=>{
    const configPriorityChanged=(globalConfig(workspace)?.config?.reader?.appearancePolicy==='personal')!==f.has('globalVelaOverride');
    workspace.settings.writer=chapterSettings({...s,titleTemplates:[],countMode:f.get('countMode'),includeHeading:f.has('includeHeading')});
    workspace.settings.language=f.get('language');
    setLanguage(workspace.settings.language);
    renderAppLabels();
    outlineRevision='';
    workspace.settings.fontFamily=normalizeFontName(f.get('fontFamily'));
    applyWorkspaceFont();
    if(environment?.platform==='windows')workspace.settings.updateChecks=f.has('updateChecks');
    workspace.settings.readingMode=f.get('readingMode');
    workspace.settings.autoNouns=f.has('autoNouns');
    workspace.settings.glossaryPanel=f.has('glossaryPanel');
    workspace.settings.highlightTerms=f.has('highlightTerms');
    {const lines=f.has('novelLineNumbers');if(lines!==!!workspace.settings.novelLineNumbers){workspace.settings.novelLineNumbers=lines;refreshGutters();}}
    workspace.settings.richText=f.has('richText');
    editorStates.clear();
    if(current())refreshFileType(current());
    ensureGlobalVela();
    const global=globalConfig(workspace);
    if(global?.config){
      global.config.reader={...global.config.reader,appearancePolicy:f.has('globalVelaOverride')?'personal':'project',mode:f.get('readingMode')};
      global.doc.text=velaText(global.config);
      global.doc.updatedAt=Date.now();
    }
    workspace.settings.palette=f.get('palette')||'pine';
    reader?.localize();
    if(home)renderHome();
    if(pageName==='github'){
      if(selectedRepo)renderRepository().catch(fail);
      else renderGitHub();
    }
    applyTheme(f.get('theme'));
    setFontSize(Number(f.get('fontSize')));
    index=null;
    save();
    updateStats();
    reader?.layout();
    if(pageName==='reader'&&configPriorityChanged)reader.home();
    if(pageName==='subscriptions')subscriptions?.render();
  });
  mountFontSettings($('#dialog-body'),workspace.settings.fontFamily,{native,transport,window});
  const cleanup=document.createElement('p');cleanup.innerHTML=`<button type="button" class="secondary" id="cleanup-redundant">${t('清除冗余文件')}</button>`;$('#dialog-body').append(cleanup);
  organizeSettings($('#dialog-body'));
  $('#cleanup-redundant').onclick=()=>showSyncCleanup({workspace,client:gh,connected:!!account,native,workflow:syncWorkflow,busy:syncBusy,save,openModal,escape:esc,toast,applied:async()=>{
    restorePulledEditor('write');
    if(!save())throw Error(t('清理后关联信息保存失败，请刷新工作区。'));
  }});
  if($('#check-updates'))$('#check-updates').onclick=()=>checkWindowsUpdates(true);
  // A palette radio inside a label: the edit button must not select it; both buttons replace the settings dialog.
  $('#dialog-body').querySelectorAll('[data-edit-palette]').forEach(button=>button.onclick=event=>{event.preventDefault();showPaletteEditor(button.dataset.editPalette);});
  const newPalette=$('#new-palette');if(newPalette)newPalette.onclick=()=>showPaletteEditor('',$('#dialog-body [name=palette]:checked')?.value||workspace.settings.palette);
  $('#edit-global-vela').onclick=()=>{
    const doc=ensureGlobalVela();
    closeModal();
    if(!workspace.openIds.includes(doc.id))workspace.openIds.push(doc.id);
    switchDocument(doc.id);
    showView('write');
    isPreview=true;
    updateEditorVisibility();
    renderVela();
    save();
  };
  $('#create-vela').onclick=()=>{
    const folder=currentScope();
    if(workspace.documents.some(doc=>documentKind(doc)==='VELA'&&documentPath(doc)!==GLOBAL_VELA_PATH&&configFolder(documentPath(doc))===folder))return;
    const config=createVelaV2(folder?basename(folder):'内部文件夹');
    config.reading.items=workspace.documents.filter(doc=>readable(doc)&&(!folder||documentPath(doc).startsWith(folder+'/'))).map(doc=>({id:doc.id,path:documentPath(doc).slice(folder?folder.length+1:0)}));
    const doc=newDocument('.vela',velaText(config));
    doc.path=(folder?folder+'/':'')+'.vela';
    closeModal();
    addDocument(doc);
  };
  $('#backup-all').onclick=()=>exportText('Vela-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(workspace,null,2)).catch(fail);
  $('#restore-backup').onclick=()=>pickBackupFile().then(bytes=>{if(bytes)previewBackupRestore(bytes);}).catch(fail);
  $('#show-licenses').onclick=()=>{
    const licenses=window.WENZHOU_LICENSES||[];
    openModal(t('开源许可'),`<label>${t('组件')}<select id="license-component">${licenses.map((item,i)=>`<option value="${i}">${esc(item.name)}</option>`).join('')}</select></label><textarea id="license-text" rows="15" readonly aria-label="${t('许可全文')}" style="font-family:monospace;font-size:10px"></textarea>`,null,{noSubmit:true});
    const show=()=>{$('#license-text').value=licenses[Number($('#license-component').value)]?.text||'';};
    $('#license-component').onchange=show;
    show();
  };
};

function showView(name){
  if(session.dirty&&!save())return;if(name!=='write')$('#preview').odfDispose?.();ui.close();pageName=name;ui.editorContext(pageName,home);document.body.dataset.page=name;document.body.classList.toggle('start-open',home&&name==='write');
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  for(const page of ['write','github','subscriptions','reader'])$('#'+page+'-view').hidden=page!==name;
  $('#sidebar-logout').disabled=!account;$('#add-glossary').disabled=name!=='write'||home||isPreview;
  if(name==='github'){document.body.classList.remove('focus');renderGitHub();}
  if(name==='subscriptions'){
    for(const item of workspace.subscriptions||[])item.pageSeen=true;
    $('[data-view=subscriptions] .update-dot').hidden=true;
    save();
    chunkLoading($('#subscriptions-view'));
    Promise.all([ensureSubscriptions(),ensureMarkdown()]).then(([value])=>{if(pageName==='subscriptions')value.enter();}).catch(error=>{if(pageName==='subscriptions')chunkFailure($('#subscriptions-view'),error,()=>showView('subscriptions'));});
  }else subscriptions?.leave();
  if(name==='reader'){
    indexService=null;
    index=null;
    indexDoc=null;
    setSidebar('library',false);
    if(!reader)chunkLoading($('#reader-view'));
    ensureReader().then(reader=>{if(pageName==='reader')reader.home();}).catch(error=>chunkFailure($('#reader-view'),error,()=>showView('reader')));
  }else{
    reader?.leave();
    updateEditorVisibility();
    if(name==='write'&&isPreview&&isComponentDocument(current()))renderPreview();
  }
  sidebars.update();
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
  if(button.dataset.view==='write'&&pageName==='write'&&!home){ui.toggleEditorChrome();return;}
  showView(button.dataset.view);
});$('#github-shortcut').onclick=()=>showView('github');$('#sidebar-logout').onclick=logout;

$('#github-view').addEventListener('click',e=>{if(e.target.closest('[data-return-write]'))showView('write');if(e.target.closest('[data-toggle-theme]'))cycleTheme();});
let githubOffline=false;
const githubTopbar=()=>`<div class="github-topbar"><button class="secondary" data-return-write="true">${t('← 返回编辑器')}</button><div class="button-row"><span>${say(`${gitName()} 仓库管理`,`${gitName()} repositories`)}</span><button data-toggle-theme="true" title="${workspace.settings.dark?t('切换到浅色模式'):t('切换到深色模式')}" aria-label="${workspace.settings.dark?t('切换到浅色模式'):t('切换到深色模式')}">${icon(workspace.settings.dark?'sun':'theme')}</button></div>
  </div>`;
function renderGitHub(){
  const root=$('#github-view');
  if(!account){
    root.innerHTML=`${githubTopbar()}<div class="empty-state"><div class="large-icon">${icon('github')}</div>
      <h2>${say(`连接 ${gitName()}`,`Connect ${gitName()}`)}</h2>
      <div class="git-login-fields"><label>${t('代码托管平台')}<select id="git-provider" aria-label="${t('代码托管平台')}">${providerOptions(gh.provider)}</select></label>
      ${serverField(gh.provider,workspace.settings.giteaServer,esc,'instance')}</div>
      <p>${t('浏览与创建仓库、管理分支、读取文件并提交修改。')}</p>
      <div class="button-row"><button class="primary" id="token-login">${t('使用访问令牌')}</button><button class="secondary" id="check-connection">${t('检测连接')}</button></div>
      <p class="description">${native?(environment?.platform==='android'?t('令牌使用 Android Keystore 加密保存在应用内部。'):environment?.platform==='windows'?t('令牌使用 Windows 安全存储加密保存在应用内部。'):t('令牌保存在鸿蒙安全资产存储中。')):t('浏览器预览的令牌仅保留在内存中，刷新后需重新登录。')}</p>
      </div>`;
    $('#git-provider').onchange=e=>{gh=createGitClient(transport,e.target.value,workspace.settings.giteaServer);renderGitHub();};
    $('#token-login').onclick=()=>{try{setGitServer();loginToken();}catch(error){fail(error);}};
    $('#check-connection').onclick=()=>{try{setGitServer();checkGitHubConnection();}catch(error){fail(error);}};
    return;
  }
  if(selectedRepo){renderRepository();return;}
  root.innerHTML=`${githubTopbar()}<header class="page-header"><div><span class="page-kicker">${gitName().toUpperCase()} / ${esc(account.login)}${gh.server?' / '+esc(gh.server):''}</span><h1>${t('仓库')} <span class="count-badge">${repositories.length}</span></h1>
    </div>
    <div class="account-actions"><button class="secondary" id="refresh-repos">${t('刷新')}</button><button class="primary" id="create-repo">${t('＋ 新建仓库')}</button><button class="secondary" id="commit-workspace">${t('提交整个工作区')}</button><button class="secondary" id="logout">${t('退出登录')}</button></div>
    </header><label class="search-box" style="max-width:400px;margin-bottom:24px">${icon('search')}<input id="repo-search" aria-label="${t('搜索仓库')}" placeholder="${t('搜索仓库名称…')}"></label>
    <div id="repo-grid" class="repo-grid"></div>`;
  if(githubOffline){
    const notice=document.createElement('p');
    notice.className='notice';
    notice.textContent=t('当前显示缓存的仓库列表；网络恢复后请刷新，写入操作暂不可用。');
    root.querySelector('.page-header').after(notice);
    $('#create-repo').disabled=true;
    $('#commit-workspace').disabled=true;
  }
  const list=()=>{
    $('#repo-grid').innerHTML=repositories.filter(r=>r.full_name.toLowerCase().includes($('#repo-search').value.toLowerCase())).map(r=>`<button class="repo-card" data-repo="${esc(r.full_name)}"><strong>⑂ ${esc(r.full_name)}</strong><p>${esc(r.description||t('还没有仓库简介。'))}</p><small>${r.private?t('私有'):t('公开')} · ${esc(r.default_branch)}${r.archived?t(' · 已归档'):''}</small></button>`).join('')||`<p class="blank">${t('暂无仓库，或没有匹配结果。')}</p>`;
  };list();$('#repo-search').oninput=list;
  $('#repo-grid').onclick=e=>{
    const b=e.target.closest('[data-repo]');
    if(b){selectedRepo=repositories.find(r=>r.full_name===b.dataset.repo);selectedBranch=selectedRepo.default_branch;selectedPath='';renderRepository();}
  };
  $('#refresh-repos').onclick=()=>loadRepositories();$('#create-repo').onclick=createRepository;$('#logout').onclick=logout;$('#commit-workspace').onclick=()=>commitWholeWorkspace().catch(fail);
}
async function loadRepositories(){
  const epoch=++loadEpoch;
  $('#github-view').innerHTML=githubTopbar()+`<p class="loading">${say(`正在读取 ${gitName()} 仓库…`,`Loading ${gitName()} repositories…`)}</p>`;
  try{
    const list=await gh.repositories();
    if(epoch!==loadEpoch)return;
    repositories=list;
    githubOffline=false;
    workspace.githubCache={...gitIdentity(gh),login:account.login,checkedAt:Date.now(),repositories:list.slice(0,500).map(({full_name,name,description,default_branch,private:isPrivate,archived,permissions})=>({full_name,name,description,default_branch,private:isPrivate,archived,permissions}))};
    save();
    renderGitHub();
  }catch(e){
    if(epoch!==loadEpoch)return;
    githubOffline=true;
    if(workspace.githubCache?.login===account?.login&&sameGitHost(workspace.githubCache,gh))repositories=workspace.githubCache.repositories;
    renderGitHub();
    fail(e);
  }
}
async function signedIn(user){
  workspace.settings.gitProvider=gh.provider;
  if(gh.provider==='gitea')workspace.settings.giteaServer=gh.server;
  save();
  githubOffline=false;
  account=user;
  $('#sidebar-logout').disabled=false;
  $('#account-label').textContent=gitName()+' · '+user.login;
  selectedRepo=null;
  showView('github');
  await loadRepositories();
}
async function checkGitHubConnection(){
  openModal(say(`检测 ${gitName()} 连接`,`Check ${gitName()} connection`),`<p>${t('正在检测连接…')}</p>`,null,{noSubmit:true});
  try{
    const result=await transport('connection',gitIdentity(gh));
    if(result.status!==200)throw new Error(say(`${gitName()} 返回 HTTP ${result.status}，请检查网络后重试。`,`${gitName()} returned HTTP ${result.status}. Check your connection and try again.`));
    $('#dialog-body').textContent=say(`${gitName()} 连接正常，可以继续登录。`,`${gitName()} is reachable. You can sign in.`);
  }
  catch(e){$('#dialog-body').textContent=t('连接检测未通过。');$('#dialog-error').textContent=t(e.message);}
}
function loginToken(){showTokenLogin({client:gh,server:workspace.settings.giteaServer,transport,openModal,escape:esc,signedIn:async(user,client)=>{gh=client;await signedIn(user);}});}
async function logout(){
  try{
    if(syncBusy())throw Error(t('正在同步，请稍后退出。'));
    await transport('logout',gitIdentity(gh));
    await syncBlobCache.clear();
    loadEpoch++;
    account=null;
    githubOffline=false;
    delete workspace.githubCache;
    save();
    $('#sidebar-logout').disabled=true;
    repositories=[];
    selectedRepo=null;
    $('#account-label').textContent=t('连接 GitHub / Gitee / Gitea');
    renderGitHub();
    toast(t('已退出，设备上的文稿保留。'));
  }catch(e){
    fail(e);
  }
}
function createRepository(){
  openModal(say(`新建 ${gitName()} 仓库`,`New ${gitName()} repository`),`<label>${t('仓库名称')}<input name="name" pattern="[A-Za-z0-9_.-]+" required placeholder="my-writing"></label><label>${t('简介')}<textarea name="description" rows="2" maxlength="350"></textarea></label><label class="checkbox"><input name="private" type="checkbox" checked>${t('设为私有仓库')}</label><small>${t('将在当前账号下新建仓库并初始化 README。')}</small>`,async f=>{
    await gh.createRepository(f.get('name').trim(),f.get('description'),f.has('private'));
    await loadRepositories();
  },{label:t('创建仓库')});
}
async function renderRepository(){
  const repo=selectedRepo,epoch=++loadEpoch,root=$('#github-view');if(!repo)return;
  root.innerHTML=`${githubTopbar()}<header class="page-header"><div><button class="text-button" id="back-repos">${t('← 返回仓库列表')}</button><h1>${esc(repo.name)}</h1>
    <p>${esc(repo.full_name)} · ${repo.private?t('私有仓库'):t('公开仓库')}</p>
    </div>
    <div class="button-row"><button class="secondary" id="repo-pull">${t('拉取整个仓库')}</button><button class="secondary" id="repo-settings">${t('仓库设置')}</button><button class="secondary" id="repo-commit-workspace">${t('提交整个工作区')}</button><button class="primary" id="repo-commit">${t('提交当前文件')}</button></div>
    </header><div class="repo-toolbar"><label>${t('分支')} <select id="branch-select" aria-label="${t('选择分支')}"><option>${esc(selectedBranch)}</option></select></label>
    <button class="secondary" id="create-branch">${t('＋ 新建分支')}</button><button class="secondary" id="refresh-files">${t('刷新')}</button><button class="secondary" id="repo-history">${t('提交记录')}</button></div>
    ${syncTargetMarkup({...gitIdentity(gh),repo:repo.full_name,branch:selectedBranch},repositoryFolder(workspace,repo.full_name,gh.provider,gh.server,selectedBranch),esc)}<div class="remote-selection-tools"><button id="remote-multi" class="secondary">${t('多选')}</button><button id="remote-select-all" class="secondary" hidden>${t('全选本页')}</button><button id="remote-pull-selected" class="primary" hidden>${t('拉取选中项')}</button><span id="remote-selected-count"></span><button id="remote-cancel-selection" class="secondary" hidden>${t('取消多选')}</button></div>
    <p class="path-label">${esc(selectedPath||'/')}</p>
    <div class="file-list" id="file-list"><p class="loading">${t('正在读取文件…')}</p>
    </div>`;
  $('#back-repos').onclick=()=>{loadEpoch++;selectedRepo=null;renderGitHub();};$('#refresh-files').onclick=renderRepository;
  $('#repo-history').onclick=()=>showGitHistory(repo.full_name,selectedBranch);$('#repo-commit-workspace').onclick=()=>commitWholeWorkspace(repo.full_name,selectedBranch).catch(fail);$('#repo-commit').onclick=()=>commitDocument(repo.full_name,selectedBranch);$('#repo-pull').onclick=()=>pullWholeRepository();
  $('#repo-settings').onclick=()=>openModal(t('仓库设置'),`<label>${t('仓库名称')}<input name="name" required pattern="[A-Za-z0-9_.-]+" value="${esc(repo.name)}"></label><label>${t('简介')}<textarea name="description" rows="3">${esc(repo.description||'')}</textarea></label><small>${say(`修改会直接更新 ${gitName()} 仓库的名称与简介。`,`This updates the repository name and description on ${gitName()}.`)}</small>`,async f=>{
    const old=repo.full_name;
    const updated=await gh.updateRepository(old,{name:f.get('name').trim(),description:f.get('description')});
    for(const d of workspace.documents)if(sameGitHost(d.remote,gh)&&d.remote?.repo===old)d.remote.repo=updated.full_name;
    for(const item of workspace.repositories||[])if(sameGitHost(item,gh)&&item.repo===old)item.repo=updated.full_name;
    save();
    repositories=repositories.map(r=>r.full_name===old?updated:r);
    selectedRepo=updated;
    renderRepository();
  },{label:say(`保存到 ${gitName()}`,`Save to ${gitName()}`)});
  if(githubOffline||repo.permissions?.push===false||repo.archived){
    for(const selector of ['#repo-commit','#repo-commit-workspace','#create-branch']){const button=root.querySelector(selector);button.disabled=true;button.title=repo.archived?t('仓库已归档'):t('当前账号只有读取权限');}
  }if(githubOffline||repo.permissions?.admin===false||repo.archived){
    $('#repo-settings').disabled=true;
    $('#repo-settings').title=t('此操作需要仓库管理权限');
  }
  $('#create-branch').onclick=()=>openModal(t('新建分支'),`<p>${say(`从 ${esc(selectedBranch)} 创建分支。`,`Create a branch from ${esc(selectedBranch)}.`)}</p><label>${t('分支名称')}<input name="name" placeholder="draft/chapter-one" required></label>`,async f=>{
    if(syncBusy())throw Error(t('正在同步，请稍后创建分支。'));
    await gh.createBranch(repo.full_name,selectedBranch,f.get('name'));
    renderRepository();
    toast(t('分支已创建，可在分支列表中选择。'));
  },{label:t('创建分支')});
  $('#branch-select').onchange=async e=>{
    const next=e.target.value,select=e.target,client=gh,source=workspace,branch=selectedBranch;
    const target={...gitIdentity(client),repo:repo.full_name,branch};
    select.value=branch;select.disabled=true;
    try{
      if(syncBusy())throw Error(t('正在同步，请等待完成后再切换分支。'));
      if(!save())throw Error(t('本地保存失败，未切换分支。'));
      const attachmentChanges=await inspectBranchAttachments(source,target,native?path=>transport('readWorkspaceFile',{path}):null);
      if(source!==workspace||client!==gh||selectedRepo!==repo||selectedBranch!==branch)return;
      switchRepositoryBranch({workspace,target,next,attachmentChanges,busy:syncBusy,save,openModal,escape:esc,
        apply:nextBranch=>{selectedBranch=nextBranch;selectedPath='';remoteSelection.clear();remoteSelecting=false;renderRepository();}});
    }catch(error){fail(error);}finally{if(select.isConnected)select.disabled=false;}
  };
  try{
    const [branches,contents]=await Promise.all([gh.branches(repo.full_name),gh.contents(repo.full_name,selectedBranch,selectedPath)]);
    if(epoch!==loadEpoch)return;
    $('#branch-select').innerHTML=branches.map(b=>`<option value="${esc(b.name)}" ${b.name===selectedBranch?'selected':''}>${esc(b.name)}</option>`).join('');
    if(!Array.isArray(contents))throw new Error(t('当前路径不是文件夹。'));
    if(remoteSelectionRepo!==gitHostKey(gh)+'/'+repo.full_name+'/'+selectedBranch){remoteSelection.clear();remoteSelecting=false;remoteSelectionRepo=gitHostKey(gh)+'/'+repo.full_name+'/'+selectedBranch;}
    contents.sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):a.type==='dir'?-1:1));
    $('#file-list').innerHTML=(selectedPath?`<div class="file-row"><button data-parent="true"><span class="doc-symbol">${icon('back')}</span>${t('上级目录')}</button></div>`:'')+contents.map((f,i)=>`<div class="file-row" data-remote-row="${i}"><input type="checkbox" data-remote-select="${i}" aria-label="${esc(t('选择')+' '+f.name)}" hidden><button data-file="${i}"><span class="doc-symbol">${f.type==='dir'?icon('files'):fileIcon(fileKind(f.name))}</span><span data-user-content>${esc(f.name)}</span></button><small>${f.type==='dir'?t('文件夹'):formatBytes(f.size)}</small>${f.type==='dir'?`<button data-browse="${i}" aria-label="${esc(t('打开')+' '+f.name)}">${icon('arrowRight')}</button>`:''}${f.type==='file'?`<button data-delete="${i}" title="${t('删除远端文件')}" aria-label="${esc(t('删除')+' '+f.name)}">${icon('trash')}</button>`:''}</div>`).join('');
    setupRemoteSelection(contents);if(githubOffline||repo.permissions?.push===false||repo.archived)root.querySelectorAll('[data-delete]').forEach(button=>button.disabled=true);
    $('#file-list').onclick=async e=>{try{
      if(e.target.closest('[data-remote-select]'))return;
      const browse=e.target.closest('[data-browse]');if(browse){selectedPath=contents[Number(browse.dataset.browse)].path;renderRepository();return;}
      if(e.target.closest('[data-file]')&&(remoteSelecting||e.ctrlKey||e.metaKey)){
          if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(e.target.closest('[data-file]').dataset.file)]);
          window.__remoteHoldClick=false;
          return;
        }
      if(e.target.closest('[data-parent]')){selectedPath=selectedPath.split('/').slice(0,-1).join('/');renderRepository();return;}
      const open=e.target.closest('[data-file]'),del=e.target.closest('[data-delete]');
      if(open){const f=contents[Number(open.dataset.file)];if(f.type==='dir'){selectedPath=f.path;renderRepository();}else await openRemote(repo.full_name,selectedBranch,f.path);}
      if(del){
          const f=contents[Number(del.dataset.delete)],branch=selectedBranch;
          // i18n-data: file names, matching text and editable defaults stay as written
          openModal(t('删除远端文件'),`<p>${say(`将从 ${esc(repo.full_name)} 的 ${esc(branch)} 分支删除 ${esc(f.path)}。本地文稿不会删除。`,`Delete ${esc(f.path)} from ${esc(repo.full_name)} on branch ${esc(branch)}. Local documents are kept.`)}</p><label>${t('提交说明')}<input name="message" required value="${esc(/* User-editable commit message. */ '删除 '+f.name)}"></label>`,async data=>{
            await gh.deleteFile({repo:repo.full_name,branch,path:f.path,sha:f.sha,message:data.get('message')});
            renderRepository();
          },{label:t('确认删除并提交')});
        }
    }catch(e){fail(e);}};
  }catch(e){if(epoch===loadEpoch)$('#file-list').innerHTML=`<p class="error" style="padding:16px">${esc(t(e.message))}</p>`;}
}
function toggleRemoteFile(file){remoteSelecting=true;if(remoteSelection.has(file.path))remoteSelection.delete(file.path);else remoteSelection.set(file.path,file);renderRemoteSelection();}
function renderRemoteSelection(){
  if($('#file-list'))$('#file-list').dataset.selecting=String(remoteSelecting);
  if($('#remote-multi'))$('#remote-multi').hidden=remoteSelecting;
  if($('#remote-selected-count'))$('#remote-selected-count').hidden=!remoteSelecting;
  document.querySelectorAll('[data-remote-select]').forEach(input=>{
    input.hidden=!remoteSelecting;
    input.checked=remoteSelection.has(input.dataset.remotePath);
    input.closest('.file-row').classList.toggle('selected',input.checked);
  });
  for(const id of ['remote-select-all','remote-pull-selected','remote-cancel-selection'])if($('#'+id))$('#'+id).hidden=!remoteSelecting;
  if($('#remote-pull-selected'))$('#remote-pull-selected').disabled=!remoteSelection.size;
  if($('#remote-selected-count'))$('#remote-selected-count').textContent=remoteSelecting?t('已选 ')+remoteSelection.size:'';
}
function setupRemoteSelection(contents){
  const list=$('#file-list');let timer,start;window.__remoteHoldClick=false;
  list.querySelectorAll('[data-remote-select]').forEach(input=>{
    input.dataset.remotePath=contents[Number(input.dataset.remoteSelect)].path;
    input.onchange=()=>toggleRemoteFile(contents[Number(input.dataset.remoteSelect)]);
  });
  const cancel=()=>{
    clearTimeout(timer);
    start=null;
  };list.onpointerdown=e=>{
    const row=e.target.closest('[data-remote-row]');
    if(!row||e.target.closest('input,[data-delete],[data-browse]'))return;
    start={x:e.clientX,y:e.clientY};
    timer=setTimeout(()=>{toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;},400);
  };list.onpointermove=e=>{
    if(start&&movedBeyond(start,e,SWIPE_SLOP))cancel();
  };list.onpointerup=cancel;list.onpointercancel=cancel;list.oncontextmenu=e=>{
    const row=e.target.closest('[data-remote-row]');
    if(row){e.preventDefault();cancel();if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;}
  };
  $('#remote-multi').onclick=()=>{
    remoteSelecting=true;
    renderRemoteSelection();
  };$('#remote-select-all').onclick=()=>{
    remoteSelecting=true;
    for(const file of contents)remoteSelection.set(file.path,file);
    renderRemoteSelection();
  };$('#remote-cancel-selection').onclick=()=>{
    remoteSelection.clear();
    remoteSelecting=false;
    renderRemoteSelection();
  };$('#remote-pull-selected').onclick=()=>pullWholeRepository([...remoteSelection.keys()]);renderRemoteSelection();
}
async function openRemote(repo,branch,path){
  const client=gh,host=gitIdentity(client),before=workspace.documents.find(d=>sameRepository(d.remote,{...host,repo,branch})&&d.remote.path===path);
  const file=await syncActivity.run(before?.id||gitHostKey(client)+'/'+repo+'/'+path,()=>client.readFile(repo,branch,path));if(!save())throw Error(t('请先保存当前文稿。'));
  const remoteText=/\.(csv|tsv)$/i.test(path)?file.text:normalizeText(file.text),merged=before?mergeVelaTexts(path,before.remote?.lastSyncedText,before.text,remoteText):null;
  if(before&&merged===null&&!syncTextEqual(path,before.text,remoteText)&&!syncTextEqual(path,before.remote?.lastSyncedText,before.text)){
    const local=before.text;let resolved;
    openModal(t('本地与远端内容冲突'),`<p>${t('不重叠的修改会自动合并；重叠的段落由你选择或编辑。保存前保留本地历史。')}</p>${conflictMarkup(local,remoteText,esc)}`,async()=>{
      await syncActivity.run(before.id,async()=>{
        if(!syncTextEqual(path,before.text,local))throw Error(t('预览后本地文稿已变化，请重新拉取。'));
        const text=preserveVelaPositions(path,resolved(),before.text);if(textBytes(text)>MAX_TEXT_BYTES)throw Error(t('合并后的文件超过 8 MB。'));
        documents.checkpoint(before);documents.change(before,text);before.remote={...host,repo,branch,path,sha:file.sha,lastSyncedText:remoteText,syncedAt:Date.now()};
        editorStates.delete(before.id);if(view&&workspace.activeId===before.id){view.setState(makeState(before));index=null;updateStats();if(isPreview)renderPreview();}
        resolveRepositoryConflict(workspace,{...host,repo,branch,path,sha:file.sha,text:remoteText});
        renderDocuments();if(!save())throw Error(t('合并结果保存失败，请导出备份。'));
      });
    },{label:t('保存合并结果')});resolved=bindConflict($('#dialog-body'),{base:before.remote?.lastSyncedText,local,remote:remoteText,escape:esc});return false;
  }
  const doc=applyRemoteFile(workspace,{...host,repo,branch,path,text:merged??preserveVelaPositions(path,remoteText,before?.text),remoteText,sha:file.sha},workspace.repositories?.find(item=>sameRepository(item,{...host,repo,branch}))?.folder||'');
  resolveRepositoryConflict(workspace,{...host,repo,branch,path,sha:file.sha,text:remoteText});
  editorStates.delete(doc.id);if(view&&workspace.activeId===doc.id){
    view.setState(makeState(doc));
    index=null;
    updateStats();
    if(isPreview)renderPreview();
  }renderDocuments();if(!save())throw Error(t('拉取后本地保存失败，请导出备份。'));renderSyncStatus();toast(before?t('已更新远端文件'):t('已拉取远端文件'));return true;
}
function pullWholeRepository(selection=null){
  const repo=selectedRepo,branch=selectedBranch,client=gh;if(!repo)return;
  if(!native||!workspace.storage?.id){toast(t('请在应用中拉取仓库文件。'));return;}
  const folder=repositoryFolder(workspace,repo.full_name,gh.provider,gh.server,branch),abort=new AbortController();
  openModal(selection?t('拉取选中项'):t('拉取整个仓库'),`${selection?`<p>${say(`${selection.length} 个选中项（文件夹包含全部子项）`,`${selection.length} selected items (including all folder contents)`)}</p>`:''}<p>${esc(repo.full_name)} / ${esc(branch)}</p>
    <p>${say(`保存到当前工作区的“${esc(folder)}”文件夹。随后预览新增、修改和远端删除项；本地独有文件保留。`,`Save to “${esc(folder)}” in the current workspace, then preview additions, changes and remote deletions. Local-only files are kept.`)}</p>
    <p id="pull-progress"></p>
    <button type="button" class="secondary" id="cancel-pull" hidden>${t('取消拉取')}</button>`,async()=>{
    if(!save())throw new Error(t('请先保存当前文稿。'));
    $('#cancel-pull').hidden=false;
    const result=await syncWorkflow.run(()=>client.pullRepository(repo.full_name,branch,{selection,signal:abort.signal,onProgress:p=>{
      $('#pull-progress').textContent=say(`处理 ${p.done} / ${p.total} · 复用 ${p.reused||0} · 下载 ${p.downloaded||0} ${p.path}`,`Processing ${p.done} / ${p.total} · Reused ${p.reused||0} · Downloaded ${p.downloaded||0} ${p.path}`);
    }}));
    await previewDownload(result,folder,async selected=>{
      await materializeDownload(selected,folder);
      restorePulledEditor('github');
      if(!save())throw new Error(t('文件已拉取，但关联信息保存失败，请刷新工作区。'));
      remoteSelection.clear();
      remoteSelecting=false;
      renderRepository();
      toast(say(`已拉取 ${selected.files.length} 个文件到 ${folder}${selected.deletions?.length?'，'+selected.deletions.length+' 个旧文件已移入回收站':''}`,`Pulled ${selected.files.length} files into ${folder}${selected.deletions?.length?'; '+selected.deletions.length+' old files moved to trash':''}`));
    },client);
    return false;
  },{label:t('拉取到工作区'),cancel:()=>abort.abort()});
  $('#cancel-pull').onclick=()=>abort.abort();
}
async function showGitHistory(repo,branch,page=1){
  try{const commits=await gh.commits(repo,branch,page);if(!Array.isArray(commits))throw Error(t('提交记录格式无效'));
    openModal(t('提交记录'),`<p data-user-content>${esc(repo)} / ${esc(branch)}</p>
      ${commits.map(item=>`<article class="git-history-item"><strong data-user-content>${esc(item.commit?.message?.split('\n')[0]||'')}</strong><small data-user-content>${esc(item.sha?.slice(0,8))} · ${esc(item.commit?.author?.name)} · ${esc(item.commit?.author?.date)}</small></article>`).join('')||`<p>${t('暂无提交记录')}</p>`}<div class="button-row"><button type="button" id="history-prev" ${page>1?'':'disabled'}>←</button><span>${page}</span><button type="button" id="history-next" ${commits.length===30?'':'disabled'}>→</button></div>`,null,{noSubmit:true});
    $('#history-prev').onclick=()=>showGitHistory(repo,branch,page-1);$('#history-next').onclick=()=>showGitHistory(repo,branch,page+1);
  }catch(error){fail(error);}
}
function gitDocument(){if(!current()){showView('github');return;}if(!account){showView('github');toast(t('连接代码托管平台后，即可关联仓库并提交文稿。'));return;}commitDocument();}
function commitDocument(suggestRepo,suggestBranch){
  if(!account){showView('github');return;}
  if(!repositories.length){showView('github');toast(t('请先新建或获得一个可写仓库。'));return;}
  const doc=current();if(!doc){showView('write');showHome();toast(t('请先打开需要提交的文件。'));return;}const remote=sameGitHost(doc.remote,gh)?doc.remote:null;
  const initialRepo=suggestRepo||remote?.repo||repositories[0].full_name;
  const initialBranch=suggestBranch||remote?.branch||repositories.find(r=>r.full_name===initialRepo)?.default_branch||'main';
  // i18n-data: file names, matching text and editable defaults stay as written
  openModal(say(`提交文稿到 ${gitName()}`,`Commit document to ${gitName()}`),`<p>${say(`将提交“${esc(doc.name)}”的当前内容。`,`Commit the current content of “${esc(doc.name)}”.`)}</p>
    <label>${t('仓库')}<select name="repo" id="commit-repo">${repositories.map(r=>`<option value="${esc(r.full_name)}" ${r.full_name===initialRepo?'selected':''}>${esc(r.full_name)}${r.private?t('（私有）'):''}</option>`).join('')}</select></label>
    <label>${t('分支')}<input name="branch" id="commit-branch" required value="${esc(initialBranch)}"></label>
    <label>${t('文件路径')}<input name="path" required value="${esc(remote?.path||doc.name)}"></label>
    <label>${t('提交说明')}<input name="message" required value="${esc('更新 '+doc.name)}"></label>
    <small>${say(`${remote?.deleted?t('远端已删除此文件，本次提交将重新创建。'):''}只提交此文稿。已关联文件使用上次读取的版本；同名远端文件不会被自动覆盖。发生冲突时，可以拉取后逐段合并。`,`${remote?.deleted?t('远端已删除此文件，本次提交将重新创建。'):''}Commit this document only, using its last-read revision. Existing remote files are not automatically overwritten. Pull and merge sections if a conflict occurs.`)}</small>${remote?`<p><button type="button" class="secondary" id="read-remote">${t('拉取并处理修改')}</button></p>`:''}`,async f=>{
    if(!save())throw new Error(t('本地保存失败，请先导出备份。'));
    const repo=f.get('repo'),branch=f.get('branch').trim(),path=repoPath(f.get('path'));
    const sha=remote&&!remote.deleted&&remote.repo===repo&&remote.branch===branch&&remote.path===path?remote.sha:undefined;
    const text=doc.text,message=f.get('message'),before=sha?(remote.lastSyncedText??await gh.blobText(repo,sha)):'';
    openModal(t('确认提交变更'),`${syncTargetMarkup({...gitIdentity(gh),repo,branch,path},undefined,esc)}${diffMarkup(before,text,esc)}<p data-user-content>${esc(message)}</p>`,async()=>{
      if(!syncTextEqual(path,doc.text,text))throw Error(t('预览后文件已变化，请重新生成提交预览。'));
      const submittedText=doc.text;
      const result=await syncActivity.run(doc.id,()=>gh.commit({repo,branch,path,sha,text:submittedText,message}));
      doc.remote={...gitIdentity(gh),repo,branch,path,sha:result.content.sha,lastSyncedText:submittedText,syncedAt:Date.now()};
      save();
      renderDocuments();
      toast(say(`文稿已提交到 ${repo}`,`Document committed to ${repo}`)+' / '+branch+' · '+result.commit?.sha?.slice(0,8));
    },{label:say(`提交到 ${gitName()}`,`Commit to ${gitName()}`)});
    return false;
  },{label:say(`提交到 ${gitName()}`,`Commit to ${gitName()}`)});
  $('#commit-repo').onchange=e=>{$('#commit-branch').value=repositories.find(r=>r.full_name===e.target.value)?.default_branch||'main';};
  if(remote)$('#read-remote').onclick=async()=>{try{if(await openRemote(remote.repo,remote.branch,remote.path))closeModal();}catch(e){$('#dialog-error').textContent=t(e.message);}};
}

const commands = createAppCommands(
  shortcuts.map(([id]) => id),
  {
    page: () => pageName,
    home: () => home,
    formatToolsVisible: () => !$('#format-tools').hidden,
    togglePreview,
    closeActive: () => {
      const doc = current();
      if (doc) closeDocument(doc.id);
    },
    button: (id) => document.getElementById(id),
  },
);
function runAction(id) {
  return commands.execute(id);
}
bindAppShortcuts(document, {
  shortcuts,
  matchesKey,
  button: (id) => document.getElementById(id),
  page: () => pageName,
  mapBack: () => isPreview && documentKind(current()) === 'MAP' && mapBack(),
  dialogOpen: () => $('#dialog').open,
  escapeHome: () => {
    if (!home || pageName !== 'write' || $('#start-page').dataset.panel !== 'recent') return false;
    setStartPanel($('#start-page'), 'actions');
    return true;
  },
  search: () => editing.search(),
  bookmark: () => editing.bookmark(),
  zoom: (key) => {
    if(pageName==='write'&&!home&&isPreview&&documentKind(current())==='CSV'){
      const grid=csvEditor?.grid;if(grid)grid.zoom(key==='0'?1:grid.plane.scale*(['+','='].includes(key)?1.2:1/1.2));return;
    }
    if(pageName==='write'&&!home&&isPreview&&documentKind(current())==='TEX'&&texPreview?.pdf){texPreview.setZoom(key==='0'?1:texPreview.zoom*(['+','='].includes(key)?1.2:1/1.2));return;}
    const size = (value) => (key === '0' ? 16 : value + (['+', '='].includes(key) ? 1 : -1));
    if (pageName === 'reader') {
      if (reader?.id) {
        reader.setSize(size(reader.size));
        workspace.readerSizes = { ...workspace.readerSizes, [reader.id]: reader.size };
        save();
      }
      return;
    }
    setFontSize(size(textFontSize));
    save();
  },
  execute: runAction,
});
$('#commands').onclick=()=>{
  const group=(name,list)=>list.map(item=>({...item,group:name}));
  const items=[
    ...group(t('文稿与导出'),[
    {name:t('链接到大纲节点…'),key:'',run:()=>linkOutlineSelection()},
    {name:t('本地历史与恢复'),key:'',run:showLocalHistory},
    {name:t('导出章节文本…'),key:'',run:showChapterExport},
    {name:t('复制本章文本'),key:'',run:copyCurrentChapter},
    {name:t('导出全书为 HTML（保留格式）'),key:'',run:exportBookHtml},
    {name:t('导出 EPUB…'),key:'',run:()=>showEpubExport()}
  ]),
    ...group(t('TXT 格式'),[
    {name:say(`${workspace.settings.richText?'关闭':'开启'} TXT 格式工具（本机）`,`${workspace.settings.richText?'Disable':'Enable'} TXT format tools (this device)`),key:'',run:()=>{
    workspace.settings.richText=!workspace.settings.richText;
    save();
    updateEditorVisibility();
    toast(workspace.settings.richText?t('TXT 格式工具已开启：粗体、着重号、居中，格式另存为同名 .vela 旁注。'):t('TXT 格式工具已关闭；已有格式仍会显示。'));
  }},
    {name:t('格式待确认…'),key:'',run:showFormatReview},
    {name:t('注音…'),key:'',run:showRubyDialog},
    {name:t('插入插图…'),key:'',run:()=>showImageDialog()},
    {name:t('插入 CSV 表格…'),key:'',run:()=>showTableDialog()},
    {name:t('管理样式…'),key:'',run:()=>showStyleManager()}
  ]),
    ...group(t('外观'),[{name:t('自定义配色…'),key:'',run:()=>showPaletteEditor()}]),
    ...group(t('写作工具'),(editing?.commands()||[]).map(item=>({...item,name:t(item.name)}))),
    ...group(t('界面与快捷键'),shortcuts.map(([id,,key,name])=>({name:t(name),key,run:()=>runAction(id)}))),
    ...group(t('插件'),[...(plugins?.commands.values()||[])].map(command=>({name:command.title,key:command.shortcut||'',run:()=>plugins.execute(command.name)})))
  ];
  openModal(t('命令与快捷键'),`<input id="command-search" placeholder="${t('搜索命令')}" aria-label="${t('搜索命令')}" autofocus><div id="command-list"></div><small>${t('Tab：缩进两个全角空格；Shift+Tab：取消缩进。Ctrl+加号 / 减号 / 0：调整或重置文字字号。')}</small>`,null,{noSubmit:true});
  const render=()=>{
    const query=$('#command-search').value.toLowerCase();
    let last='';
    $('#command-list').innerHTML=items.map((item,i)=>({item,i})).filter(({item})=>item.name.toLowerCase().includes(query)||item.key.toLowerCase().includes(query)||item.group.toLowerCase().includes(query)).map(({item,i})=>{
      const heading=!query&&item.group!==last?`<div class="command-group" role="presentation">${esc(item.group)}</div>`:'';
      last=item.group;
      return heading+`<button type="button" class="command-item" data-command="${i}"><span>${esc(item.name)}</span>${query?`<small class="command-group-tag">${esc(item.group)}</small>`:''}<kbd>${esc(item.key)}</kbd></button>`;
    }).join('')||`<p class="blank">${t('没有匹配的命令。')}</p>`;
  };render();$('#command-search').oninput=render;
  $('#command-list').onclick=e=>{const b=e.target.closest('[data-command]');if(b){closeModal();Promise.resolve(items[Number(b.dataset.command)].run()).catch(fail);}};
};
function showLocalHistory(){
  const doc=current();
  if(!doc)return;
  const versions=documents.history(doc);
  openModal(t('本地历史与恢复'),`<div class="history-list">${versions.map((item,i)=>`<button type="button" class="secondary" data-history="${i}">${say(`${esc(new Date(item.createdAt).toLocaleString())} · r${item.revision} · ${item.text.length} 字符`,`${esc(new Date(item.createdAt).toLocaleString())} · r${item.revision} · ${item.text.length} characters`)}</button>`).join('')||`<p>${t('暂无历史版本。保存修改后会保留之前的内容。')}</p>`}</div>
    <pre id="history-diff" class="history-diff"></pre><button type="button" class="primary" id="restore-history" disabled>${t('恢复所选版本')}</button>`,null,{noSubmit:true});
  let selected=-1;
  $('.history-list').onclick=e=>{
    const b=e.target.closest('[data-history]');
    if(!b)return;
    selected=Number(b.dataset.history);
    const diff=diffLines(documents.restore(doc,selected),doc.text);
    $('#history-diff').textContent=say(`行 ${diff.from}\n`,`Line ${diff.from}\n`)+diff.removed.map(line=>'- '+line).join('\n')+'\n'+diff.added.map(line=>'+ '+line).join('\n')+(diff.truncated?'\n…':'' );
    $('#restore-history').disabled=false;
  };
  $('#restore-history').onclick=()=>{
    const text=documents.restore(doc,selected);
    documents.snapshot(doc,true);
    closeModal();
    if(view)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.restore'});else documents.change(doc,text,[],{important:true});
    save(true);
  };
}
async function copyText(text){if(native)await transport('clipboardWrite',{text});else await navigator.clipboard.writeText(text);}
/** Current chapter index for the cursor, so dialogs and commands default to the chapter being written. */
const {showChapterExport,showEpubExport,exportBookHtml,copyCurrentChapter}=createExportDialogs({
  get view(){return view;},get workspace(){return workspace;},current,ensureIndex,openModal,closeModal,toast,save,copyText,stylesFor,exportImages,exportTables,
});
async function pickBackupFile(){
  if(native){const files=await transport('import',{}),file=files?.[0];if(!file)return null;return typeof file.text==='string'?new TextEncoder().encode(file.text):fromBase64(file.data);}
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file';
    input.accept='.json,application/json';
    input.onchange=async()=>{const file=input.files[0];resolve(file?new Uint8Array(await file.arrayBuffer()):null);};
    input.oncancel=()=>resolve(null);
    input.click();
  });
}
/** Restore an exported backup into a new folder; existing files, settings and repository links stay as they are. */
function previewBackupRestore(bytes){
  const backup=readWorkspaceBackup(bytes),total=backup.documents.length,trashed=(backup.trash||[]).reduce((sum,item)=>sum+(item.documents||[]).length,0);let plan;
  // i18n-data: file names, matching text and editable defaults stay as written
  openModal(t('恢复文稿备份'),`<p>${say(`备份包含 ${total} 篇文稿${trashed?'，回收站中另有 '+trashed+' 篇':''}。`,`The backup contains ${total} documents${trashed?', plus '+trashed+' in trash':''}.`)}</p>
    <label>${t('恢复到新文件夹')}<input name="folder" required maxlength="120" value="恢复的备份 ${new Date().toISOString().slice(0,10)}"></label>
    <small>${t('文稿恢复到新文件夹并使用新的身份，现有文件和设置保留；词库与写作片段合并，本地历史与批注随文稿恢复。')}</small>`,async form=>{
    if(!save())throw Error(t('请先保存当前文稿。'));
    plan||=prepareBackupRestore(backup,form.get('folder'));
    const candidate=mergeBackupRestore(workspace,plan);
    saveWorkspace(candidate);
    adoptProjectState(candidate);
    toast(say(`备份已恢复到“${candidate.restoredImports.at(-1).folder}”。`,`Backup restored to “${candidate.restoredImports.at(-1).folder}”.`)+(plan.skipped?say(`已跳过 ${plan.skipped} 个二进制或插件文稿。`,`Skipped ${plan.skipped} binary or plugin documents.`):''));
  });
}
async function showPlugins(){
  if(!plugins)return;await plugins.ready;
  openModal(t('插件与组件'),`<p><button type="button" class="primary" id="install-plugin">${t('从 ZIP 安装')}</button></p>
    <section class="component-downloads" id="component-downloads"></section>
    <h3>${t('已安装')}</h3>
    <small>${t('可安装 LaTeX 引擎、中文支持、电子书阅读与 JavaScript / CodeMirror 插件。内置组件可停用，轻量版导入的组件可卸载。依赖 Android、Cordova、Ace 或未实现的 Acode 模块的插件会显示加载原因。')}</small><div class="plugin-list">${plugins.records.map((record,i)=>`<article class="plugin-card"><strong>${esc(record.manifest.id.startsWith('vela.component.tex')?t(record.manifest.name):record.manifest.name)}</strong><small>${esc(record.manifest.id)} · ${esc(record.manifest.version)} · ${record.builtin?t('内置组件'):record.manifest.vela?.type==='tex-component'||['reader-component','document-component'].includes(record.manifest.vela?.type)?t('可选组件'):t('插件')} · ${record.enabled?t('已启用'):t('已停用')}</small>${record.error?`<p class="error">${esc(t(record.error))}</p>`:''}<div class="button-row"><button type="button" class="secondary" data-plugin-enable="${i}">${record.enabled?t('停用'):t('启用')}</button>${record.manifest.vela?.type==='reader-component'?`<button type="button" class="secondary" data-plugin-open="${i}" ${record.enabled?'':'disabled'}>${t('打开阅读器')}</button>`:''}${plugins.settingsPages.has(record.manifest.id)?`<button type="button" class="secondary" data-plugin-settings="${i}">${t('插件设置')}</button>`:''}${record.builtin?'':`<button type="button" class="danger" data-plugin-remove="${i}">${t('卸载')}</button>`}</div>
    </article>`).join('')||`<p class="blank">${t('尚未安装插件。')}</p>`}</div>`,null,{noSubmit:true});
  const pluginSession=$('#dialog-body').viewSession;
  chunkLoading($('#component-downloads'));
  loadComponentDownloads().then(({mountComponentDownloads})=>{
    if(!pluginSession.alive())return;
    const downloadView=mountComponentDownloads($('#component-downloads'),{transport,native,platform:environment?.platform||'',appVersion:environment?.version||__VELA_HARMONY_VERSION__,descriptor:()=>texCompiler.assets.descriptor(),installed:async()=>new Map(plugins.records.map(record=>[record.manifest.id,{version:record.manifest.version,enabled:record.enabled}])),install:async bytes=>{
      await installPluginBytes(bytes,{reopen:false});
      if(pluginSession.alive())await showPlugins();
    }});pluginSession.onDispose(()=>downloadView.dispose());
  }).catch(error=>{if(pluginSession.alive())chunkFailure($('#component-downloads'),error,showPlugins);});
  $('#install-plugin').onclick=async e=>{
    if(native){
      const button=e.currentTarget;
      button.disabled=true;
      try{
        const result=await transport('importPlugin');
        if(result)await installPluginBytes(await readImportedArchive(result,token=>transport('releaseImport',{token})));
      }catch(e){
        $('#dialog-error').textContent=t(e.message);
      }finally{
        button.disabled=false;
      }
    }else $('#plugin-input').click();
  };
  $('.plugin-list').onclick=async e=>{try{
    const action=e.target.closest('button');if(action)action.disabled=true;
    const enable=e.target.closest('[data-plugin-enable]'),remove=e.target.closest('[data-plugin-remove]'),settings=e.target.closest('[data-plugin-settings]');
    const open=e.target.closest('[data-plugin-open]');if(open){
        const record=plugins.records[Number(open.dataset.pluginOpen)];
        closeModal();
        if(plugins.commands.has(record.manifest.id+'.open'))await plugins.execute(record.manifest.id+'.open');
      }
    if(enable){const record=plugins.records[Number(enable.dataset.pluginEnable)];await plugins.enable(record,!record.enabled);showPlugins();}
    if(remove){await plugins.remove(plugins.records[Number(remove.dataset.pluginRemove)]);showPlugins();}
    if(settings)showPluginSettings(plugins.records[Number(settings.dataset.pluginSettings)]);
  }catch(error){$('#dialog-error').textContent=t(error.message);}finally{if(e.target.closest('button'))e.target.closest('button').disabled=false;}};
}
function showPluginSettings(record){
  const config=plugins.settingsPages.get(record.manifest.id);if(!config)return;
  const items=config.list||[];
  openModal(say(`${record.manifest.name} · 设置`,`${record.manifest.name} · Settings`),items.map((item,i)=>`<label>${esc(item.text||item.key||t('设置'))}<input name="${i}" ${item.checkbox?'type="checkbox" '+(item.value?'checked':''):`value="${esc(item.value??'')}"`}></label>`).join(''),async f=>{
    for(let i=0;i<items.length;i++)await config.cb?.(items[i].key,items[i].checkbox?f.has(String(i)):f.get(String(i)));
    plugins.save();
  });
}
async function installPluginBytes(bytes,{reopen=true}={}){
  if(isTexComponentArchive(bytes)){await plugins.installComponent(bytes);if(reopen)await showPlugins();toast(t('离线排版组件已安装。'));return;}
  const record=await plugins.install(readPluginZip(bytes));
  if(reopen)await showPlugins();
  if(record.error)$('#dialog-error').textContent=record.error;else toast(say(`插件已安装：${record.manifest.name}`,`Plugin installed: ${record.manifest.name}`));
}
$('#plugins').onclick=showPlugins;
$('#check-update').onclick=()=>checkWindowsUpdates(true);
// TeX: Ctrl+Enter compiles and Ctrl+Alt+J shows the cursor line in the PDF while the preview is open.
document.addEventListener('keydown',event=>{
  if(!isPreview||!current()||documentKind(current())!=='TEX'||!texPreview?.root)return;
  const mod=event.ctrlKey||event.metaKey;
  if(mod&&!event.altKey&&event.key==='Enter'){event.preventDefault();texPreview.compile().catch(fail);}else if(mod&&event.altKey&&event.key.toLowerCase()==='j'){event.preventDefault();texPreview.locate().catch(fail);}
});
$('#plugin-input').onchange=async e=>{
  const button=$('#install-plugin');
  if(button)button.disabled=true;
  try{
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>96*MB)throw new Error(t('安装包 ZIP 不能超过 96 MB。'));
    await installPluginBytes(new Uint8Array(await file.arrayBuffer()));
  }catch(error){
    $('#dialog-error').textContent=t(error.message);
  }finally{
    e.target.value='';
    if(button)button.disabled=false;
  }
};
function refreshPluginCommands(){
  for(const [id,state] of editorStates)editorStates.set(id,state.update({effects:[pluginKeys.reconfigure(keymap.of(plugins?.bindings()||[])),pluginExtras.reconfigure(plugins?.extensions()||[])]}).state);
  if(view&&pluginKeys.get(view.state)!==undefined)view.dispatch({effects:[pluginKeys.reconfigure(keymap.of(plugins?.bindings()||[])),pluginExtras.reconfigure(plugins?.extensions()||[])]});
}
function pluginDialog(title,message,kind,value=''){
  return new Promise(resolve=>openModal(title,kind==='prompt'?`<label>${esc(title)}<input name="value" value="${esc(value)}"></label>`:`<p>${esc(message)}</p>`,f=>{
    resolve(kind==='prompt'?f.get('value'):true);
  },{cancel:()=>resolve(kind==='prompt'?null:false)}));
}
function currentScope(){
  const project=projectConfig(workspace,current());
  if(project?.folder&&(!selectedFolder||within(project.folder,selectedFolder)))return project.folder;
  return selectedFolder|| (current()?parentPath(documentPath(current())):'');
}
async function commitWholeWorkspace(repo=selectedRepo?.full_name||'',branch=selectedBranch||''){
  if(!account){showView('github');return;}if(!repositories.length){showView('github');toast(t('请先新建或获得一个可写仓库。'));return;}if(!save())return;
  const folder=currentScope();for(const doc of workspace.documents.filter(doc=>doc.subscription&&(!folder||documentPath(doc).startsWith(folder+'/'))))await loadSubscriptionDocument(doc);
  const docs=workspace.documents.filter(doc=>!folder||documentPath(doc).startsWith(folder+'/'));
  const others=(workspace.entries||[]).filter(entry=>!entry.directory&&!docs.some(doc=>documentPath(doc)===entry.path)&&(!folder||entry.path.startsWith(folder+'/')));
  if(!docs.length&&!others.length){toast(t('当前工作区没有文件。'));return;}
  openModal(t('提交整个工作区'),`<p>${t('工作区')}${say('：',': ')}<span data-user-content>${esc(folder||'/')}</span> · ${docs.length+others.length} ${t('文件')}</p>
    <label>${t('仓库')}<select name="repo" required>${repositories.map(item=>`<option value="${esc(item.full_name)}" ${item.full_name===repo?'selected':''}>${esc(item.full_name)}</option>`).join('')}</select></label>
    <label>${t('分支')}<input name="branch" required value="${esc(branch||repositories.find(item=>item.full_name===repo)?.default_branch||repositories[0]?.default_branch||'main')}"></label>
    <label>${t('仓库目录')}<input name="prefix" placeholder="${t('留空提交到仓库根目录')}"></label>
    <label>${t('提交说明')}<input name="message" required value="Update workspace"></label>
    <p>${t('包含配置、文稿和附件；同路径文件覆盖，仓库其他文件保留。')}</p>`,async form=>{
    if(!save())throw new Error(t('请先保存文稿。'));
    const files=docs.map(doc=>({path:documentPath(doc).slice(folder?folder.length+1:0),text:doc.text}));
    for(const entry of others){if(!native)throw new Error(t('浏览器不能读取此附件，请在应用中提交。'));files.push({path:entry.path.slice(folder?folder.length+1:0),data:await transport('readWorkspaceFile',{path:entry.path})});}
    await showCommitPreview({repo:form.get('repo'),branch:form.get('branch').trim(),prefix:form.get('prefix').trim(),folder,files,message:form.get('message')});
    return false;
  },{label:t(say(`提交到 ${gitName()}`,`Commit to ${gitName()}`))});
}
function ensureGlobalVela(){
  const existing=globalConfig(workspace);if(existing)return existing.doc;
  const config=createVelaV2('全局默认配置',{global:true});
  const doc=newDocument(GLOBAL_VELA_PATH,velaText(config));doc.path=GLOBAL_VELA_PATH;workspace.documents.push(doc);renderDocuments();return doc;
}
function showCommitPreview(options){
  return previewCommit(options,{workspace,client:gh,activity:syncActivity,openModal,escape:esc,save,toast});
}
$('#add-glossary').onclick=()=>addSelectionToGlossary();
function addSelectionToGlossary(selectionText,sourceDoc=current()){
  const doc=sourceDoc,range=view?.state.selection.main;if(!doc||selectionText===undefined&&(!range||range.empty)){toast(t('请先选中要加入术语库的词汇。'));return;}
  const selected=(selectionText??view.state.doc.sliceString(range.from,range.to)).trim();if(!selected||selected.length>120||/[\r\n]/.test(selected)){toast(t('词条须为 1–120 字符且不能换行。'));return;}
  const project=projectConfig(workspace,doc),scope=project&&!project.global?project.folder:parentPath(documentPath(doc)),configured=glossaryPaths(workspace,doc),sources=workspace.documents.filter(item=>documentKind(item)==='GLY'&&(!scope||documentPath(item).startsWith(scope+'/'))).sort((a,b)=>Number(configured.includes(documentPath(b)))-Number(configured.includes(documentPath(a))));
  // i18n-data: file names, matching text and editable defaults stay as written
  openModal(t('选中词加入术语库'),`<label>${t('词条')}<input name="term" maxlength="120" required value="${esc(selected)}"></label>
    <label>${t('术语库文件')}<select name="source">${sources.map(item=>`<option value="${esc(item.id)}">${esc(documentPath(item))}</option>`).join('')}<option value="new">${t('新建术语库')}</option></select></label>
    <label>${t('新术语库文件名')}<input name="filename" value="术语库.gly"></label>
    <label>${t('释义')}<textarea name="definition" maxlength="4000" rows="3"></textarea></label>
    <p>${t('加入后会将术语库关联到当前工作区配置。')}</p>`,form=>{
    if(project?.error)throw project.error;
    const existing=sources.find(item=>item.id===form.get('source'));
    let source=existing,path=source&&documentPath(source);
    if(!source){
      const name=fileName(form.get('filename'));
      if(!/\.(gly|glossary)$/i.test(name))throw Error(t('术语库文件需要 .gly 或 .glossary 后缀。'));
      path=(scope?scope+'/':'')+name;
      if(itemPaths(workspace).has(path))throw Error(t('此路径已存在。'));
      source={...newDocument(name,glossaryText(createGlossary(name))),path};
    }
    if(scope&&!path.startsWith(scope+'/'))throw Error(t('请选择当前工作区内的术语库。'));
    const data=parseGlossary(source.text);
    data.entries.push({id:crypto.randomUUID(),term:form.get('term').trim(),definition:form.get('definition'),aliases:[]});
    const text=glossaryText(data);
    const configDoc=project&&!project.global?project.doc:newDocument('.vela',''),config=project&&!project.global?structuredClone(project.rawConfig):createVelaV2(scope?basename(scope):'内部文件夹');
    const relative=path.slice(scope?scope.length+1:0),paths=config.editor?.glossaries||[];
    config.editor={...config.editor,glossaries:[...new Set([...paths,relative])]};
    const configText=velaText(config);
    if(!workspace.documents.includes(configDoc)){configDoc.path=(scope?scope+'/':'')+'.vela';if(itemPaths(workspace).has(configDoc.path))throw Error(t('当前 .vela 配置无效，请先修复。'));}
    if(existing){documents.change(source,text,[],{important:true});editorStates.delete(source.id);}else{source.text=text;workspace.documents.push(source);}
    if(!workspace.documents.includes(configDoc)){
      config.reading.items=workspace.documents.filter(item=>readable(item)&&(!scope||documentPath(item).startsWith(scope+'/'))).map(item=>({id:item.id,path:documentPath(item).slice(scope?scope.length+1:0)}));
      configDoc.text=velaText(config);
      workspace.documents.push(configDoc);
    }else{
      documents.change(configDoc,configText,[],{important:true});
      editorStates.delete(configDoc.id);
    }
    if(current()?.id===source.id)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});else if(current()?.id===configDoc.id)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:configDoc.text}});
    preparePaths(workspace);
    renderDocuments();
    updateGlossaryPanel();
    view?.dispatch({});
    if(!save())throw Error(t('保存失败'));
    toast(t('词条已加入术语库'));
  },{label:t('添加词条')});
}
function renderVela(){
  renderVelaEditor({root:$('#preview'),doc:current(),workspace,escape:esc,onOpenPath:path=>{
    const doc=workspace.documents.find(item=>documentPath(item)===path);
    if(doc)switchDocument(doc.id);else toast(say(`找不到 ${path}`,`Not found: ${path}`));
  },onManageStyles:()=>showStyleManager('',current()),onSave:(text,{restore=false,records=false}={})=>{
    const old=current();
    // The form edits the configuration; format records are taken from the file as it is now (they may have changed
    // since the page was drawn), except when the format page itself removes one (`records`).
    if(!records)try{
      const next=JSON.parse(text),now=JSON.parse(old.text).richText?.documents;
      if(now||next.richText?.documents){
        next.richText={...next.richText,documents:now};
        if(!now)delete next.richText.documents;
        if(!Object.keys(next.richText).length)delete next.richText;
        text=velaText(next);
      }
    }catch{}
    // Editing positions are never edited by the form: always keep the file's current ones.
    try{const next=JSON.parse(text),now=JSON.parse(old.text).positions;if(now||next.positions){if(now)next.positions=now;else delete next.positions;text=velaText(next);}}catch{}
    // Backups keep the configuration without format records (they can be large) or positions; restoring one keeps today's.
    const strip=source=>{
      try{
        const config=JSON.parse(source);
        if(config.richText?.documents||config.positions){
          if(config.richText)delete config.richText.documents;
          delete config.positions;
          return JSON.stringify(config,null,2)+'\n';
        }
      }catch{}
      return source;
    };
    if(restore){
      try{
        const restored=JSON.parse(text),records=JSON.parse(old.text).richText?.documents;
        if(records&&!restored.richText?.documents){
          restored.version=3;
          restored.richText={...restored.richText,documents:records};
          text=velaText(restored);
        }
      }catch{}
    }
    if(old.text!==text){workspace.configBackups={...workspace.configBackups,[old.id]:[...(workspace.configBackups?.[old.id]||[]),{text:strip(old.text),createdAt:Date.now()}].slice(-5)};}
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});
    if(!save())throw new Error(t('保存失败'));
    index=null;
    renderVela();
    toast(t('工作区配置已保存'));
  }});
}
function restorePulledEditor(page){
  const preview=isPreview;
  if(workspace.activeId&&!home){switchDocument(workspace.activeId);isPreview=preview;updateEditorVisibility();if(isPreview)renderPreview();}else{showHome();}
  renderDocuments();
  showView(page);
}
function previewDownload(result,folder,onApply,client=gh){
  return syncWorkflow.preview(result,folder,onApply,client);
}
function materializeDownload(result,folder){
  return syncWorkflow.materialize(result,folder);
}
async function pullSubscription(item){
  let abort;
  openModal(t('拉取文件'),`<p data-user-content>${esc(item.repo)}</p>
    ${item.snapshot.vela?`<label class="checkbox"><input name="readingOnly" type="checkbox" checked>${t('仅拉取阅读清单')}</label>`:''}<p>${t('保存到内部文件夹；对应 .vela 配置会同时保留，同路径文件覆盖。')}</p>
    <p id="subscription-pull-path" data-user-content></p>
    <progress id="subscription-pull-progress" max="1" value="0" hidden></progress><button type="button" id="subscription-pull-cancel" class="secondary" hidden>${t('取消拉取')}</button>`,async form=>{
    if(!save())throw new Error(t('请先保存当前文稿。'));
    abort=new AbortController();
    const folder='Subscriptions/'+item.repo;
    $('#subscription-pull-cancel').hidden=false;
    $('#subscription-pull-progress').hidden=false;
    try{
      const client=new GitHub((_operation,payload)=>transport('publicApi',payload)),only=item.snapshot.vela&&form.has('readingOnly'),snapshot=only?await subscriptions.api.snapshot(item.repo,abort.signal):item.snapshot;
      const result=await syncWorkflow.run(()=>client.pullRepository(item.repo,snapshot.branch,{signal:abort.signal,selection:only?[...snapshot.configs.map(config=>config.path),...snapshot.files.map(file=>file.path)]:null,includeDependencies:true,onProgress:p=>{
        const progress=$('#subscription-pull-progress');
        if(progress){
          progress.max=Math.max(1,p.total);
          progress.value=p.done;
          $('#subscription-pull-path').textContent=`${p.done} / ${p.total} · ${folder}/${p.path}`;
        }
      }}));
      abort.signal.throwIfAborted();
      await previewDownload(result,folder,async selected=>{
        await materializeDownload(selected,folder);
        for(const file of selected.files){
          const doc=workspace.documents.find(doc=>documentPath(doc)===folder+'/'+file.path);
          if(doc){
            doc.subscription={repo:item.repo,path:file.path,sha:file.sha,loadedSha:file.sha,contentHash:await textHash(doc.text)};
            editorStates.delete(doc.id);
          }
        }
        restorePulledEditor('subscriptions');
        save();
        toast(t('文件已拉取到内部文件夹。'));
      },client);
      return false;
    }finally{if($('#subscription-pull-cancel'))$('#subscription-pull-cancel').hidden=true;}
  },{label:t('拉取文件')});
  $('#subscription-pull-cancel').onclick=()=>abort?.abort();
}
async function cacheSubscription(item){
  const prefix='Subscriptions/'+item.repo+'/';let changed=false;
  for(const config of item.snapshot.configs){
    const path=prefix+config.path;
    const doc=workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);
    if(!doc)continue;
    if(doc.text!==config.text){
      const hash=await textHash(doc.text);
      if(doc.subscription.contentHash&&hash!==doc.subscription.contentHash||!doc.subscription.contentHash&&doc.remote?.lastSyncedText!==doc.text){
        doc.subscription={...doc.subscription,configurationConflict:true,sha:config.sha};
        changed=true;
        continue;
      }
      documents.checkpoint(doc);
      documents.change(doc,config.text);
      doc.subscription={repo:item.repo,path:config.path,sha:config.sha,loadedSha:config.sha,contentHash:await textHash(config.text)};
      editorStates.delete(doc.id);
      if(current()?.id===doc.id&&view){
        view.setState(makeState(doc));
        if(isPreview)renderPreview();
      }
      changed=true;
    }
  }
  for(const file of item.snapshot.files){
    const path=prefix+file.path;
    const doc=workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);
    if(doc)doc.subscription={...doc.subscription,repo:item.repo,path:file.path,sha:file.sha};
  }
  if(changed){preparePaths(workspace);renderDocuments();save();}
}
async function textHash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
async function loadSubscriptionDocument(doc,attempt=0){
  if(doc?.subscription?.configurationConflict)throw Error(t('本地 .vela 配置已修改，请在订阅拉取预览中对照并处理冲突。'));
  if(doc?.subscription&&doc.subscription.loadedSha!==doc.subscription.sha){
    await ensureSubscriptions();
    const target=doc.subscription.sha,initial=doc.text,hash=await textHash(initial),rawText=await subscriptions.api.blob(doc.subscription.repo,target),text=documentKind(doc)==='CSV'?rawText:normalizeText(rawText);
    if(doc.subscription.sha!==target){if(attempt>0)throw new Error(t('远端文件持续变化，请刷新后重试。'));return loadSubscriptionDocument(doc,attempt+1);}
    if(doc.text!==initial)throw new Error(t('读取期间本地文稿已修改，已保留本地内容，请重试。'));
    if(initial&&(!doc.subscription.loadedSha||doc.subscription.contentHash&&hash!==doc.subscription.contentHash)){
      const copy=newDocument(doc.name,initial);
      copy.path=uniquePath(documentPath(doc),itemPaths(workspace));
      copy.name=basename(copy.path);
      workspace.documents.push(copy);
    }
    doc.text=text;doc.subscription.loadedSha=target;doc.subscription.contentHash=await textHash(text);doc.updatedAt=Date.now();editorStates.delete(doc.id);if(current()?.id===doc.id&&view){
      view.setState(makeState(doc));
      if(isPreview)renderPreview();
      updateStats();
    }if(!save())throw new Error(t('订阅文件保存失败。'));
  }return doc;
}

function adoptProjectState(candidate,receipt={}){
  const previous=workspace,active=workspace.activeId,affected=new Set([...(receipt.changed||[]),...(receipt.removed||[])].map(entry=>entry.entryId)),activeChanged=affected.has(active)||candidate.documents.find(d=>d.id===active)?.text!==previous.documents.find(d=>d.id===active)?.text;
  if(activeChanged&&view){
    view.destroy();
    view=null;
  }workspace=candidate;documents.committedProject();for(const id of editorStates.keys())if(affected.has(id)||!workspace.documents.some(d=>d.id===id))editorStates.delete(id);index=null;indexDoc=null;outlineRevision='';session.dirty=false;
  if(activeChanged){
    if(workspace.activeId&&workspace.documents.some(d=>d.id===workspace.activeId))switchDocument(workspace.activeId);else showHome();
  }renderDocuments();updateStats();if(isPreview&&current())renderPreview();status(t('已保存到本机'));renderTabDirty();
}
async function hydratePlanningDocuments({paths=null,outlineOnly=false}={}){
 const entries=(workspace.entries||[]).filter(e=>!e.directory&&(paths?paths.includes(e.path):outlineOnly?/\.(process|pcs)$/i.test(e.path):/\.(process|pcs|velamap|vlmp)$/i.test(e.path))&&!workspace.documents.some(d=>documentPath(d)===e.path));
 for(const entry of entries){
    if(entry.size>8*MB)throw Error(t('文件超过格式大小限制，原文已保留。'));
    const chunks=[];
    let offset=0,revision,total=null;
    while(total===null||offset<total){
      const part=await projects.backend.call('read','host',{root:'',path:entry.path,offset,length:total===null?262144:Math.min(262144,total-offset),expectedRevision:revision}),data=fromBase64(part.data);
      if(!Number.isSafeInteger(part.totalSize)||part.totalSize<0||part.totalSize>8*MB)throw Error(t('文件超过格式大小限制，原文已保留。'));
      total=part.totalSize;
      if(!data.length&&offset<total)throw Error(t('文稿已变化，请重新选择。'));
      revision=part.revision;
      chunks.push(data);
      offset+=data.length;
    }
    const bytes=new Uint8Array(offset);
    let at=0;
    for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    const doc=newDocument(basename(entry.path),new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    doc.path=entry.path;
    doc.id=workspace.pluginProject?.entries?.[entry.path]||doc.id;
    workspace.documents.push(doc);
    documents.register(doc);
  }
 for(const doc of workspace.documents.filter(d=>documentKind(d)==='OUTLINE'))try{documents.outlineAnchors.open(doc);}catch{}
}
async function openLazyProjectDocument(path){
  if(documentProvider(path)||documentSourceProvider(path)){
    const target=workspace,entry=(workspace.entries||[]).find(e=>e.path===path),limit=documentImportLimit(path);
    if(entry?.size>limit)throw Error(t('文件超过文档插件的导入大小限制。'));
    const {bytes,revision}=await readDocumentBytes(async args=>{const part=await projects.backend.call('read','host',{root:'',...args});return {...part,bytes:fromBase64(part.data)};},path,limit);
    const result=await prepareDocumentImport(bytes,basename(path),decodeFileText);
    if(workspace!==target)throw Error(t('工作区已切换，请重新打开文件。'));
    if(result.name===basename(path)&&!binaryDocumentName(path))return openProjectDocument(path,{text:result.text,revision},{format:result});
    const doc=Object.assign(newDocument(result.name,result.text),result);
    doc.path=(parentPath(path)?parentPath(path)+'/':'')+result.name;
    return addDocument(doc);
  }
  const p=projects.projects().filter(p=>(!p.root||path.startsWith(p.root+'/'))).sort((a,b)=>b.root.length-a.root.length)[0];if(!p)throw new Error(t('文件不属于 .vela 工作区。'));const binding=projects.bind('vela.builtin.filebrowser',t('文件浏览器'));try{
    await binding.api.workspace.open({workspaceId:p.id});
    await binding.api.documents.open({workspaceId:p.id,path:path.slice(p.root?p.root.length+1:0),focus:true});
  }finally{
    await binding.stop();
  }
}
async function openProjectDocument(path,read,args={}){
  if(projectLocked)throw new Error(t('项目正在提交，请稍后打开文稿。'));let doc=workspace.documents.find(d=>documentPath(d)===path);if(!doc){
    doc=newDocument(basename(path),read.text);
    doc.text=read.text;
    doc.path=path;
    doc.id=workspace.pluginProject?.entries[path]||doc.id;
    workspace.documents.push(doc);
    documents.register(doc);
  }if(args.format){
    doc.kind=args.format.kind;
    doc.formatId=args.format.formatId;
  }switchDocument(doc.id);if(args.selection&&view)view.dispatch({selection:{anchor:args.selection.from,head:args.selection.to},scrollIntoView:true});if(args.focus!==false)view?.focus();return {documentId:doc.id,revision:read.revision};
}
async function boot(){try{
  workspace=await loadWorkspace();
  applyWorkspaceFont();
  try{gh=createGitClient(transport,workspace.settings?.gitProvider,workspace.settings?.giteaServer);}catch{gh=new GitHub(transport);}
  documents=createDocumentSession(()=>workspace);
  editing=new EditingTools({workspace:()=>workspace,current,view:()=>view,documents,index:()=>view&&ensureIndex(),matcher:()=>chapterMatcher(projectWriter(workspace,current())),invalidate:id=>editorStates.delete(id),scope:currentScope,modal:openModal,close:closeModal,escape:esc,open:switchDocument,jump,save,toast,fail,split:()=>{
      workspace.settings.splitPreview=!workspace.settings.splitPreview;
      if(!isPreview)togglePreview();else updateEditorVisibility();
      save();
    }});
  await prepareWorkspace(workspace,{
    initializeStorage:native?()=>transport('initializeStorage'):null,
    invalidate:id=>editorStates.delete(id),
  });
  projects=new ProjectService({workspace:()=>workspace,current,platform:environment?.platform||'browser',confirm:(title,message)=>pluginDialog(title,message,'confirm'),fail,prepare:candidate=>documents.prepareProject(candidate),lock:async()=>{
      if(view?.composing)throw new Error(t('请先完成输入法组合输入，再执行项目操作。'));
      if(!save())throw new Error(t('请先保存或导出当前文稿。'));
      projectLocked=true;
      document.body.classList.add('project-busy');
      if(view)view.dispatch({effects:projectReadonly.reconfigure(EditorState.readOnly.of(true))});
      return ()=>{
        projectLocked=false;
        document.body.classList.remove('project-busy');
        for(const [id,state] of editorStates)editorStates.set(id,state.update({effects:projectReadonly.reconfigure(EditorState.readOnly.of(false))}).state);
        if(view)view.dispatch({effects:projectReadonly.reconfigure(EditorState.readOnly.of(false))});
      };
    },adopt:adoptProjectState,openDocument:openProjectDocument,userGesture:()=>!plugins?.loadingId&&(native||navigator.userActivation?.isActive),pluginAssets:id=>plugins?.records.find(record=>record.manifest.id===id)?.files||{},pluginAsset:(id,path)=>plugins?.records.find(record=>record.manifest.id===id)?.files[path]},projectBackend(()=>workspace,environment?.platform));await projects.ready();await hydratePlanningDocuments({outlineOnly:true});
  plugins=new PluginRuntime({sidebarViews,context:extensionContext,tasks:extensionTasks,documentKind,openDocument:openExtensionDocument,navigatePlanning:spec=>{
      const api=$('#preview').planningApi;
      if(!planningPreview()||!api)throw Object.assign(Error(t('请先打开规划预览。')),{code:'E_UNSUPPORTED'});
      return api.navigate(spec);
    },planningSnapshot:()=>{
      if(!planningPreview())throw Object.assign(Error(t('请先打开规划预览。')),{code:'E_UNSUPPORTED'});
      return $('#preview').planningApi?.snapshot();
    },applyPlanning:applyExtensionPlanning,components:()=>texCompiler.assets,beforeComponentChange:async()=>{
      if(texCompiler.pending)throw Error(t('请等待当前编译结束。'));
      await texCompiler.dispose();
    },projects,documentHistory:doc=>documents.history(doc),configuration:doc=>projectConfig(workspace,doc)?.config,documentInfo:doc=>({...documents.receipt(doc),historyCount:documents.history(doc).length}),chapters:doc=>Writer.buildIndex(doc.text,projectWriter(workspace,doc),chapterMatcher(projectWriter(workspace,doc))).sections,compileTex:(doc,options)=>texCompiler.compile(doc,options),getView:()=>view,getDoc:current,getFiles:()=>workspace.documents,setText:(id,text)=>{
      if(projectLocked)throw new Error(t('项目正在提交，请稍后编辑。'));
      const doc=workspace.documents.find(doc=>doc.id===id);
      if(!doc)throw new Error(t('文稿不存在'));
      if(textBytes(text)>MAX_TEXT_BYTES)throw new Error(t('文件超过 8 MB'));
      if(doc.id===workspace.activeId&&view)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});else{documents.change(doc,text,[],{important:true});editorStates.delete(id);}
      if(!save())throw new Error(t('保存失败'));
      if(isPreview&&id===workspace.activeId)renderPreview();
      return true;
    },addFile:(name,text)=>addDocument(newDocument(fileName(name),text)),toast,fail,refreshCommands:refreshPluginCommands,ui:pluginUi,message:(title,message)=>pluginDialog(title,message,'alert'),confirm:(title,message)=>pluginDialog(title,message,'confirm'),prompt:(title,value)=>pluginDialog(title,'','prompt',value)});
  initI18n(workspace.settings.language);
  renderAppLabels();
  texCompiler=new TexCompiler({manageComponents:showPlugins,workspace:()=>workspace,plugins:()=>plugins,project:doc=>projectConfig(workspace,doc)});
  createTexPreview=()=>new PdfPreview({compiler:texCompiler,fail,jump:(path,line)=>{
      const folder=projectConfig(workspace,current())?.folder||parentPath(documentPath(current())),doc=workspace.documents.find(doc=>documentPath(doc)===(folder?folder+'/':'')+path)||current();
      if(!doc)return;
      if(current()?.id!==doc.id)switchDocument(doc.id);
      if(!document.body.classList.contains('split-preview')){isPreview=false;updateEditorVisibility();}
      view.dispatch({selection:{anchor:view.state.doc.line(Math.max(1,Math.min(view.state.doc.lines,line))).from},scrollIntoView:true});
      view.focus();
    },source:()=>{
      if(!view||documentKind(current())!=='TEX')return null;
      const line=view.state.doc.lineAt(view.state.selection.main.head);
      return {text:line.text,line:line.number};
    },onDiagnostics:(doc,list)=>{
      if(!view||current()?.id!==doc.id)return;
      const folder=projectConfig(workspace,doc)?.folder||parentPath(documentPath(doc)),own=documentPath(doc).slice(folder?folder.length+1:0);
      loadLatexEditor().then(({setCompileDiagnostics})=>{
        if(view&&current()?.id===doc.id)view.dispatch({effects:setCompileDiagnostics.of(list.filter(item=>Number(item.line)>0&&(!item.file||item.file.replace(/^\.\//,'')===own)))});
      }).catch(fail);
    }});
  // Startup update checks are scheduled after the editor and account have loaded.
  createReader=()=>new Reader({root:$('#reader-view'),workspace:()=>workspace,loadImage:(doc,src)=>loadWorkspaceImage(doc,src),loadTable:loadWorkspaceTable,loadAsset:path=>loadWorkspaceAsset(path),latex:(root,doc,onReady)=>{
      const pane=new PdfPreview({compiler:texCompiler,fail,readingMode:()=>reader?.config?.reader?.mode?(reader.config.reader?.mode==='auto'?($('#reader-view').clientWidth>=1000?'double':'scroll'):reader.config.reader?.mode):workspace.settings.readingMode});
      pane.mount(root,doc,{reading:true,onReady});
      if(doc.binary){const epoch=pane.epoch;transport('readWorkspaceFile',{path:documentPath(doc)}).then(data=>{if(pane.epoch===epoch)return pane.openFile(fromBase64(data));}).catch(fail);}
      return pane;
    },onChrome:(open,visible)=>{
      if(native&&readerFullscreen!==open){readerFullscreen=open;fullscreenTask=fullscreenTask.catch(()=>{}).then(()=>transport('fullscreen',{enabled:open})).catch(fail);}
      document.body.classList.toggle('reader-open',open);
      document.body.classList.toggle('reader-chrome-visible',visible);
      $('#outline-toggle').disabled=!open;
      sidebars.update();
    },markdown:md,sanitize,escape:esc,save,fail,load:async doc=>{
      if(['TEX','PDF'].includes(documentKind(doc)))await ensurePdfPreview();
      return loadSubscriptionDocument(doc);
    },html:async(doc,size,layout)=>{
      if(native){
        if(save())await transport('previewHtml',{path:documentPath(doc),dark:workspace.settings.dark,reading:true,readerTheme:JSON.stringify(paletteFor(workspace.settings.palette,workspace.settings.dark).colors),fontSize:size,layout,titlePage:reader.config?.reader?.titlePage!==false,readingMode:reader.config?.reader?.mode?(reader.config.reader?.mode==='auto'?($('#reader-view').clientWidth>=1000?'double':'scroll'):reader.config.reader?.mode):workspace.settings.readingMode,language:workspace.settings.language});
      }else{
        const content=$('#reader-view .reader-content');
        chunkLoading(content);
        try{
          const {htmlPreview}=await loadHtmlPreview();
          if(pageName!=='reader'||reader.doc!==doc||!content.isConnected)return;
          const frame=document.createElement('iframe');
          frame.title='HTML';
          frame.sandbox='';
          frame.srcdoc=htmlPreview(doc.text,{dark:workspace.settings.dark,fontSize:size});
          content.replaceChildren(frame);
        }catch(error){if(pageName==='reader'&&reader.doc===doc&&content.isConnected)chunkFailure(content,error,()=>reader.open(doc.id).catch(fail));}
      }
    }});
  createSubscriptions=Subscriptions=>{const value=new Subscriptions({root:$('#subscriptions-view'),nav:$('[data-view=subscriptions]'),workspace:()=>workspace,transport,save,escape:esc,modal:openModal,fail,cache:cacheSubscription,pull:pullSubscription,renderMarkdown:text=>sanitize(md.render(text),{FORBID_TAGS:['iframe','form','input','button','style'],FORBID_ATTR:['style']})});value.dot();return value;};
  $('[data-view=subscriptions] .update-dot').hidden=!(workspace.subscriptions||[]).some(item=>item.unread&&!item.pageSeen);
  setCustomPalettes(workspace.settings.customPalettes);chapterMatcher(workspace.settings.writer);applyTheme();setFontSize(workspace.settings.fontSize,false);
  // Phones always start with the file drawer closed; only desktop restores the last sidebar state.
  setSidebar('library',innerWidth>600&&workspace.settings.libraryOpen===true,false);
  // Prepare the final chrome geometry without creating editor, preview or home content beneath the logo.
  const initialId=workspace.documents.some(d=>/^操作指南\.(txt|md)$/i.test(d.name))&&workspace.openIds.includes(workspace.activeId)?workspace.activeId:null;
  const initialDoc=workspace.documents.find(doc=>doc.id===initialId);
  home=!initialDoc;isPreview=!!initialDoc&&['CSV','VELA','GLY','VODT','PLUGIN','OUTLINE','MAP'].includes(documentKind(initialDoc));
  if(home)workspace.activeId=null;
  document.body.dataset.page='write';$('#current-name').textContent=initialDoc?.name||t('启动页');updateEditorVisibility();renderDocuments();updateStats();sidebars.update(false);
  performance.mark('vela:core-ready');
  await window.velaStartup?.ready();
  if(initialDoc)switchDocument(initialDoc.id);else showHome();
  window.velaStartup?.reveal();
  // Persist startup migrations before exposing the workspace; geometry reads stay batched.
  if(session.pendingWorkspaceSave)save();
  sidebars.update(false);performance.mark('vela:content-ready');
  const pluginBoot=plugins.boot().catch(error=>toast(say(`插件读取失败：${t(error.message)}`,`Could not load plugins: ${t(error.message)}`)));
  window.velaReady=true;performance.mark('vela:interactive');
  await pluginBoot;
  if(workspace.subscriptions?.length)ensureSubscriptions().then(value=>value.refresh()).catch(fail);
  if(native){
      try{
        const user=await gh.user();
        account=user;
        $('#sidebar-logout').disabled=false;
        $('#account-label').textContent=gitName()+' · '+user.login;
        repositories=await gh.repositories();
      }catch{
        if(workspace.githubCache?.login&&sameGitHost(workspace.githubCache,gh)){
          account={login:workspace.githubCache.login};
          repositories=workspace.githubCache.repositories||[];
          githubOffline=true;
          $('#sidebar-logout').disabled=false;
          $('#account-label').textContent=account.login+' · '+t('离线');
        }
      }
    }
}catch(e){
    session.bootFailed=true;
    window.velaStartup?.dismiss();
    if(e.code==='E_CHUNK'){
      const buttons=[...document.querySelectorAll('button')].map(button=>[button,button.disabled]);
      for(const [button] of buttons)button.disabled=true;
      chunkFailure($('#editor'),e,()=>{for(const [button,disabled] of buttons)button.disabled=disabled;session.bootFailed=false;boot();});
      return;
    }
    $('#editor').innerHTML=`<div class="blank"><h2>${t('无法读取本地文稿')}</h2><p>${esc(t(e.message))}</p><p>${t('原始数据已保留，请勿清除应用数据。可先导出原始文件进行恢复。')}</p><button id="recover-data" class="primary">${t('导出原始数据')}</button></div>`;
    // i18n-data: file names, matching text and editable defaults stay as written
    $('#recover-data').onclick=()=>exportText('文舟-恢复数据.json',readWorkspace()||'').catch(fail);
    document.querySelectorAll('button').forEach(b=>{if(b.id!=='recover-data')b.disabled=true;});
  }}
window.wenzhouBack=()=>{
 if(closeAppChoices())return true;
 if($('#dialog').open){closeModal();return true;}
 if(ui.menuOpen){ui.close(true);return true;}
 const more=$('#preview .planning-overflow[aria-expanded=true]');if(more?.getClientRects().length){more.click();more.focus({preventScroll:true});return true;}
 const sheet=planningTopSheet($('#preview'));if(sheet){sheet.planningClose();return true;}
 const panel=[...document.querySelectorAll('#preview .map-tools-panel:not([hidden]):not([data-closing])')].find(el=>el.getClientRects().length&&el.planningClose);if(panel){panel.planningClose();return true;}
 const detail=$('#preview .outline-detail:not([hidden]):not([data-closing]) [data-close],#preview .outline-detail:not([hidden]):not([data-closing]) [data-close-edge]');if(detail?.getClientRects().length){
    detail.click();
    return true;
  }
 const readerClose=$('.reader-tools-panel [data-tools-close]');if(readerClose?.getClientRects().length){readerClose.click();return true;}
 for(const [name,id] of [['outline','outline-toggle'],['library','mobile-library']])if(document.body.classList.contains('show-'+name)&&!$('#'+(name==='library'?'library':'outline')+'-shell').inert){
    setSidebar(name,false);
    $('#'+id).focus({preventScroll:true});
    return true;
  }
 if(isPreview&&documentKind(current())==='MAP'&&mapBack())return true;if(home&&pageName==='write'&&$('#start-page').dataset.panel==='recent'){
    setStartPanel($('#start-page'),'actions');
    return true;
  }if(pageName==='reader'&&reader?.id){
    reader.home();
    return true;
  }if(pageName!=='write'){
    showView('write');
    return true;
  }return false;};
onDocumentFormatsChange(()=>{
  $('#file-input').accept=[defaultImportAccept,...documentImportExtensions()].join(',');
  for(const doc of workspace?.documents||[])if(documentSourceProvider(doc.name)&&documentKind(doc)!=='VODT'){doc.kind='PLUGIN';doc.formatId=documentSourceProvider(doc.name).id;}
  if(current()&&isPreview&&isComponentDocument(current()))renderPreview();
  if(['VODT','PLUGIN'].includes(reader?.kind)&&reader.id)reader.open(reader.id).catch(fail);
  if(workspace){fileListRevision='';renderDocuments();}
});
boot().then(()=>{if(native&&workspace?.settings.updateChecks!==false&&Date.now()-(workspace.updateInfo?.checkedAt||0)>86400000)setTimeout(()=>checkWindowsUpdates().catch(fail),1500);});
