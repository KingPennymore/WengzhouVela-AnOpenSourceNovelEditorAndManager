package me.wenzhou.write;

import android.content.Context;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Owns only the app-private workspace. Every bridge path is relative to that root. */
final class WorkspaceFiles {
    private final File base, root, workspace, cache, trash, transactions;
    private final String id;

    WorkspaceFiles(Context context) throws Exception {
        base = context.getFilesDir();
        root = new File(base, "workspaces/文舟");
        Files.createDirectories(root.toPath());
        File config = new File(base, "internal-storage.json");
        if (config.exists()) id = json(config).getString("id");
        else {
            id = UUID.randomUUID().toString();
            atomic(config, utf8(new JSONObject().put("id", id).toString()));
        }
        if (!id.matches("[A-Za-z0-9_-]{1,80}")) throw new IOException("内部文件夹标识损坏。");
        workspace = new File(base, "workspace.json");
        cache = new File(base, "folder-" + id + ".json");
        trash = new File(base, "trash.json");
        transactions = new File(base, "transactions");
        Files.createDirectories(transactions.toPath());
        recoverTransactions();
    }

    static byte[] utf8(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    static void atomic(File file, byte[] bytes) throws IOException {
        File temp = new File(file.getPath() + ".wenzhou-tmp");
        if (Files.isSymbolicLink(file.toPath()) || Files.isSymbolicLink(temp.toPath())) throw new IOException("不允许写入符号链接。");
        try (FileOutputStream stream = new FileOutputStream(temp)) { stream.write(bytes); stream.getFD().sync(); }
        try { Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException unsupported) { Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING); }
    }

    static byte[] read(File file, int limit) throws IOException {
        if (file.length() > limit) throw new IOException("文件超出读取大小限制。");
        byte[] data = Files.readAllBytes(file.toPath());
        if (data.length > limit) throw new IOException("文件超出读取大小限制。");
        return data;
    }
    private JSONObject json(File file) throws Exception { return new JSONObject(new String(read(file, 64 * 1024 * 1024), StandardCharsets.UTF_8)); }
    private JSONArray array(JSONObject value, String name) { JSONArray result = value.optJSONArray(name); return result == null ? new JSONArray() : result; }
    private JSONObject metadata() throws Exception { return cache.exists() ? json(cache) : new JSONObject().put("version", 1).put("documents", new JSONArray()).put("repositories", new JSONArray()); }
    private String documentPath(JSONObject doc) throws Exception { return doc.optString("path", doc.getString("name")); }
    private boolean contains(String parent, String path) { return path.equals(parent) || path.startsWith(parent + "/"); }

