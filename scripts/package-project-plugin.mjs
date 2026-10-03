import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
const folder='examples/plugins/project-workbench',files=Object.create(null);
for(const name of (await readdir(folder)).sort())files[name]=[new Uint8Array(await readFile(folder+'/'+name)),{mtime:new Date('1980-01-01T00:00:00Z')}];
await mkdir('dist/plugins',{recursive:true});
await writeFile('dist/plugins/vela-project-workbench.zip',zipSync(files));
console.log('示例插件：dist/plugins/vela-project-workbench.zip');
