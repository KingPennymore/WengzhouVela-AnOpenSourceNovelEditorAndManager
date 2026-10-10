package me.wenzhou.write;

import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import javax.net.ssl.HttpsURLConnection;

/** No API ever returns the stored token. Only fixed provider origins accept credentials. */
final class NativeBridge {
    private final MainActivity activity;
    private final byte[] capability;
    final WorkspaceFiles files;
    final ProjectFiles projects;
    final ImportedArchives imports;
    private final CredentialStore credentials;
    private final CredentialStore giteeCredentials;
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final AtomicLong authGeneration = new AtomicLong();
    private final Object authLock = new Object();

    NativeBridge(MainActivity activity, String capability) throws Exception {
        this.activity = activity; this.capability = capability.getBytes(StandardCharsets.UTF_8);
        files = new WorkspaceFiles(activity); projects = new ProjectFiles(activity, files); imports = new ImportedArchives(activity); credentials = new CredentialStore(activity); giteeCredentials = new CredentialStore(activity, "gitee");
    }
    private void authorize(String value) {
        if (value == null || value.length() > 80 || !MessageDigest.isEqual(capability, value.getBytes(StandardCharsets.UTF_8))) throw new SecurityException("不允许的页面调用。");
    }
    @JavascriptInterface public String readEnvironment(String secret) { authorize(secret); return activity.environment(); }
    @JavascriptInterface public String readWorkspace(String secret) {
        authorize(secret);
        try { return files.readWorkspace(); }
        catch (Exception error) { throw new IllegalStateException("无法读取本地文稿，原始数据已保留。"); }
    }
    @JavascriptInterface public String writeWorkspace(String secret, String data) {
        authorize(secret);
        try { if (projects.busy) throw ProjectFiles.fail("E_CONFLICT", "项目正在提交，请稍后保存。"); files.saveWorkspace(data); return "ok"; } catch (Exception error) { return message(error); }
    }
    @JavascriptInterface public String readPlugins(String secret) {
        authorize(secret);
        try { return files.readPlugins(); } catch (Exception error) { throw new IllegalStateException("无法读取插件配置。"); }
    }
    @JavascriptInterface public String writePlugins(String secret, String data) {
        authorize(secret);
        try { files.writePlugins(data); return "ok"; } catch (Exception error) { return message(error); }
    }
    @JavascriptInterface public void post(String secret, String requestId, String operation, String json) {
        authorize(secret);
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,80}")) throw new SecurityException("请求标识无效。");
        long generation = operation.equals("login") || operation.equals("logout") ? authGeneration.incrementAndGet() : authGeneration.get();
        workers.execute(() -> {
            try {
                if (json == null || json.length() > 100 * 1024 * 1024) throw new IOException("请求数据过大。");
                JSONObject data = new JSONObject(json);
                if (operation.equals("project")) {
                    String action = data.optString("action"), owner = data.optString("owner"); JSONObject args = new JSONObject(data.optString("request", "{}"));
                    if (action.equals("pick")) { activity.pick(requestId, "project-pick", new JSONObject().put("owner", owner).put("args", args)); return; }
                    if (action.equals("deliver") || action.equals("exportFile")) {
                        if (action.equals("exportFile")) args = projects.prepareExport(owner, args);
                        activity.pick(requestId, "project-export", new JSONObject().put("owner", owner).put("args", args).put("name", args.optString("suggestedName", "project.zip"))); return;
                    }
                    activity.deliver(requestId, success(projects.call(action, owner, args))); return;
                }
                if (Arrays.asList("import", "export", "exportPdf", "exportOdt", "importPlugin").contains(operation)) { activity.pick(requestId, operation, data); return; }
                Object value = dispatch(operation, data, generation);
                activity.deliver(requestId, success(value));
            } catch (Exception error) { activity.deliver(requestId, failure(operation.equals("project") ? projectError(error) : error)); }
        });
    }
    private Object dispatch(String operation, JSONObject data, long generation) throws Exception {
        if (projects.busy && Arrays.asList("manageFiles", "restoreTrash", "writeWorkspaceFiles").contains(operation)) throw ProjectFiles.fail("E_CONFLICT", "项目正在提交，请稍后重试。");
        String provider = data.optString("provider", "github");
        if (!provider.equals("github") && !provider.equals("gitee")) throw new IOException("不支持此代码托管平台。");
        String origin = provider.equals("gitee") ? "https://gitee.com/api/v5" : "https://api.github.com";
        CredentialStore store = provider.equals("gitee") ? giteeCredentials : credentials;
        switch (operation) {
            case "clipboardWrite": {
                String text = data.optString("text"); if (text.length() > 8 * 1024 * 1024) throw new IOException("剪贴板内容过大。");
                java.util.concurrent.FutureTask<Boolean> task = new java.util.concurrent.FutureTask<>(() -> {
                    android.content.ClipboardManager clipboard = (android.content.ClipboardManager) activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("文舟", text)); return true;
                }); activity.runOnUiThread(task); return task.get();
            }
            case "clipboardRead": {
                java.util.concurrent.FutureTask<String> task = new java.util.concurrent.FutureTask<>(() -> {
                    android.content.ClipboardManager clipboard = (android.content.ClipboardManager) activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                    android.content.ClipData clip = clipboard.getPrimaryClip(); return clip == null || clip.getItemCount() == 0 ? "" : clip.getItemAt(0).coerceToText(activity).toString();
                }); activity.runOnUiThread(task); return task.get();
            }
            case "releaseImport": return imports.release(data.optString("token"));
            case "initializeStorage": case "refreshFolder": return files.scan();
            case "manageFiles": return files.manage(data.optString("action"), data.optString("path"), data.optString("destination"));
            case "listTrash": return files.listTrash();
            case "restoreTrash": return files.restoreTrash(data.optString("id"), data.optBoolean("permanent"));
            case "readWorkspaceFile": return files.readFileBase64(data.optString("path"));
            case "readWorkspaceAsset": return files.readAsset(data.optString("path"));
            case "previewHtml":
                files.readPreviewResource(data.optString("path"), true);
                if (data.optBoolean("embedded")) return new android.net.Uri.Builder().scheme("https").authority("wenzhou-preview.local").path("/"+data.optString("path")).appendQueryParameter("html","true").appendQueryParameter("fontSize",Integer.toString(Math.max(10,Math.min(40,data.optInt("fontSize",16))))).appendQueryParameter("dark",Boolean.toString(data.optBoolean("dark"))).build().toString();
                activity.previewHtml(data.optString("path"), data.optBoolean("dark"), data); return true;
            case "writeWorkspaceFiles": return files.writeFiles(array(data, "files"), array(data, "folders"));
            case "appearance": activity.appearance(data.optBoolean("dark"), data.optString("background")); return true;
            case "fullscreen": activity.fullscreen(data.optBoolean("enabled")); return true;
            case "openAuth": activity.openAuthorization(); return true;
            case "connection": return request(origin + (provider.equals("gitee") ? "/emojis" : ""), "GET", null, "");
            case "publicApi": case "api": {
                String path = data.optString("path"), method = data.optString("method", "GET");
                if (!path.matches("^/(user(?:\\?.*|$)|user/repos(?:\\?.*|$)|repos/[\\w.-]+/[\\w.-]+(?:/.*|\\?.*|$))")
                    || path.matches("(?s).*[\\r\\n\\\\#].*") || path.contains("..")) throw new IOException("不允许的 GitHub 请求路径。");
                if (!Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE").contains(method)) throw new IOException("不支持此请求方法。");
                if (operation.equals("publicApi") && (!method.equals("GET") || !path.startsWith("/repos/"))) throw new IOException("Public repository reads only.");
                String token = store.read();
                if (token.isEmpty() && !operation.equals("publicApi")) return new JSONObject().put("status", 401).put("body", new JSONObject());
                return request(origin + path, method, data.optJSONObject("body"), token);
            }
            case "login": {
                String token = data.optString("token").trim();
                if (token.isEmpty() || token.length() > 4096 || token.matches("(?s).*\\s.*")) throw new IOException("访问令牌格式不正确。");
                JSONObject user = request(origin + "/user", "GET", null, token);
                verifyLoginStatus(user.getInt("status"));
                synchronized (authLock) {
                    if (generation != authGeneration.get()) throw new IOException("登录已取消。");
                    store.write(token);
                }
                return user.get("body");
            }
            case "logout": synchronized (authLock) { if (generation == authGeneration.get()) store.clear(); } return true;
            case "oauth": {
                if (!provider.equals("github")) throw new IOException("Gitee 请使用个人访问令牌登录。");
                String path = data.optString("path");
                if (!path.equals("/login/device/code") && !path.equals("/login/oauth/access_token")) throw new IOException("不允许的授权地址。");
                JSONObject response = request("https://github.com" + path, "POST", data.optJSONObject("body"), "");
                if (response.getInt("status") != 200) throw new IOException("GitHub 授权请求失败，请检查 Client ID 与网络。");
                JSONObject oauth = response.getJSONObject("body"); String token = oauth.optString("access_token");
                if (!token.isEmpty()) {
                    JSONObject user = request(origin + "/user", "GET", null, token); verifyLoginStatus(user.getInt("status"));
                    synchronized (authLock) {
                        if (generation != authGeneration.get()) throw new IOException("登录已取消。");
                        store.write(token);
                    }
                    return new JSONObject().put("authorized", true);
                }
                return oauth;
            }
            default: throw new IOException("不支持此操作。");
        }
    }
    private JSONArray array(JSONObject data, String key) { JSONArray value = data.optJSONArray(key); return value == null ? new JSONArray() : value; }
    private void verifyLoginStatus(int status) throws IOException {
        if (status == 200) return;
        if (status == 401) throw new IOException("访问令牌无效或已过期，请重新生成令牌。");
        if (status == 403) throw new IOException("代码托管服务拒绝访问，请检查令牌权限或请求额度。");
        throw new IOException("代码托管服务验证失败（HTTP " + status + "），请检查网络后重试。");
    }
    private JSONObject request(String url, String method, JSONObject body, String token) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method); connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("User-Agent", "Vela-Android/0.5.0");
            if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (!token.isEmpty() && url.startsWith("https://api.github.com/")) {
                connection.setRequestProperty("Accept", "application/vnd.github+json"); connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            }
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode(); Object result = JSONObject.NULL;
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) {
                String text; try (InputStream input = stream) { text = new String(readStream(input, 16 * 1024 * 1024), StandardCharsets.UTF_8); }
                if (!text.isEmpty()) {
                    try { result = new JSONTokener(text).nextValue(); }
                    catch (Exception invalid) { if (status >= 200 && status < 300) throw new IOException("代码托管服务响应格式异常，请检查设备网络。"); result = new JSONObject(); }
                }
            }
            return new JSONObject().put("status", status).put("body", result);
        } catch (IOException network) {
            if (network.getMessage() != null && network.getMessage().startsWith("代码托管服务响应")) throw network;
            throw new IOException("无法连接 GitHub，请检查设备网络或代理后重试。");
        } finally { connection.disconnect(); }
    }
    static byte[] readStream(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[16384]; int count;
        while ((count = input.read(buffer)) != -1) { if (output.size() + count > limit) throw new IOException("文件超出读取大小限制。"); output.write(buffer, 0, count); }
        return output.toByteArray();
    }
    static Exception projectError(Exception error) {
        if (error instanceof ProjectFiles.Failure) return error; String code = "E_INVALID_DATA";
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof android.system.ErrnoException) { int errno = ((android.system.ErrnoException)cause).errno; if (errno == android.system.OsConstants.ENOSPC || errno == android.system.OsConstants.EDQUOT) code = "E_QUOTA"; else if (errno == android.system.OsConstants.ENOENT) code = "E_NOT_FOUND"; else if (errno == android.system.OsConstants.EACCES || errno == android.system.OsConstants.EPERM) code = "E_PERMISSION"; }
            if (cause instanceof java.nio.file.NoSuchFileException) code = "E_NOT_FOUND";
            if (cause.getMessage() != null && (cause.getMessage().contains("ENOSPC") || cause.getMessage().contains("EDQUOT"))) code = "E_QUOTA";
        }
        return ProjectFiles.fail(code, code.equals("E_QUOTA") ? "存储空间不足，原始数据已保留。" : "项目文件操作失败，原始数据已保留。");
    }
    static String message(Exception error) { return error.getMessage() == null ? "设备操作失败，请重试。" : error.getMessage(); }
    static String success(Object value) { try { return new JSONObject().put("ok", true).put("value", value == null ? JSONObject.NULL : value).toString(); } catch (Exception impossible) { return "{\"ok\":false,\"error\":\"返回格式异常\"}"; } }
    static String failure(Exception error) { try { JSONObject value = new JSONObject().put("ok", false).put("error", message(error)); if (error instanceof ProjectFiles.Failure) value.put("code", ((ProjectFiles.Failure) error).code).put("retryable", ((ProjectFiles.Failure) error).code.equals("E_CONFLICT")).put("details", new JSONObject()); return value.toString(); } catch (Exception impossible) { return "{\"ok\":false,\"error\":\"设备操作失败\"}"; } }
    void work(Runnable job) { workers.execute(job); }
    void close() { workers.shutdown(); imports.close(); }
}
