import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {readPluginZip} from '../web/plugin-package.mjs';
import {epubGeneratorBuild} from './epub-generator-build.mjs';
import {mobiSourceHash} from './ebook-mobi-sources.mjs';

export async function packageEbookStudio(){
 const folder='components/ebook-studio',entries=Object.create(null);
 const bundles=await Promise.all([['main.mjs','main.js'],['mobi-worker.js','mobi-worker.js']].map(async([source,name])=>{
  const result=await build({entryPoints:[folder+'/'+source],bundle:true,write:false,format:'iife',target:'chrome105',minify:true,legalComments:'eof',plugins:[epubGeneratorBuild()]});return [name,result.outputFiles[0].contents];
 }));for(const [name,bytes] of bundles)entries[name]=bytes;
 const paged=await build({entryPoints:[folder+'/paged-engine.mjs'],bundle:true,write:false,format:'iife',globalName:'PagedEngine',target:'chrome105',minify:true,legalComments:'eof'});
 const globals=['Node','Element','HTMLElement','HTMLImageElement','Range','NodeFilter','DOMParser','XMLSerializer','CSSStyleSheet','MutationObserver','ResizeObserver','XMLHttpRequest','URL','navigator','location','performance'];
 entries['paged-runtime.js']=strToU8('globalThis.VelaEbookPaged=function(window){const document=window.document,self=window,globalThis=window,'+globals.map(name=>name+'=window.'+name).join(',')+',getComputedStyle=window.getComputedStyle.bind(window),requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);'+paged.outputFiles[0].text+';return new PagedEngine.Previewer();};');
 for(const name of ['plugin.json','studio.css','README.md','LICENSE'])entries[name]=new Uint8Array(await readFile(folder+'/'+name));
 const wasm=new Uint8Array(await readFile(folder+'/runtime/mobi.wasm')),stamp=JSON.parse(await readFile(folder+'/runtime/mobi-build.json','utf8'));
 if(stamp.sourceSha256!==await mobiSourceHash())throw Error('MOBI 源码已变化，请先运行 npm run build:ebook-mobi。');
 if(createHash('sha256').update(wasm).digest('hex')!==stamp.sha256)throw Error('MOBI WASM 与构建记录不一致。');entries['mobi.wasm']=wasm;
 const roots=['epub-gen-memory','pagedjs','fflate','@tiptap/core','@tiptap/pm','@tiptap/starter-kit'],queue=roots.map(name=>[name,path.resolve('package.json')]),seen=new Set(),notices=[];
 for(let i=0;i<queue.length;i++){
  const [name,parent]=queue[i];let directory,pkg;
  for(const base of createRequire(parent).resolve.paths(name+'/package.json')||[]){try{const candidate=path.join(base,name),value=JSON.parse(await readFile(path.join(candidate,'package.json'),'utf8'));if(value.name===name){directory=candidate;pkg=value;break;}}catch{}}
  if(!pkg)throw Error('找不到依赖许可：'+name);
  const key=name+'@'+pkg.version;if(seen.has(key))continue;seen.add(key);
  const files=[];for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isFile()&&/^(license|copying|notice|copyright)/i.test(entry.name)){const target='licenses/js/'+name.replaceAll('/','-')+'-'+pkg.version+'-'+entry.name;entries[target]=new Uint8Array(await readFile(path.join(directory,entry.name)));files.push(target);}
  notices.push({name,version:pkg.version,license:pkg.license,files});
  for(const child of Object.keys(pkg.dependencies||{}))queue.push([child,path.join(directory,'package.json')]);
 }
 entries['licenses/mobi.json']=new Uint8Array(await readFile(folder+'/runtime/mobi-licenses.json'));
 entries['licenses/iepub-source.json']=new Uint8Array(await readFile('vendor/iepub/VELA-SOURCE.json'));
 entries['THIRD_PARTY_NOTICES.json']=strToU8(JSON.stringify({direct:roots.map(name=>notices.find(item=>item.name===name)),javascript:notices,mobi:stamp},null,2));
 const fixed=Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>[name,[value,{mtime:new Date('1980-01-01T00:00:00Z')}]]));
 const bytes=zipSync(fixed,{level:9});readPluginZip(bytes);
 const {version}=JSON.parse(new TextDecoder().decode(entries['plugin.json'])),output='dist/plugins/Vela-Ebook-Studio-'+version+'.zip';
 await mkdir('dist/plugins',{recursive:true});await writeFile(output,bytes);console.log('电子书制作插件：'+output+' ('+bytes.length+' bytes)');return {output,bytes};
}
if(path.basename(process.argv[1]||'')==='package-ebook-studio.mjs')await packageEbookStudio();
