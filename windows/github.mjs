import {gitIdentity,gitHostKey,gitApiBase,validateGitApiPath} from './git-host.mjs';
export class GitHubBridge{
  constructor({request,credentials}){this.request=request;this.credentials=credentials;this.generation=0;}
  async verify(token,generation,provider='github',server){
    const host=gitIdentity({provider,server}),key=gitHostKey(host);
    const response=await this.request(gitApiBase(host)+'/user','GET',null,token,host);
    if(response.status!==200)throw new Error(response.status===401?'访问令牌无效或已过期。':`${provider==='gitea'?'Gitea':provider==='gitee'?'Gitee':'GitHub'} 验证失败（HTTP ${response.status}）。`);
    if(generation!==this.generation)throw new Error('登录已取消。');
    let saved;try{saved=this.credentials.read(key);}catch{}
    if(saved!==token)this.credentials.write(token,key);return response.body;
  }
  async call(operation,data={}){
    const host=gitIdentity(data),{provider,server}=host,key=gitHostKey(host),origin=gitApiBase(host);
    if(operation==='logout'){this.generation++;this.credentials.clear(key);return true;}
    if(operation==='connection')return this.request(origin+(provider==='gitea'?'/version':provider==='gitee'?'/emojis':''),'GET',null,'',host);
    if(operation==='login'){const generation=++this.generation,token=data.token?.trim();if(!token||token.length>4096||/\s/.test(token))throw new Error('访问令牌格式不正确。');return this.verify(token,generation,provider,server);}
    if(operation==='oauth'){if(provider!=='github')throw Error('此平台请使用个人访问令牌登录。');
      if(!['/login/device/code','/login/oauth/access_token'].includes(data.path))throw new Error('不允许的授权地址。');if(data.path==='/login/device/code')this.generation++;const generation=this.generation;
      const response=await this.request('https://github.com'+data.path,'POST',data.body,'');if(response.status!==200)throw new Error('GitHub 授权失败，请检查网络与 Client ID。');
      if(response.body.access_token){await this.verify(response.body.access_token,generation);return {authorized:true};}return response.body;
    }
    if(operation==='api'||operation==='publicApi'){
      const {path,method='GET',body}=data;
      validateGitApiPath(path);
      if(!['GET','POST','PUT','PATCH','DELETE'].includes(method)||operation==='publicApi'&&(method!=='GET'||!path.startsWith('/repos/')))throw new Error('不允许的请求方法。');
      const token=this.credentials.read(key);if(!token&&operation==='api')return {status:401,body:{}};return this.request(origin+path,method,body,token,host);
    }
    throw new Error('不支持此 GitHub 操作。');
  }
}
