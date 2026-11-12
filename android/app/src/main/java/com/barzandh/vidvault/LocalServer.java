package com.barzandh.vidvault;

import android.content.Context;
import android.net.wifi.WifiManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * A tiny web server.
 *  - local (127.0.0.1): streams your saved videos to the in-app player with seeking support.
 *  - Wi-Fi Sharing (0.0.0.0:8080): lets a computer on the same Wi-Fi browse and copy your downloads.
 */
final class LocalServer {
    private final Context ctx;
    private final boolean lan;
    private ServerSocket socket;
    private volatile boolean running;

    LocalServer(Context c, boolean lan) { this.ctx = c.getApplicationContext(); this.lan = lan; }

    synchronized boolean start() {
        if (running) return true;
        try {
            if (lan) {
                ServerSocket s = null;
                for (int p = 8080; p < 8090 && s == null; p++) {
                    try { s = new ServerSocket(p, 16); } catch (Exception ignored) {}
                }
                if (s == null) return false;
                socket = s;
            } else {
                socket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
            }
            running = true;
            Thread t = new Thread(this::loop, lan ? "wifi-share" : "media-server");
            t.setDaemon(true);
            t.start();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    synchronized void stop() {
        running = false;
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        socket = null;
    }

    int port() { return socket == null ? 0 : socket.getLocalPort(); }

    String base() { return "http://127.0.0.1:" + port(); }

    String lanAddress() {
        String ip = wifiIp();
        return ip == null || socket == null ? "" : "http://" + ip + ":" + port();
    }

    @SuppressWarnings("deprecation")
    private String wifiIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName().toLowerCase(Locale.ROOT);
                if (!(n.startsWith("wlan") || n.startsWith("eth") || n.startsWith("ap") || n.startsWith("swlan"))) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses()))
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress();
            }
        } catch (Exception ignored) {}
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            int ip = wm.getConnectionInfo().getIpAddress();
            if (ip != 0) return (ip & 255) + "." + (ip >> 8 & 255) + "." + (ip >> 16 & 255) + "." + (ip >> 24 & 255);
        } catch (Exception ignored) {}
        return null;
    }

    private void loop() {
        while (running) {
            try {
                Socket s = socket.accept();
                Thread t = new Thread(() -> handle(s));
                t.setDaemon(true);
                t.start();
            } catch (Exception e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(30000);
            BufferedReader r = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.ISO_8859_1));
            String line = r.readLine();
            if (line == null) return;
            String[] req = line.split(" ");
            if (req.length < 2) return;
            Map<String, String> h = new HashMap<>();
            String hl;
            while ((hl = r.readLine()) != null && !hl.isEmpty()) {
                int c = hl.indexOf(':');
                if (c > 0) h.put(hl.substring(0, c).trim().toLowerCase(Locale.ROOT), hl.substring(c + 1).trim());
            }
            String path = req[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            OutputStream out = sock.getOutputStream();
            boolean head = req[0].equals("HEAD");
            if (path.startsWith("/media/") || path.startsWith("/dl/")) {
                String id = URLDecoder.decode(path.substring(path.indexOf('/', 1) + 1), "UTF-8");
                JSONObject it = Library.find(ctx, id);
                if (it == null) { text(out, 404, "Not found"); return; }
                sendFile(out, Library.file(ctx, it), Library.mime(it), h.get("range"), head,
                        path.startsWith("/dl/") ? Library.safeName(it.optString("title")) + "." + it.optString("ext", "mp4") : null);
            } else if (path.startsWith("/thumb/")) {
                String id = URLDecoder.decode(path.substring(7), "UTF-8");
                sendFile(out, Library.thumb(ctx, id), "image/jpeg", null, head, null);
            } else if (lan && (path.equals("/") || path.equals("/index.html"))) {
                byte[] body = indexPage().getBytes(StandardCharsets.UTF_8);
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
                if (!head) out.write(body);
            } else text(out, 404, "Not found");
            out.flush();
        } catch (Exception ignored) {}
    }

    private void text(OutputStream out, int code, String msg) throws Exception {
        byte[] b = msg.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + code + " " + msg + "\r\nContent-Type: text/plain\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.write(b);
    }

    private void sendFile(OutputStream out, File f, String mime, String range, boolean head, String downloadName) throws Exception {
        if (!f.exists()) { text(out, 404, "Not found"); return; }
        long size = f.length(), start = 0, end = size - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            String[] p = range.substring(6).split(",")[0].split("-", -1);
            try {
                if (!p[0].isEmpty()) { start = Long.parseLong(p[0]); if (p.length > 1 && !p[1].isEmpty()) end = Long.parseLong(p[1]); }
                else if (p.length > 1 && !p[1].isEmpty()) start = Math.max(0, size - Long.parseLong(p[1]));
                end = Math.min(end, size - 1);
                partial = true;
            } catch (NumberFormatException ignored) {}
        }
        if (start > end) {
            out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + size + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
            return;
        }
        long len = end - start + 1;
        StringBuilder hd = new StringBuilder();
        hd.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
        hd.append("Content-Type: ").append(mime).append("\r\n");
        hd.append("Content-Length: ").append(len).append("\r\n");
        hd.append("Accept-Ranges: bytes\r\n");
        hd.append("Access-Control-Allow-Origin: *\r\n");
        hd.append("Cache-Control: no-cache\r\n");
        if (partial) hd.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(size).append("\r\n");
        if (downloadName != null) hd.append("Content-Disposition: attachment; filename*=UTF-8''").append(URLEncoder.encode(downloadName, "UTF-8").replace("+", "%20")).append("\r\n");
        hd.append("Connection: close\r\n\r\n");
        out.write(hd.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (head) return;
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(start);
            byte[] buf = new byte[128 * 1024];
            long left = len;
            while (left > 0) {
                int n = raf.read(buf, 0, (int) Math.min(buf.length, left));
                if (n <= 0) break;
                out.write(buf, 0, n);
                left -= n;
            }
        }
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private String indexPage() throws Exception {
        JSONArray a = new JSONArray(Library.listJson(ctx));
        StringBuilder sb = new StringBuilder();
        sb.append("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>VidVault — Wi-Fi Sharing</title>")
          .append("<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;background:#000;color:#fff;margin:0;padding:24px}h1{font-size:28px;margin:0 0 4px;background:linear-gradient(120deg,#ff3b5c,#2f6bff);-webkit-background-clip:text;color:transparent}")
          .append("p{color:#8e8e93}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}.c{background:#1c1c1e;border-radius:14px;overflow:hidden}.c img,.c .ph{width:100%;aspect-ratio:16/9;object-fit:cover;background:#2c2c2e;display:block}")
          .append(".c div{padding:10px 12px}.c b{display:block;font-size:14px;line-height:1.3;margin-bottom:6px}.c small{color:#8e8e93}.c a{color:#0a84ff;text-decoration:none;margin-right:12px;font-weight:600}</style></head><body>")
          .append("<h1>VidVault</h1><p>").append(a.length()).append(" downloads on this phone. Keep the app open while copying.</p><div class=g>");
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.getJSONObject(i);
            String id = URLEncoder.encode(it.optString("id"), "UTF-8");
            sb.append("<div class=c>");
            if (it.optBoolean("hasThumb")) sb.append("<img loading=lazy src='/thumb/").append(id).append("'>"); else sb.append("<div class=ph></div>");
            sb.append("<div><b>").append(esc(it.optString("title"))).append("</b><small>").append(esc(it.optString("quality"))).append(" · ")
              .append(String.format(Locale.US, "%.1f MB", it.optLong("size") / 1048576.0)).append("</small><br><br>")
              .append("<a href='/media/").append(id).append("' target=_blank>Play</a><a href='/dl/").append(id).append("'>Download</a></div></div>");
        }
        sb.append("</div></body></html>");
        return sb.toString();
    }
}
