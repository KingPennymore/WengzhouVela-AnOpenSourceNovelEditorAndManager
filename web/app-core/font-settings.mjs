// @ts-check

import { fontFamilyCss, listSystemFonts, normalizeFontName } from './system-fonts.mjs';
import { t } from '../i18n.mjs';

const defaultFont = '"HarmonyOS Sans SC","Segoe UI","Microsoft YaHei",sans-serif';

/**
 * @param {HTMLElement} root
 * @param {unknown} current
 * @param {import('./system-fonts.mjs').FontServices} services
 */
export function mountFontSettings(root, current, services) {
  const document = root.ownerDocument;
  const field = document.createElement('fieldset');
  field.className = 'font-settings';
  const legend = document.createElement('legend');
  legend.textContent = t('字体');
  field.append(legend);
  const label = document.createElement('label');
  label.textContent = t('界面与正文字体');
  const select = document.createElement('select');
  select.name = 'fontFamily';
  label.append(select);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = t('获取系统字体');
  button.dataset.fontList = '';
  const status = document.createElement('small');
  status.setAttribute('role', 'status');
  status.textContent = t('点击获取本机可用字体；浏览器可能会请求授权。');
  const preview = document.createElement('p');
  preview.className = 'font-settings-preview';
  preview.textContent = t('海风吹过港湾，文舟记录故事。') + ' Aa 0123456789';
  const note = document.createElement('small');
  note.textContent = t('用于界面、正文编辑和普通阅读；文档指定样式与 PDF 排版保持原样。');
  field.append(label, button, status, preview, note);
  root.append(field);

  /** @param {string[]} fonts */
  const populate = (fonts) => {
    const chosen = select.options.length ? select.value : normalizeFontName(current);
    select.replaceChildren();
    /** @param {string} name @param {string} text */
    const option = (name, text) => {
      const item = document.createElement('option');
      item.value = name;
      item.textContent = text;
      select.append(item);
    };
    option('', t('文舟默认'));
    option('system-ui', t('跟随系统字体'));
    if (chosen && chosen !== 'system-ui' && !fonts.includes(chosen)) {
      option(chosen, chosen + ' · ' + t('当前设置'));
    }
    for (const name of fonts) if (name !== 'system-ui') option(name, name);
    select.value = chosen;
    preview.style.fontFamily = fontFamilyCss(chosen) || defaultFont;
  };
  populate([]);
  select.onchange = () => {
    preview.style.fontFamily = fontFamilyCss(select.value) || defaultFont;
  };
  const load = async () => {
    button.disabled = true;
    status.textContent = t('正在读取系统字体…');
    try {
      const fonts = await listSystemFonts(services);
      if (!field.isConnected) return;
      populate(fonts);
      status.textContent = fonts.length
        ? t('已读取本机可用字体。')
        : t('系统未提供可选字体，仍可使用默认或跟随系统。');
    } catch {
      if (field.isConnected) status.textContent = t('未能读取字体列表，可重试或选择跟随系统字体。');
    } finally {
      button.disabled = false;
    }
  };
  button.onclick = load;
  // Native font names need no permission prompt; browsing the web must stay gesture-driven.
  if (services.native) void load();
}
