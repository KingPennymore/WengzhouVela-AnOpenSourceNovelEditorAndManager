export async function chooseMapLink(page,path){
 await page.locator('.map-point-form [data-link-map]').click();
 await page.locator('.planning-link-form select[name=link]').selectOption(path);
 await page.locator('.planning-link-form button.primary').click();
 await page.locator('.map-point-sheet:not([hidden])').waitFor();
}
