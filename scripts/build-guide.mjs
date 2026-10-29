import {readFile,writeFile,mkdir,readdir,unlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {guide,previousGuideHashes} from '../web/guide.mjs';
import {guideIconSvg} from '../web/guide-icons.mjs';
const markdown=(await readFile('docs/USER-GUIDE.md','utf8')).replace(/\r\n?/g,'\n'),names=[...new Set([...markdown.matchAll(/!\[[^\]]*\]\(vela-guide-icons\/([A-Za-z][A-Za-z0-9]*)\.svg\)/g)].map(m=>m[1]))],folder=path.join(await realpath(process.cwd()),'docs','vela-guide-icons');await mkdir(folder,{recursive:true});if(await realpath(folder)!==folder)throw Error('Guide icon directory must stay in the workspace.');
for(const name of names){const svg=guideIconSvg(name);if(!svg)throw Error('Unknown guide icon: '+name);await writeFile(path.join(folder,name+'.svg'),svg+'\n');}
for(const file of await readdir(folder))if(/^[A-Za-z][A-Za-z0-9]*\.svg$/.test(file)&&!names.includes(file.slice(0,-4))){const target=path.join(folder,file);if(path.dirname(await realpath(target))!==folder)throw Error('Guide icon path is outside its directory.');await unlink(target);}
if(markdown!==guide){let source=await readFile('web/guide.mjs','utf8'),history=await readFile('web/guide-history.mjs','utf8');const hashes=[...new Set([createHash('sha256').update(guide).digest('hex'),...previousGuideHashes])];history=history.replace(/export const previousGuideHashes=\[[^\n]*\];/,()=>`export const previousGuideHashes=${JSON.stringify(hashes)};`);source=source.replace(/export const guide = "(?:\\.|[^"\\])*";/,()=>`export const guide = ${JSON.stringify(markdown)};`);await writeFile('web/guide.mjs',source);await writeFile('web/guide-history.mjs',history);}
