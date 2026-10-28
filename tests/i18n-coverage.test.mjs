import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';

// t() runs without a page: setLanguage() only touches document.title/lang and skips DOM translation without a body.
globalThis.document??={documentElement:{},body:null};
const {t,setLanguage}=await import('../web/i18n.mjs');
setLanguage('en');

const han=/[㐀-鿿]/;
// Dictionaries and the generated guide hold Chinese by design.
const sources=()=>readdirSync('web').filter(name=>/\.(mjs|js)$/.test(name)&&!/^(i18n|planning-i18n|guide)\b/.test(name)&&!/^i18n-/.test(name));
// Modules that emit English themselves. Every Chinese literal in them must go through t()/say() or be a dictionary
// entry (thrown errors shown via t(error.message)); data that is not UI text carries an `i18n-data` comment on its line
// or the line above.
export const LOCALIZED=['update-view.mjs','component-download-view.mjs'];

const literalText=node=>ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)?node.text:null;
const calleeName=node=>ts.isCallExpression(node)&&ts.isIdentifier(node.expression)?node.expression.text:null;
// The t()/say() call a literal belongs to and which argument it sits in; ternaries, parentheses and template
// interpolations pass through, so say(`…${flag?'，另加说明':''}`,…) counts as part of say().
function owner(node){
  let child=node;
  for(let parent=node.parent;parent;child=parent,parent=parent.parent){
    if(ts.isConditionalExpression(parent)&&parent.condition!==child||ts.isParenthesizedExpression(parent)||ts.isTemplateSpan(parent)||ts.isTemplateExpression(parent)||ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.PlusToken)continue;
    const name=calleeName(parent);
    if(name==='t'||name==='say')return {name,index:parent.arguments.indexOf(child)};
    return null;
  }
  return null;
}

export function scan(file){
  const text=readFileSync('web/'+file,'utf8'),lines=text.split('\n');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const found={missing:[],english:[],bare:[]};
  const line=node=>source.getLineAndCharacterOfPosition(node.getStart()).line;
  // Lines between `i18n-data-start` and `i18n-data-end` comments hold data too (word lists, snippet tables).
  const region=[];let open=false;
  for(const value of lines){if(/i18n-data-start/.test(value))open=true;region.push(open);if(/i18n-data-end/.test(value))open=false;}
  const data=node=>{const at=line(node);return region[at]||/i18n-data/.test(lines[at])||/i18n-data/.test(lines[at-1]||'');};
  const visit=node=>{
    const plain=literalText(node),template=ts.isTemplateExpression(node);
    // A template's own text, without the nested t()/say() calls in its interpolations.
    const own=template?[node.head,...node.templateSpans.map(span=>span.literal)].map(part=>part.text).join(''):plain;
    if(own!==null&&han.test(own)){
      const call=owner(node),where=`${file}:${line(node)+1}`;
      if(call?.name==='t'){if(plain!==null&&t(plain)===plain)found.missing.push([where,plain]);}
      else if(call?.name==='say'){if(call.index===1)found.english.push([where,node.getText(source)]);}
      else if(!(plain!==null&&t(plain)!==plain)&&!data(node))found.bare.push([where,node.getText(source).slice(0,80)]);
      if(!template)return;
    }
    ts.forEachChild(node,visit);
  };
  visit(source);
  return found;
}

export function missingTranslations(){
  const missing=new Map();
  for(const file of sources())for(const [where,text] of scan(file).missing)if(!missing.has(text))missing.set(text,where);
  return missing;
}

test('every literal t() string with Chinese text has an English translation',()=>{
  const missing=missingTranslations();
  assert.deepEqual([...missing].map(([text,where])=>`${where}: ${text}`),[],`${missing.size} strings are missing from the web/i18n*.mjs dictionaries`);
});

test('the English half of say() contains no Chinese',()=>{
  assert.deepEqual(sources().flatMap(file=>scan(file).english.map(([where,text])=>`${where}: ${text}`)),[]);
});

test('localized modules have no Chinese text outside t()/say() or the dictionary',()=>{
  assert.deepEqual(LOCALIZED.flatMap(file=>scan(file).bare.map(([where,text])=>`${where}: ${text}`)),[]);
});
