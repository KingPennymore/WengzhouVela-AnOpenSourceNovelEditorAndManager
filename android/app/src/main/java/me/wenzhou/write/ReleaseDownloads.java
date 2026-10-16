package me.wenzhou.write;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.ssl.HttpsURLConnection;

/**
 * Release downloads from GitHub / Gitee into the private cache. Component ZIPs are handed to the page through
 * ImportedArchives' same-origin URL; APK updates stay native and go to the system package installer.
 */
final class ReleaseDownloads {
    static final long COMPONENT_LIMIT = 96L * 1024 * 1024, UPDATE_LIMIT = 256L * 1024 * 1024;
    static final Set<String> HOSTS = new HashSet<>(Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "gitee.com", "foruda.gitee.com"));
    private final MainActivity activity;
    private final ImportedArchives imports;
    private final File updates;
    private final Map<String, HttpsURLConnection> active = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private final Map<String, File> installers = new ConcurrentHashMap<>();

    ReleaseDownloads(MainActivity activity, ImportedArchives imports) {
        this.activity = activity; this.imports = imports; updates = new File(activity.getCacheDir(), "updates");
        File[] old = updates.listFiles(); if (old != null) for (File file : old) file.delete();
        updates.mkdirs();
    }
    static boolean allowed(String value) {
        try { URL url = new URL(value); return url.getProtocol().equals("https") && url.getPort() == -1 && url.getUserInfo() == null && HOSTS.contains(url.getHost()); }
        catch (Exception invalid) { return false; }
    }
    private static final class Result { File file; long size; String sha256; }
    private Result fetch(JSONObject data, long limit, File target) throws Exception {
        String id = data.optString("id"), name = data.optString("name"), url = data.optString("url"), expectedHash = data.optString("sha256");
        if (!id.matches("[A-Za-z0-9_-]{1,80}")) throw new IOException("下载标识无效。");
        if (!name.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,159}")) throw new IOException("文件名无效。");
        if (!allowed(url)) throw new IOException("不允许的下载地址。");
        long size = data.optLong("size", 0), max = Math.min(limit, data.optLong("limit", limit) > 0 ? data.optLong("limit", limit) : limit);
        if (size < 0 || size > max) throw new IOException("文件超过大小上限。");
        if (!expectedHash.isEmpty() && !expectedHash.matches("[0-9a-f]{64}")) throw new IOException("校验信息无效。");
        if (!active.isEmpty()) throw new IOException("已有下载正在进行，请稍后。");
        cancelled.remove(id); long received = 0, last = 0;
        try {
            HttpsURLConnection connection = null;
            for (int hop = 0; ; hop++) {
                if (hop > 5) throw new IOException("下载重定向次数过多。");
                if (!allowed(url)) throw new IOException("下载被重定向到不允许的地址。");
                connection = (HttpsURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(60000);
                connection.setRequestProperty("User-Agent", "Vela-Android"); connection.setRequestProperty("Accept", "application/octet-stream");
                active.put(id, connection);
                if (cancelled.contains(id)) throw new InterruptedIOException();
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location"); connection.disconnect();
                    if (location == null) throw new IOException("下载重定向无效。");
                    url = new URL(new URL(url), location).toString(); continue;
                }
                if (status != 200) { connection.disconnect(); throw new IOException(status == 404 ? "发布中没有这个文件（HTTP 404）。" : "下载失败（HTTP " + status + "）。"); }
                break;
            }
            long declared = connection.getContentLengthLong();
            if (declared > max || size > 0 && declared > 0 && declared != size) throw new IOException("文件大小与发布信息不符。");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.contains(id)) throw new InterruptedIOException();
                    received += count; if (received > max) throw new IOException("文件超过大小上限。");
                    digest.update(buffer, 0, count); out.write(buffer, 0, count);
                    long now = System.currentTimeMillis();
                    if (now - last > 200) { last = now; progress(id, received, size > 0 ? size : Math.max(declared, 0)); }
                }
            } finally { connection.disconnect(); }
            if (size > 0 && received != size) throw new IOException("下载内容不完整。");
            StringBuilder hex = new StringBuilder(); for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            if (!expectedHash.isEmpty() && !hex.toString().equals(expectedHash)) throw new IOException("文件的 SHA-256 与发布信息不符。");
            progress(id, received, received);
            Result result = new Result(); result.file = target; result.size = received; result.sha256 = hex.toString(); return result;
        } catch (Exception error) {
            Files.deleteIfExists(target.toPath());
            if (cancelled.contains(id)) throw new IOException("下载已取消。");
            if (error instanceof IOException && error.getMessage() != null && !(error instanceof javax.net.ssl.SSLException) && error.getMessage().matches(".*[\\u4e00-\\u9fff].*")) throw error;
            throw new IOException("无法连接下载服务器，请检查网络后重试。");
        } finally { active.remove(id); cancelled.remove(id); }
    }
    private void progress(String id, long received, long total) {
        try { activity.dispatchDownload(new JSONObject().put("id", id).put("received", received).put("total", total).toString()); } catch (Exception ignored) { }
    }
    JSONObject component(JSONObject data) throws Exception {
        File target = imports.reserve();
        Result result = fetch(data, COMPONENT_LIMIT, target);
        return imports.adopt(result.file, data.optString("name"), result.size).put("sha256", result.sha256);
    }
    JSONObject update(JSONObject data) throws Exception {
        String name = data.optString("name");
        if (!name.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,159}\\.apk")) throw new IOException("只能下载 Android 安装包。");
        if (!data.optString("sha256").matches("[0-9a-f]{64}")) throw new IOException("安装包缺少 SHA-256，已拒绝下载。");
        Result result = fetch(data, UPDATE_LIMIT, new File(updates, name));
        String token = UUID.randomUUID().toString(); installers.put(token, result.file);
        return new JSONObject().put("token", token).put("size", result.size).put("sha256", result.sha256).put("name", name);
    }
    boolean cancel(String id) { cancelled.add(id); HttpsURLConnection connection = active.get(id); if (connection != null) connection.disconnect(); return true; }
    /** Opens the system installer. Android verifies the APK signature matches the installed app before replacing it. */
    boolean install(String token) throws Exception {
        File file = installers.get(token); if (file == null || !file.isFile()) throw new IOException("安装包不存在，请重新下载。");
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            activity.runOnUiThread(() -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))));
            throw new IOException("请在系统设置中允许文舟安装应用，然后再次点击安装。");
        }
        Uri uri = androidx.core.content.FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", file);
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.runOnUiThread(() -> activity.startActivity(intent));
        return true;
    }
}
