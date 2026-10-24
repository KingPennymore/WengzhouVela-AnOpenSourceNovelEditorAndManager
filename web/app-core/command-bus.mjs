// @ts-check

/** @typedef {{run: () => unknown, enabled?: () => boolean}} Command */

/** One dispatch path for shortcuts and the command palette; handlers read live app state. */
export class CommandBus {
  constructor() {
    /** @type {Map<string, Command>} */
    this.commands = new Map();
  }

  /** @param {string} id @param {Command} command */
  register(id, command) {
    if (this.commands.has(id)) throw new Error(`重复命令：${id}`);
    this.commands.set(id, command);
  }

  /** @param {string} id */
  execute(id) {
    const command = this.commands.get(id);
    if (!command || command.enabled?.() === false) return false;
    command.run();
    return true;
  }
}

/**
 * @typedef {object} ActionContext
 * @property {() => string} page
 * @property {() => boolean} home
 * @property {() => boolean} formatToolsVisible
 * @property {() => void} togglePreview
 * @property {() => void} closeActive
 * @property {(id: string) => HTMLButtonElement | null} button
 */

const readerActions = new Set([
  'outline-toggle',
  'settings',
  'theme',
  'mobile-library',
  'commands',
  'quick-git',
  'plugins',
]);

/** @param {string[]} ids @param {ActionContext} context */
export function createAppCommands(ids, context) {
  const bus = new CommandBus();
  for (const id of new Set(ids)) {
    bus.register(id, {
      enabled: () => context.page() !== 'reader' || readerActions.has(id),
      run: () => {
        if (id === 'toggle-display') {
          if (!context.home()) context.togglePreview();
        } else if (id === 'close-active') {
          context.closeActive();
        } else {
          const target = id === 'md-bold' && context.formatToolsVisible() ? 'format-strong' : id;
          const button = context.button(target);
          if (button && !button.disabled) button.click();
        }
      },
    });
  }
  return bus;
}

/**
 * @typedef {[id: string, binding: string, keys: string, label: string]} Shortcut
 * @typedef {object} ShortcutContext
 * @property {Shortcut[]} shortcuts
 * @property {(event: KeyboardEvent, binding: string) => boolean} matchesKey
 * @property {(id: string) => HTMLButtonElement | null} button
 * @property {() => string} page
 * @property {() => boolean} mapBack
 * @property {() => boolean} dialogOpen
 * @property {() => boolean} escapeHome
 * @property {() => void} search
 * @property {() => void} bookmark
 * @property {(key: string) => void} zoom
 * @property {(id: string) => boolean} execute
 */

/** @param {Document} document @param {ShortcutContext} context */
export function bindAppShortcuts(document, context) {
  for (const [id, , keys, label] of context.shortcuts) {
    const button = context.button(id);
    if (button) {
      button.title = `${label} (${keys})`;
      button.setAttribute('aria-keyshortcuts', keys);
    }
  }
  /** @param {KeyboardEvent} event */
  const keydown = (event) => {
    if (event.altKey && event.key === 'ArrowLeft' && context.mapBack()) {
      event.preventDefault();
      return;
    }
    if (context.page() === 'reader' && !(event.ctrlKey || event.metaKey)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      context.dialogOpen() ||
      target.closest('.plugin-page')
    ) {
      return;
    }
    if (event.key === 'Escape' && context.escapeHome()) {
      event.preventDefault();
      return;
    }
    // Plugin editables keep their keys. CodeMirror's content is the app's shortcut surface.
    const field = target.closest('input,textarea,select,[contenteditable="true"]');
    if (field && !field.matches('[data-cell-row],.cm-content')) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      context.search();
      return;
    }
    if (mod && event.altKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      context.bookmark();
      return;
    }
    if (mod && !event.altKey && ['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      context.zoom(event.key);
      return;
    }
    const shortcut = context.shortcuts.find(([, key]) => context.matchesKey(event, key));
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      context.execute(shortcut[0]);
    }
  };
  document.addEventListener('keydown', keydown, true);
  return () => document.removeEventListener('keydown', keydown, true);
}
