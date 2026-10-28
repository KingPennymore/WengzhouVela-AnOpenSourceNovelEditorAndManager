import { GitHub, GitHubError } from './github.mjs';
import { encodeContent, repoPath, MAX_TEXT_BYTES } from './model.mjs';
import { gitIdentity, normalizeGiteaServer } from './git-host.mjs';
import {textBytes,MB} from './text-utils.mjs';

/** Gitea API v1. Keep GitHub's read protocol, adapting response shapes and writes. */
export class Gitea extends GitHub {
  constructor(transport, server = 'https://gitea.com') {
    server = normalizeGiteaServer(server);
    super((operation, payload) => transport(operation, { ...payload, provider: 'gitea', server }));
    this.provider = 'gitea';
    this.server = server;
  }

  async request(path, method = 'GET', body, options) {
    const ref = path.match(/^(\/repos\/[\w.-]+\/[\w.-]+)\/git\/ref\/heads\/(.+)$/);
    if (ref) {
      const branch = await this.request(`${ref[1]}/branches/${ref[2]}`, method, body, options);
      return { object: { sha: branch.commit.id || branch.commit.sha } };
    }
    try {
      const result = await super.request(path, method, body, options);
      if (/\/git\/commits\//.test(path))
        return { ...result, tree: result.tree || result.commit?.tree };
      if (method === 'GET' && /\/git\/trees\//.test(path)) {
        const tree = [...(result.tree || [])],
          total = result.total_count;
        if (!Number.isInteger(total) || total < tree.length || total > 5000)
          throw Error('Gitea 仓库目录无效或超过 5000 项，工作区未修改。');
        for (let page = 2; tree.length < total; page++) {
          options?.signal?.throwIfAborted();
          const next = await super.request(
            `${path}${path.includes('?') ? '&' : '?'}page=${page}`,
            method,
            body,
            options,
          );
          if (
            next.total_count !== total ||
            !next.tree?.length ||
            tree.length + next.tree.length > total
          )
            throw Error('Gitea 目录分页不完整，工作区未修改。');
          tree.push(...next.tree);
        }
        return { ...result, tree, truncated: false };
      }
      return result;
    } catch (error) {
      if (error instanceof GitHubError) error.message = error.message.replaceAll('GitHub', 'Gitea');
      throw error;
    }
  }

  async pages(path) {
    const items = [];
    // Gitea instances may cap page size below our request. Stop only on an empty page.
    for (let page = 1; page <= 1001; page++) {
      const batch = await this.request(
        `${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`,
      );
      if (!Array.isArray(batch)) throw Error('Gitea 返回的数据格式不正确。');
      if (!batch.length) return items;
      items.push(...batch);
      if (items.length > 10000) break;
    }
    throw Error('Gitea 列表过大，请缩小仓库范围。');
  }

  repositories() {
    return this.pages('/user/repos');
  }
  commits(repo, branch, page = 1) {
    return this.request(
      `${this.base(repo)}/commits?sha=${encodeURIComponent(branch)}&limit=30&page=${Math.max(1, Math.trunc(page))}`,
    );
  }
  contentURL(repo, path = '') {
    return `${this.base(repo)}/contents${path ? '/' + repoPath(path).split('/').map(encodeURIComponent).join('/') : ''}`;
  }
  createBranch(repo, from, name) {
    if (!name.trim()) throw Error('请输入分支名称。');
    return this.request(`${this.base(repo)}/branches`, 'POST', {
      old_branch_name: from,
      new_branch_name: name.trim(),
    });
  }
  async pullRepository(repo, branch, options) {
    return { ...(await super.pullRepository(repo, branch, options)), ...gitIdentity(this) };
  }
  async commit({ repo, branch, path, sha, text, message }) {
    if (!message.trim()) throw Error('请填写提交说明。');
    if (textBytes(text) > MAX_TEXT_BYTES)
      throw Error('单次提交文稿不能超过 8 MB。');
    return this.request(this.contentURL(repo, path), sha ? 'PUT' : 'POST', {
      branch,
      content: encodeContent(text),
      message: message.trim(),
      ...(sha ? { sha } : {}),
    });
  }

  async commitWorkspace({ repo, branch, files, message, prefix = '', expectedHead }) {
    if (!message.trim()) throw Error('请填写提交说明。');
    if (!Array.isArray(files) || !files.length || files.length > 5000)
      throw Error('工作区须包含 1–5000 个文件。');
    if (prefix) prefix = repoPath(prefix);
    const paths = new Set();
    let size = 0;
    for (const file of files) {
      repoPath(file.path);
      if (paths.has(file.path)) throw Error('工作区含重复文件路径。');
      paths.add(file.path);
      const bytes = file.delete
        ? 0
        : typeof file.text === 'string'
          ? textBytes(file.text)
          : typeof file.data === 'string'
            ? Math.ceil((file.data.length * 3) / 4)
            : Infinity;
      size += bytes;
      if (bytes > MAX_TEXT_BYTES || size > 64*MB)
        throw Error('工作区文件超过提交大小限制。');
    }
    const refPath = `${this.base(repo)}/git/ref/heads/${encodeURIComponent(branch)}`;
    const head = (await this.request(refPath)).object.sha;
    if (expectedHead && expectedHead !== head) throw new GitHubError(409, {});
    const changes = [];
    for (const file of files) {
      const path = (prefix ? prefix + '/' : '') + file.path;
      let sha;
      try {
        sha = (await this.contents(repo, head, path)).sha;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      if (file.delete && !sha) continue;
      changes.push({
        path,
        operation: file.delete ? 'delete' : sha ? 'update' : 'create',
        ...(sha ? { sha } : {}),
        ...(file.delete
          ? {}
          : { content: typeof file.text === 'string' ? encodeContent(file.text) : file.data }),
      });
    }
    if (!changes.length) throw Error('没有可提交的变更。');
    if ((await this.request(refPath)).object.sha !== head) throw new GitHubError(409, {});
    // Each existing file carries its immutable blob SHA. Never silently retry a write.
    const result = await this.request(`${this.base(repo)}/contents`, 'POST', {
      branch,
      message: message.trim(),
      files: changes,
    });
    return { ...result, sha: result.commit?.sha || result.sha, files: result.files || [] };
  }
}
