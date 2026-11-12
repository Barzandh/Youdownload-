"""Every 6 hours: find which free download routes work right now and publish live.json (read by the web app).
Also keeps a few real YouTube sample files for testing the in-browser video+sound joiner."""
import json, os, time, urllib.request, urllib.error, urllib.parse
ORIGIN = 'https://barzandh.github.io'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
def req(url, method='GET', body=None, headers=None, limit=300_000, timeout=30):
    h = {'Origin': ORIGIN, 'User-Agent': UA}; h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(limit)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read(limit)
    except Exception as e:
        return 0, {}, str(e)[:150].encode()

known = json.load(open('web/instances.json'))
COBALT = known.get('instances', []) + known.get('candidates', [])
INVIDIOUS = known.get('invidious', [])
try:
    c, h, b = req('https://api.invidious.io/instances.json?sort_by=type,users', limit=4_000_000)
    for name, meta in json.loads(b):
        if meta.get('type') == 'https' and meta.get('uri'): INVIDIOUS.append(meta['uri'])
except Exception:
    pass
INVIDIOUS = list(dict.fromkeys(u.rstrip('/') for u in INVIDIOUS))[:40]
TESTS = {
    'twitter': 'https://x.com/SpaceX/status/1732824684683784516',
    'facebook': 'https://www.facebook.com/watch/?v=10153231379946729',
    'tiktok': 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    'instagram': 'https://www.instagram.com/reel/C2wYV3cO6hX/',
    'youtube': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    'snapchat': 'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWl6c2JrbHRpAY0v2wRvAY0v2wRCAAAAAQ',
    'threads': 'https://www.threads.net/@zuck/post/C8JxoqESoHm',
}
live = {'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cobalt': {}, 'invidious': [], 'report': {}}
for inst in dict.fromkeys(COBALT):
    c, h, b = req(inst, 'OPTIONS', headers={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,accept'})
    if not h.get('access-control-allow-origin'):
        live['report'][inst] = 'no CORS (%s)' % c; continue
    for plat, url in TESTS.items():
        c, h, b = req(inst, 'POST', {'url': url, 'videoQuality': '480', 'alwaysProxy': True, 'localProcessing': 'disabled'}, {'Accept': 'application/json', 'Content-Type': 'application/json'})
        try:
            d = json.loads(b)
        except Exception:
            d = {}
        res = d.get('status') or c
        u = d.get('url') or ((d.get('picker') or [{}])[0].get('url'))
        if u:
            c2, h2, b2 = req(u, limit=100_000, timeout=60)
            ok = c2 in (200, 206) and len(b2) > 1000 and h2.get('access-control-allow-origin')
            res = 'ok' if ok else 'file %s %s bytes acao=%s' % (c2, len(b2), h2.get('access-control-allow-origin'))
            if ok: live['cobalt'].setdefault(plat, []).append(inst)
        elif d.get('error'):
            res = d['error'].get('code')
        live['report'][inst + ' ' + plat] = res
        time.sleep(1)
os.makedirs('out/samples', exist_ok=True)
for base in INVIDIOUS:
    c, h, b = req(base + '/api/v1/videos/jNQXAC9IVRw?local=true')
    if c != 200 or not h.get('access-control-allow-origin'):
        live['report'][base] = 'meta %s acao=%s' % (c, h.get('access-control-allow-origin')); continue
    try:
        j = json.loads(b)
        fmts = {f.get('itag'): f for f in j.get('adaptiveFormats') or []}
        v, a = fmts.get('160') or fmts.get('133'), fmts.get('140') or fmts.get('139')
        ok = True
        for name, f in (('video', v), ('audio', a)):
            u = f['url'] if f['url'].startswith('http') else base + f['url']
            c2, h2, b2 = req(u, headers={'Range': 'bytes=0-'}, limit=5_000_000, timeout=60)
            if c2 not in (200, 206) or not h2.get('access-control-allow-origin') or len(b2) < 1000:
                ok = False; live['report'][base] = '%s stream %s acao=%s' % (name, c2, h2.get('access-control-allow-origin')); break
            if not os.path.exists('out/samples/zoo-%s.mp4' % name):
                open('out/samples/zoo-%s.mp4' % name, 'wb').write(b2)
        if ok:
            live['invidious'].append(base); live['report'][base] = 'ok'
    except Exception as e:
        live['report'][base] = 'error %s' % e
# a longer sample with real 720p fragments
for base in live['invidious'][:1]:
    try:
        c, h, b = req(base + '/api/v1/videos/P6YamGRrn9Y?local=true')
        fmts = {f.get('itag'): f for f in json.loads(b).get('adaptiveFormats') or []}
        for name, itag in (('video720', '136'), ('video720-60', '298'), ('audio140', '140')):
            f = fmts.get(itag)
            if not f: continue
            u = f['url'] if f['url'].startswith('http') else base + f['url']
            c2, h2, b2 = req(u, headers={'Range': 'bytes=0-6000000'}, limit=6_000_001, timeout=90)
            open('out/samples/song-%s.mp4' % name, 'wb').write(b2)
    except Exception as e:
        live['report']['sample'] = str(e)
json.dump(live, open('out/live.json', 'w'), indent=1)
print(json.dumps(live, indent=1))
