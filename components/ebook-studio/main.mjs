import {createBook} from './create-book.mjs';
import {createVisualEditor} from './visual-editor.mjs';
import {parseBook,sourceText,importEpub,exportEpub,TEMPLATES,chapterBody,setChapterBody,addChapter,removeChapter,readText,writeText,plainText,previewDocument,previewChapter,readingHtml,mobiPayload,escape} from './engine.mjs';

const ID='vela.component.ebook-studio';
VelaPlugins.register(ID,{activate(vela){
 let pagedLoading,pagedScript;
 const loadPaged=()=>pagedLoading??=(new Promise((resolve,reject)=>{pagedScript=document.createElement('script');pagedScript.src=vela.assets.url('paged-runtime.js');pagedScript.onload=()=>resolve(window.VelaEbookPaged);pagedScript.onerror=()=>reject(Error('分页引擎加载失败。'));document.head.append(pagedScript);}));
 vela.dispose(()=>{pagedScript?.remove();delete window.VelaEbookPaged;});
 const make=async(fromCurrent=false)=>{
  try{const doc=fromCurrent?vela.documents.active():null;if(doc&&/\.vepub$/i.test(doc.name))throw Error('请先选择要制作成电子书的正文文稿。');
   const book=await createBook({title:doc?doc.name.replace(/\.[^.]+$/,''):'未命名书籍',text:doc?await vela.documents.readText(doc.id):''});
   vela.documents.create((book.metadata.title.replace(/[\\/\x00-\x1f]/g,'').slice(0,110)||'书籍')+'.vepub',sourceText(book));
  }catch(error){vela.ui.alert('电子书制作',error.message);}
 };
 vela.commands.register({id:'new',title:'电子书制作：新建书籍',run:()=>make()});
 vela.commands.register({id:'from-document',title:'电子书制作：从当前文稿创建',run:()=>make(true)});
 vela.ui.addButton({id:'new-book',title:'电子书制作',icon:'newFile',location:'top-toolbar',run:()=>make(true)});
 vela.formats.register({id:'vela.epub.studio',extensions:['.epub'],sourceExtensions:['.vepub'],maxImportBytes:32*1024*1024,
  importBytes(bytes,name,{signal}={}){signal?.throwIfAborted();return {name:name.replace(/\.epub$/i,'.vepub'),text:sourceText(importEpub(bytes))};},
  validate:parseBook,plainText:source=>plainText(parseBook(source)),toHtml:source=>readingHtml(parseBook(source)),
  render(options){return renderStudio(vela,options,loadPaged);}
 });
}});

