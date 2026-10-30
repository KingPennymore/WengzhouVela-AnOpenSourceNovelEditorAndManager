// Open a visible recent row; expose the retained full-list view only for fixtures outside the first five.
// The recent-files launcher was removed by user request.
export async function openRecentFile(page,file){
  await page.locator('#start-page').waitFor({state:'visible'});
  if(await page.evaluate(()=>innerWidth<=600&&document.body.classList.contains('show-library')))await page.locator('#mobile-library').click();
  if(!await file.isVisible())await page.locator('#start-page').evaluate(root=>root.setStartPanel('recent',{focus:false}));
  await file.click();
}
