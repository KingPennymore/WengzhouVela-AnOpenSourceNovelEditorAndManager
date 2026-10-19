import { taskpool } from '@kit.ArkTS';
import { fileIo as fs } from '@kit.CoreFileKit';
import { WorkspaceFiles } from './WorkspaceFiles';
import { encodeFileText } from './FileText';
interface SaveRequest { data: string; delta?: boolean; }
interface SaveHeader { version: number; documents: Object[]; }

export function lockWorkspace(gate: Int32Array): void {
  while (Atomics.compareExchange(gate, 0, 0, 1) !== 0) {
    if (Atomics.wait(gate, 0, 1, 30000) === 'timed-out') throw new Error('等待后台保存超时，请稍后重试。');
  }
}
export function unlockWorkspace(gate: Int32Array): void { Atomics.store(gate, 0, 0); Atomics.notify(gate, 0); }

function saveInBackground(filesDir: string, json: string, gate: Int32Array, epoch: number): string {
  lockWorkspace(gate);
  try {
    if (Atomics.load(gate, 1) !== epoch) return 'superseded';
    const request = JSON.parse(json) as SaveRequest, files = new WorkspaceFiles();
    files.prepareBackground(filesDir);
    if (request.delta === true) { files.saveDelta(request.data); return 'ok'; }
    const header = JSON.parse(request.data) as SaveHeader;
    if (header.version !== 1 || !Array.isArray(header.documents)) throw new Error('文稿数据无效。');
    files.mirror(request.data);
    const path = filesDir + '/workspace.json', temp = path + '.tmp', bytes = encodeFileText(request.data);
    const file = fs.openSync(temp, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try { let offset = 0; while (offset < bytes.byteLength) { const written = fs.writeSync(file.fd, bytes.buffer.slice(offset)); if (written <= 0) throw new Error('未能完整写入文稿。'); offset += written; } fs.fsyncSync(file.fd); }
    finally { fs.closeSync(file); }
    if (fs.accessSync(path)) fs.copyFileSync(path, path + '.bak');
    fs.renameSync(temp, path);
    try { files.collectStore(); } catch (_) { /* collect on the next save */ }
    return 'ok';
  } finally { unlockWorkspace(gate); }
}
export async function saveWorkspaceBackground(filesDir: string, json: string, gate: Int32Array, epoch: number): Promise<string> {
  return await taskpool.execute(saveInBackground, filesDir, json, gate, epoch) as string;
}
