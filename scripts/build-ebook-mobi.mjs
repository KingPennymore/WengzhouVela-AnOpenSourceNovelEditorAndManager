import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {mobiSourceHash} from './ebook-mobi-sources.mjs';

const root=process.cwd(),manifest='components/ebook-studio/mobi/Cargo.toml',target=path.join(root,'dist/ebook-studio-mobi-target');
const env={...process.env,CARGO_TARGET_DIR:target};
execFileSync('cargo',['build','--manifest-path',manifest,'--target','wasm32-unknown-unknown','--release','--locked'],{env,stdio:'inherit'});
const metadata=JSON.parse(execFileSync('cargo',['metadata','--manifest-path',manifest,'--format-version','1','--locked','--offline','--filter-platform','wasm32-unknown-unknown'],{env,encoding:'utf8',maxBuffer:16*1024*1024}));
const notices=[];
for(const pkg of metadata.packages){
 const directory=path.dirname(pkg.manifest_path),files=[];
 for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isFile()&&/^(license|copying|notice|copyright)/i.test(entry.name))files.push({file:entry.name,text:await readFile(path.join(directory,entry.name),'utf8')});
 if(pkg.name==='vela-ebook-mobi')files.push({file:'LICENSE',text:await readFile('LICENSE','utf8')});
 if(pkg.name==='iepub-derive'&&!files.length)files.push({file:'upstream-repository-LICENSE',text:await readFile('vendor/iepub/LICENSE','utf8')});
 notices.push({name:pkg.name,version:pkg.version,license:pkg.license,notices:files});
}
const bytes=await readFile(path.join(target,'wasm32-unknown-unknown/release/vela_ebook_mobi.wasm'));
const module=await WebAssembly.compile(bytes);if(WebAssembly.Module.imports(module).length)throw Error('MOBI WASM 不能依赖外部运行时。');
await mkdir('components/ebook-studio/runtime',{recursive:true});
await writeFile('components/ebook-studio/runtime/mobi.wasm',bytes);
await writeFile('components/ebook-studio/runtime/mobi-licenses.json',JSON.stringify(notices,null,2)+'\n');
await writeFile('components/ebook-studio/runtime/mobi-build.json',JSON.stringify({engine:'iepub',version:'1.3.7',source:'vendor/iepub/VELA-SOURCE.json',sourceSha256:await mobiSourceHash(),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2)+'\n');
console.log('MOBI WASM：'+bytes.length+' bytes; '+notices.length+' dependency notices');
