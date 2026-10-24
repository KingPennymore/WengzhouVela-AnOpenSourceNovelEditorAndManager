/** Open hidden destinations through the editor's navigation toggle, just as a user does. */
export async function selectAppView(page, name) {
  const destination = page.locator(`[data-view="${name}"]`);
  if (!await destination.isVisible() && name !== 'write') {
    await page.locator('[data-view="write"]').click();
  }
  await destination.click();
}

export async function expandEditorNavigation(page) {
  if (await page.locator('body').getAttribute('data-editor-chrome') === 'compact') {
    await page.locator('[data-view="write"]').click();
  }
}
