/* Acode Writer v1.0.4 - MIT */
(() => {
/* 纯文本核心：没有 Acode / DOM 依赖，可在 Node.js 中测试。 */
const WriterCore = (() => {
  const NUM = '零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟0-9０-９';
  const EN_NUM = '(?:[0-9]+|[ivxlcdm]+|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)';
  const PRESETS = {
    chinese: { label: '一、标题', pattern: `[${NUM}]+[、．.]\\s*.+` },
    chapter: { label: '第一章 标题', pattern: `第[${NUM}]+[章节卷回部篇](?:\\s*.*)` },
    markdown: { label: '# Markdown 标题', pattern: '#{1,6}\\s+\\S.*' },
    english: { label: 'Chapter 1 / Chapter One / Chapter IV', pattern: `(?:chapter|part|book)\\s+${EN_NUM}(?:\\s*[:.：—–-]\\s*.*|\\s+.+)?`, flags: 'iu' },
    number: { label: '1. 标题 / 1、标题', pattern: '[0-9０-９]+[.．、]\\s*.+' }
  };
  const DEFAULTS = Object.freeze({
    rules: Object.freeze([{ format: 'chinese', value: '', enabled: true }, { format: 'english', value: '', enabled: true }].map(Object.freeze)),
    language: 'auto', format: 'auto', template: '{序号}、{标题}', custom: `[${NUM}]+、\\s*.+`,
    countMode: 'nonspace', includeHeading: false, extensions: 'txt,md,markdown',
    allFiles: false
  });
  function normalizeSettings(value) {
    const s = { ...DEFAULTS, ...(value && typeof value === 'object' ? value : {}) };
    if (!['auto', 'zh', 'en'].includes(s.language)) s.language = 'auto';
    if (!['auto', 'multi', 'template', 'custom', ...Object.keys(PRESETS)].includes(s.format)) s.format = 'auto';
    if (!['nonspace', 'letters'].includes(s.countMode)) s.countMode = 'nonspace';
    for (const key of ['template', 'custom', 'extensions']) if (typeof s[key] !== 'string') s[key] = DEFAULTS[key];
    for (const key of ['includeHeading', 'allFiles']) s[key] = s[key] === true;
    s.rules = (Array.isArray(s.rules) ? s.rules : DEFAULTS.rules).map(rule => ({
      format: ['template', 'custom', ...Object.keys(PRESETS)].includes(rule?.format) ? rule.format : 'chinese',
      value: typeof rule?.value === 'string' ? rule.value : '', enabled: rule?.enabled !== false
    }));
    return s;
  }
  function templatePattern(template) {
    if (!/\{(?:序号|标题|number|title)\}/.test(template)) throw ruleError('template', '模板需包含 {序号} 或 {标题}。');
    return template.split(/(\{序号\}|\{标题\}|\{number\}|\{title\})/).map(part => {
      if (part === '{number}') return EN_NUM;
      if (part === '{序号}') return `[${NUM}]+`;
      if (part === '{标题}' || part === '{title}') return '.+';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    }).join('');
  }
  function ruleError(code, message, detail = '') {
    const error = new Error(message); error.code = code; error.detail = detail; return error;
  }
  function compileMatcher(settings) {
    const s = normalizeSettings(settings);
    if (s.format === 'multi') {
      if (s.rules.length > 32) throw ruleError('rulesLimit', '最多添加 32 条标题格式。');
      const matchers = [];
      for (const [i, rule] of s.rules.entries()) {
        if (!rule.enabled) continue;
        try {
          matchers.push(compileMatcher({ ...s, format: rule.format, template: rule.value, custom: rule.value }));
        } catch (error) { error.ruleNumber = i + 1; throw error; }
      }
      if (!matchers.length) throw ruleError('noActive', '请至少启用一种标题格式。');
      return line => matchers.some(matcher => matcher(line));
    }
    const patterns = s.format === 'auto' ? Object.values(PRESETS).map(p => p.pattern)
      : s.format === 'template' ? [templatePattern(s.template)]
      : s.format === 'custom' ? s.custom.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
      : [PRESETS[s.format].pattern];
    if (!patterns.length) throw ruleError('empty', '请至少输入一条标题规则。');
    if (patterns.some(p => p.length > 2000)) throw ruleError('long', '单条规则不能超过 2000 字符。');
    let regexes;
    try { regexes = patterns.map(p => new RegExp(`^(?:${p})$`,
      s.format === 'template' ? 'iu' : ['auto', 'english'].includes(s.format) ? Object.values(PRESETS).find(x => x.pattern === p)?.flags || 'u' : 'u')); }
    catch (error) { throw ruleError('regex', '标题正则无效：' + error.message, error.message); }
    if (regexes.some(re => re.test(''))) throw ruleError('blank', '标题规则不能匹配空行。');
    return line => {
      const title = line.trim();
      return title.length > 0 && regexes.some(re => re.test(title));
    };
  }
  const letters = /[\p{L}\p{N}]/u;
  const whitespace = /\s/u;
  function countText(text, mode = 'nonspace') {
    let result = 0;
    // 按 Unicode 码点统计：一个 emoji 或扩展汉字不会被算成两个 UTF-16 单元。
    for (const char of text) if (mode === 'letters' ? letters.test(char) : !whitespace.test(char)) result++;
    return result;
  }
  function buildIndex(text, settings = DEFAULTS, matcher = compileMatcher(settings)) {
    const s = normalizeSettings(settings);
    const lines = text.split(/\r\n|\n|\r/);
    const prefix = [0], headings = [];
    lines.forEach((line, row) => {
      prefix.push(prefix[row] + countText(line, s.countMode));
      if (matcher(line)) headings.push({ title: line.trim(), row });
    });
    const sections = [];
    if (!headings.length) sections.push({ title: '全文（未识别章节）', kind: 'document', row: 0, heading: false });
    else {
      if (headings[0].row > 0) sections.push({ title: '章前内容', kind: 'preamble', row: 0, heading: false });
      sections.push(...headings.map(h => ({ ...h, heading: true })));
    }
    sections.forEach((section, i) => {
      section.endRow = sections[i + 1]?.row ?? lines.length;
      section.bodyRow = section.heading && !s.includeHeading ? section.row + 1 : section.row;
      section.count = prefix[section.endRow] - prefix[section.bodyRow];
    });
    const headingCount = headings.reduce((sum, h) => sum + prefix[h.row + 1] - prefix[h.row], 0);
    return { sections, chapterCount: headings.length, lineCount: lines.length,
      total: prefix[lines.length] - (s.includeHeading ? 0 : headingCount) };
  }
  function sectionAt(index, row) {
    let lo = 0, hi = index.sections.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (index.sections[mid].row <= row) lo = mid; else hi = mid - 1;
    }
    return index.sections[lo];
  }
  function supportsFile(file, settings) {
    if (!file || file.type === 'custom') return false;
    if (settings.allFiles) return true;
    const name = file.filename || file.name || '';
    if (!name.includes('.')) return true;
    return settings.extensions.toLowerCase().split(/[\s,，]+/).map(x => x.replace(/^\./, ''))
      .includes(name.split('.').pop().toLowerCase());
  }
  return { PRESETS, DEFAULTS, normalizeSettings, compileMatcher, templatePattern, countText, buildIndex, sectionAt, supportsFile };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WriterCore;

/* UI translations. Manuscript headings are never translated. */
const WriterI18n = (() => {
  const EN = {
  "多格式组合（可添加、停用和删除）": "Multiple formats (add, disable or remove)",
  "添加标题格式": "Add heading format", "启用规则 {number}": "Enable rule {number}",
  "规则 {number} 格式": "Rule {number} format", "规则 {number} 内容": "Rule {number} content",
  "删除规则 {number}": "Remove rule {number}",
  "最多 32 条；任一启用规则匹配即识别为章节。模板和正则可同时使用；正则一行一条。": "Up to 32 rules. A match by any enabled rule creates a chapter. Mix presets, templates and regex rules; use one regex per line.",
  "第 {number} 条规则：": "Rule {number}: ",

  "{count}字": "{count} chars",
  "上一章": "Previous chapter",
  "下一章": "Next chapter",
  "正在识别…": "Scanning…",
  "打开章节目录": "Open chapter outline",
  "写作插件设置": "Writer settings",
  "写作：章节目录": "Writer: Chapter outline",
  "写作：设置标题和字数规则": "Writer: Heading and character count settings",
  "写作：上一章": "Writer: Previous chapter",
  "写作：下一章": "Writer: Next chapter",
  "写作：此文件未启用": "Writer: Disabled for this file",
  "写作：请打开文本": "Writer: Open a text file",
  "全文（未识别章节）": "Document (no chapters found)",
  "章前内容": "Preamble",
  " · {count}字": " · {count} chars",
  "全文 {count}字": "Total {count}",
  "当前章节：{title}\n本章 {count} 字 · 点击打开目录": "Current chapter: {title}\n{count} chars · Click to open outline",
  "关闭": "Close",
  "章节目录": "Chapter outline",
  "请打开 TXT / Markdown 文稿，或在设置中启用其他文件类型。": "Open a TXT / Markdown document, or enable other file types in settings.",
  "打开设置": "Open settings",
  "搜索章节标题": "Search chapter titles",
  "当前文稿": "Current document",
  "{file} · {chapters} 章 · {count} 字": "{file} · {chapters} chapters · {count} chars",
  "第 {row} 行 · {count} 字": "Line {row} · {count} chars",
  "没有匹配的章节。": "No matching chapters.",
  "界面语言": "Interface language",
  "自动（跟随 Acode）": "Auto (follow Acode)",
  "中文": "中文",
  "English": "English",
  "标题识别方式": "Heading format",
  "自动识别（中文、英文、数字编号、Markdown）": "Auto (Chinese, English, numbered, Markdown)",
  "一、标题": "Chinese numbering: 一、Title",
  "第一章 标题": "Chinese chapter: 第一章 Title",
  "# Markdown 标题": "# Markdown heading",
  "1. 标题 / 1、标题": "1. Title / 1、Title",
  "自定义标题模板": "Custom heading template",
  "自定义正则（高级）": "Custom regex (advanced)",
  "标题模板": "Heading template",
  "例如：{序号}、{标题} 或 Chapter {number}: {title}。支持 {序号}/{标题} 和 {number}/{title}；英文序号支持数字、罗马数字、One 等，标题须独占一行。": "Examples: Chapter {number}: {title} or 第{序号}章 {标题}. Use {number}/{title} or {序号}/{标题}. English numbers support digits, Roman numerals and One, Two, etc. Headings must occupy a full line.",
  "标题正则：每行一条规则，不要填写 / 分隔符": "Heading regex: one rule per line, without / delimiters",
  "对去掉首尾空白后的整行匹配。示例：第[一二三四五六七八九十0-9]+章.*\n序章|终章|番外.*\n请避免嵌套重复，例如 (a+)+，以免长文本匹配变慢。": "Matches the entire trimmed line (case-sensitive). Examples: [Cc]hapter [0-9]+.*\nPrologue|Epilogue\nAvoid nested repetitions such as (a+)+, which can be slow on long text.",
  "字数口径": "Character counting",
  "非空白字符（含标点，适合中文写作）": "Non-whitespace characters (including punctuation)",
  "仅文字和数字（不含标点、空白、符号）": "Letters and digits only (no punctuation, whitespace or symbols)",
  "章节和全文字数包含标题": "Include headings in chapter and total counts",
  "对所有文本文件启用": "Enable for all text files",
  "启用的扩展名（逗号分隔）": "Enabled extensions (comma-separated)",
  "当前文稿预览：{chapters} 个标题，{count} 字\n": "Document preview: {chapters} headings, {count} chars\n",
  "第{row}行：{title}": "Line {row}: {title}",
  "规则尚不可用": "Rule unavailable",
  "保存设置": "Save settings",
  "恢复默认": "Reset defaults",
  "无法保存设置，请检查 Acode 的本地存储是否可用。": "Unable to save settings. Check that Acode local storage is available.",
  "Acode 编辑器尚未就绪。": "The Acode editor is not ready.",
  "此 Acode 的 CodeMirror 插件接口不完整，请更新 Acode。": "This Acode version lacks the required CodeMirror plugin API. Please update Acode."
};
  function resolve(setting, hostLanguage) {
    if (setting === 'zh' || setting === 'en') return setting;
    return /^zh(?:[-_]|$)/i.test(hostLanguage || 'zh') ? 'zh' : 'en';
  }
  function translate(language, key, values = {}) {
    const message = language === 'en' ? EN[key] ?? key : key;
    return message.replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
  }
  function error(language, value) {
    const prefix = value.ruleNumber ? translate(language, '第 {number} 条规则：', { number: value.ruleNumber }) : '';
    if (language !== 'en') return prefix + value.message;
    const errors = {
      rulesLimit: 'Add no more than 32 heading formats.', noActive: 'Enable at least one heading format.',
      template: 'The template must contain {number} or {title} (Chinese placeholders also work).',
      empty: 'Enter at least one heading rule.', long: 'Each rule must be no more than 2000 characters.',
      regex: 'Invalid heading regex: ' + (value.detail || ''), blank: 'Heading rules must not match an empty line.'
    };
    return prefix + (errors[value.code] || value.message);
  }
  return { resolve, translate, error };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WriterI18n;

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

})();
