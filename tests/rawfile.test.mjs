import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { rawfileProblems, resourceDir } from '../scripts/frontend-state.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vela-rawfile-'));
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('vela-rawfile-'));
    rmSync(root, { recursive: true, force: true });
  });
  const directory = join(root, resourceDir), outputs = {};
  const write = (name, text, recorded = true) => {
    mkdirSync(join(directory, name, '..'), { recursive: true });
    writeFileSync(join(directory, name), text);
    if (recorded) outputs[name] = createHash('sha256').update(text).digest('hex');
  };
  for (const name of ['index.html', 'startup.js', 'startup.css', 'app.js', 'style.css', 'file-manager.css', 'ui.css', 'design.css', 'refinement.css', 'licenses.js', 'version.json', 'noun-worker.js', 'map-simplify-worker.js']) write(name, '');
  write('app.js', 'import "./chunks/shared.js"; import("./chunks/lazy.js");');
  write('chunks/shared.js', 'export {x} from "./nested.js";');
  write('chunks/nested.js', 'import "../app.js"; export const x = 1;');
  write('chunks/lazy.js', 'import("./nested.js");');
  const manifest = (value = { format: 1, outputs }) => write('build-manifest.json', JSON.stringify(value), false);
  manifest();
  return { root, directory, outputs, write, manifest };
}

test('rawfile：完整清单、静态/动态及循环分包引用通过', t => {
  const { root } = fixture(t);
  assert.deepEqual(rawfileProblems(root), []);
});

test('rawfile：缺失分包和同长度内容篡改提供具体文件提示', t => {
  const { root, directory, write } = fixture(t);
  rmSync(join(directory, 'chunks/lazy.js'));
  write('startup.css', 'corrupt', false);
  write('chunks/nested.js', 'import "../app.js"; export const x = 2;', false);
  const errors = rawfileProblems(root).join('\n');
  assert.match(errors, /文件缺失或无法读取：chunks\/lazy.js/);
  assert.match(errors, /引用的分包文件缺失：app.js → chunks\/lazy.js/);
  assert.match(errors, /SHA-256 不一致：startup.css/);
  assert.match(errors, /SHA-256 不一致：chunks\/nested.js/);
});

test('rawfile：已存在但未登记的间接分包也不能通过', t => {
  const { root, outputs, manifest } = fixture(t);
  delete outputs['chunks/nested.js'];
  manifest();
  assert.match(rawfileProblems(root).join('\n'), /分包未列入构建清单：chunks\/shared.js → chunks\/nested.js/);
});

test('rawfile：清单缺失、JSON 损坏、格式错误、非法路径与哈希均明确失败', t => {
  const { root, directory, write, outputs, manifest } = fixture(t);
  rmSync(join(directory, 'build-manifest.json'));
  assert.match(rawfileProblems(root)[0], /无法读取构建清单/);
  write('build-manifest.json', '{', false);
  assert.match(rawfileProblems(root)[0], /无法读取构建清单/);
  for (const value of [null, { format: 2, outputs }, { format: 1, outputs: [] }]) {
    manifest(value);
    assert.match(rawfileProblems(root)[0], /构建清单格式无效/);
  }
  delete outputs['index.html'];
  outputs['../outside.js'] = 'a'.repeat(64);
  outputs['C:/outside.js'] = 'a'.repeat(64);
  outputs['app.js'] = 'invalid';
  manifest();
  const errors = rawfileProblems(root).join('\n');
  assert.match(errors, /缺少必需文件：index.html/);
  assert.match(errors, /非法路径：\.\.\/outside.js/);
  assert.match(errors, /非法路径：C:\/outside.js/);
  assert.match(errors, /SHA-256 格式无效：app.js/);
});
