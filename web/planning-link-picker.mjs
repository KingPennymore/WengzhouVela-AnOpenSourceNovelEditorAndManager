import {planningSheet} from './planning-sheet.mjs';
import {t} from './i18n.mjs';

// Shared file/link flow for map destinations and outline glossary entries.
export function planningLinkPicker(root,{title,files,sourceName,sourceLabel,selected='',entryLabel,load,emptyMessage,onSubmit,escape:esc,opener,parent,overlay=false}){
 const active=planningSheet(root,{title,escape:esc,opener,parent,overlay,html:`<form class="map-info-form planning-link-form"><label>${sourceLabel}<select name="${sourceName}">${files.map(file=>`<option value="${esc(file.path)}" ${file.path===selected?'selected':''} data-user-content>${esc(file.path)}</option>`).join('')}</select></label>${entryLabel?`<label>${entryLabel}<select name="entry"></select></label>`:''}<p role="alert"></p><button class="primary" type="submit" disabled>${t('添加链接')}</button></form>`});
 const form=active.body.querySelector('form'),source=form.elements[sourceName],button=form.querySelector('button'),alert=form.querySelector('[role=alert]');let epoch=0,data=null,busy=false;
 const refresh=async()=>{
  const token=++epoch;data=null;button.disabled=true;alert.textContent='';form.elements.entry?.replaceChildren();
  try{
   if(!files.length)throw Error(emptyMessage);
   const result=load?await load(source.value):{};
   if(token!==epoch||!active.sheet.isConnected)return;
   data=result;
   if(entryLabel){form.elements.entry.innerHTML=result.entries.map(entry=>`<option value="${esc(entry.id)}" data-user-content>${esc(entry.term)}</option>`).join('');if(!result.entries.length)alert.textContent=t('术语库没有词条。');}
   button.disabled=!!entryLabel&&!result.entries.length;
  }catch(error){if(token===epoch&&active.sheet.isConnected)alert.textContent=t(error.message);}
 };
 source.onchange=refresh;source.disabled=!files.length;
 form.onsubmit=async event=>{
  event.preventDefault();if(button.disabled||busy||!data)return;
  const path=source.value,entry=entryLabel?data.entries.find(entry=>entry.id===form.elements.entry.value):null;if(entryLabel&&!entry)return;
  busy=true;button.disabled=true;source.disabled=true;
  try{if(await onSubmit({path,entry,data})!==false&&active.sheet.isConnected)active.close();}
  catch(error){if(active.sheet.isConnected)alert.textContent=t(error.message);}
  finally{busy=false;if(active.sheet.isConnected){source.disabled=!files.length;button.disabled=!data||!!entryLabel&&!data.entries.length;}}
 };
 refresh();return {...active,form};
}
