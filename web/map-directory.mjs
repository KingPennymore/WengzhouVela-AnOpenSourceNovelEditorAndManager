import {icon} from './icons.mjs';
import {infoCategory,categoryTitle,infoSymbolSvg} from './map-info.mjs';
import {t,say} from './i18n.mjs';
/** Built-in views use the same registry and planning bridge available to plugins. */
export function registerMapDirectory({sidebars,context,snapshot,navigate,apply,escape:esc,fail}){
  const states=new Map();
  const state=()=>{
    const id=context.get().file?.id;
    if(!states.has(id)){
      if(states.size>=32)states.delete(states.keys().next().value);
      states.set(id,{query:'',categories:new Set()});
    }
    return states.get(id);
  };
  let left,right,registration,labels,directoryTitle,labelsTitle;
  const localizeDirectory=()=>{
    const title=t('信息点');
    if(title===directoryTitle)return;
    directoryTitle=title;
    registration?.update({title});
  };
  const localizeLabels=()=>{
    const title=t('地图名称');
    if(title===labelsTitle)return;
    labelsTitle=title;
    labels?.update({title});
  };
  registration=sidebars.register(
    'vela.map',
    {
      id:'points',
      title:t('信息点'),
      icon:'pin',
      side:'left',
      documentKinds:['MAP'],
      modes:['preview'],
      mount({body}){
        body.innerHTML=`<div class="map-directory">
            <header>
              <strong>${t('信息点')}</strong>
              <p>${t('查找地点，定位到地图')}</p>
            </header>
            <label class="map-directory-search">${icon('search')}<input type="search" aria-label="${t('搜索信息点')}" placeholder="${t('搜索名称或备注')}">
            </label>
            <details class="map-directory-filter">
              <summary data-filter-summary>${t('筛选列表类别')}</summary>
              <p class="map-filter-hint">${t('仅筛选下方列表，不改变地图上的名称。')}</p>
              <button type="button" data-clear-categories>${t('全部类别')}</button>
              <div data-directory-categories>
              </div>
            </details>
            <div class="map-directory-meta">
              <p data-directory-count role="status">
              </p>
              <button type="button" data-reset-directory hidden>${t('重置筛选')}</button>
            </div>
            <div class="map-directory-list" data-directory-list>
            </div>
          </div>`;
        const input=body.querySelector('input'),
          filter=body.querySelector('[data-directory-categories]'),
          list=body.querySelector('[data-directory-list]'),
          count=body.querySelector('[data-directory-count]');
        let last='',fileId='';
        const render=()=>{
          const data=snapshot();
          if(!data)return;
          const id=context.get().file.id,s=state(),signature=JSON.stringify([id,data.points]);
          if(signature===last)return;
          last=signature;
          if(fileId!==id){
            fileId=id;
            input.value=s.query;
          }
          const cats=[...new Set(data.points.map(infoCategory))].sort((a,b)=>a.localeCompare(b));
          for(const category of s.categories)if(!cats.includes(category))s.categories.delete(category);
          filter.replaceChildren();
          for(const c of cats){
            const label=document.createElement('label'),check=document.createElement('input');
            check.type='checkbox';
            check.checked=s.categories.has(c);
            check.onchange=()=>{
              check.checked?s.categories.add(c):s.categories.delete(c);
              results();
            };
            label.append(check,document.createTextNode(categoryTitle(c)));
            filter.append(label);
          }
          results();
        };
        const results=()=>{
          const data=snapshot();
          if(!data)return;
          const s=state(),
            q=s.query.trim().toLocaleLowerCase(),
            points=data.points.filter(p=>(!s.categories.size||s.categories.has(infoCategory(p)))&&(!q||`${p.name||''} ${p.note||''}`.toLocaleLowerCase().includes(q)));
          count.textContent=say(`${points.length} / ${data.points.length} 个信息点`,`${points.length} / ${data.points.length} information points`);
          body.querySelector('[data-reset-directory]').hidden=!s.query&&!s.categories.size;
          body.querySelector('[data-filter-summary]').textContent=t('筛选列表类别')+(s.categories.size?' · '+s.categories.size:'');
          list.replaceChildren();
          let shown=0;
          const more=()=>{
            list.querySelector('[data-directory-more]')?.remove();
            for(const point of points.slice(shown,shown+100)){
              const row=document.createElement('div');
              row.className='map-directory-row';
              const locate=document.createElement('button');
              locate.type='button';
              locate.dataset.locateInfo=point.id;
              locate.innerHTML=`<span class="map-directory-icon">${infoSymbolSvg(point.symbol,esc)||icon('pin')}</span>
                <span>
                  <strong data-user-content>${esc(point.name||t('未命名信息点'))}</strong>
                  <small data-user-content>${esc(categoryTitle(infoCategory(point)))}</small>
                </span>`;
              locate.title=t('定位')+' · '+(point.name||'');
              locate.onclick=()=>{
                navigate({id:point.id,collection:'markers'});
                if(innerWidth<900)registration.hide();
              };
              const detail=document.createElement('button');
              detail.type='button';
              detail.className='map-directory-detail';
              detail.innerHTML=icon('info');
              detail.setAttribute('aria-label',t('详情')+' · '+(point.name||''));
              detail.onclick=()=>{
                navigate({id:point.id,collection:'markers',details:true});
                if(innerWidth<900)registration.hide();
              };
              row.append(locate,detail);
              list.append(row);
            }
            shown+=100;
            if(shown<points.length){
              const button=document.createElement('button');
              button.type='button';
              button.dataset.directoryMore='';
              button.textContent=t('显示更多');
              button.onclick=more;
              list.append(button);
            }
          };
          if(points.length)more();else{
            const empty=document.createElement('p');
            empty.className='blank';
            empty.textContent=data.points.length?t('没有匹配的信息点'):t('使用信息点工具，在地图上添加地点。');
            list.append(empty);
          }
        };
        body.querySelector('[data-reset-directory]').onclick=()=>{
          const s=state();
          s.query='';
          s.categories.clear();
          input.value='';
          last='';
          render();
          input.focus();
        };
        body.querySelector('[data-clear-categories]').onclick=()=>{
          state().categories.clear();
          last='';
          render();
        };
        input.oninput=()=>{
          state().query=input.value;
          results();
        };
        left=render;
        render();
        return ()=>{
          left=null;
        };
      },
      onContextChange(){
        localizeDirectory();
        left?.();
      }
    });
  labels=sidebars.register(
    'vela.map',
    {
      id:'labels',
      title:t('地图名称'),
      icon:'list',
      side:'right',
      documentKinds:['MAP'],
      modes:['preview'],
      mount({body}){
        body.innerHTML=`<div class="map-label-controls">
            <header>
              <strong>${t('地图名称')}</strong>
              <p>${t('按类别控制地图上的名称，圆点与图标始终保留。')}</p>
            </header>
            <div class="vela-extension-toolbar">
              <button data-label-all>${t('全部显示')}</button>
              <button data-label-none>${t('全部隐藏')}</button>
            </div>
            <div data-label-categories>
            </div>
          </div>`;
        const box=body.querySelector('[data-label-categories]');
        let revision='';
        const update=async hidden=>{
          for(const el of body.querySelectorAll('button,input'))el.disabled=true;
          try{
            await apply({hiddenCategories:hidden});
          }catch(error){
            fail(error);
          }finally{
            for(const el of body.querySelectorAll('button,input'))el.disabled=false;
            revision='';
            render();
          }
        };
        body.querySelector('[data-label-all]').onclick=()=>update([]);
        body.querySelector('[data-label-none]').onclick=()=>update([...new Set((snapshot()?.points||[]).map(infoCategory))]);
        const render=()=>{
          const data=snapshot();
          if(!data)return;
          const signature=JSON.stringify([data.fileId,data.points.map(p=>[p.id,p.category]),data.labels]);
          if(signature===revision)return;
          revision=signature;
          const hidden=new Set(data.labels?.hiddenCategories||[]),cats=[...new Set(data.points.map(infoCategory))].sort((a,b)=>a.localeCompare(b));
          box.replaceChildren();
          for(const c of cats){
            const label=document.createElement('label');
            label.className='map-label-category';
            const check=document.createElement('input');
            check.type='checkbox';
            check.checked=!hidden.has(c);
            check.dataset.labelCategory=c;
            check.onchange=()=>{
              const next=new Set(snapshot()?.labels?.hiddenCategories||[]);
              check.checked?next.delete(c):next.add(c);
              update([...next]);
            };
            const text=document.createElement('span');
            text.textContent=categoryTitle(c);
            const count=document.createElement('small');
            count.textContent=data.points.filter(p=>infoCategory(p)===c).length;
            label.append(check,text,count);
            box.append(label);
          }
          if(!cats.length)box.textContent=t('添加信息点后可设置名称显示。');
        };
        right=render;
        render();
        return ()=>{
          right=null;
        };
      },
      onContextChange(){
        localizeLabels();
        right?.();
      }
    });
  return {
    showDirectory:()=>{
      localizeDirectory();
      return registration.show();
    },
    showLabels:()=>{
      localizeLabels();
      return labels.show();
    }
  };
}
