import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Keep offsets/newlines while ignoring comments. Quotes and function nesting prevent
// braces/semicolons in data URLs, strings or var() fallbacks from becoming declarations.
export function declarations(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const stack = [],
    rows = [];
  let start = 0,
    quote = '',
    depth = 0;
  const take = (end) => {
    const part = text.slice(start, end),
      m = /^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*$/.exec(part);
    if (!m || !stack.length) return;
    rows.push({
      selector: [...stack].reverse().find((s) => !s.startsWith('@')) || stack.at(-1),
      contexts: stack.filter((s) => s.startsWith('@')),
      property: m[1].toLowerCase(),
      value: m[2],
      line: text.slice(0, start + part.indexOf(m[1])).split('\n').length,
    });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '(') {
      depth++;
      continue;
    }
    if (c === ')') {
      depth--;
      continue;
    }
    if (depth) continue;
    if (c === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (c === ';') {
      take(i);
      start = i + 1;
    } else if (c === '}') {
      take(i);
      stack.pop();
      start = i + 1;
    }
  }
  return rows;
}
function withoutVariables(value) {
  let out = '';
  for (let i = 0; i < value.length;) {
    if (value.startsWith('var(', i)) {
      let depth = 1;
      i += 4;
      for (; i < value.length && depth; i++) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')') depth--;
      }
    } else out += value[i++];
  }
  return out.replace(/(['"])(?:\\.|(?!\1).)*?\1/g, '');
}
// This exact 88 dp / 22 px mark also appears in the Android and HarmonyOS native
// launch window. Changing its corner at the web handoff causes a visible jump.
export const literalExceptions = [
  {
    file: 'startup.css',
    selector: '.startup-brand svg',
    property: 'border-radius',
    value: '22px',
    reason: 'Native splash mark geometry must match the web mark during handoff.',
  },
];
export function violations(file, source) {
  return declarations(source).filter((row) => {
    if (
      !/^(?:font(?:-size)?|border-(?:(?:top|bottom|start|end)-(?:left|right|start|end)-)?radius)$/.test(
        row.property,
      )
    )
      return false;
    if (
      literalExceptions.some(
        (item) =>
          item.file === file &&
          item.selector === row.selector &&
          item.property === row.property &&
          item.value === row.value,
      )
    )
      return false;
    return /(?:\d*\.)?\d+(?:px|pt|pc|cm|mm|in|q)\b/i.test(
      withoutVariables(row.value).replace(/\b0(?:px|pt|pc|cm|mm|in|q)\b/g, ''),
    );
  });
}
test('web CSS typography and corners use tokens, relative values or the documented native mark', () => {
  const issues = readdirSync('web')
    .filter((name) => name.endsWith('.css'))
    .flatMap((name) =>
      violations(name, readFileSync('web/' + name, 'utf8')).map(
        (row) => `${name}:${row.line} ${row.selector} { ${row.property}: ${row.value} }`,
      ),
    );
  assert.deepEqual(issues, [], issues.join('\n'));
});
test('CSS token guard reports nested rules and exact locations, without treating strings as declarations', () => {
  const source =
    '/* font-size:9px */\n@media (pointer:coarse){\n.x{content:"font-size:9px;{}";font-size:11px;border-radius:3px}\n}';
  assert.deepEqual(
    violations('fixture.css', source).map(({ property, line, selector }) => ({
      property,
      line,
      selector,
    })),
    [
      { property: 'font-size', line: 3, selector: '.x' },
      { property: 'border-radius', line: 3, selector: '.x' },
    ],
  );
  assert.equal(
    violations('fixture.css', '.x{font-size:calc(1em + 2px);border-top-left-radius:4px}').length,
    2,
  );
});
test('CSS token guard accepts variable fallbacks, zero and relative typography/corners', () => {
  assert.deepEqual(
    violations(
      'fixture.css',
      '.x{font-size:var(--editor-font-size,16px);border-radius:50%;font-size:1em;font-size:0;border-radius:0 1em;font:var(--ui-font)/1.5 sans-serif}',
    ),
    [],
  );
  assert.equal(
    violations('fixture.css', '.startup-brand svg{border-radius:22px}').length,
    1,
    'native geometry exception cannot spread to other files',
  );
});
