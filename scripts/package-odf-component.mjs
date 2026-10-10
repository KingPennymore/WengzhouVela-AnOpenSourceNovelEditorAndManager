import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
export async function packageOdfComponent(){
 const bundle=await build({entryPoints:['components/odf/main.mjs'],bundle:true,write:false,format:'iife',target:'chrome105',minify:true,legalComments:'eof'});
 const entries={'main.js':bundle.outputFiles[0].contents};for(const name of ['plugin.json','style.css','LICENSE','README.md'])entries[name]=new Uint8Array(await readFile('components/odf/'+name));entries['licenses/fflate.txt']=new Uint8Array(await readFile('node_modules/fflate/LICENSE'));
 const fixed=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,[bytes,{mtime:new Date('1980-01-01T00:00:00Z')}]]));await mkdir('dist/plugins',{recursive:true});await writeFile('dist/plugins/Vela-ODF-1.0.0.zip',zipSync(fixed,{level:9}));console.log('ODF 文档组件：dist/plugins/Vela-ODF-1.0.0.zip');
}
if(process.argv[1]?.endsWith('package-odf-component.mjs'))await packageOdfComponent();
