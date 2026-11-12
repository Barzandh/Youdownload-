package com.barzandh.vidvault;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;

import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONObject;

/** Starts the on-device download engine (yt-dlp + Python + ffmpeg bundled in the APK). */
public class App extends Application {
    static final String CH_PROGRESS = "progress", CH_DONE = "done";
    private static volatile boolean engineReady = false;
    private static volatile String engineError = null;
    private static final Object LOCK = new Object();
    static volatile JSONObject prefs = new JSONObject();
    static LocalServer media;

    @Override
    public void onCreate() {
        super.onCreate();
        try { prefs = new JSONObject(getSharedPreferences("vv", MODE_PRIVATE).getString("prefs", "{}")); } catch (Exception ignored) {}
        channels(this);
        media = new LocalServer(this, false);
        media.start();
        final Context c = getApplicationContext();
        new Thread(() -> { initEngine(c); autoUpdate(c); }, "engine-init").start();
    }

    static void initEngine(Context c) {
        synchronized (LOCK) {
            if (engineReady) return;
            try {
                YoutubeDL.getInstance().init(c);
                FFmpeg.getInstance().init(c);
                engineReady = true;
                engineError = null;
            } catch (Throwable e) {
                engineError = String.valueOf(e.getMessage());
            }
        }
    }

    static void ensureEngine(Context c) throws Exception {
        if (!engineReady) initEngine(c);
        if (!engineReady) throw new Exception("The download engine could not start: " + engineError);
    }

    /** yt-dlp needs regular updates as sites change; check once a day on Wi-Fi or any network. */
    static void autoUpdate(Context c) {
        if (!engineReady || !online(c)) return;
        SharedPreferences sp = c.getSharedPreferences("vv", MODE_PRIVATE);
        long last = sp.getLong("engineChecked", 0);
        if (System.currentTimeMillis() - last < 24L * 3600 * 1000) return;
        try {
            if (DownloadService.activeCount() == 0) {
                YoutubeDL.getInstance().updateYoutubeDL(c, YoutubeDL.UpdateChannel._STABLE);
                sp.edit().putLong("engineChecked", System.currentTimeMillis()).apply();
            }
        } catch (Throwable ignored) {}
    }

    static String engineVersion(Context c) {
        try { String v = YoutubeDL.getInstance().version(c); return v == null ? "" : v; } catch (Throwable e) { return ""; }
    }

    static void savePrefs(Context c, String json) {
        try {
            prefs = new JSONObject(json);
            c.getSharedPreferences("vv", MODE_PRIVATE).edit().putString("prefs", json).apply();
        } catch (Exception ignored) {}
    }

    static boolean online(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network n = cm.getActiveNetwork();
        NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
        return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    static boolean onWifi(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network n = cm.getActiveNetwork();
        NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
        return nc != null && (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel p = new NotificationChannel(CH_PROGRESS, "Downloads in progress", NotificationManager.IMPORTANCE_LOW);
        p.setShowBadge(false);
        nm.createNotificationChannel(p);
        nm.createNotificationChannel(new NotificationChannel(CH_DONE, "Finished downloads", NotificationManager.IMPORTANCE_DEFAULT));
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder builder(Context c, String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
    }
}
