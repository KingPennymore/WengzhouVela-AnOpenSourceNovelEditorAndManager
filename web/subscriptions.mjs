import {decodeContent,MAX_TEXT_BYTES} from './model.mjs';
import {parseVela,configFolder,velaVisiblePaths} from './vela.mjs';
import {GitHubError} from './github.mjs';
import {t} from './i18n.mjs';

export function subscriptionRepo(value){
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('请输入 HTTPS GitHub 仓库地址。');
  const parts=url.pathname.replace(/\/$/,'').split('/').filter(Boolean);if(parts.length!==2||parts.some(part=>!(/^[\w.-]+$/).test(part)||part.includes('..')))throw new Error('请输入仓库首页地址，例如 https://github.com/owner/repository。');
  const name=parts[1].replace(/\.git$/,'');if(!name)throw new Error('请输入有效的仓库名称。');return parts[0]+'/'+name;
}
export function subscriptionChanged(previous,next){
  if(!previous)return false;
  if(next.vela){if(!previous.vela)return false;return Object.keys(next.watched).some(path=>Object.hasOwn(previous.watched,path)&&previous.watched[path]!==next.watched[path]);}
  return previous.signature!==next.signature;
}
export class SubscriptionAPI {
  constructor(transport){this.transport=transport;}
  async get(path){const result=await this.transport('publicApi',{path,method:'GET'});if(result.status<200||result.status>=300)throw new GitHubError(result.status,result.body);return result.body;}
  async blob(repo,sha,max=MAX_TEXT_BYTES){const value=await this.get(`/repos/${repo}/git/blobs/${sha}`);if(value.size>max||value.encoding!=='base64')throw new Error('订阅文件过大或编码不受支持。');return decodeContent(value.content);}
  async snapshot(repo){
    const base='/repos/'+repo,info=await this.get(base);let releases=[];try{releases=await this.get(base+'/releases?per_page=20');}catch(error){if(error.status!==404)throw error;}
    const tree=await this.get(base+'/git/trees/'+encodeURIComponent(info.default_branch)+'?recursive=1');
    if(tree.truncated)throw new Error('仓库目录超过 GitHub 递归树限制，未更新订阅缓存。');
    const files=tree.tree||[];if(files.length>100000)throw new Error('仓库目录过大。');
    const configEntries=files.filter(item=>item.type==='blob'&&/\.vela$/i.test(item.path));if(configEntries.length>32)throw new Error('仓库含有超过 32 个 .vela 配置。');
    const configs=[];for(const item of configEntries){const text=await this.blob(repo,item.sha,262144);configs.push({path:item.path,folder:configFolder(item.path),sha:item.sha,text,config:parseVela(text)});}
    const visible=velaVisiblePaths(files,configs),byPath=new Map(files.map(item=>[item.path,item]));if(visible.length>5000)throw new Error('阅读文件不能超过 5000 个。');const watched=Object.fromEntries(visible.map(path=>[path,byPath.get(path).sha]));
    // Keep missing configured paths in the baseline: a later first publication is an update.
    for(const item of configs)for(const path of item.config.reading.files){const full=(item.folder?item.folder+'/':'')+path;if(!Object.hasOwn(watched,full))watched[full]=null;}
    const changelog=files.find(item=>item.type==='blob'&&/(^|\/)(changelog|changes|history)(\.(md|markdown|txt))?$/i.test(item.path));
    return {tree:tree.sha,name:info.full_name,description:info.description||'',branch:info.default_branch,vela:configs.length>0,configs,watched,files:visible.map(path=>byPath.get(path)).map(({path,sha,size})=>({path,sha,size})),releases:releases.filter(item=>!item.draft).map(item=>({name:item.name||item.tag_name,tag:item.tag_name,body:item.body||'',published:item.published_at,url:item.html_url})),changelog:changelog?{path:changelog.path,sha:changelog.sha}:null,signature:JSON.stringify([info.pushed_at,tree.sha,releases.map(item=>[item.id,item.updated_at,item.published_at])]),checkedAt:Date.now()};
  }
}
export class Subscriptions {
  constructor(options){Object.assign(this,options);this.api=new SubscriptionAPI(options.transport);this.selected=new Set();this.detail=null;this.running=null;this.visited=false;}
  items(){return this.workspace().subscriptions||=[];}
  dot(){const unseen=this.items().some(item=>item.unread&&!item.pageSeen);this.nav.querySelector('.update-dot').hidden=!unseen;}
  enter(){this.visited=true;for(const item of this.items())item.pageSeen=true;this.save();this.dot();this.render();this.refresh();}
  leave(){this.visited=false;}
  async add(url){const repo=subscriptionRepo(url);if(this.items().some(item=>item.repo.toLowerCase()===repo.toLowerCase()))throw new Error('此仓库已订阅。');if(this.items().length>=30)throw new Error('最多订阅 30 个仓库。');const snapshot=await this.api.snapshot(repo);const item={repo,snapshot,unread:false,pageSeen:true};this.items().push(item);await this.cache(item);this.save();this.render();}
  refresh(){if(this.running)return this.running;this.running=this.runRefresh().finally(()=>{this.running=null;if(this.visited)this.render();});return this.running;}
  async runRefresh(){
    for(const item of [...this.items()]){try{const snapshot=await this.api.snapshot(item.repo);if(!this.items().includes(item))continue;const changed=subscriptionChanged(item.snapshot,snapshot);await this.cache({...item,snapshot});if(!this.items().includes(item))continue;item.snapshot=snapshot;item.error='';if(changed){item.unread=!(this.visited&&this.detail===item);item.pageSeen=this.visited;}this.save();this.dot();}catch(error){if(this.items().includes(item)){item.error=error.message;this.save();}}}
  }
  ignore(items){for(const item of items){item.unread=false;item.pageSeen=true;}this.save();this.dot();this.render();}
  async open(item){this.ignore([item]);this.detail=item;this.render();if(item.snapshot.changelog)try{const text=await this.api.blob(item.repo,item.snapshot.changelog.sha,1048576);if(this.detail===item){item.changelogText=text;this.render();}}catch(error){this.fail(error);}}
  render(){if(!this.visited)return;const esc=this.escape;if(this.detail&&!this.items().includes(this.detail))this.detail=null;
    if(this.detail){const item=this.detail,s=item.snapshot;this.root.innerHTML=`<div class="subscription-scroll"><header class="page-header"><button id="subscription-back" class="secondary">← ${t('订阅')}</button><h1>${esc(s.name)}</h1><button id="subscription-pull" class="primary">${t('拉取文件')}</button></header><p data-user-content>${esc(s.description)}</p>${s.vela?`<p class="vela-badge">.vela ${t('工作区')}</p>`:''}<h2>Releases</h2>${s.releases.map(release=>`<section class="release"><h3 data-user-content>${esc(release.name)}</h3><time>${esc(release.published||'')}</time><article class="markdown release-body" data-user-content>${this.renderMarkdown(release.body)}</article></section>`).join('')||`<p>${t('暂无发布版本')}</p>`}<h2>Changelog</h2><article class="markdown release-body" data-user-content>${item.changelogText?this.renderMarkdown(item.changelogText):t(s.changelog?'正在读取…':'未找到 Changelog 文件')}</article></div>`;this.root.querySelector('#subscription-pull').onclick=()=>this.pull(item).catch(this.fail);this.root.querySelector('#subscription-back').onclick=()=>{this.detail=null;this.render();};return;}
    const active=this.items().filter(item=>this.selected.has(item.repo));this.root.innerHTML=`<div class="subscription-scroll"><header class="page-header"><h1>${t('订阅')}</h1><div class="button-row"><button id="subscription-add" class="primary">＋ ${t('订阅仓库')}</button><button id="subscription-refresh" class="secondary" ${this.running?'disabled':''}>${t(this.running?'正在刷新…':'刷新')}</button></div></header><div class="subscription-bulk"><label><input id="subscription-select-all" type="checkbox" ${active.length===this.items().length&&active.length?'checked':''}>${t('全选')}</label><button id="subscription-ignore" class="secondary" ${active.length?'':'disabled'}>${t('忽略')}</button><button id="subscription-delete" class="danger" ${active.length?'':'disabled'}>${t('删除订阅')}</button><span>${active.length} / ${this.items().length}</span></div><div class="subscription-list">${this.items().map(item=>`<div class="subscription-card" data-subscription="${esc(item.repo)}"><input type="checkbox" data-select-subscription="${esc(item.repo)}" aria-label="${t('选择')} ${esc(item.repo)}" ${this.selected.has(item.repo)?'checked':''}><button class="subscription-open" data-subscription-open="${esc(item.repo)}"><strong data-user-content>${esc(item.snapshot.name)}${item.unread?'<i class="update-dot"></i>':''}</strong><small>${item.snapshot.vela?'.vela':'GitHub'} · ${esc(new Date(item.snapshot.checkedAt).toLocaleString())}</small><span data-user-content>${esc(item.snapshot.description)}</span></button><button class="text-button" data-ignore-subscription="${esc(item.repo)}">${t('忽略')}</button>${item.error?`<p class="error">${esc(item.error)}</p>`:''}</div>`).join('')||`<p class="blank">${t('订阅 GitHub 仓库以查看发布版本和更新日志。')}</p>`}</div></div>`;
    this.root.querySelector('#subscription-add').onclick=()=>this.modal(t('订阅仓库'),`<label>GitHub HTTPS URL<input name="url" type="url" required placeholder="https://github.com/owner/repository"></label>`,async form=>this.add(form.get('url')));
    this.root.querySelector('#subscription-refresh').onclick=()=>{this.refresh();this.render();};this.root.querySelector('#subscription-select-all').onchange=e=>{this.selected=new Set(e.target.checked?this.items().map(item=>item.repo):[]);this.render();};
    this.root.querySelector('#subscription-ignore').onclick=()=>this.ignore(active);this.root.querySelector('#subscription-delete').onclick=()=>this.modal(t('删除订阅'),`<p>${t('删除所选订阅？本地已保存的文件保留。')}</p>`,()=>{this.workspace().subscriptions=this.items().filter(item=>!this.selected.has(item.repo));this.selected.clear();this.save();this.dot();this.render();});
    this.root.querySelectorAll('[data-select-subscription]').forEach(input=>input.onchange=()=>{input.checked?this.selected.add(input.dataset.selectSubscription):this.selected.delete(input.dataset.selectSubscription);this.render();});
    this.root.querySelectorAll('[data-subscription-open]').forEach(button=>button.onclick=()=>{if(!this.suppressClick)this.open(this.items().find(item=>item.repo===button.dataset.subscriptionOpen)).catch(this.fail);});
    this.root.querySelectorAll('[data-ignore-subscription]').forEach(button=>button.onclick=()=>this.ignore([this.items().find(item=>item.repo===button.dataset.ignoreSubscription)]));
    this.root.querySelectorAll('.subscription-card').forEach(card=>{let start;card.addEventListener('pointerdown',e=>{if(e.target.closest('input'))return;start={x:e.clientX,y:e.clientY,time:performance.now()};});card.addEventListener('pointermove',e=>{if(start&&performance.now()-start.time>350&&e.clientX-start.x< -60&&Math.abs(e.clientY-start.y)<40){this.suppressClick=true;this.ignore([this.items().find(item=>item.repo===card.dataset.subscription)]);start=null;setTimeout(()=>this.suppressClick=false,300);}});card.addEventListener('pointerup',()=>start=null);card.addEventListener('pointercancel',()=>start=null);});
  }
}
