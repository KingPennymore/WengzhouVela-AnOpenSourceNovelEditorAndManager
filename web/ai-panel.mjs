import {setVelaPreference} from './vela.mjs';
// AI entry point: request/extraction views and continuation extensions remain lazy.
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { aiSettings, aiStatus, aiReady, subscribeAiActivity } from './ai-client.mjs';
export function createAiAssistant(app) {
  let status = null,
    statusRequest = null,
    statusFailed = false,
    expanded = false,
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
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  document.querySelector('#editor').append(button);
  const menu = document.createElement('div');
  menu.id = 'ai-actions';
  menu.className = 'ai-actions';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t('AI 助手'));
  button.setAttribute('aria-controls', menu.id);
  document.querySelector('#editor').append(menu);
  button.addEventListener('mousedown', (event) => event.preventDefault());
  menu.addEventListener('mousedown', (event) => event.preventDefault());
  button.onclick = () => {
    expanded = !expanded;
    render();
  };
  document.addEventListener('pointerdown', (event) => {
    if (expanded && !menu.contains(event.target) && !button.contains(event.target)) {
      expanded = false;
      render();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!expanded) return;
    if (event.key === 'Escape') {
      expanded = false;
      render();
      button.focus();
      event.preventDefault();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = [...menu.querySelectorAll('button:not(:disabled)')],
        i = items.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (i + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
      event.preventDefault();
    }
  });
  let finishTimer,
    wasBusy = false;
  subscribeAiActivity((count) => {
    clearTimeout(finishTimer);
    if (count) {
      wasBusy = true;
      button.classList.remove('ai-complete');
      button.classList.add('ai-busy');
      button.setAttribute('aria-busy', 'true');
    } else
      finishTimer = setTimeout(() => {
        button.classList.remove('ai-busy');
        button.removeAttribute('aria-busy');
        if (wasBusy) {
          button.classList.remove('ai-complete');
          void button.offsetWidth;
          button.classList.add('ai-complete');
          wasBusy = false;
        }
      }, 30);
  });
  const refreshStatus = () =>
    (statusRequest ??= aiStatus()
      .then(
        (value) => {
          statusFailed = false;
          status = value;
        },
        () => {
          statusFailed = true;
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
    if (!button.hidden && !status && !statusRequest && !statusFailed) refreshStatus();
    if (
      !button.hidden &&
      Object.values(aiSettings(app.workspace).suggestions || {}).some(Boolean) &&
      !suggestions
    )
      enableSuggestions().catch(app.fail);
    suggestions?.refresh();
    if (button.hidden) expanded = false;
    render();
  }
  function render() {
    menu.hidden = !expanded || button.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
    if (menu.hidden) return;
    const settings = aiSettings(app.workspace),
      ready = aiReady(settings, status);
    const enabled = suggestionModule?.suggestionEnabled(app.workspace, app.current()) || false;
    menu.innerHTML = `<button type="button" role="menuitem" data-ai-extract ${ready ? '' : 'disabled'}>${t('整理辅助文件')}</button><button type="button" role="menuitemcheckbox" aria-checked="${enabled}" data-ai-suggest ${ready ? '' : 'disabled'}>${t('续写建议')} ${enabled ? '✓' : ''}</button><button type="button" role="menuitem" data-ai-settings>${t('AI 设置…')}</button>${edits?.undoRecord ? `<button type="button" role="menuitem" data-ai-undo>${t('撤销上次 AI 合并')}</button>` : ''}`;
    const close = () => {
      expanded = false;
      render();
    };
    menu.querySelector('[data-ai-settings]').onclick = () => {
      close();
      app.openSettings();
    };
    menu.querySelector('[data-ai-extract]').onclick = async () => {
      close();
      try {
        const [{ openExtraction }, { AiWorkspaceEdits }] = await Promise.all([
          import('./ai-extract-view.mjs'),
          import('./ai-workspace.mjs'),
        ]);
        if (!visible()) return;
        edits ??= new AiWorkspaceEdits(app.projectService());
        openExtraction(app, edits);
      } catch (cause) {
        app.fail(cause);
      }
    };
    menu.querySelector('[data-ai-suggest]').onclick = async () => {
      close();
      try {
        await enableSuggestions();
        const key = suggestionModule.suggestionProject(app.workspace, app.current());
        settings.suggestions ||= {};
        setVelaPreference(app.workspace,app.current(),'ai','suggestions',!enabled);
        settings.suggestions[key] = !enabled;
        app.save();
        suggestions.refresh();
      } catch (cause) {
        app.fail(cause);
      }
    };
    menu.querySelector('[data-ai-undo]')?.addEventListener('click', async () => {
      close();
      try {
        await edits.undo();
        app.toast(t('AI 合并已撤销。'));
      } catch (cause) {
        app.fail(cause);
      }
    });
  }
  return {
    closeMenu(){if(!expanded)return false;expanded=false;render();return true;},
    update,
    refreshStatus: () => {
      status = null;
      statusFailed = false;
      return refreshStatus();
    },
  };
}
