// Drives the CSV grid like a user: cells are drawn by the grid (not inputs), a cell is edited by selecting it,
// pressing “编辑” and committing the editor. A large table opens fitted as an overview, so the helpers switch to 100%.
const cellSelector = (row, column) => `[data-cell-row="${row}"][data-cell-column="${column}"]`;

async function showCells(page) {
  await page.locator('.csv-panel').waitFor();
  if (!(await page.locator('.csv-grid-cell').count())) await page.locator('#csv-actual').click();
  await page.locator('.csv-grid-cell').first().waitFor();
}
/** Selects a cell by its text with the table search (selecting the first match reveals it). */
export async function findCsvCell(page, text) {
  await showCells(page);
  if (await page.locator('.csv-find').isHidden()) await page.locator('#csv-find').click();
  await page.locator('#csv-search').fill(text);
}
export async function csvCellText(page, row, column) {
  await showCells(page);
  return page.locator(cellSelector(row, column)).textContent();
}
export async function editCsvCell(page, row, column, value) {
  await showCells(page);
  await page.locator(cellSelector(row, column)).click();
  await page.locator('#csv-edit-cell').click();
  await page.locator('#csv-input').fill(value);
  await page.locator('#csv-commit').click();
  await page.locator('.csv-editor-layer').waitFor({ state: 'hidden' });
}
