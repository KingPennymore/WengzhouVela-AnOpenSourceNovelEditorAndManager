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

/** User HTML runs in a separate WebView with no writing, file-management or credential bridge. */
public final class HtmlPreviewActivity extends Activity {
    private static final String HOST = "wenzhou-preview.local";
    private static WorkspaceFiles activeWorkspace;
    static void open(Activity activity, WorkspaceFiles workspace, String path, boolean dark) {
        activeWorkspace = workspace;
        activity.startActivity(new Intent(activity, HtmlPreviewActivity.class).putExtra("path", path).putExtra("dark", dark));
    }
    private WebView web;
    private WorkspaceFiles files;
    private boolean network, scripts;
    private int textZoom = 100;
    private String page, path;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        boolean dark = getIntent().getBooleanExtra("dark", false);
        int background = dark ? Color.rgb(22,30,26) : Color.rgb(238,243,239);
        int foreground = dark ? Color.rgb(226,235,229) : Color.rgb(26,43,32);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(background); setContentView(root);
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
        Button back = button(toolbar, "返回编辑", foreground); back.setOnClickListener(view -> finish());
        Button reload = button(toolbar, "刷新", foreground); reload.setOnClickListener(view -> reload());
        Button script = button(toolbar, "脚本：关", foreground); script.setOnClickListener(view -> { scripts = !scripts; script.setText(scripts ? "脚本：开" : "脚本：关"); web.getSettings().setJavaScriptEnabled(scripts); reload(); });
        Button net = button(toolbar, "联网：关", foreground); net.setOnClickListener(view -> { network = !network; net.setText(network ? "联网：开" : "联网：关"); reload(); });
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); web.setBackgroundColor(Color.WHITE);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(false); settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false); settings.setBuiltInZoomControls(false); settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) {
                    try {
                        String resourcePath = uri.getPath().substring(1);
                        PreviewResource resource = files.readPreviewResource(resourcePath, resourcePath.equals(path));
                        return new WebResourceResponse(resource.mime, resource.mime.startsWith("text/") ? "UTF-8" : null, 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(resource.bytes));
                    } catch (Exception error) { return blocked(); }
                }
                return network && "https".equals(uri.getScheme()) ? null : blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
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
            @Override public boolean onScale(ScaleGestureDetector detector) { size = Math.max(50, Math.min(300, size * detector.getScaleFactor())); textZoom = Math.round(size); web.getSettings().setTextZoom(textZoom); return true; }
        });
        web.setOnTouchListener((view, event) -> { zoom.onTouchEvent(event); return event.getPointerCount() > 1; });
        ViewCompat.requestApplyInsets(root); web.loadUrl(page);
    }
    private Button button(LinearLayout toolbar, String label, int color) {
        Button button = new Button(this); button.setText(label); button.setTextSize(13); button.setTextColor(color); button.setAllCaps(false); toolbar.addView(button); return button;
    }
    private void reload() { web.clearCache(true); web.loadUrl(page); }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    @Override protected void onDestroy() { if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
