import { settled } from './wait-helpers.mjs';
// Navigate the public mobile entry points; desktop controls keep their original locations.
export async function revealEditorChrome(page) {
  if ((await page.locator('body').getAttribute('data-mobile-immersed')) === 'true')
    await page.evaluate(() => window.wenzhouBack());
}
export async function editorAction(page, selector) {
  await revealEditorChrome(page);
  await settled(page);
  const mobile = (await page.locator('body').getAttribute('data-mobile-editor')) === 'true';
  if (mobile) {
    if (selector === '#outline-toggle' && (await page.locator(selector).isHidden())) {
      if ((await page.locator('#mobile-format-toggle').getAttribute('aria-expanded')) === 'true')
        await page.locator('#mobile-format-toggle').click();
    } else if (selector.startsWith('[data-display=') || selector === '[data-format]') {
      if (await page.locator('#toolbar-overflow').isHidden())
        await page.locator('#more-tools').click();
    } else if (/^#(?:format-|md-)/.test(selector)) {
      if ((await page.locator('#mobile-format-toggle').getAttribute('aria-expanded')) !== 'true')
        await page.locator('#mobile-format-toggle').click();
    }
  }
  await page.locator(selector).click();
}
