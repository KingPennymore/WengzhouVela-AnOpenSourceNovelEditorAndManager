// Draft application is an internal application operation, using ProjectService's
// existing atomic transaction queue/recovery. It never uses the AI response as a path.
import { projectConfig, createVelaV2, parseVela, velaText } from './vela.mjs';
import { documentPath } from './workspace.mjs';
import { relativePath } from './project-contract.mjs';
import { glossaryPaths } from './glossary.mjs';
import { buildArtifact, readDraft } from './ai-artifacts.mjs';
export function extractionContext(workspace, source) {
  const project = projectConfig(workspace, source),
    root =
      project && !project.global
        ? project.folder
        : documentPath(source).split('/').slice(0, -1).join('/');
  const prefix = root ? root + '/' : '';
  const available = workspace.documents.filter((d) => documentPath(d).startsWith(prefix));
  const stem =
    source.name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
      .slice(0, 60) || 'AI';
  const unique = (suffix) => {
    let name = stem + '-AI' + suffix,
      n = 2;
    const used = [
      ...workspace.documents.map(documentPath),
      ...(workspace.entries || []).map((e) => e.path),
    ].map((p) => p.toLocaleLowerCase());
    while (used.includes((prefix + name).toLocaleLowerCase())) name = stem + '-AI-' + n++ + suffix;
    return prefix + name;
  };
  return {
    root,
    prefix,
    project,
    targets: {
      glossary:
        glossaryPaths(workspace, source).find(
          (p) => p.startsWith(prefix) && available.some((d) => documentPath(d) === p),
        ) || unique('.gly'),
      outline: unique('.pcs'),
      places: unique('.vlmp'),
    },
    available,
  };
}
export class AiWorkspaceEdits {
  constructor(service) {
    this.service = service;
    this.undoRecord = null;
  }
  async read(session, path) {
    const handle = await session.handle();
    try {
      const value = await session.api.fs.readText({ workspaceId: handle.id, path });
      return { text: value.text, revision: value.revision };
    } catch (error) {
      if (error.code === 'E_NOT_FOUND') return { text: null, revision: null };
      throw error;
    }
  }
  async apply(workspace, source, draft, targets, baselines) {
    const context = extractionContext(workspace, source),
      session = this.service.bindBuiltin('vela.builtin.ai', context.root, 'AI 草稿合并'),
      changes = [],
      before = [];
    const relative = (path) => {
      if (context.prefix && !path.startsWith(context.prefix)) throw Error('目标须位于当前作品内。');
      return relativePath(path.slice(context.prefix.length));
    };
    try {
      const selected = draft.rows.filter((r) => r.selected);
      if (!selected.length) throw Error('请至少选择一项草稿。');
      for (const row of selected)
        if (readDraft(JSON.stringify({ [row.type]: [row] }), [row.type]).warnings.length)
          throw Error('草稿字段无效，请检查名称、别名和说明。');
      const groups = [
        ['glossary', ['glossary'], '.gly'],
        ['outline', ['outline', 'relations'], '.pcs'],
        ['places', ['places'], '.vlmp'],
      ];
      let glossary;
      for (const [kind, types, suffix] of groups) {
        const rows = selected.filter((r) => types.includes(r.type));
        if (!rows.length) continue;
        const path = relative(targets[kind]);
        if (!path.toLowerCase().endsWith(suffix)) throw Error('目标文件类型不匹配。');
        const old = await this.read(session, path);
        if (
          baselines &&
          (!baselines.has(targets[kind]) || baselines.get(targets[kind]) !== old.text)
        )
          throw Object.assign(Error('目标文件在预览后已变化，请重新预览。'), {
            code: 'E_CONFLICT',
          });
        before.push({ path, ...old });
        changes.push({
          kind: 'writeText',
          path,
          text: buildArtifact(kind, old.text, rows, source.name),
          expectedRevision: old.revision,
          addToReadingList: true,
        });
        if (kind === 'glossary') glossary = path;
      }
      if (glossary) {
        const old = await this.read(session, '.vela'),
          config = old.text
            ? parseVela(old.text)
            : createVelaV2(source.name.replace(/\.[^.]+$/, ''));
        config.editor ||= {};
        config.editor.glossaries = [...new Set([...(config.editor.glossaries || []), glossary])];
        const file = documentPath(source).slice(context.prefix.length),
          override = config.files?.[file]?.editor;
        if (override?.glossaries)
          override.glossaries = [...new Set([...override.glossaries, glossary])];
        const text = velaText(config);
        if (text !== old.text) {
          before.push({ path: '.vela', ...old });
          changes.push({ kind: 'writeText', path: '.vela', text, expectedRevision: old.revision });
        }
      }
      const handle = await session.handle();
      const result = await session.api.fs.applyBatch({
        workspaceId: handle.id,
        expectedWorkspaceRevision: handle.revision,
        idempotencyKey: crypto.randomUUID(),
        label: 'AI 草稿合并',
        changes,
      });
      this.undoRecord = {
        root: context.root,
        before,
        after: new Map(result.changed.map((e) => [e.path, e.revision])),
      };
      return result;
    } finally {
      await session.stop();
    }
  }
  async undo() {
    const record = this.undoRecord;
    if (!record) throw Error('没有可撤销的 AI 合并。');
    const session = this.service.bindBuiltin('vela.builtin.ai', record.root, '撤销 AI 草稿合并');
    try {
      const handle = await session.handle(),
        changes = record.before.map((old) =>
          old.text === null
            ? {
                kind: 'delete',
                path: old.path,
                mode: 'trash',
                expectedRevision: record.after.get(old.path),
              }
            : {
                kind: 'writeText',
                path: old.path,
                text: old.text,
                expectedRevision: record.after.get(old.path),
                addToReadingList: true,
              },
        );
      await session.api.fs.applyBatch({
        workspaceId: handle.id,
        expectedWorkspaceRevision: handle.revision,
        idempotencyKey: crypto.randomUUID(),
        label: '撤销 AI 草稿合并',
        changes,
      });
      this.undoRecord = null;
    } finally {
      await session.stop();
    }
  }
}
