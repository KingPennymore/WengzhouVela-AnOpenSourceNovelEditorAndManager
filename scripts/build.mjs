import { build } from 'esbuild';
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { recordBundle } from './frontend-state.mjs';
import {copyTexAssets} from './tex-assets.mjs';
const out = 'entry/src/main/resources/rawfile/web';
await mkdir(out, { recursive: true });
const pkg=JSON.parse(await readFile('package.json','utf8'));
const version=pkg.harmonyVersion||pkg.version;
const bundle = await build({entryPoints:['web/app.js'],bundle:true,outfile:`${out}/app.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof',metafile:true,define:{__VELA_HARMONY_VERSION__:JSON.stringify(version)}});
for(const name of ['index.html','style.css','file-manager.css','html-reader.js']) await copyFile(`web/${name}`,`${out}/${name}`);
await copyFile('node_modules/katex/dist/katex.min.css',`${out}/katex.min.css`);
await cp('node_modules/katex/dist/fonts',`${out}/fonts`,{recursive:true});
await copyTexAssets(out);
await cp('node_modules/pdfjs-dist/cmaps',`${out}/pdf/cmaps`,{recursive:true});
await cp('node_modules/pdfjs-dist/standard_fonts',`${out}/pdf/fonts`,{recursive:true});
await mkdir(`${out}/licenses`, {recursive:true});
const licenses=[];
for(const [name,path] of [['Acode','vendor/acode/LICENSE'],['Acode-Writer 1.0.4','vendor/acode-writer/LICENSE']]) {
  const text=await readFile(path,'utf8');licenses.push({name,text});await writeFile(`${out}/licenses/${name.replaceAll(' ','-')}.txt`,text);
}
licenses.push({name:'TeX Live / BusyTeX · notices and license inventory',text:await readFile('vendor/wasmtex/THIRD_PARTY_NOTICES.md','utf8')});
const included=new Set(Object.keys(bundle.metafile.inputs).map(input=>input.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean));
for(const name of [...included].sort()) {
  const p=`node_modules/${name}`;
  let found=false;
  for(const f of ['LICENSE','LICENSE.md','LICENSE.txt','license','LICENSE-MIT.txt']) {try{const text=await readFile(`${p}/${f}`,'utf8');licenses.push({name,text});await writeFile(`${out}/licenses/${name.replaceAll('/','-')}.txt`,text);found=true;break;}catch{}}
  if(!found)throw new Error('缺少运行时组件许可：'+name);
}
await writeFile(`${out}/licenses.js`,'window.WENZHOU_LICENSES = '+JSON.stringify(licenses)+';');
await writeFile(`${out}/version.json`,JSON.stringify({version,writer:'1.0.4',acode:'a63983fd2f76d5ae44c73d062acb18c12bdc0e7f'}));
recordBundle(process.cwd());
await mkdir('dist',{recursive:true});
await cp(out,'dist/web',{recursive:true});
console.log('文舟编辑器已构建：'+out);
