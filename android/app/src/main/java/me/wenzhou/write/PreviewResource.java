package me.wenzhou.write;

import java.util.Locale;

final class PreviewResource {
    final byte[] bytes;
    final String mime;
    PreviewResource(byte[] bytes, String mime) { this.bytes = bytes; this.mime = mime; }
    static String mime(String path) {
        String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (extension) {
            case "html": case "htm": return "text/html";
            case "css": return "text/css";
            case "js": case "mjs": return "text/javascript";
            case "json": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "ico": return "image/x-icon";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "ogg": case "oga": return "audio/ogg";
            case "ogv": return "video/ogg";
            case "wav": return "audio/wav";
            case "zip": return "application/zip";
            case "mp3": return "audio/mpeg";
            case "csv": return "text/csv";
            case "tsv": return "text/tab-separated-values";
            case "txt": case "md": return "text/plain";
            default: return "application/octet-stream";
        }
    }
}
