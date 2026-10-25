import {
  prepareDownload,
  assertDownloadTarget,
  repositoryAssociation,
} from './sync-repository.mjs';
import { previewDownload } from './sync-download.mjs';
import { applyRepository } from './git-workspace.mjs';

/** Coordinates remote preflight, reviewed changes and the native write transaction. */
export class SyncWorkflow {
  constructor(ports) {
    this.ports = ports;
    this.active = false;
  }

  async run(action) {
    if (this.active) throw Error('正在同步，请等待完成后重试。');
    this.active = true;
    try {
      return await action();
    } finally {
      this.active = false;
    }
  }

  async preview(result, folder, onApply, client, options = {}) {
    const p = this.ports,
      workspace = p.workspace();
    const prepared = await prepareDownload(workspace, result, folder, p.readFile);
    previewDownload({
      ...options,
      workspace,
      result: prepared,
      folder,
      openModal: p.openModal,
      escape: p.escape,
      checkpoint: p.checkpoint,
      save: p.save,
      onApply: (selected) =>
        this.run(async () => {
          if (p.workspace() !== workspace) throw Error('工作区已切换，请重新扫描。');
          if (selected.deletions?.length) {
            const head = await client.request(
              client.base(result.repo) + '/git/ref/heads/' + encodeURIComponent(result.branch),
            );
            if (head.object.sha !== result.commit)
              throw Error('远端分支在预览后已变化，请重新拉取。工作区未修改。');
          }
          await onApply(selected);
        }),
    });
  }

  async materialize(result, folder) {
    const p = this.ports,
      workspace = p.workspace();
    assertDownloadTarget(workspace, result, folder);
    const association = repositoryAssociation(workspace, result, folder);
    const previous = association && {
      commit: association.commit,
      conflicts: association.conflicts,
      pendingCommit: association.pendingCommit,
    };
    if (p.writeFiles) {
      const materialized = await p.writeFiles({
        files: result.files.map((file) => ({ path: folder + '/' + file.path, data: file.data })),
        folders: [folder, ...result.folders.map((path) => folder + '/' + path)],
        deletions: (result.deletions || []).map((file) => ({
          path: file.localPath,
          expectedData: file.expectedData,
          expectedText: file.expectedText,
        })),
      });
      p.adopt(materialized);
    } else if (result.files.some((file) => file.text === null) || result.deletions?.length)
      throw Error('附件和回收站同步请在应用中操作。');
    applyRepository(workspace, result, folder);
    const tracked = repositoryAssociation(workspace, result, folder);
    // Scanning deletions does not accept unseen remote edits as a new commit baseline.
    if (result.cleanupOnly && previous) Object.assign(tracked, previous);
    else if (result.keptConflicts?.length) {
      tracked.commit = previous?.commit;
      tracked.pendingCommit = result.commit;
      tracked.conflicts = result.keptConflicts;
    } else if (tracked) {
      tracked.conflicts = [];
      delete tracked.pendingCommit;
    }
    p.changed();
  }
}