    private String relative(String value) throws IOException {
        if (value == null || value.isEmpty() || value.startsWith("/") || value.length() > 4096
            || value.matches("(?s).*[\\\\\u0000-\u001f].*") || value.endsWith(".wenzhou-tmp")) throw new IOException("工作区相对路径无效。");
        String[] parts = value.split("/", -1);
        if (parts.length > 64) throw new IOException("文件夹层级过深。");
        for (String part : parts) if (part.isEmpty() || part.equals(".") || part.equals("..") || part.equals(".git")) throw new IOException("工作区相对路径无效。");
        return value;
    }
    private File target(String value) throws IOException {
        String path = relative(value);
        File result = root;
        for (String part : path.split("/")) {
            result = new File(result, part);
            if (Files.isSymbolicLink(result.toPath())) throw new IOException("不允许通过符号链接访问工作区。");
        }
        if (!result.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("工作区相对路径无效。");
        return result;
    }

    synchronized String readWorkspace() throws Exception { return workspace.exists() ? new String(read(workspace, 64 * 1024 * 1024), StandardCharsets.UTF_8) : ""; }
    synchronized String readPlugins() throws Exception {
        File file = new File(base, "plugins.json");
        return file.exists() ? new String(read(file, 24 * 1024 * 1024), StandardCharsets.UTF_8) : "";
    }
    synchronized void writePlugins(String data) throws Exception {
        if (utf8(data).length > 24 * 1024 * 1024) throw new IOException("插件存储不能超过 24 MB。");
        new JSONArray(data);
        atomic(new File(base, "plugins.json"), utf8(data));
    }
    private JSONObject storage() throws Exception {
        return new JSONObject().put("id", id).put("label", "内部文件夹").put("root", root.getPath()).put("internal", true).put("needsSetup", false);
    }
    synchronized JSONObject scan() throws Exception {
        JSONObject old = metadata();
        Map<String, JSONObject> previous = new HashMap<>();
        JSONArray oldDocs = array(old, "documents");
        for (int i = 0; i < oldDocs.length(); i++) previous.put(documentPath(oldDocs.getJSONObject(i)), oldDocs.getJSONObject(i));
        JSONArray docs = new JSONArray(), folders = new JSONArray(), entries = new JSONArray();
        walk("", previous, docs, folders, entries);
        return new JSONObject().put("storage", storage()).put("documents", docs).put("folders", folders).put("entries", entries).put("repositories", array(old, "repositories"));
    }
    private void walk(String directory, Map<String, JSONObject> previous, JSONArray docs, JSONArray folders, JSONArray entries) throws Exception {
        File folder = directory.isEmpty() ? root : target(directory);
        File[] files = folder.listFiles();
        if (files == null) throw new IOException("无法读取内部文件夹。");
        java.util.Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        for (File file : files) {
            String name = file.getName();
            if (name.equals(".git") || name.endsWith(".wenzhou-tmp") || Files.isSymbolicLink(file.toPath())) continue;
            if (entries.length() >= 5000) throw new IOException("工作区超过 5000 个文件与目录。");
            String path = directory.isEmpty() ? name : directory + "/" + name;
            target(path);
            JSONObject entry = new JSONObject().put("path", path).put("name", name).put("directory", file.isDirectory()).put("size", file.length()).put("editable", false).put("reason", "");
            entries.put(entry);
            if (file.isDirectory()) { folders.put(path); walk(path, previous, docs, folders, entries); }
            else if (file.isFile()) {
                try {
                    String text = FileText.decode(read(file, FileText.MAX_BYTES));
                    JSONObject before = previous.get(path);
                    JSONObject doc = before == null ? new JSONObject() : new JSONObject(before.toString());
                    doc.put("id", before == null ? UUID.randomUUID().toString() : before.getString("id"))
                        .put("name", name).put("path", path).put("text", text)
                        .put("updatedAt", before != null && text.equals(before.optString("text")) ? before.getLong("updatedAt") : System.currentTimeMillis());
                    if (!doc.has("remote")) doc.put("remote", JSONObject.NULL);
                    docs.put(doc); entry.put("editable", true);
                } catch (IOException invalid) { entry.put("reason", file.length() > FileText.MAX_BYTES ? "超过 8 MB，保留在工作区中" : "二进制或不支持的文本编码，保留在工作区中"); }
            }
        }
    }

    synchronized void saveWorkspace(String data) throws Exception {
        if (utf8(data).length > 64 * 1024 * 1024) throw new IOException("工作区数据不能超过 64 MB。");
        JSONObject value = new JSONObject(data), storage = value.optJSONObject("storage");
        if (value.optInt("version") != 1 || value.optJSONArray("documents") == null || storage == null || !id.equals(storage.optString("id"))) throw new IOException("文稿数据或工作区标识无效。");
        JSONArray docs = value.getJSONArray("documents"), folders = array(value, "folders"), oldDocs = array(metadata(), "documents");
        if (docs.length() + folders.length() > 5000) throw new IOException("工作区超过 5000 项。");
        Map<String, JSONObject> before = new HashMap<>();
        for (int i = 0; i < oldDocs.length(); i++) before.put(documentPath(oldDocs.getJSONObject(i)), oldDocs.getJSONObject(i));
        Set<String> paths = new HashSet<>(), ids = new HashSet<>();
        for (int i = 0; i < docs.length(); i++) {
            JSONObject doc = docs.getJSONObject(i);
            String docId = doc.getString("id"), path = documentPath(doc), text = doc.getString("text");
            File file = target(path);
            if (!docId.matches("[A-Za-z0-9_-]{1,80}") || !ids.add(docId) || !paths.add(path) || utf8(text).length > FileText.MAX_BYTES) throw new IOException("文件标识、同名路径或文件大小无效。");
            if (file.exists()) {
                String disk = FileText.decode(read(file, FileText.MAX_BYTES));
                JSONObject previous = before.get(path);
                if (!disk.equals(text) && (previous == null || !disk.equals(previous.getString("text")))) throw new IOException("文件已在外部修改：" + path + "。请刷新工作区后重试。");
            }
        }
        for (int i = 0; i < folders.length(); i++) { String folder = folders.getString(i); target(folder); if (paths.contains(folder)) throw new IOException("文件和文件夹路径冲突。"); }
        for (Map.Entry<String, JSONObject> item : before.entrySet()) {
            File file = target(item.getKey());
            if (!paths.contains(item.getKey()) && file.exists() && !FileText.decode(read(file, FileText.MAX_BYTES)).equals(item.getValue().getString("text"))) throw new IOException("文件已在外部修改，无法删除：" + item.getKey());
        }
        try (Transaction tx = new Transaction()) {
            for (int i = 0; i < folders.length(); i++) tx.mkdir(target(folders.getString(i)));
            for (int i = 0; i < docs.length(); i++) {
                JSONObject doc = docs.getJSONObject(i); String path = documentPath(doc); File file = target(path);
                if (file.exists() && FileText.decode(read(file, FileText.MAX_BYTES)).equals(doc.getString("text"))) continue;
                JSONObject previous = before.get(path);
                if (previous != null) tx.write(new File(base, "previous-" + doc.getString("id") + ".txt"), utf8(previous.getString("text")));
                tx.mkdir(file.getParentFile()); tx.write(file, utf8(doc.getString("text")));
            }
            for (String path : before.keySet()) if (!paths.contains(path) && target(path).exists()) tx.delete(target(path));
            tx.write(cache, utf8(data)); tx.write(workspace, utf8(data)); tx.commit();
        }
    }

    synchronized JSONObject writeFiles(JSONArray files, JSONArray folders) throws Exception {
        if (files.length() + folders.length() > 5000) throw new IOException("仓库超过 5000 个文件与目录。");
        Set<String> seen = new HashSet<>(); long total = 0;
        List<byte[]> bytes = new ArrayList<>();
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.getJSONObject(i); String path = file.getString("path"), data = file.getString("data");
            target(path);
            if (!seen.add(path) || data.length() > 12 * 1024 * 1024 || (total += data.length()) > 96 * 1024 * 1024) throw new IOException("重复文件路径或仓库文件超过拉取大小限制。");
            byte[] content;
            try { content = Base64.decode(data, Base64.DEFAULT); } catch (IllegalArgumentException invalid) { throw new IOException("仓库文件编码无效。"); }
            if (content.length > FileText.MAX_BYTES) throw new IOException("仓库单个文件不能超过 8 MB。");
            bytes.add(content);
        }
        for (int i = 0; i < folders.length(); i++) { String path = folders.getString(i); target(path); if (seen.contains(path)) throw new IOException("文件和目录路径冲突。"); }
        try (Transaction tx = new Transaction()) {
            for (int i = 0; i < folders.length(); i++) tx.mkdir(target(folders.getString(i)));
            for (int i = 0; i < files.length(); i++) {
                File file = target(files.getJSONObject(i).getString("path"));
                tx.mkdir(file.getParentFile()); tx.write(file, bytes.get(i));
            }
            JSONObject state = scan(); tx.commit(); return state;
        }
    }

