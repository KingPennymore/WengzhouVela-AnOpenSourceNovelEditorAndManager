const lines=text=>String(text).match(/[^\n]*\n|[^\n]+$/g)||[];

// Bound the diff work for long manuscripts. The fallback reports a wider
// conflict rather than guessing that overlapping edits are safe to combine.
function changes(base,next){
  let from=0,end=base.length,to=next.length;
  while(from<end&&from<to&&base[from]===next[from])from++;
  while(end>from&&to>from&&base[end-1]===next[to-1]){end--;to--;}
  if(from===end&&from===to)return [];
  const a=base.slice(from,end),b=next.slice(from,to),n=a.length,m=b.length;
  if((n+1)*(m+1)>1_000_000)return [{start:from,end,text:b}];
  const table=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const edits=[];let i=0,j=0,edit;
  const flush=()=>{if(edit){edits.push(edit);edit=null;}};
  while(i<n||j<m){
    if(i<n&&j<m&&a[i]===b[j]){flush();i++;j++;continue;}
    edit??={start:from+i,end:from+i,text:[]};
    if(j<m&&(i===n||table[i][j+1]>table[i+1][j]))edit.text.push(b[j++]);
    else{edit.end=from+(++i);}
  }
  flush();return edits;
}
function replaced(base,start,end,edits){let at=start,text='';for(const edit of edits){text+=base.slice(at,edit.start).join('')+edit.text.join('');at=edit.end;}return text+base.slice(at,end).join('');}

export function mergeTexts(baseText,localText,remoteText){
  if(localText===remoteText)return [{text:localText}];
  if(typeof baseText!=='string')return [{conflict:true,base:null,local:localText,remote:remoteText}];
  const base=lines(baseText),local=changes(base,lines(localText)),remote=changes(base,lines(remoteText));
  const edits=[...local.map(edit=>({...edit,side:'local'})),...remote.map(edit=>({...edit,side:'remote'}))].sort((a,b)=>a.start-b.start||a.end-b.end);
  const result=[];let at=0;
  while(edits.length){
    const first=edits.shift(),group=[first],start=first.start;let end=first.end;
    while(edits.length&&(edits[0].start<end||edits[0].start===start||edits[0].start===end&&(edits[0].start===edits[0].end||group.some(e=>e.start===e.end)))){const edit=edits.shift();group.push(edit);end=Math.max(end,edit.end);}
    if(start>at)result.push({text:base.slice(at,start).join('')});
    const original=base.slice(start,end).join(''),a=replaced(base,start,end,group.filter(e=>e.side==='local')),b=replaced(base,start,end,group.filter(e=>e.side==='remote'));
    if(a===b||b===original)result.push({text:a});
    else if(a===original)result.push({text:b});
    else result.push({conflict:true,base:original,local:a,remote:b});
    at=end;
  }
  if(at<base.length)result.push({text:base.slice(at).join('')});
  return result;
}

export function mergedText(parts){if(parts.some(part=>part.conflict&&!part.resolved))throw Error('请先处理每一处冲突。');return parts.map(part=>part.conflict?part.resolution:part.text).join('');}

