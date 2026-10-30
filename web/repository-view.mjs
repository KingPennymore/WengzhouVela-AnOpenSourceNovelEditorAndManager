import {sameRepository} from './sync-repository.mjs';
import {switchRepositoryBranch,inspectBranchAttachments} from './repository-navigation.mjs';
import {syncTargetMarkup} from './sync-target.mjs';
import {syncBlobCache} from './sync-blob-cache.mjs';
import {createGitClient,providerOptions,serverField,showTokenLogin} from './git-login.mjs';
import {gitIdentity,gitHostKey,sameGitHost} from './git-host.mjs';
import {movedBeyond,SWIPE_SLOP} from './tap-guard.mjs';
import {icon,fileIcon} from './icons.mjs';
import {normalizeText,fileKind,repoPath,MAX_TEXT_BYTES} from './model.mjs';
import {syncTextEqual,preserveVelaPositions,mergeVelaTexts} from './vela-sync.mjs';
import {t,say} from './i18n.mjs';
import {documentPath} from './workspace.mjs';
import {applyRemoteFile,repositoryFolder,resolveRepositoryConflict} from './git-workspace.mjs';
import {previewCommit} from './sync-commit.mjs';
import {conflictMarkup,bindConflict} from './sync-conflicts.mjs';
import {diffMarkup} from './sync-preview.mjs';
import {escapeHtml as esc,textBytes,formatBytes} from './text-utils.mjs';

