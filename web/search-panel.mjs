import {search,SearchQuery,getSearchQuery,setSearchQuery,findNext,findPrevious,replaceNext,replaceAll,selectMatches,closeSearchPanel} from '@codemirror/search';
import {t} from './i18n.mjs';

class SearchPanel {
  constructor(view){
    this.view=view;this.top=true;this.dom=document.createElement('section');this.dom.className='cm-search vela-search-panel';this.dom.setAttribute('aria-label',t('查找与替换'));
    this.dom.innerHTML=`<header><strong>${t('查找与替换')}</strong><output class="search-feedback" role="status"></output><button type="button" name="close" aria-label="${t('关闭查找与替换')}">×</button></header><div class="search-fields"><label>${t('查找')}<input name="search" type="search" placeholder="${t('输入要查找的内容')}" main-field="true"></label><div class="search-actions"><button type="button" name="previous">${t('上一处')}</button><button type="button" name="next">${t('下一处')}</button><button type="button" name="select">${t('选择全部匹配')}</button></div><label>${t('替换为')}<input name="replace" type="text" placeholder="${t('输入替换内容，可留空')}" ></label><div class="search-actions"><button type="button" name="replace-next">${t('替换当前')}</button><button type="button" name="replace-all">${t('全部替换')}</button></div></div><div class="search-options"><label><input name="case" type="checkbox">${t('区分大小写')}</label><label><input name="word" type="checkbox">${t('全词匹配')}</label><label><input name="regexp" type="checkbox">${t('正则表达式')}</label></div>`;
    const field=name=>this.dom.querySelector(`[name="${name}"]`);this.fields=Object.fromEntries(['search','replace','case','word','regexp'].map(name=>[name,field(name)]));
    const commit=()=>{view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:this.fields.search.value,replace:this.fields.replace.value,caseSensitive:this.fields.case.checked,wholeWord:this.fields.word.checked,regexp:this.fields.regexp.checked}))});};
    for(const input of Object.values(this.fields))input.addEventListener(input.type==='checkbox'?'change':'input',commit);
    for(const [name,command] of Object.entries({previous:findPrevious,next:findNext,select:selectMatches,'replace-next':replaceNext,'replace-all':replaceAll}))field(name).onclick=()=>{command(view);this.feedback();};
    field('close').onclick=()=>{closeSearchPanel(view);view.focus();};
    this.dom.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearchPanel(view);view.focus();}else if(event.key==='Enter'&&event.target.matches('input')){event.preventDefault();commit();if(event.target===this.fields.replace)replaceNext(view);else(event.shiftKey?findPrevious:findNext)(view);}};
    this.query=null;this.sync();
  }
  mount(){this.fields.search.focus();this.fields.search.select();}
  update(update){if(getSearchQuery(update.state)!==this.query)this.sync();else if(update.docChanged||update.selectionSet)this.feedback();}
  sync(){const query=this.query=getSearchQuery(this.view.state);this.fields.search.value=query.search;this.fields.replace.value=query.replace;this.fields.case.checked=query.caseSensitive;this.fields.word.checked=query.wholeWord;this.fields.regexp.checked=query.regexp;this.feedback();}
  feedback(){
    clearTimeout(this.timer);const query=this.query,output=this.dom.querySelector('output'),readonly=this.view.state.readOnly;
    this.fields.search.setAttribute('aria-invalid',String(!!query.search&&!query.valid));
    for(const button of this.dom.querySelectorAll('.search-actions button'))button.disabled=!query.valid||readonly&&button.name.startsWith('replace');
    if(!query.search){output.textContent=t('输入内容开始查找');return;}if(!query.valid){output.textContent=t('正则表达式无效');return;}
    this.timer=setTimeout(()=>{const cursor=query.getCursor(this.view.state.doc);let count=0;while(!cursor.next().done&&count<1000)count++;output.textContent=count?`${count}${count===1000?'+':''} ${t('处匹配')}`:t('没有找到匹配内容');},100);
  }
  destroy(){clearTimeout(this.timer);}
}
export const editorSearch=()=>search({top:true,createPanel:view=>new SearchPanel(view)});
