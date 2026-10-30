import {t,say} from './i18n.mjs';
import {escapeHtml as esc,textBytes} from './text-utils.mjs';
import {repoPath,newDocument,documentKind} from './model.mjs';
import {native,transport,exportText} from './platform.mjs';
import {createVelaV2,velaText,globalConfig} from './vela.mjs';
import {documentPath} from './workspace.mjs';
import {itemPaths,basename,parentPath,copyDestination,within} from './file-manager.mjs';
import {folderPickerHtml,bindFolderPicker} from './folder-picker.mjs';

const $=s=>document.querySelector(s);

/** New folder, file menu, rename and properties. `app.workspace`, `app.selectedFolder` and `app.fileClipboard` are app state, read and set through accessors. */
export function createFileDialogs(app){
  const {openModal,closeModal,toast,fail,save,renderDocuments,manageFile}=app;
  function newFolder(parent=''){
    openModal(t('新建文件夹'),`<label>${t('文件夹名称')}<input name="name" required maxlength="160" autofocus></label>${folderPickerHtml(app.workspace,{selected:parent,escape:esc})}<label class="checkbox"><input name="workspace" type="checkbox">${t('同时建立作品设置')}</label>`,f=>{
      const folder=f.get('folder'),name=repoPath(f.get('name')),path=repoPath((folder?folder+'/':'')+name);
      if(name.includes('/'))throw Error(t('文件夹名称不能包含斜杠。'));
      if(itemPaths(app.workspace).has(path))throw new Error(t('此路径已存在。'));
      const previous=JSON.stringify(app.workspace),parts=path.split('/');
      app.workspace.folders=[...new Set([...(app.workspace.folders||[]),...parts.map((_,i)=>parts.slice(0,i+1).join('/'))])];
      if(f.has('workspace')){
        const config=createVelaV2(basename(path)),defaults=globalConfig(app.workspace)?.config?.workspaceDefaults;
        for(const key of ['editor','reader','chapters'])if(defaults?.[key])config[key]=structuredClone(defaults[key]);
        if(defaults?.reading?.layout)config.reading.layout=structuredClone(defaults.reading.layout);
        const doc=newDocument('.vela',velaText(config));
        doc.path=path+'/.vela';
        app.workspace.documents.push(doc);
      }
      if(!save()){
        app.workspace=JSON.parse(previous);
        throw new Error(t('文件夹创建失败。'));
      }
      app.selectedFolder=path;
      renderDocuments();
    });
    bindFolderPicker($('#dialog-body'));
  }
  function documentMenu(id){const doc=app.workspace.documents.find(doc=>doc.id===id);if(doc)fileMenu(documentPath(doc),false,doc);}
  function fileMenu(path,directory=false,doc=app.workspace.documents.find(doc=>documentPath(doc)===path)){
    openModal(directory?t('文件夹操作'):t('文件操作'),`<p>${esc(path)}</p>
      <div class="button-row file-actions">${directory?`<button type="button" class="secondary" id="folder-new-file">${t('新建文件')}</button><button type="button" class="secondary" id="folder-new-folder">${t('新建文件夹')}</button>`:''}<button type="button" class="secondary" id="rename-doc">${t('重命名')}</button><button type="button" class="secondary" id="move-file">${t('移动')}</button><button type="button" class="secondary" id="copy-file">${t('复制')}</button><button type="button" class="secondary" id="cut-file">${t('剪切')}</button><button type="button" class="secondary" id="duplicate-doc">${t('保存副本')}</button>${doc?`<button type="button" class="secondary" id="menu-export">${t('导出文件')}</button>`:''}<button type="button" class="secondary" id="file-properties">${t('属性')}</button><button type="button" class="danger" id="delete-doc">${t('移入回收站')}</button></div>`,null,{noSubmit:true});
    if(directory){$('#folder-new-file').onclick=()=>{app.selectedFolder=path;$('#new-doc').click();};$('#folder-new-folder').onclick=()=>newFolder(path);}
    $('#rename-doc').onclick=()=>renameItem(path);
    $('#move-file').onclick=()=>{
      openModal(t('移动项目'),`<p>${esc(basename(path))}</p>${folderPickerHtml(app.workspace,{selected:parentPath(path),exclude:directory?path:'',escape:esc})}`,async f=>{
        const folder=f.get('folder'),destination=(folder?folder+'/':'')+basename(path);
        if(destination!==path)await manageFile('move',path,destination);
      });
      bindFolderPicker($('#dialog-body'));
    };
    for(const [id,cut] of [['copy-file',false],['cut-file',true]])$('#'+id).onclick=()=>{
      app.fileClipboard={workspaceId:app.workspace.storage?.id||'',path,cut};
      closeModal();
      renderDocuments();
      toast(cut?t('已剪切，请选择目标文件夹后粘贴'):t('已复制，请选择目标文件夹后粘贴'));
    };
    $('#duplicate-doc').onclick=async()=>{try{await manageFile('copy',path,copyDestination(app.workspace,path));closeModal();}catch(error){$('#dialog-error').textContent=t(error.message);}};
    if(doc)$('#menu-export').onclick=()=>exportText(doc.name,doc.text).catch(fail);
    $('#file-properties').onclick=()=>showProperties(path,directory).catch(fail);
    $('#delete-doc').onclick=()=>openModal(t('移入回收站'),`<p>${say(`将“${esc(path)}”${directory?t('及其中全部文件'):''}移入回收站？可在当前工作区的回收站中恢复。`,`Move “${esc(path)}”${directory?t('及其中全部文件'):''} to trash? You can restore it from this workspace’s trash.`)}</p><small>${t('不会删除 GitHub 中的文件。')}</small>`,async()=>manageFile('delete',path),{label:t('移入回收站')});
  }
  function renameItem(path){
    openModal(t('重命名'),`<label>${t('名称')}<input name="name" required maxlength="160" value="${esc(basename(path))}"></label>`,async f=>{
      const name=repoPath(f.get('name'));
      if(name.includes('/'))throw new Error(t('名称不能包含斜杠。'));
      const destination=(parentPath(path)?parentPath(path)+'/':'')+name;
      if(destination!==path)await manageFile('move',path,destination);
    });
  }
  async function showProperties(path,directory){
    if(!save())throw new Error(t('请先保存当前文稿。'));const state=native?await transport('refreshFolder'):app.workspace;
    const entries=(state.entries||[]).filter(entry=>within(path,entry.path)),doc=app.workspace.documents.find(doc=>documentPath(doc)===path);
    const size=entries.reduce((sum,item)=>sum+(item.directory?0:item.size||0),0)||(!directory&&doc?textBytes(doc.text):0);
    openModal(t('属性'),`<p>${say(`名称：${esc(basename(path))}`,`Name: ${esc(basename(path))}`)}</p>
      <p>${say(`路径：${esc(path)}`,`Path: ${esc(path)}`)}</p>
      <p>${say(`工作区：${esc(app.workspace.storage?.label||t('内部文件夹'))}`,`Workspace: ${esc(app.workspace.storage?.label||t('内部文件夹'))}`)}</p>
      <p>${say(`类型：${directory?t('文件夹'):doc?documentKind(doc):t('文件')}`,`Type: ${directory?t('文件夹'):doc?documentKind(doc):t('文件')}`)}</p>
      <p>${say(`大小：${size.toLocaleString()} 字节`,`Size: ${size.toLocaleString()} bytes`)}</p>
      ${directory
      ?`<p>${say(`文件：${entries.filter(item=>!item.directory).length}　文件夹：${entries.filter(item=>item.directory&&item.path!==path).length}`,`Files: ${entries.filter(item=>!item.directory).length} · Folders: ${entries.filter(item=>item.directory&&item.path!==path).length}`)}</p>`
      :doc?`<p>${say(`修改时间：${esc(new Date(doc.updatedAt).toLocaleString('zh-CN'))}`,`Modified: ${esc(new Date(doc.updatedAt).toLocaleString('zh-CN'))}`)}</p>`:''}`,null,{noSubmit:true});
  }
  return {newFolder,documentMenu,fileMenu,renameItem,showProperties};
}
