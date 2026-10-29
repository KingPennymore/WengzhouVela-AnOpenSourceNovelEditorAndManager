package me.wenzhou.write;

import android.content.Context;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

final class AiBridge {
    private final CredentialStore credentials;
    private final ConcurrentHashMap<String, Task> requests = new ConcurrentHashMap<>();
    private final ScheduledExecutorService timers = Executors.newScheduledThreadPool(2);
    static class Task {
        volatile HttpURLConnection connection;
        volatile boolean cancelled, timedOut;
        void stop() { HttpURLConnection value = connection; if (value != null) value.disconnect(); }
    }
    AiBridge(Context context) { credentials = new CredentialStore(context, "ai"); }
    Task prepare(JSONObject data) throws Exception {
        if (!data.optString("action").equals("request") || !(data.opt("requestId") instanceof String)) return null;
        String id = data.getString("requestId"); if (id.isEmpty() || id.length() > 128) return null;
        Task task = new Task(); if (requests.putIfAbsent(id, task) != null) throw fail("AI 请求标识已在使用。"); return task;
    }
    private static IOException fail(String message) { return new IOException(message); }
    private static String string(JSONObject data, String name) throws Exception {
        if (!(data.opt(name) instanceof String)) throw fail(name.equals("key") ? "AI 密钥格式不正确。" : name.equals("format") ? "不支持此 AI 请求格式。" : "AI 接口地址无效。");
        return data.getString(name);
    }
    static String endpoint(String value) throws Exception {
        URI url;
        try { url = new URI(value); } catch (Exception invalid) { throw fail("AI 接口地址无效。"); }
        if (value.isEmpty() || value.length() > 512 || !url.isAbsolute() || value.matches("(?s).*[\\s\\\\?#].*") || url.getHost() == null || url.getRawUserInfo() != null || url.getRawQuery() != null || url.getRawFragment() != null || url.getPort() > 65535 || url.getPort() == 0) throw fail("AI 接口地址无效。");
        String scheme = url.getScheme().toLowerCase(java.util.Locale.ROOT), host = url.getHost().toLowerCase(java.util.Locale.ROOT);
        boolean local = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]") || host.endsWith(".local");
        String[] parts = host.split("\\.");
        if (parts.length == 4 && host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) {
            int a = Integer.parseInt(parts[0]), b = Integer.parseInt(parts[1]);
            boolean valid = true; for (String part : parts) if (Integer.parseInt(part) > 255 || !Integer.toString(Integer.parseInt(part)).equals(part)) valid = false;
            local |= valid && (a == 10 || a == 172 && b >= 16 && b <= 31 || a == 192 && b == 168);
        }
        if (!"https".equals(scheme) && !("http".equals(scheme) && local)) throw fail("AI 接口地址必须使用 HTTPS，本机或局域网地址可使用 HTTP。");
        if ("http".equals(scheme) && !host.equals("localhost") && !host.equals("127.0.0.1") && !host.equals("10.0.2.2")) throw fail("Android 仅允许 localhost、127.0.0.1 和 10.0.2.2 使用 HTTP，其他地址请使用 HTTPS。");
        return value.replaceAll("/+$", "");
    }
    private static JSONObject credential(JSONObject data) throws Exception {
        String format = string(data, "format");
        if (!format.matches("openai|anthropic|gemini|azure")) throw fail("不支持此 AI 请求格式。");
        String endpoint = endpoint(string(data, "endpoint")), key = string(data, "key");
        if (key.length() > 4096 || java.util.regex.Pattern.compile("[\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]").matcher(key).find()) throw fail("AI 密钥格式不正确。");
        return new JSONObject().put("format", format).put("endpoint", endpoint).put("key", key);
    }
    private JSONObject read() throws Exception {
        String value = credentials.read(); if (value.isEmpty()) return null; JSONObject parsed;
        try { parsed = new JSONObject(value); } catch (Exception invalid) { throw fail("AI 配置读取失败，请重新保存。"); }
        return credential(parsed);
    }
    private static JSONObject status(JSONObject value) throws Exception {
        String key = value == null ? "" : value.getString("key");
        return new JSONObject().put("saved", value != null).put("format", value == null ? "" : value.getString("format")).put("endpoint", value == null ? "" : value.getString("endpoint")).put("last4", key.substring(Math.max(0, key.length() - 4)));
    }
    static void path(String format, String value) throws Exception {
        boolean allowed = format.equals("openai") ? value.equals("/chat/completions") : format.equals("anthropic") ? value.equals("/v1/messages") : format.equals("gemini") ? value.matches("/v1beta/models/[A-Za-z0-9._:/-]{1,128}:generateContent") : format.equals("azure") && value.matches("/openai/deployments/[A-Za-z0-9._-]{1,128}/chat/completions\\?api-version=[0-9a-z.-]{1,32}");
        if (!allowed || format.equals("gemini") && value.contains("..")) throw fail("不允许的 AI 请求路径。");
    }
    Object call(JSONObject data, Task prepared) throws Exception {
        try { return perform(data, prepared); }
        finally { if (prepared != null) requests.remove(data.optString("requestId"), prepared); }
    }
    private Object perform(JSONObject data, Task prepared) throws Exception {
        String action = data.optString("action");
        if (action.equals("cancel")) { Task task = requests.get(data.optString("requestId")); if (task != null) { task.cancelled = true; task.stop(); } return true; }
        if (action.equals("clear")) { credentials.clear(); return true; }
        if (action.equals("status")) return status(read());
        if (action.equals("save")) { JSONObject value = credential(data); credentials.write(value.toString()); return status(value); }
        if (action.equals("verify")) {
            JSONObject value = credential(data); String format = value.getString("format");
            if (format.equals("azure")) return new JSONObject().put("status", 200).put("body", new JSONObject());
            return request(value, "GET", format.equals("openai") ? "/models" : format.equals("anthropic") ? "/v1/models" : "/v1beta/models", null, null, null);
        }
        if (action.equals("request")) {
            JSONObject value = read();
            if (value == null) return new JSONObject().put("status", 401).put("body", new JSONObject().put("error", new JSONObject().put("message", "未配置 AI 服务。")));
            if (!data.optString("method").equals("POST")) throw fail("不允许的 AI 请求方法。");
            String path = data.optString("path"); path(value.getString("format"), path);
            String id = data.optString("requestId"); if (!(data.opt("requestId") instanceof String) || id.isEmpty() || id.length() > 128) throw fail("AI 请求标识无效。");
            if (!data.has("body")) throw fail("AI 请求数据无效。");
            String json = new org.json.JSONArray().put(data.get("body")).toString();
            byte[] body = json.substring(1, json.length() - 1).getBytes(StandardCharsets.UTF_8);
            if (body.length > 2 * 1024 * 1024) throw fail("AI 请求内容不能超过 2 MB。");
            return request(value, "POST", path, body, id, prepared);
        }
        throw fail("不支持此 AI 操作。");
    }
    private JSONObject request(JSONObject value, String method, String path, byte[] body, String id, Task prepared) throws Exception {
        Task task = prepared == null ? new Task() : prepared;
        if (prepared == null && id != null && requests.putIfAbsent(id, task) != null) throw fail("AI 请求标识已在使用。");
        ScheduledFuture<?> timer = timers.schedule(() -> { task.timedOut = true; task.stop(); }, 120, TimeUnit.SECONDS);
        try {
            HttpURLConnection connection = (HttpURLConnection) new URI(value.getString("endpoint") + path).toURL().openConnection(); task.connection = connection;
            if (task.cancelled) throw fail("AI 请求已取消。");
            connection.setConnectTimeout(120000); connection.setReadTimeout(120000); connection.setInstanceFollowRedirects(false); connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Content-Type", "application/json");
            String format = value.getString("format"), key = value.getString("key");
            if (format.equals("openai")) { if (!key.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + key); }
            else if (format.equals("anthropic")) { connection.setRequestProperty("x-api-key", key); connection.setRequestProperty("anthropic-version", "2023-06-01"); }
            else connection.setRequestProperty(format.equals("gemini") ? "x-goog-api-key" : "api-key", key);
            if (body != null) { connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length); try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); } }
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) throw fail("AI 服务不允许重定向。");
            InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (stream != null) try (InputStream input = stream) { byte[] buffer = new byte[16384]; int count; while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 4 * 1024 * 1024) throw fail("AI 响应内容不能超过 4 MB。"); bytes.write(buffer, 0, count); } }
            String text = new String(bytes.toByteArray(), StandardCharsets.UTF_8); Object parsed;
            try {
                try (android.util.JsonReader reader = new android.util.JsonReader(new java.io.StringReader("[" + text + "]"))) { reader.beginArray(); reader.skipValue(); reader.endArray(); if (reader.peek() != android.util.JsonToken.END_DOCUMENT) throw fail("invalid"); }
                parsed = new JSONTokener(text).nextValue();
            }
            catch (Exception invalid) { parsed = new JSONObject().put("error", new JSONObject().put("message", text)); }
            if (task.cancelled) throw fail("AI 请求已取消。");
            if (task.timedOut) throw fail("AI 请求超时，请稍后重试。");
            return new JSONObject().put("status", code).put("body", parsed);
        } catch (Exception error) {
            if (task.cancelled) throw fail("AI 请求已取消。");
            if (task.timedOut || error instanceof java.net.SocketTimeoutException) throw fail("AI 请求超时，请稍后重试。");
            if ("AI 响应内容不能超过 4 MB。".equals(error.getMessage()) || "AI 服务不允许重定向。".equals(error.getMessage())) throw error;
            throw fail("无法连接 AI 服务，请检查网络或接口地址。");
        } finally { timer.cancel(false); task.stop(); if (id != null) requests.remove(id, task); }
    }
    void close() { for (Task task : requests.values()) { task.cancelled = true; task.stop(); } timers.shutdown(); }
}
