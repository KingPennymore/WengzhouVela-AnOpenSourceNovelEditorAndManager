import {languages} from '@codemirror/language-data';
import {LanguageDescription} from '@codemirror/language';
import {json} from '@codemirror/lang-json';
import {documentKind} from './model.mjs';
import {loadLatexLanguage} from './lazy.mjs';
// LaTeX, Markdown and HTML (the last two bring JavaScript and CSS for embedded code) come from chunks; once loaded they are also returned
// synchronously, so reconfiguring keeps them.
let latex=null,html=null,markdown=null;
export function languageName(doc){const kind=documentKind(doc);if(kind==='TEX')return 'LaTeX';if(['VELA','GLY','OUTLINE','MAP'].includes(kind))return 'JSON';return LanguageDescription.matchFilename(languages,doc.name||'')?.name||kind;}
export function languageSupport(doc){const kind=documentKind(doc);if(kind==='TEX')return latex?latex():[];if(['VELA','GLY','OUTLINE','MAP'].includes(kind)||/\.json$/i.test(doc.name))return json();if(kind==='HTML')return html||[];if(kind==='MD')return markdown||[];const description=LanguageDescription.matchFilename(languages,doc.name||'');return description?.support||[];}
export async function loadLanguage(doc){if(documentKind(doc)==='TEX'){latex??=(await loadLatexLanguage()).latexSupport;return latex();}if(documentKind(doc)==='MD')return markdown??=(await import('@codemirror/lang-markdown')).markdown({codeLanguages:languages});if(documentKind(doc)==='HTML')return html??=await LanguageDescription.matchFilename(languages,'index.html').load();if(['TXT','CSV','MD','HTML','VELA','GLY','TEX','OUTLINE','MAP'].includes(documentKind(doc)))return languageSupport(doc);return await LanguageDescription.matchFilename(languages,doc.name||'')?.load()||[];}
