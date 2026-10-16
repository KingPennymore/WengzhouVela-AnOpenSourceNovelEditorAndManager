// Editor-independent completion candidates shared by the CodeMirror editor and plugins (no DOM, no editor objects).
// Editor-independent completion DTOs. No DOM, editor state or executable apply callbacks.
export const COMPLETION_LIMITS=Object.freeze({text:24000,options:200,label:160,insert:16384,info:4000});
const wordPattern=/[\p{L}\p{N}_]{1,40}$/u;
const lower=value=>value.toLocaleLowerCase();
export function completionPrefix(text,position){const match=text.slice(0,position).match(wordPattern);return match?{from:position-match[0].length,text:match[0]}:null;}
export function suffixPrefix(before,label){for(let n=Math.min(before.length,label.length);n>0;n--)if(lower(before.slice(-n))===lower(label.slice(0,n)))return n;return 0;}
export function glossaryCandidates({text,position,explicit=false},entries=[],translate=value=>value){
  const before=text.slice(Math.max(0,position-120),position),options=[];let from=position;
  for(const entry of entries)for(const label of [entry.term,...entry.aliases||[]]){
    if(typeof label!=='string'||!label)continue;
    const length=suffixPrefix(before,label);
    if(!length&&(!explicit||/[\p{L}\p{N}_]$/u.test(before)))continue;
    const start=position-length;
    if(options.length&&start!==from){if(start>from)continue;options.length=0;}from=start;
    const names=(entry.sources||[entry.source]).filter(Boolean).map(path=>path.split('/').at(-1));
    options.push({label,insertText:entry.term,kind:'term',score:99,from:start,to:position,
      detail:[names.join(' · ')||translate('术语库'),entry.category].filter(Boolean).join(' · '),
      info:((entry.aliases||[]).length?translate('别名')+'：'+entry.aliases.join('、')+'\n':'')+(entry.definitions?.map(item=>item.source+(item.text?'\n'+item.text:'')).join('\n\n')||entry.definition||entry.term)});
    if(options.length>=COMPLETION_LIMITS.options)return options;
  }
  return options;
}
export function nounCandidates({text,position},nouns=[],project={},translate=value=>value){
  if(project.autoNouns===false)return [];
  const excluded=new Set([...(project.terms||[]).flatMap(entry=>[entry.term,...entry.aliases||[]]),...project.glossary||[]]);
  const before=text.slice(Math.max(0,position-24),position);let from=position;const options=[];
  for(const item of nouns){
    if(typeof item.label!=='string'||excluded.has(item.label))continue;
    // Already-complete names are not offered as their own replacement.
    let n=Math.min(before.length,item.label.length-1);while(n>0&&!before.endsWith(item.label.slice(0,n)))n--;
    if(!n)continue;const start=position-n;
    if(options.length&&start>from)continue;if(start<from){options.length=0;from=start;}
    options.push({label:item.label,insertText:item.label,kind:'noun',score:-20,from,to:position,detail:translate('正文候选'),info:translate('从当前正文推测，未加入术语库。')});
    if(options.length>=80)break;
  }
  return options;
}
export function proseCandidates(context,project={}){
  const word=completionPrefix(context.text,context.position);
  if(!word||!context.explicit&&word.text.length<2)return [];
  const result=[],add=(label,insertText,kind,score,extra={})=>result.push({label,insertText,kind,score,from:word.from,to:context.position,...extra});
  const words=[...new Set(context.text.match(/[A-Za-z_][\w]{2,39}/g)||[])];
  for(const label of words.filter(label=>label!==word.text&&lower(label).startsWith(lower(word.text))).slice(0,160))add(label,label,'text',0);
  for(const label of project.glossary||[])if(typeof label==='string'&&lower(label).startsWith(lower(word.text)))add(label,label,'text',10);
  for(const item of project.snippets||[])if(typeof item.label==='string'&&typeof item.text==='string'&&lower(item.label).startsWith(lower(word.text)))add(item.label,item.text,'snippet',12,{snippet:true});
  return result;
}
export function validateCompletionContext(input){
  if(!input||typeof input.text!=='string'||input.text.length>COMPLETION_LIMITS.text||!Number.isInteger(input.position)||input.position<0||input.position>input.text.length||typeof input.revision!=='string'||!input.revision||input.revision.length>160||typeof input.documentId!=='string'||!input.documentId||input.documentId.length>160)throw Object.assign(Error('补全上下文无效或超过限制。'),{code:'E_INVALID_DATA'});
  return {documentId:input.documentId,blockId:typeof input.blockId==='string'?input.blockId.slice(0,160):'',revision:input.revision,text:input.text,position:input.position,explicit:input.explicit===true,composing:input.composing===true,kind:typeof input.kind==='string'?input.kind.slice(0,40):'text'};
}
function boundary(text,at){return !(at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1])&&/[\uDC00-\uDFFF]/.test(text[at]));}
export function normalizeCandidate(value,context){
  if(!value||typeof value.label!=='string'||!value.label||value.label.length>COMPLETION_LIMITS.label||/[\x00-\x1f]/.test(value.label)||typeof value.insertText!=='string'||value.insertText.length>COMPLETION_LIMITS.insert||!Number.isInteger(value.from)||!Number.isInteger(value.to)||value.from<0||value.to!==context.position||value.from>value.to||!boundary(context.text,value.from)||!boundary(context.text,value.to))return null;
  return {label:value.label,insertText:value.insertText,from:value.from,to:value.to,kind:['term','noun','snippet','keyword','text'].includes(value.kind)?value.kind:'text',score:Math.max(-100,Math.min(100,Number(value.score)||0)),detail:typeof value.detail==='string'?value.detail.slice(0,200):'',info:typeof value.info==='string'?value.info.slice(0,COMPLETION_LIMITS.info):'',snippet:value.snippet===true};
}
// A serializable subset of CodeMirror snippets, also usable in rich text.
export function expandCompletionSnippet(template){
  const fields=[];let text='',last=0;
  for(const match of template.matchAll(/\$\{([^}]*)\}/g)){text+=template.slice(last,match.index);const [index,placeholder]=/^\d+(?::|$)/.test(match[1])?[match[1].split(':')[0],match[1].includes(':')?match[1].slice(match[1].indexOf(':')+1):'']:[String(fields.length+1),match[1]];const from=text.length;text+=placeholder;fields.push({index:Number(index),from,to:text.length});last=match.index+match[0].length;}
  text+=template.slice(last);fields.sort((a,b)=>(a.index||Infinity)-(b.index||Infinity));return {text,selection:fields[0]?{from:fields[0].from,to:fields[0].to}:{from:text.length,to:text.length}};
}
