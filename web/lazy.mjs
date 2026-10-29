import {t} from './i18n.mjs';
import {escapeHtml} from './text-utils.mjs';

// Features split out of the startup bundle (scripts/build.mjs builds ESM chunks into web/chunks/). Each loader
// imports its chunk once; a failed import is not kept, so the next use retries, and the error names the feature
// so callers can show it in place of the missing view (chunkFailure) instead of leaving it blank.
const labels={settings:'设置',ai:'AI 助手','ai-settings':'AI 助手',markdown:'Markdown 预览',html:'HTML 文件预览',guide:'使用指南',subscriptions:'订阅',updates:'应用更新',downloads:'插件与组件',glossary:'术语库',archive:'项目归档',outline:'大纲',map:'地图','map-algorithms':'边界算法',pdf:'PDF 与 LaTeX 预览',katex:'公式排版',epub:'EPUB 导出',reader:'阅读',latex:'LaTeX 编辑','latex-language':'LaTeX 编辑'}; // i18n-data: Lookup keys are translated by lazy() when reporting a load failure.

const loaded=new Map();
function lazy(name,load){

  // The browser remembers a failed module URL, so a retry imports the failed chunk again under a fresh query.
  let failed='',attempt=0;
  return ()=>{
    if(!loaded.has(name))loaded.set(name,(failed?import(failed+'?retry='+(++attempt)):load()).catch(error=>{
      loaded.delete(name);
      failed=String(error?.message||'').match(/[a-z]+:\/\/\S+?\.js/)?.[0]||failed;
      throw Object.assign(new Error(t('无法加载“{name}”模块：{error}。请检查应用是否完整，或重启后重试。').replace('{name}',t(labels[name])).replace('{error}',error?.message||error)),{code:'E_CHUNK',feature:name,cause:error});
    }));
    return loaded.get(name);
  };
}
export const loadMapAlgorithms=lazy('map-algorithms',()=>import('./map-algorithm-view.mjs'));
export const loadOutlineView=lazy('outline',()=>import('./outline-view.mjs'));
export const loadMapView=lazy('map',()=>import('./map-view.mjs'));
export const loadPdfPreview=lazy('pdf',()=>import('./pdf-preview.mjs'));
export const loadKatex=lazy('katex',()=>import('katex'));
export const loadEpubExport=lazy('epub',()=>import('./epub-export.mjs'));
export const loadReader=lazy('reader',()=>import('./reader.mjs'));
export const loadLatexEditor=lazy('latex',()=>import('./latex-editor.mjs'));
export const loadLatexLanguage=lazy('latex-language',()=>import('./latex-language.mjs'));

export const loadMarkdownPreview=lazy('markdown',()=>import('./markdown-preview.mjs'));
export const loadHtmlPreview=lazy('html',()=>import('./html-preview.mjs'));
export const loadGuide=lazy('guide',()=>import('./guide.mjs'));
export const loadSubscriptions=lazy('subscriptions',()=>import('./subscriptions.mjs'));
export const loadUpdateView=lazy('updates',()=>import('./update-view.mjs'));
export const loadComponentDownloads=lazy('downloads',()=>import('./component-download-view.mjs'));
export const loadGlossaryView=lazy('glossary',()=>import('./glossary-view.mjs'));
export const loadProjectArchive=lazy('archive',()=>import('./project-archive.mjs'));
export const loadAiAssistant=lazy('ai',()=>import('./ai-panel.mjs'));
export const loadAiSettings=lazy('ai-settings',()=>import('./ai-settings.mjs'));

/** Shows a load failure inside `root` with a retry button. */
export function chunkFailure(root,error,retry){
  if(!root)return;
  root.innerHTML=`<div class="blank chunk-failure" role="alert"><h2>${t('模块未能加载')}</h2><p>${escapeHtml(error?.message||error)}</p>${retry?`<button type="button" class="primary" data-chunk-retry>${t('重试')}</button>`:''}</div>`;
  root.querySelector('[data-chunk-retry]')?.addEventListener('click',retry);
}

export const loadSettingsView=lazy('settings',()=>import('./settings-view.mjs'));
