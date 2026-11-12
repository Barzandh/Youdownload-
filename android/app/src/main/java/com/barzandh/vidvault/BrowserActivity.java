package com.barzandh.vidvault;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.Locale;

/** The in-app browser: browse YouTube, Instagram, Facebook, X, TikTok, Threads… and tap Download on any video page. */
public class BrowserActivity extends Activity {
    static volatile boolean clearRequested;
    private static final String[] ADS = {"doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
            "google-analytics.com", "googletagservices.com", "adnxs.com", "taboola.com", "outbrain.com", "criteo.com", "criteo.net",
            "pubmatic.com", "rubiconproject.com", "amazon-adsystem.com", "scorecardresearch.com", "moatads.com", "zedo.com",
            "popads.net", "propellerads.com", "adsterra.com", "exoclick.com", "mgid.com", "revcontent.com", "yieldmo.com",
            "openx.net", "casalemedia.com", "smartadserver.com", "adform.net", "bidswitch.net", "33across.com", "media.net",
            "onclickads.net", "popcash.net", "hilltopads.net", "adcash.com", "trafficjunky.net", "juicyads.com", "ads-twitter.com",
            "ads.yahoo.com", "advertising.com", "quantserve.com", "teads.tv", "sharethrough.com", "inmobi.com", "applovin.com", "unityads.unity3d.com"};

    private WebView web;
    private EditText address;
    private ProgressBar bar;
    private TextView backB, fwdB;
    private boolean adblock = true;
    private int accent = Color.rgb(10, 132, 255);

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String acc = App.prefs.optString("accent", "blue");
        if (acc.equals("pink")) accent = Color.rgb(255, 55, 95);
        else if (acc.equals("cyan")) accent = Color.rgb(50, 173, 230);
        else if (acc.equals("green")) accent = Color.rgb(48, 177, 88);
        else if (acc.equals("orange")) accent = Color.rgb(255, 149, 0);
        else if (acc.equals("purple")) accent = Color.rgb(175, 82, 222);
        boolean ar = "ar".equals(App.prefs.optString("lang"));

