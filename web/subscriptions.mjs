import {decodeContent,MAX_TEXT_BYTES} from './model.mjs';
import {parseVela,readingItems,configFolder,velaVisiblePaths} from './vela.mjs';
import {GitHub} from './github.mjs';
import {t,say} from './i18n.mjs';
import {textBytes,MB} from './text-utils.mjs';
import {icon} from './icons.mjs';
import {segmented} from './ui-components.mjs';
export function subscriptionRepo(value){
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error(t('请输入 HTTPS GitHub 仓库地址。'));
  const parts=url.pathname.replace(/\/$/,'').split('/').filter(Boolean);
  if(parts.length!==2||parts.some(part=>!(/^[\w.-]+$/).test(part)||part.includes('..')))throw new Error(t('请输入仓库首页地址，例如 https://github.com/owner/repository。'));
  const name=parts[1].replace(/\.git$/,'');
  if(!name)throw new Error(t('请输入有效的仓库名称。'));
  return parts[0]+'/'+name;
}
export function subscriptionChanged(previous,next){
  if(!previous)return false;
  if(next.vela){
    if(!previous.vela)return false;
    return Object.keys(next.watched).some(path=>Object.hasOwn(previous.watched,path)&&previous.watched[path]!==next.watched[path]);
  }
  return previous.signature!==next.signature;
}
/** A stored refresh error as a sentence the reader can act on; browser network errors arrive in English. */
export function refreshError(message){
  const text=t(message);
  if(text!==message)return text;
  if(/failed to fetch|networkerror|network request failed|load failed|timed? ?out/i.test(message))return t('网络连接失败，请检查网络后重试。');
  return say(`刷新失败：${message}`,`Refresh failed: ${message}`);
}
export class SubscriptionAPI {
  constructor(transport){
    this.transport=transport;
    this.client=new GitHub((_operation,payload)=>transport('publicApi',payload));
    this.blobs=new Map();
  }
  get(path,signal){
    return this.client.request(path,'GET',undefined,{signal});
  }
  async blob(repo,sha,max=MAX_TEXT_BYTES,signal){
    const key=repo.toLowerCase()+'/'+sha,cached=this.blobs.get(key);
    if(cached){
      if(cached.size>max)throw Error(t('订阅文件过大或编码不受支持。'));
      this.blobs.delete(key);
      this.blobs.set(key,cached);
      return cached.text;
    }
    const value=await this.get(`/repos/${repo}/git/blobs/${sha}`,signal);
    if(value.size>max||value.encoding!=='base64')throw new Error(t('订阅文件过大或编码不受支持。'));
    const text=decodeContent(value.content);
    if(textBytes(text)>max)throw Error(t('订阅文件过大或编码不受支持。'));
    this.blobs.set(key,{text,size:value.size});
    let size=[...this.blobs.values()].reduce((sum,item)=>sum+item.text.length,0);
    while(size>4*MB||this.blobs.size>64){
      const key=this.blobs.keys().next().value;
      size-=this.blobs.get(key).text.length;
      this.blobs.delete(key);
    }
    return text;
  }
  async snapshot(repo,signal){
    const base='/repos/'+repo,info=await this.get(base,signal);
    let releases=[];
    try{
      releases=await this.get(base+'/releases?per_page=20',signal);
    }catch(error){
      if(error.status!==404)throw error;
    }
    const tree=await this.get(base+'/git/trees/'+encodeURIComponent(info.default_branch)+'?recursive=1',signal);
    if(tree.truncated)throw new Error(t('仓库目录超过 GitHub 递归树限制，未更新订阅缓存。'));
    const files=tree.tree||[];
    if(files.length>100000)throw new Error(t('仓库目录过大。'));
    const configEntries=files.filter(item=>item.type==='blob'&&item.path.split('/').at(-1)==='.vela');
    if(configEntries.length>32)throw new Error(t('仓库含有超过 32 个 .vela 配置。'));
    const configs=[];
    for(const item of configEntries){
      const text=await this.blob(repo,item.sha,262144,signal);
      configs.push({path:item.path,folder:configFolder(item.path),sha:item.sha,text,config:parseVela(text)});
    }
    const visible=velaVisiblePaths(files,configs),byPath=new Map(files.map(item=>[item.path,item]));
    if(visible.length>5000)throw new Error(t('阅读文件不能超过 5000 个。'));
    const watched=Object.fromEntries(visible.map(path=>[path,byPath.get(path).sha]));
    // Keep missing configured paths in the baseline: a later first publication is an update.
    for(const item of configs)for(const {path} of readingItems(item.config)){
      const full=(item.folder?item.folder+'/':'')+path;
      if(!Object.hasOwn(watched,full))watched[full]=null;
    }
    const changelog=files.find(item=>item.type==='blob'&&/(^|\/)(changelog|changes|history)(\.(md|markdown|txt))?$/i.test(item.path));
    return {
      tree:tree.sha,
      name:info.full_name,
      description:info.description||'',
      branch:info.default_branch,
      vela:configs.length>0,
      configs,
      watched,
      files:visible.map(path=>byPath.get(path)).map(({path,sha,size})=>({path,sha,size})),
      releases:releases.filter(item=>!item.draft).map(item=>({name:item.name||item.tag_name,tag:item.tag_name,body:item.body||'',published:item.published_at,url:item.html_url})),
      changelog:changelog?{path:changelog.path,sha:changelog.sha}:null,
      signature:JSON.stringify([info.pushed_at,tree.sha,releases.map(item=>[item.id,item.updated_at,item.published_at])]),
      checkedAt:Date.now()
    };
  }
}
export class Subscriptions {
  constructor(options){
    Object.assign(this,options);
    this.api=new SubscriptionAPI(options.transport);
    this.selected=new Set();
    this.detail=null;
    this.running=null;
    this.visited=false;
    this.filter='all';
    this.selecting=false;
  }
  items(){
    return this.workspace().subscriptions||=[];
  }
  dot(){
    const unseen=this.items().some(item=>item.unread&&!item.pageSeen);
    this.nav.querySelector('.update-dot').hidden=!unseen;
  }
  enter(){
    this.visited=true;
    for(const item of this.items())item.pageSeen=true;
    this.saveLater();
    this.dot();
    this.render();
    this.refresh();
  }
  leave(){
    this.visited=false;
  }
  async add(url){
    const repo=subscriptionRepo(url);
    if(this.items().some(item=>item.repo.toLowerCase()===repo.toLowerCase()))throw new Error(t('此仓库已订阅。'));
    if(this.items().length>=30)throw new Error(t('最多订阅 30 个仓库。'));
    const snapshot=await this.api.snapshot(repo);
    const item={repo,snapshot,unread:false,pageSeen:true};
    this.items().push(item);
    this.save();
    this.render();
    return item;
  }
  refresh(){
    if(this.running)return this.running;
    this.abort=new AbortController();
    this.running=this.runRefresh(this.abort.signal).finally(()=>{
      this.running=null;
      if(this.visited)this.render();
    });
    if(this.visited)this.render();
    return this.running;
  }
  async runRefresh(signal){
    for(const item of [...this.items()]){
      if(signal?.aborted)break;
      try{
        const snapshot=await this.api.snapshot(item.repo,signal);
        if(!this.items().includes(item))continue;
        const changed=subscriptionChanged(item.snapshot,snapshot);
        await this.cache({...item,snapshot});
        if(!this.items().includes(item))continue;
        const recovered=!!item.error;
        item.snapshot=snapshot;
        item.error='';
        if(changed){
          item.unread=!(this.visited&&this.detail===item);
          item.pageSeen=this.visited;
        }
        // An unchanged repository (only checkedAt moves) is not worth a workspace save of its own.
        if(changed||recovered)this.saveLater();
        this.dot();
      }catch(error){
        if(!signal?.aborted&&this.items().includes(item)&&item.error!==error.message){
          item.error=error.message;
          this.saveLater();
        }
      }
    }
  }
  ignore(items){
    for(const item of items){
      item.unread=false;
      item.pageSeen=true;
      item.ignoredAt=Date.now();
    }
    this.saveLater();
    this.dot();
    this.render();
  }
  async open(item){
    this.ignore([item]);
    item.readAt=Date.now();
    this.saveLater();
    this.detail=item;
    this.render();
    if(item.snapshot.changelog)try{
      const text=await this.api.blob(item.repo,item.snapshot.changelog.sha,1048576);
      if(this.detail===item){
        item.changelogText=text;
        this.render();
      }
    }catch(error){
      this.fail(error);
    }
  }
  render(){
    if(!this.visited)return;
    const esc=this.escape;
    if(this.detail&&!this.items().includes(this.detail))this.detail=null;
    if(this.detail){
      const item=this.detail,s=item.snapshot;
      this.root.innerHTML=`<div class="subscription-scroll">
          <button id="subscription-back" class="ui-button ui-button--text subscription-back">← ${t('订阅')}</button>
          <header class="page-header subscription-header">
            <h1 data-user-content>${esc(s.name)}</h1>
            <button id="subscription-pull" class="ui-button ui-button--primary">${t('拉取文件')}</button></header>
          <p data-user-content>${esc(s.description)}</p>${s.vela?`<p class="vela-badge">.vela ${t('工作区')}</p>`:''}<h2>${say('发布版本','Releases')}</h2>${s.releases.map(release=>`<section class="release"><h3 data-user-content>${esc(release.name)}</h3><time>${esc(release.published?new Date(release.published).toLocaleString():'')}</time><article class="markdown release-body" data-user-content>${this.renderMarkdown(release.body)}</article></section>`).join('')||`<p>${t('暂无发布版本')}</p>`}<h2>${say('更新日志','Changelog')}</h2>
          <article class="markdown release-body" data-user-content>${item.changelogText?this.renderMarkdown(item.changelogText):t(s.changelog?'正在读取…':'未找到 Changelog 文件')}</article></div>`;
      this.root.querySelector('#subscription-pull').onclick=()=>this.pull(item).catch(this.fail);
      this.root.querySelector('#subscription-back').onclick=()=>{
        this.detail=null;
        this.render();
      };
      return;
    }
    const visible=this.items().filter(item=>this.filter==='all'||this.filter==='unread'&&item.unread||this.filter==='errors'&&item.error||this.filter==='downloaded'&&this.workspace().documents.some(doc=>doc.subscription?.repo===item.repo));
    const active=this.items().filter(item=>this.selected.has(item.repo));
    const filters=[['all',t('全部')],['unread',t('有更新')],['downloaded',t('已下载')],['errors',t('失败')]].map(([value,label])=>({value,label}));
    this.root.innerHTML=`<div class="subscription-scroll">
        <header class="page-header subscription-header">
          <h1>${t('订阅')}</h1>
          <div class="subscription-actions">
            <button id="subscription-refresh" class="ui-icon-button" aria-label="${t('刷新')}" title="${t('刷新')}" ${this.running?'disabled':''}>${icon('refresh')}</button>${this.items().length?`
            <button id="subscription-select" class="ui-button ui-button--secondary" aria-pressed="${this.selecting}">${t(this.selecting?'完成':'选择')}</button>`:''}
            <button id="subscription-add" class="ui-button ui-button--primary">＋ ${t('订阅仓库')}</button></div>
        </header>${this.running?`
        <div class="subscription-progress" role="status">${t('正在刷新…')}<button id="subscription-cancel" class="ui-button ui-button--text ui-button--compact">${t('取消刷新')}</button></div>`:''}${this.items().length?segmented('subscription-filter',filters,this.filter,{label:t('筛选订阅')}):''}
        <div class="subscription-list">${visible.map(item=>`<div class="subscription-card${this.selected.has(item.repo)?' selected':''}" data-subscription="${esc(item.repo)}">${this.selecting?`
          <label class="subscription-selection"><input type="checkbox" data-select-subscription="${esc(item.repo)}" aria-label="${t('选择')} ${esc(item.repo)}" ${this.selected.has(item.repo)?'checked':''}></label>`:''}
          <button class="subscription-open" data-subscription-open="${esc(item.repo)}">
            <strong><span data-user-content>${esc(item.snapshot.name)}</span>${item.unread?`<i class="update-dot" aria-hidden="true"></i><span class="subscription-badge">${t('有更新')}</span>`:''}</strong>
            <small>${item.snapshot.vela?'.vela':'GitHub'} · ${esc(new Date(item.snapshot.checkedAt).toLocaleString())}</small>
            <span data-user-content>${esc(item.snapshot.releases?.[0]
      ?[item.snapshot.releases[0].tag,item.snapshot.releases[0].name].filter((v,i,a)=>a.indexOf(v)===i).join(' · ')
      :item.snapshot.changelog?say('更新日志','Changelog')+' · '+item.snapshot.changelog.path:item.snapshot.description)}</span></button>${item.unread&&!this.selecting?`
          <button class="ui-button ui-button--text ui-button--compact" data-ignore-subscription="${esc(item.repo)}">${t('忽略')}</button>`:''}${item.error?`
          <div class="subscription-error" role="alert"><p class="error">${esc(refreshError(item.error))}</p><button class="ui-button ui-button--secondary ui-button--compact" data-retry-subscription ${this.running?'disabled':''}>${t('重试')}</button></div>`:''}</div>`).join('')||(this.items().length
      ?`<p class="blank">${t('没有符合筛选的订阅。')}</p>`
      :`<div class="ui-empty"><strong>${t('还没有订阅')}</strong><p>${t('订阅 GitHub 仓库以查看发布版本和更新日志。')}</p></div>`)}</div>${this.selecting?`
        <div class="subscription-bulk" role="toolbar" aria-label="${t('批量操作')}">
          <label class="subscription-select-all"><input id="subscription-select-all" type="checkbox" ${active.length===visible.length&&active.length?'checked':''}>${t('全选')}</label>
          <span class="subscription-count">${active.length} / ${visible.length}</span>
          <button id="subscription-ignore" class="ui-button ui-button--secondary ui-button--compact" ${active.length?'':'disabled'}>${t('忽略')}</button>
          <button id="subscription-delete" class="ui-button ui-button--danger ui-button--compact" ${active.length?'':'disabled'}>${t('删除订阅')}</button></div>`:''}</div>`;
    this.root.querySelector('#subscription-add').onclick=()=>this.modal(
      t('订阅仓库'),
      `<label>GitHub HTTPS URL<input name="url" type="url" required placeholder="https://github.com/owner/repository"></label>`,
      async form=>{
        const item=await this.add(form.get('url'));
        this.modal(t('立即拉取？'),`<p data-user-content>${esc(item.repo)}</p><p>${t('订阅已添加。是否现在拉取仓库文件？取消后可在订阅详情中手动拉取。')}</p>`,()=>{
          this.pull(item).catch(this.fail);
          return false;
        },{label:t('拉取文件')});
        return false;
      });
    const on=(selector,event,handler)=>{const node=this.root.querySelector(selector);if(node)node[event]=handler;};
    this.root.querySelectorAll('[name=subscription-filter]').forEach(radio=>radio.onchange=()=>{
      this.filter=radio.value;
      this.selected.clear();
      this.render();
    });
    on('#subscription-cancel','onclick',()=>this.abort?.abort());
    const refresh=()=>{
      this.refresh();
      this.render();
    };
    on('#subscription-refresh','onclick',refresh);
    this.root.querySelectorAll('[data-retry-subscription]').forEach(button=>button.onclick=refresh);
    on('#subscription-select','onclick',()=>{
      this.selecting=!this.selecting;
      this.selected.clear();
      this.render();
    });
    on('#subscription-select-all','onchange',e=>{
      this.selected=new Set(e.target.checked?visible.map(item=>item.repo):[]);
      this.render();
    });
    on('#subscription-ignore','onclick',()=>this.ignore(active));
    on('#subscription-delete','onclick',()=>this.modal(t('删除订阅'),`<p>${t('删除所选订阅？本地已保存的文件保留。')}</p>`,()=>{
      this.workspace().subscriptions=this.items().filter(item=>!this.selected.has(item.repo));
      this.selected.clear();
      if(!this.items().length)this.selecting=false;
      this.save();
      this.dot();
      this.render();
    },{label:t('删除订阅'),destructive:true}));
    this.root.querySelectorAll('[data-select-subscription]').forEach(input=>input.onchange=()=>{
      input.checked?this.selected.add(input.dataset.selectSubscription):this.selected.delete(input.dataset.selectSubscription);
      this.render();
    });
    this.root.querySelectorAll('[data-subscription-open]').forEach(button=>button.onclick=()=>{
      // In selection mode a tap on the card toggles it, like the checkbox.
      if(this.selecting){
        const repo=button.dataset.subscriptionOpen;
        this.selected.has(repo)?this.selected.delete(repo):this.selected.add(repo);
        this.render();
        return;
      }
      if(!this.suppressClick)this.open(this.items().find(item=>item.repo===button.dataset.subscriptionOpen)).catch(this.fail);
    });
    this.root.querySelectorAll('[data-ignore-subscription]').forEach(button=>button.onclick=()=>this.ignore([this.items().find(item=>item.repo===button.dataset.ignoreSubscription)]));
    this.root.querySelectorAll('.subscription-card').forEach(card=>{
      let start;
      card.addEventListener('pointerdown',e=>{
        if(e.target.closest('input'))return;
        start={x:e.clientX,y:e.clientY,time:performance.now()};
      });
      card.addEventListener(
        'pointermove',
        e=>{
          if(start&&performance.now()-start.time>350&&e.clientX-start.x< -60&&Math.abs(e.clientY-start.y)<40){
            this.suppressClick=true;
            this.ignore([this.items().find(item=>item.repo===card.dataset.subscription)]);
            start=null;
            setTimeout(()=>this.suppressClick=false,300);
          }
        });
      card.addEventListener('pointerup',()=>start=null);
      card.addEventListener('pointercancel',()=>start=null);
    });
  }
}
