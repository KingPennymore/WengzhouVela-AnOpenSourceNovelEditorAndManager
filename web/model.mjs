export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
export function newDocument(name = '未命名文稿.md', text = '') {
  return { id: crypto.randomUUID(), name, text, updatedAt: Date.now(), remote: null };
}
export function validateWorkspace(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.documents)) throw new Error('文稿数据格式不正确，原文件已保留。');
  const ids = new Set();
  for (const d of value.documents) {
    if (!d || typeof d.id !== 'string' || ids.has(d.id) || typeof d.name !== 'string' || typeof d.text !== 'string' || !Number.isFinite(d.updatedAt)) throw new Error('文稿数据损坏，原文件已保留。');
    ids.add(d.id);
    if (d.remote && (typeof d.remote.repo !== 'string' || typeof d.remote.path !== 'string' || typeof d.remote.branch !== 'string' || typeof d.remote.sha !== 'string')) throw new Error('仓库关联数据损坏。');
  }
  if (!ids.has(value.activeId)) value.activeId = value.documents[0]?.id || null;
  value.openIds = Array.isArray(value.openIds) ? [...new Set(value.openIds.filter(id=>ids.has(id)))] : value.documents.map(d=>d.id);
  return value;
}
export function chapterPosition(text, index, cursor, edge) {
  // The Writer index uses zero-based rows and an exclusive endRow.
  const lines = text.split('\n');
  const row = text.slice(0, Math.max(0, Math.min(cursor, text.length))).split('\n').length - 1;
  let section = index.sections[0];
  for (const item of index.sections) { if (item.row > row) break; section = item; }
  if (!section) return edge === 'top' ? 0 : text.length;
  const offsets = [0];
  for (let i = 0; i < lines.length - 1; i++) offsets.push(offsets[i] + lines[i].length + 1);
  if (edge === 'top') return offsets[section.row] ?? 0;
  const endRow = Math.min(section.endRow - 1, lines.length - 1);
  return offsets[endRow] + lines[endRow].length;
}
export function normalizeText(text) { return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
export function fileName(value) {
  const name = value.trim();
  if (!name || /[\\/\x00-\x1f]/.test(name) || name.length > 160) throw new Error('请输入有效文件名（不含斜杠，最多 160 字符）。');
  return /\.[^.]+$/.test(name) ? name : name + '.md';
}
export function fileKind(name) { return /\.vela$/i.test(name)?'VELA':/\.csv$/i.test(name)?'CSV':/\.html?$/i.test(name)?'HTML':/\.(md|markdown|mdown|mkd)$/i.test(name)?'MD':'TXT'; }
export function documentKind(doc){return ['TXT','MD','HTML','CSV','VELA'].includes(doc?.kind)?doc.kind:fileKind(doc?.name||'');}
export function repoPath(value) {
  const path = value.trim();
  if (!path || path.startsWith('/') || /[\\\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('请填写有效的仓库相对路径，例如 chapters/第一章.md。');
  return path;
}
export function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}
export function decodeContent(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
