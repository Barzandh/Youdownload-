package com.barzandh.vidvault;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import kotlin.Unit;

/** Runs downloads in the background (they keep going when the app is closed) and shows progress. */
public class DownloadService extends Service {
    private static final int FG_ID = 7001;
    static final List<JSONObject> JOBS = new ArrayList<>();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(2);
    private static final Set<String> CANCELED = ConcurrentHashMap.newKeySet();
    private static final Map<String, Long> LAST_EMIT = new ConcurrentHashMap<>();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Pattern SPEED = Pattern.compile("at\\s+([\\d.]+)\\s*([KMGT]?i?B)/s");
    private static volatile DownloadService instance;
    private PowerManager.WakeLock wake;

    // ---------------------------------------------------------------- public API
    static void enqueue(Context ctx, JSONObject job, boolean fromServer) {
        final Context c = ctx.getApplicationContext();
        try { job.put("status", "queued"); job.put("progress", fromServer ? job.optDouble("startProgress", 70) : 0); } catch (Exception ignored) {}
        synchronized (JOBS) {
            for (int i = 0; i < JOBS.size(); i++) if (JOBS.get(i).optString("id").equals(job.optString("id"))) { JOBS.remove(i); break; }
            JOBS.add(0, job);
        }
        emit(job, true);
        Intent i = new Intent(c, DownloadService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        POOL.submit(() -> run(c, job, fromServer));
    }

    static void cancel(String id) {
        CANCELED.add(id);
        try { YoutubeDL.getInstance().destroyProcessById(id); } catch (Throwable ignored) {}
        JSONObject j = find(id);
        if (j != null) { set(j, "status", "canceled"); emit(j, true); }
        refresh();
    }

    static String jobsJson() {
        JSONArray a = new JSONArray();
        synchronized (JOBS) { for (JSONObject j : JOBS) a.put(j); }
        return a.toString();
    }

    static int activeCount() {
        int n = 0;
        synchronized (JOBS) { for (JSONObject j : JOBS) if (active(j)) n++; }
        return n;
    }

    // ---------------------------------------------------------------- service
    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vidvault:download");
        wake.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = progressNotification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(FG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(FG_ID, n);
        try { wake.acquire(6 * 3600 * 1000L); } catch (Exception ignored) {}
        if (activeCount() == 0) stopNow();
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        instance = null;
        try { if (wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void stopNow() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    private Notification progressNotification() {
        int n = 0; double sum = 0; String title = "VidVault";
        synchronized (JOBS) {
            for (JSONObject j : JOBS) if (active(j)) { n++; sum += j.optDouble("progress", 0); if (n == 1) title = j.optString("title", title); }
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT).putExtra("tab", "downloads");
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = App.builder(this, App.CH_PROGRESS)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(n > 1 ? ("Downloading " + n + " videos") : title)
                .setContentText(n == 0 ? "Finishing…" : Math.round(sum / Math.max(1, n)) + "%")
                .setProgress(100, (int) Math.round(sum / Math.max(1, n)), n == 0)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setContentIntent(pi);
        return b.build();
    }

    static void refresh() {
        MAIN.post(() -> {
            DownloadService s = instance;
            if (s == null) return;
            if (activeCount() == 0) s.stopNow();
            else ((NotificationManager) s.getSystemService(NOTIFICATION_SERVICE)).notify(FG_ID, s.progressNotification());
        });
    }

    // ---------------------------------------------------------------- the work
    private static void run(Context c, JSONObject job, boolean fromServer) {
        String id = job.optString("id");
        File dir = new File(c.getCacheDir(), "jobs/" + id);
        try {
            if (CANCELED.contains(id)) return;
            waitForNetwork(c, job);
            deleteTree(dir);
            dir.mkdirs();
            set(job, "status", "downloading");
            emit(job, true);
            if (fromServer) httpDownload(c, job, job.optString("fileUrl"), dir, job.optString("ext", "mp4"), 70, 100);
            else deviceDownload(c, job, dir);
            if (CANCELED.contains(id)) throw new InterruptedException();
            JSONObject item = finish(c, job, dir);
            job.put("status", "done");
            job.put("progress", 100);
            job.put("item", item);
            if (App.prefs.optBoolean("autoGallery")) Library.saveToGallery(c, item);
            notifyDone(c, job, true);
        } catch (Throwable e) {
            if (CANCELED.contains(id)) set(job, "status", "canceled");
            else {
                set(job, "status", "error");
                set(job, "error", Extract.clean(e instanceof InterruptedException ? "Interrupted" : String.valueOf(e.getMessage())));
                notifyDone(c, job, false);
            }
        } finally {
            deleteTree(dir);
            CANCELED.remove(id);
            emit(job, true);
            refresh();
        }
    }

    private static void waitForNetwork(Context c, JSONObject job) throws InterruptedException {
        boolean said = false;
        while (!CANCELED.contains(job.optString("id"))) {
            boolean ok = App.online(c) && (!App.prefs.optBoolean("wifiOnly") || App.onWifi(c));
            if (ok) return;
            if (!said) { set(job, "status", "waitingWifi"); emit(job, true); said = true; }
            Thread.sleep(5000);
        }
        throw new InterruptedException();
    }

    private static void deviceDownload(Context c, JSONObject job, File dir) throws Exception {
        String url = job.optString("url"), fmt = job.optString("format", "b"), kind = job.optString("kind", "video");
        int item = job.optInt("item", 0);
        if (Extract.isThreads(url) && fmt.startsWith("tv")) {
            httpDownload(c, job, Extract.threadsVideoUrl(url, fmt, item), dir, "mp4", 0, 100);
            return;
        }
        App.ensureEngine(c);
        YoutubeDLRequest r = new YoutubeDLRequest(url);
        r.addOption("-f", fmt);
        r.addOption("-o", new File(dir, "%(title).80B.%(ext)s").getAbsolutePath());
        if (item > 0) { r.addOption("--yes-playlist"); r.addOption("--playlist-items", String.valueOf(item)); }
        else r.addOption("--no-playlist");
        if (kind.equals("video")) r.addOption("--merge-output-format", "mp4");
        else { r.addOption("-x"); r.addOption("--audio-format", kind.equals("mp3") ? "mp3" : "m4a"); r.addOption("--audio-quality", "192K"); }
        r.addOption("--write-thumbnail");
        r.addOption("--convert-thumbnails", "jpg");
        r.addOption("--no-mtime");
        r.addOption("--restrict-filenames");
        r.addOption("--concurrent-fragments", "4");
        r.addOption("--retries", "5");
        r.addOption("--socket-timeout", "30");
        String proxy = job.optString("proxy", "");
        if (!proxy.isEmpty()) r.addOption("--proxy", proxy);
        File ck = Extract.cookiesFor(c, url, job.optString("id"));
        if (ck != null) r.addOption("--cookies", ck.getAbsolutePath());
        final boolean merge = fmt.contains("+");
        final int[] part = {1};
        final float[] last = {0};
        try {
            YoutubeDL.getInstance().execute(r, job.optString("id"), (Float p, Long eta, String line) -> {
                if (line != null && (line.contains("[Merger]") || line.contains("[ExtractAudio]") || line.contains("[VideoConvertor]"))) {
                    set(job, "status", "processing");
                    emit(job, false);
                    return Unit.INSTANCE;
                }
                if (p == null || p < 0) return Unit.INSTANCE;
                if (last[0] > 90 && p < 10) part[0]++;
                last[0] = p;
                double overall = merge ? (part[0] == 1 ? p * 0.85 : 85 + p * 0.15) : p;
                set(job, "status", "downloading");
                set(job, "progress", Math.min(99, overall));
                set(job, "eta", eta == null ? 0 : eta);
                if (line != null) {
                    Matcher m = SPEED.matcher(line);
                    if (m.find()) set(job, "speed", bytes(m.group(1), m.group(2)));
                }
                emit(job, false);
                return Unit.INSTANCE;
            });
        } catch (Throwable e) {
            if (Extract.isThreads(url) && !CANCELED.contains(job.optString("id"))) {
                httpDownload(c, job, Extract.threadsVideoUrl(url, fmt, item), dir, "mp4", 0, 100);
                return;
            }
            throw new Exception(Extract.clean(e.getMessage()));
        } finally {
            if (ck != null) ck.delete();
        }
    }

    private static double bytes(String n, String unit) {
        double v = Double.parseDouble(n);
        switch (unit.toUpperCase().charAt(0)) {
            case 'K': return v * 1024;
            case 'M': return v * 1024 * 1024;
            case 'G': return v * 1024 * 1024 * 1024;
            default: return v;
        }
    }

    /** Plain HTTP download (a file finished on your server, or a Threads video). */
    private static void httpDownload(Context c, JSONObject job, String url, File dir, String ext, double from, double to) throws Exception {
        String id = job.optString("id");
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setRequestProperty("User-Agent", Extract.UA);
        h.setConnectTimeout(30000);
        h.setReadTimeout(60000);
        int code = h.getResponseCode();
        if (code >= 400) throw new Exception("HTTP " + code);
        long total = h.getContentLengthLong();
        String cd = h.getHeaderField("Content-Disposition");
        String name = "video." + (ext == null || ext.isEmpty() ? "mp4" : ext);
        if (cd != null) {
            Matcher m = Pattern.compile("filename\\*=UTF-8''([^;]+)").matcher(cd);
            if (m.find()) name = java.net.URLDecoder.decode(m.group(1), "UTF-8").replaceAll("[\\\\/]", "_");
        }
        File out = new File(dir, name);
        long got = 0, t0 = System.currentTimeMillis();
        try (InputStream in = h.getInputStream(); OutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (CANCELED.contains(id)) throw new InterruptedException();
                o.write(buf, 0, n);
                got += n;
                double secs = Math.max(0.001, (System.currentTimeMillis() - t0) / 1000.0);
                double speed = got / secs;
                set(job, "status", "downloading");
                set(job, "speed", speed);
                if (total > 0) { set(job, "progress", from + (to - from) * got / (double) total); set(job, "eta", (total - got) / speed); }
                emit(job, false);
            }
        } finally { h.disconnect(); }
        String thumbUrl = job.optString("thumbUrl", "");
        if (thumbUrl.isEmpty() && !job.optString("thumbnail").isEmpty()) thumbUrl = job.optString("thumbnail");
        if (!thumbUrl.isEmpty()) {
            try {
                HttpURLConnection t = (HttpURLConnection) new URL(thumbUrl).openConnection();
                t.setRequestProperty("User-Agent", Extract.UA);
                t.setConnectTimeout(15000);
                try (InputStream in = t.getInputStream(); OutputStream o = new FileOutputStream(new File(dir, "zz-thumb.jpg"))) { Library.copy(in, o); }
            } catch (Exception ignored) {}
        }
    }

    /** Move the finished file into the library and return its entry. */
    private static JSONObject finish(Context c, JSONObject job, File dir) throws Exception {
        File media = null, thumb = null;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                String n = f.getName().toLowerCase();
                if (n.endsWith(".part") || n.endsWith(".ytdl") || n.endsWith(".txt")) continue;
                if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp") || n.endsWith(".png")) {
                    if (thumb == null || f.length() > thumb.length()) thumb = f;
                } else if (media == null || f.length() > media.length()) media = f;
            }
        }
        if (media == null) throw new Exception("The download produced no file");
        String id = job.optString("id");
        String ext = media.getName().contains(".") ? media.getName().substring(media.getName().lastIndexOf('.') + 1).toLowerCase() : "mp4";
        File dest = new File(Library.videosDir(c), id + "." + ext);
        if (!media.renameTo(dest)) {
            try (InputStream in = new java.io.FileInputStream(media); OutputStream o = new FileOutputStream(dest)) { Library.copy(in, o); }
        }
        boolean hasThumb = false;
        if (thumb != null) {
            File td = Library.thumb(c, id);
            hasThumb = thumb.renameTo(td);
            if (!hasThumb) try (InputStream in = new java.io.FileInputStream(thumb); OutputStream o = new FileOutputStream(td)) { Library.copy(in, o); hasThumb = true; } catch (Exception ignored) {}
        }
        String kind = job.optString("kind", "video");
        if (!kind.equals("video") || ext.equals("m4a") || ext.equals("mp3") || ext.equals("opus")) kind = kind.equals("video") ? "m4a" : kind;
        JSONObject it = new JSONObject();
        it.put("id", id);
        it.put("title", job.optString("title", "Video"));
        it.put("platform", job.optString("platform", "other"));
        it.put("folder", job.optString("folder", ""));
        it.put("kind", kind);
        it.put("quality", job.optString("quality", ""));
        it.put("ext", ext);
        it.put("file", dest.getName());
        it.put("size", dest.length());
        it.put("duration", job.optDouble("duration", 0));
        it.put("created", System.currentTimeMillis());
        it.put("source", job.optString("url"));
        it.put("uploader", job.optString("uploader", ""));
        it.put("hasThumb", hasThumb);
        Library.add(c, it);
        return it;
    }

