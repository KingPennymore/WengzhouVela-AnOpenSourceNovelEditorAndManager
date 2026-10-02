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
      // Both languages share the same placeholder semantics, independent of UI language.
      if (part === '{number}' || part === '{序号}') return `(?:${EN_NUM}|[${NUM}]+)`;
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
