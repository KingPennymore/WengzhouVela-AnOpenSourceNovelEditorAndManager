import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// t() runs without a page: setLanguage() only touches document.title/lang and skips DOM translation without a body.
globalThis.document??={documentElement:{},body:null};
const {t,setLanguage}=await import('../web/i18n.mjs');
setLanguage('en');

const han=/[\u3400-\u9fff]/;
// Literal t('…') / t("…") calls; template literals and computed arguments are not checked here.
const calls=file=>[...readFileSync('web/'+file,'utf8').matchAll(/(?<![\w$.])t\((['"])((?:\\.|(?!\1)[^\\\n])*)\1\)/g)].map(match=>match[2].replace(/\\(['"\\])/g,'$1').replace(/\\n/g,'\n'));

export function missingTranslations(){
  const missing=new Map();
  for(const file of readdirSync('web').filter(name=>/\.(mjs|js)$/.test(name)))
    for(const text of calls(file))if(han.test(text)&&t(text)===text&&!missing.has(text))missing.set(text,file);
  return missing;
}

test('every literal t() string with Chinese text has an English translation',()=>{
  const missing=missingTranslations();
  assert.deepEqual([...missing].map(([text,file])=>`${file}: ${text}`),[],`${missing.size} strings are missing from the dictionary in web/i18n.mjs`);
});