        int bg = Color.rgb(22, 22, 24), field = Color.rgb(44, 44, 46);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bg);

        // top: close · address · reload
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(6), dp(6), dp(6), dp(6));
        TextView close = icon("✕", 20);
        close.setOnClickListener(v -> goMain());
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.rgb(142, 142, 147));
        address.setHint(ar ? "ابحث أو أدخل اسم الموقع" : "Search or enter website name");
        address.setTextSize(15);
        address.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSelectAllOnFocus(true);
        address.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable fbg = new GradientDrawable();
        fbg.setColor(field);
        fbg.setCornerRadius(dp(10));
        address.setBackground(fbg);
        address.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                go(address.getText().toString());
                return true;
            }
            return false;
        });
        TextView reload = icon("⟳", 22);
        reload.setOnClickListener(v -> web.reload());
        top.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        top.addView(address, new LinearLayout.LayoutParams(0, dp(42), 1));
        top.addView(reload, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(top);

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        // page + floating download button
        FrameLayout frame = new FrameLayout(this);
        web = new WebView(this);
        frame.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        TextView fab = new TextView(this);
        fab.setText(ar ? "⬇  تنزيل" : "⬇  Download");
        fab.setTextColor(Color.WHITE);
        fab.setTextSize(16);
        fab.setTypeface(fab.getTypeface(), android.graphics.Typeface.BOLD);
        fab.setGravity(Gravity.CENTER);
        fab.setPadding(dp(20), 0, dp(20), 0);
        GradientDrawable fabBg = new GradientDrawable();
        fabBg.setColor(accent);
        fabBg.setCornerRadius(dp(26));
        fab.setBackground(fabBg);
        fab.setElevation(dp(8));
        fab.setOnClickListener(v -> downloadThisPage());
        FrameLayout.LayoutParams fl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(52), Gravity.BOTTOM | Gravity.END);
        fl.setMargins(dp(16), dp(16), dp(16), dp(18));
        frame.addView(fab, fl);
        root.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        // bottom toolbar
        LinearLayout tb = new LinearLayout(this);
        tb.setGravity(Gravity.CENTER_VERTICAL);
        tb.setBackgroundColor(bg);
        backB = icon("‹", 32);
        fwdB = icon("›", 32);
        TextView share = icon("⇪", 22), star = icon("☆", 22), home = icon("⌂", 24);
        backB.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });
        fwdB.setOnClickListener(v -> { if (web.canGoForward()) web.goForward(); });
        share.setOnClickListener(v -> startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, web.getUrl()), "Share")));
        star.setOnClickListener(v -> {
            try {
                MainActivity.sendEvent("bookmark", new JSONObject().put("url", web.getUrl()).put("title", web.getTitle()).toString());
                android.widget.Toast.makeText(this, ar ? "أُضيف إلى الإشارات المرجعية" : "Bookmarked", android.widget.Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {}
        });
        home.setOnClickListener(v -> goMain());
        for (TextView t : new TextView[]{backB, fwdB, share, star, home}) tb.addView(t, new LinearLayout.LayoutParams(0, dp(50), 1));
        root.addView(tb);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        applyOpts(getIntent());
        load(getIntent().getStringExtra("url"));
    }

    private TextView icon(String glyph, int size) {
        TextView t = new TextView(this);
        t.setText(glyph);
        t.setTextSize(size);
        t.setTextColor(accent);
        t.setGravity(Gravity.CENTER);
        t.setBackground(null);
        return t;
    }

    private void applyOpts(Intent i) {
        try {
            JSONObject o = new JSONObject(i.getStringExtra("opts") == null ? "{}" : i.getStringExtra("opts"));
            adblock = o.optBoolean("adblock", true);
            String ua = o.optString("ua", "default");
            WebSettings s = web.getSettings();
            String def = WebSettings.getDefaultUserAgent(this);
            switch (ua) {
                case "desktop": s.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"); break;
                case "iphone": s.setUserAgentString("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"); break;
                case "android": s.setUserAgentString(Extract.UA); break;
                default: s.setUserAgentString(def.replace("; wv)", ")"));
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyOpts(intent);
        String u = intent.getStringExtra("url");
        if (u != null && !u.equals(web.getUrl())) load(u);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (clearRequested) { clearRequested = false; web.clearHistory(); web.clearCache(true); }
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }

    private void load(String u) { if (u != null && !u.isEmpty()) web.loadUrl(u); }

    private void go(String input) {
        String s = input.trim();
        if (s.isEmpty()) return;
        String url;
        if (s.matches("(?i)^https?://.*")) url = s;
        else if (!s.contains(" ") && s.matches("(?i)^[a-z0-9.-]+\\.[a-z]{2,}(/.*)?$")) url = "https://" + s;
        else {
            String eng = App.prefs.optString("search", "google");
            String base = eng.equals("bing") ? "https://www.bing.com/search?q=" : eng.equals("duckduckgo") ? "https://duckduckgo.com/?q="
                    : eng.equals("yahoo") ? "https://search.yahoo.com/search?p=" : eng.equals("yandex") ? "https://yandex.com/search/?text=" : "https://www.google.com/search?q=";
            url = base + Uri.encode(s);
        }
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(), 0);
        address.clearFocus();
        web.loadUrl(url);
    }

    private void downloadThisPage() {
        String u = web.getUrl();
        if (u == null || !u.startsWith("http")) return;
        try {
            String data = new JSONObject().put("url", u).put("title", web.getTitle() == null ? "" : web.getTitle()).toString();
            Intent i = new Intent(this, MainActivity.class).putExtra("event", "download").putExtra("data", data)
                    .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private void goMain() {
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (custom != null) { hideCustom(); return; }
        if (web.canGoBack()) web.goBack(); else goMain();
    }

    private void updateNav() {
        backB.setAlpha(web.canGoBack() ? 1f : .35f);
        fwdB.setAlpha(web.canGoForward() ? 1f : .35f);
    }

    private static boolean isAd(String host) {
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        for (String a : ADS) if (host.equals(a) || host.endsWith("." + a)) return true;
        return false;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String scheme = req.getUrl().getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) return false;
            if ("intent".equals(scheme)) {
                String fb = req.getUrl().toString();
                int i = fb.indexOf("S.browser_fallback_url=");
                if (i > 0) {
                    String f = fb.substring(i + 23);
                    int end = f.indexOf(';');
                    if (end > 0) f = f.substring(0, end);
                    view.loadUrl(Uri.decode(f));
                }
            }
            return true; // stay in VidVault instead of jumping to the YouTube/Instagram apps
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            if (adblock && isAd(req.getUrl().getHost()))
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            return null;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (!address.hasFocus()) address.setText(url);
            bar.setVisibility(View.VISIBLE);
            updateNav();
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (!address.hasFocus()) address.setText(url);
            updateNav();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            bar.setVisibility(View.INVISIBLE);
            updateNav();
            try { MainActivity.sendEvent("visit", new JSONObject().put("url", url).put("title", view.getTitle()).toString()); } catch (Exception ignored) {}
        }
    }

    // full-screen video inside the browser
    private View custom;
    private WebChromeClient.CustomViewCallback customCb;

    private void hideCustom() {
        if (custom == null) return;
        ((FrameLayout) getWindow().getDecorView()).removeView(custom);
        custom = null;
        if (customCb != null) customCb.onCustomViewHidden();
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int p) { bar.setProgress(p); }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) {
            if (custom != null) { cb.onCustomViewHidden(); return; }
            custom = view;
            customCb = cb;
            view.setBackgroundColor(Color.BLACK);
            ((FrameLayout) getWindow().getDecorView()).addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }

        @Override
        public void onHideCustomView() { hideCustom(); }
    }
}
