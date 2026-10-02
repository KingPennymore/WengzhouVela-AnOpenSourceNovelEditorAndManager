import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Ship the pinned core, two engines and the Chinese package, never the 500 MB academic bundle.
export async function copyTexAssets(out){
  const base='vendor/wasmtex',inventory=JSON.parse(await readFile(`${base}/manifest.json`,'utf8'));
  const paths=['busytex.js','busytex.wasm','core.js','core.data','formats/pdflatex.fmt','formats/xelatex.fmt','licenses.json'];
  for(const name of paths){const data=await readFile(`${base}/${name}`),expected=inventory.assets.find(asset=>asset.path===name);if(!expected||data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw new Error('TeX 资源校验失败：'+name);await mkdir(`${out}/tex/${name.split('/').slice(0,-1).join('/')}`,{recursive:true});await copyFile(`${base}/${name}`,`${out}/tex/${name}`);}
  for(const name of ['manifest.json','NOTICE','THIRD_PARTY_NOTICES.md','vela-tex-cjk.zip'])await copyFile(`${base}/${name}`,`${out}/tex/${name}`);
  await copyFile('node_modules/wasmtex/dist/worker.js',`${out}/tex/worker.js`);
  await mkdir(`${out}/pdf`,{recursive:true});
  await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',`${out}/pdf/pdf.worker.mjs`);
}
