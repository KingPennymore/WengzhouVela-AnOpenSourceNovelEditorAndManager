package me.wenzhou.write;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ScaleGestureDetector;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.HorizontalScrollView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

/** User HTML runs in a separate WebView with no writing, file-management or credential bridge. */
public final class HtmlPreviewActivity extends Activity {
    private static final String HOST = "wenzhou-preview.local";
    private static WorkspaceFiles activeWorkspace;
    static void open(Activity activity, WorkspaceFiles workspace, String path, boolean dark, JSONObject options) {
        activeWorkspace = workspace;
        activity.startActivity(new Intent(activity, HtmlPreviewActivity.class).putExtra("path", path).putExtra("dark", dark).putExtra("reading", options.optBoolean("reading")).putExtra("pages", "pages".equals(options.optString("readingMode"))).putExtra("en", "en".equals(options.optString("language"))).putExtra("layout",options.optJSONObject("layout")==null?"{}":options.optJSONObject("layout").toString()).putExtra("fontSize", options.optInt("fontSize", 16)));
    }
    private WebView web;
    private WorkspaceFiles files;
    private boolean network, scripts, reading, pages, english;
    private int textZoom = 100;
    private String page, path;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        reading=getIntent().getBooleanExtra("reading",false);pages=getIntent().getBooleanExtra("pages",false);english=getIntent().getBooleanExtra("en",false);textZoom=Math.max(50,Math.min(300,Math.round(getIntent().getIntExtra("fontSize",16)*100f/16)));
        boolean dark = getIntent().getBooleanExtra("dark", false);
        int background = dark ? Color.rgb(22,30,26) : Color.rgb(238,243,239);
        int foreground = dark ? Color.rgb(226,235,229) : Color.rgb(26,43,32);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(background); setContentView(root);
        if (reading) {
            androidx.core.view.WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),root);
            controller.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            root.setPadding(safe.left, safe.top, safe.right, safe.bottom); return insets;
        });
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(!dark);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(!dark);
        path = getIntent().getStringExtra("path");
        if (path == null) { finish(); return; }
        try { files = activeWorkspace != null ? activeWorkspace : new WorkspaceFiles(this); files.readPreviewResource(path, true); }
        catch (Exception error) { finish(); return; }
        page = new Uri.Builder().scheme("https").authority(HOST).path("/" + path).build().toString();
        TextView title = new TextView(this); title.setText("HTML · " + path); title.setTextColor(foreground); title.setTextSize(16); title.setPadding(16,8,16,4); title.setMaxLines(1); title.setEllipsize(android.text.TextUtils.TruncateAt.END); root.addView(title);
        HorizontalScrollView scroll = new HorizontalScrollView(this); LinearLayout toolbar = new LinearLayout(this); scroll.addView(toolbar); root.addView(scroll);
        Button back = button(toolbar, reading ? (english?"Library":"返回阅读") : (english?"Back to editor":"返回编辑"), foreground); back.setOnClickListener(view -> finish());
        Button reload = button(toolbar, english?"Refresh":"刷新", foreground); reload.setOnClickListener(view -> reload());
        Button script = button(toolbar, english?"Scripts: off":"脚本：关", foreground); script.setOnClickListener(view -> { scripts = !scripts; script.setText(english ? (scripts?"Scripts: on":"Scripts: off") : (scripts ? "脚本：开" : "脚本：关")); web.getSettings().setJavaScriptEnabled(scripts); reload(); });
        Button net = button(toolbar, english?"Network: off":"联网：关", foreground); net.setOnClickListener(view -> { network = !network; net.setText(english ? (network?"Network: on":"Network: off") : (network ? "联网：开" : "联网：关")); reload(); });
        if(reading){reload.setVisibility(android.view.View.GONE);script.setVisibility(android.view.View.GONE);net.setVisibility(android.view.View.GONE);title.setVisibility(android.view.View.GONE);scroll.setVisibility(android.view.View.GONE);}
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); web.setBackgroundColor(Color.WHITE);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(reading); settings.setDomStorageEnabled(reading);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(reading ? 100 : textZoom); settings.setSupportZoom(false); settings.setBuiltInZoomControls(false); settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (reading && "wenzhou-reader.local".equals(uri.getHost()) && "/reader.js".equals(uri.getPath())) {
                    try { return new WebResourceResponse("text/javascript", "UTF-8", getAssets().open("web/html-reader.js")); } catch (Exception error) { return blocked(); }
                }
                if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) {
                    try {
                        String resourcePath = uri.getPath().substring(1);
                        PreviewResource resource = files.readPreviewResource(resourcePath, resourcePath.equals(path));
                        byte[] bytes=resource.bytes;
                        if(reading&&resourcePath.equals(path)){String html=new String(bytes,StandardCharsets.UTF_8).replaceAll("(?i)\\scontenteditable(?:\\s*=\\s*(?:[\"'][^\"']*[\"']|[^\\s>]+))?", "").replaceAll("(?i)<(input|textarea|select|button)(?=[\\s>])", "<$1 disabled readonly");String config=new JSONObject().put("path",path).put("english",english).put("dark",dark).put("pages",pages).put("fontSize",getIntent().getIntExtra("fontSize",16)).put("layout",new JSONObject(getIntent().getStringExtra("layout")==null?"{}":getIntent().getStringExtra("layout"))).toString();
                        html=html.replaceAll("(?is)<meta[^>]*http-equiv\\s*=\\s*['\"]?Content-Security-Policy[^>]*>", "");
                        html += "<script src=\"https://wenzhou-reader.local/reader.js?config=" + Uri.encode(config) + "\"></script>";
                        bytes=html.getBytes(StandardCharsets.UTF_8);}
                        return new WebResourceResponse(resource.mime, resource.mime.startsWith("text/") ? "UTF-8" : null, 200, "OK", previewHeaders(), new ByteArrayInputStream(bytes));
                    } catch (Exception error) { return blocked(); }
                }
                return network && "https".equals(uri.getScheme()) ? null : blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (reading && "https://wenzhou-reader.local/back".equals(uri.toString())) { finish(); return true; }
                if (reading) return !page.equals(uri.toString());
                if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
                if (network && request.isForMainFrame() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        ScaleGestureDetector zoom = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            private float size;
            @Override public boolean onScaleBegin(ScaleGestureDetector detector) { size = textZoom; return true; }
            @Override public boolean onScale(ScaleGestureDetector detector) { size = Math.max(50, Math.min(300, size * detector.getScaleFactor())); textZoom = Math.round(size); applyTextZoom(); return true; }
        });
        web.setOnGenericMotionListener((view,event)->{float factor=TextZoom.factor(event);if(factor==1)return false;textZoom=Math.round(Math.max(50,Math.min(300,textZoom*factor)));applyTextZoom();return true;});
        web.setOnTouchListener((view, event) -> { zoom.onTouchEvent(event); return event.getPointerCount() > 1; });
        ViewCompat.requestApplyInsets(root); web.loadUrl(page);
    }
    private java.util.Map<String,String> previewHeaders() { java.util.Map<String,String> headers=new java.util.HashMap<>();headers.put("Cache-Control","no-store");if(reading)headers.put("Content-Security-Policy","default-src 'none'; script-src https://wenzhou-reader.local; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");return headers; }
    private void applyTextZoom() { if(reading) web.evaluateJavascript("window.velaHtmlReaderZoom&&window.velaHtmlReaderZoom("+textZoom+")",null); else web.getSettings().setTextZoom(textZoom); }
    private Button button(LinearLayout toolbar, String label, int color) {
        Button button = new Button(this); button.setText(label); button.setTextSize(13); button.setTextColor(color); button.setAllCaps(false); toolbar.addView(button); return button;
    }
    private void reload() { web.clearCache(true); web.loadUrl(page); }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    @Override protected void onDestroy() { if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
