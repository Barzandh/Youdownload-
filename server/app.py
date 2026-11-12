"""VidVault download server.

The web app (iPhone, iPad, desktop) can't fetch videos from YouTube, Instagram, Facebook,
X, TikTok or Threads by itself, so it sends the link here. This server reads the link with
yt-dlp, lists every resolution the site offers, downloads the one you pick (merging video and
sound with ffmpeg) and hands the finished file back to the app, which keeps it offline.

Environment:
  PORT         port to listen on (default 8000)
  ACCESS_KEY   password the app must send (strongly recommended on a public server)
  COOKIES      optional Netscape-format cookies text (helps with sites that ask you to sign in)
  MAX_PARALLEL downloads at once (default 2)
"""
import hmac
import html
import json
import mimetypes
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yt_dlp

VERSION = '1.0.0'
PORT = int(os.environ.get('PORT', '8000'))
KEY = os.environ.get('ACCESS_KEY', '').strip()
MAX_PARALLEL = int(os.environ.get('MAX_PARALLEL', '2'))
JOB_TTL = 60 * 60
WORK = tempfile.mkdtemp(prefix='vidvault-')
UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')

COOKIE_FILE = None
if os.environ.get('COOKIES', '').strip():
    COOKIE_FILE = os.path.join(WORK, 'cookies.txt')
    with open(COOKIE_FILE, 'w') as f:
        f.write(os.environ['COOKIES'].strip() + '\n')

JOBS = {}
JOBS_LOCK = threading.Lock()
SLOTS = threading.Semaphore(MAX_PARALLEL)

FORMAT_KEYS = ('format_id', 'ext', 'height', 'width', 'fps', 'vcodec', 'acodec', 'filesize', 'filesize_approx',
               'tbr', 'abr', 'format_note', 'protocol', 'dynamic_range', 'resolution')


def is_threads(url):
    try:
        return re.search(r'(^|\.)threads\.(net|com)$', urllib.parse.urlparse(url).hostname or '') is not None
    except Exception:
        return False


def base_opts(proxy=None):
    o = {'quiet': True, 'no_warnings': True, 'noplaylist': True, 'socket_timeout': 30, 'retries': 3,
         'extractor_retries': 2, 'concurrent_fragment_downloads': 4, 'http_headers': {}}
    if COOKIE_FILE:
        o['cookiefile'] = COOKIE_FILE
    if proxy:
        o['proxy'] = proxy
    return o


def slim(info):
    """Only what the app needs (the full yt-dlp JSON can be megabytes)."""
    out = {k: info.get(k) for k in ('id', 'title', 'thumbnail', 'duration', 'uploader', 'channel',
                                     'extractor_key', 'webpage_url', 'direct')}
    out['formats'] = [{k: f.get(k) for k in FORMAT_KEYS if f.get(k) is not None}
                      for f in (info.get('formats') or []) if f.get('protocol') != 'mhtml']
    if not out['formats'] and info.get('url'):
        out['formats'] = [{k: info.get(k) for k in FORMAT_KEYS if info.get(k) is not None}]
    if not out['thumbnail'] and info.get('thumbnails'):
        out['thumbnail'] = info['thumbnails'][-1].get('url')
    return out


def get_info(url, item=None, proxy=None):
    opts = base_opts(proxy)
    opts['skip_download'] = True
    if item:
        opts['playlist_items'] = str(item)
    try:
        with yt_dlp.YoutubeDL(opts) as y:
            info = y.sanitize_info(y.extract_info(url, download=False))
    except Exception:
        if is_threads(url):
            return threads_info(url, proxy)
        raise
    if info.get('_type') in ('playlist', 'multi_video') or info.get('entries'):
        entries = [e for e in (info.get('entries') or []) if e][:60]
        res = slim(entries[0] if entries else info)
        res.update({'title': info.get('title') or res.get('title'), 'webpage_url': info.get('webpage_url') or url,
                    'uploader': info.get('uploader') or res.get('uploader')})
        if len(entries) > 1:
            res['entries'] = [slim(e) for e in entries]
        return res
    return slim(info)


