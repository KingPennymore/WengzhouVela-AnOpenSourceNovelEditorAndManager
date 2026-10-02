import Writer from '../vendor/acode-writer/src/core.js';

export function chapterSettings(value={}) {
  value=value&&typeof value==='object'?value:{};
  const settings=Writer.normalizeSettings({...value,format:'auto'});
  let templates=Array.isArray(value.titleTemplates)?value.titleTemplates:[];
  templates=[...new Set(templates.filter(item=>typeof item==='string').map(item=>item.trim()).filter(Boolean))];
  if(templates.length>32)throw new Error('最多添加 32 个标题模板。');
  if(templates.some(item=>item.length>256))throw new Error('单个标题模板最多 256 字符。');
  return {...settings,titleTemplates:templates};
}
export function chapterMatcher(value) {
  const settings=chapterSettings(value),automatic=Writer.compileMatcher(settings);
  const templates=settings.titleTemplates.map(template=>Writer.compileMatcher({...settings,format:'template',template}));
  return line=>automatic(line)||templates.some(matches=>matches(line));
}
