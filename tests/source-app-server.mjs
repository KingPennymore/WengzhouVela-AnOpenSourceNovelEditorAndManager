import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

// Serves the current web/ sources for browser tests without `npm run build`, so tests never rewrite
// entry/src/main/resources/rawfile (the native bundle and its TeX assets) or dist/web.
// Bundles are built in memory like scripts/build.mjs (unminified); everything else is read from web/,
// node_modules for KaTeX/pdf.js assets, then the last built bundle for TeX and other copied assets.
const workers=['noun-worker.js','project-archive-worker.js','tex-component-worker.js','html-reader.js'];
const mime={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};

export async function startSourceAppServer({port=0}={}){
  const pkg=JSON.parse(await readFile('package.json','utf8')),bundle=(entry,define)=>build({entryPoints:['web/'+entry],bundle:true,write:false,format:'iife',target:'chrome105',define}).then(result=>['/'+entry,result.outputFiles[0].contents]);
  const assets=new Map(await Promise.all([bundle('app.js',{__VELA_HARMONY_VERSION__:JSON.stringify(pkg.harmonyVersion||pkg.version)}),...workers.map(name=>bundle(name))]));
  const mapped=[['/katex.min.css','node_modules/katex/dist/katex.min.css'],['/fonts/','node_modules/katex/dist/fonts/'],['/pdf/cmaps/','node_modules/pdfjs-dist/cmaps/'],['/pdf/fonts/','node_modules/pdfjs-dist/standard_fonts/']];
  const roots=[path.resolve('web'),path.resolve('entry/src/main/resources/rawfile/web'),path.resolve('dist/web')];
  const inside=(root,file)=>file.startsWith(root+path.sep);
  const server=http.createServer(async(req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/')pathname='/index.html';}catch{res.writeHead(400).end();return;}
    let body=assets.get(pathname);
    const candidates=[];for(const [prefix,target] of mapped)if(prefix.endsWith('/')?pathname.startsWith(prefix):pathname===prefix){const base=path.resolve(prefix.endsWith('/')?target:path.dirname(target));candidates.push([base,prefix.endsWith('/')?path.resolve(base,'.'+pathname.slice(prefix.length-1)):path.resolve(target)]);}
    for(const root of roots)candidates.push([root,path.resolve(root,'.'+pathname)]);
    for(const [root,file] of body?[]:candidates){if(!inside(root,file))continue;try{body=await readFile(file);break;}catch{}}
    if(!body){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(pathname)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

// `node tests/source-app-server.mjs` previews the sources at VELA_PREVIEW_PORT (default 4174) until stopped.
if(path.basename(process.argv[1]||'')==='source-app-server.mjs'){
  const {url}=await startSourceAppServer({port:Number(process.env.VELA_PREVIEW_PORT??4174)});console.log('VELA_PREVIEW_URL='+url);
}
