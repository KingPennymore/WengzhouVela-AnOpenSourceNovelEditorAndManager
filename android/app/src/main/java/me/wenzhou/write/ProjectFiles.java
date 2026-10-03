package me.wenzhou.write;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.*;

/** Plugin project wire service. All large payloads are streamed in app-private storage. */
final class ProjectFiles {
    static final long MB = 1024L * 1024, FILE_LIMIT = 128 * MB, PROJECT_LIMIT = 512 * MB;
    static final int CHUNK = 256 * 1024;
    static final class Failure extends IOException {
        final String code; Failure(String code, String message) { super(message); this.code = code; }
    }
    private final Context context; private final WorkspaceFiles files;
    private final File temp, objects, snapshots;
    private final Map<String, Blob> blobs = new ConcurrentHashMap<>();
    private final Map<String, Selection> selections = new ConcurrentHashMap<>();
    private final Map<String, Archive> archives = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<String, Output> outputs = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    volatile boolean busy;
    private static final class Blob { String owner, root, hash, expectedHash, last; File file; long size, written; int sequence; boolean complete; long expires; MessageDigest digest; }
    private static final class Selection { String owner, name, mime, hash; File file; long size; }
    private static final class Archive { String owner, hash; File file; JSONArray entries; }
    private static final class Session { String owner, pluginId, root, snapshotId; JSONArray roots; }
    private static final class Output { String owner, hash; File file; long size; }
    ProjectFiles(Context context, WorkspaceFiles files) throws Exception {
        this.context=context; this.files=files; File base=new File(files.projectBase(),"project-data"); temp=new File(base,"sessions");objects=new File(base,"objects");snapshots=new File(base,"snapshots");
        for (File dir:new File[]{temp,objects,snapshots}) Files.createDirectories(dir.toPath());
        for(File file:children(temp)) remove(file);
    }
    static Failure fail(String code,String message){return new Failure(code,message);}
    static String relative(String value, boolean empty) throws Failure {
        if (empty && "".equals(value)) return value;
        if(value==null||value.isEmpty()||value.length()>4096||value.matches("(?s).*[\\\\\\x00-\\x1f:*?\"<>|].*"))throw fail("E_INVALID_PATH","请使用有效的项目相对路径。");
        String[] parts=value.split("/",-1);if(parts.length>64)throw fail("E_INVALID_PATH","目录层级过深。");
        for(String p:parts)if(p.isEmpty()||p.equals(".")||p.equals("..")||p.equals(".git")||p.matches("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$")||p.matches("(?s).*[. ]$")||p.endsWith(".wenzhou-tmp")||p.endsWith(".vela-tmp"))throw fail("E_INVALID_PATH","路径包含不可用名称。");
        return Normalizer.normalize(value,Normalizer.Form.NFC);
    }
    static boolean within(String root,String p){return root.isEmpty()||p.equals(root)||p.startsWith(root+"/");}
    private File target(String root,String p,boolean empty) throws Exception {
        relative(root,true);relative(p,empty);String full=root.isEmpty()?p:p.isEmpty()?root:root+"/"+p;
        return full.isEmpty()?files.projectRoot():files.projectTarget(full);
    }
    private static File[] children(File dir) throws IOException {File[] values=dir.listFiles();if(values==null)throw new IOException("无法读取项目目录。");Arrays.sort(values,Comparator.comparing(File::getName));return values;}
    private static void remove(File file)throws IOException{if(Files.isSymbolicLink(file.toPath()))throw new IOException("不支持符号链接。");if(file.isDirectory())for(File child:children(file))remove(child);Files.deleteIfExists(file.toPath());}
    private static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    private static String hash(File file)throws Exception{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1)digest.update(block,0,n);}return hex(digest.digest());}
    private static String hash(String value)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
    private void check(String owner,String task)throws Failure{if(cancelled.contains(owner+":"+task))throw fail("E_CANCELLED","任务已取消。");}
    private Blob ownedBlob(String owner,String id)throws Failure{Blob b=blobs.get(id);if(b==null||!owner.equals(b.owner))throw fail("E_NOT_FOUND","暂存对象不存在。");b.expires=System.currentTimeMillis()+1800000;return b;}
    private JSONObject capabilities()throws Exception{
        return new JSONObject().put("limits",new JSONObject().put("textBytes",8*MB).put("readChunkBytes",CHUNK).put("bridgeChunkBytes",CHUNK).put("importFileBytes",FILE_LIMIT).put("projectEntries",5000).put("archiveExpandedBytes",256*MB).put("archiveEntries",5000).put("projectBytes",PROJECT_LIMIT).put("snapshotBytes",PROJECT_LIMIT))
          .put("resource",new JSONObject().put("range",true).put("worker",true).put("canvas2d",true))
          .put("features",new JSONObject().put("filesystem",true).put("transactions",true).put("assetSessions",true).put("archives",true).put("snapshots",true).put("nativePicker",true).put("independentPreview",false).put("externalWatch",false));
    }
    private JSONArray tree(String root)throws Exception{
        JSONArray entries=new JSONArray();walk(root,"",entries,new long[]{0});
        for(int i=entries.length()-1;i>=0;i--){JSONObject entry=entries.getJSONObject(i);if(entry.getString("kind").equals("directory")){JSONArray descendants=new JSONArray();for(int n=0;n<entries.length();n++){JSONObject child=entries.getJSONObject(n);if(n!=i&&within(entry.getString("path"),child.getString("path")))descendants.put(new JSONArray().put(child.getString("path")).put(child.getString("revision")));}entry.put("revision","r:"+hash(descendants.toString()));}}
        return entries;
    }
    private void walk(String root,String directory,JSONArray entries,long[] size)throws Exception{
        for(File file:children(target(root,directory,true))){
            String name=file.getName();if(name.equals(".git")||name.endsWith(".wenzhou-tmp")||name.endsWith(".vela-tmp"))continue;String path=directory.isEmpty()?name:directory+"/"+name;target(root,path,false);
            if(Files.isSymbolicLink(file.toPath()))throw fail("E_INVALID_PATH","项目包含符号链接。");if(entries.length()>=5000)throw fail("E_LIMIT","项目超过 5000 项。");
            JSONObject entry=new JSONObject().put("path",path).put("kind",file.isDirectory()?"directory":"file").put("size",file.isDirectory()?0:file.length()).put("mime",file.isDirectory()?"inode/directory":PreviewResource.mime(path)).put("modifiedAt",Instant.ofEpochMilli(file.lastModified()).toString());entries.put(entry);
            if(file.isDirectory())walk(root,path,entries,size);else if(file.isFile()){if((size[0]+=file.length())>PROJECT_LIMIT)throw fail("E_LIMIT","项目超过容量限制。");entry.put("revision","r:"+hash(file));}else throw fail("E_INVALID_DATA","不支持此项目条目。");
        }
    }
    private JSONObject begin(String owner,JSONObject a)throws Exception{
        long size=a.getLong("size");if(size<0||size>FILE_LIMIT)throw fail("E_LIMIT","素材超过单文件限制。");if(blobs.size()>=5000||blobs.values().stream().mapToLong(b->b.size).sum()+size>PROJECT_LIMIT)throw fail("E_LIMIT","未提交素材过多，请清理暂存。");
        String id=UUID.randomUUID().toString();Blob b=new Blob();b.owner=owner;b.root=a.optString("root");b.size=size;b.expectedHash=a.optString("sha256");if(!b.expectedHash.isEmpty()&&!b.expectedHash.matches("[a-fA-F0-9]{64}"))throw fail("E_INVALID_DATA","SHA-256 无效。");
        b.file=new File(temp,id);Files.createFile(b.file.toPath());b.digest=MessageDigest.getInstance("SHA-256");b.expires=System.currentTimeMillis()+1800000;blobs.put(id,b);return new JSONObject().put("blobId",id).put("maxChunkBytes",CHUNK);
    }
    private JSONObject chunk(String owner,JSONObject a)throws Exception{
        Blob b=ownedBlob(owner,a.getString("blobId"));byte[] data=Base64.decode(a.getString("data"),Base64.NO_WRAP);String digest=hex(MessageDigest.getInstance("SHA-256").digest(data));int sequence=a.getInt("sequence");
        if(sequence==b.sequence-1&&digest.equals(b.last))return new JSONObject().put("acceptedBytes",b.written).put("nextSequence",b.sequence);
        if(b.complete||sequence!=b.sequence||data.length>CHUNK||b.written+data.length>b.size)throw fail("E_INVALID_DATA","块大小或顺序无效。");
        try(FileOutputStream out=new FileOutputStream(b.file,true)){out.write(data);}b.digest.update(data);b.written+=data.length;b.sequence++;b.last=digest;return new JSONObject().put("acceptedBytes",b.written).put("nextSequence",b.sequence);
    }
    private JSONObject finish(String owner,String id)throws Exception{
        Blob b=ownedBlob(owner,id);if(!b.complete){if(b.written!=b.size)throw fail("E_INVALID_DATA","素材大小不匹配。");b.hash=hex(b.digest.digest());if(!b.expectedHash.isEmpty()&&!b.hash.equalsIgnoreCase(b.expectedHash))throw fail("E_INVALID_DATA","素材摘要不匹配。");try(FileOutputStream out=new FileOutputStream(b.file,true)){out.getFD().sync();}b.complete=true;}
        return new JSONObject().put("blobId",id).put("size",b.size).put("sha256",b.hash);
    }
    private JSONObject read(String owner,JSONObject a)throws Exception{
        File file=a.has("snapshotId")?snapshotFile(a.optString("pluginId",owner),a.getString("snapshotId"),a.getString("path")):target(a.optString("root"),a.getString("path"),false);
        if(!file.isFile())throw fail("E_NOT_FOUND","文件不存在。");String revision="r:"+hash(file);if(a.has("expectedRevision")&&!revision.equals(a.getString("expectedRevision")))throw fail("E_CONFLICT","文件已改变。");
        long offset=a.optLong("offset",0);int length=a.optInt("length",(int)Math.min(CHUNK,file.length()-offset));if(offset<0||offset>file.length()||length<0||length>CHUNK)throw fail("E_LIMIT","分块读取范围无效。");byte[] data=new byte[(int)Math.min(length,file.length()-offset)];try(RandomAccessFile in=new RandomAccessFile(file,"r")){in.seek(offset);in.readFully(data);}if(!revision.equals("r:"+hash(file)))throw fail("E_CONFLICT","读取期间文件已改变。");return new JSONObject().put("data",Base64.encodeToString(data,Base64.NO_WRAP)).put("revision",revision).put("totalSize",file.length());
    }
    private JSONObject apply(String owner,JSONObject a)throws Exception{
        synchronized(files){if(busy)throw fail("E_CONFLICT","项目正在提交。");busy=true;try{JSONArray actual=tree(a.optString("root")),expected=a.optJSONArray("expected");Map<String,String> revisions=new HashMap<>();for(int i=0;i<actual.length();i++){JSONObject e=actual.getJSONObject(i);revisions.put(e.getString("path"),e.getString("revision"));}
            if(expected!=null)for(int i=0;i<expected.length();i++){JSONObject e=expected.getJSONObject(i);String wanted=e.isNull("revision")?null:e.getString("revision");if(!Objects.equals(wanted,revisions.get(e.getString("path"))))throw fail("E_CONFLICT","磁盘文件已改变。");}
            Map<String,File> staged=new HashMap<>();JSONArray changes=a.getJSONArray("changes");if(changes.length()>5000)throw fail("E_LIMIT","批量变更过多。");
            for(int i=0;i<changes.length();i++){JSONObject c=changes.getJSONObject(i);relative(c.optString("path",c.optString("from")),false);if(c.has("to"))relative(c.getString("to"),false);if(c.getString("kind").equals("writeBlob")){Blob b=ownedBlob(owner,c.getString("blobId"));if(!b.complete||!b.root.equals(a.optString("root")))throw fail("E_INVALID_DATA","暂存不属于此项目。");staged.put(c.getString("blobId"),b.file);}}
            files.projectApply(a,staged);return new JSONObject().put("committed",true);
        }finally{busy=false;}}
    }
    JSONObject select(String owner,Uri uri,String name)throws Exception{
        String token=UUID.randomUUID().toString();Selection s=new Selection();s.owner=owner;s.name=name;s.mime=PreviewResource.mime(name);s.file=new File(temp,token);
        try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(s.file)){if(in==null)throw fail("E_PERMISSION","无法读取选择的文件。");byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1){if((s.size+=n)>FILE_LIMIT)throw fail("E_LIMIT","素材超过单文件限制。");out.write(block,0,n);}}
        catch(Exception e){Files.deleteIfExists(s.file.toPath());throw e;}s.hash=hash(s.file);selections.put(token,s);return new JSONObject().put("token",token).put("name",name).put("size",s.size).put("mime",s.mime);
    }
    private JSONObject selectionStage(String owner,JSONObject a)throws Exception{
        Selection s=selections.get(a.getString("token"));if(s==null||!s.owner.equals(owner))throw fail("E_NOT_FOUND","选择令牌不存在。");check(owner,a.optString("taskId"));String id=UUID.randomUUID().toString();Blob b=new Blob();b.owner=owner;b.root=a.optString("root");b.size=s.size;b.written=s.size;b.hash=s.hash;b.complete=true;b.file=s.file;b.expires=System.currentTimeMillis()+1800000;blobs.put(id,b);selections.remove(a.getString("token"));return new JSONObject().put("blobId",id).put("size",b.size).put("sha256",b.hash);
    }
    private JSONObject snapshot(String plugin,String id)throws Exception{
        if(!id.matches("[a-zA-Z0-9_-]{1,80}"))throw fail("E_NOT_FOUND","快照不存在。");File file=new File(snapshots,id+".json");if(!file.isFile())throw fail("E_NOT_FOUND","快照不存在。");JSONObject r=new JSONObject(new String(WorkspaceFiles.read(file,64*1024*1024),StandardCharsets.UTF_8));if(!plugin.equals(r.getString("owner")))throw fail("E_PERMISSION","快照不属于此插件。");return r;
    }
    private File snapshotFile(String plugin,String id,String p)throws Exception{
        relative(p,false);JSONArray entries=snapshot(plugin,id).getJSONArray("entries");for(int i=0;i<entries.length();i++){JSONObject e=entries.getJSONObject(i);if(e.getString("path").equals(p)&&e.getString("kind").equals("file")){String hash=e.getString("revision").substring(2);if(!hash.matches("[a-f0-9]{64}"))throw fail("E_INVALID_DATA","快照摘要无效。");return new File(objects,hash);}}throw fail("E_NOT_FOUND","文件未包含在快照中。");
    }
    private JSONObject snapshotCreate(String owner,JSONObject a)throws Exception{
        String root=a.optString("root");JSONArray tree=tree(root),roots=a.getJSONArray("includeRoots"),entries=new JSONArray();long size=0;Map<String,String> ids=new HashMap<>();JSONArray incoming=a.optJSONArray("entries");if(incoming!=null)for(int i=0;i<incoming.length();i++){JSONObject e=incoming.getJSONObject(i);ids.put(e.getString("path"),e.optString("entryId"));}
        for(int i=0;i<tree.length();i++){check(owner,a.optString("taskId"));JSONObject e=tree.getJSONObject(i);boolean include=false;for(int n=0;n<roots.length();n++)if(within(relative(roots.getString(n),true),e.getString("path")))include=true;if(!include)continue;
            JSONObject copied=new JSONObject(e.toString());copied.put("entryId",ids.get(e.getString("path")));entries.put(copied);
            if(e.getString("kind").equals("file")){size+=e.getLong("size");if(size>PROJECT_LIMIT)throw fail("E_LIMIT","快照超过限制。");File dest=new File(objects,e.getString("revision").substring(2));if(!dest.exists()){File staging=new File(temp,UUID.randomUUID().toString());Files.copy(target(root,e.getString("path"),false).toPath(),staging.toPath());if(!e.getString("revision").equals("r:"+hash(staging))){Files.deleteIfExists(staging.toPath());throw fail("E_CONFLICT","快照期间文件已改变。");}Files.move(staging.toPath(),dest.toPath());}}
        }
        check(owner,a.optString("taskId"));if(!tree.toString().equals(tree(root).toString()))throw fail("E_CONFLICT","快照期间项目已改变。");String id=UUID.randomUUID().toString();
        JSONObject r=new JSONObject().put("id",id).put("owner",a.getString("pluginId")).put("workspaceId",a.getString("workspaceId")).put("root",root).put("includeRoots",roots).put("label",a.optString("label")).put("createdAt",Instant.now().toString()).put("bytes",size).put("entries",entries).put("workspace",a.getString("workspace"));WorkspaceFiles.atomic(new File(snapshots,id+".json"),WorkspaceFiles.utf8(r.toString()));return new JSONObject().put("snapshotId",id).put("bytes",size);
    }
    private JSONObject snapshotStage(String owner,JSONObject a)throws Exception{
        JSONObject r=snapshot(a.getString("pluginId"),a.getString("snapshotId"));if(!r.getString("workspaceId").equals(a.getString("workspaceId")))throw fail("E_PERMISSION","快照不属于此项目。");JSONArray entries=new JSONArray(),original=r.getJSONArray("entries");
        for(int i=0;i<original.length();i++){JSONObject e=new JSONObject(original.getJSONObject(i).toString());if(e.getString("kind").equals("file")){String id=UUID.randomUUID().toString();Blob b=new Blob();b.owner=owner;b.root=a.optString("root");b.file=snapshotFile(a.getString("pluginId"),a.getString("snapshotId"),e.getString("path"));b.size=e.getLong("size");b.hash=e.getString("revision").substring(2);b.complete=true;b.expires=System.currentTimeMillis()+1800000;blobs.put(id,b);e.put("blobId",id);}entries.put(e);}return new JSONObject().put("entries",entries);
    }
    private JSONObject archiveInspect(String owner,JSONObject a)throws Exception {
        Selection s=selections.get(a.getString("selectionToken"));if(s==null||!s.owner.equals(owner))throw fail("E_NOT_FOUND","选择令牌不存在。");
        JSONArray entries=new JSONArray();Set<String> names=new HashSet<>();long total=0;validateZipHeaders(s.file);
        try(ZipFile zip=new ZipFile(s.file)){Enumeration<? extends ZipEntry> iterator=zip.entries();while(iterator.hasMoreElements()){
            check(owner,a.optString("taskId"));ZipEntry entry=iterator.nextElement();String name=entry.getName(),p=relative(entry.isDirectory()?name.substring(0,name.length()-1):name,false);if(!names.add(p.toLowerCase(Locale.ROOT))||entries.length()>=5000)throw fail("E_INVALID_DATA","ZIP 路径重复或超过条目限制。");long size=entry.getSize(),compressed=entry.getCompressedSize();if(size<0||compressed<0||size>FILE_LIMIT||(total+=size)>256*MB)throw fail("E_LIMIT","ZIP 展开大小超过限制。");if(entry.isDirectory()&&size!=0)throw fail("E_INVALID_DATA","ZIP 目录带有内容。");entries.put(new JSONObject().put("path",p).put("nativeName",name).put("size",size).put("compressedSize",compressed).put("directory",entry.isDirectory()).put("crc",entry.getCrc()));
        }}for(int i=0;i<entries.length();i++){String p=entries.getJSONObject(i).getString("path");int at=p.lastIndexOf('/');while(at>0){String parent=p.substring(0,at);for(int n=0;n<entries.length();n++){JSONObject e=entries.getJSONObject(n);if(e.getString("path").equalsIgnoreCase(parent)&&!e.getBoolean("directory"))throw fail("E_INVALID_DATA","ZIP 文件与父目录冲突。");}at=p.lastIndexOf('/',at-1);}}
        String token=UUID.randomUUID().toString();Archive archive=new Archive();archive.owner=owner;archive.file=s.file;archive.hash=s.hash;archive.entries=entries;archives.put(token,archive);JSONArray visible=new JSONArray();for(int i=0;i<entries.length();i++){JSONObject e=new JSONObject(entries.getJSONObject(i).toString());e.remove("nativeName");e.remove("crc");visible.put(e);}return new JSONObject().put("archiveToken",token).put("entries",visible).put("expandedBytes",total).put("warnings",new JSONArray());
    }
    // Validate central-directory link attributes before the platform ZIP reader sees payloads.
    private static void validateZipHeaders(File file)throws Exception{
        try(RandomAccessFile in=new RandomAccessFile(file,"r")){int length=(int)Math.min(file.length(),65557);byte[] tail=new byte[length];in.seek(file.length()-length);in.readFully(tail);int at=length-22;while(at>=0&&(u32(tail,at)!=0x06054b50L||at+22+u16(tail,at+20)!=length))at--;if(at<0)throw fail("E_INVALID_DATA","ZIP 目录不存在。");long offset=u32(tail,at+16),size=u32(tail,at+12);int count=u16(tail,at+10);if(count==65535||count>5000||size>16*MB||offset+size>file.length()-length+at||u16(tail,at+4)!=0||u16(tail,at+6)!=0)throw fail("E_LIMIT","不支持分卷、ZIP64 或超限 ZIP。");in.seek(offset);byte[] header=new byte[46];for(int i=0;i<count;i++){in.readFully(header);if(u32(header,0)!=0x02014b50L)throw fail("E_INVALID_DATA","ZIP 目录损坏。");int flags=u16(header,8),method=u16(header,10),mode=(int)(u32(header,38)>>>16)&0xf000;if((flags&1)!=0||(method!=0&&method!=8)||(mode!=0&&mode!=0x4000&&mode!=0x8000))throw fail("E_INVALID_DATA","ZIP 包含链接、加密或不可用文件。");int nl=u16(header,28),el=u16(header,30),cl=u16(header,32);byte[] name=new byte[nl];in.readFully(name);if((flags&2048)==0)for(byte b:name)if(b<0)throw fail("E_UNSUPPORTED","请使用 UTF-8 ZIP 文件名。");String portable=new String(name,StandardCharsets.UTF_8);relative(portable.endsWith("/")?portable.substring(0,portable.length()-1):portable,false);in.seek(in.getFilePointer()+el+cl);if(in.getFilePointer()>offset+size)throw fail("E_INVALID_DATA","ZIP 目录长度损坏。");}}
    }
    private static int u16(byte[] b,int p){return (b[p]&255)|((b[p+1]&255)<<8);}
    private static long u32(byte[] b,int p){return (u16(b,p)&65535L)|((u16(b,p+2)&65535L)<<16);}
    private Archive archive(String owner,String token)throws Failure{Archive a=archives.get(token);if(a==null||!owner.equals(a.owner))throw fail("E_NOT_FOUND","归档会话不存在。");return a;}
    private void extract(String owner,Archive archive,JSONObject entry,File dest,String task)throws Exception{
        if(!hash(archive.file).equals(archive.hash))throw fail("E_CONFLICT","ZIP 源文件已改变。");long size=0;CRC32 crc=new CRC32();try(ZipFile zip=new ZipFile(archive.file);InputStream in=zip.getInputStream(zip.getEntry(entry.getString("nativeName")));OutputStream out=new FileOutputStream(dest)){byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1){check(owner,task);if((size+=n)>entry.getLong("size"))throw fail("E_LIMIT","ZIP 虚报大小。");crc.update(block,0,n);out.write(block,0,n);}}
        if(size!=entry.getLong("size")||crc.getValue()!=entry.getLong("crc"))throw fail("E_INVALID_DATA","ZIP 内容校验失败。");
    }
    private JSONObject archiveStage(String owner,JSONObject a)throws Exception{
        Archive archive=archive(owner,a.getString("archiveToken"));JSONArray entries=new JSONArray();List<String> created=new ArrayList<>();try{for(int i=0;i<archive.entries.length();i++){JSONObject e=archive.entries.getJSONObject(i);check(owner,a.optString("taskId"));if(e.getBoolean("directory")){entries.put(new JSONObject().put("path",e.getString("path")).put("directory",true));continue;}JSONObject start=begin(owner,new JSONObject().put("root",a.optString("root")).put("size",e.getLong("size")));String id=start.getString("blobId");created.add(id);Blob b=ownedBlob(owner,id);extract(owner,archive,e,b.file,a.optString("taskId"));b.hash=hash(b.file);b.written=b.size;b.complete=true;entries.put(new JSONObject().put("path",e.getString("path")).put("blobId",id).put("size",b.size).put("sha256",b.hash).put("directory",false));}return new JSONObject().put("entries",entries);}catch(Exception e){for(String id:created){Blob b=blobs.remove(id);Files.deleteIfExists(b.file.toPath());}throw e;}
    }
    private JSONObject archiveExport(String owner,JSONObject a)throws Exception{
        JSONObject r=snapshot(a.getString("pluginId"),a.getString("snapshotId"));JSONArray source=r.getJSONArray("entries"),paths=a.getJSONArray("paths");String root=relative(a.optString("root"),true);List<JSONObject> selected=new ArrayList<>();
        for(int n=0;n<paths.length();n++){String p=(root.isEmpty()?"":root+"/")+relative(paths.getString(n),false);boolean found=false;for(int i=0;i<source.length();i++)if(source.getJSONObject(i).getString("path").equals(p)){found=true;break;}if(!found)throw fail("E_NOT_FOUND","导出白名单不在快照中。");}
        for(int i=0;i<source.length();i++){JSONObject e=source.getJSONObject(i);for(int n=0;n<paths.length();n++){String p=(root.isEmpty()?"":root+"/")+relative(paths.getString(n),false);if(within(p,e.getString("path"))){selected.add(e);break;}}}selected.sort(Comparator.comparing(e->e.optString("path")));if(selected.isEmpty())throw fail("E_NOT_FOUND","导出白名单不在快照中。");
        String token=UUID.randomUUID().toString();Output result=new Output();result.owner=owner;result.file=new File(temp,token);
        try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(result.file),StandardCharsets.UTF_8)){for(JSONObject e:selected){check(owner,a.optString("taskId"));String p=e.getString("path"),name=p.substring(root.isEmpty()?0:root.length()+1);boolean dir=e.getString("kind").equals("directory");ZipEntry entry=new ZipEntry(name+(dir?"/":""));entry.setTime(315532800000L);entry.setMethod(ZipEntry.STORED);entry.setSize(dir?0:e.getLong("size"));CRC32 crc=new CRC32();File file=dir?null:snapshotFile(a.getString("pluginId"),a.getString("snapshotId"),p);if(file!=null)try(InputStream in=new FileInputStream(file)){byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1){check(owner,a.optString("taskId"));crc.update(block,0,n);}}entry.setCrc(crc.getValue());out.putNextEntry(entry);if(file!=null)try(InputStream in=new FileInputStream(file)){byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1){check(owner,a.optString("taskId"));out.write(block,0,n);}}out.closeEntry();}}
        catch(Exception e){Files.deleteIfExists(result.file.toPath());throw e;}result.size=result.file.length();result.hash=hash(result.file);outputs.put(token,result);return new JSONObject().put("outputToken",token).put("bytes",result.size).put("sha256",result.hash);
    }
    JSONObject prepareExport(String owner,JSONObject a)throws Exception{
        File source=target(a.optString("root"),a.getString("path"),false);String expected=a.getString("expectedRevision");if(!expected.equals("r:"+hash(source)))throw fail("E_CONFLICT","导出文件已改变。");String token=UUID.randomUUID().toString();Output o=new Output();o.owner=owner;o.file=new File(temp,token);Files.copy(source.toPath(),o.file.toPath());o.hash=hash(o.file);if(!expected.equals("r:"+o.hash)){Files.delete(o.file.toPath());throw fail("E_CONFLICT","导出期间文件已改变。");}o.size=o.file.length();outputs.put(token,o);return new JSONObject(a.toString()).put("outputToken",token);
    }
    JSONObject deliver(String owner,JSONObject a,Uri uri)throws Exception{
        Output o=outputs.get(a.getString("outputToken"));if(o==null||!owner.equals(o.owner))throw fail("E_NOT_FOUND","导出对象不存在。");try(InputStream in=new FileInputStream(o.file);OutputStream out=context.getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw fail("E_PERMISSION","无法写入所选位置。");byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1)out.write(block,0,n);out.flush();return new JSONObject().put("saved",true).put("name",a.optString("suggestedName")).put("bytes",o.size).put("sha256",o.hash);}finally{Files.deleteIfExists(o.file.toPath());outputs.remove(a.getString("outputToken"));}
    }
    private File assetFile(Session s,String p)throws Exception{
        relative(p,false);boolean allowed=false;for(int i=0;i<s.roots.length();i++)if(within(s.roots.getString(i),p))allowed=true;if(!allowed)throw fail("E_PERMISSION","资源越过授权范围。");return s.snapshotId.isEmpty()?target(s.root,p,false):snapshotFile(s.pluginId,s.snapshotId,p);
    }
    WebResourceResponse resource(WebResourceRequest request){
        try{List<String> parts=request.getUrl().getPathSegments();if(parts.size()<2)return blocked();Session s=sessions.get(parts.get(0));if(s==null)return blocked();String p=String.join("/",parts.subList(1,parts.size()));File file=assetFile(s,p);long start=0,end=file.length()-1;int status=200;Map<String,String> headers=new HashMap<>();headers.put("Accept-Ranges","bytes");headers.put("Access-Control-Expose-Headers","Content-Range,Content-Length,Accept-Ranges");headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");headers.put("Access-Control-Allow-Origin","https://appassets.androidplatform.net");headers.put("Content-Security-Policy","sandbox; default-src 'none'; script-src 'none'");
            String range=request.getRequestHeaders().get("Range");if(range==null)range=request.getRequestHeaders().get("range");if(range!=null){java.util.regex.Matcher match=java.util.regex.Pattern.compile("^bytes=(\\d*)-(\\d*)$").matcher(range);if(!match.matches()||(match.group(1).isEmpty()&&match.group(2).isEmpty())||match.group(1).length()>18||match.group(2).length()>18){headers.put("Content-Range","bytes */"+file.length());return new WebResourceResponse("text/plain","UTF-8",416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));}if(match.group(1).isEmpty())start=Math.max(0,file.length()-Long.parseLong(match.group(2)));else start=Long.parseLong(match.group(1));if(!match.group(1).isEmpty()&&!match.group(2).isEmpty())end=Math.min(end,Long.parseLong(match.group(2)));if(start<0||start>end||start>=file.length()){headers.put("Content-Range","bytes */"+file.length());return new WebResourceResponse("text/plain","UTF-8",416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));}status=206;headers.put("Content-Range","bytes "+start+"-"+end+"/"+file.length());}
            final long length=Math.max(0,end-start+1);headers.put("Content-Length",Long.toString(length));FileInputStream stream=new FileInputStream(file);stream.getChannel().position(start);InputStream limited=new FilterInputStream(stream){long remaining=length;@Override public int read()throws IOException{if(remaining<=0)return -1;int value=super.read();if(value!=-1)remaining--;return value;}@Override public int read(byte[] b,int off,int len)throws IOException{if(remaining<=0)return -1;int n=super.read(b,off,(int)Math.min(len,remaining));if(n>0)remaining-=n;return n;}};
            return new WebResourceResponse(PreviewResource.mime(p),null,status,status==206?"Partial Content":"OK",headers,limited);
        }catch(Exception error){return blocked();}
    }
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    Object call(String action,String owner,JSONObject a)throws Exception{
        if(owner==null||!owner.matches("[a-zA-Z0-9_-]{1,128}"))throw fail("E_PERMISSION","插件会话无效。");for(Map.Entry<String,Blob> e:blobs.entrySet())if(e.getValue().expires<System.currentTimeMillis()){Blob b=blobs.remove(e.getKey());if(b.file.getParentFile().equals(temp))Files.deleteIfExists(b.file.toPath());}
        switch(action){
            case "receipt": synchronized(files) { return new File(files.projectBase(), "workspace.json").exists() ? new String(Files.readAllBytes(new File(files.projectBase(), "workspace.json").toPath()), StandardCharsets.UTF_8) : ""; }
            case "capabilities":return capabilities();case "cancel":cancelled.add(owner+":"+a.optString("taskId"));return true;case "tree":return new JSONObject().put("entries",tree(a.optString("root")));
            case "begin":return begin(owner,a);case "chunk":return chunk(owner,a);case "finish":return finish(owner,a.getString("blobId"));case "abort":{Blob b=ownedBlob(owner,a.getString("blobId"));if(b.file.getParentFile().equals(temp))Files.deleteIfExists(b.file.toPath());blobs.remove(a.getString("blobId"));return true;}
            case "read":return read(owner,a);case "apply":return apply(owner,a);case "selectionStage":return selectionStage(owner,a);
            case "snapshotCreate":return snapshotCreate(owner,a);case "snapshotEntries":{JSONObject r=snapshot(a.getString("pluginId"),a.getString("snapshotId"));if(!r.getString("workspaceId").equals(a.getString("workspaceId")))throw fail("E_PERMISSION","快照不属于此项目。");return r;}case "snapshotStage":return snapshotStage(owner,a);
            case "snapshotList":{JSONArray values=new JSONArray();for(File file:children(snapshots)){JSONObject r=new JSONObject(new String(WorkspaceFiles.read(file,64*1024*1024),StandardCharsets.UTF_8));if(r.getString("owner").equals(a.getString("pluginId"))&&r.getString("workspaceId").equals(a.getString("workspaceId")))values.put(new JSONObject().put("id",r.getString("id")).put("label",r.optString("label")).put("createdAt",r.getString("createdAt")).put("bytes",r.getLong("bytes")));}return values;}
            case "archiveInspect":return archiveInspect(owner,a);case "archiveStage":return archiveStage(owner,a);case "archiveExport":return archiveExport(owner,a);
            case "discardOutput":{Output o=outputs.get(a.getString("outputToken"));if(o==null||!owner.equals(o.owner))throw fail("E_NOT_FOUND","导出会话不存在。");Files.deleteIfExists(o.file.toPath());outputs.remove(a.getString("outputToken"));return true;}
            case "archiveRead":{Archive archive=archive(owner,a.getString("archiveToken"));JSONObject entry=null;for(int i=0;i<archive.entries.length();i++)if(archive.entries.getJSONObject(i).getString("path").equals(a.getString("path")))entry=archive.entries.getJSONObject(i);if(entry==null||entry.getBoolean("directory"))throw fail("E_NOT_FOUND","归档文件不存在。");if(entry.getLong("size")>8*MB)throw fail("E_LIMIT","预检文本超过 8 MB。");File out=new File(temp,UUID.randomUUID().toString());try{extract(owner,archive,entry,out,a.optString("taskId"));return new JSONObject().put("data",Base64.encodeToString(WorkspaceFiles.read(out,8*1024*1024),Base64.NO_WRAP));}finally{Files.deleteIfExists(out.toPath());}}
            case "assetOpen":{Session s=new Session();s.owner=owner;s.pluginId=a.getString("pluginId");s.root=a.optString("root");s.snapshotId=a.optString("snapshotId");s.roots=a.getJSONArray("allowedRoots");if(!s.snapshotId.isEmpty()){JSONObject r=snapshot(s.pluginId,s.snapshotId);if(!r.getString("workspaceId").equals(a.getString("workspaceId")))throw fail("E_PERMISSION","快照不属于此项目。");}for(int i=0;i<s.roots.length();i++)relative(s.roots.getString(i),true);String id=UUID.randomUUID().toString();sessions.put(id,s);return new JSONObject().put("sessionId",id);}
            case "assetResolve":{Session s=sessions.get(a.getString("sessionId"));if(s==null||!owner.equals(s.owner))throw fail("E_NOT_FOUND","资源会话不存在。");String p=a.getString("path");File file=assetFile(s,p);String rev="r:"+hash(file);if(a.has("expectedRevision")&&!a.getString("expectedRevision").equals(rev))throw fail("E_CONFLICT","资源已改变。");return new JSONObject().put("url",new Uri.Builder().scheme("https").authority("wenzhou-project.local").path("/"+a.getString("sessionId")+"/"+p).build().toString()).put("mime",PreviewResource.mime(p)).put("size",file.length()).put("revision",rev).put("supportsRange",true);}
            case "assetRelease":{Session s=sessions.get(a.getString("sessionId"));if(s==null||!owner.equals(s.owner))throw fail("E_NOT_FOUND","资源会话不存在。");sessions.remove(a.getString("sessionId"));return true;}
            case "stop":for(Map.Entry<String,Blob> e:blobs.entrySet())if(e.getValue().owner.equals(owner)){Blob b=blobs.remove(e.getKey());if(b.file.getParentFile().equals(temp))Files.deleteIfExists(b.file.toPath());}for(Map.Entry<String,Selection> e:selections.entrySet())if(e.getValue().owner.equals(owner)){Files.deleteIfExists(e.getValue().file.toPath());selections.remove(e.getKey());}archives.entrySet().removeIf(e->e.getValue().owner.equals(owner));sessions.entrySet().removeIf(e->e.getValue().owner.equals(owner));for(Map.Entry<String,Output> e:outputs.entrySet())if(e.getValue().owner.equals(owner)){Files.deleteIfExists(e.getValue().file.toPath());outputs.remove(e.getKey());}return true;
            default:throw fail("E_UNSUPPORTED","当前平台不支持此项目操作。");
        }
    }
}
