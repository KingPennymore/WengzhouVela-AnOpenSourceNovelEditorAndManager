// RFC 4180 quoting, including embedded newlines, quotes and empty trailing cells.
export function csvDelimiter(source){
  const text=source.replace(/^\uFEFF/,''),explicit=text.match(/^sep=([,;\t])\r?\n/i);if(explicit)return explicit[1];
  const candidates=[',',';','\t'],counts=candidates.map(()=>[0]);let quote=false,row=0;
  for(let i=0;i<text.length&&row<20;i++){
    const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"')i++;else quote=!quote;continue;}if(quote)continue;
    const column=candidates.indexOf(c);if(column>=0)counts[column][row]++;
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row++;for(const list of counts)list.push(0);}
  }
  const scores=counts.map(list=>{const positive=list.filter(n=>n>0);return positive.length?positive.length*100+Math.max(...positive):0;});
  return candidates[scores.indexOf(Math.max(...scores))];
}
export function parseCsv(source,delimiter=csvDelimiter(source)) {
  const text=source.replace(/^\uFEFF/,'').replace(/^sep=([,;\t])\r?\n/i,'');
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||afterQuote)throw new Error('CSV 引号格式不正确。');quoted=true;continue;}
    if(c===delimiter||c==='\r'||c==='\n') {
      row.push(cell);cell='';afterQuote=false;
      if(c!==delimiter){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
    } else {if(afterQuote)throw new Error('CSV 结束引号后只能跟逗号或换行。');cell+=c;}
  }
  if(quoted)throw new Error('CSV 存在未闭合的引号，请切换到源码修正。');
  if(cell||afterQuote||row.length||!rows.length) {row.push(cell);rows.push(row);}
  return rows;
}
export function writeCsv(rows,delimiter=',') {
  return rows.map(row=>row.map(value=>{const s=String(value??'');return s.includes(delimiter)||/["\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(delimiter)).join('\n');
}
