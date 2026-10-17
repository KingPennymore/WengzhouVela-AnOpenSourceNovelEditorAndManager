// Measures one autosave of a 400,000-character workspace in 50 files on the Windows storage: the full JSON save
// (the only path before incremental saves) against an incremental save after editing one file.
// Usage: node scripts/benchmark-workspace-save.mjs [rounds]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkspaceStorage} from '../windows/storage.mjs';
import {workspaceDelta} from '../web/platform.mjs';

const rounds=Number(process.argv[2]||15),base=fs.mkdtempSync(path.join(os.tmpdir(),'vela-save-bench-'));
const paragraph='　　林舟站在甲板上望着远处的灯塔，海风把帆吹得猎猎作响，船正向着港湾缓缓驶去。\n';
try{
  const store=new WorkspaceStorage(base),scan=store.scan();
  const documents=Array.from({length:50},(_,i)=>{const text=`第${i+1}章 航程\n`+paragraph.repeat(Math.ceil(8000/paragraph.length)).slice(0,8000);return {id:'chapter-'+i,name:`第${i+1}章.txt`,path:`航程/第${i+1}章.txt`,text,updatedAt:1};});
  const value={version:1,...scan,documents,folders:['航程'],settings:{theme:'light'},localHistory:{'chapter-0':[{text:documents[0].text,createdAt:1,revision:0}]}};
  const characters=documents.reduce((n,doc)=>n+doc.text.length,0);
  const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];
  const full=[],delta=[];let fullBytes=0,deltaBytes=0,saveId='s0';
  store.saveWorkspace(JSON.stringify({...value,saveId}));
  for(let round=0;round<rounds;round++){
    value.documents[round%50].text+='新';const start=performance.now(),data=JSON.stringify({...value,saveId:'f'+round});store.saveWorkspace(data);full.push(performance.now()-start);fullBytes=Buffer.byteLength(data);saveId='f'+round;
  }
  const confirmed=()=>({saveId,storage:value.storage.id,texts:new Map(value.documents.map(d=>[d.id,d.text])),histories:new Map(Object.entries(value.localHistory).map(([id,list])=>[id,{list,length:list.length}]))});
  let baseline=confirmed();value.documents[0].text+='暖';const migration=performance.now();store.saveWorkspaceDelta(JSON.stringify(workspaceDelta(value,baseline,'m')));const migrationMs=performance.now()-migration;saveId='m';
  for(let round=0;round<rounds;round++){
    baseline=confirmed();value.documents[round%50].text+='字';const start=performance.now(),message=JSON.stringify(workspaceDelta(value,baseline,'d'+round));store.saveWorkspaceDelta(message);delta.push(performance.now()-start);deltaBytes=Buffer.byteLength(message);saveId='d'+round;
  }
  // The first delta after a full save migrates every text into workspace-store/ once; rounds after it are steady state.
  const result={characters,files:50,rounds,full:{medianMs:+median(full).toFixed(2),bytes:fullBytes},delta:{medianMs:+median(delta).toFixed(2),bytes:deltaBytes},firstDeltaAfterFullMs:+migrationMs.toFixed(2)};
  console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(base,{recursive:true,force:true});}
