import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundleIsCurrent } from './frontend-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!bundleIsCurrent(root)) {
  if (!existsSync(resolve(root, 'node_modules/esbuild/package.json'))) {
    console.error('编辑器资源缺失或与源码不一致。请在工程根目录执行 npm.cmd ci，然后重新构建；DevEco 会自动打包编辑器。完整发行源码包已包含可直接构建的资源。');
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!bundleIsCurrent(root)) throw new Error('编辑器打包后资源校验失败。');
}
console.log('文舟编辑器资源检查通过');
