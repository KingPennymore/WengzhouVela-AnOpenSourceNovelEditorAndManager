import test from 'node:test';
import assert from 'node:assert/strict';
import {Gitee} from '../web/gitee.mjs';
import {GitHubBridge} from '../windows/github.mjs';
import {applyRemoteFile,repositoryFolder,applyRepository} from '../web/git-workspace.mjs';
import {downloadPlan} from '../web/sync-plan.mjs';

test('Gitee uses its provider for paginated repositories and its branch and Contents protocols',async()=>{
 const calls=[],client=new Gitee(async(op,data)=>{calls.push({op,...data});return {status:200,body:data.path.startsWith('/user/repos')?[]:{content:{sha:'new'}}};});
 await client.repositories();await client.createBranch('o/r','draft/one','draft/two');await client.commit({repo:'o/r',branch:'main',path:'正文.txt',text:'中文',message:'新增'});await client.commit({repo:'o/r',branch:'main',path:'正文.txt',sha:'old',text:'正文',message:'修改'});
 assert.ok(calls.every(call=>call.provider==='gitee'));assert.ok(!calls[0].path.includes('affiliation'));assert.deepEqual(calls[1].body,{refs:'draft/one',branch_name:'draft/two'});assert.equal(calls[2].method,'POST');assert.equal(calls[3].method,'PUT');assert.equal(calls[3].body.sha,'old');
});
test('Gitee pulls from immutable commit/tree/blob endpoints with provider identity',async()=>{
 const paths=[],client=new Gitee(async(_op,data)=>{paths.push(data.path);const body=data.path.includes('/branches/')?{commit:{sha:'head'}}:data.path.includes('/commits/')?{commit:{tree:{sha:'tree'}}}:data.path.includes('/trees/')?{tree:[{type:'blob',mode:'100644',path:'正文.txt',size:6,sha:'blob'}]}:{encoding:'base64',content:Buffer.from('正文').toString('base64')};return {status:200,body};});
 const result=await client.pullRepository('o/r','draft/one');assert.equal(result.provider,'gitee');assert.equal(result.files[0].text,'正文');assert.equal(paths[0],'/repos/o/r/branches/draft%2Fone');assert.equal(paths[1],'/repos/o/r/commits/head');assert.ok(paths[2].includes('/git/trees/tree'));
});
test('Gitee submits text, binary and deletions in one atomic action batch with file version checks',async()=>{
 const calls=[],client=new Gitee(async(_op,data)=>{calls.push(data);if(data.path.includes('/branches/'))return {status:200,body:{commit:{sha:'head'}}};if(data.path.includes('/contents/'))return {status:data.path.includes('/new.txt?')?404:200,body:{sha:'file'}};if(data.path.includes('/commits?'))return {status:200,body:[{sha:'last-file-commit'}]};return {status:201,body:{sha:'next',files:[{filename:'new.txt',sha:'new-file'}]}};});
 const result=await client.commitWorkspace({repo:'o/r',branch:'main',expectedHead:'head',message:'一起提交',files:[{path:'new.txt',text:'中文'},{path:'image.png',data:'AQID'},{path:'old.txt',delete:true}]});
 const writes=calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].path,'/repos/o/r/commits');assert.deepEqual(writes[0].body.actions.map(action=>action.action),['create','update','delete']);assert.equal(writes[0].body.actions[1].encoding,'base64');assert.equal(writes[0].body.actions[1].last_commit_id,'last-file-commit');assert.equal(result.files[0].path,'new.txt');
});
test('Gitee stale head and oversized content never submit writes',async()=>{
 let writes=0;const client=new Gitee(async(_op,data)=>{if(data.method!=='GET')writes++;return {status:200,body:{commit:{sha:'new-head'}}};});
 await assert.rejects(client.commitWorkspace({repo:'o/r',branch:'main',expectedHead:'old',message:'更新',files:[{path:'book.txt',text:'正文'}]}),error=>error.status===409);await assert.rejects(client.commit({repo:'o/r',branch:'main',path:'book.txt',message:'更新',text:'字'.repeat(3*1024*1024)}),/8 MB/);assert.equal(writes,0);
});
test('Windows keeps credentials isolated and only uses fixed provider origins',async()=>{
 const secrets=new Map(),calls=[],bridge=new GitHubBridge({credentials:{read:provider=>secrets.get(provider)||'',write:(token,provider)=>secrets.set(provider,token),clear:provider=>secrets.delete(provider)},request:async(url,method,body,token)=>{calls.push({url,token});return {status:200,body:{login:'writer'}};}});
 await bridge.call('login',{provider:'github',token:'github-fixture'});await bridge.call('login',{provider:'gitee',token:'gitee-fixture'});await bridge.call('api',{provider:'gitee',path:'/user'});assert.equal(calls.at(-1).url,'https://gitee.com/api/v5/user');assert.equal(calls.at(-1).token,'gitee-fixture');await bridge.call('api',{path:'/user'});assert.equal(calls.at(-1).token,'github-fixture');await bridge.call('logout',{provider:'gitee'});assert.equal(secrets.get('github'),'github-fixture');assert.ok(!secrets.has('gitee'));await assert.rejects(bridge.call('api',{provider:'evil',path:'/user'}));
});
test('Same repo/path on Gitee and GitHub retain separate files, folders and sync bases',()=>{
 const workspace={documents:[],repositories:[],openIds:[],folders:[]};const original=applyRemoteFile(workspace,{repo:'o/r',branch:'main',path:'book.txt',text:'GitHub',sha:'gh'});const other=applyRemoteFile(workspace,{provider:'gitee',repo:'o/r',branch:'main',path:'book.txt',text:'Gitee',sha:'ge'});assert.notEqual(original.id,other.id);assert.equal(original.text,'GitHub');assert.equal(other.remote.provider,'gitee');
 workspace.repositories=[{repo:'o/r',folder:'GitHub',branch:'main',baseFiles:{}}];assert.notEqual(repositoryFolder(workspace,'o/r','gitee'),'GitHub');const result={provider:'gitee',repo:'o/r',branch:'main',commit:'head',folders:[],files:[{path:'book.txt',text:'Gitee next',sha:'next'}]};assert.equal(downloadPlan(workspace,result,'Gitee')[0].doc.id,other.id);applyRepository(workspace,result,'Gitee');assert.equal(workspace.repositories.length,2);assert.equal(original.text,'GitHub');assert.equal(other.text,'Gitee next');
});
