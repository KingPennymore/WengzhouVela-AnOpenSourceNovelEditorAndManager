import { gitHostKey } from './git-host.mjs';

/** Verify Git object identity before reusing bytes, including across branches. */
export async function matchesBlob(data, sha) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha || '') || typeof data !== 'string') return false;
  try {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const object = new Uint8Array(header.length + bytes.length);
    object.set(header);
    object.set(bytes, header.length);
    const hash = new Uint8Array(
      await crypto.subtle.digest(sha.length === 40 ? 'SHA-1' : 'SHA-256', object),
    );
    return (
      Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('') === sha.toLowerCase()
    );
  } catch {
    return false;
  }
}

/** Disposable remote data only. Never stores credentials, local edits or sync baselines. */
export class SyncBlobCache {
  constructor({ limit = 32 * 1024 * 1024, entries = 256, persistent = true } = {}) {
    this.limit = limit;
    this.entries = entries;
    this.memory = new Map();
    this.bytes = 0;
    this.generation = 0;
    this.queue = Promise.resolve();
    this.database =
      persistent && globalThis.indexedDB
        ? new Promise((resolve) => {
            const request = indexedDB.open('wenzhou-sync-blobs-v1', 2);
            request.onupgradeneeded = () => {
              const db = request.result;
              if (!db.objectStoreNames.contains('blobs'))
                db.createObjectStore('blobs', { keyPath: 'key' });
              else request.transaction.objectStore('blobs').clear();
              if (!db.objectStoreNames.contains('sizes'))
                db.createObjectStore('sizes', { keyPath: 'key' });
            };
            request.onsuccess = () => {
              request.result.onversionchange = () => request.result.close();
              resolve(request.result);
            };
            request.onerror = request.onblocked = () => resolve(null);
          }).catch(() => null)
        : Promise.resolve(null);
  }

  key(client, repo, sha) {
    return JSON.stringify([gitHostKey(client), repo.toLowerCase(), sha.toLowerCase()]);
  }

  async get(client, repo, sha) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha || '')) return null;
    const key = this.key(client, repo, sha),
      generation = this.generation;
    let data = this.memory.get(key)?.data;
    if (data === undefined) {
      await this.queue;
      const db = await this.database;
      if (db)
        data = await new Promise((resolve) => {
          try {
            const request = db.transaction('blobs').objectStore('blobs').get(key);
            request.onsuccess = () => resolve(request.result?.data);
            request.onerror = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        });
    }
    if (!(await matchesBlob(data, sha)) || generation !== this.generation) return null;
    this.remember(key, data);
    return data;
  }

  remember(key, data) {
    this.bytes -= this.memory.get(key)?.data.length || 0;
    this.memory.delete(key);
    if (data.length > this.limit) return;
    this.memory.set(key, { data, used: Date.now() });
    this.bytes += data.length;
    while (this.bytes > this.limit || this.memory.size > this.entries) {
      const oldest = this.memory.keys().next().value;
      this.bytes -= this.memory.get(oldest).data.length;
      this.memory.delete(oldest);
    }
  }

  async put(client, repo, sha, data, generation = this.generation) {
    if (
      data.length > this.limit ||
      !(await matchesBlob(data, sha)) ||
      generation !== this.generation
    )
      return;
    const key = this.key(client, repo, sha);
    this.remember(key, data);
    this.queue = this.queue
      .then(async () => {
        const db = await this.database;
        if (!db || generation !== this.generation) return;
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(['blobs', 'sizes'], 'readwrite'),
              store = tx.objectStore('blobs'),
              sizes = tx.objectStore('sizes');
            store.put({ key, data });
            sizes.put({ key, length: data.length, used: Date.now() });
            // Evict using tiny metadata records, without copying every cached attachment.
            const request = sizes.getAll();
            request.onsuccess = () => {
              const rows = request.result.sort((a, b) => b.used - a.used);
              let bytes = 0;
              rows.forEach((row, i) => {
                bytes += row.length;
                if (bytes > this.limit || i >= this.entries) {
                  store.delete(row.key);
                  sizes.delete(row.key);
                }
              });
            };
            tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
          } catch {
            resolve();
          }
        });
      })
      .catch(() => {});
    await this.queue;
  }

  async clear() {
    this.generation++;
    this.memory.clear();
    this.bytes = 0;
    const clearing = this.queue
      .catch(() => {})
      .then(async () => {
        const db = await this.database;
        if (!db) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['blobs', 'sizes'], 'readwrite');
          tx.objectStore('blobs').clear();
          tx.objectStore('sizes').clear();
          tx.oncomplete = resolve;
          tx.onerror = tx.onabort = () => reject(Error('下载缓存清理失败，请重试。'));
        });
      });
    this.queue = clearing.catch(() => {});
    await clearing;
  }
}

export const syncBlobCache = new SyncBlobCache();
