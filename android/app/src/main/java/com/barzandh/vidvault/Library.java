package com.barzandh.vidvault;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/** The offline library: files live in the app's own storage, the list lives in library.json. */
final class Library {
    private static JSONArray items;

    static File videosDir(Context c) {
        File base = c.getExternalFilesDir(null);
        if (base == null) base = c.getFilesDir();
        File d = new File(base, "videos");
        d.mkdirs();
        return d;
    }

    private static File index(Context c) { return new File(c.getFilesDir(), "library.json"); }

    private static synchronized JSONArray load(Context c) {
        if (items != null) return items;
        try {
            File f = index(c);
            if (f.exists()) {
                byte[] b = readAll(new FileInputStream(f));
                items = new JSONArray(new String(b, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {}
        if (items == null) items = new JSONArray();
        return items;
    }

    private static synchronized void persist(Context c) {
        try {
            File tmp = new File(c.getFilesDir(), "library.json.tmp");
            try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(items.toString().getBytes(StandardCharsets.UTF_8)); }
            tmp.renameTo(index(c));
        } catch (Exception ignored) {}
    }

    static synchronized String listJson(Context c) {
        JSONArray a = load(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (it != null && file(c, it).exists()) out.put(it);
        }
        return out.toString();
    }

    static synchronized JSONObject find(Context c, String id) {
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (it != null && id.equals(it.optString("id"))) return it;
        }
        return null;
    }

    static File file(Context c, JSONObject it) { return new File(videosDir(c), it.optString("file")); }

    static File thumb(Context c, String id) { return new File(videosDir(c), id + ".thumb.jpg"); }

    static synchronized void add(Context c, JSONObject it) {
        load(c).put(it);
        persist(c);
    }

    static synchronized void update(Context c, String id, JSONObject patch) {
        JSONObject it = find(c, id);
        if (it == null) return;
        try {
            for (Iterator<String> k = patch.keys(); k.hasNext(); ) {
                String key = k.next();
                if (key.equals("title") || key.equals("folder")) it.put(key, patch.get(key));
            }
        } catch (Exception ignored) {}
        persist(c);
    }

    static synchronized void remove(Context c, String id) {
        JSONArray a = load(c), keep = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (it == null) continue;
            if (id.equals(it.optString("id"))) {
                file(c, it).delete();
                thumb(c, id).delete();
            } else keep.put(it);
        }
        items = keep;
        persist(c);
    }

    static String mime(JSONObject it) {
        String m = it.optString("mime", "");
        if (!m.isEmpty()) return m;
        String ext = it.optString("ext", "mp4").toLowerCase();
        String g = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if (g != null) return g;
        return it.optString("kind").equals("video") ? "video/mp4" : "audio/mpeg";
    }

    /** Copy into the phone's Gallery (Movies/VidVault) or Music/VidVault. Returns null on success, else an error. */
    static String saveToGallery(Context c, JSONObject it) {
        File src = file(c, it);
        if (!src.exists()) return "File missing";
        boolean video = it.optString("kind", "video").equals("video");
        String name = safeName(it.optString("title", "video")) + "." + it.optString("ext", "mp4");
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = c.getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime(it));
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_MUSIC) + "/VidVault");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri col = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        : MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri uri = cr.insert(col, v);
                if (uri == null) return "Gallery refused the file";
                try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(uri)) { copy(in, out); }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_MUSIC), "VidVault");
                dir.mkdirs();
                File dst = new File(dir, name);
                try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) { copy(in, out); }
                android.media.MediaScannerConnection.scanFile(c, new String[]{dst.getAbsolutePath()}, null, null);
            }
            return null;
        } catch (Exception e) {
            return String.valueOf(e.getMessage());
        }
    }

    static String safeName(String s) {
        s = s.replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]+", " ").trim();
        if (s.length() > 80) s = s.substring(0, 80).trim();
        return s.isEmpty() ? "video" : s;
    }

    static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[256 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    static byte[] readAll(InputStream in) throws java.io.IOException {
        try (InputStream i = in) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            copy(i, b);
            return b.toByteArray();
        }
    }

    static long totalSize(Context c) {
        long t = 0;
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) t += a.optJSONObject(i) == null ? 0 : a.optJSONObject(i).optLong("size");
        return t;
    }
}
