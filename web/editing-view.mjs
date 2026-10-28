import {chapterEdit,searchFiles,replacementPlan,makeAnnotation} from './editing-tools.mjs';
import {resolveAnchor,diffLines} from './document-service.mjs';
import {mountAnnotationList} from './annotation-list.mjs';
import {mountIncrementalList} from './incremental-list.mjs';
import {icon} from './icons.mjs';
import {t,say} from './i18n.mjs';
export class EditingTools{
  constructor(host){
    Object.assign(this,host);
  }
  commands(){
    return [
      {name:t('章节管理'),key:'',run:()=>this.chapters()},
      {name:t('工作区搜索与替换'),key:'Ctrl+Shift+F',run:()=>this.search()},
      {name:t('词库与写作片段'),key:'',run:()=>this.glossary()},
      {name:t('书签、批注与写作标记'),key:'',run:()=>this.annotations()},
      {name:t('添加书签'),key:'Ctrl+Alt+B',run:()=>this.bookmark()},
      {name:t('源码与预览并排'),key:'',run:()=>this.split()}
    ];
  }
  replace(doc,text){
    this.documents.checkpoint(doc);
    if(doc.id===this.current()?.id&&this.view())this.view().dispatch({changes:{from:0,to:this.view().state.doc.length,insert:text},userEvent:'input.tools'});else{
      this.documents.change(doc,text,[],{important:true});
      this.invalidate(doc.id);
    }
  }
  chapters(){
    const doc=this.current(),sections=this.index()?.sections;
    if(!doc||!sections)return;
    const esc=this.escape,source=doc.text;
    let selected=0;
    const apply=(action,value)=>{
      if(doc!==this.current()||doc.text!==source)throw Error(t('文稿已变化，请重新预览。'));
      if(action==='rename'&&(!value||value.includes('\n')||!this.matcher()(value)))throw Error(t('新标题需要符合自动识别规则。'));
      this.replace(doc,chapterEdit(doc.text,sections,selected,action,value));
      if(!this.save())throw Error(t('保存失败'));
    };
    this.modal(
      t('章节管理'),
      `<div class="chapter-manager">
          <input data-chapter-search type="search" placeholder="${t('搜索章节')}" aria-label="${t('搜索章节')}">
          <div class="chapter-manager-list"></div>
          <input type="hidden" name="chapter" value="0">
          <label>${t('新标题')}<input name="title" value="${esc(sections[0]?.title||'')}"></label>
          <div class="button-row">
            <button type="button" data-chapter-action="up" aria-label="${t('上移章节')}">${icon('chevronUp')}${t('上移章节')}</button>
            <button type="button" data-chapter-action="down" aria-label="${t('下移章节')}">${icon('chevronDown')}${t('下移章节')}</button>
            <button type="button" class="danger" data-chapter-action="delete">${t('删除章节及正文')}</button></div>
          <p>${t('删除和移动会先保留本地历史，也可以在当前编辑器撤销。')}</p></div>`,
      form=>apply('rename',form.get('title').trim()),
      {label:t('更改标题')});
    const root=document.querySelector('.chapter-manager'),input=root.querySelector('[name=title]'),buttons=[...root.querySelectorAll('[data-chapter-action]')];
    const list=mountIncrementalList(
      root.querySelector('.chapter-manager-list'),
      {
        items:sections.map((section,i)=>({...section,index:i})),
        signal:document.querySelector('#dialog-body').viewSession?.signal,
        renderItem:section=>`<button type="button" data-chapter="${section.index}" aria-pressed="${section.index===selected}"><span>${section.index+1}</span><strong data-user-content>${esc(section.title)}</strong></button>`
      });
    const update=()=>{
      for(const button of root.querySelectorAll('[data-chapter]'))button.setAttribute('aria-pressed',String(Number(button.dataset.chapter)===selected));
      buttons[0].disabled=!selected;
      buttons[1].disabled=selected>=sections.length-1;
      buttons[2].disabled=!sections.length;
    };
    update();
    root.querySelector('[data-chapter-search]').oninput=e=>{
      const query=e.target.value.toLocaleLowerCase();
      list.setItems(sections.map((section,index)=>({...section,index})).filter(section=>section.title.toLocaleLowerCase().includes(query)));
      update();
    };
    root.onclick=e=>{
      const row=e.target.closest('[data-chapter]');
      if(row){
        selected=Number(row.dataset.chapter);
        root.querySelector('[name=chapter]').value=selected;
        input.value=sections[selected].title;
        buttons[2].dataset.confirm='';
        buttons[2].textContent=t('删除章节及正文');
        update();
        return;
      }
      const action=e.target.closest('[data-chapter-action]');
      if(!action)return;
      try{
        if(action.dataset.chapterAction==='delete'&&!action.dataset.confirm){
          action.dataset.confirm='1';
          action.textContent=t('确认删除');
          return;
        }
        apply(action.dataset.chapterAction==='delete'?'delete':'move',selected+(action.dataset.chapterAction==='up'?-1:1));
        this.chapters();
      }catch(error){
        document.querySelector('#dialog-error').textContent=t(error.message);
      }
    };
  }
  search(){
    const controller=new AbortController(),esc=this.escape;
    let results=[];
    this.modal(
      t('工作区搜索与替换'),
      `<label>${t('搜索')}<input name="query" required></label>
        <label>${t('替换为')}<input name="replacement"></label>
        <label>${t('范围')}<select name="scope">
            <option value="workspace">${t('当前工作区')}</option>
            <option value="file">${t('当前文稿')}</option>
            <option value="all">${t('内部文件夹全部文本')}</option></select>
        </label>
        <label class="checkbox">
          <input name="case" type="checkbox">${t('区分大小写')}</label>
        <div class="button-row">
          <button type="button" id="workspace-search" class="primary">${t('搜索')}</button>
          <button type="button" id="replace-preview" disabled class="secondary">${t('预览替换')}</button></div>
        <output id="search-progress"></output>
        <div id="workspace-results"></div>`,
      null,
      {noSubmit:true,cancel:()=>controller.abort()});
    const $=selector=>document.querySelector(selector);
    $('#workspace-search').onclick=async()=>{
      try{
        const form=new FormData($('#dialog-body').closest('form')),
          current=this.current(),
          scope=this.scope(),
          files=this.workspace().documents.filter(doc=>form.get('scope')==='file'?doc.id===current?.id:form.get('scope')==='all'||!scope||(doc.path||doc.name).startsWith(scope+'/'));
        $('#workspace-search').disabled=true;
        results=await searchFiles(files,form.get('query'),{caseSensitive:form.has('case'),signal:controller.signal,onProgress:(done,total)=>$('#search-progress').textContent=`${done}/${total}`});
        $('#workspace-results').innerHTML=results.map((item,i)=>`<button type="button" class="search-result" data-result="${i}">
            <strong>${esc(item.path)}:${item.line}</strong>
            <span data-user-content>${esc(files.find(doc=>doc.id===item.id).text.slice(Math.max(0,item.offset-24),item.end+60))}</span></button>`).join('');
        $('#search-progress').textContent=say(`${results.length}${results.length===1000?'+':''} 处匹配`,`${results.length}${results.length===1000?'+':''} matches`);
        $('#replace-preview').disabled=!results.length;
      }catch(error){
        if(!controller.signal.aborted)this.fail(error);
      }finally{
        if($('#workspace-search'))$('#workspace-search').disabled=false;
      }
    };
    $('#workspace-results').onclick=e=>{
      const b=e.target.closest('[data-result]');
      if(!b)return;
      const item=results[Number(b.dataset.result)];
      this.close();
      this.open(item.id);
      this.jump(item.offset);
    };
    $('#replace-preview').onclick=()=>{
      try{
        const replacement=$('#dialog-body [name=replacement]').value,plan=replacementPlan(this.workspace().documents,results,replacement);
        this.modal(
          t('确认批量替换'),
          `<p>${say(`${plan.length} 个文件，${results.length} 处替换。保留修改前的本地历史。`,`${plan.length} files, ${results.length} replacements. Local history is kept before changes.`)}</p>${plan.map(item=>{
            const diff=diffLines(item.before,item.after,80);
            return `<details><summary>${esc(this.workspace().documents.find(doc=>doc.id===item.id).path||item.id)}</summary><pre>${esc(diff.removed.map(line=>'- '+line).join('\n')+'\n'+diff.added.map(line=>'+ '+line).join('\n'))}</pre></details>`;
          }).join('')}`,
          ()=>{
            for(const item of plan)if(this.workspace().documents.find(doc=>doc.id===item.id)?.text!==item.before)throw Error(t('文稿已变化，请重新预览。'));
            for(const item of plan)this.replace(this.workspace().documents.find(doc=>doc.id===item.id),item.after);
            if(!this.save())throw Error(t('保存失败；改动和恢复历史仍保留。'));
          },
          {label:t('替换全部')});
      }catch(error){
        this.fail(error);
      }
    };
  }
  glossary(){
    const snippetHint='每行：名称 | 内容；使用 \\n 表示换行';
    const tools=this.workspace().writingTools||{},esc=this.escape;
    this.modal(
      t('词库与写作片段'),
      `<label>${t('词库')}<textarea name="glossary" rows="8" placeholder="${t('每行一个人名、地名或专有名词')}">${esc((tools.glossary||[]).join('\n'))}</textarea></label>
        <label>${t('片段')}<textarea name="snippets" rows="8" placeholder="${t(snippetHint)}">${esc((tools.snippets||[]).map(item=>item.label+' | '+item.text.replaceAll('\n','\\n')).join('\n'))}</textarea></label>`,
      form=>{
        this.workspace().writingTools={
          ...tools,
          glossary:[...new Set(form.get('glossary').split(/\r?\n/).map(line=>line.trim()).filter(Boolean))].slice(0,1000),
          snippets:form.get('snippets').split(/\r?\n/).filter(Boolean).map(line=>{
            const at=line.indexOf('|');
            if(at<1)throw Error(t('片段需使用“名称 | 内容”。'));
            return {label:line.slice(0,at).trim(),text:line.slice(at+1).trim().replaceAll('\\n','\n')};
          }).slice(0,100)
        };
        this.save();
      });
  }
  bookmark(){
    const doc=this.current(),range=this.view()?.state.selection.main;
    if(!doc||!range)return;
    const workspace=this.workspace();
    workspace.annotations={...workspace.annotations,[doc.id]:[...(workspace.annotations?.[doc.id]||[]),makeAnnotation(doc,range)]};
    this.save();
    this.toast(t('已添加书签'));
  }
  annotations(){
    const doc=this.current();
    if(!doc)return;
    const esc=this.escape,entries=this.workspace().annotations?.[doc.id]||[],range=this.view()?.state.selection.main||{from:0,to:0};
    this.modal(
      t('书签、批注与写作标记'),
      `<label>${t('类型')}<select name="kind">
            <option value="note">${t('批注')}</option>
            <option value="todo">${t('待修改')}</option>
            <option value="bookmark">${t('书签')}</option></select>
        </label>
        <label>${t('内容')}<textarea name="note" rows="3"></textarea>
        </label>
        <button type="button" id="add-annotation" class="primary">${t('标记当前位置或选择文字')}</button>
        <div class="annotation-list"></div>`,
      null,
      {noSubmit:true});
    const root=document.querySelector('#dialog-body'),mounted=root.viewSession;
    root.querySelector('#add-annotation').onclick=()=>{
      const form=new FormData(root.closest('form')),workspace=this.workspace();
      workspace.annotations={...workspace.annotations,[doc.id]:[...entries,makeAnnotation(doc,range,form.get('note'),form.get('kind'))]};
      this.save();
      this.annotations();
    };
    const list=mountAnnotationList(
      root.querySelector('.annotation-list'),
      {
        entries,
        escape:esc,
        signal:mounted?.signal,
        openAttribute:'anchor',
        deleteAttribute:'delete-anchor',
        onOpen:mark=>{
          const entry=resolveAnchor(doc.text,mark);
          if(entry.needsReview){
            this.toast(t('文字位置有多处匹配，请重新确认标记。'));
            return;
          }
          this.close();
          this.jump(entry.offset);
        },
        onRemove:removed=>{
          const chosen=new Set(removed);
          this.workspace().annotations[doc.id]=entries.filter(entry=>!chosen.has(entry));
          this.save();
          this.annotations();
        }
      });
    mounted?.onDispose(()=>list.dispose());
  }
}
