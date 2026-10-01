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
