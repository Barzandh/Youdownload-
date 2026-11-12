package com.barzandh.vidvault;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** VidVault for Android: the interface is the same web app, packed inside the APK; downloads run on the phone. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String BASE = "https://" + HOST + "/";
    private static final int REQ_NOTIF = 21, REQ_STORAGE = 22;

    private static volatile MainActivity current;
    private WebView web;
    private boolean pageReady;
    private String pendingShared, pendingTab, notifReq;
    private LocalServer wifi;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);   // videos stream from http://127.0.0.1
        s.setUserAgentString(s.getUserAgentString() + " VidVaultAndroid/" + version());

        web.addJavascriptInterface(new Bridge(), "VVAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                String mime = mimeOf(path);
                try {
                    InputStream in = getAssets().open("www" + path);
                    WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null, in);
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) { pageReady = true; flushPending(); }
        });
        handleIntent(getIntent());
        web.loadUrl(BASE + "index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        flushPending();
    }

    @Override
    protected void onResume() { super.onResume(); current = this; }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (wifi != null) wifi.stop();
        super.onDestroy();
    }

    private void handleIntent(Intent i) {
        if (i == null) return;
        if (Intent.ACTION_SEND.equals(i.getAction())) {
            String t = i.getStringExtra(Intent.EXTRA_TEXT);
            if (t == null) t = i.getStringExtra(Intent.EXTRA_SUBJECT);
            if (t != null) pendingShared = t;
        }
        if (i.getStringExtra("tab") != null) pendingTab = i.getStringExtra("tab");
        if (i.getStringExtra("event") != null) {
            event(i.getStringExtra("event"), i.getStringExtra("data"));
        }
    }

    private void flushPending() {
        if (!pageReady) return;
        if (pendingTab != null) { js("setTab(" + JSONObject.quote(pendingTab) + ")"); pendingTab = null; }
        if (pendingShared != null) {
            try { event("shared", new JSONObject().put("text", pendingShared).toString()); } catch (Exception ignored) {}
            pendingShared = null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.VV && VV.back) ? VV.back() : false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    // ------------------------------------------------------------------ to the page
    void js(final String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    void cb(String id, boolean ok, String payload) {
        js("VV.cb(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(payload == null ? "" : payload) + ")");
    }

    void event(String name, String json) {
        if (!pageReady) {
            if ("download".equals(name) || "shared".equals(name)) {
                try { pendingShared = new JSONObject(json).optString("url", new JSONObject(json).optString("text")); } catch (Exception ignored) {}
            }
            return;
        }
        js("VV.event(" + JSONObject.quote(name) + "," + JSONObject.quote(json == null ? "{}" : json) + ")");
    }

    static void sendJob(String json) {
        MainActivity a = current;
        if (a != null && a.pageReady) a.js("VV.job(" + JSONObject.quote(json) + ")");
    }

    static void sendEvent(String name, String json) {
        MainActivity a = current;
        if (a != null) a.runOnUiThread(() -> a.event(name, json));
    }

    // ------------------------------------------------------------------ helpers
    String version() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1.0"; }
    }

    static String mimeOf(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException e) { toast("No app can open this link"); }
    }

    void toast(String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_SHORT).show()); }

    Uri itemUri(JSONObject it) {
        return FileProvider.getUriForFile(this, getPackageName() + ".files", Library.file(this, it));
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (req == REQ_NOTIF && notifReq != null) { cb(notifReq, ok, ok ? "granted" : "Notifications are blocked"); notifReq = null; }
        if (req == REQ_STORAGE && ok) toast("Allowed — tap Save to Gallery again");
    }

    // ------------------------------------------------------------------ the bridge used by app.js
    class Bridge {
        @JavascriptInterface public void ready() {}

        @JavascriptInterface public String appVersion() { return version(); }

        @JavascriptInterface public String engineVersion() { return App.engineVersion(MainActivity.this); }

        @JavascriptInterface public void setPrefs(String json) { App.savePrefs(MainActivity.this, json); }

        @JavascriptInterface public void setLook(boolean dark, String accent) {
            runOnUiThread(() -> {
                Window w = getWindow();
                int bar = dark ? Color.rgb(22, 22, 24) : Color.rgb(249, 249, 249);
                w.setStatusBarColor(dark ? Color.BLACK : Color.rgb(242, 242, 247));
                w.setNavigationBarColor(bar);
                int flags = w.getDecorView().getSystemUiVisibility();
                if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) {
                    if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR; else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                w.getDecorView().setSystemUiVisibility(flags);
                web.setBackgroundColor(dark ? Color.BLACK : Color.rgb(242, 242, 247));
            });
        }

        @JavascriptInterface public void info(String id, String url, String opts) {
            new Thread(() -> {
                try {
                    String proxy = new JSONObject(opts == null ? "{}" : opts).optString("proxy", "");
                    cb(id, true, Extract.info(MainActivity.this, url, proxy).toString());
                } catch (Throwable e) {
                    cb(id, false, String.valueOf(e.getMessage()));
                }
            }, "info").start();
        }

        @JavascriptInterface public void download(String json) {
            try { DownloadService.enqueue(MainActivity.this, new JSONObject(json), false); } catch (Exception e) { toast(e.getMessage()); }
        }

        @JavascriptInterface public void downloadHttp(String json) {
            try { DownloadService.enqueue(MainActivity.this, new JSONObject(json), true); } catch (Exception e) { toast(e.getMessage()); }
        }

        @JavascriptInterface public void cancel(String id) { DownloadService.cancel(id); }

        @JavascriptInterface public String jobs() { return DownloadService.jobsJson(); }

        @JavascriptInterface public String library() { return Library.listJson(MainActivity.this); }

        @JavascriptInterface public void updateItem(String id, String patch) {
            try { Library.update(MainActivity.this, id, new JSONObject(patch)); } catch (Exception ignored) {}
        }

        @JavascriptInterface public void removeItem(String id) { Library.remove(MainActivity.this, id); }

        @JavascriptInterface public String mediaBase() { return App.media.base(); }

        @JavascriptInterface public void shareItem(String id) {
            JSONObject it = Library.find(MainActivity.this, id);
            if (it == null) return;
            runOnUiThread(() -> {
                try {
                    Uri u = itemUri(it);
                    Intent i = new Intent(Intent.ACTION_SEND).setType(Library.mime(it)).putExtra(Intent.EXTRA_STREAM, u)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    i.setClipData(ClipData.newRawUri("", u));
                    startActivity(Intent.createChooser(i, it.optString("title")));
                } catch (Exception e) { toast(e.getMessage()); }
            });
        }

        @JavascriptInterface public void openWith(String id) {
            JSONObject it = Library.find(MainActivity.this, id);
            if (it == null) return;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(itemUri(it), Library.mime(it)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, it.optString("title")));
                } catch (Exception e) { toast(e.getMessage()); }
            });
        }

        @JavascriptInterface public void saveToGallery(String id) {
            JSONObject it = Library.find(MainActivity.this, id);
            if (it == null) return;
            if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE));
                return;
            }
            new Thread(() -> {
                String err = Library.saveToGallery(MainActivity.this, it);
                boolean ar = "ar".equals(App.prefs.optString("lang"));
                toast(err == null ? (ar ? "تم الحفظ في المعرض" : "Saved to Gallery") : err);
            }).start();
        }

        @JavascriptInterface public void openBrowser(String url, String opts) {
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, BrowserActivity.class).putExtra("url", url).putExtra("opts", opts)
                        .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                startActivity(i);
            });
        }

        @JavascriptInterface public void openExternal(String url) { MainActivity.this.openExternal(url); }

        @JavascriptInterface public void shareText(String text) {
            runOnUiThread(() -> startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "VidVault")));
        }

        @JavascriptInterface public String clipboard() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                ClipData c = cm.getPrimaryClip();
                if (c != null && c.getItemCount() > 0) {
                    CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
                    return t == null ? "" : t.toString();
                }
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface public String wifiShare(boolean on) {
            if (!on) { if (wifi != null) wifi.stop(); wifi = null; return ""; }
            if (!App.onWifi(MainActivity.this)) return "";
            if (wifi == null) wifi = new LocalServer(MainActivity.this, true);
            if (!wifi.start()) return "";
            return wifi.lanAddress();
        }

        @JavascriptInterface public String wifiAddress() {
            if (wifi == null) { String a = wifiShare(true); return a; }
            return wifi.lanAddress();
        }

        @JavascriptInterface public void updateEngine(String id) {
            new Thread(() -> {
                try {
                    App.ensureEngine(MainActivity.this);
                    YoutubeDL.UpdateStatus st = YoutubeDL.getInstance().updateYoutubeDL(MainActivity.this, YoutubeDL.UpdateChannel._STABLE);
                    getSharedPreferences("vv", MODE_PRIVATE).edit().putLong("engineChecked", System.currentTimeMillis()).apply();
                    cb(id, true, new JSONObject().put("status", st == null ? "DONE" : st.name()).put("version", App.engineVersion(MainActivity.this)).toString());
                } catch (Throwable e) {
                    cb(id, false, String.valueOf(e.getMessage()));
                }
            }, "engine-update").start();
        }

        @JavascriptInterface public void requestNotifications(String id) {
            if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                cb(id, true, "granted");
                return;
            }
            notifReq = id;
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF));
        }

        @JavascriptInterface public boolean canBiometric() {
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                BiometricManager bm = getSystemService(BiometricManager.class);
                return bm != null && bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
            } catch (Throwable e) { return false; }
        }

        @JavascriptInterface public void biometric(String id, String title) {
            if (Build.VERSION.SDK_INT < 29) { cb(id, false, "unsupported"); return; }
            runOnUiThread(() -> {
                try {
                    BiometricPrompt p = new BiometricPrompt.Builder(MainActivity.this)
                            .setTitle(title == null || title.isEmpty() ? "VidVault" : title)
                            .setNegativeButton("ar".equals(App.prefs.optString("lang")) ? "استخدم الرمز" : "Use passcode", getMainExecutor(), (d, w) -> cb(id, false, "cancel"))
                            .build();
                    p.authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) { cb(id, true, "ok"); }
                        @Override public void onAuthenticationError(int code, CharSequence msg) { cb(id, false, String.valueOf(msg)); }
                    });
                } catch (Throwable e) { cb(id, false, String.valueOf(e.getMessage())); }
            });
        }

        @JavascriptInterface public void clearBrowserData() {
            runOnUiThread(() -> {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                new WebView(MainActivity.this).clearCache(true);
                BrowserActivity.clearRequested = true;
            });
        }
    }
}
