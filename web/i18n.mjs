let language='zh-CN';
const originals=new WeakMap(),attributes=new WeakMap();
let dictionary=null,loading=null;

export function t(value){if(language!=='en')return value;const direct=dictionary[value];if(direct)return direct;
 // A fixed message followed by a path or name, e.g. "选中的路径已不存在：a/b.txt".
 const label=/^([^：]+：)(.+?)(。工作区未修改。)?$/.exec(value);if(label&&dictionary[label[1]])return dictionary[label[1]]+' '+label[2]+(label[3]?'. The workspace was not changed.':'');
return value.replace(/^(.+) 必须是对象。$/,'$1 must be an object.').replace(/^(.+) 必须是字符串。$/,'$1 must be a string.').replace(/^(.+) 必须是有限数字。$/,'$1 must be a finite number.').replace(/^(.+) 必须为布尔值。$/,'$1 must be a boolean.').replace(/^(.+) 超出允许范围。$/,'$1 is out of range.').replace(/^(.+) 不支持此值。$/,'Unsupported value for $1.').replace(/^(.+) 数量无效。$/,'Invalid count for $1.').replace(/^文舟 (\d+\.\d+\.\d+)/,'Vela $1').replace(/到文件顶部/g,'File start').replace(/到文件底部/g,'File end').replace(/到章节顶部/g,'Chapter start').replace(/到章节底部/g,'Chapter end').replace(/查找与替换/g,'Find and replace').replace(/保存 \(/g,'Save (').replace(/撤回 \(/g,'Undo (').replace(/重做 \(/g,'Redo (').replace(/字 · 行/g,'characters · line').replace(/^(\d+) 章$/,'$1 chapters').replace(/^本章 (\d+) 字 · 全文 (\d+) 字$/,'Chapter $1 chars · Total $2 chars').replace(/^行 (\d+)，列 (\d+)$/,'Ln $1, Col $2').replace(/^选中 (\d+) 字$/,'$1 selected chars').replace(/^关闭 (.*) \(Ctrl\+W\)$/,'Close $1 (Ctrl+W)').replace(/^(.+) 文稿操作$/,'$1 actions').replace(/^(.+) 文件操作$/,'$1 file actions').replace(/^第 (\d+) 页$/,'Page $1').replace(/^文字字号 (\d+) px$/,'Font size $1 px');}
export const getLanguage=()=>language;
// Sentences with values in them are written out in both languages; fixed strings go through t().
export const say=(zh,en)=>language==='en'?en:zh;
const skip=element=>element?.closest('.cm-editor,#preview:not(.vela-preview),[data-user-content],#license-text,.plugin-page-body,.doc-info strong,.tab-open strong,.reader-book strong,.reader-book small,#current-name,#current-chapter,.chapter,.repo-card strong,.repo-card p,.reader-content,.csv-grid-stage,.outline-node-title,.outline-node-summary,.outline-node-detail,.outline-lines');
// Modules render English at the source through t()/say(). This one pass covers the static shell in index.html and
// re-translates what is already on screen when the language changes; nothing watches later DOM updates.
function translateText(node){const parent=node.parentElement;if(!parent||skip(parent)||parent.matches('script,style,textarea'))return;const previous=originals.get(node),source=previous&&node.nodeValue===previous.translated?previous.source:node.nodeValue;const trimmed=source.trim(),translated=source.replace(trimmed,t(trimmed));originals.set(node,{source,translated});if(node.nodeValue!==translated)node.nodeValue=translated;}
function translateAttributes(element){if(skip(element))return;const cache=attributes.get(element)||{};for(const key of ['title','aria-label','placeholder']){if(!element.hasAttribute(key))continue;const value=element.getAttribute(key),old=cache[key],source=old&&value===old.translated?old.source:value,translated=t(source);cache[key]={source,translated};if(value!==translated)element.setAttribute(key,translated);}attributes.set(element,cache);}
function translateDOM(){if(!document.body)return;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())translateText(node);for(const element of document.body.querySelectorAll('[title],[aria-label],[placeholder]'))translateAttributes(element);}
/** Loads the English dictionary once; a failed load is retried on the next call. */
function loadDictionary(){return loading??=import('./i18n-dictionary.mjs').then(module=>{dictionary=module.dictionary;},error=>{loading=null;throw error;});}
/** English waits for the dictionary, so t() stays synchronous and never returns untranslated text in English mode. */
export async function setLanguage(value){const next=value==='en'?'en':'zh-CN';if(next==='en')await loadDictionary();language=next;document.documentElement.lang=language;document.title=language==='en'?'Vela · Novel writing and reading':'文舟 · 小说创作与阅读';translateDOM();}
export const initI18n=setLanguage;
