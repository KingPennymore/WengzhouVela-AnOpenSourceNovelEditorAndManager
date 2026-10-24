// @ts-check

/**
 * Persistence ports keep document revisions in DocumentService and storage in platform.mjs.
 * @typedef {object} SessionPorts
 * @property {() => boolean} locked
 * @property {() => boolean} animating
 * @property {() => void} flush
 * @property {() => boolean} write
 * @property {() => Promise<boolean>} writeAsync
 * @property {(message: string, dirty: boolean) => void} report
 * @property {() => void} changed
 * @property {(message: string) => void} toast
 * @property {(error: Error) => void} fail
 */

/** Owns save scheduling and the session's unsaved state, without owning a DOM or storage backend. */
export class WorkspaceSession {
  /** @param {SessionPorts} ports */
  constructor(ports) {
    this.ports = ports;
    this.dirty = false;
    this.bootFailed = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.contentTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.workspaceTimer = null;
    /** @type {Promise<boolean> | null} */
    this.backgroundSave = null;
    this.saveAgain = false;
  }

  get pendingWorkspaceSave() {
    return this.workspaceTimer !== null;
  }

  get needsSave() {
    return this.dirty || this.pendingWorkspaceSave || this.backgroundSave !== null;
  }

  /** @param {boolean} [show] */
  save(show = false) {
    if (this.ports.locked()) return false;
    this.clearTimers();
    if (this.bootFailed) return false;
    try {
      this.ports.flush();
      const clean = this.ports.write();
      this.saved(clean);
      if (show && clean) this.ports.toast('文件已保存到本机');
      return clean;
    } catch (error) {
      this.failed(error, false);
      return false;
    }
  }

  saveBackground() {
    if (this.ports.locked() || this.bootFailed) return Promise.resolve(false);
    if (this.backgroundSave) {
      this.saveAgain = true;
      return this.backgroundSave;
    }
    this.backgroundSave = (async () => {
      try {
        this.ports.flush();
        const clean = await this.ports.writeAsync();
        this.saved(clean);
        return clean;
      } catch (error) {
        this.failed(error, true);
        return false;
      }
    })();
    this.backgroundSave.then(() => {
      this.backgroundSave = null;
      if (this.saveAgain) {
        this.saveAgain = false;
        this.scheduleSave(0);
      }
    });
    return this.backgroundSave;
  }

  /** @param {boolean} clean */
  saved(clean) {
    this.dirty = !clean;
    this.ports.report(clean ? '已保存到本机' : '未保存', !clean);
    this.ports.changed();
  }

  /** @param {unknown} error @param {boolean} background */
  failed(error, background) {
    this.dirty = true;
    this.ports.report(background ? '保存失败 · 请手动保存' : '保存失败 · 请导出备份', true);
    const reason = error instanceof Error ? error.message : String(error);
    this.ports.fail(new Error((background ? '后台保存失败：' : '保存失败：') + reason));
  }

  /** @param {number} [delay] */
  scheduleSave(delay = 1200) {
    this.dirty = true;
    this.ports.report('未保存', true);
    clearTimeout(this.contentTimer ?? undefined);
    this.contentTimer = setTimeout(() => this.runScheduledSave('content'), delay);
  }

  scheduleWorkspaceSave() {
    clearTimeout(this.workspaceTimer ?? undefined);
    this.workspaceTimer = setTimeout(() => this.runScheduledSave('workspace'), 300);
  }

  /** @param {'content' | 'workspace'} kind */
  async runScheduledSave(kind) {
    if (kind === 'content') this.contentTimer = null;
    else this.workspaceTimer = null;
    // Sidebar motion can restart after scheduling. Wait until its frames finish.
    if (this.ports.animating()) {
      const timer = setTimeout(() => this.runScheduledSave(kind), 50);
      if (kind === 'content') this.contentTimer = timer;
      else this.workspaceTimer = timer;
      return;
    }
    await this.saveBackground();
  }

  clearTimers() {
    clearTimeout(this.contentTimer ?? undefined);
    clearTimeout(this.workspaceTimer ?? undefined);
    this.contentTimer = null;
    this.workspaceTimer = null;
  }
}

/**
 * Native save callbacks and lifecycle events share the same synchronous save guard.
 * @param {Window} window
 * @param {Document} document
 * @param {WorkspaceSession} session
 * @param {() => boolean | undefined} rememberPosition
 * @param {() => boolean} documentsDirty
 */
export function bindSessionLifecycle(window, document, session, rememberPosition, documentsDirty) {
  const save = () => {
    rememberPosition();
    return session.save();
  };
  const pagehide = () => {
    rememberPosition();
    if (session.needsSave || documentsDirty()) session.save();
  };
  const visibility = () => {
    if (document.hidden) {
      const moved = rememberPosition();
      if (moved || session.needsSave) session.save();
    }
  };
  const blur = () => {
    if (session.needsSave) session.save();
  };
  /** @param {BeforeUnloadEvent} event */
  const beforeunload = (event) => {
    if (session.needsSave && !session.save()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', blur);
  window.addEventListener('beforeunload', beforeunload);
  return {
    save,
    dispose() {
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('beforeunload', beforeunload);
    },
  };
}
