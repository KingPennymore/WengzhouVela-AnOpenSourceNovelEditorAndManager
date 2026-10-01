import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { hvigor } from '@ohos/hvigor';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

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
});

export default { system: hapTasks, plugins: [] };
