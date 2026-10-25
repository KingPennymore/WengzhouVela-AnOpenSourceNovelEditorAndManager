package me.wenzhou.write;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Instance identity must match web/git-host.mjs, including ports and subpaths. */
final class GiteaServer {
    static String normalize(String value) throws IOException {
        String text = value.trim();
        Matcher match = Pattern.compile("^https://(\\[[0-9a-f:]+\\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?((?:/[a-z0-9._~-]+)*/*)$", Pattern.CASE_INSENSITIVE).matcher(text);
        if (text.length() > 512 || !match.matches()) throw new IOException("请输入有效的 HTTPS Gitea 服务器地址。");
        int port = match.group(2) == null ? 443 : Integer.parseInt(match.group(2));
        String path = match.group(3).replaceAll("/+$", "");
        if (port < 1 || port > 65535) throw new IOException("Gitea 服务器端口无效。");
        for (String part : path.split("/")) if (part.equals(".") || part.equals("..")) throw new IOException("Gitea 服务器路径无效。");
        return "https://" + match.group(1).toLowerCase(Locale.ROOT) + (port == 443 ? "" : ":" + port) + path;
    }

    static String credentialKey(String server) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(("gitea:" + normalize(server)).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder("gitea-");
        for (byte value : digest) hex.append(String.format(Locale.ROOT, "%02x", value & 255));
        return hex.toString();
    }
}
