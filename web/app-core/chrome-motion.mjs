// @ts-check

const easing = 'cubic-bezier(.22,1,.36,1)';
const rightActions = new Set(['search-editor', 'add-glossary', 'export-doc']);

/** Keep transient shell effects separate from navigation and menu state. */
export class ChromeMotion {
  /** @param {() => boolean} reduced */
  constructor(reduced) {
    this.reduced = reduced;
    /** @type {Set<Animation>} */
    this.animations = new Set();
    /** @type {Set<HTMLElement>} */
    this.ghosts = new Set();
    /** @type {Map<HTMLElement, HTMLElement>} */
    this.departing = new Map();
  }

  cancel() {
    for (const animation of this.animations) animation.cancel();
    for (const ghost of this.ghosts) ghost.remove();
    this.animations.clear();
    this.ghosts.clear();
    this.departing.clear();
  }

  /** @param {HTMLElement[]} buttons */
  capture(buttons) {
    if (this.reduced()) return null;
    return buttons.map((button) => {
      const departing = this.departing.get(button);
      const surface = departing || button;
      const rect = surface.getBoundingClientRect();
      const visible = button.closest('.topbar') && rect.width && rect.height;
      const group = button.closest('.page-navigation,.global-tools');
      const bounds =
        departing?.parentElement?.getBoundingClientRect() || group?.getBoundingClientRect();
      const anchor = group?.querySelector('[data-view=write]')?.getBoundingClientRect();
      const left = anchor?.right ?? bounds?.left ?? rect.left;
      const actionEnd = group?.querySelector('#outline-toggle')?.getBoundingClientRect().left;
      const right =
        !departing && rightActions.has(button.id) && actionEnd !== undefined
          ? actionEnd
          : (bounds?.right ?? rect.right);
      return {
        button,
        rect,
        opacity: visible || departing ? Number(getComputedStyle(surface).opacity) : 0,
        clip: {
          left,
          top: bounds?.top ?? rect.top,
          width: right - left,
          height: bounds?.height ?? rect.height,
        },
        ghost: departing || (visible ? iconGhost(button, rect) : null),
      };
    });
  }

  /**
   * @param {HTMLElement} element
   * @param {Keyframe[]} frames
   * @param {() => void} [done]
   * @param {{duration?: number, delay?: number}} [options]
   */
  animate(element, frames, done = () => {}, options = {}) {
    const animation = element.animate(frames, {
      duration: 240,
      easing,
      fill: 'backwards',
      ...options,
    });
    this.animations.add(animation);
    animation.onfinish = () => {
      this.animations.delete(animation);
      done();
    };
    return animation;
  }

