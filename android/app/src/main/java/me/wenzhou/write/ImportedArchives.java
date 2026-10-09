package me.wenzhou.write;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.util.*;

/** Stream picked archives through a short-lived same-origin URL, never a giant bridge string. */
final class ImportedArchives implements AutoCloseable {
    static final long LIMIT = 64L * 1024 * 1024;
    private final File directory;
    private final Map<String,File> files = new HashMap<>();
    ImportedArchives(Context context) throws IOException {
        directory = new File(context.getCacheDir(), "picked-archives-" + UUID.randomUUID());
        Files.createDirectories(directory.toPath());
    }
    synchronized JSONObject stage(InputStream input, String name) throws Exception {
        if (files.size() >= 2) { if (input != null) input.close(); throw new IOException("请先完成当前组件导入。"); }
        String token = UUID.randomUUID().toString(); File file = new File(directory, token); long size = 0;
        try (InputStream source = input; OutputStream out = new FileOutputStream(file)) {
            if (source == null) throw new IOException("无法读取所选文件。");
            byte[] buffer = new byte[65536]; int count;
            while ((count = source.read(buffer)) != -1) { size += count; if (size > LIMIT) throw new IOException("单个安装包不能超过 64 MB。"); out.write(buffer, 0, count); }
        } catch (Exception error) { Files.deleteIfExists(file.toPath()); throw error; }
        files.put(token, file);
        return new JSONObject().put("name", name).put("size", size).put("importToken", token)
            .put("url", "https://appassets.androidplatform.net/imports/" + token);
    }
    synchronized WebResourceResponse resource(WebResourceRequest request) {
        Uri uri = request.getUrl(); String token = uri.getLastPathSegment();
        try {
            if (request.isForMainFrame() || !request.getMethod().equals("GET") || !uri.getPath().equals("/imports/" + token)) throw new IOException();
            File file = files.get(token); if (file == null || !file.isFile()) throw new IOException();
            Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control", "no-store"); headers.put("X-Content-Type-Options", "nosniff"); headers.put("Content-Length", Long.toString(file.length()));
            return new WebResourceResponse("application/zip", null, 200, "OK", headers, new FileInputStream(file));
        } catch (Exception error) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    }
    synchronized boolean release(String token) throws IOException { File file = files.remove(token); if (file != null) Files.deleteIfExists(file.toPath()); return true; }
    @Override public synchronized void close() { for (File file : files.values()) file.delete(); files.clear(); directory.delete(); }
}
