// @ts-check

/** @param {unknown} value */
export function normalizeFontName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name.length <= 160 && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(name) ? name : '';
}

/** @param {unknown} value */
export function normalizeFontList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const item of value.slice(0, 4096)) {
    const name = normalizeFontName(item);
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** A quoted CSS family prevents commas and punctuation in names from becoming CSS syntax.
 * @param {unknown} value
 */
export function fontFamilyCss(value) {
  const name = normalizeFontName(value);
  if (!name) return '';
  const generic = ['system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'];
  return generic.includes(name)
    ? name + ',sans-serif'
    : JSON.stringify(name) + ',system-ui,sans-serif';
}

/** @param {Document} document @param {unknown} value */
export function applyFontPreference(document, value) {
  const family = fontFamilyCss(value);
  if (family) document.documentElement.style.setProperty('--app-font-family', family);
  else document.documentElement.style.removeProperty('--app-font-family');
}

/** @typedef {{family: string}} LocalFont
 * @typedef {Window & {queryLocalFonts?: () => Promise<LocalFont[]>}} FontWindow
 * @typedef {object} FontServices
 * @property {boolean} native
 * @property {(operation: string) => Promise<unknown>} transport
 * @property {FontWindow} window
 */

/** Called only from the font picker; browser enumeration stays inside a user gesture.
 * @param {FontServices} services
 */
export async function listSystemFonts(services) {
  if (services.native) return normalizeFontList(await services.transport('listSystemFonts'));
  if (!services.window.queryLocalFonts) throw new Error('此浏览器不支持读取系统字体。');
  const fonts = await services.window.queryLocalFonts();
  return normalizeFontList(fonts.map((font) => font.family));
}
