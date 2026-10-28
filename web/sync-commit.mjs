import {t,say} from './i18n.mjs';
import {commitPlan} from './sync-plan.mjs';
import {sameGitHost,gitIdentity} from './git-host.mjs';
import {sameRepository} from './sync-repository.mjs';
import {documentPath} from './workspace.mjs';
import {syncTextEqual} from './vela-sync.mjs';
import {textFingerprint} from './document-service.mjs';
import {bindDiffPreviews} from './sync-preview.mjs';
import {syncTargetMarkup} from './sync-target.mjs';

function commitRows(plan,labels,esc){
  return plan
    .map((item,index)=>
      [
        '<label class="checkbox"><input name="commitFiles" type="checkbox"',
        ` value="${index}" ${['new','modified'].includes(item.state)?'checked':''}>`,
        `<span>${esc(item.file.path)}<small>${labels[item.state]}</small></span></label>`,
        typeof item.file.text==='string'||item.file.delete
          ?`<details data-diff="${index}"><summary>${t('对照内容')}</summary><div></div></details>`
          :`<small>${t('二进制附件')}</small>`
      ].join('')
    )
    .join('');
}

/** Review an explicit immutable target and submit against its original remote head. */
export async function previewCommit(
  options,
  {workspace,client,activity,openModal,escape:esc,save,toast}
){
  const head=await client.request(
    client.base(options.repo) + '/git/ref/heads/' + encodeURIComponent(options.branch)
  );
  const expectedHead=head.object.sha;
  const association=workspace.repositories?.find(
      item=>
        sameGitHost(item,client)&&
        item.folder===options.folder&&
        item.repo===options.repo&&
        item.branch===options.branch&&
        (item.prefix||'')===options.prefix
    ),
    plan=commitPlan(options.files,association,{
      baseText:file=>{
        const doc=workspace.documents.find(
            doc=>documentPath(doc)===(options.folder?options.folder + '/':'') + file.path
          ),
          remote=doc?.remote;
        return sameGitHost(remote,client)&&
          remote?.repo?.toLowerCase()===options.repo.toLowerCase()&&
          remote.branch===options.branch&&
          remote.path===(options.prefix?options.prefix + '/':'') + file.path
          ?remote.lastSyncedText
          :undefined;
      }
    }),
    labels={
      new:t('新增'),
      modified:t('修改'),
      unchanged:t('未变化'),
      deleted:t('删除远端文件'),
      'remote-deleted':t('远端已删除 · 本地保留（勾选将重新上传）')
    };
  openModal(
    t('确认提交变更'),
    syncTargetMarkup(
      {...gitIdentity(client),repo:options.repo,branch:options.branch,path:options.prefix},
      options.folder,
      esc
    ) +
      `<p>${t('仅提交勾选的文件。个人配置、缓存和凭据文件默认不包含。')}</p><div class="sync-files">` +
      commitRows(plan,labels,esc) +
      '</div>' +
      `<label>${t('提交说明')}<input name="message" required value="${esc(options.message)}"></label>`,
    async form=>{
      const files=form.getAll('commitFiles').map(value=>plan[Number(value)].file);
      if(!files.length) throw Error(t('请选择变更。'));
      if(association?.conflicts?.length)
        throw Error(
          say(
            `仍有本地与远端冲突，请先拉取并处理这些文件：${association.conflicts.join('、')}`,
            `Local and remote conflicts remain. Pull and resolve these files first: ${association.conflicts.join(', ')}`
          )
        );
      for(const file of files){
        const local=workspace.documents.find(
          doc=>documentPath(doc)===(options.folder?options.folder + '/':'') + file.path
        );
        if(typeof file.text==='string'){
          if(!local||!syncTextEqual(file.path,local.text,file.text))
            throw Error(t('预览后文件已变化，请重新生成提交预览。'));
          file.text=local.text;
        }
      }
      const ids=files
        .map(
          file=>
            workspace.documents.find(
              doc=>documentPath(doc)===(options.folder?options.folder + '/':'') + file.path
            )?.id
        )
        .filter(Boolean);
      const result=await ids.reduceRight(
        (action,id)=>()=>activity.run(id,action),
        ()=>
          client.commitWorkspace({
            ...options,
            files,
            message:form.get('message'),
            expectedHead:association?.commit||expectedHead
          })
      )();
      const baseFiles={...association?.baseFiles};
      for(const file of files){
        if(file.delete) delete baseFiles[file.path];
        else
          baseFiles[file.path]={
            hash:textFingerprint(file.text??file.data),
            sha:result.files?.find(
              entry=>entry.path===(options.prefix?options.prefix + '/':'') + file.path
            )?.sha
          };
      }
      workspace.repositories=(workspace.repositories||[]).filter(
        item=>
          item.folder!==options.folder||
          !sameRepository(item,{
            ...gitIdentity(client),
            repo:options.repo,
            branch:options.branch
          })
      );
      workspace.repositories.push({
        ...gitIdentity(client),
        repo:options.repo,
        branch:options.branch,
        folder:options.folder,
        prefix:options.prefix,
        commit:result.sha,
        baseFiles
      });
      for(const file of files.filter(file=>!file.delete&&typeof file.text==='string')){
        const doc=workspace.documents.find(
          doc=>documentPath(doc)===(options.folder?options.folder + '/':'') + file.path
        );
        if(doc)
          doc.remote={
            ...gitIdentity(client),
            repo:options.repo,
            branch:options.branch,
            path:(options.prefix?options.prefix + '/':'') + file.path,
            sha:baseFiles[file.path]?.sha||'',
            lastSyncedText:file.text,
            syncedAt:Date.now()
          };
      }
      save();
      toast(
        say(
          `工作区已提交到 ${{github:'GitHub',gitee:'Gitee',gitea:'Gitea'}[client.provider]}。`,
          `Workspace committed to ${{github:'GitHub',gitee:'Gitee',gitea:'Gitea'}[client.provider]}.`
        )
      );
    },
    {label:t('提交选中变更')}
  );
  bindDiffPreviews(
    document.querySelector('#dialog-body'),
    plan,
    async item=>{
      const sha=association?.baseFiles?.[item.file.path]?.sha;
      if(sha) return client.blobText(options.repo,sha);
      try {
        return (
          await client.readFile(
            options.repo,
            expectedHead,
            (options.prefix?options.prefix + '/':'') + item.file.path
          )
        ).text;
      } catch(error){
        if(error.status===404) return '';
        throw error;
      }
    },
    esc
  );
}
