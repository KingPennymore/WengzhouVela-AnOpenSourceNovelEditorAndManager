import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { hvigor } from '@ohos/hvigor';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { copyFileSync, readFileSync } from 'node:fs';

hvigor.nodesEvaluated(() => {
  const entry = hvigor.getNodeByName('entry');
  if (!entry) throw new Error('找不到 entry 模块。');
  const root = resolve(entry.getNodeDir().getPath(), '..');
  entry.registerTask({
    name: 'PrepareEditor',
    postDependencies: ['default@PreBuild'],
    run: () => {
      const result = spawnSync(process.execPath, [resolve(root, 'scripts/prepare-editor.mjs')], {
        cwd: root, stdio: 'inherit'
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error('编辑器资源准备失败，请查看上方提示。');
    }
  });
  entry.registerTask({
    name: 'PreserveLauncherIcon',
    dependencies: ['default@CompileResource'],
    postDependencies: ['default@ProcessCompiledResources'],
    run: () => {
      // Restool resolves layer IDs, but also downsamples PNGs and changes alpha.
      // Preserve the original pixels before packing and signing the HAP.
      const source = resolve(root, 'AppScope/resources/base/media');
      const compiled = resolve(entry.getNodeDir().getPath(), 'build/default/intermediates/res/default/resources/base/media');
      for (const name of ['app_icon_background.png', 'app_icon_foreground.png']) {
        const file = resolve(source, name);
        const png = readFileSync(file);
        if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
            png.readUInt32BE(16) !== 1024 || png.readUInt32BE(20) !== 1024) {
          throw new Error(`图标必须是 1024 × 1024 PNG：${name}`);
        }
        const target = resolve(compiled, name);
        if (!png.equals(readFileSync(target))) copyFileSync(file, target);
      }
    }
  });
});

export default { system: hapTasks, plugins: [] };
