import {settled,themeShiftDone} from './wait-helpers.mjs';
// Settings save immediately; helpers exercise category navigation and native controls.
const categories={immersiveWriting:'editing',language:'appearance',theme:'appearance',palette:'appearance',fontFamily:'appearance',fontSize:'editing',richText:'editing',novelLineNumbers:'editing',autoNouns:'terms',highlightTerms:'terms',glossaryPanel:'terms',countMode:'chapters',includeHeading:'chapters',readingMode:'reading',globalVelaOverride:'reading',updateChecks:'about'};
export async function settingsSection(page,id){
  await page.locator('[data-settings-group]').first().waitFor({state:'attached'});
  if(!await page.locator('.settings-navigation').isVisible())await page.evaluate(()=>window.wenzhouBack());
  await page.locator(`[data-settings-group="${id}"]`).click();
  await page.locator(`#settings-section-${id}`).waitFor();
}
export async function setSetting(page,name,value){
  await themeShiftDone(page);
  if(categories[name]&&!await page.locator(`#dialog-body [name="${name}"]`).first().isVisible())await settingsSection(page,categories[name]);
  const control=page.locator(`#dialog-body [name="${name}"]`).first();
  const type=await control.evaluate(el=>el.type);
  if(type==='radio')await page.locator(`#dialog-body [name="${name}"][value="${value}"]`).check({force:true});
  else if(type==='checkbox')await control.setChecked(!!value,{force:true});
  else if(await control.evaluate(el=>el.tagName)==='SELECT')await control.selectOption(String(value));
  else {await control.fill(String(value));await control.dispatchEvent('change');}
  if(name==='language')await page.waitForFunction(value=>document.documentElement.lang===value,value);
  await themeShiftDone(page);await settled(page);
}
export async function closeSettings(page){
  for(let i=0;i<3&&await page.locator('#dialog').evaluate(el=>el.open);i++)await page.evaluate(()=>window.wenzhouBack());
  await page.locator('#dialog').waitFor({state:'hidden'});
}