# ---------- Threads: yt-dlp may not know threads.net / threads.com, so read the page ourselves ----------
def fetch(url, proxy=None, limit=8 << 20, ua=UA):
    handlers = []
    if proxy and proxy.startswith('http'):
        handlers.append(urllib.request.ProxyHandler({'http': proxy, 'https': proxy}))
    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(url, headers={'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9'})
    with opener.open(req, timeout=30) as r:
        return r.read(limit), r.headers.get('Content-Type', '')


def threads_videos(url, proxy=None):
    body = b''
    for ua in (UA, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'):
        try:
            body, _ = fetch(url, proxy, ua=ua)
            if b'video_versions' in body or b'og:video' in body:
                break
        except Exception:
            continue
    text = body.decode('utf-8', 'replace')
    videos = []
    for m in re.finditer(r'"video_versions"\s*:\s*(\[[^\]]*\])', text):
        try:
            arr = json.loads(m.group(1))
        except Exception:
            continue
        urls = []
        for v in arr:
            u = (v or {}).get('url')
            if u and u not in urls:
                urls.append(u)
        if urls and urls not in videos:
            videos.append(urls)
    if not videos:
        for m in re.finditer(r'<meta[^>]+property="og:video(?::secure_url)?"[^>]+content="([^"]+)"', text):
            u = html.unescape(m.group(1))
            if [u] not in videos:
                videos.append([u])
    meta = {}
    for prop in ('og:title', 'og:description', 'og:image'):
        m = re.search(r'<meta[^>]+property="%s"[^>]+content="([^"]*)"' % prop, text)
        if m:
            meta[prop] = html.unescape(m.group(1))
    return videos, meta


def threads_info(url, proxy=None):
    videos, meta = threads_videos(url, proxy)
    if not videos:
        raise RuntimeError('No video found in this Threads post (it may be private or a photo post).')
    title = (meta.get('og:description') or meta.get('og:title') or 'Threads video').strip()[:120]

    def entry(i, urls):
        return {'title': title, 'thumbnail': meta.get('og:image'), 'direct': True,
                'formats': [{'format_id': 'tv%d_%d' % (i, j), 'ext': 'mp4', 'format_note': 'Video' if j == 0 else 'Version %d' % (j + 1)}
                            for j, _ in enumerate(urls[:1])]}
    res = entry(0, videos[0])
    res.update({'webpage_url': url, 'uploader': meta.get('og:title', ''), 'extractor_key': 'Threads'})
    if len(videos) > 1:
        res['entries'] = [entry(i, v) for i, v in enumerate(videos)]
    return res


# ---------- download jobs ----------
def new_job(spec):
    jid = uuid.uuid4().hex[:16]
    job = {'id': jid, 'status': 'queued', 'progress': 0, 'speed': 0, 'eta': 0, 'created': time.time(), 'spec': spec}
    with JOBS_LOCK:
        JOBS[jid] = job
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


def run_job(job):
    with SLOTS:
        if job.get('canceled'):
            return
        spec = job['spec']
        d = tempfile.mkdtemp(dir=WORK)
        job['dir'] = d
        try:
            job['status'] = 'downloading'
            fmt = spec.get('format') or 'b'
            if is_threads(spec['url']) and fmt.startswith('tv'):
                threads_download(job, d)
            else:
                try:
                    ytdlp_download(job, d)
                except Exception:
                    if job.get('canceled'):
                        raise
                    if is_threads(spec['url']):
                        threads_download(job, d)
                    else:
                        raise
            files = [os.path.join(d, f) for f in os.listdir(d)
                     if not f.endswith(('.part', '.ytdl', '.temp')) and not f.startswith('.')]
            files = [f for f in files if os.path.isfile(f)]
            if not files:
                raise RuntimeError('The download produced no file')
            path = max(files, key=os.path.getsize)
            job.update({'file': path, 'ext': path.rsplit('.', 1)[-1].lower(), 'size': os.path.getsize(path),
                        'filename': os.path.basename(path), 'status': 'ready', 'progress': 100})
        except Exception as e:  # noqa
            if not job.get('canceled'):
                job.update({'status': 'error', 'error': clean_error(e)})


def clean_error(e):
    s = re.sub(r'\x1b\[[0-9;]*m', '', str(e)).replace('ERROR: ', '').strip()
    return s[:600] or 'Download failed'


def ytdlp_download(job, d):
    spec = job['spec']
    kind = spec.get('kind') or 'video'
    state = {'n': 1, 'done': 0}

    def hook(p):
        if job.get('canceled'):
            raise yt_dlp.utils.DownloadCancelled('canceled')
        info = p.get('info_dict') or {}
        state['n'] = max(1, len(info.get('requested_formats') or []) or 1)
        if p['status'] == 'downloading':
            total = p.get('total_bytes') or p.get('total_bytes_estimate') or 0
            frac = (p.get('downloaded_bytes') or 0) / total if total else 0
            if not total and p.get('fragment_count'):
                frac = (p.get('fragment_index') or 0) / p['fragment_count']
            job['progress'] = min(99, (state['done'] + frac) / state['n'] * 100)
            job['speed'] = p.get('speed') or 0
            job['eta'] = p.get('eta') or 0
        elif p['status'] == 'finished':
            state['done'] = min(state['n'], state['done'] + 1)

    def pp_hook(p):
        if p.get('status') == 'started':
            job['status'] = 'processing'

    opts = base_opts(spec.get('proxy'))
    opts.update({'format': spec.get('format') or 'b', 'outtmpl': os.path.join(d, '%(title).80B [%(id)s].%(ext)s'),
                 'progress_hooks': [hook], 'postprocessor_hooks': [pp_hook], 'windowsfilenames': True,
                 'overwrites': True, 'continuedl': False})
    if spec.get('item'):
        opts['playlist_items'] = str(spec['item'])
        opts['noplaylist'] = False
    if kind == 'video':
        opts['merge_output_format'] = 'mp4'
    elif kind in ('mp3', 'm4a'):
        opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': kind, 'preferredquality': '192'}]
    with yt_dlp.YoutubeDL(opts) as y:
        y.download([spec['url']])


def threads_download(job, d):
    spec = job['spec']
    videos, _ = threads_videos(spec['url'], spec.get('proxy'))
    if not videos:
        raise RuntimeError('No video found in this Threads post')
    m = re.match(r'tv(\d+)_(\d+)', spec.get('format') or '')
    i = int(m.group(1)) if m else max(0, int(spec.get('item') or 1) - 1)
    i = min(i, len(videos) - 1)
    src = videos[i][0]
    req = urllib.request.Request(src, headers={'User-Agent': UA})
    path = os.path.join(d, 'threads-%s-%d.mp4' % (job['id'][:6], i + 1))
    with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as out:
        total = int(r.headers.get('Content-Length') or 0)
        got, t0 = 0, time.time()
        while True:
            if job.get('canceled'):
                raise RuntimeError('canceled')
            chunk = r.read(256 << 10)
            if not chunk:
                break
            out.write(chunk)
            got += len(chunk)
            el = max(0.001, time.time() - t0)
            job.update({'progress': got / total * 100 if total else 50, 'speed': got / el,
                        'eta': (total - got) / (got / el) if total and got else 0})


def drop_job(jid):
    with JOBS_LOCK:
        job = JOBS.pop(jid, None)
    if job:
        job['canceled'] = True
        if job.get('dir'):
            shutil.rmtree(job['dir'], ignore_errors=True)


def janitor():
    while True:
        time.sleep(300)
        now = time.time()
        for jid, job in list(JOBS.items()):
            if now - job['created'] > JOB_TTL:
                drop_job(jid)


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = 'VidVault/' + VERSION
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if os.environ.get('VERBOSE'):
            super().log_message(fmt, *args)

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'X-Key, Content-Type, Range')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Range')
        self.send_header('Access-Control-Max-Age', '86400')

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def authorized(self, q):
        if not KEY:
            return True
        given = self.headers.get('X-Key') or (q.get('key') or [''])[0]
        return hmac.compare_digest(given.encode(), KEY.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def route(self, method):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        path = u.path.rstrip('/')
        if path in ('', '/api/ping'):
            return self.send_json({'ok': True, 'app': 'VidVault server', 'version': VERSION})
        if not self.authorized(q):
            return self.send_json({'error': 'Wrong or missing access key'}, 401)
        try:
            if path == '/api/health':
                return self.send_json({'ok': True, 'version': VERSION, 'ytdlp': yt_dlp.version.__version__,
                                       'needsKey': bool(KEY), 'jobs': len(JOBS)})
            if path == '/api/info' and method == 'GET':
                url = (q.get('url') or [''])[0]
                if not re.match(r'^https?://', url):
                    return self.send_json({'error': 'Send a full http(s) link'}, 400)
                item = (q.get('item') or [None])[0]
                proxy = (q.get('proxy') or [None])[0]
                return self.send_json(get_info(url, item, proxy))
            if path == '/api/jobs' and method == 'POST':
                n = int(self.headers.get('Content-Length') or 0)
                spec = json.loads(self.rfile.read(n) or b'{}')
                if not re.match(r'^https?://', spec.get('url') or ''):
                    return self.send_json({'error': 'Send a full http(s) link'}, 400)
                spec = {k: spec.get(k) for k in ('url', 'format', 'kind', 'item', 'proxy')}
                return self.send_json({'id': new_job(spec)['id']})
            m = re.match(r'^/api/jobs/([0-9a-f]{16})(/file)?$', path)
            if m:
                job = JOBS.get(m.group(1))
                if not job:
                    return self.send_json({'error': 'This download expired — start it again'}, 404)
                if method == 'DELETE':
                    drop_job(job['id'])
                    return self.send_json({'ok': True})
                if m.group(2):
                    return self.send_file(job)
                return self.send_json({k: job.get(k) for k in ('id', 'status', 'progress', 'speed', 'eta', 'error', 'ext', 'size', 'filename')})
            if path == '/api/thumb':
                return self.send_thumb((q.get('url') or [''])[0])
            return self.send_json({'error': 'Not found'}, 404)
        except Exception as e:  # noqa
            return self.send_json({'error': clean_error(e)}, 500)

    def send_file(self, job):
        if job.get('status') != 'ready':
            return self.send_json({'error': 'Not ready yet'}, 409)
        path, size = job['file'], job['size']
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        start, end, code = 0, size - 1, 200
        rng = self.headers.get('Range')
        m = re.match(r'bytes=(\d*)-(\d*)', rng or '')
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            code = 206
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        if code == 206:
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        fname = urllib.parse.quote(job.get('filename') or ('video.' + job.get('ext', 'mp4')))
        self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + fname)
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def send_thumb(self, url):
        if not re.match(r'^https?://', url):
            return self.send_json({'error': 'bad url'}, 400)
        data, ctype = fetch(url, limit=6 << 20)
        if not ctype.startswith('image/'):
            ctype = 'image/jpeg'
        self.send_response(200)
        self.cors()
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=86400')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.route('GET')

    def do_POST(self):
        self.route('POST')

    def do_DELETE(self):
        self.route('DELETE')


if __name__ == '__main__':
    threading.Thread(target=janitor, daemon=True).start()
    print('VidVault server %s (yt-dlp %s) on port %d%s' % (VERSION, yt_dlp.version.__version__, PORT,
                                                            '' if KEY else ' — WARNING: no ACCESS_KEY set'), flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
