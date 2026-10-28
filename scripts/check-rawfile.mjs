import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawfileProblems } from './frontend-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = rawfileProblems(root);
if (problems.length) {
  console.error('鸿蒙 rawfile/web 构建产物校验失败：\n' + problems.map(problem => '- ' + problem).join('\n'));
  console.error('请在工程根目录运行 npm run build（完整版）或 npm run build:lite（轻量版）重新生成完整资源。');
  process.exitCode = 1;
} else {
  console.log('鸿蒙 rawfile/web 校验通过：清单文件 SHA-256 及 app.js 的全部分包引用一致。');
}
