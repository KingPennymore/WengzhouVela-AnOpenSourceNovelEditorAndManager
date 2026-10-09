import {downloadPlan} from './sync-plan.mjs';
import {diffMarkup} from './sync-preview.mjs';
import {conflictMarkup,bindConflict} from './sync-conflicts.mjs';
import {toBase64} from './plugin-package.mjs';
import {MAX_TEXT_BYTES} from './model.mjs';

export function previewDownload({workspace,result,folder,onApply,openModal,escape:esc,checkpoint,save}){
  const plan=downloadPlan(workspace,result,folder),resolvers=new Map(),labels={new:'新增',remote:'远端更新',unchanged:'相同',local:'仅本地修改 · 保留',conflict:'本地修改 · 请选择处理方式'};
  openModal('确认拉取文件',`<p>${esc(result.repo)} · ${esc(folder)}</p><p>未勾选的文件保留本地内容。拉取不会自动打开文稿。</p><div class="sync-files">${plan.map((item,i)=>`<section data-download="${i}"><label class="checkbox"><input name="downloadFiles" type="checkbox" value="${i}" ${item.selected?'checked':''}><span>${esc(item.file.path)}<small>${labels[item.state]}</small></span></label>${item.state==='conflict'&&typeof item.file.text==='string'?`<label>处理方式<select data-resolution="${i}"><option value="">请选择…</option><option value="merge">逐段合并</option><option value="local">保留本地全文</option><option value="remote">采用远端全文</option></select></label><div class="sync-resolver" hidden></div>`:typeof item.file.text==='string'&&item.state!=='unchanged'?`<details><summary>对照内容</summary>${diffMarkup(item.doc?.text||'',item.file.text,esc)}</details>`:''}</section>`).join('')}</div>`,async form=>{
    const selected=new Set(form.getAll('downloadFiles').map(Number));if(!selected.size&&!plan.every(item=>['unchanged','local'].includes(item.state)))throw Error('请选择需要拉取的文件。');
    const files=[];
    for(const [i,item] of plan.entries())if(selected.has(i)){
      if(item.doc&&item.beforeText!==workspace.documents.find(doc=>doc.id===item.doc.id)?.text)throw Error('本地文稿已变化，请重新拉取。');
      let file=item.file;
      if(item.state==='conflict'&&typeof file.text==='string'){
        const choice=document.querySelector(`[data-resolution="${i}"]`).value;
        if(!choice)throw Error('请为冲突文件选择处理方式：'+file.path);
        const text=choice==='merge'?resolvers.get(i)():choice==='local'?item.beforeText:file.text;
        const bytes=new TextEncoder().encode(text);if(bytes.length>MAX_TEXT_BYTES)throw Error('合并后的文件超过 8 MB。');
        file={...file,remoteText:file.text,text,data:toBase64(bytes)};
      }
      files.push(file);if(item.doc)checkpoint(item.doc);
    }
    if(!save())throw Error('备份本地历史失败，未写入拉取文件。');
    const keptConflicts=plan.filter((item,i)=>item.state==='conflict'&&!selected.has(i)).map(item=>item.file.path);
    await onApply({...result,files,keptConflicts});
  },{label:'写入选中文件'});
  for(const select of document.querySelectorAll('[data-resolution]'))select.onchange=()=>{
    const i=Number(select.dataset.resolution),item=plan[i],root=select.closest('[data-download]').querySelector('.sync-resolver');
    root.hidden=select.value!=='merge';
    if(select.value==='merge'&&!resolvers.has(i)){root.innerHTML=conflictMarkup(item.beforeText,item.file.text,esc);resolvers.set(i,bindConflict(root,{base:item.doc?.remote?.lastSyncedText,local:item.beforeText,remote:item.file.text,escape:esc}));}
  };
}
