package com.barzandh.vidvault;

import android.content.Context;
import android.net.Uri;
import android.text.Html;
import android.webkit.CookieManager;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads a link: which video it is and every format/resolution the site offers. */
final class Extract {
    static final String UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
    private static final String[] FORMAT_KEYS = {"format_id", "ext", "height", "width", "fps", "vcodec", "acodec", "filesize",
            "filesize_approx", "tbr", "abr", "format_note", "protocol", "dynamic_range", "resolution"};

    static boolean isThreads(String url) {
        try { String h = Uri.parse(url).getHost(); return h != null && h.matches("(?i)(.*\\.)?(threads\\.(net|com)|snapchat\\.com)"); } catch (Exception e) { return false; }
    }

    static JSONObject info(Context c, String url, String proxy) throws Exception {
        try {
            App.ensureEngine(c);
            YoutubeDLRequest r = new YoutubeDLRequest(url);
            r.addOption("--dump-single-json");
            r.addOption("--skip-download");
            r.addOption("--no-playlist");
            r.addOption("--no-warnings");
            r.addOption("--socket-timeout", "30");
            if (proxy != null && !proxy.isEmpty()) r.addOption("--proxy", proxy);
            File ck = cookiesFor(c, url, "info");
            if (ck != null) r.addOption("--cookies", ck.getAbsolutePath());
            YoutubeDLResponse resp = YoutubeDL.getInstance().execute(r, null, null);
            if (ck != null) ck.delete();
            JSONObject info = new JSONObject(resp.getOut());
            JSONArray entries = info.optJSONArray("entries");
            if (entries != null && entries.length() > 0) {
                JSONObject first = entries.optJSONObject(0);
                JSONObject res = slim(first != null ? first : info);
                res.put("title", info.optString("title", res.optString("title")));
                res.put("webpage_url", info.optString("webpage_url", url));
                if (info.has("uploader")) res.put("uploader", info.optString("uploader"));
                if (entries.length() > 1) {
                    JSONArray es = new JSONArray();
                    for (int i = 0; i < entries.length() && i < 60; i++) if (entries.optJSONObject(i) != null) es.put(slim(entries.optJSONObject(i)));
                    res.put("entries", es);
                }
                return res;
            }
            return slim(info);
        } catch (Throwable e) {
            if (isThreads(url)) return threadsInfo(url);
            throw new Exception(clean(e.getMessage()));
        }
    }

    static String clean(String s) {
        if (s == null) return "Unknown error";
        s = s.replaceAll("\u001B\\[[0-9;]*m", "");
        StringBuilder out = new StringBuilder();
        for (String line : s.split("\n")) if (line.startsWith("ERROR:")) out.append(line.substring(6).trim()).append('\n');
        String r = out.length() > 0 ? out.toString().trim() : s.trim();
        return r.length() > 600 ? r.substring(0, 600) : r;
    }

    static JSONObject slim(JSONObject info) throws Exception {
        JSONObject o = new JSONObject();
        for (String k : new String[]{"id", "title", "thumbnail", "duration", "uploader", "channel", "extractor_key", "webpage_url"})
            if (info.has(k) && !info.isNull(k)) o.put(k, info.get(k));
        JSONArray fs = info.optJSONArray("formats"), out = new JSONArray();
        if (fs != null) {
            for (int i = 0; i < fs.length(); i++) {
                JSONObject f = fs.optJSONObject(i);
                if (f == null || "mhtml".equals(f.optString("protocol"))) continue;
                JSONObject s = new JSONObject();
                for (String k : FORMAT_KEYS) if (f.has(k) && !f.isNull(k)) s.put(k, f.get(k));
                out.put(s);
            }
        } else if (info.has("url")) {
            JSONObject s = new JSONObject();
            for (String k : FORMAT_KEYS) if (info.has(k) && !info.isNull(k)) s.put(k, info.get(k));
            out.put(s);
        }
        o.put("formats", out);
        if (!o.has("thumbnail")) {
            JSONArray th = info.optJSONArray("thumbnails");
            if (th != null && th.length() > 0) o.put("thumbnail", th.optJSONObject(th.length() - 1).optString("url"));
        }
        return o;
    }

