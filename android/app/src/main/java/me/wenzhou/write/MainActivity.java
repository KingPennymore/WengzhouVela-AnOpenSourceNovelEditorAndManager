package me.wenzhou.write;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PAGE = ORIGIN + "/assets/web/index.html";
    private final String capability = UUID.randomUUID().toString();
    private FrameLayout root;
    private WebView web;
    private NativeBridge bridge;
    private volatile String environment = "{}";
    private Insets systemInsets = Insets.NONE;
    private final java.util.List<android.graphics.Rect> cutouts = new java.util.ArrayList<>();
    private boolean keyboardVisible, pageReady;
    private String pickerId, pickerOperation;
    private JSONObject pickerData;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= 29) { getWindow().setNavigationBarContrastEnforced(false); getWindow().setStatusBarContrastEnforced(false); }
        root = new FrameLayout(this); root.setBackgroundColor(Color.rgb(238, 243, 239));
        setContentView(root);
        try { bridge = new NativeBridge(this, capability); }
        catch (Exception error) { new AlertDialog.Builder(this).setTitle("无法读取文稿").setMessage("内部文件已保留，请勿清除应用数据。" + NativeBridge.message(error)).setPositiveButton("关闭", (dialog, which) -> finish()).show(); return; }
        web = new WebView(this) {
            private android.view.ActionMode.Callback selectionCallback(android.view.ActionMode.Callback delegate) {
                return new android.view.ActionMode.Callback2() {
                    @Override public boolean onCreateActionMode(android.view.ActionMode mode, android.view.Menu menu) {
                        boolean created = delegate.onCreateActionMode(mode, menu); menu.clear();
                        evaluateJavascript("window.wenzhouShowSelectionMenu?.()", null); return created;
                    }
                    @Override public boolean onPrepareActionMode(android.view.ActionMode mode, android.view.Menu menu) {
                        delegate.onPrepareActionMode(mode, menu); menu.clear();
                        evaluateJavascript("window.wenzhouShowSelectionMenu?.()", null); return true;
                    }
                    @Override public boolean onActionItemClicked(android.view.ActionMode mode, android.view.MenuItem item) { return delegate.onActionItemClicked(mode, item); }
                    @Override public void onDestroyActionMode(android.view.ActionMode mode) { delegate.onDestroyActionMode(mode); }
                    @Override public void onGetContentRect(android.view.ActionMode mode, View view, android.graphics.Rect rect) {
                        if (delegate instanceof android.view.ActionMode.Callback2) ((android.view.ActionMode.Callback2) delegate).onGetContentRect(mode, view, rect);
                        else super.onGetContentRect(mode, view, rect);
                    }
                };
            }
            @Override public android.view.ActionMode startActionMode(android.view.ActionMode.Callback callback) { return super.startActionMode(selectionCallback(callback)); }
            @Override public android.view.ActionMode startActionMode(android.view.ActionMode.Callback callback, int type) { return super.startActionMode(selectionCallback(callback), type); }
        };
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false); settings.setBuiltInZoomControls(false); settings.setDisplayZoomControls(false);
        settings.setTextZoom(100); settings.setMediaPlaybackRequiresUserGesture(true);
        web.setOnGenericMotionListener((view, event) -> { float factor = TextZoom.factor(event); if (factor == 1) return false; web.evaluateJavascript("window.wenzhouNativeScale&&window.wenzhouNativeScale(" + factor + ")", null); return true; });
        web.setBackgroundColor(Color.rgb(238, 243, 239));
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.addJavascriptInterface(bridge, "WenzhouAndroid");
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "wenzhou-project.local".equals(uri.getHost())) return bridge.projects.resource(request);
                if ("https".equals(uri.getScheme()) && "wenzhou-preview.local".equals(uri.getHost()) && !request.isForMainFrame()) return embeddedHtml(uri);
                if (ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) {
                    if (uri.getPath().startsWith("/imports/")) return bridge.imports.resource(request);
                    if (request.isForMainFrame() && PAGE.equals(uri.toString())) {
                        try { return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(editorPage())); }
                        catch (IOException error) { return blocked(); }
                    }
                    WebResourceResponse response = assets.shouldInterceptRequest(uri);
                    if (response != null && uri.getPath().endsWith(".wasm")) response.setMimeType("application/wasm");
                    if (response != null && uri.getPath().endsWith(".mjs")) response.setMimeType("text/javascript");
                    return response == null ? blocked() : response;
                }
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (PAGE.equals(request.getUrl().toString())) return false;
                if (!request.isForMainFrame() && "https".equals(request.getUrl().getScheme()) && "wenzhou-preview.local".equals(request.getUrl().getHost())) return false;
                if (request.isForMainFrame() && (request.getUrl().getScheme().equals("https") || request.getUrl().getScheme().equals("http"))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) { if (PAGE.equals(url)) { pageReady = true; publishEnvironment(); } }
        });
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            systemInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            cutouts.clear();
            androidx.core.view.DisplayCutoutCompat cutout = insets.getDisplayCutout();
            if (cutout != null) cutouts.addAll(cutout.getBoundingRects());
            keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            root.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);
            publishEnvironment(); return insets;
        });
        publishEnvironment(); ViewCompat.requestApplyInsets(root);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        web.loadUrl(PAGE);
        android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
        if (provider != null) {
            try {
                if (Integer.parseInt(provider.versionName.split("\\.")[0]) < 105) new AlertDialog.Builder(this).setTitle("请更新系统 WebView").setMessage("文舟需要 Chromium 105 或更新版本的 Android System WebView。").setPositiveButton("确定", (dialog, which) -> {}).show();
            } catch (NumberFormatException ignored) { }
        }
    }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private WebResourceResponse embeddedHtml(Uri uri) {
        try {
            String path=uri.getPath().substring(1);
            PreviewResource resource=bridge.files.readPreviewResource(path,"true".equals(uri.getQueryParameter("html")));
            byte[] bytes=resource.bytes;
            if ("text/html".equals(resource.mime)) {
                int size=16;try{size=Math.max(10,Math.min(40,Integer.parseInt(uri.getQueryParameter("fontSize"))));}catch(Exception ignored){}
                String theme="true".equals(uri.getQueryParameter("dark"))?"dark":"light";
                String defaults="<style>html{color-scheme:"+theme+"}body{font-family:system-ui,sans-serif;font-size:"+size+"px;overflow-wrap:anywhere}</style>";
                String html=new String(bytes,StandardCharsets.UTF_8);
                if(java.util.regex.Pattern.compile("(?i)<head\\b[^>]*>").matcher(html).find()) html=html.replaceFirst("(?i)(<head\\b[^>]*>)","$1"+defaults);
                else html=defaults+html;
                bytes=html.getBytes(StandardCharsets.UTF_8);
            }
            java.util.Map<String,String> headers=new java.util.HashMap<>();
            headers.put("Cache-Control","no-store");headers.put("Access-Control-Allow-Origin","*");headers.put("X-Content-Type-Options","nosniff");
            headers.put("Content-Security-Policy","sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src data: https://wenzhou-preview.local; media-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
            return new WebResourceResponse(resource.mime,resource.mime.startsWith("text/")?"UTF-8":null,200,"OK",headers,new ByteArrayInputStream(bytes));
        }catch(Exception error){return blocked();}
    }
    private byte[] editorPage() throws IOException {
        String html;
        try (InputStream input = getAssets().open("web/index.html")) { html = new String(NativeBridge.readStream(input, 1024 * 1024), StandardCharsets.UTF_8); }
        String script = "(()=>{if(window.top!==window)return;const secret=" + JSONObject.quote(capability) + ";const pending=new Map();"
            + "window.wenzhouAndroidResolve=(id,raw)=>{const task=pending.get(id);if(task){clearTimeout(task.timer);pending.delete(id);task.resolve(raw);}};"
            + "window.WenzhouNative={platform:'android',readEnvironment:()=>WenzhouAndroid.readEnvironment(secret),readWorkspace:()=>WenzhouAndroid.readWorkspace(secret),"
            + "writeWorkspace:data=>WenzhouAndroid.writeWorkspace(secret,data),readPlugins:()=>WenzhouAndroid.readPlugins(secret),writePlugins:data=>WenzhouAndroid.writePlugins(secret,data),"
            + "call:(op,json)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(new Error('设备操作超时，请重试。'));},(['import','export','exportPdf','importPlugin'].includes(op)||(op==='project'&&['pick','deliver','exportFile'].includes(JSON.parse(json).action)))?600000:120000);"
            + "pending.set(id,{resolve,reject,timer});try{WenzhouAndroid.post(secret,id,op,json);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}})};})();";
        html = html.replace("script-src 'self' blob:", "script-src 'self' blob: 'nonce-" + capability + "'");
        html = html.replace("<script src=\"./licenses.js\">", "<script nonce=\"" + capability + "\">" + script + "</script><script src=\"./licenses.js\">");
        return html.getBytes(StandardCharsets.UTF_8);
    }
    String environment() { return environment; }
    private void publishEnvironment() {
        float density = getResources().getDisplayMetrics().density;
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        org.json.JSONArray cutoutRects = new org.json.JSONArray();
        try {
            for (android.graphics.Rect rect : cutouts) cutoutRects.put(new JSONObject()
                .put("left", rect.left / density).put("top", rect.top / density)
                .put("right", rect.right / density).put("bottom", rect.bottom / density));
        } catch (org.json.JSONException impossible) { return; }
        try { environment = new JSONObject().put("platform", "android").put("credentialStore", "Android Keystore")
            .put("cutouts", cutoutRects)
            .put("dark", dark).put("top", systemInsets.top / density).put("bottom", keyboardVisible ? 0 : systemInsets.bottom / density)
            .put("left", systemInsets.left / density).put("right", systemInsets.right / density).toString(); }
        catch (Exception impossible) { return; }
        if (pageReady) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('wenzhouEnvironment',{detail:" + environment + "}))", null);
    }
    void appearance(boolean dark, String background) {
        runOnUiThread(() -> {
            int color = background.matches("#[0-9a-fA-F]{6}") ? Color.parseColor(background) : dark ? Color.rgb(22, 30, 26) : Color.rgb(238, 243, 239);
            root.setBackgroundColor(color); web.setBackgroundColor(color);
            androidx.core.view.WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), root);
            controller.setAppearanceLightStatusBars(!dark); controller.setAppearanceLightNavigationBars(!dark);
        });
    }
    void fullscreen(boolean enabled) {
        runOnUiThread(() -> {
            androidx.core.view.WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), root);
            controller.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (enabled) controller.hide(WindowInsetsCompat.Type.systemBars());
            else controller.show(WindowInsetsCompat.Type.systemBars());
            ViewCompat.requestApplyInsets(root);
        });
    }
    void deliver(String id, String response) {
        runOnUiThread(() -> { if (!isFinishing() && web != null) web.evaluateJavascript("window.wenzhouAndroidResolve&&window.wenzhouAndroidResolve(" + JSONObject.quote(id) + "," + JSONObject.quote(response) + ")", null); });
    }
    void openAuthorization() throws Exception {
        java.util.concurrent.CompletableFuture<Boolean> result = new java.util.concurrent.CompletableFuture<>();
        runOnUiThread(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/login/device"))); result.complete(true); } catch (Exception error) { result.completeExceptionally(new IOException("未找到可用浏览器。")); } });
        result.get(10, java.util.concurrent.TimeUnit.SECONDS);
    }
    void previewHtml(String path, boolean dark, JSONObject options) {
        runOnUiThread(() -> HtmlPreviewActivity.open(this, bridge.files, path, dark, options));
    }
    void pick(String id, String operation, JSONObject data) {
        runOnUiThread(() -> {
            if (pickerId != null) { deliver(id, NativeBridge.failure(new IOException("请先完成当前文件选择。"))); return; }
            try {
                Intent intent;
                if ((operation.equals("export") || (operation.equals("exportPdf") || operation.equals("exportOdt")) || operation.equals("project-export"))) {
                    String name = data.optString("name", "文稿.txt");
                    if (name.isEmpty() || name.matches("(?s).*[\\\\/\u0000-\u001f].*")) throw new IOException("文件名无效。");
                    intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(operation.equals("project-export") ? PreviewResource.mime(name) : mime(name)); intent.putExtra(Intent.EXTRA_TITLE, name);
                } else {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType(operation.equals("importPlugin") ? "application/zip" : "*/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, operation.equals("import") || operation.equals("project-pick") && data.getJSONObject("args").optBoolean("multiple"));
                    if (operation.equals("project-pick")) {
                        JSONArray accept = data.getJSONObject("args").optJSONArray("accept"); java.util.List<String> types = new java.util.ArrayList<>();
                        if (accept != null) for (int i = 0; i < accept.length(); i++) { String value = accept.getString(i), type = value.startsWith(".") ? PreviewResource.mime("asset" + value) : value; if (!type.equals("application/octet-stream") && type.contains("/")) types.add(type); }
                        if (!types.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
                    }
                }
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                pickerId = id; pickerOperation = operation; pickerData = data;
                startActivityForResult(intent, 1001);
            } catch (Exception error) { pickerId = null; pickerOperation = null; pickerData = null; deliver(id, NativeBridge.failure(error)); }
        });
    }
    private String mime(String name) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".ods") || lower.endsWith(".ots")) return "application/vnd.oasis.opendocument.spreadsheet" + (lower.endsWith(".ots") ? "-template" : "");
        if (lower.endsWith(".odp") || lower.endsWith(".otp")) return "application/vnd.oasis.opendocument.presentation" + (lower.endsWith(".otp") ? "-template" : "");
        if (lower.endsWith(".odg") || lower.endsWith(".otg")) return "application/vnd.oasis.opendocument.graphics" + (lower.endsWith(".otg") ? "-template" : "");
        if (lower.endsWith(".ott")) return "application/vnd.oasis.opendocument.text-template";
        return lower.endsWith(".odt") ? "application/vnd.oasis.opendocument.text" : lower.endsWith(".fodt") || lower.endsWith(".fods") || lower.endsWith(".fodp") || lower.endsWith(".fodg") || lower.endsWith(".velaodt") || lower.endsWith(".vodt") ? "application/xml" : lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".csv") ? "text/csv" : lower.endsWith(".html") || lower.endsWith(".htm") ? "text/html" : lower.endsWith(".md") ? "text/markdown" : "text/plain";
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 1001 || pickerId == null) return;
        String id = pickerId, operation = pickerOperation; JSONObject payload = pickerData;
        pickerId = null; pickerOperation = null; pickerData = null;
        if (result != RESULT_OK || data == null) { try { deliver(id, NativeBridge.success(operation.equals("project-pick") ? new JSONObject().put("cancelled", true).put("selections", new JSONArray()) : operation.equals("project-export") ? new JSONObject().put("saved", false) : operation.equals("import") ? new JSONArray() : false)); } catch (Exception invalid) { deliver(id, NativeBridge.failure(invalid)); } return; }
        List<Uri> uris = new ArrayList<>(); ClipData clip = data.getClipData();
        if (clip != null) for (int i = 0; i < Math.min(operation.equals("project-pick") ? 100 : 10, clip.getItemCount()); i++) uris.add(clip.getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        bridge.work(() -> {
            try {
                if (uris.isEmpty()) throw new IOException("未选择文件。");
                Object value;
                if (operation.equals("project-pick")) {
                    JSONArray selections = new JSONArray(); for (Uri uri : uris) selections.put(bridge.projects.select(payload.getString("owner"), uri, displayName(uri)));
                    value = new JSONObject().put("cancelled", false).put("selections", selections);
                } else if (operation.equals("project-export")) {
                    value = bridge.projects.deliver(payload.getString("owner"), payload.getJSONObject("args"), uris.get(0));
                } else if ((operation.equals("export") || (operation.equals("exportPdf") || operation.equals("exportOdt")))) {
                    try (OutputStream stream = getContentResolver().openOutputStream(uris.get(0), "wt")) {
                        if (stream == null) throw new IOException("无法写入所选文件。");
                        byte[] output = (operation.equals("exportPdf") || operation.equals("exportOdt")) ? android.util.Base64.decode(payload.optString("data"), android.util.Base64.DEFAULT) : payload.optString("text").getBytes(StandardCharsets.UTF_8);
                        if ((operation.equals("exportPdf") || operation.equals("exportOdt")) && (output.length < 5 || output.length > 32 * 1024 * 1024 || (operation.equals("exportPdf") ? !new String(output, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-") : output[0] != 0x50 || output[1] != 0x4b))) throw new IOException("导出文档无效或超过 32 MB。");
                        stream.write(output); stream.flush();
                    }
                    value = true;
                } else if (operation.equals("importPlugin")) value = bridge.imports.stage(getContentResolver().openInputStream(uris.get(0)), displayName(uris.get(0)));
                else {
                    JSONArray files = new JSONArray();
                    for (Uri uri : uris) {
                        byte[] bytes = documentBytes(uri); JSONObject file = new JSONObject().put("name", displayName(uri));
                        try { file.put("text", FileText.decode(bytes)); }
                        catch (IOException binary) { file.put("data", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)); }
                        files.put(file);
                    }
                    value = files;
                }
                deliver(id, NativeBridge.success(value));
            } catch (Exception error) { deliver(id, NativeBridge.failure(error)); }
        });
    }
    private byte[] documentBytes(Uri uri) throws IOException { return documentBytes(uri, FileText.MAX_BYTES); }
    private byte[] documentBytes(Uri uri, int limit) throws IOException {
        try (InputStream stream = getContentResolver().openInputStream(uri)) { if (stream == null) throw new IOException("无法读取所选文件。"); return NativeBridge.readStream(stream, limit); }
    }
    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) { if (cursor != null && cursor.moveToFirst()) return cursor.getString(0); }
        catch (Exception ignored) { }
        return "导入文稿.txt";
    }
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(()=>{const d=document.querySelector('#dialog');if(d?.open){document.querySelector('#dialog-cancel')?.click();return 'handled';}if(window.wenzhouBack?.())return 'handled';const git=document.querySelector('#github-view');if(git&&!git.hidden){document.querySelector('[data-view=write]')?.click();return 'handled';}return window.wenzhouSave&&window.wenzhouSave()?'exit':'keep';})()", result -> { if ("\"exit\"".equals(result)) finish(); });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); publishEnvironment(); ViewCompat.requestApplyInsets(root); }
    @Override protected void onPause() { if (web != null && pageReady) web.evaluateJavascript("window.wenzhouSave&&window.wenzhouSave()", null); super.onPause(); }
    @Override protected void onDestroy() { if (web != null) { web.removeJavascriptInterface("WenzhouAndroid"); root.removeView(web); web.destroy(); } if (bridge != null) bridge.close(); super.onDestroy(); }
}
