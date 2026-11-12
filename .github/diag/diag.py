"""Tests the free download servers and yt-dlp from a GitHub machine, like the app would use them."""
import json, subprocess, time, urllib.request, urllib.error

ORIGIN = 'https://barzandh.github.io'
INST = json.load(open('web/instances.json'))['instances'] + [
    'https://cobalt-api.meowing.de/', 'https://cobalt-backend.canine.tools/', 'https://capi.3kh0.net/',
    'https://cobalt-api.kwiatekmiki.com/', 'https://api.cobalt.blackcat.sweeux.org/', 'https://cobalt.255x.ru/',
    'https://cobalt-7.kwiatekmiki.com/', 'https://api.dl.woof.monster/', 'https://cobaltapi.squair.xyz/',
]
URLS = {
    'youtube': 'https://youtu.be/P6YamGRrn9Y',
    'youtube2': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    'tiktok': 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    'instagram': 'https://www.instagram.com/reel/C2wYV3cO6hX/',
    'twitter': 'https://x.com/SpaceX/status/1732824684683784516',
    'facebook': 'https://www.facebook.com/watch/?v=10153231379946729',
    'snapchat': 'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWl6c2JrbHRpAY0v2wRvAY0v2wRCAAAAAQ',
    'threads': 'https://www.threads.net/@zuck/post/C8JxoqESoHm',
}

def req(url, method='GET', body=None, headers=None, limit=200_000, timeout=40):
    h = {'Origin': ORIGIN, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'}
    h.update(headers or {})
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            data = resp.read(limit)
            return {'code': resp.status, 'h': {k.lower(): v for k, v in resp.headers.items()}, 'data': data, 'secs': round(time.time() - t0, 1)}
    except urllib.error.HTTPError as e:
        return {'code': e.code, 'h': {k.lower(): v for k, v in e.headers.items()}, 'data': e.read(limit), 'secs': round(time.time() - t0, 1)}
    except Exception as e:
        return {'code': 0, 'err': str(e)[:200], 'h': {}, 'data': b'', 'secs': round(time.time() - t0, 1)}

out = {'instances': {}, 'ytdlp': {}}
for inst in INST:
    info = req(inst)
    rec = {'get': info['code'], 'err': info.get('err')}
    try:
        j = json.loads(info['data']); rec['version'] = j['cobalt']['version']; rec['services'] = j['cobalt']['services']
    except Exception:
        pass
    pre = req(inst, 'OPTIONS', headers={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,accept'})
    rec['preflight'] = [pre['code'], pre['h'].get('access-control-allow-origin'), pre['h'].get('access-control-allow-headers')]
    rec['tests'] = {}
    if info['code'] == 200 and 'version' in rec:
        for plat, url in URLS.items():
            body = {'url': url, 'videoQuality': '720', 'downloadMode': 'auto', 'audioFormat': 'best', 'filenameStyle': 'pretty',
                    'alwaysProxy': True, 'localProcessing': 'disabled', 'audioBitrate': '320'}
            if plat.startswith('youtube'): body['youtubeVideoCodec'] = 'h264'
            r = req(inst, 'POST', body, {'Accept': 'application/json', 'Content-Type': 'application/json'})
            t = {'code': r['code'], 'acao': r['h'].get('access-control-allow-origin'), 'secs': r['secs']}
            try:
                d = json.loads(r['data']); t['status'] = d.get('status'); t['error'] = d.get('error'); t['filename'] = d.get('filename')
                u = d.get('url') or ((d.get('picker') or [{}])[0].get('url'))
                if u:
                    f = req(u, limit=300_000, timeout=60)
                    t['file'] = {'code': f['code'], 'bytes': len(f['data']), 'type': f['h'].get('content-type'), 'acao': f['h'].get('access-control-allow-origin'),
                                 'len': f['h'].get('content-length') or f['h'].get('estimated-content-length'), 'secs': f['secs'], 'err': f.get('err')}
            except Exception as e:
                t['raw'] = r['data'][:200].decode('utf-8', 'replace'); t['err'] = r.get('err')
            rec['tests'][plat] = t
    out['instances'][inst] = rec
    print(inst, json.dumps(rec)[:1500], flush=True)

for plat, url in URLS.items():
    p = subprocess.run(['yt-dlp', '-J', '--no-playlist', '--no-warnings', url], capture_output=True, text=True, timeout=180)
    if p.returncode == 0:
        j = json.loads(p.stdout)
        hs = sorted({f.get('height') for f in j.get('formats', []) if f.get('height')})
        out['ytdlp'][plat] = {'ok': True, 'title': j.get('title'), 'heights': hs}
    else:
        out['ytdlp'][plat] = {'ok': False, 'err': p.stderr.strip()[-400:]}
    print('yt-dlp', plat, json.dumps(out['ytdlp'][plat])[:600], flush=True)

json.dump(out, open('diag.json', 'w'), indent=1, default=str)
