import assert from 'node:assert/strict';
// Runs against the actual host's editor origin, proving Worker resource loading.
export async function checkNativeNouns(page){
 const previous=await page.evaluate(()=>editorManager.editor.state.doc.toString());
 try{
  await page.evaluate(()=>{const v=editorManager.editor,text='星澜值守着灯塔。林舟说道。\n星';v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus();});
  await page.keyboard.press('Control+Space');await page.waitForFunction(()=>document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('星澜'),{},{timeout:15000});
  await page.waitForTimeout(250);await page.keyboard.press('Enter');assert.ok((await page.evaluate(()=>editorManager.editor.state.doc.toString())).endsWith('星澜'));
  await page.keyboard.press('Control+z');assert.ok((await page.evaluate(()=>editorManager.editor.state.doc.toString())).endsWith('星'));
 }finally{await page.keyboard.press('Escape');await page.evaluate(text=>{const v=editorManager.editor;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:0}});window.wenzhouSave();},previous);await page.waitForTimeout(2100); // CodeMirror Escape temporarily enables keyboard focus navigation.
 }
}
