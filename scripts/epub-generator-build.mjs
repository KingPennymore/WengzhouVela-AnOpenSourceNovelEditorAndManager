import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ejs=require('ejs'),{optionsDefaults,chapterDefaults}=require('epub-gen-memory');

// Upstream EJS compiles templates with Function at runtime. Compile the unchanged
// upstream templates during packaging so the host can retain its strict CSP.
export function epubGeneratorBuild(){
 const defaults=[optionsDefaults(2),optionsDefaults(3)],templates=[...new Set(defaults.flatMap(opt=>[opt.chapterXHTML,opt.contentOPF,opt.tocNCX,opt.tocXHTML]))];
 const keys=[...new Set([...Object.keys(defaults[0]),...Object.keys(chapterDefaults(0)),'title','id','images','cover','content','filename'])];
 const pairs=templates.map(template=>JSON.stringify(template)+','+ejs.compile(template,{client:true,compileDebug:false,_with:false,localsName:'locals',destructuredLocals:keys}).toString());
 const contents='const templates=new Map(['+pairs.map(pair=>'['+pair+']').join(',')+']);export function render(template,data){const fn=templates.get(template);if(!fn)throw Error("Unsupported EPUB template");return fn(data);}';
 return {name:'epub-static-templates',setup(plugin){plugin.onResolve({filter:/^ejs$/},()=>({path:'templates',namespace:'epub-static'}));plugin.onLoad({filter:/.*/,namespace:'epub-static'},()=>({contents,loader:'js'}));}};
}
