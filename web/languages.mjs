import {languages} from '@codemirror/language-data';
import {LanguageDescription,StreamLanguage} from '@codemirror/language';
import {stex} from '@codemirror/legacy-modes/mode/stex';
import {html} from '@codemirror/lang-html';
import {markdown} from '@codemirror/lang-markdown';
import {json} from '@codemirror/lang-json';
import {documentKind} from './model.mjs';
const tex=StreamLanguage.define(stex);
export function languageName(doc){const kind=documentKind(doc);if(kind==='TEX')return 'LaTeX';if(kind==='VELA')return 'JSON';return LanguageDescription.matchFilename(languages,doc.name||'')?.name||kind;}
export function languageSupport(doc){const kind=documentKind(doc);if(kind==='TEX')return tex;if(kind==='VELA'||/\.json$/i.test(doc.name))return json();if(kind==='HTML')return html();if(kind==='MD')return markdown({codeLanguages:languages});const description=LanguageDescription.matchFilename(languages,doc.name||'');return description?.support||[];}
export async function loadLanguage(doc){if(['TXT','CSV','MD','HTML','VELA','TEX'].includes(documentKind(doc)))return languageSupport(doc);return await LanguageDescription.matchFilename(languages,doc.name||'')?.load()||[];}
