// @ts-check

const easing = 'cubic-bezier(.22,1,.36,1)';

/** Keep transient shell effects separate from navigation and menu state. */
export class ChromeMotion {
  /** @param {() => boolean} reduced */
  constructor(reduced) {
    this.reduced = reduced;
    /** @type {Set<Animation>} */
    this.animations = new Set();
    /** @type {Set<HTMLElement>} */
    this.ghosts = new Set();
  }

  cancel() {
    for (const animation of this.animations) animation.cancel();
    for (const ghost of this.ghosts) ghost.remove();
    this.animations.clear();
    this.ghosts.clear();
  }

  /** @param {HTMLElement[]} buttons */
  capture(buttons) {
    if (this.reduced()) return null;
    return buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const visible = button.closest('.topbar') && rect.width && rect.height;
      return { button, rect, ghost: visible ? iconGhost(button, rect) : null };
    });
  }

  /** @param {HTMLElement} element @param {Keyframe[]} frames @param {() => void} [done] */
  animate(element, frames, done = () => {}) {
    const animation = element.animate(frames, { duration: 220, easing });
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
    for (const { button, rect: old, ghost } of before) {
      const next = button.getBoundingClientRect();
      const visible = button.closest('.topbar') && next.width > 0 && next.height > 0;
      if (visible && ghost) {
        const x = old.x + old.width / 2 - next.x - next.width / 2;
        const y = old.y + old.height / 2 - next.y - next.height / 2;
        const scaleX = old.width / next.width;
        const scaleY = old.height / next.height;
        if (Math.abs(x) + Math.abs(y) < 0.5 && Math.abs(scaleX - 1) + Math.abs(scaleY - 1) < 0.01) {
          continue;
        }
        this.animate(button, [
          { transform: `translate(${x}px,${y}px) scale(${scaleX},${scaleY})` },
          { transform: 'none' },
        ]);
      } else if (visible) {
        this.animate(button, [
          { opacity: 0, transform: 'translateX(6px) scale(.94)' },
          { opacity: 1, transform: 'none' },
        ]);
      } else if (ghost) {
        document.body.append(ghost);
        this.ghosts.add(ghost);
        this.animate(
          ghost,
          [{ opacity: 1 }, { opacity: 0, transform: 'translateX(-6px) scale(.94)' }],
          () => {
            ghost.remove();
            this.ghosts.delete(ghost);
          },
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
