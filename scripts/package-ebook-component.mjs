import {build} from 'esbuild';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
export async function packageEbookComponent(){
  const bundle=await build({entryPoints:['components/ebook-reader/main.mjs'],bundle:true,write:false,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
  const entries={'main.js':bundle.outputFiles[0].contents};
  for(const name of ['plugin.json','LICENSE','README.md'])entries[name]=new Uint8Array(await readFile('components/ebook-reader/'+name));
  entries['pdf/pdf.worker.mjs']=new Uint8Array(await readFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
  for(const dir of ['cmaps','standard_fonts'])for(const name of await readdir('node_modules/pdfjs-dist/'+dir))entries['pdf/'+(dir==='standard_fonts'?'fonts':dir)+'/'+name]=new Uint8Array(await readFile('node_modules/pdfjs-dist/'+dir+'/'+name));
  for(const name of ['fflate','dompurify','pdfjs-dist'])entries['licenses/'+name+'.txt']=new Uint8Array(await readFile('node_modules/'+name+'/LICENSE'));
  entries['THIRD_PARTY_NOTICES.txt']=strToU8('fflate: MIT; DOMPurify: Apache-2.0 OR MPL-2.0. See licenses/. PDF.js: Apache-2.0. Worker, CMaps and standard fonts from pdfjs-dist 4.10.38, with directory-specific license notices included. Original reader implementation: repository MIT license. No calibre code is bundled.');
  const fixed=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,[bytes,{mtime:new Date('1980-01-01T00:00:00Z')}]]));
  await mkdir('dist/plugins',{recursive:true});await writeFile('dist/plugins/Vela-Ebook-Reader-1.0.0.zip',zipSync(fixed,{level:9}));
  console.log('电子书阅读组件：dist/plugins/Vela-Ebook-Reader-1.0.0.zip');
}
if(process.argv[1]?.endsWith('package-ebook-component.mjs'))await packageEbookComponent();
