/* VidVault service worker — makes the app open instantly, with or without internet.
 *
 * The whole app (a handful of files) is stored on the device when this version installs.
 * Every launch is served from that copy and never waits for the network. When you're online,
 * the browser quietly checks for a newer sw.js; the new version downloads in the background
 * and is used from the next launch. Downloaded videos live in IndexedDB, not in this cache.
 */
const VERSION = 'dev';                 // replaced with the commit id when published
const CACHE = 'vidvault-shell-' + VERSION;
const SHELL = ['index.html', 'app.css', 'app.js', 'i18n.js', 'manifest.webmanifest', 'instances.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png'];
const abs = (p) => new URL(p, self.registration.scope).href;

// Safari refuses to show a page from a "redirected" response, so store clean copies only
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // all files or nothing: if one fails (offline, flaky network) the old version keeps working
    const copies = await Promise.all(SHELL.map(async (p) => {
      const res = await fetch(new Request(abs(p), { cache: 'reload' }));
      if (!res.ok) throw new Error(p + ' ' + res.status);
      return [p, await clean(res)];
    }));
    for (const [p, res] of copies) await cache.put(abs(p), res);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vidvault-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function fromCache(url) {
  const cache = await caches.open(CACHE);
  return (await cache.match(url, { ignoreSearch: true })) || (await caches.match(url, { ignoreSearch: true }));
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // download servers, thumbnails: straight to the network

  // opening the app (any address inside it) → the stored page, instantly
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await fromCache(abs('index.html'));
      if (cached) return cached;
      try { return await clean(await fetch(req)); } catch (err) { return new Response('<h1>VidVault</h1><p>Open the app once with internet to finish installing it.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    })());
    return;
  }

  // the list of public download servers: fresh when online (short wait), stored copy otherwise
  if (url.pathname.endsWith('/instances.json')) {
    e.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-store' }), 4000);
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(abs('instances.json'), copy)); }
        return res;
      } catch (err) {
        return (await fromCache(abs('instances.json'))) || new Response('{"instances":[]}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // app files → stored copy first; anything not stored yet comes from the network
  e.respondWith((async () => {
    const cached = await fromCache(req.url);
    if (cached) return cached;
    const res = await fetch(req);
    return clean(res);
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
