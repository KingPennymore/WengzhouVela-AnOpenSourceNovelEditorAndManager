import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute = promisify(execFile);

/** Read family names, including per-user installations, without exposing font file paths. */
export async function listSystemFonts() {
  if (process.platform !== 'win32') return [];
  const program = [
    '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)',
    'Add-Type -AssemblyName System.Drawing',
    '$fonts=[System.Drawing.Text.InstalledFontCollection]::new()',
    'try { @($fonts.Families | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress } finally { $fonts.Dispose() }',
  ].join(';');
  const {stdout} = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', program], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
  return [...new Set((Array.isArray(parsed) ? parsed : [parsed]).filter((name) => typeof name === 'string'))];
}
