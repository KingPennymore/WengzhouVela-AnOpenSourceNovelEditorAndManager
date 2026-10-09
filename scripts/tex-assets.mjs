import {readFile,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
// Ship the pinned core, two engines and the Chinese package, never the 500 MB academic bundle.
export async function copyTexAssets(out,{lite=false}={}){
  const base='vendor/wasmtex',inventory=JSON.parse(await readFile(`${base}/manifest.json`,'utf8'));
  const paths=['busytex.js','busytex.wasm','core.js','core.data','formats/pdflatex.fmt','formats/xelatex.fmt','licenses.json'];
  const files={},groups={engine:[],chinese:['vela-tex-cjk.zip']};
  for(const name of [...paths,'vela-tex-cjk.zip']){const data=await readFile(`${base}/${name}`),expected=inventory.assets.find(asset=>asset.path===name),sha256=createHash('sha256').update(data).digest('hex');if(name!=='vela-tex-cjk.zip'&&(!expected||data.length!==expected.bytes||sha256!==expected.sha256))throw new Error('TeX 资源校验失败：'+name);files[name]={bytes:data.length,sha256};if(name!=='vela-tex-cjk.zip')groups.engine.push(name);await mkdir(`${out}/tex/${name.split('/').slice(0,-1).join('/')}`,{recursive:true});if(!lite)await copyFile(`${base}/${name}`,`${out}/tex/${name}`);else await rm(`${out}/tex/${name}`,{force:true});}
  await mkdir(`${out}/tex`,{recursive:true});
  for(const name of ['manifest.json','NOTICE','THIRD_PARTY_NOTICES.md'])await copyFile(`${base}/${name}`,`${out}/tex/${name}`);
  const id=createHash('sha256').update(JSON.stringify(files)).digest('hex');
  await writeFile(`${out}/tex/components.json`,JSON.stringify({format:1,version:inventory.version,id,builtin:!lite,files,groups}));
  if(lite){await mkdir('dist/tex-components',{recursive:true});for(const [group,names] of Object.entries(groups)){const entries={};for(const name of names)entries[name]=[new Uint8Array(await readFile(`${base}/${name}`)),{mtime:new Date('1980-01-01T00:00:00Z')}];await writeFile(`dist/tex-components/Vela-TeX-${inventory.version}-${group}.zip`,zipSync(entries,{level:9}));}}
  await copyFile('node_modules/wasmtex/dist/worker.js',`${out}/tex/worker.js`);
  await mkdir(`${out}/pdf`,{recursive:true});
  await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',`${out}/pdf/pdf.worker.mjs`);
}
