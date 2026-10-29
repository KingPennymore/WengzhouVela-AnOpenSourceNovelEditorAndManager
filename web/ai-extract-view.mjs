// The dialog owns cancellation; changing/closing a view discards every in-flight draft.
import { t, say } from './i18n.mjs';
import { escapeHtml as esc } from './text-utils.mjs';
import { aiSettings } from './ai-client.mjs';
import {
  chapterChoices,
  extractionBatches,
  extractionPrompt,
  extractDraft,
  batchLimit,
} from './ai-extract.mjs';
import { names, rowStatus, artifactValues } from './ai-artifacts.mjs';
import { extractionContext } from './ai-workspace.mjs';
export function openExtraction(app, edits) {
  const workspace = app.workspace,
    current = app.current(),
    source = { ...current, text: current.text },
    choices = chapterChoices(source.text, app.chapters(source));
  const context = extractionContext(workspace, source),
    session = app.openModal(t('整理辅助文件'), '<div class="ai-extract"></div>', null, {
      noSubmit: true,
    });
  const root = session.root.querySelector('.ai-extract');
  const baselines = new Map(context.available.map((doc) => [doc.path || doc.name, doc.text]));
  for (const path of Object.values(context.targets))
    if (!baselines.has(path)) baselines.set(path, null);
  let draft, controller;
  session.onDispose(() => controller?.abort());
  const alive = () =>
    session.alive() && app.workspace === workspace && app.current()?.id === source.id;
  const error = (cause) => {
    if (session.alive())
      root.querySelector('[role=alert]').textContent = t(cause.message || String(cause));
  };
  const settings = aiSettings(workspace);
  const destination = () =>
    document.querySelector('.ai-destination')?.textContent ||
    `${new URL(settings.endpoint).host} · ${settings.models.extract}`;
  root.innerHTML = `<p class="ai-destination">${esc(destination())}</p><p>${t('选择章节')}</p><p class="button-row"><button type="button" data-all>${t('全选')}</button><button type="button" data-none>${t('取消选择')}</button></p><div class="ai-chapters">${choices.map((c, i) => `<label class="checkbox"><input type="checkbox" name="aiChapter" value="${i}" checked>${esc(c.title)} · ${c.chars} ${t('字')}</label>`).join('')}</div><fieldset><legend>${t('选择产物')}</legend>${Object.entries(
    names,
  )
    .map(
      ([type, label]) =>
        `<label class="checkbox"><input type="checkbox" name="aiType" value="${type}"${type === 'glossary' ? ' checked' : ''}>${t(label)}</label>`,
    )
    .join(
      '',
    )}</fieldset><p role="alert"></p><button type="button" class="primary" data-next>${t('发送前确认')}</button>`;
  let lastChapter = -1;
  root.querySelector('.ai-chapters').onclick = (event) => {
    const input = event.target;
    if (input.name !== 'aiChapter') return;
    const at = Number(input.value);
    if (event.shiftKey && lastChapter >= 0)
      root.querySelectorAll('[name=aiChapter]').forEach((e, i) => {
        if (i >= Math.min(at, lastChapter) && i <= Math.max(at, lastChapter))
          e.checked = input.checked;
      });
    lastChapter = at;
  };
  root.querySelector('[data-all]').onclick = () =>
    root.querySelectorAll('[name=aiChapter]').forEach((e) => (e.checked = true));
  root.querySelector('[data-none]').onclick = () =>
    root.querySelectorAll('[name=aiChapter]').forEach((e) => (e.checked = false));
  root.querySelector('[data-next]').onclick = () => {
    const chapters = [...root.querySelectorAll('[name=aiChapter]:checked')].map(
        (e) => choices[Number(e.value)],
      ),
      types = [...root.querySelectorAll('[name=aiType]:checked')].map((e) => e.value);
    if (!chapters.length || !types.length) {
      error(Error('请选择章节和产物。'));
      return;
    }
    const batches = extractionBatches(source.text, chapters, batchLimit(settings)),
      chars = chapters.reduce((n, c) => n + c.chars, 0),
      sent = chars + batches.length * extractionPrompt(types).length;
    const notice =
      chars > settings.confirmChars ||
      (settings.dailyChars && settings.usage.chars + sent > settings.dailyChars * 0.8);
    root.innerHTML = `<p class="ai-destination">${esc(destination())}</p><p>${esc(chapters.map((c) => c.title).join('、'))}</p><p>${chars} ${t('字')} · ${batches.length} ${t('批次')} · ${esc(types.map((type) => t(names[type])).join('、'))}</p><p>${t('连同整理指令预计发送')} ${sent} ${t('字符')}</p>${notice ? `<p class="notice">${t('本次发送字数较多或接近每日上限，请确认范围。')}</p>` : ''}<p>${t('只发送以上章节，生成后先预览，不会立即写入文件。')}</p><p role="alert"></p><button type="button" class="primary" data-send>${t('确认发送')}</button>`;
    root.querySelector('[data-send]').onclick = async () => {
      if (!alive() || app.current().text !== source.text) {
        error(Error('文稿已变化，请重新选择章节。'));
        return;
      }
      controller = new AbortController();
      root.innerHTML = `<p role="status"></p><p role="alert"></p><button type="button" data-cancel>${t('取消生成')}</button>`;
      root.querySelector('[data-cancel]').onclick = () => controller.abort();
      try {
        draft = await extractDraft(workspace, {
          text: source.text,
          chapters,
          types,
          signal: controller.signal,
          progress: ({ completed, total }) => {
            if (session.alive())
              root.querySelector('[role=status]').textContent = say(
                `正在整理 ${completed} / ${total}`,
                `Organizing ${completed} / ${total}`,
              );
          },
        });
        app.save();
        if (alive()) preview();
      } catch (cause) {
        app.save();
        if (session.alive()) {
          root.querySelector('[role=status]').textContent = controller.signal.aborted
            ? t('已取消，未写入文件。')
            : t('生成失败，未写入文件。');
          error(cause.name === 'AbortError' ? Error('可以关闭并重新选择。') : cause);
        }
      }
    };
  };
  function preview() {
    const targets = { ...context.targets },
      existingCache = new Map();
    let shown = 0;
    root.innerHTML = `<p>${t('草稿预览：勾选后可修改，确认后整体写入。')}</p><p>${draft.warnings.length ? esc(draft.warnings.slice(0, 100).map(t).join('; ')) : ''}</p>${draft.rows.some((r) => r.type === 'places') ? `<p class="notice">${t('位置仅供参考，不生成地形。')}</p>` : ''}<div class="ai-targets"></div><div class="ai-draft-rows"></div><button type="button" data-more>${t('显示更多')}</button><p role="alert"></p><button type="button" class="primary" data-apply>${t('确认合并')}</button>`;
    for (const [kind, types, extension] of [
      ['glossary', ['glossary'], '.gly'],
      ['outline', ['outline', 'relations'], '.pcs'],
      ['places', ['places'], '.vlmp'],
    ]) {
      if (!draft.rows.some((r) => types.includes(r.type))) continue;
      const label = document.createElement('label');
      label.textContent = t(names[kind]);
      const select = document.createElement('select');
      select.dataset.target = kind;
      const candidates = [
        targets[kind],
        ...context.available.filter((d) => d.name.endsWith(extension)).map((d) => d.path || d.name),
      ];
      for (const path of new Set(candidates)) {
        const option = new Option(path === targets[kind] ? t('目标：') + path : path, path);
        select.add(option);
      }
      select.onchange = () => {
        targets[kind] = select.value;
        refreshStatus();
      };
      label.append(select);
      root.querySelector('.ai-targets').append(label);
    }
    function refreshStatus() {
      for (const node of root.querySelectorAll('[data-status]')) {
        const row = draft.rows[Number(node.dataset.status)],
          path = targets[row.type === 'relations' ? 'outline' : row.type],
          text = context.available.find((d) => (d.path || d.name) === path)?.text;
        const cacheKey = row.type + ':' + path;
        if (!existingCache.has(cacheKey))
          existingCache.set(cacheKey, artifactValues(row.type, text));
        node.textContent = t(rowStatus(row, text, existingCache.get(cacheKey)));
      }
    }
    function more() {
      const list = root.querySelector('.ai-draft-rows');
      draft.rows.slice(shown, shown + 60).forEach((row, offset) => {
        const i = shown + offset,
          el = document.createElement('fieldset');
        el.dataset.draft = i;
        el.innerHTML = `<legend>${t(names[row.type])} · <span data-status="${i}"></span></legend><label class="checkbox"><input type="checkbox" data-field="selected" checked>${t('写入此项')}</label><label>${t('名称')}<input data-field="name" maxlength="120" value="${esc(row.name)}"></label><label>${t('说明')}<textarea data-field="description" maxlength="4000">${esc(row.description)}</textarea></label>${row.type === 'glossary' ? `<label>${t('分类')}<input data-field="category" maxlength="80" value="${esc(row.category)}"></label><label>${t('别名（逗号分隔）')}<input data-field="aliases" value="${esc(row.aliases.join(', '))}"></label>` : ''}${row.type === 'relations' ? `<p>${esc(row.from)} ↔ ${esc(row.to)}</p>` : ''}`;
        el.oninput = (event) => {
          const field = event.target.dataset.field;
          if (!field) return;
          row[field] =
            field === 'selected'
              ? event.target.checked
              : field === 'aliases'
                ? event.target.value
                    .split(/[,，]/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : event.target.value;
        };
        list.append(el);
      });
      shown = Math.min(draft.rows.length, shown + 60);
      root.querySelector('[data-more]').hidden = shown === draft.rows.length;
      refreshStatus();
    }
    root.querySelector('[data-more]').onclick = more;
    more();
    root.querySelector('[data-apply]').onclick = async (event) => {
      if (!alive() || app.current().text !== source.text || app.locked()) {
        error(Error('文稿或工作区已变化，请重新生成。'));
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await edits.apply(app.workspace, source, draft, targets, baselines);
        if (session.alive()) {
          root.innerHTML = `<p role="status">${t('草稿已合并，可在 AI 面板整体撤销。')}</p>`;
        }
        app.toast(t('AI 草稿已合并。'));
      } catch (cause) {
        error(cause);
        button.disabled = false;
      }
    };
  }
}
