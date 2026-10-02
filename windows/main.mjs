import {app,BrowserWindow,ipcMain,protocol,session,nativeTheme,safeStorage,dialog,net,shell,Menu} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WorkspaceStorage,decodeText,atomic,mime} from './storage.mjs';
import {GitHubBridge} from './github.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url)),PAGE='vela://editor/web/index.html',qa=process.env.VELA_QA==='1';
// QA accepts an isolated explicitly supplied data directory; normal runs use Electron userData.
if(qa){if(!process.env.VELA_QA_DATA||!path.isAbsolute(process.env.VELA_QA_DATA))throw new Error('QA requires an absolute isolated data directory.');app.setPath('userData',process.env.VELA_QA_DATA);}
protocol.registerSchemesAsPrivileged([{scheme:'vela',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let main,files,github,closing=false,readerSession;const readerOptions=new Map();const previews=new Set();
const assets=app.isPackaged?path.join(process.resourcesPath,'web'):path.resolve(directory,'../dist/web');
const icon=app.isPackaged?path.join(process.resourcesPath,'icon.png'):path.resolve(directory,'../AppScope/resources/base/media/app_icon_1024.png');
const failure=error=>JSON.stringify({ok:false,error:error.message||'操作失败。'}),success=value=>JSON.stringify({ok:true,value:value??null});
const environment=()=>JSON.stringify({platform:'windows',version:app.getVersion(),dark:nativeTheme.shouldUseDarkColors,credentialStore:'Windows DPAPI',top:0,bottom:0,left:0,right:0});
function trusted(event){return main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame.url===PAGE;}
function secureWindow(window){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-attach-webview',event=>event.preventDefault());window.webContents.on('will-navigate',(event,url)=>{if(url!==PAGE)event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
}
async function request(url,method,body,token){
  const parsed=new URL(url);if(!['api.github.com','github.com'].includes(parsed.hostname)||parsed.protocol!=='https:'||parsed.port||parsed.username||parsed.password)throw new Error('不允许的请求地址。');
  const headers={Accept:'application/json','Content-Type':'application/json','User-Agent':'Vela-Windows/'+app.getVersion()};if(token){headers.Authorization='Bearer '+token;headers.Accept='application/vnd.github+json';headers['X-GitHub-Api-Version']='2022-11-28';}
  const response=await net.fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000),bypassCustomProtocolHandlers:true});
  const chunks=[];let bytes=0;for await(const chunk of response.body||[]){bytes+=chunk.byteLength;if(bytes>16*1024*1024)throw new Error('GitHub 响应过大。');chunks.push(Buffer.from(chunk));}
  const text=Buffer.concat(chunks).toString('utf8');let value=null;try{if(text)value=JSON.parse(text);}catch{if(response.ok)throw new Error('GitHub 响应格式异常。');value={};}return {status:response.status,body:value};
}
function credentials(){
  const file=path.join(files.base,'github-token.dat');return {
    read:()=>{if(!fs.existsSync(file))return '';if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 安全凭据存储不可用。');return safeStorage.decryptString(fs.readFileSync(file));},
    write:token=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 安全凭据存储不可用。');atomic(file,safeStorage.encryptString(token));},
    clear:()=>{if(fs.existsSync(file))fs.unlinkSync(file);}
  };
}
function assetResponse(url){
  try{if(url.hostname!=='editor'||!url.pathname.startsWith('/web/'))return new Response('',{status:403});const relative=decodeURIComponent(url.pathname.slice(5));if(relative.includes('\\')||relative.split('/').some(part=>part==='..'||part==='.'||!part))throw new Error('invalid');const file=path.resolve(assets,relative);if(!file.startsWith(assets+path.sep)||!fs.statSync(file).isFile())throw new Error('missing');return new Response(fs.readFileSync(file),{headers:{'Content-Type':mime(file),'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}
}
const embeddedPolicy="sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src data: https://wenzhou-preview.local; media-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const readingPolicy="default-src 'none'; script-src https://wenzhou-reader.local; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src data: https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function previewResponse(url,options={},embedded=false){
  try{
    if(url.hostname==='wenzhou-reader.local'&&url.pathname==='/reader.js'&&options.reading)return new Response(fs.readFileSync(path.join(assets,'html-reader.js')),{headers:{'Content-Type':'text/javascript'}});
    if(url.hostname!=='wenzhou-preview.local')return new Response('',{status:403});const relative=decodeURIComponent(url.pathname.slice(1)),resource=files.resource(relative,/\.html?$/i.test(relative));let bytes=resource.bytes;
    if(resource.mime==='text/html'){
      let text=bytes.toString('utf8');if(options.reading&&relative===options.path){text=text.replace(/\scontenteditable(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/gi,'').replace(/<(input|textarea|select|button)(?=[\s>])/gi,'<$1 disabled readonly').replace(/<meta[^>]*http-equiv\s*=\s*['"]?Content-Security-Policy[^>]*>/gi,'');text+='<script src="https://wenzhou-reader.local/reader.js?config='+encodeURIComponent(JSON.stringify({...options,pages:options.readingMode==='pages',english:options.language==='en'}))+'"></script>';}
      if(embedded)text+='<style>html{color-scheme:'+ (url.searchParams.get('dark')==='true'?'dark':'light')+'}body{font-family:system-ui;font-size:'+Math.max(10,Math.min(40,Number(url.searchParams.get('fontSize'))||16))+'px;overflow-wrap:anywhere}</style>';bytes=Buffer.from(text);
    }
    return new Response(bytes,{headers:{'Content-Type':resource.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':options.reading?readingPolicy:embedded||!options.scripts?embeddedPolicy:"default-src 'none'; script-src 'unsafe-inline' https://wenzhou-preview.local; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}});
  }catch{return new Response('',{status:403});}
}
async function previewHtml(options){
  files.resource(options.path,true);const url='https://wenzhou-preview.local/'+options.path.split('/').map(encodeURIComponent).join('/');if(options.embedded)return url+'?html=true&fontSize='+Math.max(10,Math.min(40,options.fontSize||16))+'&dark='+!!options.dark;
  const partition=options.reading?'persist:vela-reader':'vela-preview-'+randomUUID(),isolated=options.reading?readerSession:session.fromPartition(partition);
  if(options.reading)readerOptions.set(options.path,{...options});else isolated.protocol.handle('https',request=>previewResponse(new URL(request.url),options));
  isolated.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));isolated.setPermissionCheckHandler(()=>false);
  const window=new BrowserWindow({title:path.basename(options.path)+' — Vela',width:1100,height:820,show:!qa,icon,autoHideMenuBar:true,fullscreen:!!options.reading,webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});previews.add(window);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('will-navigate',(event,target)=>{if(options.reading&&target==='https://wenzhou-reader.local/back'){event.preventDefault();window.close();return;}if(target!==url)event.preventDefault();});window.on('closed',()=>{previews.delete(window);if(!options.reading)isolated.clearStorageData().catch(()=>{});});
  if(!options.reading){window.setMenu(Menu.buildFromTemplate([{label:'Preview',submenu:[{label:'Back to editor',click:()=>window.close()},{role:'reload'},{type:'checkbox',label:'Allow local scripts',checked:false,click:item=>{options.scripts=item.checked;window.webContents.reload();}}]}]));window.setAutoHideMenuBar(false);}
  await window.loadURL(url);return true;
}
async function picker(operation,data){
  if(operation==='export'||operation==='exportPdf'){
    if(typeof data.name!=='string'||!data.name||/[\\/\x00-\x1f]/.test(data.name))throw new Error('文件名无效。');let bytes;if(operation==='exportPdf'){if(typeof data.data!=='string'||data.data.length>96*1024*1024)throw new Error('PDF 数据无效。');bytes=Buffer.from(data.data,'base64');if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('PDF 数据无效。');}else{if(typeof data.text!=='string'||Buffer.byteLength(data.text)>64*1024*1024)throw new Error('导出数据无效。');bytes=Buffer.from(data.text);}
    const result=await dialog.showSaveDialog(main,{defaultPath:data.name,filters:[{name:operation==='exportPdf'?'PDF':'Document',extensions:[path.extname(data.name).slice(1)||'txt']}]});if(result.canceled)return false;atomic(result.filePath,bytes);return true;
  }
  const result=await dialog.showOpenDialog(main,{properties:operation==='import'?['openFile','multiSelections']:['openFile'],filters:operation==='importPlugin'?[{name:'Plugin ZIP',extensions:['zip']}]:undefined});if(result.canceled)return operation==='import'?[]:false;
  const values=result.filePaths.slice(0,10).map(file=>{const limit=operation==='importPlugin'?64*1024*1024:8*1024*1024;if(fs.statSync(file).size>limit)throw new Error('选择的文件超过大小限制。');const bytes=fs.readFileSync(file),name=path.basename(file);if(operation==='importPlugin')return {name,data:bytes.toString('base64')};try{return {name,text:decodeText(bytes)};}catch{return {name,data:bytes.toString('base64')};}});return operation==='import'?values:values[0];
}
async function dispatch(operation,data){
  switch(operation){
    case 'initializeStorage':case 'refreshFolder':return files.scan();
    case 'manageFiles':return files.manage(data.action,data.path,data.destination);
    case 'listTrash':return files.listTrash();
    case 'restoreTrash':return files.restoreTrash(data.id,data.permanent===true);
    case 'writeWorkspaceFiles':return files.writeFiles(data.files||[],data.folders||[]);
    case 'readWorkspaceFile':return files.read(files.target(data.path)).toString('base64');
    case 'readWorkspaceAsset':return files.asset(data.path);
    case 'previewHtml':return previewHtml(data);
    case 'appearance':if(/^#[\da-f]{6}$/i.test(data.background))main.setBackgroundColor(data.background);return true;
    case 'fullscreen':main.setFullScreen(data.enabled===true);main.setMenuBarVisibility(data.enabled!==true);return true;
    case 'openAuth':await shell.openExternal('https://github.com/login/device');return true;
    case 'import':case 'export':case 'exportPdf':case 'importPlugin':return picker(operation,data);
    default:return github.call(operation,data);
  }
}
function mainMenu(){
  const click=id=>()=>main.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click()`);
  return Menu.buildFromTemplate([{label:'File / 文件',submenu:[{label:'New / 新建',accelerator:'Ctrl+N',click:click('new-doc')},{label:'Import / 导入',click:click('import-doc')},{label:'Save / 保存',accelerator:'Ctrl+S',click:click('quick-save')},{label:'Export / 导出',click:click('export-doc')},{type:'separator'},{role:'quit'}]},{label:'Edit / 编辑',submenu:[{label:'Undo / 撤回',accelerator:'Ctrl+Z',click:click('quick-undo')},{label:'Redo / 重做',accelerator:'Ctrl+Shift+Z',click:click('quick-redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View / 视图',submenu:[{label:'Settings / 设置',click:click('settings')},{label:'Toggle fullscreen / 切换全屏',accelerator:'F11',click:()=>main.setFullScreen(!main.isFullScreen())}]}]);
}
if(!qa&&!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{if(main){if(main.isMinimized())main.restore();main.focus();}});
  app.whenReady().then(async()=>{files=new WorkspaceStorage(app.getPath('userData'));github=new GitHubBridge({request,credentials:credentials()});
  readerSession=session.fromPartition('persist:vela-reader');readerSession.protocol.handle('https',request=>{const url=new URL(request.url);return previewResponse(url,readerOptions.get(decodeURIComponent(url.pathname.slice(1)))||{reading:true});});
  const editorSession=session.fromPartition('persist:vela-editor');editorSession.protocol.handle('vela',request=>assetResponse(new URL(request.url)));editorSession.protocol.handle('https',request=>previewResponse(new URL(request.url),{},true));
  main=new BrowserWindow({title:'Vela 文舟',width:1280,height:850,minWidth:720,minHeight:480,show:!qa,icon,backgroundColor:'#eef3ef',webPreferences:{partition:'persist:vela-editor',preload:path.join(directory,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});secureWindow(main);Menu.setApplicationMenu(mainMenu());
  ipcMain.on('vela:sync',(event,operation,data)=>{if(!trusted(event)){event.returnValue={error:'不允许的调用来源。',value:'不允许的调用来源。'};return;}try{let value;if(operation==='readWorkspace')value=files.readWorkspace();else if(operation==='readPlugins')value=files.readPlugins();else if(operation==='readEnvironment')value=environment();else if(operation==='writeWorkspace'){files.saveWorkspace(data);value='ok';}else if(operation==='writePlugins'){files.writePlugins(data);value='ok';}else throw new Error('不支持此操作。');event.returnValue={value};}catch(error){event.returnValue={error:error.message,value:error.message};}});
  ipcMain.handle('vela:call',async(event,operation,json)=>{if(!trusted(event))return failure(new Error('不允许的调用来源。'));try{if(typeof json!=='string'||json.length>100*1024*1024)throw new Error('请求数据无效或过大。');const data=JSON.parse(json);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('请求数据无效。');return success(await dispatch(operation,data));}catch(error){return failure(error);}});
  nativeTheme.on('updated',()=>{if(main&&!main.isDestroyed())main.webContents.executeJavaScript('window.dispatchEvent(new CustomEvent("wenzhouEnvironment",{detail:'+environment()+'}))').catch(()=>{});});
  main.on('close',event=>{if(closing)return;event.preventDefault();main.webContents.executeJavaScript('window.wenzhouSave ? window.wenzhouSave() : true').then(saved=>{if(saved===false){dialog.showMessageBox(main,{type:'error',message:'保存失败，请先导出文稿备份。'});return;}closing=true;for(const preview of previews)preview.close();main.close();}).catch(()=>{closing=true;main.close();});});
  await main.loadURL(PAGE);
  app.on('window-all-closed',()=>app.quit());
  }).catch(error=>{console.error(error);app.exit(1);});
}
