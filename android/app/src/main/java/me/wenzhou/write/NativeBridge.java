package me.wenzhou.write;

import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import javax.net.ssl.HttpsURLConnection;

/** No API ever returns the stored token. Only fixed GitHub origins accept credentials. */
final class NativeBridge {
    private final MainActivity activity;
    private final byte[] capability;
    final WorkspaceFiles files;
    private final CredentialStore credentials;
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final AtomicLong authGeneration = new AtomicLong();
    private final Object authLock = new Object();

    NativeBridge(MainActivity activity, String capability) throws Exception {
        this.activity = activity; this.capability = capability.getBytes(StandardCharsets.UTF_8);
        files = new WorkspaceFiles(activity); credentials = new CredentialStore(activity);
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
        try { files.saveWorkspace(data); return "ok"; } catch (Exception error) { return message(error); }
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
                if (Arrays.asList("import", "export", "importPlugin").contains(operation)) { activity.pick(requestId, operation, data); return; }
                Object value = dispatch(operation, data, generation);
                activity.deliver(requestId, success(value));
            } catch (Exception error) { activity.deliver(requestId, failure(error)); }
        });
    }
    private Object dispatch(String operation, JSONObject data, long generation) throws Exception {
        switch (operation) {
            case "initializeStorage": case "refreshFolder": return files.scan();
            case "manageFiles": return files.manage(data.optString("action"), data.optString("path"), data.optString("destination"));
            case "listTrash": return files.listTrash();
            case "restoreTrash": return files.restoreTrash(data.optString("id"), data.optBoolean("permanent"));
            case "readWorkspaceAsset": return files.readAsset(data.optString("path"));
            case "previewHtml": files.readPreviewResource(data.optString("path"), true); activity.previewHtml(data.optString("path"), data.optBoolean("dark")); return true;
            case "writeWorkspaceFiles": return files.writeFiles(array(data, "files"), array(data, "folders"));
            case "appearance": activity.appearance(data.optBoolean("dark"), data.optString("background")); return true;
            case "openAuth": activity.openAuthorization(); return true;
            case "connection": return request("https://api.github.com", "GET", null, "");
            case "api": {
                String path = data.optString("path"), method = data.optString("method", "GET");
                if (!path.matches("^/(user(?:\\?.*|$)|user/repos(?:\\?.*|$)|repos/[\\w.-]+/[\\w.-]+(?:/.*|\\?.*|$))")
                    || path.matches("(?s).*[\\r\\n\\\\#].*") || path.contains("..")) throw new IOException("不允许的 GitHub 请求路径。");
                if (!Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE").contains(method)) throw new IOException("不支持此请求方法。");
                String token = credentials.read();
                if (token.isEmpty()) return new JSONObject().put("status", 401).put("body", new JSONObject());
                return request("https://api.github.com" + path, method, data.optJSONObject("body"), token);
            }
            case "login": {
                String token = data.optString("token").trim();
                if (token.isEmpty() || token.length() > 4096 || token.matches("(?s).*\\s.*")) throw new IOException("访问令牌格式不正确。");
                JSONObject user = request("https://api.github.com/user", "GET", null, token);
                verifyLoginStatus(user.getInt("status"));
                synchronized (authLock) {
                    if (generation != authGeneration.get()) throw new IOException("登录已取消。");
                    credentials.write(token);
                }
                return user.get("body");
            }
            case "logout": synchronized (authLock) { if (generation == authGeneration.get()) credentials.clear(); } return true;
            case "oauth": {
                String path = data.optString("path");
                if (!path.equals("/login/device/code") && !path.equals("/login/oauth/access_token")) throw new IOException("不允许的授权地址。");
                JSONObject response = request("https://github.com" + path, "POST", data.optJSONObject("body"), "");
                if (response.getInt("status") != 200) throw new IOException("GitHub 授权请求失败，请检查 Client ID 与网络。");
                JSONObject oauth = response.getJSONObject("body"); String token = oauth.optString("access_token");
                if (!token.isEmpty()) {
                    JSONObject user = request("https://api.github.com/user", "GET", null, token); verifyLoginStatus(user.getInt("status"));
                    synchronized (authLock) {
                        if (generation != authGeneration.get()) throw new IOException("登录已取消。");
                        credentials.write(token);
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
        if (status == 403) throw new IOException("GitHub 拒绝访问，请检查令牌权限或请求额度。");
        throw new IOException("GitHub 验证失败（HTTP " + status + "），请检查网络后重试。");
    }
    private JSONObject request(String url, String method, JSONObject body, String token) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method); connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("User-Agent", "Wenzhou-Android/0.4.2");
            if (!token.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
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
                    catch (Exception invalid) { if (status >= 200 && status < 300) throw new IOException("GitHub 响应格式异常，请检查设备网络。"); result = new JSONObject(); }
                }
            }
            return new JSONObject().put("status", status).put("body", result);
        } catch (IOException network) {
            if (network.getMessage() != null && network.getMessage().startsWith("GitHub 响应")) throw network;
            throw new IOException("无法连接 GitHub，请检查设备网络或代理后重试。");
        } finally { connection.disconnect(); }
    }
    static byte[] readStream(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[16384]; int count;
        while ((count = input.read(buffer)) != -1) { if (output.size() + count > limit) throw new IOException("文件超出读取大小限制。"); output.write(buffer, 0, count); }
        return output.toByteArray();
    }
    static String message(Exception error) { return error.getMessage() == null ? "设备操作失败，请重试。" : error.getMessage(); }
    static String success(Object value) { try { return new JSONObject().put("ok", true).put("value", value == null ? JSONObject.NULL : value).toString(); } catch (Exception impossible) { return "{\"ok\":false,\"error\":\"返回格式异常\"}"; } }
    static String failure(Exception error) { try { return new JSONObject().put("ok", false).put("error", message(error)).toString(); } catch (Exception impossible) { return "{\"ok\":false,\"error\":\"设备操作失败\"}"; } }
    void work(Runnable job) { workers.execute(job); }
    void close() { workers.shutdown(); }
}
