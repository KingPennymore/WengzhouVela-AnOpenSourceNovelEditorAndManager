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
      if (await page.locator('#mobile-jump-menu').isHidden())
        await page.locator('#quick-jump').click();
      await page.locator('#quick-outline').click();
      return;
    }
    if (/^#quick-(?:top|bottom|chapter-top|chapter-bottom)$/.test(selector)) {
      if (await page.locator('#mobile-jump-menu').isHidden())
        await page.locator('#quick-jump').click();
    } else if (
      selector === '#quick-git' ||
      selector.startsWith('[data-display=') ||
      selector === '[data-format]'
    ) {
      if (await page.locator('#toolbar-overflow').isHidden())
        await page.locator('#more-tools').click();
    } else if (/^#(?:format-|md-)/.test(selector)) {
      if ((await page.locator('#mobile-format-toggle').getAttribute('aria-expanded')) !== 'true')
        await page.locator('#mobile-format-toggle').click();
    }
  }
  await page.locator(mobile && selector === '#quick-git' ? '#mobile-git' : selector).click();
}
