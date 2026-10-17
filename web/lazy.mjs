// Features split out of the startup bundle (scripts/build.mjs builds ESM chunks into web/chunks/). Each loader
// imports its chunk once; a failed import is not kept, so the next use retries, and the error names the feature
// so callers can show it in place of the missing view (chunkFailure) instead of leaving it blank.
const labels={outline:'大纲',map:'地图',pdf:'PDF 与 LaTeX 预览',katex:'公式排版',epub:'EPUB 导出',reader:'阅读',latex:'LaTeX 编辑','latex-language':'LaTeX 编辑'};
const loaded=new Map();
function lazy(name,load){
  // The browser remembers a failed module URL, so a retry imports the failed chunk again under a fresh query.
  let failed='',attempt=0;
  return ()=>{
    if(!loaded.has(name))loaded.set(name,(failed?import(failed+'?retry='+(++attempt)):load()).catch(error=>{
      loaded.delete(name);failed=String(error?.message||'').match(/[a-z]+:\/\/\S+?\.js/)?.[0]||failed;
      throw Object.assign(new Error(`无法加载“${labels[name]}”模块：${error?.message||error}。请检查应用是否完整，或重启后重试。`),{code:'E_CHUNK',feature:name,cause:error});
    }));
    return loaded.get(name);
  };
}
export const loadOutlineView=lazy('outline',()=>import('./outline-view.mjs'));
export const loadMapView=lazy('map',()=>import('./map-view.mjs'));
export const loadPdfPreview=lazy('pdf',()=>import('./pdf-preview.mjs'));
export const loadKatex=lazy('katex',()=>import('katex'));
export const loadEpubExport=lazy('epub',()=>import('./epub-export.mjs'));
export const loadReader=lazy('reader',()=>import('./reader.mjs'));
export const loadLatexEditor=lazy('latex',()=>import('./latex-editor.mjs'));
export const loadLatexLanguage=lazy('latex-language',()=>import('./latex-language.mjs'));

const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Shows a load failure inside `root` with a retry button. */
export function chunkFailure(root,error,retry){
  if(!root)return;
  root.innerHTML=`<div class="blank chunk-failure" role="alert"><h2>模块未能加载</h2><p>${escapeHtml(error?.message||error)}</p>${retry?'<button type="button" class="primary" data-chunk-retry>重试</button>':''}</div>`;
  root.querySelector('[data-chunk-retry]')?.addEventListener('click',retry);
}