    private static void notifyDone(Context c, JSONObject job, boolean ok) {
        if (!App.prefs.optBoolean("notify")) return;
        try {
            Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT).putExtra("tab", ok ? "folders" : "downloads");
            PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            boolean ar = "ar".equals(App.prefs.optString("lang"));
            Notification n = App.builder(c, App.CH_DONE)
                    .setSmallIcon(R.drawable.ic_stat)
                    .setContentTitle(ok ? (ar ? "اكتمل التنزيل" : "Download complete") : (ar ? "فشل التنزيل" : "Download failed"))
                    .setContentText(job.optString("title", ""))
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .build();
            ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).notify(job.optString("id").hashCode(), n);
        } catch (Exception ignored) {}
    }

    // ---------------------------------------------------------------- helpers
    private static boolean active(JSONObject j) {
        String s = j.optString("status");
        return !(s.equals("done") || s.equals("error") || s.equals("canceled"));
    }

    private static JSONObject find(String id) {
        synchronized (JOBS) { for (JSONObject j : JOBS) if (j.optString("id").equals(id)) return j; }
        return null;
    }

    private static void set(JSONObject j, String k, Object v) {
        try { synchronized (j) { j.put(k, v); } } catch (Exception ignored) {}
    }

    /** Send a job update to the page (throttled to ~3 per second while downloading). */
    static void emit(JSONObject job, boolean force) {
        String id = job.optString("id");
        long now = System.currentTimeMillis();
        Long prev = LAST_EMIT.get(id);
        if (!force && prev != null && now - prev < 330) return;
        LAST_EMIT.put(id, now);
        String json;
        synchronized (job) {
            JSONObject copy = new JSONObject();
            try {
                for (Iterator<String> k = job.keys(); k.hasNext(); ) {
                    String key = k.next();
                    if (!key.equals("fileUrl") && !key.equals("thumbUrl") && !key.equals("proxy")) copy.put(key, job.get(key));
                }
            } catch (Exception ignored) {}
            json = copy.toString();
        }
        MainActivity.sendJob(json);
        if (!force) refreshThrottled();
    }

    private static long lastNotif = 0;
    private static void refreshThrottled() {
        long now = System.currentTimeMillis();
        if (now - lastNotif > 1000) { lastNotif = now; refresh(); }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
