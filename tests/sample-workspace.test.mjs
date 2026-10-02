import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {parseVela,readingDocuments,projectConfig} from '../web/vela.mjs';
import {relativeResource} from '../web/markdown-tools.mjs';

async function documents(folder='测试文件',prefix=''){
  const docs=[];
  for(const item of await readdir(folder,{withFileTypes:true})){const path=prefix+item.name;if(item.isDirectory())docs.push(...await documents(folder+'/'+item.name,path+'/'));else docs.push({id:path,name:item.name,path,text:await readFile(folder+'/'+item.name,'utf8')});}
  return docs;
}
test('公开测试工作区的所有阅读样例都有清单，嵌套 TEX 工程使用正确根路径',async()=>{
  const docs=await documents(),manifest=docs.find(doc=>doc.path==='.vela'),config=parseVela(manifest.text),expected=docs.filter(doc=>!doc.path.endsWith('.vela'));
  assert.equal(expected.length,54);assert.equal(config.reading.files.length,expected.length);
  assert.deepEqual(new Set(config.reading.files),new Set(expected.map(doc=>doc.path)));
  const workspace={documents:docs};assert.deepEqual(new Set(readingDocuments(workspace).map(doc=>doc.path)),new Set(config.reading.files));
  const main=docs.find(doc=>doc.path==='LaTeX/main.tex');assert.equal(projectConfig(workspace,main).folder,'LaTeX');
  for(const match of main.text.matchAll(/\\(?:input|usepackage|bibliography)\{([^}]+)\}/g)){
    const name=match[1];if(!name.includes('/')&&name!=='references')continue;
    assert.ok(docs.some(doc=>doc.path==='LaTeX/'+name+(/\.tex$/.test(name)?'':name==='references'?'.bib':'.sty')),'Missing TEX dependency: '+name);
  }
});
test('HTML 样例的相对样式、CSS 导入、图片和脚本都包含在可拉取的阅读清单中',async()=>{
  const docs=await documents(),byPath=new Map(docs.map(doc=>[doc.path,doc]));
  for(const doc of docs.filter(doc=>/\.(html|css)$/.test(doc.path)))for(const match of doc.text.matchAll(/(?:href|src)="([^"]+)"|url\(['"]?([^'"\)]+)['"]?\)/g)){
    const path=relativeResource(doc.path,match[1]||match[2]);assert.ok(path&&byPath.has(path),'Missing relative resource: '+doc.path+' → '+(match[1]||match[2]));
  }
});
