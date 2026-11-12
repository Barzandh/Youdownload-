"""Second round: YouTube through Piped/Invidious, TikTok through tikwm — as a phone browser would."""
import json, time, urllib.request, urllib.error, urllib.parse
ORIGIN = 'https://barzandh.github.io'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
def req(url, method='GET', data=None, headers=None, limit=200_000, timeout=25):
    h = {'Origin': ORIGIN, 'User-Agent': UA}; h.update(headers or {})
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read(limit)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read(limit)
    except Exception as e:
        return 0, {}, str(e)[:150].encode()
VID = 'P6YamGRrn9Y'
out = {'piped': {}, 'invidious': {}, 'tikwm': {}}
# ---- Piped
c, h, b = req('https://piped-instances.kavin.rocks/', limit=2_000_000)
try: piped = [i['api_url'] for i in json.loads(b)]
except Exception: piped = []
piped = piped[:25] + ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.adminforge.de']
for api in dict.fromkeys(piped):
    c, h, b = req(api.rstrip('/') + '/streams/' + VID)
    rec = {'code': c, 'acao': h.get('access-control-allow-origin')}
    try:
        j = json.loads(b); vs = j.get('videoStreams') or []
        rec['title'] = j.get('title') or j.get('error') or j.get('message')
        rec['res'] = sorted({v.get('quality') for v in vs})
        prog = [v for v in vs if not v.get('videoOnly')]
        s = (prog or vs or [None])[0]
        if s:
            c2, h2, b2 = req(s['url'], limit=300_000)
            rec['stream'] = [c2, h2.get('access-control-allow-origin'), len(b2), h2.get('content-type'), s.get('quality'), s.get('videoOnly')]
    except Exception as e:
        rec['raw'] = b[:120].decode('utf-8', 'replace')
    out['piped'][api] = rec; print('piped', api, json.dumps(rec)[:400], flush=True)
# ---- Invidious
c, h, b = req('https://api.invidious.io/instances.json?sort_by=type,users', limit=3_000_000)
inv = []
try:
    for name, meta in json.loads(b):
        if meta.get('type') == 'https' and meta.get('api'): inv.append(meta['uri'])
except Exception: pass
inv = inv[:20] + ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de', 'https://inv.tux.pizza', 'https://invidious.f5.si']
for base in dict.fromkeys(inv):
    c, h, b = req(base.rstrip('/') + '/api/v1/videos/' + VID + '?local=true')
    rec = {'code': c, 'acao': h.get('access-control-allow-origin')}
    try:
        j = json.loads(b)
        rec['title'] = j.get('title') or j.get('error')
        fs = j.get('formatStreams') or []
        ad = j.get('adaptiveFormats') or []
        rec['res'] = sorted({f.get('resolution') or f.get('qualityLabel') for f in fs + ad if f.get('resolution') or f.get('qualityLabel')}, key=str)
        if fs:
            u = fs[-1]['url']; u = u if u.startswith('http') else base.rstrip('/') + u
            c2, h2, b2 = req(u, limit=300_000)
            rec['stream'] = [c2, h2.get('access-control-allow-origin'), len(b2), h2.get('content-type'), fs[-1].get('resolution')]
    except Exception:
        rec['raw'] = b[:120].decode('utf-8', 'replace')
    out['invidious'][base] = rec; print('inv', base, json.dumps(rec)[:400], flush=True)
# ---- TikTok via tikwm
for u in ['https://www.tiktok.com/@scout2015/video/6718335390845095173']:
    c, h, b = req('https://www.tikwm.com/api/?hd=1&url=' + urllib.parse.quote(u))
    rec = {'code': c, 'acao': h.get('access-control-allow-origin')}
    try:
        j = json.loads(b); d = j.get('data') or {}
        rec['msg'] = j.get('msg'); rec['title'] = d.get('title')
        for k in ('hdplay', 'play'):
            if d.get(k):
                vu = d[k] if d[k].startswith('http') else 'https://www.tikwm.com' + d[k]
                c2, h2, b2 = req(vu, limit=300_000)
                rec[k] = [c2, h2.get('access-control-allow-origin'), len(b2), h2.get('content-type')]
    except Exception:
        rec['raw'] = b[:150].decode('utf-8', 'replace')
    out['tikwm'][u] = rec; print('tikwm', json.dumps(rec)[:400], flush=True)
json.dump(out, open('diag2.json', 'w'), indent=1)
