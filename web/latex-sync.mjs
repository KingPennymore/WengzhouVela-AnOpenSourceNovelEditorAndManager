// Text-based jumps between TeX source and the compiled PDF. WasmTeX does not emit SyncTeX yet, so a source line is
// reduced to the words it prints and looked up in each page's text (and the reverse for a word clicked in the PDF).
const SKIP_ARGUMENT=/^(label|ref|eqref|pageref|cite[a-z]*|usepackage|documentclass|input|include|includegraphics|bibliography|bibliographystyle|begin|end|newcommand|renewcommand|def|setlength|vspace|hspace|color|url|href)$/;

/** The words a source line will print: commands dropped, text arguments kept, math and comments removed. */
export function plainTexLine(line){
  let text=String(line||'').replace(/(?<!\\)%.*$/,'').replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g,' ');
  text=text.replace(/\\([A-Za-z@]+)\*?(\[[^\]]*\])?(\{([^{}]*)\})?/g,(all,name,_option,_group,argument)=>SKIP_ARGUMENT.test(name)?' ':(argument??' '));
  text=text.replace(/\\[^A-Za-z]/g,' ').replace(/[{}~&^_#]/g,' ');
  return normalise(text);
}
/** Whitespace is dropped entirely: PDF text runs split and join words (and CJK has none). */
export const normalise=text=>String(text||'').replace(/[\s 　]+/g,'').replace(/[‐-―]/g,'-').toLowerCase();

/** The best page for `query` (already normalised). Long queries are tried whole, then by shrinking windows. */
export function findInPages(pages,query){
  const texts=pages.map(normalise);if(query.length<2)return null;
  const probes=[query];for(const size of [24,16,10,6,4])if(query.length>size)for(let start=0;start+size<=query.length;start+=Math.max(1,Math.floor(size/2)))probes.push(query.slice(start,start+size));
  for(const probe of probes){const page=texts.findIndex(text=>text.includes(probe));if(page>=0){const at=texts[page].indexOf(probe);return {page:page+1,fraction:texts[page].length?at/texts[page].length:0,probe};}}
  return null;
}

/**
 * The source line that prints `query`, searching the current file first and then the other TeX files of its project.
 * `path` is relative to the project folder, the form the preview's jump callback takes.
 */
export function findSourceLine(documents,doc,query,folder){
  const target=normalise(query);if(target.length<2||!doc)return null;
  const own=doc.path||doc.name,base=folder??(own.includes('/')?own.slice(0,own.lastIndexOf('/')):''),prefix=base?base+'/':'';
  const candidates=[doc,...documents.filter(item=>item.id!==doc.id&&/\.(tex|ltx|latex)$/i.test(item.name)&&(item.path||item.name).startsWith(prefix))];
  for(const item of candidates){
    const lines=String(item.text||'').split('\n');let best=null;
    for(let index=0;index<lines.length;index++){const plain=plainTexLine(lines[index]);if(!plain)continue;if(plain.includes(target)||target.length>=6&&target.includes(plain)&&plain.length>=6){best=index+1;break;}}
    if(best)return {path:(item.path||item.name).slice(prefix.length),line:best};
  }
  return null;
}
