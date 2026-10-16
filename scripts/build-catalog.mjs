// Builds the component catalog (catalog.json, published under the fixed release tag `catalog`) from a finalized
// release folder: every Vela-<Name>-<x.y.z>.zip there becomes an entry with its size and SHA-256. The TeX package
// points at its own fixed tag tex-<version>; other components at the app release tag. Entries of the previous
// catalog that this release does not carry are kept, so publishing one component never drops another.
// Usage: node scripts/build-catalog.mjs [--version 0.9.8] [--previous path/to/catalog.json]
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {catalogText,parseCatalog} from '../web/component-catalog.mjs';

const arg=name=>{const at=process.argv.indexOf('--'+name);return at>0?process.argv[at+1]:null;};
const pkg=JSON.parse(await readFile('package.json','utf8')),version=arg('version')||pkg.version;
const folder=`dist/releases/${version}`,out='dist/releases/catalog',previousPath=arg('previous')||`${out}/catalog.json`;
if(!existsSync(folder))throw Error(`缺少 ${folder}（先运行 scripts/finalize-release.py）。`);
// Oldest app able to install each kind: the single TeX package needs 0.9.8, plugin API 4 needs 0.9.7.
const MIN_APP={tex:'0.9.8',api4:'0.9.7'};
const entries=[];
for(const name of (await readdir(folder)).filter(file=>/^Vela-(?:[A-Z][A-Za-z]*-)*[A-Z][A-Za-z]*-\d+\.\d+\.\d+\.zip$/.test(file)&&!file.endsWith('-source.zip')).sort()){
  const bytes=await readFile(`${folder}/${name}`),sha256=createHash('sha256').update(bytes).digest('hex'),[,slug,release]=/^Vela-(.+)-(\d+\.\d+\.\d+)\.zip$/.exec(name);
  if(slug==='TeX'){entries.push({id:'vela.component.tex',kind:'tex',title:'LaTeX 排版组件',note:'XeLaTeX / pdfLaTeX 引擎、基础宏包、中文宏包与 Fandol 字体',version:release,tag:'tex-'+release,name,bytes:bytes.length,sha256,minApp:MIN_APP.tex});continue;}
  const files=unzipSync(new Uint8Array(bytes),{filter:file=>file.name==='plugin.json'}),manifest=files['plugin.json']&&JSON.parse(strFromU8(files['plugin.json']));
  if(!manifest?.id?.startsWith('vela.component.'))throw Error(name+' 没有有效的 plugin.json（id 须以 vela.component. 开头）。');
  if(manifest.version!==release)throw Error(`${name} 的文件名版本与 plugin.json 中的 ${manifest.version} 不一致。`);
  entries.push({id:manifest.id,kind:'plugin',title:manifest.name||slug,note:(manifest.description||'').slice(0,200),version:manifest.version,tag:'v'+version,name,bytes:bytes.length,sha256,minApp:/>=\s*4/.test(manifest.vela?.api||'')?MIN_APP.api4:version});
}
if(!entries.length)throw Error(folder+' 中没有组件 ZIP。');
let kept=[];
if(existsSync(previousPath)){const previous=parseCatalog(await readFile(previousPath,'utf8'));kept=previous.items.filter(item=>!entries.some(entry=>entry.id===item.id)).map(({key:_key,...item})=>item);}
await mkdir(out,{recursive:true});
const text=catalogText([...kept,...entries]);await writeFile(`${out}/catalog.json`,text);
const sum=createHash('sha256').update(text).digest('hex');await writeFile(`${out}/SHA256SUMS-catalog.txt`,`${sum}  catalog.json\n`);
console.log(`组件目录：${out}/catalog.json（${JSON.parse(text).components.length} 项，本次 ${entries.length} 项，沿用 ${kept.length} 项）`);
for(const item of JSON.parse(text).components)console.log(`  ${item.id} ${item.version} · ${item.tag}/${item.name} · ${item.bytes} 字节`);
