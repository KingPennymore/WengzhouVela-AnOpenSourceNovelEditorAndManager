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
            credentials(); workspace(); rollback(); crashRecovery(); htmlResources();
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
}