    synchronized String readFileBase64(String path) throws Exception {return Base64.encodeToString(read(target(path), FileText.MAX_BYTES), Base64.NO_WRAP);}
    synchronized PreviewResource readPreviewResource(String path, boolean html) throws Exception {
        String mime = html ? "text/html" : PreviewResource.mime(path);
        byte[] bytes = read(target(path), FileText.MAX_BYTES);
        if (mime.startsWith("text/") || mime.equals("image/svg+xml") || mime.equals("application/json")) {
            String text = FileText.decode(bytes);
            if (mime.equals("text/html")) {
                text = text.replaceAll("(?i)(<meta\\b[^>]*charset\\s*=\\s*[\"']?)[a-z0-9_-]+", "$1utf-8");
                if (!java.util.regex.Pattern.compile("(?is)<meta\\b[^>]*name\\s*=\\s*[\"']?viewport\\b").matcher(text).find()) {
                    String viewport = "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
                    if (java.util.regex.Pattern.compile("(?i)<head\\b[^>]*>").matcher(text).find()) text = text.replaceFirst("(?i)(<head\\b[^>]*>)", "$1" + viewport);
                    else if (java.util.regex.Pattern.compile("(?i)^\\s*<!doctype\\b[^>]*>").matcher(text).find()) text = text.replaceFirst("(?i)^(\\s*<!doctype\\b[^>]*>)", "$1" + viewport);
                    else text = viewport + text;
                }
            }
            bytes = text.getBytes(StandardCharsets.UTF_8);
        }
        return new PreviewResource(bytes, mime);
    }
    synchronized String readAsset(String path) throws Exception {
        String lower = path.toLowerCase(java.util.Locale.ROOT), type;
        if (lower.endsWith(".png")) type = "image/png";
        else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) type = "image/jpeg";
        else if (lower.endsWith(".gif")) type = "image/gif";
        else if (lower.endsWith(".webp")) type = "image/webp";
        else if (lower.endsWith(".avif")) type = "image/avif";
        else throw new IOException("预览图片格式不支持。");
        return "data:" + type + ";base64," + Base64.encodeToString(read(target(path), 4 * 1024 * 1024), Base64.NO_WRAP);
    }

    private JSONArray trashRecords() throws Exception { return trash.exists() ? new JSONArray(new String(read(trash, 64 * 1024 * 1024), StandardCharsets.UTF_8)) : new JSONArray(); }
    private File trashPayload(String trashId) throws Exception {
        if (!trashId.matches("[A-Za-z0-9_-]{1,80}")) throw new IOException("回收站标识无效。");
        File file = new File(root, ".trash-" + trashId + ".wenzhou-tmp");
        if (Files.isSymbolicLink(file.toPath())) throw new IOException("回收站内容无效。");
        return file;
    }
    synchronized JSONArray listTrash() throws Exception {
        JSONArray result = new JSONArray(), records = trashRecords();
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.getJSONObject(i);
            if (id.equals(item.optString("workspaceId"))) result.put(new JSONObject().put("id", item.getString("id")).put("path", item.getString("path")).put("directory", item.getBoolean("directory")).put("createdAt", item.getLong("createdAt")));
        }
        return result;
    }
    private JSONObject remap(JSONObject doc, String source, String destination, boolean copy) throws Exception {
        JSONObject result = new JSONObject(doc.toString());
        String path = destination + documentPath(doc).substring(source.length());
        result.put("path", path).put("name", path.substring(path.lastIndexOf('/') + 1));
        if (copy) result.put("id", UUID.randomUUID().toString()).put("remote", JSONObject.NULL);
        return result;
    }
    synchronized JSONObject manage(String action, String path, String destination) throws Exception {
        File source = target(path);
        if (!source.exists()) throw new IOException("文件或文件夹不存在，请刷新工作区。");
        JSONObject old = metadata(); JSONArray docs = array(old, "documents"), repos = array(old, "repositories"), records = trashRecords();
        JSONArray nextDocs = new JSONArray(), nextRepos = new JSONArray();
        try (Transaction tx = new Transaction()) {
            if (action.equals("delete")) {
                if (records.length() >= 100) throw new IOException("回收站已有 100 项，请先恢复或永久删除部分项目。");
                String trashId = UUID.randomUUID().toString();
                JSONArray removedDocs = new JSONArray(), removedRepos = new JSONArray();
                for (int i = 0; i < docs.length(); i++) { JSONObject doc = docs.getJSONObject(i); (contains(path, documentPath(doc)) ? removedDocs : nextDocs).put(doc); }
                for (int i = 0; i < repos.length(); i++) { JSONObject repo = repos.getJSONObject(i); (contains(path, repo.getString("folder")) ? removedRepos : nextRepos).put(repo); }
                records.put(new JSONObject().put("id", trashId).put("workspaceId", id).put("path", path).put("directory", source.isDirectory()).put("createdAt", System.currentTimeMillis()).put("documents", removedDocs).put("repositories", removedRepos));
                tx.move(source, trashPayload(trashId)); tx.write(trash, utf8(records.toString()));
            } else if (action.equals("move") || action.equals("copy")) {
                File dest = target(destination); boolean copy = action.equals("copy");
                if (contains(path, destination)) throw new IOException("不能将项目放入自身或其子目录。");
                if (dest.exists()) throw new IOException("目标已存在，请更改名称或目标目录。");
                tx.mkdir(dest.getParentFile());
                if (copy) tx.copy(source, dest); else tx.move(source, dest);
                for (int i = 0; i < docs.length(); i++) {
                    JSONObject doc = docs.getJSONObject(i);
                    nextDocs.put(!copy && contains(path, documentPath(doc)) ? remap(doc, path, destination, false) : doc);
                    if (copy && contains(path, documentPath(doc))) nextDocs.put(remap(doc, path, destination, true));
                }
                for (int i = 0; i < repos.length(); i++) {
                    JSONObject repo = new JSONObject(repos.getJSONObject(i).toString());
                    if (!copy && contains(path, repo.getString("folder"))) repo.put("folder", destination + repo.getString("folder").substring(path.length()));
                    nextRepos.put(repo);
                }
            } else throw new IOException("文件操作无效。");
            old.put("documents", nextDocs).put("repositories", nextRepos);
            tx.write(cache, utf8(old.toString())); JSONObject state = scan(); tx.commit(); return state;
        }
    }
    synchronized JSONObject restoreTrash(String trashId, boolean permanent) throws Exception {
        JSONArray records = trashRecords(), next = new JSONArray(); JSONObject item = null;
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (id.equals(record.optString("workspaceId")) && trashId.equals(record.optString("id"))) item = record;
            else next.put(record);
        }
        if (item == null) throw new IOException("回收站项目不存在。");
        File payload = trashPayload(trashId);
        if (!payload.exists()) throw new IOException("回收站文件已移除。");
        try (Transaction tx = new Transaction()) {
            if (permanent) tx.move(payload, new File(tx.folder, "discard"));
            else {
                File dest = target(item.getString("path"));
                if (dest.exists()) throw new IOException("原路径已有同名项目，请先重命名后恢复。");
                tx.mkdir(dest.getParentFile()); tx.move(payload, dest);
                JSONObject old = metadata(); JSONArray docs = array(old, "documents"), repos = array(old, "repositories");
                JSONArray restored = array(item, "documents"), restoredRepos = array(item, "repositories");
                for (int i = 0; i < restored.length(); i++) docs.put(restored.getJSONObject(i));
                for (int i = 0; i < restoredRepos.length(); i++) repos.put(restoredRepos.getJSONObject(i));
                old.put("documents", docs).put("repositories", repos); tx.write(cache, utf8(old.toString()));
            }
            tx.write(trash, utf8(next.toString())); JSONObject state = scan(); tx.commit(); return state;
        }
    }

    private void copyTree(File source, File dest, int[] count) throws Exception {
        if (++count[0] > 5000 || Files.isSymbolicLink(source.toPath())) throw new IOException("复制项目过多或含符号链接。");
        if (source.isDirectory()) {
            Files.createDirectory(dest.toPath());
            File[] children = source.listFiles(); if (children == null) throw new IOException("无法读取源目录。");
            for (File child : children) { relative(child.getName()); copyTree(child, new File(dest, child.getName()), count); }
        } else if (source.isFile()) Files.copy(source.toPath(), dest.toPath());
        else throw new IOException("不支持此文件类型。");
    }
    private void removeTree(File file) throws IOException {
        if (Files.isSymbolicLink(file.toPath())) throw new IOException("不允许删除符号链接。");
        if (file.isDirectory()) { File[] children = file.listFiles(); if (children == null) throw new IOException("无法读取待删除目录。"); for (File child : children) removeTree(child); }
        Files.deleteIfExists(file.toPath());
    }
    private String privatePath(File file) throws IOException {
        String path = file.getCanonicalPath(), prefix = base.getCanonicalPath() + File.separator;
        if (!path.startsWith(prefix)) throw new IOException("事务路径越界。");
        return path.substring(prefix.length());
    }
    private File recoveredPath(String value, File transaction) throws IOException {
        if (value.startsWith("/") || value.contains("\\") || value.contains("../")) throw new IOException("事务记录无效。");
        File file = new File(base, value);
        String path = privatePath(file), workspacePrefix = privatePath(root) + File.separator;
        if (!(path.startsWith(workspacePrefix) || file.equals(workspace) || file.equals(cache) || file.equals(trash)
            || path.matches("previous-[A-Za-z0-9_-]{1,80}\\.txt") || path.startsWith(privatePath(transaction) + File.separator))) throw new IOException("事务路径无效。");
        for (File current = file; current != null && !current.equals(base); current = current.getParentFile()) if (Files.isSymbolicLink(current.toPath())) throw new IOException("事务含符号链接。");
        return file;
    }
    private void recover(File folder, JSONObject record) throws Exception {
        JSONArray copies = array(record, "copies"), moves = array(record, "moves"), originals = array(record, "originals"), directories = array(record, "directories");
        for (int i = copies.length() - 1; i >= 0; i--) { File file = recoveredPath(copies.getString(i), folder); if (file.exists()) removeTree(file); }
        for (int i = moves.length() - 1; i >= 0; i--) {
            JSONObject move = moves.getJSONObject(i); File from = recoveredPath(move.getString("from"), folder), to = recoveredPath(move.getString("to"), folder);
            if (to.exists() && !from.exists()) Files.move(to.toPath(), from.toPath());
        }
        for (int i = originals.length() - 1; i >= 0; i--) {
            JSONObject item = originals.getJSONObject(i); File file = recoveredPath(item.getString("path"), folder);
            Files.deleteIfExists(new File(file.getPath() + ".wenzhou-tmp").toPath());
            if (item.isNull("backup")) Files.deleteIfExists(file.toPath());
            else {
                String name = item.getString("backup"); if (!name.matches("[0-9]+")) throw new IOException("事务备份无效。");
                Files.createDirectories(file.getParentFile().toPath()); atomic(file, Files.readAllBytes(new File(folder, name).toPath()));
            }
        }
        for (int i = directories.length() - 1; i >= 0; i--) { File file = recoveredPath(directories.getString(i), folder); if (file.isDirectory() && file.list() != null && file.list().length == 0) Files.delete(file.toPath()); }
    }
    private void recoverTransactions() throws Exception {
        File[] folders = transactions.listFiles(); if (folders == null) throw new IOException("无法读取事务目录。");
        for (File folder : folders) {
            if (!folder.isDirectory() || Files.isSymbolicLink(folder.toPath())) throw new IOException("事务目录无效。");
            File manifest = new File(folder, "journal.json");
            if (manifest.exists()) { JSONObject record = json(manifest); if (!record.optBoolean("committed")) recover(folder, record); }
            removeTree(folder);
        }
    }
    /** Durable journal: interrupted batches are rolled back before the next workspace load. */
    private final class Transaction implements AutoCloseable {
        final File folder = new File(transactions, UUID.randomUUID().toString());
        final JSONObject record = new JSONObject();
        final JSONArray originals = new JSONArray(), directories = new JSONArray(), moves = new JSONArray(), copies = new JSONArray();
        final Set<String> captured = new HashSet<>();
        boolean committed;
        Transaction() throws Exception {
            Files.createDirectory(folder.toPath());
            record.put("originals", originals).put("directories", directories).put("moves", moves).put("copies", copies).put("committed", false); journal();
        }
        void journal() throws Exception { atomic(new File(folder, "journal.json"), utf8(record.toString())); }
        void capture(File file) throws Exception {
            String path = privatePath(file); if (!captured.add(path)) return;
            JSONObject item = new JSONObject().put("path", path);
            if (file.exists()) {
                if (!file.isFile() || Files.isSymbolicLink(file.toPath())) throw new IOException("目标不是普通文件。");
                String name = String.valueOf(originals.length()); Files.copy(file.toPath(), new File(folder, name).toPath()); item.put("backup", name);
            } else item.put("backup", JSONObject.NULL);
            originals.put(item); journal();
        }
        void mkdir(File directory) throws Exception {
            List<File> missing = new ArrayList<>();
            for (File current = directory; !current.exists(); current = current.getParentFile()) { privatePath(current); missing.add(current); }
            Collections.reverse(missing);
            for (File file : missing) directories.put(privatePath(file));
            if (!missing.isEmpty()) journal(); Files.createDirectories(directory.toPath());
        }
        void write(File file, byte[] data) throws Exception { capture(file); atomic(file, data); }
        void delete(File file) throws Exception { capture(file); Files.delete(file.toPath()); }
        void move(File from, File to) throws Exception { moves.put(new JSONObject().put("from", privatePath(from)).put("to", privatePath(to))); journal(); Files.move(from.toPath(), to.toPath()); }
        void copy(File from, File to) throws Exception { copies.put(privatePath(to)); journal(); copyTree(from, to, new int[]{0}); }
        void commit() throws Exception { record.put("committed", true); journal(); committed = true; }
        public void close() throws Exception {
            if (!committed) { recover(folder, record); removeTree(folder); }
            else { try { removeTree(folder); } catch (IOException cleanup) { /* The durable commit marker permits cleanup at next startup. */ } }
        }
    }
}
