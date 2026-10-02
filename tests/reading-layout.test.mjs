import test from 'node:test';
import assert from 'node:assert/strict';
import {displayChapterTitle,fitReadingLayout,swipeDirection,readingPageInfo,readingGeometry,spreadStart} from '../web/reader-layout.mjs';
import {createVelaV2,parseVela,effectiveVela,velaText,projectConfig,readingDocuments,GLOBAL_VELA_PATH} from '../web/vela.mjs';

test('阅读 footer 去掉尾部标点，保留章节内部标点和 Unicode 内容',()=>{
  assert.equal(displayChapterTitle('第一章：航路？！  '),'第一章：航路');assert.equal(displayChapterTitle('Chapter 1 — Horizon…'),'Chapter 1 — Horizon');assert.equal(displayChapterTitle('【终章】'),'【终章');
});
test('四方向手势只在达到阈值时翻页',()=>{
  assert.equal(swipeDirection(5,20),0);assert.equal(swipeDirection(-80,20),1);assert.equal(swipeDirection(80,20),-1);assert.equal(swipeDirection(20,-80),1);assert.equal(swipeDirection(20,80),-1);
});

test('双页使用独立页宽与跨页间隙，窄屏切回单页',()=>{
  const geometry=readingGeometry('double',1200);assert.equal(geometry.columns,2);assert.equal(geometry.pageWidth*2+geometry.gap,1200);assert.equal(geometry.stride*2,1200+geometry.gap);
  assert.equal(readingGeometry('double',759).columns,1);assert.equal(readingGeometry('pages',1200).columns,1);assert.equal(readingGeometry('scroll',1200).paged,false);
});

test('双页末页、单页书籍与反向操作不会重复或越界',()=>{
  assert.equal(spreadStart(3,9,2),2);assert.equal(spreadStart(10,9,2),8);assert.equal(spreadStart(-2,9,2),0);
  assert.deepEqual(readingPageInfo({paged:true,page:8,pages:9,columns:2}),{page:9,end:9,pages:9,ratio:1});assert.deepEqual(readingPageInfo({paged:true,page:0,pages:1,columns:2}),{page:1,end:1,pages:1,ratio:1});assert.equal(readingPageInfo({paged:true,page:2,pages:10,columns:2}).end,4);
});
test('上下模式显示屏幕页数，单页进度和尾页范围正确',()=>{
  assert.deepEqual(readingPageInfo({paged:true,page:0,pages:1}),{page:1,pages:1,ratio:1});assert.deepEqual(readingPageInfo({paged:false,scrollTop:1600,scrollHeight:2400,height:800}),{page:3,pages:3,ratio:1});
});
test('新版缺省排版继承默认值，拒绝非法边距；小窗口限制边距保留正文空间',()=>{
  const config=createVelaV2('Book'),parsed=parseVela(JSON.stringify(config));assert.equal(parsed.reading.layout,undefined);assert.equal(effectiveVela(null,parsed).reading.layout.lineHeight,1.9);
  for(const layout of [{lineHeight:.5},{marginLeft:-1},{marginTop:Infinity},[]])assert.throws(()=>velaText({...config,reading:{items:[],layout}}));
  const fitted=fitReadingLayout({lineHeight:2,marginLeft:240,marginRight:240,marginTop:240,marginBottom:240},320,200);assert.equal(fitted.marginLeft+fitted.marginRight,240);assert.equal(fitted.marginTop+fitted.marginBottom,120);
});
test('全局个人书库与区域相对路径独立，不依赖旧设置开关',()=>{
  const global={id:'g',name:GLOBAL_VELA_PATH,text:velaText({...createVelaV2('',{global:true}),reader:{appearancePolicy:'personal',layout:{fontSize:22}},library:{mode:'manual',items:[{id:'o',path:'outside.txt'},{id:'a',path:'Sub/a.txt'}]}})},local={id:'l',name:'.vela',path:'Sub/.vela',text:velaText({...createVelaV2('Local'),reading:{items:[{id:'b',path:'b.txt'}]}})},a={id:'a',name:'a.txt',path:'Sub/a.txt'},b={id:'b',name:'b.txt',path:'Sub/b.txt'},outside={id:'o',name:'outside.txt'};
  const workspace={documents:[global,local,a,b,outside],settings:{}};
  assert.equal(projectConfig(workspace,a).config.project.name,'Local');assert.equal(projectConfig(workspace,outside).config.kind,'global');assert.deepEqual(readingDocuments(workspace).map(doc=>doc.id),['o','a']);
  workspace.settings.globalVelaOverride=true;assert.deepEqual(readingDocuments(workspace).map(doc=>doc.id),['o','a']);assert.equal(projectConfig(workspace,a).config.reading.layout.fontSize,22);
  workspace.documents.shift();assert.deepEqual(readingDocuments(workspace).map(doc=>doc.id),['b','o']);
});
