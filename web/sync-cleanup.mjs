import { sameGitHost } from './git-host.mjs';
import { syncTargetMarkup } from './sync-target.mjs';
import { syncBlobCache } from './sync-blob-cache.mjs';

/** Scan tracked remote paths only. All file removals use the regular reviewed trash workflow. */
export function showSyncCleanup({
  workspace,
  client,
  connected,
  native,
  workflow,
  busy,
  save,
  openModal,
  escape: esc,
  applied,
  toast,
}) {
  const targets = (workspace.repositories || []).filter(
    (item) => !item.prefix && sameGitHost(item, client),
  );
  openModal(
    '清除冗余文件',
    '<p>扫描已关联仓库中远端已删除的旧文件。仅确认未修改的文件可移入回收站，本地独有文稿保留。</p>' +
      '<label>清理范围<select name="cleanupTarget"><option value="cache">仅清理下载缓存</option>' +
      targets
        .map(
          (item, i) =>
            `<option value="${i}" ${native && connected ? '' : 'disabled'}>${esc(item.repo + ' / ' + item.branch + ' → ' + item.folder)}</option>`,
        )
        .join('') +
      '</select></label><label class="checkbox"><input type="checkbox" name="clearCache" checked>清理可重新下载的远端内容缓存</label>' +
      '<small>仓库扫描需要登录对应平台。扫描只读取目录，不重复下载正文和附件；清理结果可从回收站恢复。</small>',
    async (form) => {
      if (busy()) throw Error('正在同步，请完成后再清理。');
      const clearCache = form.has('clearCache');
      if (form.get('cleanupTarget') === 'cache') {
        if (!clearCache) throw Error('请选择清理范围。');
        await syncBlobCache.clear();
        toast('下载缓存已清理，文稿保留。');
        return;
      }
      if (!save()) throw Error('请先保存本地文稿。');
      const target = targets[Number(form.get('cleanupTarget'))];
      if (!target) throw Error('请选择已关联的仓库。');
      const result = await workflow.run(() =>
        client.pullRepository(target.repo, target.branch, { metadataOnly: true }),
      );
      await workflow.preview(
        { ...result, cleanupOnly: true },
        target.folder,
        async (selected) => {
          await workflow.materialize(selected, target.folder);
          await applied();
          if (clearCache) await syncBlobCache.clear();
          toast(`清理完成，${selected.deletions.length} 个旧文件已移入回收站。`);
        },
        client,
        {
          title: '确认清理冗余文件',
          description:
            syncTargetMarkup(result, target.folder, esc) +
            '<p>仅处理远端已删除的旧文件；未勾选项继续保留。</p>',
        },
      );
      return false;
    },
    { label: '扫描并预览' },
  );
}