  /** @param {ReturnType<ChromeMotion['capture']>} before */
  play(before) {
    if (!before || this.reduced()) return;
    for (const { button, rect: old, ghost, opacity, clip } of before) {
      const offset = rightActions.has(button.id) ? 40 : -40;
      const next = button.getBoundingClientRect();
      const visible = button.closest('.topbar') && next.width > 0 && next.height > 0;
      if (visible && ghost) {
        const x = old.x + old.width / 2 - next.x - next.width / 2;
        const y = old.y + old.height / 2 - next.y - next.height / 2;
        const scaleX = old.width / next.width;
        const scaleY = old.height / next.height;
        if (
          Math.abs(x) + Math.abs(y) < 0.5 &&
          Math.abs(scaleX - 1) + Math.abs(scaleY - 1) < 0.01 &&
          opacity >= 0.99
        ) {
          continue;
        }
        this.animate(button, [
          { opacity, transform: `translate(${x}px,${y}px) scale(${scaleX},${scaleY})` },
          { opacity: 1, transform: 'none' },
        ]);
      } else if (visible) {
        // Each group enters from its own edge: left navigation from the left, document actions from the right.
        const edge = button.parentElement
          ?.querySelector('#outline-toggle')
          ?.getBoundingClientRect().left;
        const crop = offset > 0 && edge !== undefined ? Math.max(0, next.right + offset - edge) : 0;
        this.animate(
          button,
          [
            {
              opacity: 0,
              transform: `translateX(${offset}px)`,
              clipPath: `inset(0 ${crop}px 0 0)`,
            },
            { opacity: 1, transform: 'none', clipPath: 'inset(0)' },
          ],
          undefined,
          { duration: 260, delay: 60 },
        );
      } else if (ghost) {
        // Clip departing icons to their old group so they cannot cross the editor or folder button.
        const viewport = document.createElement('div');
        viewport.className = 'chrome-motion-clip';
        viewport.setAttribute('aria-hidden', 'true');
        viewport.inert = true;
        Object.assign(viewport.style, {
          left: clip.left + 'px',
          top: clip.top + 'px',
          width: Math.max(0, clip.width) + 'px',
          height: clip.height + 'px',
        });
        Object.assign(ghost.style, {
          position: 'absolute',
          left: old.left - clip.left + 'px',
          top: old.top - clip.top + 'px',
        });
        viewport.append(ghost);
        document.body.append(viewport);
        this.ghosts.add(viewport);
        this.departing.set(button, ghost);
        this.animate(
          ghost,
          [
            { opacity, transform: 'none' },
            { opacity: 0, transform: `translateX(${offset}px)` },
          ],
          () => {
            viewport.remove();
            this.ghosts.delete(viewport);
            if (this.departing.get(button) === ghost) this.departing.delete(button);
          },
          { duration: 180 },
        );
      }
    }
  }
}

/** A noninteractive icon surface for controls already removed from layout. */
/** @param {HTMLElement} button @param {DOMRect} rect */
function iconGhost(button, rect) {
  const ghost = document.createElement('div');
  ghost.className = 'chrome-motion-ghost';
  ghost.dataset.source = button.id || button.dataset.view;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  const style = getComputedStyle(button);
  for (const property of [
    'color',
    'background',
    'border',
    'border-radius',
    'box-shadow',
    'padding',
  ]) {
    ghost.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(ghost.style, {
    left: rect.x + 'px',
    top: rect.y + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  });
  const icon = button.querySelector('svg');
  if (icon) {
    const copy = /** @type {SVGElement} */ (icon.cloneNode(true));
    for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
    const iconStyle = getComputedStyle(icon);
    for (const property of ['width', 'height', 'fill', 'stroke', 'stroke-width']) {
      copy.style.setProperty(property, iconStyle.getPropertyValue(property));
    }
    ghost.append(copy);
  }
  return ghost;
}

export class MenuMotion {
  /** @param {HTMLElement} element @param {() => boolean} reduced */
  constructor(element, reduced) {
    this.element = element;
    this.reduced = reduced;
    /** @type {Animation | null} */
    this.animation = null;
    this.closing = false;
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    if (!visible && (this.element.hidden || this.closing)) return;
    const style = getComputedStyle(this.element);
    const from = this.element.hidden
      ? { opacity: '0', transform: 'translateY(-6px) scale(.98)' }
      : { opacity: style.opacity, transform: style.transform };
    this.animation?.cancel();
    this.animation = null;
    this.closing = !visible;
    this.element.inert = !visible;
    if (visible) this.element.hidden = false;
    if (this.reduced()) {
      this.element.hidden = !visible;
      return;
    }
    const to = visible
      ? { opacity: '1', transform: 'none' }
      : { opacity: '0', transform: 'translateY(-6px) scale(.98)' };
    const animation = this.element.animate([from, to], {
      duration: visible ? 180 : 130,
      easing,
      fill: 'both',
    });
    this.animation = animation;
    animation.onfinish = () => {
      if (this.animation !== animation) return;
      if (!visible) this.element.hidden = true;
      this.animation = null;
      animation.cancel();
    };
  }
}
