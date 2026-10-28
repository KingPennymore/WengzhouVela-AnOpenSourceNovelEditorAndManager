import { encodeContent, decodeContent, repoPath, MAX_TEXT_BYTES } from './model.mjs';
import {pullRepository} from './repository-pull.mjs';
import {textBytes,MB} from './text-utils.mjs';
export class GitHubError extends Error {
  constructor(status, body) {
    const hints = {401:'登录已失效，请重新登录 GitHub。',403:'请求受限：请检查令牌权限、组织授权或 GitHub 速率限制。',404:'仓库、分支或文件不存在，或当前账号没有访问权限。',409:'远端版本已变化。请重新读取远端并对照修改，本地文稿已保留。',422:'GitHub 未接受此操作，请检查名称、权限及文件版本。'};
    super(hints[status] || `GitHub 请求失败（${status}）：${body?.message || '请稍后重试'}`);
    this.status = status;
  }
}
export class GitHub {
  constructor(transport) { this.transport = transport; this.provider='github'; }
  async request(path, method = 'GET', body, {signal}={}) {
    for(let attempt=0;;attempt++){signal?.throwIfAborted();try{const response=await this.transport('api',{path,method,body});signal?.throwIfAborted();if(response.status<200||response.status>=300)throw new GitHubError(response.status,response.body);return response.body;}catch(error){if(method!=='GET'||attempt>=2||signal?.aborted||error.status&&error.status<500)throw error;await abortableSleep(300*2**attempt,signal);}}
  }
  async pages(path) {
    const items=[];
    for(let page=1; page<=100; page++) {
      const batch = await this.request(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);
      if(!Array.isArray(batch)) throw new Error('GitHub 返回的数据格式不正确。');
      items.push(...batch);
      if(batch.length<100) return items;
    }
    throw new Error('列表超过 10000 条，请缩小仓库范围。');
  }
  user() { return this.request('/user'); }
  repositories() { return this.pages('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member'); }
  createRepository(name, description, isPrivate) { return this.request('/user/repos','POST',{name,description,private:isPrivate,auto_init:true}); }
  updateRepository(repo, data) { return this.request(this.base(repo),'PATCH',data); }
  base(repo) {
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('仓库格式应为 owner/repository。');
    return `/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
  }
  commits(repo,branch,page=1){return this.request(`${this.base(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=30&page=${Math.max(1,Math.trunc(page))}`);}
  async blobText(repo,sha){if(!/^[a-f0-9]{40,64}$/i.test(sha||''))throw Error('无效的 Git SHA');const blob=await this.request(`${this.base(repo)}/git/blobs/${sha}`);if(blob.encoding!=='base64'||blob.size>MAX_TEXT_BYTES)throw Error('文件无法作为文本预览');return decodeContent(blob.content);}
  branches(repo) { return this.pages(`${this.base(repo)}/branches`); }
  async createBranch(repo, from, name) {
    if(!name.trim()) throw new Error('请输入分支名称。');
    const ref=await this.request(`${this.base(repo)}/git/ref/heads/${encodeURIComponent(from)}`);
    return this.request(`${this.base(repo)}/git/refs`,'POST',{ref:`refs/heads/${name.trim()}`,sha:ref.object.sha});
  }
  contentURL(repo,path='') { return `${this.base(repo)}/contents/${path ? repoPath(path).split('/').map(encodeURIComponent).join('/') : ''}`; }
  contents(repo,branch,path='') { return this.request(`${this.contentURL(repo,path)}?ref=${encodeURIComponent(branch)}`); }
  async readFile(repo,branch,path) {
    const file=await this.contents(repo,branch,path);
    if(file.type!=='file' || !Number.isFinite(file.size) || file.size>MAX_TEXT_BYTES) throw new Error('仅支持 8 MB 以内的 UTF-8 文本文件。');
    // Contents omits Base64 for files over 1 MB. Read the same immutable Git blob, never download_url.
    let content=file;
    if(file.encoding==='none'&&/^[a-f0-9]{40,64}$/i.test(file.sha||'')) content=await this.request(`${this.base(repo)}/git/blobs/${file.sha}`);
    if(content.encoding!=='base64' || typeof content.content!=='string') throw new Error('GitHub 未提供可读取的文本内容。');
    const text=decodeContent(content.content);
    if(textBytes(text)>MAX_TEXT_BYTES) throw new Error('仅支持 8 MB 以内的 UTF-8 文本文件。');
    if(text.includes('\0')) throw new Error('此文件是二进制文件，无法作为文稿打开。');
    return {text,sha:file.sha};
  }
  pullRepository(repo,branch,options) { return pullRepository(this,repo,branch,options); }
  async commit({repo,branch,path,sha,text,message}) {
    if(!message.trim()) throw new Error('请填写提交说明。');
    if(textBytes(text)>MAX_TEXT_BYTES) throw new Error('单次提交文稿不能超过 8 MB。');
    // Never fetch a newer SHA and silently overwrite it. The editor's base SHA is authoritative.
    const body={branch,content:encodeContent(text),message:message.trim()};
    if(sha) body.sha=sha;
    return this.request(this.contentURL(repo,path),'PUT',body);
  }
  async commitWorkspace({repo,branch,files,message,prefix='',expectedHead}){
    if(!message.trim())throw new Error('请填写提交说明。');
    if(!Array.isArray(files)||!files.length||files.length>5000)throw new Error('工作区须包含 1–5000 个文件。');
    if(prefix)prefix=repoPath(prefix);const paths=new Set();let size=0;
    for(const file of files){repoPath(file.path);if(paths.has(file.path))throw new Error('工作区含重复文件路径。');paths.add(file.path);const bytes=file.delete?0:typeof file.text==='string'?textBytes(file.text):typeof file.data==='string'?Math.floor(file.data.length*3/4):Infinity;if(bytes>MAX_TEXT_BYTES)throw new Error('工作区文件不能超过 8 MB。');size+=bytes;}
    if(size>64*MB)throw new Error('一次工作区提交不能超过 64 MB。');
    const base=this.base(repo),refPath=base+'/git/refs/heads/'+encodeURIComponent(branch),head=await this.request(base+'/git/ref/heads/'+encodeURIComponent(branch)),parent=head.object.sha,commit=await this.request(base+'/git/commits/'+parent),tree=[];
    if(expectedHead&&expectedHead!==parent)throw new GitHubError(409,{message:'远端分支已变化。'});
    for(const file of files){const entry={path:(prefix?prefix+'/':'')+file.path,mode:'100644',type:'blob'};if(file.delete)entry.sha=null;else if(typeof file.text==='string')entry.content=file.text;else{const blob=await this.request(base+'/git/blobs','POST',{content:file.data,encoding:'base64'});entry.sha=blob.sha;}tree.push(entry);}
    const created=await this.request(base+'/git/trees','POST',{base_tree:commit.tree.sha,tree});
    const next=await this.request(base+'/git/commits','POST',{message:message.trim(),tree:created.sha,parents:[parent]});
    // Atomic branch update. A concurrent remote commit is never force-overwritten.
    await this.request(refPath,'PATCH',{sha:next.sha,force:false});return {...next,files:created.tree||[]};
  }
  deleteFile({repo,branch,path,sha,message}) { return this.request(this.contentURL(repo,path),'DELETE',{branch,sha,message}); }
}
export async function deviceLogin(transport, clientId, onCode, signal, sleep = abortableSleep, now = Date.now) {
  const auth=await transport('oauth',{path:'/login/device/code',body:{client_id:clientId,scope:'repo read:user'}});
  if(auth.error) throw new Error(auth.error_description || auth.error);
  if(!auth.device_code || !auth.user_code || !auth.expires_in) throw new Error('GitHub 未返回有效的设备授权码。');
  onCode(auth);
  let interval=Math.max(5,Number(auth.interval)||5)*1000;
  const expires=now()+auth.expires_in*1000;
  while(now()<expires) {
    await sleep(interval,signal);
    if(signal?.aborted) throw new Error('已取消登录。');
    if(now()>=expires) break;
    const result=await transport('oauth',{path:'/login/oauth/access_token',body:{client_id:clientId,device_code:auth.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'}});
    if(signal?.aborted) { if(result.authorized) await transport('logout',{}); throw new Error('已取消登录。'); }
    if(result.authorized) return;
    if(result.error==='authorization_pending') continue;
    if(result.error==='slow_down') {interval=Math.max(interval+5000,(Number(result.interval)||0)*1000);continue;}
    if(result.error==='access_denied') throw new Error('你已拒绝本次授权。');
    if(result.error==='expired_token') break;
    throw new Error(result.error_description || result.error || '设备授权失败。');
  }
  throw new Error('设备授权码已过期，请重新登录。');
}
function abortableSleep(ms,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(new Error('已取消登录。'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    if(signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
  });
}
