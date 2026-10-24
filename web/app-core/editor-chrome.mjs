// @ts-check

/** Navigation state is independent of menus, selection, typing and viewport layout. */
export class EditorChrome {
  constructor() {
    this.active = false;
    this.compact = false;
  }

  /** @param {string} page @param {boolean} home */
  context(page, home) {
    const active = page === 'write' && !home;
    if (active === this.active) return false;
    this.active = active;
    this.compact = active;
    return true;
  }

  toggle() {
    if (!this.active) return false;
    this.compact = !this.compact;
    return true;
  }
}
