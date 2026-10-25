import { repoPath, MAX_TEXT_BYTES } from './model.mjs';
import { dependencyPaths } from './sync-plan.mjs';
import { syncBlobCache } from './sync-blob-cache.mjs';

/** Read one immutable remote snapshot; workspace writes remain a separate reviewed step. */
export async function pullRepository(
  client,
  repo,
  branch,
  {
    signal,
    onProgress = () => {},
    selection = null,
    includeDependencies = false,
    metadataOnly = false,
    cache = syncBlobCache,
  } = {},
) {
  if (selection !== null) {
    if (!Array.isArray(selection) || !selection.length || selection.length > 5000)
      throw new Error('请选择 1–5000 个文件或文件夹。');
    selection = [...new Set(selection.map(repoPath))];
  }
  const cancelled = () => {
    if (signal?.aborted) throw new Error('已取消拉取，工作区未修改。');
  };
  const base = client.base(repo);
  cancelled();
  const ref = await client.request(`${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  cancelled();
  const commit = await client.request(`${base}/git/commits/${ref.object.sha}`);
  cancelled();
  const tree = await client.request(`${base}/git/trees/${commit.tree.sha}?recursive=1`);
  cancelled();
  let entries = tree.tree;
  if (tree.truncated) {
    entries = [];
    const queue = [{ sha: commit.tree.sha, prefix: '' }];
    while (queue.length) {
      cancelled();
      const { sha, prefix } = queue.shift(),
        part = await client.request(`${base}/git/trees/${sha}`);
      cancelled();
      if (part.truncated) throw new Error('GitHub 目录列表不完整，工作区未修改。');
      for (const entry of part.tree) {
        const path = prefix + entry.path;
        entries.push({ ...entry, path });
        if (entry.type === 'tree') queue.push({ sha: entry.sha, prefix: path + '/' });
      }
      if (entries.length > 5000) throw new Error('仓库超过 5000 个文件与目录，工作区未修改。');
    }
  }
  if (!Array.isArray(entries) || entries.length > 5000)
    throw new Error('仓库目录无效或超过 5000 项，工作区未修改。');
  const completeEntries = entries;
  if (selection) {
    for (const path of selection)
      if (!entries.some((entry) => entry.path === path))
        throw new Error('选中的路径已不存在：' + path);
    entries = entries.filter((entry) =>
      selection.some((path) => entry.path === path || entry.path.startsWith(path + '/')),
    );
  }
  let total = 0;
  const paths = new Set(),
    folders = [],
    blobs = [];
  for (const entry of entries) {
    repoPath(entry.path);
    if (paths.has(entry.path)) throw new Error('仓库存在重复路径。');
    paths.add(entry.path);
    if (entry.type === 'tree') {
      folders.push(entry.path);
      continue;
    }
    if (entry.type !== 'blob' || entry.mode === '160000')
      throw new Error('仓库包含子模块，暂时无法完整拉取，工作区未修改。');
    if (
      !Number.isFinite(entry.size) ||
      entry.size < 0 ||
      (!metadataOnly && entry.size > 8 * 1024 * 1024)
    )
      throw new Error('仓库文件超过 8 MB：' + entry.path + '。工作区未修改。');
    total += entry.size;
    if (!metadataOnly && total > 64 * 1024 * 1024)
      throw new Error('仓库超过 64 MB，工作区未修改。');
    blobs.push(entry);
  }
  if (metadataOnly)
    return {
      repo,
      branch,
      commit: ref.object.sha,
      files: [],
      folders: [],
      fullSnapshot: selection === null,
      selection,
      remotePaths: completeEntries.map((entry) => entry.path),
    };
  const generation = cache.generation;
  let reused = 0,
    downloaded = 0;
  const files = [];
  onProgress({ done: 0, total: blobs.length, path: '' });
  for (const entry of blobs) {
    cancelled();
    let data = await cache.get(client, repo, entry.sha);
    const cached = data !== null;
    cancelled();
    if (data !== null) reused++;
    else {
      const blob = await client.request(`${base}/git/blobs/${entry.sha}`, 'GET', undefined, {
        signal,
      });
      cancelled();
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string')
        throw new Error('无法读取仓库文件：' + entry.path);
      data = blob.content.replace(/\s/g, '');
      downloaded++;
      if (data.length > 12 * 1024 * 1024) throw Error('仓库文件超过限制：' + entry.path);
    }
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    if (bytes.length !== entry.size) throw new Error('仓库文件大小不一致：' + entry.path);
    if (!cached) await cache.put(client, repo, entry.sha, data, generation);
    cancelled();
    // Retain binary resources on disk; only text documents enter the editor.
    let text = null;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) text = null;
    } catch {}
    files.push({ path: entry.path, data, text, sha: entry.sha, mode: entry.mode });
    if (includeDependencies && text !== null) {
      for (const path of dependencyPaths(entry.path, text)) {
        const resource = completeEntries.find(
          (item) =>
            item.path === path ||
            item.path === path + '.tex' ||
            item.path === path + '.bib' ||
            ['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.js', '.mjs', '.css'].some(
              (ext) => item.path === path + ext,
            ),
        );
        if (!resource || resource.type !== 'blob' || paths.has(resource.path)) continue;
        repoPath(resource.path);
        if (!Number.isFinite(resource.size) || resource.size > MAX_TEXT_BYTES)
          throw Error('依赖文件超过限制：' + resource.path);
        total += resource.size;
        if (total > 64 * 1024 * 1024 || blobs.length >= 5000) throw Error('依赖资源超过拉取限制。');
        paths.add(resource.path);
        blobs.push(resource);
      }
    }
    onProgress({ done: files.length, total: blobs.length, path: entry.path, reused, downloaded });
  }
  cancelled();
  return {
    repo,
    branch,
    commit: ref.object.sha,
    files,
    folders,
    reused,
    downloaded,
    fullSnapshot: selection === null,
    selection,
    remotePaths: completeEntries.map((entry) => entry.path),
  };
}
