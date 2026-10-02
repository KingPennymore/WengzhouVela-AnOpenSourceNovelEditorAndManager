import { util } from '@kit.ArkTS';

export function encodeFileText(text: string): Uint8Array {
  if (typeof text !== 'string') throw new Error('待保存的文本无效。');
  // Some HarmonyOS runtimes return undefined when encoding an empty string.
  if (text.length === 0) return new Uint8Array(0);
  const bytes = new util.TextEncoder().encodeInto(text);
  if (!bytes || bytes.byteLength === 0) throw new Error('文本编码失败，原文件已保留。');
  return bytes;
}

export function decodeFileText(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '';
  let encoding = 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
  else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
  let text: string;
  try { text = util.TextDecoder.create(encoding, { fatal: true }).decodeToString(bytes); }
  catch (_) {
    if (encoding !== 'utf-8') throw new Error('无法读取此文本编码。');
    text = util.TextDecoder.create('gb18030', { fatal: true }).decodeToString(bytes);
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error('此文件包含二进制内容，不能作为文本打开。');
  return text.replace(/^\uFEFF/, '');
}
export function decodedFileName(name: string): string {
  try { return decodeURIComponent(name); } catch (_) { return name; }
}
