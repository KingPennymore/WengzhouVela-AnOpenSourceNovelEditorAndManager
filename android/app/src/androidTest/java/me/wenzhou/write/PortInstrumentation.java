package me.wenzhou.write;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;

/** Runs on an isolated emulator; no real GitHub credentials or user workspace are used. */
public final class PortInstrumentation extends Instrumentation {
    private final JSONArray passed = new JSONArray();
    private Context fixture;
    private File directory;
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private String text(File file) throws Exception { return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            directory = new File(getTargetContext().getCacheDir(), "native-qa-" + UUID.randomUUID());
            Files.createDirectories(new File(directory, "no-backup").toPath());
            fixture = new ContextWrapper(getTargetContext()) {
                @Override public File getFilesDir() { return directory; }
                @Override public File getNoBackupFilesDir() { return new File(directory, "no-backup"); }
            };
            credentials(); workspace(); rollback(); crashRecovery(); htmlResources(); textZoom(); projects(); archiveImports();
            result.putString("results", new JSONObject().put("passed", passed.length()).put("checks", passed).toString());
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) { result.putString("failure", error.getClass().getSimpleName() + ": " + error.getMessage()); finish(Activity.RESULT_CANCELED, result); }
        finally { if (directory != null) cleanup(directory); }
    }
    private void cleanup(File file) { if (file.isDirectory()) { File[] children = file.listFiles(); if (children != null) for (File child : children) cleanup(child); } file.delete(); }
    private void credentials() throws Exception {
        CredentialStore store = new CredentialStore(fixture);
        String token = "LOCAL-QA-ONLY-" + UUID.randomUUID();
        store.write(token);
        String disk = text(new File(fixture.getNoBackupFilesDir(), "github-credential.json"));
        require(!disk.contains(token), "Token must not be plaintext on disk");
        require(new CredentialStore(fixture).read().equals(token), "Encrypted credential must survive store recreation");
        store.clear(); require(store.read().isEmpty(), "Logout must remove credential");
        passed.put("Android Keystore encryption, persistence and logout");
    }
    private void projects() throws Exception {
        WorkspaceFiles files = new WorkspaceFiles(fixture); ProjectFiles projects = new ProjectFiles(fixture, files);
        String owner = "qa-session", root = "ProjectQA"; long size = 9 * ProjectFiles.MB + 17; Files.createDirectories(new File(files.projectRoot(), root).toPath());
        JSONObject begin = (JSONObject)projects.call("begin", owner, new JSONObject().put("root", root).put("size", size));
        byte[] block = new byte[ProjectFiles.CHUNK]; for (int i = 0; i < block.length; i++) block[i] = (byte)(i * 17);
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256"); long written = 0; int sequence = 0;
        while (written < size) { byte[] bytes = java.util.Arrays.copyOf(block, (int)Math.min(block.length, size - written)); digest.update(bytes); projects.call("chunk", owner, new JSONObject().put("blobId", begin.getString("blobId")).put("sequence", sequence++).put("data", android.util.Base64.encodeToString(bytes, 2))); written += bytes.length; }
        JSONObject staged = (JSONObject)projects.call("finish", owner, begin); StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        require(staged.getString("sha256").equals(hash.toString()), "Large asset chunks must retain SHA-256");
        JSONObject state = new JSONObject(files.readWorkspace()), index = new JSONObject().put("entries", new JSONObject().put(root + "/素材.bin", "large-asset").put(root + "/Makefile", "text-entry")).put("textFiles", new JSONObject().put(root + "/Makefile", true)); state.put("pluginProject", index); state.getJSONArray("folders").put(root).put(root + "/空目录");
        JSONArray changes = new JSONArray().put(new JSONObject().put("kind", "mkdir").put("path", "空目录")).put(new JSONObject().put("kind", "writeBlob").put("path", "素材.bin").put("blobId", staged.getString("blobId"))).put(new JSONObject().put("kind", "writeText").put("path", "Makefile").put("text", "all:\n\techo 中文"));
        projects.call("apply", owner, new JSONObject().put("root", root).put("changes", changes).put("expected", new JSONArray()).put("workspace", state.toString()));
        JSONObject read = (JSONObject)projects.call("read", owner, new JSONObject().put("root", root).put("path", "素材.bin").put("offset", size - 17).put("length", 17).put("expectedRevision", "r:" + hash)); require(read.getLong("totalSize") == size && android.util.Base64.decode(read.getString("data"), 2).length == 17, "Binary access must exceed the former 8 MB limit");
        JSONObject moved = files.manage("move", root + "/Makefile", root + "/Buildfile"); require(moved.getJSONObject("pluginProject").getJSONObject("entries").getString(root + "/Buildfile").equals("text-entry"), "Host rename must preserve entry ID"); boolean editable = false; for (int i = 0; i < moved.getJSONArray("entries").length(); i++) { JSONObject e = moved.getJSONArray("entries").getJSONObject(i); if (e.getString("path").equals(root + "/Buildfile")) editable = e.getBoolean("editable"); } require(editable, "Explicit text files must remain lazy and editable after rename");
        state.put("pluginProject", moved.getJSONObject("pluginProject")); JSONArray tree = ((JSONObject)projects.call("tree", owner, new JSONObject().put("root", root))).getJSONArray("entries");
        JSONObject snapshot = (JSONObject)projects.call("snapshotCreate", owner, new JSONObject().put("root", root).put("workspaceId", "qa-project").put("pluginId", "qa.plugin").put("includeRoots", new JSONArray().put("")).put("entries", tree).put("workspace", state.toString()));
        JSONObject export = new JSONObject().put("snapshotId", snapshot.getString("snapshotId")).put("pluginId", "qa.plugin").put("root", "").put("paths", new JSONArray().put("素材.bin").put("Buildfile").put("空目录"));
        boolean missing = false; try { projects.call("archiveExport", owner, new JSONObject(export.toString()).put("paths", new JSONArray().put("素材.bin").put("missing.json"))); } catch (ProjectFiles.Failure e) { missing = e.code.equals("E_NOT_FOUND"); } require(missing, "Every export whitelist path must exist");
        JSONObject output = (JSONObject)projects.call("archiveExport", owner, export); File zip = new File(directory, "project-export.zip"); projects.deliver(owner, new JSONObject().put("outputToken", output.getString("outputToken")).put("suggestedName", "project.zip"), android.net.Uri.fromFile(zip));
        JSONObject selection = projects.select(owner, android.net.Uri.fromFile(zip), "project.zip"), inspected = (JSONObject)projects.call("archiveInspect", owner, new JSONObject().put("selectionToken", selection.getString("token"))); require(inspected.getJSONArray("entries").length() == 3, "ZIP must contain binary, text and empty directory");
        JSONObject imported = (JSONObject)projects.call("archiveStage", owner, new JSONObject().put("archiveToken", inspected.getString("archiveToken")).put("root", "Roundtrip")); boolean binary = false; for (int i = 0; i < imported.getJSONArray("entries").length(); i++) { JSONObject e = imported.getJSONArray("entries").getJSONObject(i); if (e.getString("path").equals("素材.bin")) binary = e.getString("sha256").equals(hash.toString()); } require(binary, "ZIP roundtrip must preserve large binary hash");
        File invalid = new File(directory, "invalid.zip"); try (java.util.zip.ZipOutputStream out = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(invalid))) { out.putNextEntry(new java.util.zip.ZipEntry("../escape.txt")); out.write(1); out.closeEntry(); }
        JSONObject bad = projects.select(owner, android.net.Uri.fromFile(invalid), "invalid.zip"); boolean escaped = false; try { projects.call("archiveInspect", owner, new JSONObject().put("selectionToken", bad.getString("token"))); } catch (ProjectFiles.Failure e) { escaped = e.code.equals("E_INVALID_PATH"); } require(escaped, "ZIP traversal must be rejected before staging");
        projects.call("stop", owner, new JSONObject()); passed.put("Project v3 large binary chunks, stable rename, fixed ZIP roundtrip, empty directories and whitelist/traversal rejection");
    }
    private JSONObject doc(String id, String path, String text) throws Exception {
        return new JSONObject().put("id", id).put("name", path.substring(path.lastIndexOf('/') + 1)).put("path", path).put("text", text).put("updatedAt", 1).put("remote", JSONObject.NULL);
    }
    private void workspace() throws Exception {
        WorkspaceFiles files = new WorkspaceFiles(fixture); JSONObject state = files.scan();
        JSONObject data = new JSONObject().put("version", 1).put("storage", state.getJSONObject("storage"))
            .put("documents", new JSONArray().put(doc("book", "小说/正文.txt", "第一章\n中文正文")))
            .put("folders", new JSONArray().put("小说/空目录"));
        files.saveWorkspace(data.toString());
        File root = new File(state.getJSONObject("storage").getString("root"));
        WorkspaceFiles.atomic(new File(root, "小说/图片.png"), new byte[]{0, (byte)255, 13, 10});
        JSONObject copied = files.manage("copy", "小说", "副本");
        require(copied.getJSONArray("documents").length() == 2, "Copy must preserve editable documents");
        require(new File(root, "副本/空目录").isDirectory(), "Copy must preserve empty folders");
        require(java.util.Arrays.equals(Files.readAllBytes(new File(root, "副本/图片.png").toPath()), new byte[]{0, (byte)255, 13, 10}), "Copy must preserve binary bytes");
        files.manage("move", "副本", "改名"); files.manage("delete", "改名", "");
        WorkspaceFiles resumed = new WorkspaceFiles(fixture); String trashId = resumed.listTrash().getJSONObject(0).getString("id");
        resumed.restoreTrash(trashId, false);
        require(new File(root, "改名/空目录").isDirectory(), "Trash restore must survive restart");
        resumed.manage("delete", "改名", ""); resumed.restoreTrash(resumed.listTrash().getJSONObject(0).getString("id"), true);
        require(resumed.listTrash().length() == 0 && new File(root, "小说/正文.txt").isFile(), "Permanent deletion must preserve unrelated data");
        boolean rejected = false;
        try { resumed.readAsset("../outside.png"); } catch (Exception expected) { rejected = true; }
        require(rejected, "Path traversal must be rejected");
        byte[] csv = ("\uFEFF姓名;身份\n文舟;作者").getBytes(StandardCharsets.UTF_16LE);
        require(FileText.decode(csv).equals("姓名;身份\n文舟;作者"), "UTF-16 CSV decode must preserve Chinese");
        require(FileText.decode("中文正文".getBytes(java.nio.charset.Charset.forName("GB18030"))).equals("中文正文"), "GB18030 must decode");
        passed.put("Private workspace, binary/empty folder copy, move, trash, restart and encodings");
    }
    private void rollback() throws Exception {
        WorkspaceFiles files = new WorkspaceFiles(fixture); File root = new File(files.scan().getJSONObject("storage").getString("root"));
        String original = text(new File(root, "小说/正文.txt"));
        JSONArray batch = new JSONArray().put(new JSONObject().put("path", "小说/正文.txt").put("data", android.util.Base64.encodeToString("覆盖".getBytes(StandardCharsets.UTF_8), 2)))
            .put(new JSONObject().put("path", "小说/正文.txt/失败.md").put("data", "YQ=="));
        boolean rejected = false;
        try { files.writeFiles(batch, new JSONArray()); } catch (Exception expected) { rejected = true; }
        require(rejected && text(new File(root, "小说/正文.txt")).equals(original), "Partial repository writes must roll back existing files");
        passed.put("Repository batch failure restores overwritten bytes");
    }
    private void crashRecovery() throws Exception {
        WorkspaceFiles files = new WorkspaceFiles(fixture); File root = new File(files.scan().getJSONObject("storage").getString("root"));
        File file = new File(root, "小说/正文.txt"), txn = new File(directory, "transactions/" + UUID.randomUUID());
        Files.createDirectories(txn.toPath()); Files.copy(file.toPath(), new File(txn, "0").toPath());
        JSONObject journal = new JSONObject().put("committed", false).put("originals", new JSONArray().put(new JSONObject().put("path", "workspaces/文舟/小说/正文.txt").put("backup", "0")));
        WorkspaceFiles.atomic(new File(txn, "journal.json"), journal.toString().getBytes(StandardCharsets.UTF_8));
        WorkspaceFiles.atomic(file, "未提交修改".getBytes(StandardCharsets.UTF_8));
        new WorkspaceFiles(fixture);
        require(text(file).equals("第一章\n中文正文"), "Interrupted transaction must recover before workspace load");
        require(!txn.exists(), "Recovered transaction must be cleaned up");
        passed.put("Crash recovery replays durable journal");
    }
    private void htmlResources() throws Exception {
        WorkspaceFiles files = new WorkspaceFiles(fixture); File root = new File(files.scan().getJSONObject("storage").getString("root"));
        String source = "<html><head><meta charset=\"gb18030\"><link href=\"style.css\"></head><body><form><button>交互</button></form><script src=\"script.js\"></script></body></html>";
        WorkspaceFiles.atomic(new File(root, "页面.HTML"), ("\uFEFF" + source).getBytes(StandardCharsets.UTF_16LE));
        WorkspaceFiles.atomic(new File(root, "style.css"), WorkspaceFiles.utf8("body{display:grid}"));
        PreviewResource page = files.readPreviewResource("页面.HTML", false); String text = new String(page.bytes, StandardCharsets.UTF_8);
        require(page.mime.equals("text/html") && text.contains("charset=\"utf-8\"") && text.contains("name=\"viewport\""), "HTML must transcode and provide mobile viewport");
        require(text.contains("<form>") && text.contains("script.js") && text.contains("style.css"), "Original markup and relative resources must survive");
        require(files.readPreviewResource("style.css", false).mime.equals("text/css"), "CSS MIME must be correct");
        WorkspaceFiles.atomic(new File(root, "片段.html"), WorkspaceFiles.utf8("<!doctype html><h1>片段</h1>"));
        require(new String(files.readPreviewResource("片段.html", false).bytes, StandardCharsets.UTF_8).startsWith("<!doctype html><meta"), "Viewport insertion must preserve standards mode");
        boolean rejected = false; try { files.readPreviewResource("../workspace.json", false); } catch (Exception error) { rejected = true; }
        require(rejected, "Preview cannot read app metadata outside workspace");
        passed.put("HTML encoding, original markup, relative resources and workspace confinement");
    }
    private android.view.MotionEvent motion(int meta, float wheel, float pinch) {
        android.view.MotionEvent.PointerProperties pointer = new android.view.MotionEvent.PointerProperties(); pointer.id=0; pointer.toolType=android.view.MotionEvent.TOOL_TYPE_MOUSE;
        android.view.MotionEvent.PointerCoords coords = new android.view.MotionEvent.PointerCoords(); coords.setAxisValue(android.view.MotionEvent.AXIS_VSCROLL,wheel);
        if(android.os.Build.VERSION.SDK_INT>=34)coords.setAxisValue(android.view.MotionEvent.AXIS_GESTURE_PINCH_SCALE_FACTOR,pinch);
        return android.view.MotionEvent.obtain(0,1,android.view.MotionEvent.ACTION_SCROLL,1,new android.view.MotionEvent.PointerProperties[]{pointer},new android.view.MotionEvent.PointerCoords[]{coords},meta,0,1,1,0,0,android.view.InputDevice.SOURCE_MOUSE,0);
    }
    private void textZoom() {
        android.view.MotionEvent scroll=motion(0,1,0),ctrl=motion(android.view.KeyEvent.META_CTRL_ON,1,0),pinch=motion(0,0,1.2f);
        try{require(TextZoom.factor(scroll)==1,"Ordinary two-finger scrolling must not resize text");require(TextZoom.factor(ctrl)>1,"Ctrl-wheel trackpad pinch must resize text");if(android.os.Build.VERSION.SDK_INT>=34)require(Math.abs(TextZoom.factor(pinch)-1.2f)<.001f,"Native trackpad pinch axis must resize text");}
        finally{scroll.recycle();ctrl.recycle();pinch.recycle();}
        passed.put("Trackpad pinch and ctrl-wheel text zoom preserve normal scrolling");
    }

    private void archiveImports() throws Exception {
        ImportedArchives archives = new ImportedArchives(fixture);
        try {
            final long size = 54L * 1024 * 1024;
            java.io.InputStream generated = new java.io.InputStream() {
                long remaining = size;
                @Override public int read() { if (remaining == 0) return -1; remaining--; return 42; }
                @Override public int read(byte[] bytes, int offset, int length) { if (remaining == 0) return -1; int count = (int)Math.min(remaining, length); java.util.Arrays.fill(bytes, offset, offset + count, (byte)42); remaining -= count; return count; }
            };
            JSONObject imported = archives.stage(generated, "engine.zip");
            require(imported.getLong("size") == size && imported.toString().length() < 512 && !imported.has("data"), "Large archive must return a tiny descriptor, never base64");
            android.webkit.WebResourceRequest request = new android.webkit.WebResourceRequest() {
                public android.net.Uri getUrl() { return android.net.Uri.parse(imported.optString("url")); }
                public boolean isForMainFrame() { return false; } public boolean isRedirect() { return false; } public boolean hasGesture() { return false; }
                public String getMethod() { return "GET"; } public java.util.Map<String,String> getRequestHeaders() { return java.util.Collections.emptyMap(); }
            };
            android.webkit.WebResourceResponse response = archives.resource(request);
            require(response.getStatusCode() == 200, "Staged archive must stream successfully");
            long actual = 0; byte[] buffer = new byte[65536]; try (java.io.InputStream input = response.getData()) { int count; while ((count = input.read(buffer)) != -1) actual += count; }
            require(actual == size, "Stream must preserve all archive bytes");
            archives.release(imported.getString("importToken"));require(archives.resource(request).getStatusCode() == 404, "Released archives must be inaccessible");
            passed.put("54 MB archive import uses bounded native buffers, same-origin streaming and explicit cleanup");
        } finally { archives.close(); }
    }

}
