import {launchBrowser} from './browser-launch.mjs';
import {build} from 'esbuild';
import assert from 'node:assert/strict';

const browser=await launchBrowser();
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="editor" style="height:400px"></div>');
 const bundle=await build({stdin:{contents:`
  import {EditorState} from '@codemirror/state';
  import {EditorView} from '@codemirror/view';
  import {outlineMarkers,outlineMarksChanged} from './web/outline-markers.mjs';
  let calls=0,entries=[{outlineId:'o',collection:'outline',nodeId:'a',title:'原节点',anchor:{offset:0}}];
  const extension=outlineMarkers(()=>{calls++;return entries;},()=>{});
  const make=()=>EditorState.create({doc:Array.from({length:1000},(_,i)=>'正文 '+i).join('\\n'),extensions:[extension,EditorView.theme({'&':{height:'400px'},'.cm-scroller':{overflow:'auto'}})]});
  const view=new EditorView({state:make(),parent:document.querySelector('#editor')});
  window.probe={view,get calls(){return calls;},replace(){entries=[{outlineId:'o',collection:'outline',nodeId:'b',title:'新节点',anchor:{offset:0}}];view.dispatch({effects:outlineMarksChanged.of(null)});},make};
 `,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',target:'chrome105'});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('.cm-content .cm-line .outline-line-marker').waitFor();
 assert.equal(await page.locator('.outline-gutter').count(),0,'outline links do not create a gutter');
 assert.equal(await page.locator('.cm-gutters .outline-line-marker').count(),0);
 assert.equal(await page.evaluate(()=>probe.calls),1,'visible lines share a single workspace anchor query');
 await page.evaluate(()=>probe.replace());
 await page.waitForFunction(()=>document.querySelector('.outline-line-marker')?.title.includes('新节点'));
 assert.equal(await page.evaluate(()=>probe.calls),2,'explicit marker effects invalidate cached anchors');
 await page.evaluate(()=>probe.view.dispatch({changes:{from:probe.view.state.doc.length,insert:'\n结尾'}}));
 assert.equal(await page.evaluate(()=>probe.calls),3,'document changes invalidate cached anchors');
 await page.evaluate(()=>probe.view.setState(probe.make()));
 assert.equal(await page.evaluate(()=>probe.calls),4,'switching editor states invalidates cached anchors');
 assert.deepEqual(errors,[]);
 console.log('PASS 每个编辑器状态只查询一次大纲锚点；更新与切换后正确失效');
}finally{await browser.close();}
