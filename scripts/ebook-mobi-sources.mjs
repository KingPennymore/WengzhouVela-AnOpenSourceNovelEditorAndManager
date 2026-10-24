import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function files(root){const result=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=root+'/'+entry.name;if(entry.isDirectory())result.push(...await files(path));else if(entry.isFile()&&entry.name.endsWith('.rs'))result.push(path);}return result;}
export async function mobiSourceHash(){
 const paths=[...await files('vendor/iepub/src'),'vendor/iepub/Cargo.toml','vendor/iepub/build.rs','vendor/iepub/LICENSE','vendor/iepub/VELA-SOURCE.json','components/ebook-studio/mobi/Cargo.toml','components/ebook-studio/mobi/Cargo.lock','components/ebook-studio/mobi/src/lib.rs'].sort();
 const hash=createHash('sha256');for(const path of paths)hash.update(path+'\0').update((await readFile(path,'utf8')).replace(/\r\n?/g,'\n'));return hash.digest('hex');
}
