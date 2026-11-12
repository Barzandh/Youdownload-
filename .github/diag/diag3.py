import json, urllib.request, urllib.error
ORIGIN='https://barzandh.github.io'
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
def req(url, headers=None, limit=300_000, timeout=30):
    h={'Origin':ORIGIN,'User-Agent':UA}; h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=timeout) as r:
            return r.status,{k.lower():v for k,v in r.headers.items()},r.read(limit),r.geturl()
    except urllib.error.HTTPError as e: return e.code,{k.lower():v for k,v in e.headers.items()},e.read(limit),url
    except Exception as e: return 0,{},str(e)[:150].encode(),url
out={}
for base in ['https://yt.chocolatemoo53.com','https://invidious.privacyredirect.com','https://iv.melmac.space','https://invidious.protokolla.fi','https://inv.in.projectsegfau.lt','https://invidious.materialio.us','https://iv.datura.network','https://invidious.einfachzocken.eu','https://yt.artemislena.eu','https://invidious.reallyaweso.me','https://invidious.adminforge.de','https://invi.susurrando.com','https://invidious.lunivers.trade','https://iv.ggtyler.dev','https://invidious.private.coffee']:
  for vid in ['P6YamGRrn9Y','jNQXAC9IVRw']:
    c,h,b,_=req(base+'/api/v1/videos/'+vid+'?local=true')
    rec={'code':c,'acao':h.get('access-control-allow-origin')}
    try:
        j=json.loads(b); rec['title']=(j.get('title') or j.get('error') or '')[:60]
        ad=j.get('adaptiveFormats') or []; fs=j.get('formatStreams') or []
        rec['fs']=[(f.get('itag'),f.get('resolution')) for f in fs]
        v=[f for f in ad if (f.get('type') or '').startswith('video/mp4') and 'avc1' in (f.get('type') or '')]
        a=[f for f in ad if (f.get('type') or '').startswith('audio/mp4')]
        rec['v']=[(f.get('itag'),f.get('qualityLabel'),f.get('clen')) for f in v]; rec['a']=[(f.get('itag'),f.get('clen')) for f in a]
        tests=[]
        for f in (v[:1]+a[:1]+fs[:1]):
            u=f['url']; u=u if u.startswith('http') else base+u
            c2,h2,b2,final=req(u,{'Range':'bytes=0-299999'})
            tests.append([f.get('itag'),c2,h2.get('access-control-allow-origin'),len(b2),h2.get('content-type'),h2.get('content-range'),final.split('/')[2]])
        rec['fetch']=tests
    except Exception as e: rec['raw']=b[:100].decode('utf-8','replace')
    out[base+' '+vid]=rec; print(base,vid,json.dumps(rec,ensure_ascii=False)[:700],flush=True)
    if c!=200: break
json.dump(out,open('diag3.json','w'),indent=1,ensure_ascii=False)
