import {GitHub,GitHubError} from './github.mjs';
import {encodeContent,repoPath,MAX_TEXT_BYTES} from './model.mjs';

// Gitee v5 has Contents and Git read APIs, and a separate atomic multi-file commit API.
export class Gitee extends GitHub {
  constructor(transport){super((operation,payload)=>transport(operation,{...payload,provider:'gitee'}));this.provider='gitee';}
  repositories(){return this.pages('/user/repos?sort=updated');}
  async request(path,method='GET',body,options){
    const ref=path.match(/^(\/repos\/[\w.-]+\/[\w.-]+)\/git\/ref\/heads\/(.+)$/);
    if(ref){const branch=await super.request(`${ref[1]}/branches/${ref[2]}`,method,body,options);return {object:{sha:branch.commit.sha}};}
    const commit=path.match(/^(\/repos\/[\w.-]+\/[\w.-]+)\/git\/commits\/([^/?]+)$/);
    if(commit){const result=await super.request(`${commit[1]}/commits/${commit[2]}`,method,body,options),tree=result.commit?.tree??result.tree;return {...result,tree:typeof tree==='string'?{sha:tree}:tree};}
    try{return await super.request(path,method,body,options);}catch(error){if(error instanceof GitHubError)error.message=error.message.replaceAll('GitHub','Gitee');throw error;}
  }
  createBranch(repo,from,name){if(!name.trim())throw Error('请输入分支名称。');return this.request(`${this.base(repo)}/branches`,'POST',{refs:from,branch_name:name.trim()});}
  async commit({repo,branch,path,sha,text,message}){
    if(!message.trim())throw Error('请填写提交说明。');if(new TextEncoder().encode(text).length>MAX_TEXT_BYTES)throw Error('单次提交文稿不能超过 8 MB。');
    return this.request(this.contentURL(repo,path),sha?'PUT':'POST',{branch,content:encodeContent(text),message:message.trim(),...(sha?{sha}:{})});
  }
  async pullRepository(repo,branch,options){return {...await super.pullRepository(repo,branch,options),provider:'gitee'};}
  async commitWorkspace({repo,branch,files,message,prefix='',expectedHead}){
    if(!message.trim())throw Error('请填写提交说明。');if(!Array.isArray(files)||!files.length||files.length>5000)throw Error('工作区须包含 1–5000 个文件。');if(prefix)prefix=repoPath(prefix);
    const head=await this.request(`${this.base(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);if(expectedHead&&head.object.sha!==expectedHead)throw new GitHubError(409,{});
    const actions=[],paths=new Set();let size=0;
    for(const file of files){repoPath(file.path);if(paths.has(file.path))throw Error('工作区含重复文件路径。');paths.add(file.path);const bytes=file.delete?0:typeof file.text==='string'?new TextEncoder().encode(file.text).length:typeof file.data==='string'?Math.ceil(file.data.length*3/4):Infinity;size+=bytes;if(bytes>MAX_TEXT_BYTES||size>64*1024*1024)throw Error('工作区文件超过提交大小限制。');
      const path=(prefix?prefix+'/':'')+file.path;let exists=true;try{await this.contents(repo,head.object.sha,path);}catch(error){if(error.status!==404)throw error;exists=false;}
      if(file.delete&&!exists)continue;
      let lastCommit;if(exists){const history=await this.request(`${this.base(repo)}/commits?sha=${head.object.sha}&path=${encodeURIComponent(path)}&per_page=1`);lastCommit=history[0]?.sha;if(!lastCommit)throw Error('无法确认文件版本，未提交：'+path);}
      actions.push({action:file.delete?'delete':exists?'update':'create',path,...(file.delete?{}:{content:typeof file.text==='string'?file.text:file.data,encoding:typeof file.text==='string'?'text':'base64'}),...(exists?{last_commit_id:lastCommit}:{})});
    }
    const latest=await this.request(`${this.base(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);if(latest.object.sha!==head.object.sha)throw new GitHubError(409,{});
    const result=await this.request(`${this.base(repo)}/commits`,'POST',{branch,message:message.trim(),actions});
    return {...result,files:result.files?.map(file=>({...file,path:file.filename||file.path}))||[]};
  }
}
