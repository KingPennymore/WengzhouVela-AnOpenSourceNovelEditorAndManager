import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const resourceDir = 'entry/src/main/resources/rawfile/web';
const manifestName = 'build-manifest.json';
const required = ['index.html', 'app.js', 'style.css', 'file-manager.css', 'licenses.js', 'version.json'];

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
    ...filesIn(root, 'web'), ...filesIn(root, 'vendor/acode/src/cm'),
    'vendor/acode/LICENSE', 'vendor/acode-writer/src/core.js', 'vendor/acode-writer/LICENSE',
    'package.json', 'package-lock.json', 'scripts/build.mjs', 'scripts/frontend-state.mjs','scripts/tex-assets.mjs',...filesIn(root,'vendor/wasmtex')
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

export function bundleIsCurrent(root) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, resourceDir, manifestName), 'utf8'));
    if (manifest.format !== 1 || manifest.source !== sourceDigest(root)) return false;
    if (!required.every(file => manifest.outputs[file])) return false;
    return Object.entries(manifest.outputs).every(([file, hash]) => {
      if (file.split('/').some(part => part === '..') || file.includes('\\') || file.startsWith('/')) return false;
      const absolute = join(root, resourceDir, file);
      return existsSync(absolute) && digest(absolute) === hash;
    });
  } catch {
    return false;
  }
}
