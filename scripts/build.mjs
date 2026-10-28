import { build } from 'esbuild';
import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { recordBundle } from './frontend-state.mjs';
import {copyTexAssets} from './tex-assets.mjs';
import {packageEbookComponent} from './package-ebook-component.mjs';
import {packageEbookStudio} from './package-ebook-studio.mjs';
await import('./build-guide.mjs');
const out = 'entry/src/main/resources/rawfile/web';
const lite=process.argv.includes('--lite')||process.env.VELA_BUILD_FLAVOR==='lite';
await mkdir(out, { recursive: true });
for(const name of ['plugin-package-worker.js','plugin-runtime.js','file-manager.css','ui.css','design.css','refinement.css'])for(const folder of [out,'dist/web'])await rm(`${folder}/${name}`,{force:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
const version=pkg.harmonyVersion||pkg.version;
// app.js is an ES module; features loaded with import() (web/lazy.mjs, CodeMirror language data) become chunks in
// chunks/. Hashed names change with content, so old chunks are removed first (also from dist/web below).
await rm(`${out}/chunks`,{recursive:true,force:true});
const bundle = await build({entryPoints:['web/app.js'],bundle:true,outdir:out,entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',splitting:true,format:'esm',target:'chrome105',minify:true,legalComments:'eof',metafile:true,define:{__VELA_HARMONY_VERSION__:JSON.stringify(version),__VELA_TEST_RELEASE_KEYS__:'[]'}});
await mkdir('dist',{recursive:true});await writeFile('dist/app-metafile.json',JSON.stringify(bundle.metafile));
await build({entryPoints:['web/map-fill-worker.js'],bundle:true,outfile:`${out}/map-fill-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/map-simplify-worker.js'],bundle:true,outfile:`${out}/map-simplify-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/noun-worker.js'],bundle:true,outfile:`${out}/noun-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/workspace-save-worker.js'],bundle:true,outfile:`${out}/workspace-save-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/project-archive-worker.js'],bundle:true,outfile:`${out}/project-archive-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/tex-component-worker.js'],bundle:true,outfile:`${out}/tex-component-worker.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
await build({entryPoints:['web/html-reader.js'],bundle:true,outfile:`${out}/html-reader.js`,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
for(const name of ['index.html','startup.js','startup.css','style.css', 'editor.css']) await copyFile(`web/${name}`,`${out}/${name}`);
await copyFile('node_modules/katex/dist/katex.min.css',`${out}/katex.min.css`);
await cp('node_modules/katex/dist/fonts',`${out}/fonts`,{recursive:true});
await copyTexAssets(out,{lite});
await cp('node_modules/pdfjs-dist/cmaps',`${out}/pdf/cmaps`,{recursive:true});
await cp('node_modules/pdfjs-dist/standard_fonts',`${out}/pdf/fonts`,{recursive:true});
await mkdir(`${out}/licenses`, {recursive:true});
const licenses=[];
for(const [name,path] of [['jieba vocabulary','vendor/jieba/LICENSE'],['Acode','vendor/acode/LICENSE'],['Acode-Writer 1.0.4','vendor/acode-writer/LICENSE']]) {
  const text=await readFile(path,'utf8');licenses.push({name,text});await writeFile(`${out}/licenses/${name.replaceAll(' ','-')}.txt`,text);
}
licenses.push({name:'TeX Live / BusyTeX · notices and license inventory',text:await readFile('vendor/wasmtex/THIRD_PARTY_NOTICES.md','utf8')});
const included=new Set(Object.keys(bundle.metafile.inputs).map(input=>input.replaceAll('\\','/').match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean));
for(const name of [...included].sort()) {
  const p=`node_modules/${name}`;
  let found=false;
  for(const f of ['LICENSE','LICENSE.md','LICENSE.txt','license','LICENSE-MIT.txt']) {try{const text=await readFile(`${p}/${f}`,'utf8');licenses.push({name,text});await writeFile(`${out}/licenses/${name.replaceAll('/','-')}.txt`,text);found=true;break;}catch{}}
  if(!found)throw new Error('缺少运行时组件许可：'+name);
}
await writeFile(`${out}/licenses.js`,'window.WENZHOU_LICENSES = '+JSON.stringify(licenses)+';');
await writeFile(`${out}/version.json`,JSON.stringify({version,flavor:lite?'lite':'full',writer:'1.0.4',acode:'a63983fd2f76d5ae44c73d062acb18c12bdc0e7f'}));
await packageEbookComponent();
await packageEbookStudio();
recordBundle(process.cwd());
await mkdir('dist',{recursive:true});
// Remove only obsolete TeX files: cp alone would leave full assets in a lite build.
if(lite){const descriptor=JSON.parse(await readFile(`${out}/tex/components.json`,'utf8'));for(const name of Object.keys(descriptor.files))await rm('dist/web/tex/'+name,{force:true});}
await rm('dist/web/chunks',{recursive:true,force:true});
await cp(out,'dist/web',{recursive:true});
console.log('文舟编辑器已构建（'+(lite?'轻量版':'完整版')+'）：'+out);
