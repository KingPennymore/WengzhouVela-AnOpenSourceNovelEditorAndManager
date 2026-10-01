const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname), plugin=path.resolve(root,'../..');
const fontRoot=path.join(root,'node_modules/@fontsource/noto-sans-sc');
const paths={'/fonts/400.css':path.join(fontRoot,'400.css'),'/':path.join(root,'index.html'),'/ace.js':path.join(root,'node_modules/ace-builds/src-noconflict/ace.js'),'/host-bundle.js':path.join(root,'host-bundle.js')};
for(const file of fs.readdirSync(path.join(fontRoot,'files')))paths['/fonts/files/'+file]=path.join(fontRoot,'files',file);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=paths[url.pathname];
 if(url.pathname==='/plugin.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(plugin+'/src/core.js','utf8')+'\n'+fs.readFileSync(plugin+'/src/i18n.js','utf8')+'\n'+fs.readFileSync(plugin+'/src/plugin.js','utf8'));return;}
 if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.woff')?'font/woff':'application/javascript');res.end(fs.readFileSync(file));
});
const report=[]; const errors=[];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.WRITER_CHROMIUM_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--disable-gpu','--disable-webgl','--disable-software-rasterizer','--use-gl=disabled']});
 try{
 for(const mode of ['cm','ace']){
  const context=await browser.newContext({viewport:{width:360,height:740}});const page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('pageerror',e=>errors.push(mode+': '+e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);await page.waitForSelector('.aw-bar');await page.evaluate(()=>document.fonts.ready);
  const check=async(name,fn)=>{try{await fn();report.push({mode,name,passed:true});console.log("PASS "+mode+": "+name);}catch(e){report.push({mode,name,passed:false,error:e.message});console.log("FAIL "+mode+": "+name+" — "+e.message);}};
  await check('底栏显示初始章节与全文字数',async()=>{
   assert.match(await page.locator('.aw-current').textContent(),/炉边.*2字/);assert.match(await page.locator('.aw-total').textContent(),/5字/);
  });
  await check('底栏预留空间，正文没有覆盖',async()=>{
   const geometry=await page.evaluate(()=>{const bar=document.querySelector('.aw-bar').getBoundingClientRect(),outer=document.querySelector('#editor').getBoundingClientRect(),scroll=document.querySelector('.cm-scroller,.ace_scroller').getBoundingClientRect();return {barBottom:bar.bottom,barTop:bar.top,outerBottom:outer.bottom,scrollBottom:scroll.bottom};});
   assert.ok(Math.abs(geometry.barBottom-geometry.outerBottom)<2,JSON.stringify(geometry));assert.ok(geometry.scrollBottom<=geometry.barTop+1,JSON.stringify(geometry));
  });
  await check('目录搜索点击跳转，文稿内容不变',async()=>{
   const before=await page.evaluate(()=>host.text());await page.locator('.aw-current').click();await page.getByRole('searchbox').fill('渡口');await page.locator('.aw-list button').click();
   assert.equal(await page.evaluate(()=>host.row()),2);assert.equal(await page.evaluate(()=>host.text()),before);assert.match(await page.locator('.aw-count').textContent(),/3字/);
  });
  await check('编辑后实时刷新',async()=>{
   await page.evaluate(()=>{host.setText('一、炉边\n甲乙\n二、渡口\n丙丁戊己');host.cursor(3);});await page.waitForTimeout(260);assert.match(await page.locator('.aw-count').textContent(),/4字/);
  });
  await check('持续输入时500ms内刷新',async()=>{
   await page.evaluate(async()=>{for(let i=0;i<10;i++){host.setText('一、炉边\n'+ '甲'.repeat(10+i));await new Promise(r=>setTimeout(r,70));}});
   assert.ok(Number((await page.locator('.aw-count').textContent()).replace(/[^0-9]/g,''))>=10,'连续编辑时仍显示旧字数');await page.waitForTimeout(220);
  });
  await check('设置模板保存并应用',async()=>{
   await page.getByTitle('写作插件设置').click();await page.getByLabel('标题识别方式').selectOption('template');await page.waitForTimeout(230);
   await page.getByLabel('标题模板',{exact:true}).fill('【{序号}】{标题}');await page.getByRole('button',{name:'保存设置',exact:true}).click();
   assert.equal(await page.locator('.aw-overlay').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('com.tuyuan.acode.writer.settings.v1')).format),'template');
   await page.evaluate(()=>host.setText('【一】山林\n甲乙丙\n【二】河岸\n丁戊'));await page.waitForTimeout(260);assert.match(await page.locator('.aw-current').textContent(),/山林.*3字/);
  });
  await check('无效正则不能覆盖已保存设置',async()=>{
   const stored=await page.evaluate(()=>localStorage.getItem('com.tuyuan.acode.writer.settings.v1'));
   await page.getByTitle('写作插件设置').click();await page.getByLabel('标题识别方式').selectOption('custom');await page.waitForTimeout(230);
   await page.locator('.aw-dialog textarea:visible').fill('[');await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.match(await page.locator('.aw-error').textContent(),/无效/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('com.tuyuan.acode.writer.settings.v1')),stored);await page.keyboard.press('Escape');
  });
  await check('恢复默认和重载保留设置',async()=>{
   await page.getByTitle('写作插件设置').click();await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.getByLabel('章节和全文字数包含标题').check();await page.getByRole('button',{name:'保存设置',exact:true}).click();
   await page.evaluate(()=>{host.unmount();host.init();});await page.getByTitle('写作插件设置').click();assert.ok(await page.getByLabel('章节和全文字数包含标题').isChecked());
   await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.getByRole('button',{name:'保存设置',exact:true}).click();
  });
  await check('320px屏幕的大字数可见',async()=>{
   await page.setViewportSize({width:320,height:600});await page.evaluate(()=>host.setText('一、很长很长很长很长很长很长的章节标题\n'+'甲'.repeat(100001)));await page.waitForTimeout(300);
   const g=await page.evaluate(()=>{const count=document.querySelector('.aw-count').getBoundingClientRect(),button=document.querySelector('.aw-current').getBoundingClientRect();return {countRight:count.right,buttonRight:button.right,countWidth:count.width};});
   assert.ok(g.countRight<=g.buttonRight+.5&&g.countWidth>0,JSON.stringify(g));
  });
  await check('低高度窗口中的设置表单可滚动',async()=>{
   await page.setViewportSize({width:320,height:360});await page.getByTitle('写作插件设置').click();await page.getByRole('button',{name:'保存设置',exact:true}).scrollIntoViewIfNeeded();
   const g=await page.locator('.aw-dialog').boundingBox();assert.ok(g.y>=0&&g.y+g.height<=360,JSON.stringify(g));await page.keyboard.press('Escape');
  });
  await check('切换文件不沿用上一文稿章节和字数',async()=>{
   await page.setViewportSize({width:360,height:740});await page.evaluate(()=>host.switchFile('other.txt','一、新文稿\n山河'));await page.waitForTimeout(280);assert.match(await page.locator('.aw-current').textContent(),/新文稿.*2字/);
  });
  if(mode==='cm')await check('替换EditorState后恢复面板',async()=>{await page.evaluate(()=>host.resetState('一、重置\n甲乙丙丁'));await page.waitForTimeout(700);assert.match(await page.locator('.aw-current').textContent(),/重置.*4字/);});
  await check('重复启用停用清理底栏、命令和返回栈',async()=>{
   await page.evaluate(()=>host.run('outline'));await page.evaluate(()=>host.unmount());assert.equal(await page.locator('.aw-bar,.aw-overlay').count(),0);
   assert.equal(await page.evaluate(()=>host.commands.size+host.actions.size),0);await page.evaluate(()=>{host.init();host.init();});assert.equal(await page.locator('.aw-bar').count(),1);
  });
  const themeColors={light:{'primary-color':'rgb(255,255,255)','primary-text-color':'rgb(15,23,42)','secondary-color':'rgb(248,250,252)','secondary-text-color':'rgb(51,65,85)','popup-background-color':'rgb(255,255,255)','popup-text-color':'rgb(15,23,42)','border-color':'rgb(226,232,240)','link-text-color':'rgb(37,99,235)','error-text-color':'rgb(185,28,28)'},dark:{'primary-color':'rgb(35,39,42)','primary-text-color':'rgb(245,245,245)','secondary-color':'rgb(45,49,52)','secondary-text-color':'rgb(228,228,228)','popup-background-color':'rgb(35,39,42)','popup-text-color':'rgb(245,245,245)','border-color':'rgba(188,188,188,.15)','link-text-color':'rgb(138,180,248)','error-text-color':'rgb(255,185,92)'}};
  const setTheme=async name=>page.evaluate(({name,colors})=>{document.body.setAttribute('theme-type',name);for(const [key,color] of Object.entries(colors))document.body.style.setProperty('--'+key,color);}, {name,colors:themeColors[name]});
  const contrast=async(selector,background)=>page.evaluate(({selector,background})=>{
   const fg=getComputedStyle(document.querySelector(selector)).color,bg=getComputedStyle(document.querySelector(background)).backgroundColor;
   const lum=s=>{const rgb=s.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
   const a=lum(fg),b=lum(bg);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fg,bg};
  }, {selector,background});
  await check('浅色模式：正文、底栏、目录、表单和错误提示清晰',async()=>{
   await setTheme('light');await page.locator('.aw-current').click();
   for(const [a,b] of [['.aw-count','.aw-bar'],['.aw-dialog h2','.aw-dialog'],['.aw-list button[aria-current=true]','.aw-list button[aria-current=true]']]){const c=await contrast(a,b);assert.ok(c.ratio>=4.5,JSON.stringify(c));}
   await page.keyboard.press('Escape');await page.getByTitle('写作插件设置').click();await page.getByLabel('标题识别方式').selectOption('custom');await page.waitForTimeout(230);await page.locator('.aw-dialog textarea:visible').fill('[');await page.getByRole('button',{name:'保存设置',exact:true}).click();
   for(const [a,b] of [['.aw-dialog label','.aw-dialog'],['.aw-dialog select','.aw-dialog select'],['.aw-error','.aw-dialog']]){const c=await contrast(a,b);assert.ok(c.ratio>=4.5,JSON.stringify(c));}
   assert.equal(await page.locator('.aw-overlay').evaluate(n=>getComputedStyle(n).colorScheme),'light');await page.keyboard.press('Escape');
  });
  await check('已打开的设置弹窗随主题即时切换，深色保持可读',async()=>{
   await page.getByTitle('写作插件设置').click();await setTheme('dark');
   for(const [a,b] of [['.aw-dialog h2','.aw-dialog'],['.aw-dialog select','.aw-dialog select'],['.aw-count','.aw-bar']]){const c=await contrast(a,b);assert.ok(c.ratio>=4.5,JSON.stringify(c));}
   assert.equal(await page.locator('.aw-overlay').evaluate(n=>getComputedStyle(n).colorScheme),'dark');
   await setTheme('light');const c=await contrast('.aw-dialog h2','.aw-dialog');assert.ok(c.ratio>=4.5);await page.keyboard.press('Escape');
  });


  await check('组合多种格式：添加模板与正则，停用单条规则并保存',async()=>{
   await page.getByTitle('写作插件设置').click();await page.getByLabel('标题识别方式').selectOption('multi');await page.waitForTimeout(230);
   await page.getByRole('button',{name:'添加标题格式',exact:true}).click();await page.getByLabel('规则 3 内容').fill('【{序号}】{标题}');
   await page.getByRole('button',{name:'添加标题格式',exact:true}).click();await page.getByLabel('规则 4 格式').selectOption('custom');await page.getByLabel('规则 4 内容').fill('序章|终章');
   await page.getByLabel('启用规则 2').uncheck();await page.getByRole('button',{name:'保存设置',exact:true}).click();
   await page.evaluate(()=>host.setText('序章\n甲\n一、山河\n乙\n【二】归来\n丙\nChapter Three: Home\n丁'));await page.waitForTimeout(260);
   await page.locator('.aw-current').click();assert.match(await page.locator('.aw-help').textContent(),/3 章/);assert.equal(await page.locator('.aw-list button').count(),3);await page.keyboard.press('Escape');
   await page.evaluate(()=>{host.unmount();host.init();});await page.getByTitle('写作插件设置').click();assert.equal(await page.getByLabel('标题识别方式').inputValue(),'multi');assert.equal(await page.locator('.aw-rule').count(),4);assert.equal(await page.getByLabel('启用规则 2').isChecked(),false);await page.keyboard.press('Escape');
  });
  await check('组合规则验证、删除及空列表不会覆盖已保存设置',async()=>{
   await page.getByTitle('写作插件设置').click();const stored=await page.evaluate(()=>localStorage.getItem('com.tuyuan.acode.writer.settings.v1'));
   await page.getByLabel('规则 4 内容').fill('[');await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.match(await page.locator('.aw-error').textContent(),/第 4 条规则.*无效/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('com.tuyuan.acode.writer.settings.v1')),stored);
   for(let n=4;n>=1;n--)await page.getByRole('button',{name:`删除规则 ${n}`,exact:true}).click();await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.match(await page.locator('.aw-error').textContent(),/至少启用/);
   await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.getByRole('button',{name:'保存设置',exact:true}).click();
  });
  await check('自动模式跟随Acode英语，目录保留文稿原始标题并跳转',async()=>{
   await page.evaluate(()=>{host.language('en-us');host.switchFile('english.txt','Preface\nChapter One: Dawn\nHello world!\n一、山河\n甲乙\nChapter IV — Home\nGoodbye.');});await page.waitForTimeout(260);
   await page.getByTitle('Writer settings').count().then(n=>assert.equal(n,1));
   assert.equal(await page.evaluate(()=>host.commands.get('com.tuyuan.acode.writer.outline').description),'Writer: Chapter outline');
   await page.locator('.aw-current').click();assert.equal(await page.locator('.aw-dialog h2').textContent(),'Chapter outline');
   assert.match(await page.locator('.aw-list').textContent(),/Preamble/);await page.getByRole('searchbox',{name:'Search chapter titles'}).fill('home');
   const before=await page.evaluate(()=>host.text());await page.locator('.aw-list button').click();assert.equal(await page.evaluate(()=>host.row()),5);assert.equal(await page.evaluate(()=>host.text()),before);
   assert.match(await page.locator('.aw-current').textContent(),/Chapter IV — Home.*8 chars/);
  });
  await check('英文设置、验证错误和空文稿标签',async()=>{
   await page.getByTitle('Writer settings').click();await page.getByLabel('Heading format').selectOption('custom');await page.waitForTimeout(230);
   await page.locator('.aw-dialog textarea:visible').fill('[');await page.getByRole('button',{name:'Save settings',exact:true}).click();assert.match(await page.locator('.aw-error').textContent(),/Invalid heading regex/);
   for(const selector of ['.aw-dialog h2','.aw-preview','.aw-error','.aw-actions']) assert.doesNotMatch(await page.locator(selector).textContent(),/[\p{Script=Han}]/u);await page.keyboard.press('Escape');
   await page.evaluate(()=>host.setText('No headings here.'));await page.waitForTimeout(260);assert.match(await page.locator('.aw-current').textContent(),/Document \(no chapters found\).*chars/);
  });
  await check('英文模板预览保存，大小写与英文数词支持',async()=>{
   await page.getByTitle('Writer settings').click();await page.getByLabel('Heading format').selectOption('template');await page.waitForTimeout(230);
   await page.getByLabel('Heading template',{exact:true}).fill('Chapter {number}: {title}');await page.getByRole('button',{name:'Save settings',exact:true}).click();
   await page.evaluate(()=>host.setText('CHAPTER Twenty-One: Home\nHello world!'));await page.waitForTimeout(260);assert.match(await page.locator('.aw-current').textContent(),/Twenty-One: Home.*11 chars/);
   await page.getByTitle('Writer settings').click();assert.match(await page.locator('.aw-preview').textContent(),/Document preview: 1 headings, 11 chars/);await page.keyboard.press('Escape');
  });
  await check('明确英文选择持久保存，Acode中文不会覆盖',async()=>{
   await page.getByTitle('Writer settings').click();await page.getByLabel('Interface language').selectOption('en');await page.getByRole('button',{name:'Save settings',exact:true}).click();
   await page.evaluate(()=>{host.language('zh-cn');host.unmount();host.init();});assert.equal(await page.getByTitle('Writer settings').count(),1);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('com.tuyuan.acode.writer.settings.v1')).language),'en');
  });
  await check('英文320px大字数完整可见',async()=>{
   await page.setViewportSize({width:320,height:600});await page.evaluate(()=>host.setText('Chapter 1: A very long title\n'+'a'.repeat(100001)));await page.waitForTimeout(280);
   const g=await page.evaluate(()=>{const count=document.querySelector('.aw-count').getBoundingClientRect(),button=document.querySelector('.aw-current').getBoundingClientRect();return {left:count.left,right:count.right,buttonLeft:button.left,buttonRight:button.right};});
   assert.ok(g.left>=g.buttonLeft&&g.right<=g.buttonRight+.5,JSON.stringify(g));await page.setViewportSize({width:360,height:740});
  });
  await check('手动中文和恢复自动语言，中英切换即时生效',async()=>{
   await page.getByTitle('Writer settings').click();await page.getByLabel('Interface language').selectOption('zh');await page.getByRole('button',{name:'Save settings',exact:true}).click();
   await page.evaluate(()=>host.language('en-us'));assert.equal(await page.getByTitle('写作插件设置').count(),1);
   await page.getByTitle('写作插件设置').click();await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.getByRole('button',{name:'保存设置',exact:true}).click();
   assert.equal(await page.getByTitle('Writer settings').count(),1);await page.evaluate(()=>host.language('zh-cn'));assert.equal(await page.getByTitle('写作插件设置').count(),1);
  });
  await page.evaluate(()=>host.switchFile('sample.txt','一、炉边\n炉火渐渐熄灭，屋外的风却没有停。\n他说：“明天再出发。”\n\n二、渡口\n河面映着晨光。\n渡船向另一岸驶去。\n\n第三章 远山\n山路尽头，有一座尚未苏醒的小城。'));
  await page.waitForTimeout(250);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,mode+'-editor.png')});
  await page.locator('.aw-current').click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,mode+'-outline.png')});await page.keyboard.press('Escape');
  await page.getByTitle('写作插件设置').click();await page.getByLabel('标题识别方式').selectOption('template');await page.waitForTimeout(230);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,mode+'-settings.png')});
  await context.close();
 }
 }finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(root,'browser-results.json'),JSON.stringify({report,errors},null,2));
 for(const r of report)console.log(`${r.passed?'PASS':'FAIL'} ${r.mode}: ${r.name}${r.error?' — '+r.error:''}`);
 console.log(JSON.stringify({passed:report.filter(r=>r.passed).length,failed:report.filter(r=>!r.passed).length,errors}));
 if(report.some(r=>!r.passed)||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
