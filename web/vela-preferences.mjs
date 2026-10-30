// Optional v2/v3 preferences. No device credentials or implicit network consent.
import { say } from './i18n.mjs';
import { relativePath } from './project-contract.mjs';
import { normalizeFontName } from './app-core/system-fonts.mjs';
const fail = (path) => {
  throw Error(
    say(
      `${path} 配置无效，请检查字段类型与范围。`,
      `${path} is invalid. Check its type and range.`,
    ),
  );
};
const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
};
const bool = (value, key, path) => {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(path + '.' + key);
};
export function validatePreferences(value) {
  const editor = value.editor || {};
  for (const key of ['lineNumbers', 'autoNouns', 'highlightTerms', 'glossaryPanel'])
    bool(editor, key, 'editor');
  for (const key of ['marginLeft', 'marginRight'])
    if (
      editor[key] !== undefined &&
      (!Number.isFinite(editor[key]) || editor[key] < 0 || editor[key] > 120)
    )
      fail('editor.' + key);
  if (
    editor.fontFamily !== undefined &&
    (typeof editor.fontFamily !== 'string' ||
      normalizeFontName(editor.fontFamily) !== editor.fontFamily)
  )
    fail('editor.fontFamily');
  if (editor.snippets !== undefined) {
    if (!Array.isArray(editor.snippets) || editor.snippets.length > 256) fail('editor.snippets');
    for (const item of editor.snippets)
      if (
        !item ||
        typeof item.label !== 'string' ||
        !item.label.trim() ||
        item.label.length > 80 ||
        typeof item.text !== 'string' ||
        item.text.length > 8192
      )
        fail('editor.snippets');
  }
  const chapters = value.chapters || {};
  bool(chapters, 'includeHeading', 'chapters');
  if (chapters.countMode !== undefined && !['nonspace', 'letters'].includes(chapters.countMode))
    fail('chapters.countMode');
  if (value.ai !== undefined) {
    object(value.ai, 'ai');
    for (const key of Object.keys(value.ai))
      if (!['suggestions', 'models', 'targets'].includes(key)) fail('ai.' + key);
    bool(value.ai, 'suggestions', 'ai');
    if (value.ai.models !== undefined) {
      object(value.ai.models, 'ai.models');
      for (const [key, model] of Object.entries(value.ai.models))
        if (
          !['extract', 'suggest'].includes(key) ||
          typeof model !== 'string' ||
          !/^(?!.*\.\.)[A-Za-z0-9._:/-]{1,128}$/.test(model)
        )
          fail('ai.models.' + key);
    }
    if (value.ai.targets !== undefined) {
      object(value.ai.targets, 'ai.targets');
      for (const [key, path] of Object.entries(value.ai.targets)) {
        const suffix = {
          glossary: /\.(gly|glossary)$/i,
          outline: /\.(pcs|process)$/i,
          places: /\.(vlmp|velamap)$/i,
        }[key];
        if (
          typeof path !== 'string' ||
          !suffix ||
          relativePath(path) !== path ||
          !suffix.test(path)
        )
          fail('ai.targets.' + key);
      }
    }
  }
}
