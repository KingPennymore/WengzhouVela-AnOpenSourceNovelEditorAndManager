// Follow the same navigation as a user before opening a recent document.
export async function openRecentFile(page,file){
  await page.locator('#start-page').waitFor({state:'visible'});
  if(await page.evaluate(()=>innerWidth<=600&&document.body.classList.contains('show-library')))await page.locator('#mobile-library').click();
  if(await page.locator('#start-page').getAttribute('data-panel')!=='recent')await page.locator('[data-start="recent"]').click();
  await file.click();
}
