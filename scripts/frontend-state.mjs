import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const resourceDir = 'entry/src/main/resources/rawfile/web';
const manifestName = 'build-manifest.json';
const required = ['index.html', 'startup.js', 'startup.css', 'app.js', 'style.css', 'editor.css', 'licenses.js', 'version.json', 'noun-worker.js', 'map-simplify-worker.js'];

function filesIn(root, directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(root, relative) : entry.isFile() ? [relative] : [];
  });
}

function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function sourceDigest(root) {
  const inputs = [
    ...filesIn(root, 'web'), ...filesIn(root,'vendor/jieba'), ...filesIn(root, 'vendor/acode/src/cm'),
    'vendor/acode/LICENSE', 'vendor/acode-writer/src/core.js', 'vendor/acode-writer/LICENSE',
    'windows/git-host.mjs', 'package.json', 'package-lock.json', 'scripts/build.mjs', 'scripts/build-guide.mjs','docs/USER-GUIDE.md', 'scripts/frontend-state.mjs','scripts/tex-assets.mjs','scripts/package-ebook-component.mjs',...filesIn(root,'components'),...filesIn(root,'vendor/wasmtex')
  ].sort();
  const hash = createHash('sha256');
  for (const file of inputs) hash.update(`${file}\0${digest(join(root, file))}\n`);
  return hash.digest('hex');
}

export function recordBundle(root) {
  const outputs = {};
  for (const file of filesIn(root, resourceDir).sort()) {
    const relative = file.slice(resourceDir.length + 1);
    if (relative !== manifestName) outputs[relative] = digest(join(root, file));
  }
  for (const file of required) if (!outputs[file]) throw new Error(`缺少编辑器资源：${file}`);
  writeFileSync(join(root, resourceDir, manifestName), JSON.stringify({ format: 1, source: sourceDigest(root), outputs }, null, 2));
}

// Check the generated files independently of the source tree (also useful for source archives).
export function rawfileProblems(root) {
  const directory = join(root, resourceDir), problems = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(directory, manifestName), 'utf8'));
  } catch (error) {
    return [`无法读取构建清单 ${resourceDir}/${manifestName}：${error.message}`];
  }
  if (manifest?.format !== 1 || !manifest.outputs || typeof manifest.outputs !== 'object' || Array.isArray(manifest.outputs)) {
    return ['构建清单格式无效：需要 format: 1 和 outputs 文件哈希表。'];
  }
  const safe = file => file && !file.includes('\\') && !file.includes(':') && !file.includes('\0') &&
    !file.split('/').some(part => !part || part === '.' || part === '..');
  for (const file of required) if (!Object.hasOwn(manifest.outputs, file)) problems.push(`构建清单缺少必需文件：${file}`);
  for (const [file, hash] of Object.entries(manifest.outputs)) {
    if (!safe(file)) { problems.push(`构建清单包含非法路径：${file}`); continue; }
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) { problems.push(`文件 SHA-256 格式无效：${file}`); continue; }
    try {
      if (digest(join(directory, file)) !== hash) problems.push(`文件 SHA-256 不一致：${file}`);
    } catch (error) {
      problems.push(`文件缺失或无法读取：${file}（${error.code || error.message}）`);
    }
  }
  // esbuild emits literal relative imports. Follow both static and dynamic imports,
  // including shared chunks reached through other chunks, even if omitted from the manifest.
  const queue = ['app.js'], visited = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    let source;
    try { source = readFileSync(join(directory, file), 'utf8'); }
    catch { problems.push(`无法读取分包模块：${file}`); continue; }
    for (const match of source.matchAll(/(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s*)["'](\.\.?\/[^"'?#]+\.m?js)(?:[?#][^"']*)?["']/g)) {
      const target = posix.normalize(posix.join(posix.dirname(file), match[1]));
      if (!safe(target)) { problems.push(`模块引用越出资源目录：${file} → ${match[1]}`); continue; }
      if (!Object.hasOwn(manifest.outputs, target)) problems.push(`引用的分包未列入构建清单：${file} → ${target}`);
      if (!existsSync(join(directory, target))) problems.push(`引用的分包文件缺失：${file} → ${target}`);
      else queue.push(target);
    }
  }
  return problems;
}

export function bundleIsCurrent(root, { flavor } = {}) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, resourceDir, manifestName), 'utf8'));
    if (manifest.format !== 1 || manifest.source !== sourceDigest(root)) return false;
    if (flavor && JSON.parse(readFileSync(join(root, resourceDir, 'version.json'), 'utf8')).flavor !== flavor) return false;
    return rawfileProblems(root).length === 0;
  } catch {
    return false;
  }
}