function renderStudio(vela,{root,doc,onChange,signal,exportBinary},loadPaged){
 let book=parseBook(doc.text),chapterIndex=0,resourcePath='',sourceDirty=false,worker=null,pendingCancel=null,mobiBusy=false,previewTimer,visual=null,mode='visual';
 const urls=new Map(),cancelled=()=>signal.aborted;
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=vela.assets.url('studio.css');root.append(stylesheet);
 const panel=document.createElement('div');panel.className='ebook-studio';panel.innerHTML=`
  <div class="es-actions"><button data-action="save">保存编辑</button><button data-action="epub">导出 EPUB</button><button data-action="mobi">导出 MOBI</button><button data-action="preview">更新预览</button><button data-action="paged">分页预览</button><button class="es-preview-toggle" data-action="toggle-preview" aria-expanded="false">显示预览</button></div>
  <details class="es-metadata"><summary>书籍信息</summary><div class="es-fields"><label>书名<input data-meta="title"></label><label>作者<input data-meta="author"></label><label>语言<input data-meta="language"></label><label>书籍标识<input data-meta="identifier"></label><label class="es-wide">简介<textarea data-meta="description" rows="2"></textarea></label></div></details>
  <div class="es-layout"><div class="es-editor"><div class="es-chapter-controls"><label>章节<select aria-label="电子书章节" data-chapters></select></label><div class="es-actions"><button data-action="add">新增</button><button data-action="rename">改名</button><button data-action="up">上移</button><button data-action="down">下移</button><button data-action="remove">移除</button></div></div>
  <label>排版模板<select data-template aria-label="电子书排版模板">${Object.entries(TEMPLATES).map(([id,item])=>'<option value="'+id+'">'+item.name+'</option>').join('')}</select></label>
  <p class="es-help">直接编辑正文，或切换源码修改复杂内容。原书样式在右侧或展开预览后查看。</p>
  <label>编辑内容<select data-resource aria-label="电子书编辑内容"><option value="">当前章节 · XHTML 正文</option></select></label>
  <div class="es-modes" role="group" aria-label="正文编辑模式"><button data-mode="visual" aria-pressed="true">可视化</button><button data-mode="source" aria-pressed="false">源码</button></div>
  <div class="es-rich-tools" role="toolbar" aria-label="正文格式"><select data-block aria-label="段落格式"><option value="p">正文</option>${[1,2,3].map(n=>'<option value="'+n+'">标题 '+n+'</option>').join('')}</select><button data-format="bold" aria-label="加粗" aria-pressed="false"><b>粗体</b></button><button data-format="italic" aria-label="斜体" aria-pressed="false"><i>斜体</i></button><button data-format="underline" aria-label="下划线" aria-pressed="false">下划线</button><button data-format="bulletList" aria-label="项目列表" aria-pressed="false">列表</button><button data-format="blockquote" aria-label="引用" aria-pressed="false">引用</button><button data-format="undo" aria-label="撤销">撤销</button><button data-format="redo" aria-label="重做">重做</button></div>
  <div class="es-visual" data-visual></div><p class="es-help" data-visual-help>特殊内容以保护块保留，可切换源码编辑；可视化区域显示基础格式。</p>
  <textarea class="es-source" data-source aria-label="章节或样式源码" spellcheck="false" hidden></textarea></div>
  <div class="es-preview"><iframe title="电子书制作预览" sandbox="" referrerpolicy="no-referrer"></iframe></div></div><p class="es-status" role="status" data-status>编辑源保存在 .vepub 中；MOBI 使用传统格式，复杂样式会简化。</p>`;
 root.append(panel);
 const find=selector=>panel.querySelector(selector),source=find('[data-source]'),frame=find('iframe'),status=find('[data-status]'),select=find('[data-chapters]');
 for(const field of panel.querySelectorAll('[data-meta]'))field.value=book.metadata[field.dataset.meta];
 find('[data-template]').value=book.template;
 const stylePaths=Object.keys(book.files).filter(path=>/\.css$/i.test(path));for(const path of stylePaths){const option=document.createElement('option');option.value=path;option.textContent='样式 · '+path;find('[data-resource]').append(option);}
 const revoke=()=>{for(const url of urls.values())if(url)URL.revokeObjectURL(url);urls.clear();};
 const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('es-error',error);};
 const refreshList=()=>{select.replaceChildren(...book.chapters.map((chapter,index)=>{const option=document.createElement('option');option.value=index;option.textContent=chapter.title;return option;}));select.value=chapterIndex;};
 const currentPath=()=>resourcePath||book.chapters[chapterIndex].path;
 const syncToolbar=editor=>{for(const button of panel.querySelectorAll('[data-format]')){const name=button.dataset.format;if(name==='undo'||name==='redo')button.disabled=!editor.can()[name]();else button.setAttribute('aria-pressed',String(editor.isActive(name)));}find('[data-block]').value=editor.isActive('heading')?String(editor.getAttributes('heading').level):'p';};
 const displayMode=()=>{const rich=mode==='visual'&&!resourcePath;source.hidden=rich;for(const selector of ['[data-visual]','.es-rich-tools','[data-visual-help]'])find(selector).hidden=!rich;for(const button of panel.querySelectorAll('[data-mode]')){button.setAttribute('aria-pressed',String(button.dataset.mode===mode));button.disabled=button.dataset.mode==='visual'&&!!resourcePath;}};
 const mountVisual=()=>{
  visual?.destroy();visual=null;find('[data-visual]').replaceChildren();
  if(mode==='visual'&&!resourcePath){try{visual=createVisualEditor({element:find('[data-visual]'),book,chapter:book.chapters[chapterIndex],onUpdate(text){source.value=text;sourceDirty=true;persistDraft();queueSave();},onSave:()=>safe(action.save)(),onError:error=>message(error.message,true),onSelection:syncToolbar});syncToolbar(visual);}catch(error){mode='source';message('此章节请使用源码编辑：'+error.message,true);}}
  displayMode();
 };
 const loadSource=()=>{const draft=book.drafts?.[currentPath()];source.value=draft??(resourcePath?readText(book,resourcePath):chapterBody(book,book.chapters[chapterIndex]));sourceDirty=draft!==undefined;if(resourcePath)mode='source';if(sourceDirty&&mode==='visual'){try{capture();}catch{mode='source';}}mountVisual();};
 const capture=()=>{if(!sourceDirty)return;if(resourcePath)writeText(book,resourcePath,source.value);else setChapterBody(book,book.chapters[chapterIndex],source.value);if(book.drafts)delete book.drafts[currentPath()];sourceDirty=false;};
 const captureMetadata=()=>{for(const field of panel.querySelectorAll('[data-meta]'))book.metadata[field.dataset.meta]=field.value;};
 const persist=()=>{clearTimeout(previewTimer);capture();captureMetadata();const next=sourceText(book);onChange(next);message('编辑已保存到文稿。');};
 const persistDraft=()=>{if(!sourceDirty)return;book.drafts||={};book.drafts[currentPath()]=source.value;onChange(sourceText(book));};
 const updatePreview=()=>{capture();captureMetadata();revoke();frame.onload=null;frame.sandbox='';frame.srcdoc=previewDocument(book,book.chapters[chapterIndex],{urls});};
 const safe=fn=>async()=>{try{await fn();}catch(error){if(!cancelled())message(error.message,true);}};
 const queueSave=()=>{clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(cancelled())return;if(visual?.view.composing){queueSave();return;}safe(()=>{persistDraft();persist();updatePreview();})();},500);message('正在编辑，稍后自动保存。');};
 let taskEpoch=0;
 const convertMobi=async()=>{
  const wasm=await vela.assets.read('mobi.wasm',{encoding:null});if(cancelled())throw Error('编辑器已关闭。');
  if(worker)throw Error('请等待当前 MOBI 导出完成。');
  if(Object.keys(book.drafts||{}).length)throw Error('请先修正并保存章节草稿，再导出 MOBI。');
  return new Promise((resolve,reject)=>{worker=new Worker(vela.assets.url('mobi-worker.js'));const current=worker,timer=setTimeout(()=>finish(Error('MOBI 转换超时，请缩小书籍后重试。')),30000);
   const finish=(error,bytes)=>{clearTimeout(timer);current.terminate();if(worker===current)worker=null;pendingCancel=null;error?reject(error):resolve(bytes);};
   pendingCancel=()=>finish(Error('编辑器已关闭。'));
   current.onmessage=({data})=>data.error?finish(Error(data.error)):finish(null,data.bytes);current.onerror=()=>finish(Error('MOBI 引擎执行失败。'));current.postMessage({wasm,book:mobiPayload(book)});
  });
 };
 const bookName=()=>book.metadata.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'').slice(0,140)||'书籍';
 const action={
  save:()=>{persist();updatePreview();},preview:()=>updatePreview(),
  'toggle-preview':()=>{const open=panel.classList.toggle('es-show-preview');const button=find('[data-action="toggle-preview"]');button.textContent=open?'收起预览':'显示预览';button.setAttribute('aria-expanded',String(open));},
  epub:async()=>{persist();const bytes=exportEpub(book);if(!cancelled()){const saved=await exportBinary(bookName()+'.epub',bytes,'application/epub+zip');message(saved===false?'已取消导出。':'EPUB 已导出。');}},
  mobi:async()=>{if(mobiBusy)throw Error('请等待当前 MOBI 导出完成。');persist();mobiBusy=true;const epoch=++taskEpoch;message('正在转换 MOBI…');try{const bytes=await convertMobi();if(!cancelled()&&epoch===taskEpoch){const saved=await exportBinary(bookName()+'.mobi',bytes,'application/x-mobipocket-ebook');message(saved===false?'已取消导出。':'传统 MOBI 已导出，请在目标阅读器检查样式。');}}finally{mobiBusy=false;}},
  add:async()=>{const title=await vela.ui.prompt('新章节名称','新章节');if(title===null||cancelled())return;capture();addChapter(book,title.trim()||'新章节');book.navigationDirty=true;chapterIndex=book.chapters.length-1;resourcePath='';find('[data-resource]').value='';refreshList();loadSource();persist();updatePreview();},
  rename:async()=>{const title=await vela.ui.prompt('章节名称',book.chapters[chapterIndex].title);if(title===null||cancelled())return;capture();book.chapters[chapterIndex].title=title.trim()||'未命名章节';book.navigationDirty=true;refreshList();persist();},
  remove:async()=>{if(!await vela.ui.confirm('移除章节','将当前章节从目录与阅读顺序中移除？原始资源文件仍保留。')||cancelled())return;capture();removeChapter(book,chapterIndex);book.navigationDirty=true;chapterIndex=Math.min(chapterIndex,book.chapters.length-1);refreshList();loadSource();persist();updatePreview();},
  up:()=>move(-1),down:()=>move(1),
  paged:async()=>{
   panel.classList.add('es-show-preview');find('[data-action="toggle-preview"]').textContent='收起预览';find('[data-action="toggle-preview"]').setAttribute('aria-expanded','true');
   clearTimeout(previewTimer);capture();captureMetadata();const createPaged=await loadPaged();if(cancelled())return;
   const epoch=++taskEpoch;revoke();const preview=previewChapter(book,book.chapters[chapterIndex],{urls});if(preview.html.length>500000)throw Error('当前章节过长，请先拆分章节再进行分页预览。');
   frame.sandbox='allow-same-origin';
   frame.onload=()=>{frame.onload=null;if(cancelled()||epoch!==taskEpoch)return;const target=frame.contentDocument;
    createPaged(frame.contentWindow).preview(preview.html,[{'https://vela.invalid/book.css':preview.css+'\n'+TEMPLATES.print.css}],target.querySelector('#pages')).then(flow=>{if(!cancelled()&&epoch===taskEpoch)target.querySelector('#status').textContent='共 '+flow.total+' 页（当前章节）';}).catch(error=>{if(!cancelled())message('分页预览失败：'+error.message,true);});
   };
   frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'"><style>body{margin:0;background:#ddd}#status{padding:10px}.pagedjs_page{background:white;margin:12px auto}</style></head><body><p id="status">正在分页当前章节…</p><div id="pages"></div></body></html>';message('分页预览只处理当前章节。');
  }

 };
 function move(direction){capture();const next=chapterIndex+direction;if(next<0||next>=book.chapters.length)return;[book.chapters[next],book.chapters[chapterIndex]]=[book.chapters[chapterIndex],book.chapters[next]];chapterIndex=next;book.navigationDirty=true;refreshList();loadSource();persist();updatePreview();}
 for(const button of panel.querySelectorAll('[data-action]'))button.onclick=safe(action[button.dataset.action]);
 for(const button of panel.querySelectorAll('[data-mode]'))button.onclick=safe(()=>{if(button.dataset.mode===mode)return;persist();mode=button.dataset.mode;mountVisual();});
 for(const button of panel.querySelectorAll('[data-format]')){button.onmousedown=event=>event.preventDefault();button.onclick=safe(()=>{if(!visual)return;const name=button.dataset.format,commands={bold:'toggleBold',italic:'toggleItalic',underline:'toggleUnderline',bulletList:'toggleBulletList',blockquote:'toggleBlockquote',undo:'undo',redo:'redo'};visual.chain().focus()[commands[name]]().run();});}
 find('[data-block]').onchange=safe(()=>{if(!visual)return;const value=find('[data-block]').value,chain=visual.chain().focus();value==='p'?chain.setParagraph().run():chain.setHeading({level:Number(value)}).run();});
 find('[data-visual]').addEventListener('focusout',()=>{if(sourceDirty)safe(()=>{persistDraft();persist();updatePreview();})();});
 select.onchange=safe(()=>{capture();chapterIndex=Number(select.value);loadSource();persist();updatePreview();});
 find('[data-resource]').onchange=safe(()=>{capture();resourcePath=find('[data-resource]').value;loadSource();});
 find('[data-template]').onchange=safe(()=>{capture();book.template=find('[data-template]').value;persist();updatePreview();});
 for(const field of panel.querySelectorAll('[data-meta]'))field.onchange=safe(()=>persist());
 source.oninput=()=>{sourceDirty=true;safe(()=>persistDraft())();queueSave();};
 // Persist valid edits before tab switches; invalid XHTML stays visible until corrected.
 source.onblur=safe(()=>{if(sourceDirty){persistDraft();persist();}});
 refreshList();loadSource();safe(()=>updatePreview())();
 const dispose=()=>{clearTimeout(previewTimer);taskEpoch++;visual?.destroy();visual=null;pendingCancel?.();pendingCancel=null;worker?.terminate();worker=null;revoke();frame.remove();panel.remove();stylesheet.remove();};
 signal.addEventListener('abort',dispose,{once:true});return ()=>{signal.removeEventListener('abort',dispose);dispose();};
}
