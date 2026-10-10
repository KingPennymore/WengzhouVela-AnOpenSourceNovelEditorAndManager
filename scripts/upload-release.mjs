import http2 from 'node:http2';
import {createReadStream,statSync} from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {url,token,path}=JSON.parse(input),target=new URL(url),name=path.split(/[\\/]/).at(-1);
const session=http2.connect(target.origin);session.setTimeout(300000,()=>session.destroy(Error('Upload inactive for five minutes')));
try{
 const result=await new Promise((resolve,reject)=>{
  session.on('error',reject);
  const req=session.request({':method':'POST',':path':target.pathname+target.search,'authorization':'Bearer '+token,'content-type':'application/octet-stream','content-length':String(statSync(path).size),'user-agent':'Vela-release-upload','accept':'application/vnd.github+json','x-github-api-version':'2022-11-28'});
  let status,body='',sent=0,last=0;
  req.on('response',headers=>status=headers[':status']);req.setEncoding('utf8');
  req.on('data',chunk=>{body+=chunk;if(body.length>1024*1024)req.destroy(Error('Unexpected upload response size'));});req.on('error',reject);
  req.on('end',()=>{try{const item=JSON.parse(body);if(status!==201)throw Error('GitHub upload HTTP '+status+': '+(item.message||'rejected'));resolve(item);}catch(error){reject(error);}});
  const file=createReadStream(path,{highWaterMark:256*1024});file.on('error',error=>{req.destroy(error);reject(error);});
  file.on('data',chunk=>{sent+=chunk.length;if(sent-last>=16*1024*1024){last=sent;process.stderr.write(`Sent ${Math.floor(sent/1024/1024)} MiB: ${name}\n`);}});file.pipe(req);
 });
 process.stdout.write(JSON.stringify(result));
}catch(error){process.stderr.write('Upload failed: '+error.message+'\n');process.exitCode=1;}finally{session.destroy();}
