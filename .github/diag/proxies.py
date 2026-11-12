"""Tests free CORS relays for sites whose pages a browser can't read directly (Snapchat, Instagram, Threads).
Adds the working relays to out/live.json."""
import json, re, html, urllib.request, urllib.error, urllib.parse
ORIGIN = 'https://barzandh.github.io'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
def req(url, headers=None, limit=3_000_000, timeout=30):
    h = {'Origin': ORIGIN, 'User-Agent': UA}; h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(limit)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read(limit)
    except Exception as e:
        return 0, {}, str(e)[:150].encode()
PROXIES = {
    'allorigins': 'https://api.allorigins.win/raw?url={u}',
    'codetabs': 'https://api.codetabs.com/v1/proxy/?quest={u}',
    'corsproxy': 'https://corsproxy.io/?url={u}',
    'corslol': 'https://api.cors.lol/?url={u}',
    'thingproxy': 'https://thingproxy.freeboard.io/fetch/{u}',
    'cors-eu': 'https://cors.eu.org/{raw}',
    'whateverorigin': 'https://whateverorigin.org/get?url={u}',
    'everyorigin': 'https://everyorigin.jwvbremen.nl/api/get?url={u}',
}
def via(name, url):
    return PROXIES[name].format(u=urllib.parse.quote(url, safe=''), raw=url)
def media_urls(text):
    out = []
    for pat in [r'"contentUrl"\s*:\s*"([^"]+)"', r'"mediaUrl"\s*:\s*"([^"]+\.mp4[^"]*)"', r'"video_url"\s*:\s*"([^"]+)"',
                r'"video_versions"\s*:\s*\[\s*\{[^\]]*?"url"\s*:\s*"([^"]+)"', r'<meta[^>]+property="og:video(?::secure_url)?"[^>]+content="([^"]+)"']:
        for m in re.finditer(pat, text):
            u = html.unescape(m.group(1)).replace('\\/', '/').replace('\\u0026', '&')
            if u.startswith('http') and u not in out: out.append(u)
    return out
live = json.load(open('out/live.json'))
rep = live.setdefault('report', {})
# find real sample links
c, h, b = req('https://www.snapchat.com/spotlight', limit=4_000_000)
t = b.decode('utf-8', 'replace')
snap = re.findall(r'https?://www\.snapchat\.com/spotlight/[A-Za-z0-9_\-]{20,}', t) or ['https://www.snapchat.com/spotlight/' + x for x in re.findall(r'/spotlight/([A-Za-z0-9_\-]{30,})', t)]
rep['snapchat sample'] = snap[:2] or 'none (%s, %d bytes)' % (c, len(b))
SAMPLES = {}
if snap: SAMPLES['snapchat'] = snap[0]
SAMPLES['threads'] = 'https://www.threads.com/@zuck/post/C8JxoqESoHm'
SAMPLES['instagram'] = 'https://www.instagram.com/reel/C2wYV3cO6hX/embed/captioned/'
# direct (no relay) from the GitHub machine, to know if the page has the video at all
for site, url in SAMPLES.items():
    c, h, b = req(url)
    rep['direct ' + site] = '%s, %d bytes, media=%s' % (c, len(b), media_urls(b.decode('utf-8', 'replace'))[:1])
live['relays'] = {}
for site, url in SAMPLES.items():
    for name in PROXIES:
        c, h, b = req(via(name, url))
        txt = b.decode('utf-8', 'replace')
        if 'whateverorigin' in name or 'everyorigin' in name:
            try: txt = json.loads(txt).get('contents') or ''
            except Exception: pass
        found = media_urls(txt)
        res = '%s acao=%s %d bytes media=%d' % (c, h.get('access-control-allow-origin'), len(b), len(found))
        if found and h.get('access-control-allow-origin'):
            # can the browser then fetch the video file itself (directly or through the same relay)?
            c2, h2, b2 = req(found[0], limit=200_000)
            direct_ok = c2 in (200, 206) and len(b2) > 1000 and h2.get('access-control-allow-origin')
            c3, h3, b3 = req(via(name, found[0]), limit=200_000)
            relay_ok = c3 in (200, 206) and len(b3) > 1000 and h3.get('access-control-allow-origin') and not b3[:20].strip().startswith(b'{')
            res += ' | file direct=%s(%s,acao=%s) relay=%s(%s)' % (bool(direct_ok), c2, h2.get('access-control-allow-origin'), bool(relay_ok), c3)
            if direct_ok or relay_ok:
                live['relays'].setdefault(site, []).append({'relay': name, 'file': 'direct' if direct_ok else 'relay'})
        rep['relay %s %s' % (name, site)] = res
json.dump(live, open('out/live.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in rep.items() if 'relay' in k or 'sample' in k or 'direct' in k}, indent=1))
print('relays', live['relays'])
