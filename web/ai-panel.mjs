// AI entry point: request/extraction views and continuation extensions remain lazy.
import { t, say } from './i18n.mjs';
import { escapeHtml as esc } from './text-utils.mjs';
import { icon } from './icons.mjs';
import { preset } from './ai-providers.mjs';
import { aiSettings, aiStatus, aiReady } from './ai-client.mjs';
export function createAiAssistant(app) {
  let status = null,
    statusRequest = null,
    panel = null,
    edits = null,
    suggestions = null,
    suggestionModule = null;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'ai-button';
  button.className = 'ai-button';
  button.hidden = true;
  button.innerHTML = icon('sparkle');
  button.title = t('AI 助手');
  button.setAttribute('aria-label', t('AI 助手'));
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  document.querySelector('#editor').append(button);
  button.onclick = open;
  const refreshStatus = () =>
    (statusRequest ??= aiStatus()
      .then(
        (value) => {
          status = value;
        },
        () => {
          status = null;
        },
      )
      .finally(() => {
        statusRequest = null;
        update();
      }));
  const visible = () =>
    !!app.workspace?.settings.ai?.enabled &&
    app.pageName === 'write' &&
    !app.home &&
    !app.isPreview &&
    !!app.current() &&
    ['TXT', 'MD'].includes(app.documentKind(app.current()));
  const canSuggest = () =>
    visible() &&
    !app.locked() &&
    !!suggestionModule?.suggestionEnabled(app.workspace, app.current()) &&
    aiReady(aiSettings(app.workspace), status);
  async function enableSuggestions() {
    suggestionModule ||= await import('./ai-suggest.mjs');
    if (!suggestions) {
      suggestions = suggestionModule.createAiSuggestions({
        ...app,
        get workspace() {
          return app.workspace;
        },
        current: app.current,
        canSuggest,
      });
      app.installSuggestion(suggestions.extension);
    }
    suggestions.refresh();
  }
  function update() {
    button.hidden = !visible();
    if (!button.hidden && !status && !statusRequest) refreshStatus();
    if (
      !button.hidden &&
      Object.values(aiSettings(app.workspace).suggestions || {}).some(Boolean) &&
      !suggestions
    )
      enableSuggestions().catch(app.fail);
    suggestions?.refresh();
    if (panel?.alive()) render();
  }
  function open() {
    panel = app.openModal(t('AI 助手'), '<div class="ai-panel"></div>', null, { noSubmit: true });
    button.setAttribute('aria-expanded', 'true');
    panel.onDispose(() => {
      panel = null;
      button.setAttribute('aria-expanded', 'false');
    });
    render();
    refreshStatus();
  }
  function render() {
    const root = panel.root.querySelector('.ai-panel');
    if (!root) return;
    const settings = aiSettings(app.workspace),
      ready = aiReady(settings, status),
      model = settings.models.extract;
    let service = t(preset(settings.provider).name);
    if (settings.provider === 'custom')
      try {
        service = new URL(settings.endpoint).host;
      } catch {}
    const enabled = suggestionModule?.suggestionEnabled(app.workspace, app.current()) || false;
    root.innerHTML = `<p class="ai-destination">${ready ? say(`内容将发送给 ${esc(service)} · ${esc(model)}`, `Content is sent to ${esc(service)} · ${esc(model)}`) : status ? t('还没有为当前服务保存 API Key。') : t('正在读取 AI 设置…')}</p>
   <section class="ai-section"><h3>${t('整理辅助文件')}</h3><p>${t('把选定章节整理成术语库、大纲与关系或地图草稿，预览确认后再写入。')}</p><button type="button" data-ai-extract ${ready ? '' : 'disabled'}>${t('选择章节')}</button>${edits?.undoRecord ? `<button type="button" data-ai-undo>${t('撤销上次 AI 合并')}</button>` : ''}</section>
   <section class="ai-section"><h3>${t('续写建议')}</h3><p>${t('在光标后以淡色显示续写建议，按 Tab 或点按接受，不影响正常输入。')}</p><p>${esc(settings.models.suggest || model)}</p><label class="checkbox"><input type="checkbox" data-ai-suggest ${enabled ? 'checked' : ''} ${ready ? '' : 'disabled'}>${t('为当前作品启用续写建议')}</label><small>${t('仅发送光标前最多 2000 字，每分钟最多 6 次；默认关闭。')}</small>${suggestions?.error() ? `<p role="status">${esc(suggestions.error())}</p>` : ''}</section>
   <p role="alert"></p><p class="button-row"><button type="button" class="${ready ? 'secondary' : 'primary'}" data-ai-settings>${t(ready ? 'AI 设置…' : '打开 AI 设置')}</button></p>`;
    root.querySelector('[data-ai-settings]').onclick = () => app.openSettings();
    const error = (cause) => {
      if (root.isConnected) root.querySelector('[role=alert]').textContent = t(cause.message);
    };
    root.querySelector('[data-ai-extract]').onclick = async () => {
      const origin = panel;
      try {
        const [{ openExtraction }, { AiWorkspaceEdits }] = await Promise.all([
          import('./ai-extract-view.mjs'),
          import('./ai-workspace.mjs'),
        ]);
        if (!origin?.alive() || !document.querySelector('#dialog').open || !visible()) return;
        edits ??= new AiWorkspaceEdits(app.projectService());
        openExtraction(app, edits);
      } catch (cause) {
        error(cause);
      }
    };
    root.querySelector('[data-ai-undo]')?.addEventListener('click', async () => {
      try {
        await edits.undo();
        if (panel?.alive()) render();
        app.toast(t('AI 合并已撤销。'));
      } catch (cause) {
        error(cause);
      }
    });
    root.querySelector('[data-ai-suggest]').onchange = async (event) => {
      const checked = event.target.checked;
      try {
        await enableSuggestions();
        const key = suggestionModule.suggestionProject(app.workspace, app.current());
        settings.suggestions ||= {};
        settings.suggestions[key] = checked;
        app.save();
        suggestions.refresh();
      } catch (cause) {
        event.target.checked = false;
        error(cause);
      }
    };
  }
  return {
    update,
    refreshStatus: () => {
      status = null;
      return refreshStatus();
    },
  };
}
