import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {launchBrowser} from './browser-launch.mjs';
import {startSourceAppServer} from './source-app-server.mjs';
import {button,settingRow,segmented,switchControl,stepper,iconButton} from '../web/ui-components.mjs';

const directory='test-results/ui-redesign/phase-1';
await mkdir(directory,{recursive:true});
const tokens={'text-xs':'12px','text-sm':'14px','text-md':'16px','text-lg':'20px','text-xl':'24px','leading-tight':'1.3',leading:'1.5','leading-loose':'1.75','weight-regular':'400','weight-medium':'500','weight-bold':'600','space-1':'4px','space-2':'8px','space-3':'12px','space-4':'16px','space-5':'24px','space-6':'32px','radius-sm':'6px','radius-md':'10px','radius-lg':'16px','radius-full':'999px'};
const server=await startSourceAppServer(),browser=await launchBrowser(),errors=[],results=[];
try{
  for(const width of [390,1280])for(const theme of ['light','dark']){
    const coarse=width===390,height=coarse?844:850,context=await browser.newContext({viewport:{width,height},hasTouch:coarse,isMobile:coarse,colorScheme:theme}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${server.url}/ui-gallery.html?theme=${theme}`);
    await page.waitForSelector('body[data-gallery-ready=true]');
    const prefix=`${directory}/${width}-${theme}`;
    const values=await page.evaluate(names=>Object.fromEntries(names.map(name=>[name,getComputedStyle(document.body).getPropertyValue('--'+name).trim()])),[...Object.keys(tokens),'control-h']);
    assert.deepEqual(values,{...tokens,'control-h':coarse?'44px':'36px'});
    assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),coarse);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),theme==='dark');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'gallery must fit the viewport');
    const smallText=await page.evaluate(()=>[...document.querySelectorAll('[class*="ui-"]')].flatMap(el=>[el,...el.querySelectorAll('*')]).filter(el=>el.getClientRects().length&&[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<12).map(el=>el.outerHTML));
    assert.deepEqual(smallText,[],'all component text must be at least 12px');
    assert.equal(await page.locator('.ui-button--compact').first().evaluate(el=>getComputedStyle(el).fontSize),'12px');
    assert.equal(await page.locator('.ui-button--compact').first().evaluate(el=>getComputedStyle(el).paddingInlineStart),'8px');
    assert.equal(await page.locator('.ui-icon-button').first().evaluate(el=>getComputedStyle(el).paddingInlineStart),'4px');
    if(coarse){
      const smallTargets=await page.locator('.ui-button,.ui-icon-button,.ui-list-row,.ui-switch>input,.ui-segmented-option>input,.ui-stepper>button,.ui-stepper>input,.ui-select').evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>({name:el.outerHTML,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})).filter(rect=>rect.width<44||rect.height<44));
      assert.deepEqual(smallTargets,[],'coarse pointer targets must be at least 44 × 44px, including compact and disabled controls');
    }
    const row=await page.locator('.ui-setting-row').first().evaluate(el=>{const a=el.firstElementChild.getBoundingClientRect(),b=el.lastElementChild.getBoundingClientRect();return {below:b.top>=a.bottom,right:b.left>=a.right};});
    assert.equal(coarse?row.below:row.right,true,'setting controls move below the copy on narrow screens');
    await page.screenshot({path:prefix+'-gallery.png',fullPage:true,animations:'disabled'});
    const act=async locator=>coarse?locator.tap():locator.click();
    const formValue=name=>page.locator('#gallery-form').evaluate((form,name)=>new FormData(form).get(name),name);
    const toggle=page.locator('input[name=switch]');
    assert.equal(await formValue('switch'),null);await act(toggle);assert.equal(await formValue('switch'),'on');
    await toggle.focus();await page.keyboard.press('Space');assert.equal(await formValue('switch'),null);
    assert.equal(await toggle.evaluate(el=>el.matches(':focus-visible')),true);
    assert.equal(await toggle.locator('+span').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.screenshot({path:prefix+'-focus.png',fullPage:true,animations:'disabled'});
    const radios=page.locator('input[name=theme]');
    await act(radios.nth(1));assert.equal(await formValue('theme'),'light');
    await radios.nth(1).focus();await page.keyboard.press('ArrowRight');assert.equal(await formValue('theme'),'dark');
    assert.equal(await formValue('theme-disabled'),null);assert.equal(await formValue('switch-on-disabled'),null);
    assert.equal(await radios.evaluateAll(elements=>elements.filter(el=>el.checked).length),1);
    const input=page.locator('input[name=font]'),stepper=input.locator('..'),plus=stepper.locator('[data-ui-step="1"]'),minus=stepper.locator('[data-ui-step="-1"]');
    await page.evaluate(()=>{window.uiEvents=[];for(const type of ['input','change'])document.querySelector('#gallery-form').addEventListener(type,event=>window.uiEvents.push([type,event.target.name,event.target.value]));});
    await act(plus);assert.equal(await formValue('font'),'18');
    assert.deepEqual(await page.evaluate(()=>window.uiEvents),[['input','font','18'],['change','font','18']]);
    await minus.focus();await page.keyboard.press('Enter');assert.equal(await formValue('font'),'16');
    await input.focus();await page.keyboard.press('ArrowUp');assert.equal(await formValue('font'),'18');
    await page.keyboard.press('ArrowDown');assert.equal(await formValue('font'),'16');
    await input.fill('24');await input.press('Tab');assert.equal(await plus.isDisabled(),true);assert.equal(await formValue('font'),'24');
    await input.fill('12');await input.press('Tab');assert.equal(await minus.isDisabled(),true);
    await input.fill('13');assert.equal(await input.evaluate(el=>el.validity.stepMismatch),true);await act(plus);assert.equal(await formValue('font'),'14');
    await input.fill('');await act(plus);assert.equal(await formValue('font'),'12');
    await page.locator('input[name=decimal]').locator('..').locator('[data-ui-step="1"]').click();assert.equal(await formValue('decimal'),'0.3');
    assert.equal(await page.locator('input[name=font-error]').evaluate(el=>el.validity.rangeOverflow),true);
    assert.equal(await formValue('font-disabled'),null);
    await page.locator('#gallery-form').evaluate(form=>form.reset());assert.equal(await formValue('font'),'16');
    assert.equal(await plus.isDisabled(),false);assert.equal(await minus.isDisabled(),false);
    // Rebinding is idempotent; changing native disabled/range attributes updates the buttons.
    await page.evaluate(async()=>{const {bindSteppers}=await import('/ui-components.mjs');bindSteppers();const input=document.querySelector('input[name=font]');input.disabled=true;});
    assert.equal(await plus.isDisabled(),true);
    await page.evaluate(()=>document.querySelector('input[name=font]').disabled=false);
    await act(plus);assert.equal(await formValue('font'),'18');
    await page.evaluate(async()=>{const {stepper,bindSteppers}=await import('/ui-components.mjs');const fieldset=document.createElement('fieldset');fieldset.id='stepper-fieldset';fieldset.disabled=true;fieldset.innerHTML=stepper('fieldset-font',16,{min:12,max:24,step:2});document.querySelector('#gallery-form').append(fieldset);window.disposeFieldset=bindSteppers(fieldset);});
    const fieldsetPlus=page.locator('#stepper-fieldset [data-ui-step="1"]');
    assert.equal(await fieldsetPlus.isDisabled(),true);assert.equal(await formValue('fieldset-font'),null);
    await page.locator('#stepper-fieldset').evaluate(el=>el.disabled=false);assert.equal(await fieldsetPlus.isDisabled(),false);
    await act(fieldsetPlus);assert.equal(await formValue('fieldset-font'),'18');
    await page.evaluate(()=>{document.querySelector('#stepper-fieldset').remove();window.disposeFieldset();});
    const select=page.locator('.ui-select').first();await act(select);await page.locator('.app-choice-list [data-value=jade]').click();assert.equal(await formValue('palette'),'jade');
    await select.focus();await page.keyboard.press('Enter');await page.locator('.app-choice-list [data-value=pine]').press('Enter');assert.equal(await formValue('palette'),'pine');
    if(!coarse){
      const primary=page.locator('.ui-button--primary').first();await primary.hover();
      const enabled=await primary.evaluate(el=>getComputedStyle(el).backgroundColor);
      const disabled=await page.locator('.ui-button--primary:disabled').first().evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(enabled,disabled,'disabled buttons retain the variant color');
      await page.screenshot({path:prefix+'-hover.png',fullPage:true,animations:'disabled'});
      for(const selector of ['.ui-icon-button:disabled','.ui-list-row:disabled']){
        const control=page.locator(selector).first(),before=await control.evaluate(el=>getComputedStyle(el).backgroundColor);
        await control.hover();assert.equal(await control.evaluate(el=>getComputedStyle(el).backgroundColor),before,'disabled controls retain their color on hover');
      }
    }
    for(const id of ['sheet','fullscreen']){
      await act(page.locator(`[data-open=${id}]`));const dialog=page.locator('#'+id);
      assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
      if(coarse){const bounds=await dialog.boundingBox();assert.ok(Math.abs(bounds.y+bounds.height-height)<2);if(id==='fullscreen')assert.equal(bounds.height,height);}
      else {const bounds=await dialog.boundingBox();assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2);assert.ok(Math.abs(bounds.y+bounds.height/2-height/2)<2);}
      await page.screenshot({path:prefix+'-'+id+'.png',animations:'disabled'});
      await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.ui-loading').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
    assert.equal(await page.locator('.ui-switch-track').first().evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
    assert.equal(await page.locator('.ui-stepper>input').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    results.push({width,height,theme,coarse,passed:true});console.log(`PASS gallery ${width}×${height} ${theme}: tokens, targets, native forms, keyboard/pointer, layout and reduced motion`);
    await context.close();
  }
  // A wide touch device still uses coarse-pointer tokens; viewport width does not decide target size.
  const touch=await browser.newContext({viewport:{width:1280,height:850},hasTouch:true,isMobile:true}),page=await touch.newPage();
  await page.goto(server.url+'/ui-gallery.html?lang=en');await page.waitForSelector('body[data-gallery-ready=true]');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--control-h').trim()),'44px');
  assert.equal(await page.locator('input[name=switch]').getAttribute('aria-label'),'Autocomplete');await touch.close();
  // Helper text/attributes cannot inject markup; the control slot deliberately accepts trusted HTML.
  const attack='<img src=x onerror="window.injected=true">';
  for(const markup of [button(attack),iconButton(attack,attack),switchControl(attack,true,attack),segmented(attack,[{value:attack,label:attack}],attack),stepper(attack,12,{label:attack}),settingRow({name:attack,help:attack,control:'<b>trusted</b>'})]){assert.ok(!markup.includes('<img'));assert.ok(markup.includes('&lt;img'));}
  assert.ok(!(await readFile('web/app.js','utf8')).includes('ui-components'));
  for(const root of ['dist/web','entry/src/main/resources/rawfile/web'])for(const name of ['ui-gallery.html','ui-gallery.mjs','ui-components.mjs'])assert.equal(existsSync(root+'/'+name),false,'development entries must not ship: '+root+'/'+name);
  assert.deepEqual(errors,[]);
  await writeFile(directory+'/results.json',JSON.stringify({passed:true,results,errors},null,2));
}finally{await browser.close();await server.close();}
