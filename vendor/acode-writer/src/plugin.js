/* 全部 UI 与宿主适配；build.py 将 core.js + 此文件打包为 main.js。 */
(() => {
  'use strict';
  const ID = 'com.tuyuan.acode.writer';
  const STORE = ID + '.settings.v1';
  const C = WriterCore;
  const CSS = `
    .aw-bar,.aw-overlay{color-scheme:light;--aw-surface:var(--popup-background-color,var(--secondary-color,#fff));--aw-text:var(--popup-text-color,var(--secondary-text-color,var(--primary-text-color,#202732)));--aw-field:var(--secondary-color,#f5f7fa);--aw-field-text:var(--secondary-text-color,var(--aw-text));--aw-border:var(--border-color,#d5dae2);--aw-accent:var(--link-text-color,var(--active-color,#2563eb));--aw-error:var(--error-text-color,#b42318)}
    body[theme-type=dark] .aw-bar,body[theme-type=dark] .aw-overlay{color-scheme:dark}
    @media(prefers-color-scheme:dark){body:not([theme-type]) .aw-bar,body:not([theme-type]) .aw-overlay{color-scheme:dark}}
    .aw-bar{display:flex;align-items:center;gap:4px;box-sizing:border-box;width:100%;height:38px;padding:0 5px;background:var(--aw-field);color:var(--aw-field-text);border-top:1px solid var(--aw-border);font:12px/1.4 system-ui,sans-serif;overflow:hidden}
    .aw-bar button{font:inherit;color:inherit;background:transparent;border:0;height:36px;min-width:36px;padding:0 6px;cursor:pointer}
    .aw-bar .aw-current{flex:1;min-width:0;text-align:left;display:flex;align-items:center;gap:5px;overflow:hidden}
    .aw-bar .aw-chapter{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .aw-bar .aw-count{flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums}
    .aw-bar .aw-total{white-space:nowrap;font-variant-numeric:tabular-nums}
    .aw-bar button:focus-visible,.aw-overlay button:focus-visible{outline:2px solid var(--aw-accent);outline-offset:-2px}
    .aw-bar button:disabled{opacity:.45;cursor:default}
    .aw-ace-reserve>.ace_scroller,.aw-ace-reserve>.ace_gutter,.aw-ace-reserve>.ace_scrollbar-v{bottom:var(--aw-scroller-bottom,38px)!important}
    .aw-ace-reserve>.ace_scrollbar-h{bottom:38px!important}
    .aw-ace-bar{position:absolute;bottom:0;left:0;z-index:8}
    .aw-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.38);box-sizing:border-box;color:var(--aw-text);font:14px/1.55 system-ui,sans-serif}
    .aw-dialog{width:100%;max-width:560px;max-height:90%;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;background:var(--aw-surface);color:var(--aw-text);border:1px solid var(--aw-border);box-shadow:0 8px 36px var(--box-shadow-color,rgba(0,0,0,.2))}
    .aw-dialog header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--aw-border);gap:10px}
    .aw-dialog h2{font-size:17px;margin:0;min-width:0}
    .aw-dialog button{color:var(--aw-field-text);border:1px solid var(--aw-border);border-radius:7px;background:var(--aw-field);padding:10px 12px;font:inherit;cursor:pointer}
    .aw-body{overflow:auto;padding:14px 16px;overscroll-behavior:contain}
    .aw-dialog input,.aw-dialog select,.aw-dialog textarea{box-sizing:border-box;width:100%;color:var(--aw-field-text);background:var(--aw-field);border:1px solid var(--aw-border);border-radius:6px;padding:10px;font:inherit;margin:6px 0 10px;accent-color:var(--aw-accent)}
    .aw-dialog input::placeholder,.aw-dialog textarea::placeholder{color:var(--aw-field-text);opacity:.65}
    .aw-dialog input:focus-visible,.aw-dialog select:focus-visible,.aw-dialog textarea:focus-visible{outline:2px solid var(--aw-accent);outline-offset:1px}
    .aw-dialog textarea{font-family:monospace;resize:vertical;min-height:84px}
    .aw-dialog input[type=checkbox]{width:auto;margin:0 8px 0 0}
    .aw-dialog label{display:block;margin-bottom:12px}
    .aw-help{font-size:12px;opacity:.85;margin:4px 0 12px;overflow-wrap:anywhere}
    .aw-error{color:var(--aw-error);font-size:13px;white-space:pre-wrap}
    .aw-list{display:flex;flex-direction:column;gap:7px}
    .aw-list button{text-align:left;width:100%;display:flex;flex-direction:column;gap:3px;overflow-wrap:anywhere}
    .aw-list button[aria-current=true]{border-color:var(--aw-accent);box-shadow:inset 3px 0 0 var(--aw-accent)}
    .aw-list small{opacity:.85;font-size:12px}
    .aw-rule{border:1px solid var(--aw-border);border-radius:7px;padding:10px;margin:10px 0}.aw-rule label{margin-bottom:4px}
    .aw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .aw-preview{padding:10px;background:var(--aw-field);color:var(--aw-field-text);border:1px solid var(--aw-border);border-radius:6px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
    .aw-dialog [hidden]{display:none!important}
  `;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, handler, className) => {
    const node = el('button', className, text); node.type = 'button';
    node.addEventListener('click', handler); return node;
  };
  class WriterPlugin {
    constructor() {
      this.cleanups = []; this.editorCleanup = null; this.disposed = true;
      this.onChange = () => this.schedule(true);
      this.onCursor = () => this.schedule(false);
    }
    require(name) { try { return acode.require(name); } catch (_) { return null; } }
    hostLanguage() {
      return this.hostSettings?.value?.lang || this.hostSettings?.get?.('lang') ||
        document.documentElement?.lang || (typeof navigator !== 'undefined' ? navigator.language : 'zh');
    }
    t(key, values) { return WriterI18n.translate(this.language, key, values); }
    sectionTitle(section) { return section.heading ? section.title : this.t(section.kind === 'preamble' ? '章前内容' : '全文（未识别章节）'); }
    localize() {
      this.language = WriterI18n.resolve(this.settings.language, this.hostLanguage());
      if (!this.bar) return;
      this.bar.lang = this.language;
      this.prev.title = this.t('上一章'); this.next.title = this.t('下一章'); this.gear.title = this.t('写作插件设置');
      this.prev.setAttribute('aria-label', this.prev.title); this.next.setAttribute('aria-label', this.next.title);
      this.gear.setAttribute('aria-label', this.gear.title);
      this.registerCommands(); this.updateStatus();
    }
    registerCommands() {
      for (const name of this.commandNames || []) this.commands?.removeCommand?.(name);
      this.commandNames = [];
      if (!this.commands?.addCommand) return;
      for (const [name, description, exec] of [
        ['outline', this.t('写作：章节目录'), () => this.openOutline()],
        ['settings', this.t('写作：设置标题和字数规则'), () => this.openSettings()],
        ['previous', this.t('写作：上一章'), () => this.navigate(-1)],
        ['next', this.t('写作：下一章'), () => this.navigate(1)]
      ]) {
        const full = ID + '.' + name;
        this.commands.addCommand({ name: full, description, exec }); this.commandNames.push(full);
      }
    }
    loadSettings() {
      try { return C.normalizeSettings(JSON.parse(localStorage.getItem(STORE) || '{}')); }
      catch (_) { return C.normalizeSettings({}); }
    }
    init() {
      if (!this.disposed) this.destroy();
      this.disposed = false; this.manager = window.editorManager;
      if (!this.manager) throw new Error(this.t('Acode 编辑器尚未就绪。'));
      this.settings = this.loadSettings();
      this.hostSettings = this.require('settings');
      this.language = WriterI18n.resolve(this.settings.language, this.hostLanguage());
      try { this.matcher = C.compileMatcher(this.settings); }
      catch (_) { this.settings = C.normalizeSettings({}); this.matcher = C.compileMatcher(this.settings); }
      this.style = el('style'); this.style.textContent = CSS; document.head.append(this.style);
      this.stack = this.require('actionStack');
      this.bar = el('div', 'aw-bar');
      this.prev = button('‹', () => this.navigate(-1)); this.prev.title = this.t('上一章');
      this.current = button(this.t('正在识别…'), () => this.openOutline(), 'aw-current');
      this.current.textContent = '';
      this.chapterLabel = el('span', 'aw-chapter', this.t('正在识别…')); this.chapterCount = el('span', 'aw-count');
      this.current.append(this.chapterLabel, this.chapterCount);
      this.current.title = this.t('打开章节目录');
      this.total = el('span', 'aw-total');
      this.next = button('›', () => this.navigate(1)); this.next.title = this.t('下一章');
      const gear = this.gear = button('⚙', () => this.openSettings()); gear.title = this.t('写作插件设置');
      this.bar.append(this.prev, this.current, this.total, this.next, gear);
      const refresh = () => { this.bindEditor(); this.schedule(true); };
      for (const name of ['switch-file', 'file-loaded', 'new-file', 'remove-file', 'rename-file', 'update']) this.listen(this.manager, name, refresh);
      this.listen(this.manager, 'file-content-changed', this.onChange);
      // 窗口尺寸变化会触发宿主重排；底栏由原生 CM panel / Ace 内部布局保持在编辑区底部。
      this.commands = this.require('commands') || this.manager.editor?.commands;
      this.localize();
      this.listen(this.hostSettings, 'update:lang', () => {
        if (this.settings.language === 'auto') { this.closeDialog(false); this.localize(); }
      });
      this.bindEditor(); this.rebuild();
      // 轻量兜底：检测编辑器/会话更换及 CM setState 后扩展消失，不周期读取全文。
      this.watchdog = setInterval(() => {
        if (this.disposed) return;
        this.bindEditor();
        if (this.cmRecord && this.cmRecord.compartment.get(this.view.state) === undefined) { this.attachCM(); this.schedule(true); }
        const row = this.cursorRow();
        if (row !== this.lastRow) this.updateStatus();
      }, 400);
    }
    listen(target, event, handler) {
      if (!target?.on) return;
      target.on(event, handler);
      this.cleanups.push(() => { if (target.off) target.off(event, handler); else target.removeListener?.(event, handler); });
    }
    isCM(view = this.view) { return !!(view?.state?.doc && typeof view.dispatch === 'function'); }
    bindEditor() {
      const view = this.manager.editor;
      const session = this.isCM(view) ? null : view?.session;
      const file = this.manager.activeFile;
      if (view === this.view && session === this.session && file === this.file) return;
      this.closeDialog(false); this.editorCleanup?.(); this.editorCleanup = null; this.cmRecord = null;
      this.view = view; this.session = session; this.file = file; this.dirty = true;
      this.bar.remove();
      if (!view) return;
      if (this.isCM()) this.attachCM(); else this.attachAce();
      this.schedule(true);
    }
    attachCM() {
      const view = this.view, cm = this.require('codemirror');
      if (!cm?.state?.Compartment || !cm?.view?.showPanel) throw new Error(this.t('此 Acode 的 CodeMirror 插件接口不完整，请更新 Acode。'));
      const compartment = this.cmRecord?.compartment || new cm.state.Compartment();
      const extensions = [cm.view.EditorView.updateListener.of(update => {
        if (this.disposed || view !== this.view) return;
        if (update.docChanged) this.onChange(); else if (update.selectionSet) this.onCursor();
      }), cm.view.showPanel.of(() => ({ dom: this.bar, top: false }))];
      view.dispatch({ effects: cm.state.StateEffect.appendConfig.of(compartment.of(extensions)) });
      this.cmRecord = { compartment, view };
      this.editorCleanup = () => {
        try { if (compartment.get(view.state) !== undefined) view.dispatch({ effects: compartment.reconfigure([]) }); }
        catch (_) { /* 宿主可能已销毁该 pane。 */ }
        this.bar.remove();
      };
    }
    attachAce() {
      const view = this.view, session = this.session;
      const container = view.container || this.manager.container;
      if (!container) return;
      const renderer = view.renderer;
      const previousExtraHeight = renderer?.$extraHeight;
      // Ace 在 $updateCachedSize 中扣除 $extraHeight；同时移动 scroller / scrollbar 的底边。
      // 此属性属于 Ace 内部接口，兼容性需在目标 Acode 设备上验收。
      if (renderer) renderer.$extraHeight = (previousExtraHeight || 0) + 38;
      const syncBottom = () => container.style.setProperty('--aw-scroller-bottom',
        (38 + (renderer?.scrollBarH?.getHeight?.() || 0)) + 'px');
      renderer?.on?.('afterRender', syncBottom); syncBottom();
      container.classList.add('aw-ace-reserve'); this.bar.classList.add('aw-ace-bar'); container.append(this.bar);
      if (view.on) view.on('change', this.onChange);
      if (view.selection?.on) view.selection.on('changeCursor', this.onCursor);
      if (view.on) view.on('changeSession', this.onChange);
      if (session?.on) session.on('change', this.onChange);
      view.resize?.(true);
      this.editorCleanup = () => {
        for (const [target, name, fn] of [[view,'change',this.onChange],[view,'changeSession',this.onChange],
          [view.selection,'changeCursor',this.onCursor],[session,'change',this.onChange]]) {
          if (target?.off) target.off(name, fn); else target?.removeListener?.(name, fn);
        }
        renderer?.off?.('afterRender', syncBottom);
        if (renderer) renderer.$extraHeight = previousExtraHeight;
        container.style.removeProperty('--aw-scroller-bottom');
        container.classList.remove('aw-ace-reserve'); this.bar.classList.remove('aw-ace-bar'); this.bar.remove();
        view.resize?.(true);
      };
    }
    cursorRow() {
      if (!this.view) return 0;
      if (this.isCM()) return this.view.state.doc.lineAt(this.view.state.selection.main.head).number - 1;
      return this.view.getCursorPosition?.().row || 0;
    }
    readText() {
      if (this.isCM()) return this.view.state.doc.toString();
      return this.view?.getValue?.() || '';
    }
    enabled() { return C.supportsFile(this.file, this.settings); }
    schedule(dirty) {
      if (this.disposed) return;
      if (dirty) {
        this.dirty = true;
        this.dirtySince ??= Date.now();
      } else if (this.dirty) {
        // 光标变化不推迟已经安排的正文扫描。
        this.updateStatus();
        return;
      }
      clearTimeout(this.timer);
      const delay = this.dirty ? Math.min(180, Math.max(0, 500 - (Date.now() - this.dirtySince))) : 16;
      this.timer = setTimeout(() => { this.bindEditor(); if (this.dirty) this.rebuild(); else this.updateStatus(); }, delay);
    }
    rebuild() {
      clearTimeout(this.timer);
      if (this.disposed) return;
      this.index = this.enabled() ? C.buildIndex(this.readText(), this.settings, this.matcher) : null;
      this.dirty = false; this.dirtySince = null; this.updateStatus();
      if (this.renderOutline) this.renderOutline();
    }
    updateStatus() {
      this.lastRow = this.cursorRow();
      if (!this.index) {
        this.chapterLabel.textContent = this.file ? this.t('写作：此文件未启用') : this.t('写作：请打开文本'); this.chapterCount.textContent = '';
        this.total.textContent = ''; this.prev.disabled = this.next.disabled = true;
        return;
      }
      const section = C.sectionAt(this.index, this.lastRow);
      const title = this.sectionTitle(section);
      this.chapterLabel.textContent = title; this.chapterCount.textContent = this.t(' · {count}字', { count: section.count.toLocaleString(this.language) });
      this.current.title = this.t('当前章节：{title}\n本章 {count} 字 · 点击打开目录', { title, count: section.count });
      this.total.textContent = this.t('全文 {count}字', { count: this.index.total.toLocaleString(this.language) });
      this.total.title = this.t('{count}字', { count: this.index.total.toLocaleString(this.language) });
      const i = this.index.sections.indexOf(section);
      this.prev.disabled = i === 0; this.next.disabled = i === this.index.sections.length - 1;
    }
    flush() { this.bindEditor(); if (this.dirty) this.rebuild(); }
    jump(row) {
      this.closeDialog(false);
      if (this.isCM()) {
        const doc = this.view.state.doc;
        const pos = doc.line(Math.max(1, Math.min(row + 1, doc.lines))).from;
        this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      } else this.view?.gotoLine?.(row + 1, 0, true);
      this.view?.focus?.(); this.updateStatus();
    }
    navigate(direction) {
      this.flush(); if (!this.index) return;
      const current = C.sectionAt(this.index, this.cursorRow());
      const i = this.index.sections.indexOf(current) + direction;
      if (this.index.sections[i]) this.jump(this.index.sections[i].row);
    }
    showDialog(title) {
      this.closeDialog(false);
      const overlay = el('div', 'aw-overlay'), dialog = el('section', 'aw-dialog');
      overlay.lang = this.language;
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', title); dialog.tabIndex = -1;
      const header = el('header'); header.append(el('h2', '', title), button(this.t('关闭'), () => this.closeDialog()));
      const body = el('div', 'aw-body'); dialog.append(header, body); overlay.append(dialog);
      overlay.addEventListener('click', event => { if (event.target === overlay) this.closeDialog(); });
      const keyHandler = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeDialog(); }
        if (event.key === 'Tab') {
          const nodes = [...dialog.querySelectorAll('button,input,textarea,select')].filter(n => !n.disabled && n.getClientRects().length);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      };
      overlay.addEventListener('keydown', keyHandler);
      document.body.append(overlay); this.overlay = overlay;
      this.stack?.push?.({ id: ID + '.dialog', action: () => this.closeDialog() });
      dialog.focus(); return body;
    }
    closeDialog(restoreFocus = true) {
      clearTimeout(this.previewTimer);
      if (!this.overlay) return;
      this.stack?.remove?.(ID + '.dialog'); this.overlay.remove(); this.overlay = null; this.renderOutline = null;
      if (restoreFocus) this.view?.focus?.();
    }
    openOutline() {
      this.flush(); const body = this.showDialog(this.t('章节目录'));
      if (!this.index) {
        body.append(el('p', '', this.t('请打开 TXT / Markdown 文稿，或在设置中启用其他文件类型。')), button(this.t('打开设置'), () => this.openSettings())); return;
      }
      const input = el('input'); input.type = 'search'; input.placeholder = this.t('搜索章节标题'); input.setAttribute('aria-label', this.t('搜索章节标题'));
      const summary = el('p', 'aw-help'), list = el('div', 'aw-list'); body.append(input, summary, list);
      this.renderOutline = () => {
        if (!this.index) return;
        list.replaceChildren();
        summary.textContent = this.t('{file} · {chapters} 章 · {count} 字', { file: this.file?.filename || this.t('当前文稿'), chapters: this.index.chapterCount, count: this.index.total });
        const query = input.value.trim().toLocaleLowerCase(), current = C.sectionAt(this.index, this.cursorRow());
        const fragment = document.createDocumentFragment(); let found = 0;
        for (const section of this.index.sections) {
          if (!this.sectionTitle(section).toLocaleLowerCase().includes(query)) continue;
          const item = button('', () => this.jump(section.row));
          item.setAttribute('aria-current', section === current ? 'true' : 'false');
          item.append(el('span', '', this.sectionTitle(section)), el('small', '', this.t('第 {row} 行 · {count} 字', { row: section.row + 1, count: section.count })));
          fragment.append(item); found++;
        }
        if (!found) fragment.append(el('p', '', this.t('没有匹配的章节。')));
        list.append(fragment);
      };
      input.addEventListener('input', this.renderOutline); this.renderOutline();
    }
    openSettings() {
      this.flush(); const body = this.showDialog(this.t('写作插件设置'));
      const form = el('form'); body.append(form);
      const labeled = (text, control) => { const label = el('label', '', text); label.append(control); form.append(label); return control; };
      const select = (items, value) => {
        const node = el('select'); for (const [id, text] of items) { const option = el('option', '', text); option.value = id; node.append(option); } node.value = value; return node;
      };
      const language = labeled(this.t('界面语言'), select([['auto',this.t('自动（跟随 Acode）')],['zh','中文'],['en','English']], this.settings.language));
      const format = labeled(this.t('标题识别方式'), select([['auto',this.t('自动识别（中文、英文、数字编号、Markdown）')],
        ['multi',this.t('多格式组合（可添加、停用和删除）')], ...Object.entries(C.PRESETS).map(([id,p]) => [id,this.t(p.label)]), ['template',this.t('自定义标题模板')], ['custom',this.t('自定义正则（高级）')]], this.settings.format));
      const rulePanel = el('div', 'aw-rules'), ruleList = el('div');
      const rules = this.settings.rules.map(rule => ({ ...rule }));
      const renderRules = () => {
        ruleList.replaceChildren();
        rules.forEach((rule, i) => {
          const row = el('div', 'aw-rule');
          const labelControl = (key, control) => { const label = el('label', '', this.t(key, { number: i + 1 })); label.append(control); row.append(label); };
          const enable = el('input'); enable.type = 'checkbox'; enable.checked = rule.enabled;
          labelControl('启用规则 {number}', enable);
          const kind = select([...Object.entries(C.PRESETS).map(([id,p]) => [id,this.t(p.label)]),
            ['template',this.t('自定义标题模板')], ['custom',this.t('自定义正则（高级）')]], rule.format);
          labelControl('规则 {number} 格式', kind);
          const value = el('textarea'); value.value = rule.value; value.spellcheck = false;
          labelControl('规则 {number} 内容', value);
          const sync = () => { rule.format = kind.value; rule.value = value.value; rule.enabled = enable.checked;
            value.parentElement.hidden = !['template','custom'].includes(rule.format); };
          for (const node of [enable,kind,value]) node.addEventListener('input', sync);
          row.append(button(this.t('删除规则 {number}', { number: i + 1 }), () => { rules.splice(i, 1); renderRules(); renderPreview(); }));
          sync(); ruleList.append(row);
        });
      };
      const addRule = button(this.t('添加标题格式'), () => { if (rules.length >= 32) return;
        rules.push({ format: 'template', value: '【{序号}】{标题}', enabled: true }); renderRules(); renderPreview(); });
      rulePanel.append(el('p', 'aw-help', this.t('最多 32 条；任一启用规则匹配即识别为章节。模板和正则可同时使用；正则一行一条。')), ruleList, addRule);
      form.append(rulePanel); renderRules();
      const template = el('input'); template.value = this.settings.template;
      labeled(this.t('标题模板'), template);
      const templateHelp = el('p', 'aw-help', this.t('例如：{序号}、{标题} 或 Chapter {number}: {title}。支持 {序号}/{标题} 和 {number}/{title}；英文序号支持数字、罗马数字、One 等，标题须独占一行。')); form.append(templateHelp);
      const regex = el('textarea'); regex.value = this.settings.custom; regex.spellcheck = false;
      labeled(this.t('标题正则：每行一条规则，不要填写 / 分隔符'), regex);
      const regexHelp = el('p', 'aw-help', this.t('对去掉首尾空白后的整行匹配。示例：第[一二三四五六七八九十0-9]+章.*\n序章|终章|番外.*\n请避免嵌套重复，例如 (a+)+，以免长文本匹配变慢。')); form.append(regexHelp);
      const mode = labeled(this.t('字数口径'), select([['nonspace',this.t('非空白字符（含标点，适合中文写作）')],['letters',this.t('仅文字和数字（不含标点、空白、符号）')]], this.settings.countMode));
      const checkbox = (text, value) => { const node = el('input'); node.type = 'checkbox'; node.checked = value; const label = el('label'); label.append(node, document.createTextNode(text)); form.append(label); return node; };
      const include = checkbox(this.t('章节和全文字数包含标题'), this.settings.includeHeading);
      const all = checkbox(this.t('对所有文本文件启用'), this.settings.allFiles);
      const extensions = el('input'); extensions.value = this.settings.extensions; labeled(this.t('启用的扩展名（逗号分隔）'), extensions);
      const preview = el('div', 'aw-preview'), error = el('p', 'aw-error'); error.setAttribute('role', 'alert'); form.append(preview, error);
      const draft = () => C.normalizeSettings({ language: language.value, format: format.value, template: template.value, custom: regex.value,
        rules, countMode: mode.value, includeHeading: include.checked, allFiles: all.checked, extensions: extensions.value });
      const renderPreview = () => {
        rulePanel.hidden = format.value !== 'multi'; addRule.disabled = rules.length >= 32;
        template.parentElement.hidden = templateHelp.hidden = format.value !== 'template';
        regex.parentElement.hidden = regexHelp.hidden = format.value !== 'custom';
        try {
          const s = draft(), index = C.buildIndex(this.readText(), s, C.compileMatcher(s));
          preview.textContent = this.t('当前文稿预览：{chapters} 个标题，{count} 字\n', { chapters: index.chapterCount, count: index.total }) +
            index.sections.filter(x => x.heading).slice(0, 6).map(x => this.t('第{row}行：{title}', { row: x.row + 1, title: x.title })).join('\n'); error.textContent = '';
          return true;
        } catch (e) { preview.textContent = this.t('规则尚不可用'); error.textContent = WriterI18n.error(this.language, e); return false; }
      };
      form.addEventListener('input', () => { clearTimeout(this.previewTimer); this.previewTimer = setTimeout(() => { if (this.overlay?.contains(form)) renderPreview(); }, 200); });
      const actions = el('div', 'aw-actions');
      const save = el('button', '', this.t('保存设置')); save.type = 'submit';
      actions.append(save, button(this.t('恢复默认'), () => {
        language.value = C.DEFAULTS.language; format.value = C.DEFAULTS.format; template.value = C.DEFAULTS.template; regex.value = C.DEFAULTS.custom;
        rules.splice(0, rules.length, ...C.DEFAULTS.rules.map(rule => ({ ...rule }))); renderRules();
        mode.value = C.DEFAULTS.countMode; include.checked = false; all.checked = false; extensions.value = C.DEFAULTS.extensions; renderPreview();
      })); form.append(actions);
      form.addEventListener('submit', event => {
        event.preventDefault(); clearTimeout(this.previewTimer);
        if (!renderPreview()) return;
        const s = draft();
        try { localStorage.setItem(STORE, JSON.stringify(s)); }
        catch (_) { error.textContent = this.t('无法保存设置，请检查 Acode 的本地存储是否可用。'); return; }
        this.settings = s; this.matcher = C.compileMatcher(s); this.closeDialog(); this.localize(); this.dirty = true; this.rebuild();
      }); renderPreview();
    }
    destroy() {
      this.disposed = true; clearTimeout(this.timer); clearInterval(this.watchdog); this.closeDialog(false);
      this.editorCleanup?.(); this.editorCleanup = null;
      for (const cleanup of this.cleanups.splice(0)) cleanup();
      for (const name of this.commandNames || []) this.commands?.removeCommand?.(name);
      this.bar?.remove(); this.style?.remove();
      this.view = this.file = this.session = this.index = this.cmRecord = null; this.dirtySince = null;
    }
  }
  if (window.acode) {
    const plugin = new WriterPlugin();
    acode.setPluginInit(ID, () => { try { plugin.init(); } catch (e) { plugin.destroy(); throw e; } });
    acode.setPluginUnmount(ID, () => plugin.destroy());
  }
})();
