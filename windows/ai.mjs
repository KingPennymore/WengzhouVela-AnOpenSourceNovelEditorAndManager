const LIMIT=2*1024*1024,RESPONSE_LIMIT=4*1024*1024;
export function aiEndpoint(value){
  if(typeof value!=='string'||!value||value.length>512||/[\s\\?#]/.test(value)||!/^https?:\/\//i.test(value))throw Error('AI 接口地址无效。');
  let url;try{url=new URL(value);}catch{throw Error('AI 接口地址无效。');}
  if(!url.hostname||url.username||url.password||url.port==='0'||!value.split('/')[2]||value.split('/')[2].includes('@'))throw Error('AI 接口地址无效。');
  const authority=value.split('/')[2],host=(authority.startsWith('[')?authority.slice(0,authority.indexOf(']')+1):authority.split(':')[0]).toLowerCase(),parts=host.split('.'),ipv4=parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=255&&String(Number(p))===p);
  const local=host==='localhost'||host==='127.0.0.1'||host==='[::1]'||host.endsWith('.local')||ipv4&&(Number(parts[0])===10||Number(parts[0])===172&&Number(parts[1])>=16&&Number(parts[1])<=31||Number(parts[0])===192&&Number(parts[1])===168);
  if(url.protocol!=='https:'&&(url.protocol!=='http:'||!local))throw Error('AI 接口地址必须使用 HTTPS，本机或局域网地址可使用 HTTP。');
  return value.replace(/\/+$/,'');
}
export function aiCredential(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('AI 请求数据无效。');
  if(!['openai','anthropic','gemini','azure'].includes(data.format))throw Error('不支持此 AI 请求格式。');
  const endpoint=aiEndpoint(data.endpoint);
  if(typeof data.key!=='string'||data.key.length>4096||/\s/.test(data.key))throw Error('AI 密钥格式不正确。');
  return {format:data.format,endpoint,key:data.key};
}
export function aiPath(format,path){
  if(typeof path!=='string'||format==='gemini'&&path.includes('..')||!(format==='openai'?path==='/chat/completions':format==='anthropic'?path==='/v1/messages':format==='gemini'?/^\/v1beta\/models\/[A-Za-z0-9._:/-]{1,128}:generateContent$/.test(path):format==='azure'&&/^\/openai\/deployments\/[A-Za-z0-9._-]{1,128}\/chat\/completions\?api-version=[0-9a-z.-]{1,32}$/.test(path)))throw Error('不允许的 AI 请求路径。');
  return path;
}
export function aiHeaders({format,key}){
  const headers={Accept:'application/json','Content-Type':'application/json'};
  if(format==='openai'){if(key)headers.Authorization='Bearer '+key;}
  else if(format==='anthropic'){headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';}
  else if(format==='gemini')headers['x-goog-api-key']=key;
  else if(format==='azure')headers['api-key']=key;
  return headers;
}
const status=value=>({saved:!!value,format:value?.format||'',endpoint:value?.endpoint||'',last4:value?.key.slice(-4)||''});
export class AiBridge{
  constructor({credentials,fetch}){this.credentials=credentials;this.fetch=fetch;this.requests=new Map();}
  read(){const value=this.credentials.read('ai');if(!value)return null;let parsed;try{parsed=JSON.parse(value);}catch{throw Error('AI 配置读取失败，请重新保存。');}return aiCredential(parsed);}
  async call(data={}){
    if(data.action==='cancel'){const task=this.requests.get(data.requestId);if(task){task.cancelled=true;task.controller.abort();}return true;}
    if(data.action==='clear'){this.credentials.clear('ai');return true;}
    if(data.action==='status')return status(this.read());
    if(data.action==='save'){const value=aiCredential(data);this.credentials.write(JSON.stringify(value),'ai');return status(value);}
    if(data.action==='verify'){
      const value=aiCredential(data);
      if(value.format==='azure')return {status:200,body:{}};
      return this.request(value,'GET',value.format==='openai'?'/models':value.format==='anthropic'?'/v1/models':'/v1beta/models');
    }
    if(data.action==='request'){
      const value=this.read();if(!value)return {status:401,body:{error:{message:'未配置 AI 服务。'}}};
      if(data.method!=='POST')throw Error('不允许的 AI 请求方法。');
      aiPath(value.format,data.path);
      if(typeof data.requestId!=='string'||!data.requestId||data.requestId.length>128)throw Error('AI 请求标识无效。');
      if(this.requests.has(data.requestId))throw Error('AI 请求标识已在使用。');
      let body;try{body=JSON.stringify(data.body);}catch{throw Error('AI 请求数据无效。');}
      if(body===undefined)throw Error('AI 请求数据无效。');
      if(Buffer.byteLength(body)>LIMIT)throw Error('AI 请求内容不能超过 2 MB。');
      return this.request(value,'POST',data.path,body,data.requestId);
    }
    throw Error('不支持此 AI 操作。');
  }
  async request(value,method,path,body,id){
    const task={controller:new AbortController(),cancelled:false,timedOut:false},timer=setTimeout(()=>{task.timedOut=true;task.controller.abort();},120000);
    if(id)this.requests.set(id,task);
    let reader;
    try{
      const response=await this.fetch(value.endpoint+path,{method,headers:aiHeaders(value),body,redirect:'manual',signal:task.controller.signal,bypassCustomProtocolHandlers:true});
      if(response.status>=300&&response.status<400)throw Error('AI 服务不允许重定向。');
      const chunks=[];let size=0;reader=response.body?.getReader();
      if(reader)for(;;){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>RESPONSE_LIMIT)throw Error('AI 响应内容不能超过 4 MB。');chunks.push(Buffer.from(chunk));}
      const text=Buffer.concat(chunks).toString('utf8');let parsed;try{parsed=JSON.parse(text);}catch{parsed={error:{message:text}};}
      if(task.cancelled)throw Error('AI 请求已取消。');
      if(task.timedOut)throw Error('AI 请求超时，请稍后重试。');
      return {status:response.status,body:parsed};
    }catch(error){
      if(task.cancelled)throw Error('AI 请求已取消。');
      if(task.timedOut)throw Error('AI 请求超时，请稍后重试。');
      if(['AI 响应内容不能超过 4 MB。','AI 服务不允许重定向。'].includes(error.message))throw error;
      throw Error('无法连接 AI 服务，请检查网络或接口地址。');
    }finally{clearTimeout(timer);if(reader)try{await reader.cancel();}catch{}if(id)this.requests.delete(id);}
  }
}
