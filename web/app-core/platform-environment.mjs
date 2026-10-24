// @ts-check

/**
 * @typedef {object} Environment
 * @property {string} [platform]
 * @property {boolean} [dark]
 * @property {string} [version]
 * @property {number} [top]
 * @property {number} [bottom]
 * @property {number} [left]
 * @property {number} [right]
 */

/**
 * @param {Window} window
 * @param {Document} document
 * @param {Environment | null} initial
 * @param {(value: Environment | null) => void} changed
 */
export function bindPlatformEnvironment(window, document, initial, changed) {
  /** @param {Environment | null} value */
  const apply = (value) => {
    document.body.dataset.platform = value?.platform || 'browser';
    for (const edge of /** @type {const} */ (['top', 'bottom', 'left', 'right'])) {
      const inset = Number(value?.[edge] || 0);
      document.documentElement.style.setProperty('--safe-' + edge, Math.max(0, inset) + 'px');
    }
    changed(value);
  };
  /** @param {Event} event */
  const onEnvironment = (event) =>
    apply(/** @type {CustomEvent<Environment | null>} */ (event).detail);
  window.addEventListener('wenzhouEnvironment', onEnvironment);
  if (initial) apply(initial);
  return () => window.removeEventListener('wenzhouEnvironment', onEnvironment);
}
