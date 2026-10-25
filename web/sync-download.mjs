import { syncTargetMarkup } from './sync-target.mjs';
import { downloadPlan } from './sync-plan.mjs';
import { diffMarkup } from './sync-preview.mjs';
import { conflictMarkup, bindConflict } from './sync-conflicts.mjs';
import { toBase64 } from './plugin-package.mjs';
import { MAX_TEXT_BYTES } from './model.mjs';
import { documentPath } from './workspace.mjs';
import { syncTextEqual, preserveVelaPositions } from './vela-sync.mjs';

const blocked = new Set(['branch-conflict', 'delete-modified', 'delete-unsafe']);
const labels = {
  new: '新增',
  remote: '远端更新',
  merged: '配置修改可自动合并',
  unchanged: '相同',
  local: '仅本地修改 · 保留',
  conflict: '本地修改 · 请选择处理方式',
  'remote-deleted': '远端已删除 · 勾选后移入回收站',
  'delete-modified': '远端已删除 · 本地有修改，保留',
  'delete-unsafe': '远端已删除 · 无法确认本地版本，保留',
  'branch-conflict': '此路径属于其他分支或仓库 · 保留',
};

export function previewDownload({
  workspace,
  result,
  folder,
  onApply,
  openModal,
  escape: esc,
  checkpoint,
  save,
  title = '确认拉取文件',
  description,
}) {
  const plan = downloadPlan(workspace, result, folder),
    resolvers = new Map();
  const rows = plan
    .map((item, i) => {
      const conflict = item.state === 'conflict' && typeof item.file.text === 'string';
      const details = conflict
        ? '<label>处理方式<select data-resolution="' +
          i +
          '"><option value="">请选择…</option><option value="merge">逐段合并</option><option value="local">保留本地全文</option><option value="remote">采用远端全文</option></select></label><div class="sync-resolver" hidden></div>'
        : !item.file.delete &&
            !blocked.has(item.state) &&
            typeof item.file.text === 'string' &&
            item.state !== 'unchanged'
          ? '<details><summary>对照内容</summary>' +
            diffMarkup(item.doc?.text || '', item.file.text, esc) +
            '</details>'
          : '';
      return (
        '<section data-download="' +
        i +
        '"><label class="checkbox"><input name="downloadFiles" type="checkbox" value="' +
        i +
        '" ' +
        (item.selected ? 'checked' : '') +
        ' ' +
        (blocked.has(item.state) ? 'disabled' : '') +
        '><span>' +
        esc(item.file.path) +
        '<small>' +
        labels[item.state] +
        '</small></span></label>' +
        details +
        '</section>'
      );
    })
    .join('');
  openModal(
    title,
    (description ??
      syncTargetMarkup(result, folder, esc) +
        '<p>未勾选的文件保留本地内容。拉取不会自动打开文稿。</p>') +
      (plan.some((item) => item.file.delete)
        ? '<p class="notice">远端删除项默认不勾选。只有确认未修改的文件可以移入回收站，本地独有文件保留。</p>'
        : '') +
      '<div class="sync-files">' +
      (rows || '<p>没有需要处理的文件。</p>') +
      '</div>',
    async (form) => {
      const selected = new Set(form.getAll('downloadFiles').map(Number));
      const files = [],
        deletions = [];
      for (const [i, item] of plan.entries())
        if (selected.has(i)) {
          if (blocked.has(item.state))
            throw Error('此文件需要保留，请刷新并核对本地内容：' + item.file.path);
          const current = item.doc && workspace.documents.find((doc) => doc.id === item.doc.id);
          if (
            item.doc &&
            (!current ||
              documentPath(current) !== (item.docPath ?? item.path) ||
              !syncTextEqual(item.path, item.beforeText, current.text))
          )
            throw Error('本地文稿已变化，请重新拉取。');
          if (item.file.delete) {
            deletions.push({
              ...item.file,
              localPath: item.path,
              expectedData: item.expectedData,
              ...(current ? { expectedText: current.text } : {}),
            });
            if (current) checkpoint(current);
            continue;
          }
          let file = item.file;
          if (item.state === 'conflict' && typeof file.text === 'string') {
            const choice = document.querySelector('[data-resolution="' + i + '"]').value;
            if (!choice) throw Error('请为冲突文件选择处理方式：' + file.path);
            const text =
              choice === 'merge'
                ? resolvers.get(i)()
                : choice === 'local'
                  ? item.beforeText
                  : file.text;
            const bytes = new TextEncoder().encode(text);
            if (bytes.length > MAX_TEXT_BYTES) throw Error('合并后的文件超过 8 MB。');
            file = {
              ...file,
              remoteText: file.remoteText ?? file.text,
              text,
              data: toBase64(bytes),
            };
          }
          if (current && typeof file.text === 'string') {
            const text = preserveVelaPositions(item.path, file.text, current.text);
            if (text !== file.text)
              file = {
                ...file,
                remoteText: file.remoteText ?? file.text,
                text,
                data: toBase64(new TextEncoder().encode(text)),
              };
          }
          files.push(file);
          if (current) checkpoint(current);
        }
      if (!save()) throw Error('备份本地历史失败，未写入拉取文件。');
      const keptConflicts = plan
        .filter(
          (item, i) =>
            ['conflict', 'remote', 'merged', 'branch-conflict'].includes(item.state) &&
            !selected.has(i),
        )
        .map((item) => item.file.path);
      const observedFiles = plan
        .filter((item) => ['unchanged', 'local'].includes(item.state))
        .map((item) => item.file);
      const remoteDeletedPaths = plan
        .filter((item) => item.file.delete)
        .map((item) => item.file.path);
      await onApply({
        ...result,
        files,
        deletions,
        observedFiles,
        remoteDeletedPaths,
        keptConflicts,
      });
    },
    { label: plan.some((item) => item.file.delete) ? '应用选中变更' : '写入选中文件' },
  );
  for (const select of document.querySelectorAll('[data-resolution]'))
    select.onchange = () => {
      const i = Number(select.dataset.resolution),
        item = plan[i],
        root = select.closest('[data-download]').querySelector('.sync-resolver');
      root.hidden = select.value !== 'merge';
      if (select.value === 'merge' && !resolvers.has(i)) {
        root.innerHTML = conflictMarkup(item.beforeText, item.file.text, esc);
        resolvers.set(
          i,
          bindConflict(root, {
            base: item.doc?.remote?.lastSyncedText,
            local: item.beforeText,
            remote: item.file.text,
            escape: esc,
          }),
        );
      }
    };
}
