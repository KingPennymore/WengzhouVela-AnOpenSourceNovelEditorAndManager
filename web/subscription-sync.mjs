import {t} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {GitHub} from './github.mjs';
import {transport} from './platform.mjs';
import {newDocument,documentKind,normalizeText} from './model.mjs';
import {documentPath,uniquePath,preparePaths} from './workspace.mjs';
import {itemPaths,basename} from './file-manager.mjs';

export function createSubscriptionSync(context){
  const {$,syncWorkflow,save,openModal,editorStates,current,ensureSubscriptions,switchDocument,updateEditorVisibility,
    renderPreview,showHome,renderDocuments,showView,toast,makeState,updateStats}=context;
  function restorePulledEditor(page){
    const preview=context.isPreview;
    if(context.workspace.activeId&&!context.home){switchDocument(context.workspace.activeId);context.isPreview=preview;updateEditorVisibility();if(context.isPreview)renderPreview();}else{showHome();}
    renderDocuments();
    showView(page);
  }
  function previewDownload(result,folder,onApply,client=context.gh){
    return syncWorkflow.preview(result,folder,onApply,client);
  }
  function materializeDownload(result,folder){
    return syncWorkflow.materialize(result,folder);
  }
  async function pullSubscription(item){
    let abort;
    openModal(t('拉取文件'),`<p data-user-content>${esc(item.repo)}</p>
      ${item.snapshot.vela?`<label class="checkbox"><input name="readingOnly" type="checkbox" checked>${t('仅拉取阅读清单')}</label>`:''}<p>${t('保存到内部文件夹；对应 .vela 配置会同时保留，同路径文件覆盖。')}</p>
      <p id="subscription-pull-path" data-user-content></p>
      <progress id="subscription-pull-progress" max="1" value="0" hidden></progress><button type="button" id="subscription-pull-cancel" class="secondary" hidden>${t('取消拉取')}</button>`,async form=>{
      if(!save())throw new Error(t('请先保存当前文稿。'));
      abort=new AbortController();
      const folder='Subscriptions/'+item.repo;
      $('#subscription-pull-cancel').hidden=false;
      $('#subscription-pull-progress').hidden=false;
      try{
        const client=new GitHub((_operation,payload)=>transport('publicApi',payload)),only=item.snapshot.vela&&form.has('readingOnly'),snapshot=only?await context.subscriptions.api.snapshot(item.repo,abort.signal):item.snapshot;
        const result=await syncWorkflow.run(()=>client.pullRepository(item.repo,snapshot.branch,{signal:abort.signal,selection:only?[...snapshot.configs.map(config=>config.path),...snapshot.files.map(file=>file.path)]:null,includeDependencies:true,onProgress:p=>{
          const progress=$('#subscription-pull-progress');
          if(progress){
            progress.max=Math.max(1,p.total);
            progress.value=p.done;
            $('#subscription-pull-path').textContent=`${p.done} / ${p.total} · ${folder}/${p.path}`;
          }
        }}));
        abort.signal.throwIfAborted();
        await previewDownload(result,folder,async selected=>{
          await materializeDownload(selected,folder);
          for(const file of selected.files){
            const doc=context.workspace.documents.find(doc=>documentPath(doc)===folder+'/'+file.path);
            if(doc){
              doc.subscription={repo:item.repo,path:file.path,sha:file.sha,loadedSha:file.sha,contentHash:await textHash(doc.text)};
              editorStates.delete(doc.id);
            }
          }
          restorePulledEditor('subscriptions');
          save();
          toast(t('文件已拉取到内部文件夹。'));
        },client);
        return false;
      }finally{if($('#subscription-pull-cancel'))$('#subscription-pull-cancel').hidden=true;}
    },{label:t('拉取文件')});
    $('#subscription-pull-cancel').onclick=()=>abort?.abort();
  }
  async function cacheSubscription(item){
    const prefix='Subscriptions/'+item.repo+'/';let changed=false;
    for(const config of item.snapshot.configs){
      const path=prefix+config.path;
      const doc=context.workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);
      if(!doc)continue;
      if(doc.text!==config.text){
        const hash=await textHash(doc.text);
        if(doc.subscription.contentHash&&hash!==doc.subscription.contentHash||!doc.subscription.contentHash&&doc.remote?.lastSyncedText!==doc.text){
          doc.subscription={...doc.subscription,configurationConflict:true,sha:config.sha};
          changed=true;
          continue;
        }
        context.documents.checkpoint(doc);
        context.documents.change(doc,config.text);
        doc.subscription={repo:item.repo,path:config.path,sha:config.sha,loadedSha:config.sha,contentHash:await textHash(config.text)};
        editorStates.delete(doc.id);
        if(current()?.id===doc.id&&context.view){
          context.view.setState(makeState(doc));
          if(context.isPreview)renderPreview();
        }
        changed=true;
      }
    }
    for(const file of item.snapshot.files){
      const path=prefix+file.path;
      const doc=context.workspace.documents.find(doc=>documentPath(doc)===path&&doc.subscription?.repo===item.repo);
      if(doc)doc.subscription={...doc.subscription,repo:item.repo,path:file.path,sha:file.sha};
    }
    if(changed){preparePaths(context.workspace);renderDocuments();save();}
  }
  async function textHash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
  async function loadSubscriptionDocument(doc,attempt=0){
    if(doc?.subscription?.configurationConflict)throw Error(t('本地 .vela 配置已修改，请在订阅拉取预览中对照并处理冲突。'));
    if(doc?.subscription&&doc.subscription.loadedSha!==doc.subscription.sha){
      await ensureSubscriptions();
      const target=doc.subscription.sha,initial=doc.text,hash=await textHash(initial),rawText=await context.subscriptions.api.blob(doc.subscription.repo,target),text=documentKind(doc)==='CSV'?rawText:normalizeText(rawText);
      if(doc.subscription.sha!==target){if(attempt>0)throw new Error(t('远端文件持续变化，请刷新后重试。'));return loadSubscriptionDocument(doc,attempt+1);}
      if(doc.text!==initial)throw new Error(t('读取期间本地文稿已修改，已保留本地内容，请重试。'));
      if(initial&&(!doc.subscription.loadedSha||doc.subscription.contentHash&&hash!==doc.subscription.contentHash)){
        const copy=newDocument(doc.name,initial);
        copy.path=uniquePath(documentPath(doc),itemPaths(context.workspace));
        copy.name=basename(copy.path);
        context.workspace.documents.push(copy);
      }
      doc.text=text;doc.subscription.loadedSha=target;doc.subscription.contentHash=await textHash(text);doc.updatedAt=Date.now();editorStates.delete(doc.id);if(current()?.id===doc.id&&context.view){
        context.view.setState(makeState(doc));
        if(context.isPreview)renderPreview();
        updateStats();
      }if(!save())throw new Error(t('订阅文件保存失败。'));
    }return doc;
  }
  return {restorePulledEditor,previewDownload,materializeDownload,pullSubscription,cacheSubscription,loadSubscriptionDocument};
}
