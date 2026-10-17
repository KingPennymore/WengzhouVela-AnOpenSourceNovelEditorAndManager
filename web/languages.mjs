import {languages} from '@codemirror/language-data';
import {LanguageDescription} from '@codemirror/language';
import {html} from '@codemirror/lang-html';
import {markdown} from '@codemirror/lang-markdown';
import {json} from '@codemirror/lang-json';
import {documentKind} from './model.mjs';
import {loadLatexLanguage} from './lazy.mjs';
// LaTeX support comes from a chunk; once loaded it is also returned synchronously, so reconfiguring keeps it.
let latex=null;
export function languageName(doc){const kind=documentKind(doc);if(kind==='TEX')return 'LaTeX';if(['VELA','GLY','OUTLINE','MAP'].includes(kind))return 'JSON';return LanguageDescription.matchFilename(languages,doc.name||'')?.name||kind;}
export function languageSupport(doc){const kind=documentKind(doc);if(kind==='TEX')return latex?latex():[];if(['VELA','GLY','OUTLINE','MAP'].includes(kind)||/\.json$/i.test(doc.name))return json();if(kind==='HTML')return html();if(kind==='MD')return markdown({codeLanguages:languages});const description=LanguageDescription.matchFilename(languages,doc.name||'');return description?.support||[];}
export async function loadLanguage(doc){if(documentKind(doc)==='TEX'){latex??=(await loadLatexLanguage()).latexSupport;return latex();}if(['TXT','CSV','MD','HTML','VELA','GLY','TEX','OUTLINE','MAP'].includes(documentKind(doc)))return languageSupport(doc);return await LanguageDescription.matchFilename(languages,doc.name||'')?.load()||[];}
