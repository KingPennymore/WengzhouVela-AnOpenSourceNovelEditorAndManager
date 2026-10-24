import { spawnSync } from 'node:child_process';

const checks = [
  ['node_modules/typescript/bin/tsc', '-p', 'jsconfig.core.json'],
  [
    'node_modules/eslint/bin/eslint.js',
    'web/app-core',
    'tests/app-core*.mjs',
    'eslint.config.mjs',
    'scripts/check-core.mjs',
    '--max-warnings',
    '0',
  ],
  [
    'node_modules/prettier/bin/prettier.cjs',
    '--check',
    'web/app-core/**/*.mjs',
    'tests/app-core*.mjs',
    'eslint.config.mjs',
    'scripts/check-core.mjs',
    'jsconfig.core.json',
    '.prettierrc.json',
    'docs/adr/*.md',
  ],
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
