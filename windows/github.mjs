export class GitHubBridge{
  constructor({request,credentials}){this.request=request;this.credentials=credentials;this.generation=0;}
  async verify(token,generation,provider='github'){
    const response=await this.request((provider==='gitee'?'https://gitee.com/api/v5':'https://api.github.com')+'/user','GET',null,token);
    if(response.status!==200)throw new Error(response.status===401?'访问令牌无效或已过期。':`${provider==='gitee'?'Gitee':'GitHub'} 验证失败（HTTP ${response.status}）。`);
    if(generation!==this.generation)throw new Error('登录已取消。');this.credentials.write(token,provider);return response.body;
  }
  async call(operation,data={}){
    const provider=data.provider||'github';if(!['github','gitee'].includes(provider))throw Error('不支持此代码托管平台。');const origin=provider==='gitee'?'https://gitee.com/api/v5':'https://api.github.com';
    if(operation==='logout'){this.generation++;this.credentials.clear(provider);return true;}
    if(operation==='connection')return this.request(origin+(provider==='gitee'?'/emojis':''),'GET',null,'');
    if(operation==='login'){const generation=++this.generation,token=data.token?.trim();if(!token||token.length>4096||/\s/.test(token))throw new Error('访问令牌格式不正确。');return this.verify(token,generation,provider);}
    if(operation==='oauth'){if(provider!=='github')throw Error('Gitee 请使用个人访问令牌登录。');
      if(!['/login/device/code','/login/oauth/access_token'].includes(data.path))throw new Error('不允许的授权地址。');if(data.path==='/login/device/code')this.generation++;const generation=this.generation;
      const response=await this.request('https://github.com'+data.path,'POST',data.body,'');if(response.status!==200)throw new Error('GitHub 授权失败，请检查网络与 Client ID。');
      if(response.body.access_token){await this.verify(response.body.access_token,generation);return {authorized:true};}return response.body;
    }
    if(operation==='api'||operation==='publicApi'){
      const {path,method='GET',body}=data;
      if(typeof path!=='string'||!/^\/(user(?:\?|$)|user\/repos(?:\?|$)|repos\/[\w.-]+\/[\w.-]+(?:[/?]|$))/.test(path)||/[\r\n\\#]/.test(path)||path.includes('..')||/%(?:2e|2f|5c)/i.test(path.split('?')[0])&&/%(?:2e|5c)/i.test(path.split('?')[0]))throw new Error('不允许的 GitHub 请求路径。');
      if(!['GET','POST','PUT','PATCH','DELETE'].includes(method)||operation==='publicApi'&&(method!=='GET'||!path.startsWith('/repos/')))throw new Error('不允许的请求方法。');
      const token=this.credentials.read(provider);if(!token&&operation==='api')return {status:401,body:{}};return this.request(origin+path,method,body,token);
    }
    throw new Error('不支持此 GitHub 操作。');
  }
}