    /** Netscape cookie file built from the in-app browser, so posts you can see while signed in can be saved. */
    static File cookiesFor(Context c, String url, String tag) {
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return null;
            String[] parts = host.split("\\.");
            String base = parts.length >= 2 ? parts[parts.length - 2] + "." + parts[parts.length - 1] : host;
            CookieManager cm = CookieManager.getInstance();
            String raw = cm.getCookie("https://www." + base + "/");
            if (raw == null || raw.isEmpty()) raw = cm.getCookie("https://" + host + "/");
            if (raw == null || raw.isEmpty()) return null;
            long exp = System.currentTimeMillis() / 1000 + 365L * 86400;
            StringBuilder sb = new StringBuilder("# Netscape HTTP Cookie File\n");
            for (String kv : raw.split(";")) {
                int eq = kv.indexOf('=');
                if (eq <= 0) continue;
                sb.append('.').append(base).append("\tTRUE\t/\tTRUE\t").append(exp).append('\t')
                        .append(kv.substring(0, eq).trim()).append('\t').append(kv.substring(eq + 1).trim()).append('\n');
            }
            File f = new File(c.getCacheDir(), "cookies-" + tag + "-" + System.nanoTime() + ".txt");
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(sb.toString().getBytes(StandardCharsets.UTF_8)); }
            return f;
        } catch (Throwable e) {
            return null;
        }
    }

    // ---------------- Threads (read the post page directly) ----------------
    static String fetchText(String url, String ua) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setRequestProperty("User-Agent", ua);
        h.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        String ck = CookieManager.getInstance().getCookie(url);
        if (ck != null) h.setRequestProperty("Cookie", ck);
        h.setConnectTimeout(20000);
        h.setReadTimeout(30000);
        try (InputStream in = h.getInputStream()) {
            return new String(Library.readAll(in), StandardCharsets.UTF_8);
        } finally { h.disconnect(); }
    }

    static List<List<String>> threadsVideos(String url, JSONObject meta) {
        String text = "";
        for (String ua : new String[]{UA, "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}) {
            try { text = fetchText(url, ua); if (text.contains("video_versions") || text.contains("og:video")) break; } catch (Exception ignored) {}
        }
        List<List<String>> videos = new ArrayList<>();
        Matcher m = Pattern.compile("\"video_versions\"\\s*:\\s*(\\[[^\\]]*\\])").matcher(text);
        while (m.find()) {
            try {
                JSONArray a = new JSONArray(m.group(1));
                List<String> urls = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    String u = a.optJSONObject(i) == null ? null : a.optJSONObject(i).optString("url", null);
                    if (u != null && !urls.contains(u)) urls.add(u);
                }
                if (!urls.isEmpty() && !videos.contains(urls)) videos.add(urls);
            } catch (Exception ignored) {}
        }
        Matcher cu = Pattern.compile("\"contentUrl\"\\s*:\\s*\"([^\"]+)\"").matcher(text);   // Snapchat
        while (cu.find()) {
            String u = cu.group(1).replace("\\u002F", "/").replace("\\/", "/");
            if (u.startsWith("http")) { List<String> one = new ArrayList<>(); one.add(u); if (!videos.contains(one)) videos.add(one); }
        }
        if (videos.isEmpty()) {
            Matcher og = Pattern.compile("<meta[^>]+property=\"og:video(?::secure_url)?\"[^>]+content=\"([^\"]+)\"").matcher(text);
            while (og.find()) { List<String> one = new ArrayList<>(); one.add(unescape(og.group(1))); if (!videos.contains(one)) videos.add(one); }
        }
        if (meta != null) {
            for (String p : new String[]{"og:title", "og:description", "og:image"}) {
                Matcher mm = Pattern.compile("<meta[^>]+property=\"" + p + "\"[^>]+content=\"([^\"]*)\"").matcher(text);
                if (mm.find()) try { meta.put(p, unescape(mm.group(1))); } catch (Exception ignored) {}
            }
        }
        return videos;
    }

    @SuppressWarnings("deprecation")
    static String unescape(String s) { return Html.fromHtml(s).toString(); }

    static JSONObject threadsInfo(String url) throws Exception {
        JSONObject meta = new JSONObject();
        List<List<String>> vids = threadsVideos(url, meta);
        if (vids.isEmpty()) throw new Exception("No video found in this post (it may be private or a photo post).");
        String title = meta.optString("og:description", meta.optString("og:title", "Video")).trim();
        if (title.length() > 120) title = title.substring(0, 120);
        JSONArray entries = new JSONArray();
        for (int i = 0; i < vids.size(); i++) {
            JSONObject e = new JSONObject();
            e.put("title", title);
            e.put("thumbnail", meta.optString("og:image", ""));
            JSONArray fs = new JSONArray();
            fs.put(new JSONObject().put("format_id", "tv" + i + "_0").put("ext", "mp4").put("format_note", "Video"));
            e.put("formats", fs);
            entries.put(e);
        }
        JSONObject res = new JSONObject(entries.getJSONObject(0).toString());
        res.put("webpage_url", url);
        res.put("uploader", meta.optString("og:title", ""));
        res.put("extractor_key", "Threads");
        if (vids.size() > 1) res.put("entries", entries);
        return res;
    }

    static String threadsVideoUrl(String url, String format, int item) throws Exception {
        List<List<String>> vids = threadsVideos(url, null);
        if (vids.isEmpty()) throw new Exception("No video found in this Threads post");
        int i = Math.max(0, item - 1);
        Matcher m = Pattern.compile("tv(\\d+)_").matcher(format == null ? "" : format);
        if (m.find()) i = Integer.parseInt(m.group(1));
        return vids.get(Math.min(i, vids.size() - 1)).get(0);
    }
}
