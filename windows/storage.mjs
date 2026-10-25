import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX=8*1024*1024,within=(parent,value)=>value===parent||value.startsWith(parent+'/');
export function decodeText(bytes){
  const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';let text;
  try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch(error){if(encoding!=='utf-8')throw error;text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text))throw new Error('二进制文件不能作为文本打开。');return text.replace(/^\uFEFF/,'');
}
const mimeTypes={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',pdf:'application/pdf',wasm:'application/wasm',txt:'text/plain'};
export const mime=value=>mimeTypes[path.extname(value).slice(1).toLowerCase()]||'application/octet-stream';
export function relativePath(value){
  if(typeof value!=='string'||!value||value.length>4096||value.includes('\\')||/[\x00-\x1f:*?"<>|]/.test(value)||value.endsWith('.vela-tmp'))throw new Error('工作区相对路径无效。');
  const parts=value.split('/');if(parts.length>64||parts.some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw new Error('文件名或工作区相对路径无效。');return value.normalize('NFC');
}
function noLinks(base,target){
  const relative=path.relative(base,target);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('工作区路径越界。');
  let current=base;if(fs.lstatSync(current).isSymbolicLink())throw new Error('不支持符号链接。');
  for(const part of relative.split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('不支持符号链接。');}
}
export function atomic(file,bytes){
  const temp=file+'.vela-tmp';if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()||fs.existsSync(temp)&&fs.lstatSync(temp).isSymbolicLink())throw new Error('不支持符号链接。');
  fs.mkdirSync(path.dirname(file),{recursive:true});const fd=fs.openSync(temp,'w');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);
}
class Transaction{
  constructor(store){this.store=store;this.folder=path.join(store.transactions,randomUUID());fs.mkdirSync(this.folder);this.items=[];this.seen=new Set();this.committed=false;this.flush();}
  flush(){atomic(path.join(this.folder,'journal.json'),JSON.stringify({committed:this.committed,items:this.items}));}
  // Records several files with one journal flush (each track() would flush on its own).
  prepare(files){this.batch=true;try{for(const file of files)this.track(file);}finally{this.batch=false;}this.flush();}
  track(file){
    noLinks(this.store.base,file);const relative=path.relative(this.store.base,file).split(path.sep).join('/');if(!relative||relative.startsWith('transactions/'))throw new Error('事务路径无效。');if(this.seen.has(relative))return;
    const exists=fs.existsSync(file),directory=exists&&fs.statSync(file).isDirectory(),item={path:relative,exists,directory};if(exists&&!directory){item.backup=String(this.items.length);fs.copyFileSync(file,path.join(this.folder,item.backup));}
    this.items.push(item);this.seen.add(relative);if(!this.batch)this.flush();
  }
  mkdir(file){if(file===this.store.base||fs.existsSync(file))return;this.mkdir(path.dirname(file));this.track(file);fs.mkdirSync(file);}
  write(file,data){this.mkdir(path.dirname(file));this.track(file);atomic(file,data);}
  remove(file){this.track(file);if(fs.statSync(file).isDirectory()){for(const entry of fs.readdirSync(file))this.remove(path.join(file,entry));fs.rmdirSync(file);}else fs.unlinkSync(file);}
  copy(source,dest){noLinks(this.store.base,source);if(fs.statSync(source).isDirectory()){this.mkdir(dest);for(const entry of fs.readdirSync(source))this.copy(path.join(source,entry),path.join(dest,entry));}else this.install(source,dest);}
  install(source,dest){noLinks(this.store.base,source);this.mkdir(path.dirname(dest));this.track(dest);const temp=dest+'.vela-tmp';noLinks(this.store.base,temp);fs.copyFileSync(source,temp);const fd=fs.openSync(temp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,dest);}
  commit(){this.committed=true;this.flush();try{fs.rmSync(this.folder,{recursive:true});}catch{/* Committed journals are cleaned on the next launch. */}}
  rollback(){this.store.recover(this.folder);}
}
export class WorkspaceStorage{
  constructor(base){
    this.base=path.resolve(base);fs.mkdirSync(this.base,{recursive:true});noLinks(this.base,this.base);this.root=path.join(this.base,'workspaces','Vela');this.transactions=path.join(this.base,'transactions');fs.mkdirSync(this.root,{recursive:true});fs.mkdirSync(this.transactions,{recursive:true});
    noLinks(this.base,this.root);noLinks(this.base,this.transactions);
    const info=path.join(this.base,'internal-storage.json');this.id=fs.existsSync(info)?JSON.parse(fs.readFileSync(info,'utf8')).id:randomUUID();if(!/^[\w-]{1,80}$/.test(this.id))throw new Error('内部文件夹标识损坏。');if(!fs.existsSync(info))atomic(info,JSON.stringify({id:this.id}));
    this.cache=path.join(this.base,'folder-'+this.id+'.json');this.workspace=path.join(this.base,'workspace.json');this.trash=path.join(this.base,'trash.json');
    for(const name of fs.readdirSync(this.transactions))this.recover(path.join(this.transactions,name));
  }
  recover(folder){
    noLinks(this.base,folder);if(path.dirname(folder)!==this.transactions||!/^[-\w]+$/.test(path.basename(folder)))throw new Error('事务目录无效。');const journal=path.join(folder,'journal.json');if(!fs.existsSync(journal)){fs.rmSync(folder,{recursive:true});return;}
    const record=JSON.parse(fs.readFileSync(journal,'utf8'));if(!Array.isArray(record.items))throw new Error('事务记录损坏。');
    if(!record.committed)for(const item of [...record.items].reverse()){
      relativePath(item.path);if(!/^(workspaces\/Vela(?:\/|$)|trash-payload(?:\/|$)|folder-[\w-]+\.json$|workspace\.json$|trash\.json$)/.test(item.path))throw new Error('事务恢复路径无效。');
      const file=path.join(this.base,item.path);noLinks(this.base,file);
      if(item.exists){if(item.directory)fs.mkdirSync(file,{recursive:true});else{if(!/^\d+$/.test(item.backup))throw new Error('事务备份无效。');const temp=file+'.vela-tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(folder,item.backup),temp);fs.renameSync(temp,file);}}
      else if(fs.existsSync(file)){if(fs.statSync(file).isDirectory())fs.rmdirSync(file);else fs.unlinkSync(file);}
    }
    fs.rmSync(folder,{recursive:true});
  }
  transaction(fn){const tx=new Transaction(this);try{const result=fn(tx);tx.commit();return result;}catch(error){tx.rollback();throw error;}}
  target(value){const file=path.join(this.root,relativePath(value));noLinks(this.root,file);return file;}
  json(file,fallback){noLinks(this.base,file);return fs.existsSync(file)?JSON.parse(this.read(file,64*1024*1024).toString('utf8')):fallback;}
  metadata(){return this.hydrate(this.json(this.cache,{version:1,documents:[],repositories:[]}));}
  read(file,limit=MAX){noLinks(this.base,file);if(!fs.statSync(file).isFile()||fs.statSync(file).size>limit)throw new Error('文件超出读取大小限制。');const bytes=fs.readFileSync(file);if(bytes.length>limit)throw new Error('文件超出读取大小限制。');return bytes;}
  readWorkspace(){const raw=fs.existsSync(this.workspace)?this.read(this.workspace,64*1024*1024).toString('utf8'):'';return raw.startsWith('{"store":')?JSON.stringify(this.hydrate(JSON.parse(raw))):raw;}
  readPlugins(){const file=path.join(this.base,'plugins.json');return fs.existsSync(file)?this.read(file,24*1024*1024).toString('utf8'):'';}
  writePlugins(data){if(typeof data!=='string'||Buffer.byteLength(data)>24*1024*1024||!Array.isArray(JSON.parse(data)))throw new Error('插件数据无效。');atomic(path.join(this.base,'plugins.json'),data);}
  scan(){
    const old=this.metadata(),byPath=new Map(old.documents.map(doc=>[doc.path||doc.name,doc])),documents=[],folders=[],entries=[];
    const walk=directory=>{for(const name of fs.readdirSync(directory?this.target(directory):this.root).sort()){
      if(name==='.git'||name.endsWith('.vela-tmp'))continue;const relative=directory?directory+'/'+name:name,file=this.target(relative),stat=fs.statSync(file);if(entries.length>=5000)throw new Error('内部文件夹超过 5000 项。');
      const entry={path:relative,name,directory:stat.isDirectory(),size:stat.size,editable:false,reason:''};entries.push(entry);
      if(entry.directory){folders.push(relative);walk(relative);}else{if(old.pluginProject?.entries?.[relative]&&!byPath.has(relative)&&name!=='.vela'){entry.editable=!!old.pluginProject?.textFiles?.[relative]||/\.(txt|md|csv|tsv|json|html?|css|[cm]?js|ts|py|java|ets|tex|yaml|yml|xml|toml|velaodt|vodt|fodt|fods|fodp|fodg|gly|glossary|process|pcs|velamap|vlmp)$/i.test(relative);entry.reason=entry.editable?'按需读取项目文件':'';continue;}try{const text=decodeText(this.read(file)),before=byPath.get(relative);documents.push({...before,id:before?.id||randomUUID(),name,path:relative,text,updatedAt:before?.text===text?before.updatedAt:Date.now(),remote:before?.remote||null});entry.editable=true;}catch(error){entry.reason=stat.size>MAX?'超过 8 MB，保留在工作区中':'二进制或不支持的文本编码，保留在工作区中';}}
    }};walk('');return {storage:{id:this.id,label:'内部文件夹',root:this.root,internal:true,needsSetup:false},documents,folders,entries,repositories:old.repositories||[],pluginProject:old.pluginProject};
  }
  saveWorkspace(data){
    if(typeof data!=='string'||Buffer.byteLength(data)>64*1024*1024)throw new Error('工作区数据过大。');const value=JSON.parse(data);if(value.version!==1||!Array.isArray(value.documents)||value.storage?.id!==this.id)throw new Error('文稿数据或内部文件夹标识无效。');
    const old=this.metadata(),before=new Map(old.documents.map(doc=>[doc.path||doc.name,doc])),paths=new Set(),ids=new Set(),folders=value.folders||[];if(value.documents.length+folders.length>5000)throw new Error('内部文件夹超过 5000 项。');
    for(const doc of value.documents){const relative=doc.path||doc.name,file=this.target(relative),key=relative.toLowerCase();if(typeof doc.text!=='string'||Buffer.byteLength(doc.text)>MAX||!/^[-\w]{1,80}$/.test(doc.id)||paths.has(key)||ids.has(doc.id))throw new Error('文件标识、同名路径或大小无效。');paths.add(key);ids.add(doc.id);
      if(fs.existsSync(file)){const disk=decodeText(this.read(file));if(disk!==doc.text&&disk!==before.get(relative)?.text)throw new Error('文件已在外部修改，请刷新后重试：'+relative);}
    }
    for(const folder of folders){this.target(folder);if(paths.has(folder.toLowerCase()))throw new Error('文件与文件夹同名。');}
    for(const [relative,doc] of before)if(!paths.has(relative.toLowerCase())&&fs.existsSync(this.target(relative))&&decodeText(this.read(this.target(relative)))!==doc.text)throw new Error('文件已在外部修改，无法删除：'+relative);
    this.transaction(tx=>{for(const folder of folders)tx.mkdir(this.target(folder));for(const doc of value.documents){const file=this.target(doc.path||doc.name);if(!fs.existsSync(file)||decodeText(this.read(file))!==doc.text)tx.write(file,doc.text);}for(const relative of before.keys())if(!paths.has(relative.toLowerCase())&&fs.existsSync(this.target(relative)))tx.remove(this.target(relative));tx.write(this.cache,data);tx.write(this.workspace,data);});this.collectStore();
  }
  // Incremental saves (docs/WORKSPACE-STORAGE.md). workspace.json and the folder cache then hold a skeleton: the
  // workspace without document texts and local history, which live in workspace-store/ as <id>.<generation> files
  // named by the skeleton's `store` (always the first key, so readWorkspace can tell the formats apart cheaply).
  storeFile(name){if(typeof name!=='string'||!/^[-\w]{1,80}\.[0-9a-f]{12}\.(txt|json)$/.test(name))throw new Error('工作区存储文件名无效。');const file=path.join(this.base,'workspace-store',name);noLinks(this.base,file);return file;}
  hydrate(value){
    const store=value?.store;if(store?.format!==2)return value;
    for(const doc of value.documents)if(typeof doc.text!=='string'){const name=store.texts?.[doc.id];if(!name)throw new Error('工作区存储缺少文稿：'+(doc.path||doc.name));doc.text=this.read(this.storeFile(name)).toString('utf8');}
    value.localHistory=Object.fromEntries(Object.entries(store.histories||{}).map(([id,name])=>[id,JSON.parse(this.read(this.storeFile(name),64*1024*1024).toString('utf8'))]));delete value.store;return value;
  }
  stored(file){if(!fs.existsSync(file))return null;const raw=this.read(file,64*1024*1024).toString('utf8');return raw?JSON.parse(raw):null;}
  saveWorkspaceDelta(data){
    if(typeof data!=='string'||Buffer.byteLength(data)>64*1024*1024)throw new Error('工作区数据过大。');const delta=JSON.parse(data),value=delta?.workspace;
    if(delta?.format!==2||!value||value.version!==1||!Array.isArray(value.documents)||value.storage?.id!==this.id||!delta.texts||typeof delta.texts!=='object'||!delta.histories||typeof delta.histories!=='object'||typeof delta.id!=='string'||!/^[-\w]{1,80}$/.test(delta.id)||'store' in value||'localHistory' in value)throw new Error('增量数据或内部文件夹标识无效。');
    const current=this.stored(this.workspace);if(!current||current.saveId!==delta.base)throw new Error('E_DELTA_BASE 增量保存的基线已变化，改为整份保存。');
    const v2=current.store?.format===2,baseDocs=new Map(current.documents.map(doc=>[doc.id,doc])),baseText=id=>{const doc=baseDocs.get(id);if(!doc)return undefined;if(!v2)return doc.text;const name=current.store.texts?.[id];return name&&fs.existsSync(this.storeFile(name))?this.read(this.storeFile(name)).toString('utf8'):undefined;};
    const folders=value.folders||[];if(!Array.isArray(folders)||value.documents.length+folders.length>5000)throw new Error('内部文件夹超过 5000 项。');
    const paths=new Set(),ids=new Set(),changed=[];
    for(const doc of value.documents){
      const relative=doc.path||doc.name,file=this.target(relative),key=relative.toLowerCase(),text=delta.texts[doc.id];
      if(!/^[-\w]{1,80}$/.test(doc.id)||paths.has(key)||ids.has(doc.id)||'text' in doc||text!==undefined&&(typeof text!=='string'||Buffer.byteLength(text)>MAX))throw new Error('文件标识、同名路径或大小无效。');paths.add(key);ids.add(doc.id);
      const before=baseDocs.get(doc.id);if(text===undefined&&(!before||v2&&!current.store.texts?.[doc.id]))throw new Error('E_DELTA_BASE 增量保存缺少文稿基线，改为整份保存。');
      if(text!==undefined||(before.path||before.name)!==relative)changed.push({doc,relative,file,text:text??baseText(doc.id)});
    }
    for(const id of Object.keys(delta.texts))if(!ids.has(id))throw new Error('增量文本不属于任何文稿。');
    for(const [id,list] of Object.entries(delta.histories))if(list!==null&&(!ids.has(id)||!Array.isArray(list)||list.some(item=>typeof item?.text!=='string'||!Number.isFinite(item.createdAt))))throw new Error('本地历史数据无效。');
    for(const folder of folders){this.target(folder);if(paths.has(folder.toLowerCase()))throw new Error('文件与文件夹同名。');}
    const atPath=new Map(current.documents.map(doc=>[(doc.path||doc.name).toLowerCase(),doc]));
    for(const item of changed){if(item.text===undefined)throw new Error('E_DELTA_BASE 增量保存缺少文稿基线，改为整份保存。');if(fs.existsSync(item.file)){const disk=decodeText(this.read(item.file)),before=atPath.get(item.relative.toLowerCase());if(disk!==item.text&&(!before||disk!==baseText(before.id)))throw new Error('文件已在外部修改，请刷新后重试：'+item.relative);}}
    const removed=current.documents.map(doc=>doc.path||doc.name).filter(relative=>!paths.has(relative.toLowerCase())&&fs.existsSync(this.target(relative)));
    for(const relative of removed)if(decodeText(this.read(this.target(relative)))!==baseText(atPath.get(relative.toLowerCase()).id))throw new Error('文件已在外部修改，无法删除：'+relative);
    // New store files get fresh names, so the previous skeleton and its files stay intact until the transaction commits.
    const generation=()=>randomUUID().replaceAll('-','').slice(0,12),texts={},histories={},written=[];
    const put=(id,kind,content)=>{const name=`${id}.${generation()}.${kind}`;atomic(this.storeFile(name),content);written.push(name);return name;};
    try{
      for(const doc of value.documents)texts[doc.id]=delta.texts[doc.id]!==undefined?put(doc.id,'txt',delta.texts[doc.id]):v2?current.store.texts[doc.id]:put(doc.id,'txt',baseText(doc.id));
      const oldHistories=v2?current.store.histories||{}:Object.fromEntries(Object.entries(current.localHistory||{}).filter(([id,list])=>ids.has(id)&&!(id in delta.histories)&&list?.length).map(([id,list])=>[id,put(id,'json',JSON.stringify(list))]));
      for(const [id,name] of Object.entries(oldHistories))if(ids.has(id)&&!(id in delta.histories))histories[id]=name;
      for(const [id,list] of Object.entries(delta.histories))if(list!==null&&list.length)histories[id]=put(id,'json',JSON.stringify(list));
      const skeleton=JSON.stringify({store:{format:2,texts,histories},...value,saveId:delta.id});
      // The previous skeleton is kept, so the previous generation of every changed text and history stays recoverable.
      // A convenience copy, not part of the commit, so it is renamed into place without fsync.
      if(v2){const previous=path.join(this.base,'workspace-store','previous.json');fs.writeFileSync(previous+'.vela-tmp',JSON.stringify(current));fs.renameSync(previous+'.vela-tmp',previous);}
      const writes=changed.filter(item=>!fs.existsSync(item.file)||decodeText(this.read(item.file))!==item.text);
      this.transaction(tx=>{for(const folder of folders)tx.mkdir(this.target(folder));for(const item of writes)tx.mkdir(path.dirname(item.file));tx.prepare([...writes.map(item=>item.file),this.cache,this.workspace]);for(const item of writes)tx.write(item.file,item.text);for(const relative of removed)tx.remove(this.target(relative));tx.write(this.cache,skeleton);tx.write(this.workspace,skeleton);});
    }catch(error){for(const name of written)fs.rmSync(this.storeFile(name),{force:true});throw error;}
    this.collectStore();
  }
  // Keeps the files named by workspace.json, the folder cache and the previous skeleton; older generations go.
  collectStore(){
    const folder=path.join(this.base,'workspace-store');if(!fs.existsSync(folder))return;const keep=new Set();
    for(const file of [this.workspace,this.cache,path.join(this.base,'workspace-store','previous.json')]){try{const raw=fs.existsSync(file)?this.read(file,64*1024*1024).toString('utf8'):'';if(raw.startsWith('{"store":')){const store=JSON.parse(raw).store;for(const name of [...Object.values(store.texts||{}),...Object.values(store.histories||{})])keep.add(name);}}catch{return;}}
    for(const name of fs.readdirSync(folder))if(name!=='previous.json'&&!keep.has(name))fs.rmSync(path.join(folder,name),{force:true,recursive:true});
  }
  writeFiles(files,folders=[],deletions=[]){
    if(!Array.isArray(files)||!Array.isArray(folders)||!Array.isArray(deletions)||files.length+folders.length+deletions.length>5000)throw new Error('仓库目录过大。');const seen=new Set();let total=0;
    const values=files.map(file=>{this.target(file.path);if(typeof file.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)||seen.has(file.path.toLowerCase()))throw new Error('文件编码或同名路径无效。');seen.add(file.path.toLowerCase());const bytes=Buffer.from(file.data,'base64');total+=bytes.length;if(bytes.length>MAX||total>64*1024*1024)throw new Error('仓库文件超出大小限制。');return {path:file.path,bytes};});
    for(const folder of folders){this.target(folder);if(seen.has(folder.toLowerCase()))throw new Error('文件与文件夹同名。');}
    const old=this.metadata(),records=this.records();
    if(records.length+deletions.length>100)throw new Error('回收站已有较多项目，请先清理后再同步删除。');
    const removed=deletions.map(item=>{
      const file=this.target(item.path),key=item.path.toLowerCase();
      if(seen.has(key)||folders.some(folder=>folder.toLowerCase()===key)||typeof item.expectedData!=='string'||item.expectedData.length>12*1024*1024)throw new Error('删除路径重复或缺少本地版本。');
      seen.add(key);const bytes=this.read(file);total+=bytes.length;
      if(total>64*1024*1024||bytes.toString('base64')!==item.expectedData||typeof item.expectedText==='string'&&decodeText(bytes)!==item.expectedText)throw new Error('本地文件已变化，未执行同步删除：'+item.path);
      return {...item,file,id:randomUUID()};
    });
    return this.transaction(tx=>{
      for(const item of removed){
        if(this.read(item.file).toString('base64')!==item.expectedData)throw new Error('本地文件已变化，未执行同步删除：'+item.path);
        const documents=old.documents.filter(doc=>(doc.path||doc.name)===item.path);
        records.push({id:item.id,path:item.path,directory:false,createdAt:Date.now(),documents,repositories:[]});
        tx.copy(item.file,path.join(this.base,'trash-payload',item.id));tx.remove(item.file);
        old.documents=old.documents.filter(doc=>(doc.path||doc.name)!==item.path);
        if(old.pluginProject)for(const field of ['entries','textFiles'])if(old.pluginProject[field])delete old.pluginProject[field][item.path];
      }
      if(removed.length){tx.write(this.trash,JSON.stringify(records));tx.write(this.cache,JSON.stringify(old));}
      for(const folder of folders)tx.mkdir(this.target(folder));
      for(const file of values)tx.write(this.target(file.path),file.bytes);
      const result=this.scan();tx.write(this.cache,JSON.stringify({version:1,...result}));return result;
    });
  }
  records(){return this.json(this.trash,[]);}
  listTrash(){return this.records().map(({id,path,directory,createdAt})=>({id,path,name:path.split('/').at(-1),directory,createdAt}));}
  manage(action,relative,destination=''){
    const source=this.target(relative);if(!fs.existsSync(source))throw new Error('项目不存在。');const old=this.metadata(),records=this.records();
    return this.transaction(tx=>{
      if(action==='delete'){
        if(records.length>=100)throw new Error('回收站已满。');const id=randomUUID(),removed=old.documents.filter(doc=>within(relative,doc.path||doc.name)),repos=(old.repositories||[]).filter(item=>within(relative,item.folder));
        records.push({id,path:relative,directory:fs.statSync(source).isDirectory(),createdAt:Date.now(),documents:removed,repositories:repos});tx.copy(source,path.join(this.base,'trash-payload',id));tx.remove(source);old.documents=old.documents.filter(doc=>!within(relative,doc.path||doc.name));old.repositories=(old.repositories||[]).filter(item=>!within(relative,item.folder));tx.write(this.trash,JSON.stringify(records));
      }else if(['move','copy'].includes(action)){
        const dest=this.target(destination);if(within(relative.toLowerCase(),destination.toLowerCase())||fs.existsSync(dest))throw new Error('目标已存在或位于自身目录。');tx.copy(source,dest);if(action==='move')tx.remove(source);
        const remap=doc=>({...doc,path:destination+(doc.path||doc.name).slice(relative.length),name:(destination+(doc.path||doc.name).slice(relative.length)).split('/').at(-1),id:action==='copy'?randomUUID():doc.id,remote:action==='copy'?null:doc.remote});
        const selected=old.documents.filter(doc=>within(relative,doc.path||doc.name));old.documents=action==='copy'?[...old.documents,...selected.map(remap)]:old.documents.map(doc=>within(relative,doc.path||doc.name)?remap(doc):doc);if(action==='move')for(const repo of old.repositories||[])if(within(relative,repo.folder))repo.folder=destination+repo.folder.slice(relative.length);
      }else throw new Error('文件操作无效。');if(old.pluginProject)for(const field of ['entries','textFiles']){const values=old.pluginProject[field]||{},next={...values};for(const [key,value] of Object.entries(values))if(within(relative,key)){if(action!=='copy')delete next[key];if(action!=='delete')next[destination+key.slice(relative.length)]=field==='entries'&&action==='copy'?randomUUID():value;}old.pluginProject[field]=next;}tx.write(this.cache,JSON.stringify(old));return this.scan();
    });
  }
  restoreTrash(id,permanent=false){
    const records=this.records(),item=records.find(item=>item.id===id);if(!item||!/^[-\w]+$/.test(id))throw new Error('回收站项目不存在。');const payload=path.join(this.base,'trash-payload',id);noLinks(this.base,payload);
    return this.transaction(tx=>{if(!permanent){const dest=this.target(item.path);if(fs.existsSync(dest))throw new Error('原路径已有同名项目。');tx.copy(payload,dest);const old=this.metadata();old.documents.push(...item.documents);old.repositories=[...(old.repositories||[]),...item.repositories];tx.write(this.cache,JSON.stringify(old));}tx.remove(payload);tx.write(this.trash,JSON.stringify(records.filter(item=>item.id!==id)));return this.scan();});
  }
  resource(relative,html=false){const type=html?'text/html':mime(relative);let bytes=this.read(this.target(relative));if(type.startsWith('text/')||['image/svg+xml','application/json'].includes(type)){let text=decodeText(bytes);if(type==='text/html')text='<meta name="viewport" content="width=device-width,initial-scale=1">'+text.replace(/(<meta\b[^>]*charset\s*=\s*["']?)[a-z0-9_-]+/gi,'$1utf-8');bytes=Buffer.from(text);}return {mime:type,bytes};}
  asset(relative){const resource=this.resource(relative);if(!/^image\/(png|jpeg|gif|webp)$/.test(resource.mime))throw new Error('不支持此附件类型。');return 'data:'+resource.mime+';base64,'+resource.bytes.toString('base64');}
}
