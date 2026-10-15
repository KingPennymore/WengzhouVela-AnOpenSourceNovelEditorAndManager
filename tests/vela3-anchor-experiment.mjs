// Feasibility probe: how reliably do standoff marks re-anchor after the TXT was edited outside Vela?
import {resolveAnchor,remapAnchors} from '../web/document-service.mjs';

let seed=7;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;const pick=list=>list[Math.floor(rand()*list.length)];
// Realistic repetition: novels reuse names, phrases and punctuation, so short quotes collide often.
const words=['他','她','说道','林舟','苏晚','只见','风雪','长剑','一声','冷笑','山门','师兄','不知','何时','已经','站在','门外','“','”','，','。','！','？','微微一怔','缓缓','抬起头','看着','远处','灯火','心中','暗道','不好','的','了','是','在','这','那','却','又','便','也'];
const para=()=>'　　'+Array.from({length:20+Math.floor(rand()*60)},()=>pick(words)).join('');
const chapters=[];for(let c=1;c<=12;c++){chapters.push('第'+c+'章 风雪夜归人'+c);for(let p=0;p<25;p++)chapters.push(para());}
const original=chapters.join('\n');

// Marks: mostly short (emphasis on a word or name), some sentences.
const marks=[];for(let i=0;i<600;i++){const length=rand()<0.6?1+Math.floor(rand()*4):5+Math.floor(rand()*20);const offset=Math.floor(rand()*(original.length-length));if(original.slice(offset,offset+length).includes('\n'))continue;marks.push({id:i,offset,end:offset+length});}

function applyEdits(text,edits){let out=text;for(const e of [...edits].sort((a,b)=>b.from-a.from))out=out.slice(0,e.from)+e.insert+out.slice(e.to);return out;}
function truth(mark,edits){let from=mark.offset,to=mark.end;for(const e of [...edits].sort((a,b)=>b.from-a.from)){const d=e.insert.length-(e.to-e.from);if(e.to<=from){from+=d;to+=d;}else if(e.from<to&&e.to>from)return null;else if(e.from>=to)continue;}return {from,to};}
const lineStarts=text=>{const s=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')s.push(i+1);return s;};

const starts=lineStarts(original),lineAt=i=>starts[i],paragraphs=starts.length;
const scenarios={
  '开头插入三段':()=>[{from:lineAt(1),to:lineAt(1),insert:para()+'\n'+para()+'\n'+para()+'\n'}],
  '删除中间一段':()=>{const l=150;return [{from:lineAt(l),to:lineAt(l+1),insert:''}];},
  '散落改错字 30 处':()=>{const out=[],used=new Set();while(out.length<30){const at=Math.floor(rand()*original.length);if(original[at]==='\n'||used.has(at))continue;used.add(at);out.push({from:at,to:at+1,insert:pick(words)[0]});}return out;},
  '每段末尾加一句':()=>starts.slice(1).map(s=>({from:s-1,to:s-1,insert:'他想。'})),
  '全文 CRLF':()=>starts.slice(1).map(s=>({from:s-1,to:s,insert:'\r\n'})),
  '第三章整章移到末尾':()=>{const a=lineAt(2*26),b=lineAt(3*26);return [{from:a,to:b,insert:''},{from:original.length,to:original.length,insert:'\n'+original.slice(a,b-1)}];},
};

// Strategy B: quote + prefix + suffix with uniqueness scoring; never guesses between equals.
const ctx=16;
function anchorOf(text,m){return {offset:m.offset,quote:text.slice(m.offset,m.end),prefix:text.slice(Math.max(0,m.offset-ctx),m.offset),suffix:text.slice(m.end,m.end+ctx)};}
function common(a,b,fromEnd){let n=0;while(n<a.length&&n<b.length&&(fromEnd?a[a.length-1-n]===b[b.length-1-n]:a[n]===b[n]))n++;return n;}
function resolveB(text,a){const hits=[];let at=text.indexOf(a.quote);while(at>=0&&hits.length<2000){hits.push(at);at=text.indexOf(a.quote,at+1);}
  if(!hits.length)return null;const scored=hits.map(h=>({h,s:common(text.slice(Math.max(0,h-ctx),h),a.prefix,true)+common(text.slice(h+a.quote.length,h+a.quote.length+ctx),a.suffix,false)})).sort((x,y)=>y.s-x.s);
  const best=scored[0],second=scored[1];if(best.s<6||(second&&second.s>=best.s))return null;return {from:best.h,to:best.h+a.quote.length};}
// Strategy C: the app still has the last text it saved (private baseline) → map through a real line diff, then B for touched marks.
function lineDiff(before,after){const a=before.split('\n'),b=after.split('\n'),n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint32Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const changes=[];let i=0,j=0,pa=0,pb=0,hunk=null;const flush=()=>{if(hunk){changes.push({from:hunk.from,to:pa,insert:after.slice(hunk.insertFrom,pb)});hunk=null;}};
  while(i<n||j<m){if(i<n&&j<m&&a[i]===b[j]){flush();pa+=a[i].length+1;pb+=b[j].length+1;i++;j++;}else if(j<m&&(i===n||dp[i][j+1]>=dp[i+1][j])){hunk||={from:pa,insertFrom:pb};pb+=b[j].length+1;j++;}else{hunk||={from:pa,insertFrom:pb};pa+=a[i].length+1;i++;}}
  flush();return changes.map(c=>({...c,to:Math.min(c.to,before.length),insert:c.insert.slice(0,Math.max(0,c.insert.length-(c.to>before.length?1:0)))}));}

const rows=[];
for(const [name,make] of Object.entries(scenarios)){
  const edits=make(),edited=applyEdits(original,edits),expected=marks.map(m=>truth(m,edits));
  const tally={A:{ok:0,review:0,wrong:0},B:{ok:0,review:0,wrong:0},C:{ok:0,review:0,wrong:0}},touched=expected.filter(e=>!e).length;
  const score=(key,got,exp,quote)=>{if(!exp)return;const t=tally[key];if(!got)t.review++;else if(got.from===exp.from&&got.to===exp.to)t.ok++;else t.wrong++;};
  const mapped=remapAnchors(marks.map(m=>({...m,quote:original.slice(m.offset,m.end),context:original.slice(Math.max(0,m.offset-32),m.offset)})),lineDiff(original,edited),original,edited);
  marks.forEach((m,i)=>{const quote=original.slice(m.offset,m.end),exp=expected[i];
    const a=resolveAnchor(edited,{offset:m.offset,end:m.end,quote,context:original.slice(Math.max(0,m.offset-32),m.offset)});score('A',a.needsReview?null:{from:a.offset,to:a.end},exp,quote);
    score('B',resolveB(edited,anchorOf(original,m)),exp,quote);
    const c=mapped[i];score('C',c.needsReview||edited.slice(c.offset,c.end)!==quote?resolveB(edited,anchorOf(original,m)):{from:c.offset,to:c.end},exp,quote);
  });
  rows.push({场景:name,'被改动的标记(不计)':touched,...Object.fromEntries(Object.entries(tally).map(([k,v])=>[k,`${v.ok}/${v.review}/${v.wrong}`]))});
}
console.log('标记总数',marks.length,'正文字数',original.length,'（格式：正确/待确认/错位）');console.table(rows);