export function createRepositoryView(context){
  const {$,native,transport,toast,fail,openModal,closeModal,save,showView,current,showHome,
    syncBusy,syncActivity,syncWorkflow,editorStates,makeState,updateStats,renderPreview,renderDocuments,
    renderSyncStatus,previewDownload,materializeDownload,restorePulledEditor,currentScope,loadSubscriptionDocument}=context;
  let account=null,repositories=[],selectedRepo=null,selectedBranch='',selectedPath='',loadEpoch=0;
  let remoteSelection=new Map(),remoteSelectionRepo='',remoteSelecting=false;
  const gitName=()=>context.gh.provider==='gitea'?'Gitea':context.gh.provider==='gitee'?'Gitee':'GitHub';
  const setGitServer=()=>{if(context.gh.provider==='gitea'){context.gh=createGitClient(transport,'gitea',$('#gitea-instance')?.value||context.gh.server);context.workspace.settings.giteaServer=context.gh.server;save();}};
  $('#github-view').addEventListener('click',e=>{if(e.target.closest('[data-return-write]'))showView('write');});
  let githubOffline=false;
  // The page navigation already offers the editor and the theme; this bar only names the service.
  const githubTopbar=()=>`<div class="github-topbar"><button class="ui-button ui-button--text" data-return-write="true">${t('← 返回编辑器')}</button><span class="github-topbar-title">${say(`${gitName()} 仓库管理`,`${gitName()} repositories`)}</span></div>`;
  function renderGitHub(){
    const root=$('#github-view');
    if(!account){
      root.innerHTML=`${githubTopbar()}<div class="empty-state"><div class="large-icon">${icon('github')}</div>
        <h2>${say(`连接 ${gitName()}`,`Connect ${gitName()}`)}</h2>
        <div class="git-login-fields"><label>${t('代码托管平台')}<select id="git-provider" aria-label="${t('代码托管平台')}">${providerOptions(context.gh.provider)}</select></label>
        ${serverField(context.gh.provider,context.workspace.settings.giteaServer,esc,'instance')}</div>
        <p>${t('浏览与创建仓库、管理分支、读取文件并提交修改。')}</p>
        <div class="button-row"><button class="primary" id="token-login">${t('使用访问令牌')}</button><button class="secondary" id="check-connection">${t('检测连接')}</button></div>
        <p class="description">${native?(context.environment?.platform==='android'?t('令牌使用 Android Keystore 加密保存在应用内部。'):context.environment?.platform==='windows'?t('令牌使用 Windows 安全存储加密保存在应用内部。'):t('令牌保存在鸿蒙安全资产存储中。')):t('浏览器预览的令牌仅保留在内存中，刷新后需重新登录。')}</p>
        </div>`;
      $('#git-provider').onchange=e=>{context.gh=createGitClient(transport,e.target.value,context.workspace.settings.giteaServer);renderGitHub();};
      $('#token-login').onclick=()=>{try{setGitServer();loginToken();}catch(error){fail(error);}};
      $('#check-connection').onclick=()=>{try{setGitServer();checkGitHubConnection();}catch(error){fail(error);}};
      return;
    }
    if(selectedRepo){renderRepository();return;}
    root.innerHTML=`${githubTopbar()}<header class="page-header"><div><span class="page-kicker">${gitName().toUpperCase()} / ${esc(account.login)}${context.gh.server?' / '+esc(context.gh.server):''}</span><h1>${t('仓库')} <span class="count-badge">${repositories.length}</span></h1>
      </div>
      <div class="account-actions"><button class="ui-button ui-button--secondary" id="refresh-repos">${t('刷新')}</button><button class="ui-button ui-button--primary" id="create-repo">${t('＋ 新建仓库')}</button><button class="ui-button ui-button--secondary" id="commit-workspace">${t('提交整个工作区')}</button><button class="ui-button ui-button--text" id="logout">${t('退出登录')}</button></div>
      </header><label class="search-box" style="max-width:400px;margin-bottom:24px">${icon('search')}<input id="repo-search" aria-label="${t('搜索仓库')}" placeholder="${t('搜索仓库名称…')}"></label>
      <div id="repo-grid" class="repo-grid"></div>`;
    if(githubOffline){
      const notice=document.createElement('p');
      notice.className='notice';
      notice.textContent=t('当前显示缓存的仓库列表；网络恢复后请刷新，写入操作暂不可用。');
      root.querySelector('.page-header').after(notice);
      $('#create-repo').disabled=true;
      $('#commit-workspace').disabled=true;
    }
    const list=()=>{
      $('#repo-grid').innerHTML=repositories.filter(r=>r.full_name.toLowerCase().includes($('#repo-search').value.toLowerCase())).map(r=>`<button class="repo-card" data-repo="${esc(r.full_name)}"><strong>⑂ ${esc(r.full_name)}</strong><p>${esc(r.description||t('还没有仓库简介。'))}</p><small>${r.private?t('私有'):t('公开')} · ${esc(r.default_branch)}${r.archived?t(' · 已归档'):''}</small></button>`).join('')||`<p class="blank">${t('暂无仓库，或没有匹配结果。')}</p>`;
    };list();$('#repo-search').oninput=list;
    $('#repo-grid').onclick=e=>{
      const b=e.target.closest('[data-repo]');
      if(b){selectedRepo=repositories.find(r=>r.full_name===b.dataset.repo);selectedBranch=selectedRepo.default_branch;selectedPath='';renderRepository();}
    };
    $('#refresh-repos').onclick=()=>loadRepositories();$('#create-repo').onclick=createRepository;$('#logout').onclick=logout;$('#commit-workspace').onclick=()=>commitWholeWorkspace().catch(fail);
  }
  async function loadRepositories(){
    const epoch=++loadEpoch;
    $('#github-view').innerHTML=githubTopbar()+`<p class="loading">${say(`正在读取 ${gitName()} 仓库…`,`Loading ${gitName()} repositories…`)}</p>`;
    try{
      const list=await context.gh.repositories();
      if(epoch!==loadEpoch)return;
      repositories=list;
      githubOffline=false;
      context.workspace.githubCache={...gitIdentity(context.gh),login:account.login,checkedAt:Date.now(),repositories:list.slice(0,500).map(({full_name,name,description,default_branch,private:isPrivate,archived,permissions})=>({full_name,name,description,default_branch,private:isPrivate,archived,permissions}))};
      save();
      renderGitHub();
    }catch(e){
      if(epoch!==loadEpoch)return;
      githubOffline=true;
      if(context.workspace.githubCache?.login===account?.login&&sameGitHost(context.workspace.githubCache,context.gh))repositories=context.workspace.githubCache.repositories;
      renderGitHub();
      fail(e);
    }
  }
  async function signedIn(user){
    context.workspace.settings.gitProvider=context.gh.provider;
    if(context.gh.provider==='gitea')context.workspace.settings.giteaServer=context.gh.server;
    save();
    githubOffline=false;
    account=user;
    $('#sidebar-logout').disabled=false;
    $('#account-label').textContent=gitName()+' · '+user.login;
    selectedRepo=null;
    showView('github');
    await loadRepositories();
  }
  async function checkGitHubConnection(){
    openModal(say(`检测 ${gitName()} 连接`,`Check ${gitName()} connection`),`<p>${t('正在检测连接…')}</p>`,null,{noSubmit:true});
    try{
      const result=await transport('connection',gitIdentity(context.gh));
      if(result.status!==200)throw new Error(say(`${gitName()} 返回 HTTP ${result.status}，请检查网络后重试。`,`${gitName()} returned HTTP ${result.status}. Check your connection and try again.`));
      $('#dialog-body').textContent=say(`${gitName()} 连接正常，可以继续登录。`,`${gitName()} is reachable. You can sign in.`);
    }
    catch(e){$('#dialog-body').textContent=say(`连接检测未通过，请检查网络与 ${gitName()} 地址后重试。`,`The connection test failed. Check your network and ${gitName()} address, then try again.`);$('#dialog-error').textContent=t(e.message);}
  }
  function loginToken(){showTokenLogin({client:context.gh,server:context.workspace.settings.giteaServer,transport,openModal,escape:esc,signedIn:async(user,client)=>{context.gh=client;await signedIn(user);}});}
  async function logout(){
    try{
      if(syncBusy())throw Error(t('正在同步，请稍后退出。'));
      await transport('logout',gitIdentity(context.gh));
      await syncBlobCache.clear();
      loadEpoch++;
      account=null;
      githubOffline=false;
      delete context.workspace.githubCache;
      save();
      $('#sidebar-logout').disabled=true;
      repositories=[];
      selectedRepo=null;
      $('#account-label').textContent=t('连接 GitHub / Gitee / Gitea');
      renderGitHub();
      toast(t('已退出，设备上的文稿保留。'));
    }catch(e){
      fail(e);
    }
  }
  function createRepository(){
    openModal(say(`新建 ${gitName()} 仓库`,`New ${gitName()} repository`),`<label>${t('仓库名称')}<input name="name" pattern="[A-Za-z0-9_.-]+" required placeholder="my-writing"></label><label>${t('简介')}<textarea name="description" rows="2" maxlength="350"></textarea></label><label class="checkbox"><input name="private" type="checkbox" checked>${t('设为私有仓库')}</label><small>${t('将在当前账号下新建仓库并初始化 README。')}</small>`,async f=>{
      await context.gh.createRepository(f.get('name').trim(),f.get('description'),f.has('private'));
      await loadRepositories();
    },{label:t('创建仓库')});
  }
  async function renderRepository(){
    const repo=selectedRepo,epoch=++loadEpoch,root=$('#github-view');if(!repo)return;
    root.innerHTML=`${githubTopbar()}<header class="page-header"><div><button class="ui-button ui-button--text" id="back-repos">${t('← 返回仓库列表')}</button><h1>${esc(repo.name)}</h1>
      <p>${esc(repo.full_name)} · ${repo.private?t('私有仓库'):t('公开仓库')}</p>
      </div>
      <div class="button-row"><button class="ui-button ui-button--primary" id="repo-commit">${t('提交当前文件')}</button><button class="ui-button ui-button--secondary" id="repo-pull">${t('拉取整个仓库')}</button><button class="ui-button ui-button--secondary" id="repo-commit-workspace">${t('提交整个工作区')}</button><button class="ui-button ui-button--secondary" id="repo-settings">${t('仓库设置')}</button></div>
      </header><div class="repo-toolbar"><label>${t('分支')} <select id="branch-select" aria-label="${t('选择分支')}"><option>${esc(selectedBranch)}</option></select></label>
      <button class="ui-button ui-button--secondary ui-button--compact" id="create-branch">${t('＋ 新建分支')}</button><button class="ui-button ui-button--secondary ui-button--compact" id="refresh-files">${t('刷新')}</button><button class="ui-button ui-button--secondary ui-button--compact" id="repo-history">${t('提交记录')}</button></div>
      ${syncTargetMarkup({...gitIdentity(context.gh),repo:repo.full_name,branch:selectedBranch},repositoryFolder(context.workspace,repo.full_name,context.gh.provider,context.gh.server,selectedBranch),esc)}<div class="remote-selection-tools"><button id="remote-multi" class="ui-button ui-button--secondary ui-button--compact">${t('多选')}</button><button id="remote-select-all" class="ui-button ui-button--secondary ui-button--compact" hidden>${t('全选本页')}</button><button id="remote-pull-selected" class="ui-button ui-button--primary ui-button--compact" hidden>${t('拉取选中项')}</button><span id="remote-selected-count"></span><button id="remote-cancel-selection" class="ui-button ui-button--text ui-button--compact" hidden>${t('取消多选')}</button></div>
      <p class="path-label">${esc(selectedPath||'/')}</p>
      <div class="file-list" id="file-list"><p class="loading">${t('正在读取文件…')}</p>
      </div>`;
    $('#back-repos').onclick=()=>{loadEpoch++;selectedRepo=null;renderGitHub();};$('#refresh-files').onclick=renderRepository;
    $('#repo-history').onclick=()=>showGitHistory(repo.full_name,selectedBranch);$('#repo-commit-workspace').onclick=()=>commitWholeWorkspace(repo.full_name,selectedBranch).catch(fail);$('#repo-commit').onclick=()=>commitDocument(repo.full_name,selectedBranch);$('#repo-pull').onclick=()=>pullWholeRepository();
    $('#repo-settings').onclick=()=>openModal(t('仓库设置'),`<label>${t('仓库名称')}<input name="name" required pattern="[A-Za-z0-9_.-]+" value="${esc(repo.name)}"></label><label>${t('简介')}<textarea name="description" rows="3">${esc(repo.description||'')}</textarea></label><small>${say(`修改会直接更新 ${gitName()} 仓库的名称与简介。`,`This updates the repository name and description on ${gitName()}.`)}</small>`,async f=>{
      const old=repo.full_name;
      const updated=await context.gh.updateRepository(old,{name:f.get('name').trim(),description:f.get('description')});
      for(const d of context.workspace.documents)if(sameGitHost(d.remote,context.gh)&&d.remote?.repo===old)d.remote.repo=updated.full_name;
      for(const item of context.workspace.repositories||[])if(sameGitHost(item,context.gh)&&item.repo===old)item.repo=updated.full_name;
      save();
      repositories=repositories.map(r=>r.full_name===old?updated:r);
      selectedRepo=updated;
      renderRepository();
    },{label:say(`保存到 ${gitName()}`,`Save to ${gitName()}`)});
    if(githubOffline||repo.permissions?.push===false||repo.archived){
      for(const selector of ['#repo-commit','#repo-commit-workspace','#create-branch']){const button=root.querySelector(selector);button.disabled=true;button.title=repo.archived?t('仓库已归档'):t('当前账号只有读取权限');}
    }if(githubOffline||repo.permissions?.admin===false||repo.archived){
      $('#repo-settings').disabled=true;
      $('#repo-settings').title=t('此操作需要仓库管理权限');
    }
    $('#create-branch').onclick=()=>openModal(t('新建分支'),`<p>${say(`从 ${esc(selectedBranch)} 创建分支。`,`Create a branch from ${esc(selectedBranch)}.`)}</p><label>${t('分支名称')}<input name="name" placeholder="draft/chapter-one" required></label>`,async f=>{
      if(syncBusy())throw Error(t('正在同步，请稍后创建分支。'));
      await context.gh.createBranch(repo.full_name,selectedBranch,f.get('name'));
      renderRepository();
      toast(t('分支已创建，可在分支列表中选择。'));
    },{label:t('创建分支')});
    $('#branch-select').onchange=async e=>{
      const next=e.target.value,select=e.target,client=context.gh,source=context.workspace,branch=selectedBranch;
      const target={...gitIdentity(client),repo:repo.full_name,branch};
      select.value=branch;select.disabled=true;
      try{
        if(syncBusy())throw Error(t('正在同步，请等待完成后再切换分支。'));
        if(!save())throw Error(t('本地保存失败，未切换分支。'));
        const attachmentChanges=await inspectBranchAttachments(source,target,native?path=>transport('readWorkspaceFile',{path}):null);
        if(source!==context.workspace||client!==context.gh||selectedRepo!==repo||selectedBranch!==branch)return;
        switchRepositoryBranch({workspace:context.workspace,target,next,attachmentChanges,busy:syncBusy,save,openModal,escape:esc,
          apply:nextBranch=>{selectedBranch=nextBranch;selectedPath='';remoteSelection.clear();remoteSelecting=false;renderRepository();}});
      }catch(error){fail(error);}finally{if(select.isConnected)select.disabled=false;}
    };
    try{
      const [branches,contents]=await Promise.all([context.gh.branches(repo.full_name),context.gh.contents(repo.full_name,selectedBranch,selectedPath)]);
      if(epoch!==loadEpoch)return;
      $('#branch-select').innerHTML=branches.map(b=>`<option value="${esc(b.name)}" ${b.name===selectedBranch?'selected':''}>${esc(b.name)}</option>`).join('');
      if(!Array.isArray(contents))throw new Error(t('当前路径不是文件夹。'));
      if(remoteSelectionRepo!==gitHostKey(context.gh)+'/'+repo.full_name+'/'+selectedBranch){remoteSelection.clear();remoteSelecting=false;remoteSelectionRepo=gitHostKey(context.gh)+'/'+repo.full_name+'/'+selectedBranch;}
      contents.sort((a,b)=>(a.type===b.type?a.name.localeCompare(b.name):a.type==='dir'?-1:1));
      $('#file-list').innerHTML=(selectedPath?`<div class="file-row"><button data-parent="true"><span class="doc-symbol">${icon('back')}</span>${t('上级目录')}</button></div>`:'')+contents.map((f,i)=>`<div class="file-row" data-remote-row="${i}"><input type="checkbox" data-remote-select="${i}" aria-label="${esc(t('选择')+' '+f.name)}" hidden><button data-file="${i}"><span class="doc-symbol">${f.type==='dir'?icon('files'):fileIcon(fileKind(f.name))}</span><span data-user-content>${esc(f.name)}</span></button><small>${f.type==='dir'?t('文件夹'):formatBytes(f.size)}</small>${f.type==='dir'?`<button data-browse="${i}" aria-label="${esc(t('打开')+' '+f.name)}">${icon('arrowRight')}</button>`:''}${f.type==='file'?`<button data-delete="${i}" title="${t('删除远端文件')}" aria-label="${esc(t('删除')+' '+f.name)}">${icon('trash')}</button>`:''}</div>`).join('');
      setupRemoteSelection(contents);if(githubOffline||repo.permissions?.push===false||repo.archived)root.querySelectorAll('[data-delete]').forEach(button=>button.disabled=true);
      $('#file-list').onclick=async e=>{try{
        if(e.target.closest('[data-remote-select]'))return;
        const browse=e.target.closest('[data-browse]');if(browse){selectedPath=contents[Number(browse.dataset.browse)].path;renderRepository();return;}
        if(e.target.closest('[data-file]')&&(remoteSelecting||e.ctrlKey||e.metaKey)){
            if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(e.target.closest('[data-file]').dataset.file)]);
            window.__remoteHoldClick=false;
            return;
          }
        if(e.target.closest('[data-parent]')){selectedPath=selectedPath.split('/').slice(0,-1).join('/');renderRepository();return;}
        const open=e.target.closest('[data-file]'),del=e.target.closest('[data-delete]');
        if(open){const f=contents[Number(open.dataset.file)];if(f.type==='dir'){selectedPath=f.path;renderRepository();}else await openRemote(repo.full_name,selectedBranch,f.path);}
        if(del){
            const f=contents[Number(del.dataset.delete)],branch=selectedBranch;
            // i18n-data: file names, matching text and editable defaults stay as written
            openModal(t('删除远端文件'),`<p>${say(`将从 ${esc(repo.full_name)} 的 ${esc(branch)} 分支删除 ${esc(f.path)}。本地文稿不会删除。`,`Delete ${esc(f.path)} from ${esc(repo.full_name)} on branch ${esc(branch)}. Local documents are kept.`)}</p><label>${t('提交说明')}<input name="message" required value="${esc(/* User-editable commit message. */ '删除 '+f.name)}"></label>`,async data=>{
              await context.gh.deleteFile({repo:repo.full_name,branch,path:f.path,sha:f.sha,message:data.get('message')});
              renderRepository();
            },{label:t('确认删除并提交'),destructive:true});
          }
      }catch(e){fail(e);}};
    }catch(e){if(epoch===loadEpoch)$('#file-list').innerHTML=`<p class="error" style="padding:16px">${esc(t(e.message))}</p>`;}
  }
  function toggleRemoteFile(file){remoteSelecting=true;if(remoteSelection.has(file.path))remoteSelection.delete(file.path);else remoteSelection.set(file.path,file);renderRemoteSelection();}
  function renderRemoteSelection(){
    if($('#file-list'))$('#file-list').dataset.selecting=String(remoteSelecting);
    if($('#remote-multi'))$('#remote-multi').hidden=remoteSelecting;
    if($('#remote-selected-count'))$('#remote-selected-count').hidden=!remoteSelecting;
    document.querySelectorAll('[data-remote-select]').forEach(input=>{
      input.hidden=!remoteSelecting;
      input.checked=remoteSelection.has(input.dataset.remotePath);
      input.closest('.file-row').classList.toggle('selected',input.checked);
    });
    for(const id of ['remote-select-all','remote-pull-selected','remote-cancel-selection'])if($('#'+id))$('#'+id).hidden=!remoteSelecting;
    if($('#remote-pull-selected'))$('#remote-pull-selected').disabled=!remoteSelection.size;
    if($('#remote-selected-count'))$('#remote-selected-count').textContent=remoteSelecting?t('已选 ')+remoteSelection.size:'';
  }
  function setupRemoteSelection(contents){
    const list=$('#file-list');let timer,start;window.__remoteHoldClick=false;
    list.querySelectorAll('[data-remote-select]').forEach(input=>{
      input.dataset.remotePath=contents[Number(input.dataset.remoteSelect)].path;
      input.onchange=()=>toggleRemoteFile(contents[Number(input.dataset.remoteSelect)]);
    });
    const cancel=()=>{
      clearTimeout(timer);
      start=null;
    };list.onpointerdown=e=>{
      const row=e.target.closest('[data-remote-row]');
      if(!row||e.target.closest('input,[data-delete],[data-browse]'))return;
      start={x:e.clientX,y:e.clientY};
      timer=setTimeout(()=>{toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;},400);
    };list.onpointermove=e=>{
      if(start&&movedBeyond(start,e,SWIPE_SLOP))cancel();
    };list.onpointerup=cancel;list.onpointercancel=cancel;list.oncontextmenu=e=>{
      const row=e.target.closest('[data-remote-row]');
      if(row){e.preventDefault();cancel();if(!window.__remoteHoldClick)toggleRemoteFile(contents[Number(row.dataset.remoteRow)]);window.__remoteHoldClick=true;}
    };
    $('#remote-multi').onclick=()=>{
      remoteSelecting=true;
      renderRemoteSelection();
    };$('#remote-select-all').onclick=()=>{
      remoteSelecting=true;
      for(const file of contents)remoteSelection.set(file.path,file);
      renderRemoteSelection();
    };$('#remote-cancel-selection').onclick=()=>{
      remoteSelection.clear();
      remoteSelecting=false;
      renderRemoteSelection();
    };$('#remote-pull-selected').onclick=()=>pullWholeRepository([...remoteSelection.keys()]);renderRemoteSelection();
  }
  async function openRemote(repo,branch,path){
    const client=context.gh,host=gitIdentity(client),before=context.workspace.documents.find(d=>sameRepository(d.remote,{...host,repo,branch})&&d.remote.path===path);
    const file=await syncActivity.run(before?.id||gitHostKey(client)+'/'+repo+'/'+path,()=>client.readFile(repo,branch,path));if(!save())throw Error(t('请先保存当前文稿。'));
    const remoteText=/\.(csv|tsv)$/i.test(path)?file.text:normalizeText(file.text),merged=before?mergeVelaTexts(path,before.remote?.lastSyncedText,before.text,remoteText):null;
    if(before&&merged===null&&!syncTextEqual(path,before.text,remoteText)&&!syncTextEqual(path,before.remote?.lastSyncedText,before.text)){
      const local=before.text;let resolved;
      openModal(t('本地与远端内容冲突'),`<p>${t('不重叠的修改会自动合并；重叠的段落由你选择或编辑。保存前保留本地历史。')}</p>${conflictMarkup(local,remoteText,esc)}`,async()=>{
        await syncActivity.run(before.id,async()=>{
          if(!syncTextEqual(path,before.text,local))throw Error(t('预览后本地文稿已变化，请重新拉取。'));
          const text=preserveVelaPositions(path,resolved(),before.text);if(textBytes(text)>MAX_TEXT_BYTES)throw Error(t('合并后的文件超过 8 MB。'));
          context.documents.checkpoint(before);context.documents.change(before,text);before.remote={...host,repo,branch,path,sha:file.sha,lastSyncedText:remoteText,syncedAt:Date.now()};
          editorStates.delete(before.id);if(context.view&&context.workspace.activeId===before.id){context.view.setState(makeState(before));context.invalidateIndex();updateStats();if(context.isPreview)renderPreview();}
          resolveRepositoryConflict(context.workspace,{...host,repo,branch,path,sha:file.sha,text:remoteText});
          renderDocuments();if(!save())throw Error(t('合并结果保存失败，请导出备份。'));
        });
      },{label:t('保存合并结果')});resolved=bindConflict($('#dialog-body'),{base:before.remote?.lastSyncedText,local,remote:remoteText,escape:esc});return false;
    }
    const doc=applyRemoteFile(context.workspace,{...host,repo,branch,path,text:merged??preserveVelaPositions(path,remoteText,before?.text),remoteText,sha:file.sha},context.workspace.repositories?.find(item=>sameRepository(item,{...host,repo,branch}))?.folder||'');
    resolveRepositoryConflict(context.workspace,{...host,repo,branch,path,sha:file.sha,text:remoteText});
    editorStates.delete(doc.id);if(context.view&&context.workspace.activeId===doc.id){
      context.view.setState(makeState(doc));
      context.invalidateIndex();
      updateStats();
      if(context.isPreview)renderPreview();
    }renderDocuments();if(!save())throw Error(t('拉取后本地保存失败，请导出备份。'));renderSyncStatus();toast(before?t('已更新远端文件'):t('已拉取远端文件'));return true;
  }
  function pullWholeRepository(selection=null){
    const repo=selectedRepo,branch=selectedBranch,client=context.gh;if(!repo)return;
    if(!native||!context.workspace.storage?.id){toast(t('请在应用中拉取仓库文件。'));return;}
    const folder=repositoryFolder(context.workspace,repo.full_name,context.gh.provider,context.gh.server,branch),abort=new AbortController();
    openModal(selection?t('拉取选中项'):t('拉取整个仓库'),`${selection?`<p>${say(`${selection.length} 个选中项（文件夹包含全部子项）`,`${selection.length} selected items (including all folder contents)`)}</p>`:''}<p>${esc(repo.full_name)} / ${esc(branch)}</p>
      <p>${say(`保存到当前工作区的“${esc(folder)}”文件夹。随后预览新增、修改和远端删除项；本地独有文件保留。`,`Save to “${esc(folder)}” in the current workspace, then preview additions, changes and remote deletions. Local-only files are kept.`)}</p>
      <p id="pull-progress"></p>
      <button type="button" class="secondary" id="cancel-pull" hidden>${t('取消拉取')}</button>`,async()=>{
      if(!save())throw new Error(t('请先保存当前文稿。'));
      $('#cancel-pull').hidden=false;
      const result=await syncWorkflow.run(()=>client.pullRepository(repo.full_name,branch,{selection,signal:abort.signal,onProgress:p=>{
        $('#pull-progress').textContent=say(`处理 ${p.done} / ${p.total} · 复用 ${p.reused||0} · 下载 ${p.downloaded||0} ${p.path}`,`Processing ${p.done} / ${p.total} · Reused ${p.reused||0} · Downloaded ${p.downloaded||0} ${p.path}`);
      }}));
      await previewDownload(result,folder,async selected=>{
        await materializeDownload(selected,folder);
        restorePulledEditor('github');
        if(!save())throw new Error(t('文件已拉取，但关联信息保存失败，请刷新工作区。'));
        remoteSelection.clear();
        remoteSelecting=false;
        renderRepository();
        toast(say(`已拉取 ${selected.files.length} 个文件到 ${folder}${selected.deletions?.length?'，'+selected.deletions.length+' 个旧文件已移入回收站':''}`,`Pulled ${selected.files.length} files into ${folder}${selected.deletions?.length?'; '+selected.deletions.length+' old files moved to trash':''}`));
      },client);
      return false;
    },{label:t('拉取到工作区'),cancel:()=>abort.abort()});
    $('#cancel-pull').onclick=()=>abort.abort();
  }
  async function showGitHistory(repo,branch,page=1){
    try{const commits=await context.gh.commits(repo,branch,page);if(!Array.isArray(commits))throw Error(t('提交记录格式无效'));
      openModal(t('提交记录'),`<p data-user-content>${esc(repo)} / ${esc(branch)}</p>
        ${commits.map(item=>`<article class="git-history-item"><strong data-user-content>${esc(item.commit?.message?.split('\n')[0]||'')}</strong><small data-user-content>${esc(item.sha?.slice(0,8))} · ${esc(item.commit?.author?.name)} · ${esc(item.commit?.author?.date)}</small></article>`).join('')||`<p>${t('暂无提交记录')}</p>`}<div class="button-row"><button type="button" id="history-prev" ${page>1?'':'disabled'}>←</button><span>${page}</span><button type="button" id="history-next" ${commits.length===30?'':'disabled'}>→</button></div>`,null,{noSubmit:true});
      $('#history-prev').onclick=()=>showGitHistory(repo,branch,page-1);$('#history-next').onclick=()=>showGitHistory(repo,branch,page+1);
    }catch(error){fail(error);}
  }
  function gitDocument(){if(!current()){showView('github');return;}if(!account){showView('github');toast(t('连接代码托管平台后，即可关联仓库并提交文稿。'));return;}commitDocument();}
  function commitDocument(suggestRepo,suggestBranch){
    if(!account){showView('github');return;}
    if(!repositories.length){showView('github');toast(t('请先新建或获得一个可写仓库。'));return;}
    const doc=current();if(!doc){showView('write');showHome();toast(t('请先打开需要提交的文件。'));return;}const remote=sameGitHost(doc.remote,context.gh)?doc.remote:null;
    const initialRepo=suggestRepo||remote?.repo||repositories[0].full_name;
    const initialBranch=suggestBranch||remote?.branch||repositories.find(r=>r.full_name===initialRepo)?.default_branch||'main';
    // i18n-data: file names, matching text and editable defaults stay as written
    openModal(say(`提交文稿到 ${gitName()}`,`Commit document to ${gitName()}`),`<p>${say(`将提交“${esc(doc.name)}”的当前内容。`,`Commit the current content of “${esc(doc.name)}”.`)}</p>
      <label>${t('仓库')}<select name="repo" id="commit-repo">${repositories.map(r=>`<option value="${esc(r.full_name)}" ${r.full_name===initialRepo?'selected':''}>${esc(r.full_name)}${r.private?t('（私有）'):''}</option>`).join('')}</select></label>
      <label>${t('分支')}<input name="branch" id="commit-branch" required value="${esc(initialBranch)}"></label>
      <label>${t('文件路径')}<input name="path" required value="${esc(remote?.path||doc.name)}"></label>
      <label>${t('提交说明')}<input name="message" required value="${esc('更新 '+doc.name)}"></label>
      <small>${say(`${remote?.deleted?t('远端已删除此文件，本次提交将重新创建。'):''}只提交此文稿。已关联文件使用上次读取的版本；同名远端文件不会被自动覆盖。发生冲突时，可以拉取后逐段合并。`,`${remote?.deleted?t('远端已删除此文件，本次提交将重新创建。'):''}Commit this document only, using its last-read revision. Existing remote files are not automatically overwritten. Pull and merge sections if a conflict occurs.`)}</small>${remote?`<p><button type="button" class="secondary" id="read-remote">${t('拉取并处理修改')}</button></p>`:''}`,async f=>{
      if(!save())throw new Error(t('本地保存失败，请先导出备份。'));
      const repo=f.get('repo'),branch=f.get('branch').trim(),path=repoPath(f.get('path'));
      const sha=remote&&!remote.deleted&&remote.repo===repo&&remote.branch===branch&&remote.path===path?remote.sha:undefined;
      const text=doc.text,message=f.get('message'),before=sha?(remote.lastSyncedText??await context.gh.blobText(repo,sha)):'';
      openModal(t('确认提交变更'),`${syncTargetMarkup({...gitIdentity(context.gh),repo,branch,path},undefined,esc)}${diffMarkup(before,text,esc)}<p data-user-content>${esc(message)}</p>`,async()=>{
        if(!syncTextEqual(path,doc.text,text))throw Error(t('预览后文件已变化，请重新生成提交预览。'));
        const submittedText=doc.text;
        const result=await syncActivity.run(doc.id,()=>context.gh.commit({repo,branch,path,sha,text:submittedText,message}));
        doc.remote={...gitIdentity(context.gh),repo,branch,path,sha:result.content.sha,lastSyncedText:submittedText,syncedAt:Date.now()};
        save();
        renderDocuments();
        toast(say(`文稿已提交到 ${repo}`,`Document committed to ${repo}`)+' / '+branch+' · '+result.commit?.sha?.slice(0,8));
      },{label:say(`提交到 ${gitName()}`,`Commit to ${gitName()}`)});
      return false;
    },{label:say(`提交到 ${gitName()}`,`Commit to ${gitName()}`)});
    $('#commit-repo').onchange=e=>{$('#commit-branch').value=repositories.find(r=>r.full_name===e.target.value)?.default_branch||'main';};
    if(remote)$('#read-remote').onclick=async()=>{try{if(await openRemote(remote.repo,remote.branch,remote.path))closeModal();}catch(e){$('#dialog-error').textContent=t(e.message);}};
  }

  async function commitWholeWorkspace(repo=selectedRepo?.full_name||'',branch=selectedBranch||''){
    if(!account){showView('github');return;}if(!repositories.length){showView('github');toast(t('请先新建或获得一个可写仓库。'));return;}if(!save())return;
    const folder=currentScope();for(const doc of context.workspace.documents.filter(doc=>doc.subscription&&(!folder||documentPath(doc).startsWith(folder+'/'))))await loadSubscriptionDocument(doc);
    const docs=context.workspace.documents.filter(doc=>!folder||documentPath(doc).startsWith(folder+'/'));
    const others=(context.workspace.entries||[]).filter(entry=>!entry.directory&&!docs.some(doc=>documentPath(doc)===entry.path)&&(!folder||entry.path.startsWith(folder+'/')));
    if(!docs.length&&!others.length){toast(t('当前工作区没有文件。'));return;}
    openModal(t('提交整个工作区'),`<p>${t('工作区')}${say('：',': ')}<span data-user-content>${esc(folder||'/')}</span> · ${docs.length+others.length} ${t('文件')}</p>
      <label>${t('仓库')}<select name="repo" required>${repositories.map(item=>`<option value="${esc(item.full_name)}" ${item.full_name===repo?'selected':''}>${esc(item.full_name)}</option>`).join('')}</select></label>
      <label>${t('分支')}<input name="branch" required value="${esc(branch||repositories.find(item=>item.full_name===repo)?.default_branch||repositories[0]?.default_branch||'main')}"></label>
      <label>${t('仓库目录')}<input name="prefix" placeholder="${t('留空提交到仓库根目录')}"></label>
      <label>${t('提交说明')}<input name="message" required value="Update workspace"></label>
      <p>${t('包含配置、文稿和附件；同路径文件覆盖，仓库其他文件保留。')}</p>`,async form=>{
      if(!save())throw new Error(t('请先保存文稿。'));
      const files=docs.map(doc=>({path:documentPath(doc).slice(folder?folder.length+1:0),text:doc.text}));
      for(const entry of others){if(!native)throw new Error(t('浏览器不能读取此附件，请在应用中提交。'));files.push({path:entry.path.slice(folder?folder.length+1:0),data:await transport('readWorkspaceFile',{path:entry.path})});}
      await showCommitPreview({repo:form.get('repo'),branch:form.get('branch').trim(),prefix:form.get('prefix').trim(),folder,files,message:form.get('message')});
      return false;
    },{label:t(say(`提交到 ${gitName()}`,`Commit to ${gitName()}`))});
  }

  function showCommitPreview(options){
    return previewCommit(options,{workspace:context.workspace,client:context.gh,activity:syncActivity,openModal,escape:esc,save,toast});
  }

  async function restoreAccount(){
    try{
      const user=await context.gh.user();
      account=user;
      $('#sidebar-logout').disabled=false;
      $('#account-label').textContent=gitName()+' · '+user.login;
      repositories=await context.gh.repositories();
    }catch{
      if(context.workspace.githubCache?.login&&sameGitHost(context.workspace.githubCache,context.gh)){
        account={login:context.workspace.githubCache.login};
        repositories=context.workspace.githubCache.repositories||[];
        githubOffline=true;
        $('#sidebar-logout').disabled=false;
        $('#account-label').textContent=account.login+' · '+t('离线');
      }
    }
  }

  return {get account(){return account;},get selectedRepo(){return selectedRepo;},renderGitHub,renderRepository,gitDocument,logout,restoreAccount};
}
