/* VidVault — one interface for the web app (iPhone/iPad/desktop) and the Android app.
 * On Android the page talks to the phone through window.VVAndroid (yt-dlp runs on the device).
 * On the web it talks to a VidVault server (server/ in the repo) and keeps videos in IndexedDB. */
'use strict';

const APP_VERSION = '1.0.0';
const REPO = 'https://github.com/Barzandh/Youdownload-';
const WEB_URL = 'https://barzandh.github.io/Youdownload-/';
const APK_URL = REPO + '/releases/latest/download/VidVault.apk';
const N = window.VVAndroid || null;          // native bridge (Android only)
const IS_ANDROID_APP = !!N;

/* ============================== helpers ============================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function fmtBytes(b) {
  if (!b || b < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i];
}
function fmtDur(s) {
  s = Math.round(s || 0); if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
function fmtEta(s) { if (!s || s < 0 || !isFinite(s)) return ''; return fmtDur(s); }
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(S.lang === 'ar' ? 'ar' : undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
}
function numLocal(n) { return S.lang === 'ar' ? Number(n).toLocaleString('ar') : String(n); }

/* ============================== icons ============================== */
const I = {
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.66L12.2 6H18.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M4.5 10.5h15V18a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM9.5 13a.9.9 0 0 0 0 1.8h5a.9.9 0 0 0 0-1.8z" fill-rule="evenodd"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 8.5h3V3.8a1.3 1.3 0 0 1 2.6 0V8.5h3L12 13.3 6 8.5z" transform="translate(.7 0)"/><path d="M4 11h3.2l4.8 4.6 4.8-4.6H20v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" opacity=".9"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.5-3.9-9S9.4 5.5 12 3z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.4 2.3 2.6-.6.6 2.6 2.3 1.4-1.2 2.4 1.2 2.4-2.3 1.4-.6 2.6-2.6-.6L12 21.2l-1.4-2.3-2.6.6-.6-2.6-2.3-1.4L6.3 12 5.1 9.6l2.3-1.4.6-2.6 2.6.6z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.5C10 5 7.5 4.6 3.5 5v13c4-.4 6.5 0 8.5 1.5 2-1.5 4.5-1.9 8.5-1.5V5c-4-.4-6.5 0-8.5 1.5zM12 6.5v13"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/></svg>',
  shieldOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" fill="none" stroke="var(--bar)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tabs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="7" width="13" height="13" rx="2.5"/><path d="M4 15.5V6a2 2 0 0 1 2-2h9.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5zm2.2-.3l6.8 5.4 6.8-5.4z" fill-rule="evenodd"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h16v3H4zM5 13h6v8H6.5A1.5 1.5 0 0 1 5 19.5zM13 13h6v6.5a1.5 1.5 0 0 1-1.5 1.5H13zM11 9h2v3h-2z"/><path d="M12 9C10 5 6.5 5 7 7.2 7.4 9 12 9 12 9zm0 0c2-4 5.5-4 5-1.8C16.6 9 12 9 12 9z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM9.5 18a2.5 2.5 0 0 0 5 0z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 3.9a2 2 0 0 1 3.4 0l8 13.6A2 2 0 0 1 20 20.5H4a2 2 0 0 1-1.7-3zM11 9v5h2V9zm0 6.5v2h2v-2z" fill-rule="evenodd"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h.5A1.5 1.5 0 0 1 19 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10zm2 0h6V8a3 3 0 0 0-6 0z" fill-rule="evenodd"/></svg>',
  vpn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/><circle cx="12" cy="11.5" r="2.2"/><path d="M12 13.7V16"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9 9 0 0 1 12.4 0M9.2 16a4 4 0 0 1 5.6 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01" stroke-width="2.6" stroke-linecap="round"/></svg>',
  hd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9v6M10.5 9v6M7 12h3.5M13.5 9v6h1.8a3 3 0 0 0 0-6z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M3.5 17l5-4.5 3.5 3 3.5-3.5 5 4.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2l-.3-.8c-.4-1.1.4-2.2 1.6-2.2H17a4 4 0 0 0 4-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15.5" cy="7.8" r="1.2" fill="currentColor"/></svg>',
  lang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5.5 7M11 5c-.6 3.4-3 6.4-6.5 8M13 21l4-9 4 9M14.5 18h5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01" stroke-width="2.4" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 17.5V6.2l11-2.2v11.3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="6.5" cy="17.5" r="2.7"/><circle cx="17.5" cy="15.3" r="2.7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM19 5.8v12.4a.8.8 0 0 1-1.2.7L9 12.7a.8.8 0 0 1 0-1.4l8.8-6.2a.8.8 0 0 1 1.2.7z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5.8v12.4a.8.8 0 0 0 1.2.7L15 12.7a.8.8 0 0 0 0-1.4L6.2 5.1A.8.8 0 0 0 5 5.8z"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><rect x="8.5" y="3" width="7" height="3.5" rx="1.2" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6l2.1 2h7.3A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M10 13h6M13.5 10.5L16 13l-2.5 2.5" stroke-linecap="round"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  fp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6.5 6.5a8 8 0 0 1 11 0M5 11a7 7 0 0 1 14 0v1M8 20c1-2 1.5-4.5 1.5-8a2.5 2.5 0 0 1 5 0c0 3.5-.5 6.5-2 9M16.5 19c.6-1.7.9-4 .9-6.5"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5M12 8v4.5l3 2"/></svg>',
};

/* ============================== settings ============================== */
const DEFAULTS = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en',
  theme: 'system', accent: 'blue',
  search: 'google', ua: 'default', adblock: true,
  notify: false, pinHash: '', bio: false,
  proxyOn: false, proxy: '',
  engine: IS_ANDROID_APP ? 'device' : 'server',
  server: '', serverKey: '',
  quality: 'ask', h264: true, wifiOnly: false, autoGallery: false,
  wifiShare: false,
};
let S = Object.assign({}, DEFAULTS, safeJSON(localStorage.getItem('vv.settings'), {}));
function safeJSON(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function save(patch) {
  if (patch) Object.assign(S, patch);
  localStorage.setItem('vv.settings', JSON.stringify(S));
  if (N && N.setPrefs) try { N.setPrefs(JSON.stringify(S)); } catch (e) {}
}
let HISTORY = safeJSON(localStorage.getItem('vv.history'), []);
let BOOKMARKS = safeJSON(localStorage.getItem('vv.bookmarks'), null);
let FOLDERS = safeJSON(localStorage.getItem('vv.folders'), []);
let HIST_POS = -1;
const saveHistory = () => localStorage.setItem('vv.history', JSON.stringify(HISTORY.slice(0, 200)));
const saveBookmarks = () => localStorage.setItem('vv.bookmarks', JSON.stringify(BOOKMARKS));
const saveFolders = () => localStorage.setItem('vv.folders', JSON.stringify(FOLDERS));

const t = (k, v) => window.VV_T(S.lang, k, v);

function applyLook() {
  const root = document.documentElement;
  const dark = S.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.accent = S.accent;
  root.lang = S.lang; root.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#000000' : '#f2f2f7';
  if (N && N.setLook) try { N.setLook(dark, getComputedStyle(root).getPropertyValue('--accent').trim()); } catch (e) {}
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.theme === 'system') { applyLook(); } });

/* ============================== platforms ============================== */
const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', abbr: 'FB', re: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i, home: 'https://m.facebook.com/watch/', bg: 'linear-gradient(135deg,#1877f2,#0a58c9)' },
  { id: 'instagram', name: 'Instagram', abbr: 'IG', re: /(^|\.)(instagram\.com|instagr\.am)$/i, home: 'https://www.instagram.com/', bg: 'linear-gradient(45deg,#f9a825,#e91e63 45%,#8e24aa)' },
  { id: 'twitter', name: 'X', abbr: 'X', re: /(^|\.)(twitter\.com|x\.com|t\.co)$/i, home: 'https://x.com/', bg: 'linear-gradient(135deg,#222,#000)' },
  { id: 'youtube', name: 'YouTube', abbr: 'YT', re: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i, home: 'https://m.youtube.com/', bg: 'linear-gradient(135deg,#ff2d2d,#d40000)' },
  { id: 'tiktok', name: 'TikTok', abbr: 'TT', re: /(^|\.)(tiktok\.com)$/i, home: 'https://www.tiktok.com/', bg: 'linear-gradient(135deg,#25f4ee,#111 40%,#111 60%,#fe2c55)' },
  { id: 'threads', name: 'Threads', abbr: 'TH', re: /(^|\.)(threads\.net|threads\.com)$/i, home: 'https://www.threads.com/', bg: 'linear-gradient(135deg,#444,#000)' },
];
const OTHER = { id: 'other', name: 'Web', abbr: 'WEB', bg: 'linear-gradient(135deg,#8e8e93,#636366)' };
function platformOf(url) {
  try { const h = new URL(url).hostname; return PLATFORMS.find((p) => p.re.test(h)) || OTHER; } catch (e) { return OTHER; }
}
const platformById = (id) => PLATFORMS.find((p) => p.id === id) || OTHER;
function extractUrl(text) {
  if (!text) return '';
  const m = String(text).match(/https?:\/\/[^\s<>"']+/i);
  if (m) return m[0].replace(/[),.;!]+$/, '');
  const s = String(text).trim();
  if (/^(www\.|m\.)?[a-z0-9-]+\.(com|net|be|watch|tv)\/\S+/i.test(s)) return 'https://' + s;
  return '';
}
const SEARCH = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  yahoo: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
  yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=' },
};

/* ============================== native bridge ============================== */
const pending = new Map();
let reqSeq = 0;
function nativeCall(fn, ...args) {
  return new Promise((resolve, reject) => {
    const id = 'r' + (++reqSeq);
    pending.set(id, { resolve, reject });
    try { N[fn](id, ...args); } catch (e) { pending.delete(id); reject(e); }
  });
}
window.VV = {
  cb(id, ok, payload) {
    const p = pending.get(id); if (!p) return; pending.delete(id);
    let data = payload; try { data = JSON.parse(payload); } catch (e) {}
    ok ? p.resolve(data) : p.reject(new Error(typeof data === 'string' ? data : (data && data.error) || 'Error'));
  },
  job(json) { const j = typeof json === 'string' ? safeJSON(json, null) : json; if (j) Jobs.update(j); },
  event(name, json) {
    const d = typeof json === 'string' ? safeJSON(json, {}) : (json || {});
    if (name === 'download') { if (d.url) { addHistory(d.url, d.title); analyze(d.url); } }
    else if (name === 'visit') { addHistory(d.url, d.title); }
    else if (name === 'shared') { const u = extractUrl(d.text || d.url); if (u) analyze(u); }
    else if (name === 'library') { Store.refresh().then(() => render()); }
    else if (name === 'bookmark' && d.url) {
      if (!BOOKMARKS) BOOKMARKS = defaultBookmarks();
      if (!BOOKMARKS.some((b) => b.url === d.url)) { BOOKMARKS.unshift({ url: d.url, title: d.title || d.url }); saveBookmarks(); }
    }
  },
  back() { return goBack(); },
};

/* ============================== storage ============================== */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('vidvault', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('items', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('thumbs'); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tr = db.transaction(store, mode); const st = tr.objectStore(store); let out;
      Promise.resolve(fn(st)).then((v) => { out = v; });
      tr.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
      tr.onerror = () => rej(tr.error); tr.onabort = () => rej(tr.error || new Error('aborted'));
    });
  },
  get(store, key) { return this.tx(store, 'readonly', (s) => s.get(key)); },
  all(store) { return this.tx(store, 'readonly', (s) => s.getAll()); },
  put(store, val, key) { return this.tx(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key))); },
  del(store, key) { return this.tx(store, 'readwrite', (s) => s.delete(key)); },
};

const Store = {
  items: [],
  urls: new Map(),   // object URLs for web blobs
  async refresh() {
    if (N) { this.items = safeJSON(N.library(), []); }
    else { try { this.items = await IDB.all('items'); } catch (e) { this.items = []; } }
    this.items.sort((a, b) => (b.created || 0) - (a.created || 0));
    return this.items;
  },
  get(id) { return this.items.find((x) => x.id === id); },
  async addWeb(item, blob, thumbBlob) {
    await IDB.put('blobs', blob, item.id);
    if (thumbBlob) { await IDB.put('thumbs', thumbBlob, item.id); item.hasThumb = true; }
    await IDB.put('items', item);
    await this.refresh();
  },
  async update(id, patch) {
    if (N) { N.updateItem(id, JSON.stringify(patch)); }
    else { const it = await IDB.get('items', id); if (it) await IDB.put('items', Object.assign(it, patch)); }
    await this.refresh();
  },
  async remove(id) {
    if (N) N.removeItem(id);
    else { await IDB.del('items', id); await IDB.del('blobs', id); await IDB.del('thumbs', id); }
    const u = this.urls.get(id); if (u) { URL.revokeObjectURL(u); this.urls.delete(id); }
    await this.refresh();
  },
  async mediaUrl(it) {
    if (N) return N.mediaBase() + '/media/' + encodeURIComponent(it.id);
    const b = await IDB.get('blobs', it.id); if (!b) throw new Error(t('err.missingFile'));
    return URL.createObjectURL(b);
  },
  thumbCache: new Map(),
  thumbUrl(it) {
    if (!it.hasThumb) return '';
    if (N) return N.mediaBase() + '/thumb/' + encodeURIComponent(it.id);
    return this.thumbCache.get(it.id) || '';
  },
  async loadThumbs() {
    if (N) return;
    for (const it of this.items) {
      if (it.hasThumb && !this.thumbCache.has(it.id)) {
        try { const b = await IDB.get('thumbs', it.id); if (b) this.thumbCache.set(it.id, URL.createObjectURL(b)); } catch (e) {}
      }
    }
  },
  totalSize() { return this.items.reduce((a, b) => a + (b.size || 0), 0); },
};

/* ============================== engines ============================== */
function serverBase() { return (S.server || '').trim().replace(/\/+$/, ''); }
function serverHeaders(json) { const h = {}; if (S.serverKey) h['X-Key'] = S.serverKey; if (json) h['Content-Type'] = 'application/json'; return h; }
async function serverFetch(path, opts = {}) {
  const base = serverBase(); if (!base) { const e = new Error('NO_SERVER'); e.code = 'NO_SERVER'; throw e; }
  let r;
  try { r = await fetch(base + path, Object.assign({ headers: serverHeaders(!!opts.body) }, opts)); }
  catch (e) { const er = new Error(t('err.serverUnreachable')); er.code = 'UNREACHABLE'; throw er; }
  if (r.status === 401) throw new Error(t('err.badKey'));
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || ('HTTP ' + r.status));
  return data;
}
function useServer() { return !IS_ANDROID_APP || S.engine === 'server'; }
const proxyArg = () => (S.proxyOn && S.proxy ? S.proxy.trim() : '');

const Engine = {
  async info(url) {
    if (useServer()) return serverFetch('/api/info?url=' + encodeURIComponent(url) + (proxyArg() ? '&proxy=' + encodeURIComponent(proxyArg()) : ''));
    return nativeCall('info', url, JSON.stringify({ proxy: proxyArg() }));
  },
};

/* ============================== download jobs ============================== */
const Jobs = {
  list: [],
  get(id) { return this.list.find((j) => j.id === id); },
  update(j) {
    let cur = this.get(j.id);
    if (!cur) { cur = j; this.list.unshift(cur); } else Object.assign(cur, j);
    if (cur.status === 'done') {
      Store.refresh().then(() => { Store.loadThumbs().then(() => { if (State.tab !== 'browser') render(); }); });
      notifyDone(cur);
    }
    renderJob(cur); updateBadge();
  },
  active() { return this.list.filter((j) => !['done', 'error', 'canceled'].includes(j.status)); },
  async start(spec) {
    const job = Object.assign({ id: uid(), status: 'queued', progress: 0, created: Date.now() }, spec);
    this.list.unshift(job); updateBadge();
    if (!useServer()) {
      N.download(JSON.stringify(Object.assign({}, job, { proxy: proxyArg() })));
    } else {
      this.runServer(job).catch((e) => this.update({ id: job.id, status: 'error', error: e.message || String(e) }));
    }
    return job;
  },
  cancel(id) {
    const j = this.get(id); if (!j) return;
    j.canceled = true;
    if (N) try { N.cancel(id); } catch (e) {}
    if (j.serverJob) serverFetch('/api/jobs/' + j.serverJob, { method: 'DELETE' }).catch(() => {});
    if (j.abort) j.abort.abort();
    this.update({ id, status: 'canceled' });
  },
  clearFinished() { this.list = this.list.filter((j) => !['done', 'error', 'canceled'].includes(j.status)); },
  async runServer(job) {
    const created = await serverFetch('/api/jobs', { method: 'POST', body: JSON.stringify({ url: job.url, format: job.format, kind: job.kind, item: job.item || null, proxy: proxyArg() }) });
    job.serverJob = created.id;
    this.update({ id: job.id, status: 'downloading', phase: 'server' });
    // 1) the server downloads + merges
    let st;
    for (;;) {
      if (job.canceled) return;
      await sleep(1000);
      st = await serverFetch('/api/jobs/' + created.id);
      if (st.status === 'error') throw new Error(st.error || 'Download failed');
      if (st.status === 'ready') break;
      this.update({ id: job.id, status: st.status === 'processing' ? 'processing' : 'downloading', progress: (st.progress || 0) * (N ? 0.7 : 0.6), speed: st.speed, eta: st.eta, phase: 'server' });
    }
    const fileUrl = serverBase() + '/api/jobs/' + created.id + '/file' + (S.serverKey ? '?key=' + encodeURIComponent(S.serverKey) : '');
    const thumbUrl = job.thumbnail ? serverBase() + '/api/thumb?url=' + encodeURIComponent(job.thumbnail) + (S.serverKey ? '&key=' + encodeURIComponent(S.serverKey) : '') : '';
    if (N) {
      // Android app using a server: the phone fetches the finished file natively (no size limit)
      N.downloadHttp(JSON.stringify(Object.assign({}, job, { fileUrl, thumbUrl, ext: st.ext, size: st.size, startProgress: 70 })));
      setTimeout(() => serverFetch('/api/jobs/' + created.id, { method: 'DELETE' }).catch(() => {}), 10 * 60 * 1000);
      return;
    }
    // 2) the browser copies the finished file into its offline storage
    job.abort = new AbortController();
    const r = await fetch(fileUrl, { signal: job.abort.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const total = +r.headers.get('Content-Length') || st.size || 0;
    const type = r.headers.get('Content-Type') || (job.kind === 'video' ? 'video/mp4' : 'audio/mp4');
    const reader = r.body.getReader(); const parts = []; let got = 0, t0 = Date.now(), lastUi = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); got += value.length;
      const now = Date.now();
      if (now - lastUi > 400) {
        lastUi = now; const speed = got / ((now - t0) / 1000);
        this.update({ id: job.id, status: 'saving', phase: 'device', progress: 60 + (total ? (got / total) * 40 : 20), speed, eta: total ? (total - got) / speed : 0 });
      }
    }
    const blob = new Blob(parts, { type });
    let thumbBlob = null;
    if (thumbUrl) { try { const tr = await fetch(thumbUrl); if (tr.ok) thumbBlob = await tr.blob(); } catch (e) {} }
    const item = {
      id: job.id, title: job.title || 'Video', platform: job.platform, folder: job.folder || '', kind: job.kind, quality: job.quality,
      ext: st.ext || (job.kind === 'mp3' ? 'mp3' : job.kind === 'm4a' ? 'm4a' : 'mp4'), size: blob.size, duration: job.duration || 0,
      created: Date.now(), source: job.url, uploader: job.uploader || '', mime: type,
    };
    await Store.addWeb(item, blob, thumbBlob);
    if (thumbBlob) Store.thumbCache.set(item.id, URL.createObjectURL(thumbBlob));
    serverFetch('/api/jobs/' + created.id, { method: 'DELETE' }).catch(() => {});
    this.update({ id: job.id, status: 'done', progress: 100, item });
  },
};
function updateBadge() {
  const b = $('#tabbar [data-tab="downloads"] .badge'); if (!b) return;
  const n = Jobs.active().length; b.textContent = n; b.classList.toggle('hidden', !n);
}
async function notifyDone(job) {
  if (!S.notify) return;
  if (N) return; // native posts its own notification
  try {
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const title = job.status === 'done' ? t('notif.done') : t('notif.failed');
    if (reg) reg.showNotification(title, { body: job.title || '', icon: 'icons/icon-192.png', tag: job.id });
    else new Notification(title, { body: job.title || '' });
  } catch (e) {}
}

/* ============================== quality list ============================== */
function codecName(v) {
  v = (v || '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v.startsWith('avc') || v.startsWith('h264')) return 'H.264';
  if (v.startsWith('hev') || v.startsWith('hvc') || v.startsWith('h265')) return 'H.265';
  if (v.startsWith('vp9') || v.startsWith('vp09')) return 'VP9';
  if (v.startsWith('av01')) return 'AV1';
  return v.split('.')[0].toUpperCase();
}
const isCompat = (f) => !f.vcodec || /^(avc|h264)/i.test(f.vcodec);
const hasAudio = (f) => f.acodec && f.acodec !== 'none';
const audioUnknown = (f) => f.acodec == null || f.acodec === '';
function fSize(f, dur) { return f.filesize || f.filesize_approx || (f.tbr && dur ? f.tbr * 125 * dur : 0); }
function buildChoices(info) {
  const dur = info.duration || 0;
  const fm = (info.formats || []).filter((f) => f && f.protocol !== 'mhtml' && !/storyboard|images/i.test(f.format_note || '') && f.ext !== 'mhtml');
  const audios = fm.filter((f) => f.vcodec === 'none' && hasAudio(f));
  const bestA = audios.slice().sort((a, b) => ((b.ext === 'm4a') - (a.ext === 'm4a')) || ((b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)))[0];
  const aSize = bestA ? fSize(bestA, dur) : 0;
  const vids = fm.filter((f) => f.vcodec !== 'none' && (f.height || 0) > 0);
  const buckets = new Map();
  for (const f of vids) {
    const hi = f.fps && f.fps >= 49 ? Math.round(f.fps) : 0;
    const key = f.height + 'p' + (hi || '');
    const cur = buckets.get(key);
    const score = (x) => (S.h264 && isCompat(x) ? 4e6 : 0) + (x.ext === 'mp4' ? 2e6 : 0) + (hasAudio(x) ? 1e6 : 0) + (x.tbr || 0) * 10 + (fSize(x, dur) / 1e6);
    if (!cur || score(f) > score(cur)) buckets.set(key, f);
  }
  const out = [];
  [...buckets.entries()].sort((a, b) => (b[1].height - a[1].height) || ((b[1].fps || 0) - (a[1].fps || 0))).forEach(([key, f]) => {
    const h = f.height, merge = f.acodec === 'none';
    const sel = merge ? `${f.format_id}+bestaudio[ext=m4a]/${f.format_id}+bestaudio/${f.format_id}/bv*[height<=${h}]+ba/b[height<=${h}]/b`
      : `${f.format_id}/b[height<=${h}]/bv*[height<=${h}]+ba/b`;
    const size = fSize(f, dur) + (merge ? aSize : 0);
    const tag = h >= 4320 ? '8K' : h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 720 ? 'HD' : 'SD';
    const hdr = f.dynamic_range && f.dynamic_range !== 'SDR' ? ' HDR' : '';
    out.push({ key, label: key + hdr, tag, height: h, kind: 'video', format: sel, size,
      sub: ['MP4', codecName(f.vcodec), f.width && f.height ? f.width + '×' + f.height : ''].filter(Boolean).join(' · ') });
  });
  if (!out.length) {
    const other = fm.filter((f) => f.vcodec !== 'none');
    other.forEach((f, i) => out.push({ key: 'f' + i, label: f.format_note || f.resolution || f.format_id || t('q.original'), tag: '', kind: 'video',
      format: audioUnknown(f) || hasAudio(f) ? f.format_id + '/b' : f.format_id + '+bestaudio/' + f.format_id, size: fSize(f, dur),
      sub: [(f.ext || '').toUpperCase(), codecName(f.vcodec)].filter(Boolean).join(' · ') }));
    if (!out.length) out.push({ key: 'best', label: t('q.original'), tag: '', kind: 'video', format: 'b/bv*+ba', size: 0, sub: t('q.bestAvailable') });
  }
  if (audios.length || vids.some(hasAudio) || out.length) {
    out.push({ key: 'm4a', label: t('q.audio') + ' · M4A', tag: 'AUD', kind: 'm4a', format: 'bestaudio[ext=m4a]/bestaudio/b', size: aSize, sub: t('q.audioSub') + (bestA && bestA.abr ? ' · ' + Math.round(bestA.abr) + ' kbps' : '') });
    out.push({ key: 'mp3', label: t('q.audio') + ' · MP3', tag: 'MP3', kind: 'mp3', format: 'bestaudio/b', size: aSize, sub: t('q.mp3Sub') });
  }
  return out;
}
function pickDefault(choices) {
  const vids = choices.filter((c) => c.kind === 'video');
  if (S.quality === 'best') return vids[0];
  if (S.quality === 'audio') return choices.find((c) => c.kind === 'm4a');
  const max = parseInt(S.quality, 10);
  if (max) return vids.find((c) => (c.height || 0) <= max) || vids[vids.length - 1];
  return null;
}

/* ============================== UI state ============================== */
const State = { tab: localStorage.getItem('vv.tab') || 'browser', folder: null, editing: false, selected: new Set(), query: '', settingsPage: null, dlFilter: 'all' };

function setTab(tab) {
  State.tab = tab; State.editing = false; State.selected.clear(); State.settingsPage = null;
  if (tab !== 'folders') State.folder = null;
  localStorage.setItem('vv.tab', tab);
  render(); $('#main').scrollTop = 0;
}
function goBack() {
  if ($('.lock')) return true;
  if (hasLayer()) { closeTop(); return true; }
  if (State.tab === 'settings' && State.settingsPage) { State.settingsPage = null; render(); return true; }
  if (State.tab === 'folders' && (State.editing || State.folder)) { if (State.editing) { State.editing = false; State.selected.clear(); } else State.folder = null; render(); return true; }
  if (State.tab !== 'browser') { setTab('browser'); return true; }
  return false;
}

function renderTabbar() {
  const tabs = [['folders', I.archive], ['downloads', I.download], ['browser', I.globe], ['settings', I.gear]];
  $('#tabbar').innerHTML = tabs.map(([k, ic]) => `<button data-tab="${k}" class="${State.tab === k ? 'on' : ''}">${ic}<span>${t('tab.' + k)}</span>${k === 'downloads' ? '<b class="badge hidden"></b>' : ''}</button>`).join('');
  $$('#tabbar button').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  updateBadge();
}
function setTopbar(title, left = '', right = '') {
  $('#title').textContent = title; $('#tbLeft').innerHTML = left; $('#tbRight').innerHTML = right;
}

function render() {
  renderTabbar();
  $('#toolbar').classList.toggle('hidden', State.tab !== 'browser');
  const m = $('#main');
  if (State.tab === 'browser') renderBrowser(m);
  else if (State.tab === 'downloads') renderDownloads(m);
  else if (State.tab === 'folders') renderFolders(m);
  else renderSettings(m);
}

/* ---------------------------- Browser tab ---------------------------- */
function renderBrowser(m) {
  setTopbar(t('tab.browser'));
  const recent = HISTORY.slice(0, 6);
  m.innerHTML = `<div class="tab">
    <form class="searchbar" id="sform">${I.search}<input id="sinput" type="search" inputmode="url" enterkeyhint="go" autocomplete="off" autocapitalize="off" placeholder="${esc(t('browser.placeholder'))}"></form>
    <div class="tiles">${PLATFORMS.map((p) => `<button class="tile" data-p="${p.id}"><span class="tl" style="background:${p.bg}">${p.abbr}</span>${esc(p.name)}</button>`).join('')}</div>
    <div class="pastecard">
      <h3>${esc(t('paste.title'))}</h3>
      <p>${esc(t('paste.sub'))}</p>
      <div class="pc-row"><input id="plink" type="url" inputmode="url" placeholder="https://…" autocomplete="off" autocapitalize="off">
      <button class="btn white" id="pgo">${I.download}${esc(t('paste.go'))}</button></div>
      <div class="pc-row" style="margin-top:8px"><button class="btn glass" id="ppaste" style="flex:1">${I.paste}${esc(t('paste.paste'))}</button></div>
    </div>
    ${!IS_ANDROID_APP ? `<p class="hint">${esc(t('browser.webHint'))}</p>` : `<p class="hint">${esc(t('browser.appHint'))}</p>`}
    ${recent.length ? `<div class="group-title">${esc(t('browser.recent'))}</div><div class="group">${recent.map((h, i) => `<button class="row tap" data-h="${i}"><span class="ic">${I.history}</span><span class="lbl">${esc(h.title || h.url)}<small>${esc(h.url)}</small></span></button>`).join('')}</div>` : ''}
  </div>`;
  $('#sform').onsubmit = (e) => { e.preventDefault(); const v = $('#sinput').value.trim(); if (v) go(v); };
  $$('.tile', m).forEach((b) => b.onclick = () => openSite(platformById(b.dataset.p).home));
  $('#pgo').onclick = () => { const u = extractUrl($('#plink').value); u ? analyze(u) : toast(t('err.noLink')); };
  $('#plink').onkeydown = (e) => { if (e.key === 'Enter') $('#pgo').click(); };
  $('#ppaste').onclick = pasteAndGo;
  $$('[data-h]', m).forEach((b) => b.onclick = () => go(HISTORY[+b.dataset.h].url));
  renderToolbar();
}
function renderToolbar() {
  const canBack = HISTORY.length > 0 && HIST_POS < HISTORY.length - 1;
  const canFwd = HIST_POS > 0;
  $('#toolbar').innerHTML = `
    <button id="tbBack" ${canBack ? '' : 'disabled'} aria-label="back"><span class="flip">${I.back}</span></button>
    <button id="tbFwd" ${canFwd ? '' : 'disabled'} aria-label="forward"><span class="flip">${I.fwd}</span></button>
    <button id="tbShare" aria-label="share">${I.share}</button>
    <button id="tbBook" aria-label="bookmarks">${I.book}</button>
    <button id="tbShield" aria-label="ad block">${S.adblock ? I.shieldOn : I.shield}</button>
    <button id="tbTabs" aria-label="pages">${I.tabs}</button>`;
  $('#tbBack').onclick = () => { HIST_POS = Math.min(HISTORY.length - 1, HIST_POS + 1); openSite(HISTORY[HIST_POS].url, true); renderToolbar(); };
  $('#tbFwd').onclick = () => { HIST_POS = Math.max(0, HIST_POS - 1); openSite(HISTORY[HIST_POS].url, true); renderToolbar(); };
  $('#tbShare').onclick = () => shareText(HISTORY[0] ? HISTORY[0].url : WEB_URL, HISTORY[0] ? HISTORY[0].title : 'VidVault');
  $('#tbBook').onclick = showBookmarks;
  $('#tbShield').onclick = () => { save({ adblock: !S.adblock }); renderToolbar(); toast(S.adblock ? t('adblock.on') : t('adblock.off')); };
  $('#tbTabs').onclick = showHistory;
}
function go(input) {
  const u = extractUrl(input);
  if (u) { const p = platformOf(u); if (p !== OTHER && looksLikeVideo(u)) return analyze(u); return openSite(u); }
  openSite(SEARCH[S.search].url + encodeURIComponent(input));
}
function looksLikeVideo(u) {
  try {
    const x = new URL(u); const p = x.pathname;
    if (/youtu\.be$/i.test(x.hostname)) return p.length > 1;
    if (/youtube/i.test(x.hostname)) return /^\/(watch|shorts|live|embed)/.test(p) || x.searchParams.has('v');
    if (/instagram/i.test(x.hostname)) return /^\/(p|reel|reels|tv|stories)\//.test(p);
    if (/tiktok/i.test(x.hostname)) return /\/video\/|\/v\/|^\/t\//.test(p) || /^vm\.|^vt\./.test(x.hostname);
    if (/twitter|x\.com/i.test(x.hostname)) return /\/status\//.test(p) || x.hostname === 't.co';
    if (/threads/i.test(x.hostname)) return /\/post\//.test(p);
    if (/facebook|fb\./i.test(x.hostname)) return /video|watch|reel|\/share\/|story/.test(p + x.search) || /fb\.watch/.test(x.hostname);
  } catch (e) {}
  return false;
}
function openSite(url, fromNav) {
  if (!fromNav) { addHistory(url); HIST_POS = 0; }
  if (N) { N.openBrowser(url, JSON.stringify({ ua: S.ua, adblock: S.adblock })); return; }
  window.open(url, '_blank', 'noopener');
}
function addHistory(url, title) {
  if (!url) return;
  HISTORY = HISTORY.filter((h) => h.url !== url);
  HISTORY.unshift({ url, title: title || '', at: Date.now() });
  saveHistory();
  if (State.tab === 'browser') renderToolbar();
}
async function pasteAndGo() {
  let text = '';
  try { text = N && N.clipboard ? N.clipboard() : await navigator.clipboard.readText(); } catch (e) {}
  const u = extractUrl(text);
  if (u) { const i = $('#plink'); if (i) i.value = u; analyze(u); }
  else { toast(t('err.noLinkClipboard')); const i = $('#plink'); if (i) i.focus(); }
}
function defaultBookmarks() { return PLATFORMS.map((p) => ({ url: p.home, title: p.name })); }
function showBookmarks() {
  if (!BOOKMARKS) BOOKMARKS = defaultBookmarks();
  const cur = HISTORY[0];
  const body = `<div class="group">${BOOKMARKS.map((b, i) => `<div class="row"><span class="ic">${I.star}</span><button class="lbl" data-open="${i}" style="text-align:start">${esc(b.title || b.url)}<small>${esc(b.url)}</small></button><button class="more" data-del="${i}" aria-label="delete" style="color:var(--danger)">${I.trash}</button></div>`).join('') || `<div class="row noicon"><span class="lbl" style="color:var(--text-2)">${esc(t('bm.empty'))}</span></div>`}</div>
    ${cur ? `<button class="btn ghost block" id="bmAdd" style="margin-top:14px">${I.plus}${esc(t('bm.addLast'))}</button>` : ''}
    <button class="btn ghost block" id="bmNew" style="margin-top:10px">${I.link}${esc(t('bm.addUrl'))}</button>`;
  const sh = sheet(t('bm.title'), body);
  $$('[data-open]', sh).forEach((b) => b.onclick = () => { closeTop(); openSite(BOOKMARKS[+b.dataset.open].url); });
  $$('[data-del]', sh).forEach((b) => b.onclick = () => { BOOKMARKS.splice(+b.dataset.del, 1); saveBookmarks(); closeTop(); showBookmarks(); });
  const add = $('#bmAdd', sh); if (add) add.onclick = () => { BOOKMARKS.unshift({ url: cur.url, title: cur.title || cur.url }); saveBookmarks(); closeTop(); showBookmarks(); };
  $('#bmNew', sh).onclick = async () => {
    const u = extractUrl(await prompt2(t('bm.addUrl'), '', 'https://')); if (!u) return;
    BOOKMARKS.unshift({ url: u, title: new URL(u).hostname }); saveBookmarks(); closeTop(); showBookmarks();
  };
}
function showHistory() {
  const body = HISTORY.length ? `<div class="group">${HISTORY.slice(0, 60).map((h, i) => `<button class="row tap" data-h="${i}"><span class="ic">${I.globe}</span><span class="lbl">${esc(h.title || h.url)}<small>${esc(h.url)}</small></span>${looksLikeVideo(h.url) ? `<span class="ic" data-dl="${i}">${I.download}</span>` : ''}</button>`).join('')}</div>`
    : `<div class="empty">${I.history}<b>${esc(t('hist.empty'))}</b></div>`;
  const sh = sheet(t('hist.title'), body, HISTORY.length ? t('hist.clear') : '', () => { HISTORY = []; saveHistory(); closeTop(); renderToolbar(); });
  $$('[data-h]', sh).forEach((b) => b.onclick = (e) => {
    const h = HISTORY[+b.dataset.h]; closeTop();
    if (e.target.closest('[data-dl]')) analyze(h.url); else openSite(h.url);
  });
}

/* ---------------------------- Downloads tab ---------------------------- */
function jobCard(j) {
  const p = platformById(j.platform);
  const pct = clamp(Math.round(j.progress || 0), 0, 100);
  const statusText = {
    queued: t('job.queued'), downloading: t('job.downloading'), processing: t('job.processing'), saving: t('job.saving'),
    done: t('job.done'), error: t('job.error'), canceled: t('job.canceled'), waitingWifi: t('job.waitingWifi'),
  }[j.status] || j.status;
  const bits = [statusText];
  if (['downloading', 'saving'].includes(j.status)) { if (j.speed) bits.push(fmtBytes(j.speed) + '/s'); if (j.eta) bits.push(fmtEta(j.eta)); bits.push(numLocal(pct) + '%'); }
  const indet = j.status === 'queued' || j.status === 'processing' || (j.status === 'downloading' && !pct);
  return `<div class="item" data-job="${esc(j.id)}">
    <div class="thumb" style="${j.thumbnail ? `background-image:url('${esc(j.thumbnail)}')` : ''}">${j.thumbnail ? '' : I.play}<span class="pf" style="background:${p.bg}">${p.abbr}</span></div>
    <div class="meta"><b>${esc(j.title || j.url)}</b><small class="${j.status === 'error' ? 'status-err' : ''}">${esc(j.status === 'error' ? (j.error || statusText) : bits.join(' · '))}</small>
      <small>${esc(j.quality || '')}</small>
      ${['done', 'error', 'canceled'].includes(j.status) ? '' : `<div class="prog ${indet ? 'indet' : ''}"><i style="width:${pct}%"></i></div>`}</div>
    ${['done', 'error', 'canceled'].includes(j.status)
      ? (j.status === 'done' ? `<button class="more" data-play="${esc(j.id)}" aria-label="play">${I.play}</button>` : `<button class="more" data-retry="${esc(j.id)}" aria-label="retry">${I.refresh}</button>`)
      : `<button class="more" data-cancel="${esc(j.id)}" aria-label="cancel">${I.close}</button>`}
  </div>`;
}
function renderJob(j) {
  if (State.tab !== 'downloads') return;
  const el = $(`[data-job="${CSS.escape(j.id)}"]`);
  if (!el) { renderDownloads($('#main')); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = jobCard(j);
  el.replaceWith(tmp.firstElementChild); bindJobButtons();
}
function bindJobButtons() {
  $$('[data-cancel]').forEach((b) => b.onclick = () => Jobs.cancel(b.dataset.cancel));
  $$('[data-retry]').forEach((b) => b.onclick = () => {
    const j = Jobs.get(b.dataset.retry); if (!j) return;
    Jobs.list = Jobs.list.filter((x) => x !== j);
    const spec = {}; ['url', 'item', 'format', 'kind', 'title', 'thumbnail', 'duration', 'platform', 'folder', 'uploader', 'quality'].forEach((k) => spec[k] = j[k]);
    Jobs.start(spec); renderDownloads($('#main'));
  });
  $$('[data-play]').forEach((b) => b.onclick = () => { const it = Store.get(b.dataset.play); if (it) play(it); });
}
function renderDownloads(m) {
  const act = Jobs.active(); const fin = Jobs.list.filter((j) => !act.includes(j));
  setTopbar(t('tab.downloads'), '', fin.length ? `<button id="clr">${esc(t('dl.clear'))}</button>` : '');
  const recent = Store.items.slice(0, 12);
  m.innerHTML = `<div class="tab">
    <div class="stats"><div class="stat"><b>${numLocal(Store.items.length)}</b><small>${esc(t('dl.saved'))}</small></div><div class="stat"><b>${fmtBytes(Store.totalSize()) || '0 B'}</b><small>${esc(t('dl.used'))}</small></div><div class="stat"><b>${numLocal(act.length)}</b><small>${esc(t('dl.active'))}</small></div></div>
    ${Jobs.list.length ? `<div class="section-h"><h2>${esc(t('dl.queue'))}</h2></div><div class="items">${Jobs.list.map(jobCard).join('')}</div>` : ''}
    ${recent.length ? `<div class="section-h"><h2>${esc(t('dl.recent'))}</h2><button id="seeAll">${esc(t('dl.seeAll'))}</button></div><div class="items">${recent.map(itemCard).join('')}</div>` : ''}
    ${!Jobs.list.length && !recent.length ? `<div class="empty">${I.download}<b>${esc(t('dl.emptyT'))}</b>${esc(t('dl.empty'))}<br><br><button class="btn accent" id="toBrowser">${esc(t('dl.start'))}</button></div>` : ''}
  </div>`;
  bindJobButtons(); bindItems(m);
  const c = $('#clr'); if (c) c.onclick = () => { Jobs.clearFinished(); render(); };
  const sa = $('#seeAll'); if (sa) sa.onclick = () => setTab('folders');
  const tb = $('#toBrowser'); if (tb) tb.onclick = () => setTab('browser');
}

/* ---------------------------- Folders tab ---------------------------- */
function itemCard(it) {
  const p = platformById(it.platform); const th = Store.thumbUrl(it);
  const sel = State.editing && State.selected.has(it.id);
  const sub = [it.quality, fmtBytes(it.size), fmtDate(it.created)].filter(Boolean).join(' · ');
  return `<div class="item ${sel ? 'sel' : ''}" data-item="${esc(it.id)}" role="button">
    ${State.editing ? `<span class="check">${sel ? I.check : ''}</span>` : ''}
    <div class="thumb" style="${th ? `background-image:url('${esc(th)}')` : ''}">${th ? '' : (it.kind === 'video' ? I.play : I.music)}${it.duration ? `<span class="dur">${fmtDur(it.duration)}</span>` : ''}<span class="pf" style="background:${p.bg}">${p.abbr}</span></div>
    <div class="meta"><b>${esc(it.title)}</b><small>${esc(sub)}</small>${it.uploader ? `<small>${esc(it.uploader)}</small>` : ''}</div>
    ${State.editing ? '' : `<button class="more" data-more="${esc(it.id)}" aria-label="more">${I.dots}</button>`}
  </div>`;
}
function bindItems(root) {
  $$('[data-item]', root).forEach((el) => el.onclick = (e) => {
    const id = el.dataset.item; const it = Store.get(id); if (!it) return;
    if (e.target.closest('[data-more]')) return itemMenu(it);
    if (State.editing) { State.selected.has(id) ? State.selected.delete(id) : State.selected.add(id); render(); return; }
    play(it);
  });
}
function folderList() {
  // built-in: all, audio, each platform that has items; then user folders
  const out = [{ id: '__all', name: t('f.all'), icon: I.folder, bg: 'var(--accent)', items: Store.items }];
  const audio = Store.items.filter((i) => i.kind !== 'video');
  out.push({ id: '__audio', name: t('f.audio'), icon: I.music, bg: 'linear-gradient(135deg,#ff9500,#ff5e3a)', items: audio });
  for (const p of PLATFORMS.concat([OTHER])) {
    const its = Store.items.filter((i) => (i.platform || 'other') === p.id);
    if (its.length) out.push({ id: '__p_' + p.id, name: p.name, abbr: p.abbr, bg: p.bg, items: its });
  }
  for (const f of FOLDERS) out.push({ id: f, name: f, icon: I.folder, bg: 'linear-gradient(135deg,#5ac8fa,#007aff)', items: Store.items.filter((i) => i.folder === f), user: true });
  return out;
}
function renderFolders(m) {
  const all = folderList();
  if (State.folder) {
    const f = all.find((x) => x.id === State.folder) || all[0];
    let items = f.items;
    if (State.query) { const q = State.query.toLowerCase(); items = items.filter((i) => (i.title + ' ' + (i.uploader || '')).toLowerCase().includes(q)); }
    setTopbar(f.name, `<button id="fback"><span class="flip" style="display:inline-block;vertical-align:middle">${I.back}</span></button>`, items.length ? `<button id="fedit">${esc(State.editing ? t('done') : t('edit'))}</button>` : '');
    m.innerHTML = `<div class="tab">
      <div class="searchbar" style="margin-bottom:12px">${I.search}<input id="fq" type="search" placeholder="${esc(t('f.search'))}" value="${esc(State.query)}"></div>
      ${State.editing ? `<div class="chips"><button class="chip" id="selAll">${esc(t('f.selectAll'))}</button><button class="chip" id="selMove" ${State.selected.size ? '' : 'disabled'}>${esc(t('f.moveSel', { n: State.selected.size }))}</button><button class="chip" id="selDel" style="color:var(--danger)" ${State.selected.size ? '' : 'disabled'}>${esc(t('f.deleteSel', { n: State.selected.size }))}</button></div>` : ''}
      <div class="items">${items.map(itemCard).join('') || `<div class="empty">${I.folder}<b>${esc(t('f.emptyT'))}</b>${esc(t('f.empty'))}</div>`}</div>
      ${f.user && !State.editing ? `<div style="display:flex;gap:10px;margin-top:18px"><button class="btn ghost" style="flex:1" id="frename">${I.edit}${esc(t('f.rename'))}</button><button class="btn ghost" style="flex:1;color:var(--danger)" id="fdel">${I.trash}${esc(t('f.delete'))}</button></div>` : ''}
    </div>`;
    $('#fback').onclick = () => { State.folder = null; State.editing = false; State.selected.clear(); State.query = ''; render(); };
    const fe = $('#fedit'); if (fe) fe.onclick = () => { State.editing = !State.editing; State.selected.clear(); render(); };
    const fq = $('#fq'); fq.oninput = () => { State.query = fq.value; const pos = fq.selectionStart; render(); const n = $('#fq'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    bindItems(m);
    const sa = $('#selAll'); if (sa) sa.onclick = () => { items.forEach((i) => State.selected.add(i.id)); render(); };
    const sm = $('#selMove'); if (sm) sm.onclick = async () => { const dest = await chooseFolder(); if (dest === null) return; for (const id of State.selected) await Store.update(id, { folder: dest }); State.selected.clear(); State.editing = false; render(); toast(t('f.moved')); };
    const sd = $('#selDel'); if (sd) sd.onclick = async () => { if (!(await confirm2(t('f.deleteQ', { n: State.selected.size }), t('f.deleteNote'), t('delete'), true))) return; for (const id of State.selected) await Store.remove(id); State.selected.clear(); State.editing = false; render(); };
    const fr = $('#frename'); if (fr) fr.onclick = async () => {
      const nn = (await prompt2(t('f.rename'), f.name, '')).trim(); if (!nn || nn === f.name || FOLDERS.includes(nn)) return;
      FOLDERS = FOLDERS.map((x) => (x === f.name ? nn : x)); saveFolders();
      for (const i of f.items) await Store.update(i.id, { folder: nn });
      State.folder = nn; render();
    };
    const fd = $('#fdel'); if (fd) fd.onclick = async () => {
      if (!(await confirm2(t('f.deleteFolderQ', { name: f.name }), t('f.deleteFolderNote'), t('delete'), true))) return;
      for (const i of f.items) await Store.update(i.id, { folder: '' });
      FOLDERS = FOLDERS.filter((x) => x !== f.name); saveFolders(); State.folder = null; render();
    };
    return;
  }
  setTopbar(t('tab.folders'), '', `<button id="fnew">${I.plus.replace('<svg', '<svg width="24" height="24"')}</button>`);
  m.innerHTML = `<div class="tab">
    <div class="folders">${all.map((f) => `<button class="folder" data-f="${esc(f.id)}"><span class="fi" style="background:${f.bg}">${f.icon || f.abbr}</span><b>${esc(f.name)}</b><small>${esc(f.items.length === 1 ? t('f.count1') : t('f.count', { n: numLocal(f.items.length) }))}${f.items.length ? ' · ' + fmtBytes(f.items.reduce((a, b) => a + (b.size || 0), 0)) : ''}</small></button>`).join('')}
      <button class="folder" id="fnew2" style="border:1.5px dashed var(--sep);background:none;align-items:center;justify-content:center;color:var(--accent)">${I.plus.replace('<svg', '<svg width="30" height="30"')}<b>${esc(t('f.new'))}</b></button></div>
    ${!Store.items.length ? `<div class="empty">${I.archive}<b>${esc(t('f.libEmptyT'))}</b>${esc(t('f.libEmpty'))}</div>` : ''}
  </div>`;
  $$('[data-f]', m).forEach((b) => b.onclick = () => { State.folder = b.dataset.f; State.query = ''; render(); $('#main').scrollTop = 0; });
  const nf = async () => {
    const n = (await prompt2(t('f.new'), '', t('f.namePh'))).trim();
    if (!n) return; if (FOLDERS.includes(n)) return toast(t('f.exists'));
    FOLDERS.push(n); saveFolders(); render();
  };
  $('#fnew').onclick = nf; $('#fnew2').onclick = nf;
}
async function chooseFolder(current) {
  const opts = [{ v: '', label: t('f.none') }].concat(FOLDERS.map((f) => ({ v: f, label: f }))).concat([{ v: '__new', label: '＋ ' + t('f.new') }]);
  const v = await pick(t('f.moveTo'), opts, current);
  if (v === null) return null;
  if (v === '__new') {
    const n = (await prompt2(t('f.new'), '', t('f.namePh'))).trim(); if (!n) return null;
    if (!FOLDERS.includes(n)) { FOLDERS.push(n); saveFolders(); }
    return n;
  }
  return v;
}
async function itemMenu(it) {
  const opts = [
    { v: 'play', label: t('m.play') },
    { v: 'share', label: t('m.share') },
    { v: 'save', label: IS_ANDROID_APP ? t('m.gallery') : t('m.saveFiles') },
    IS_ANDROID_APP ? { v: 'openwith', label: t('m.openWith') } : null,
    { v: 'move', label: t('m.move') },
    { v: 'rename', label: t('m.rename') },
    { v: 'source', label: t('m.source') },
    { v: 'delete', label: t('m.delete'), red: true },
  ].filter(Boolean);
  const v = await pick(it.title, opts);
  if (v === 'play') play(it);
  else if (v === 'share') shareItem(it);
  else if (v === 'save') saveItem(it);
  else if (v === 'openwith') N.openWith(it.id);
  else if (v === 'move') { const d = await chooseFolder(it.folder); if (d !== null) { await Store.update(it.id, { folder: d }); render(); toast(t('f.moved')); } }
  else if (v === 'rename') { const n = (await prompt2(t('m.rename'), it.title, '')).trim(); if (n) { await Store.update(it.id, { title: n }); render(); } }
  else if (v === 'source') openSite(it.source);
  else if (v === 'delete') { if (await confirm2(t('m.deleteQ'), it.title, t('delete'), true)) { await Store.remove(it.id); render(); } }
}
function fileName(it) { return (it.title || 'video').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() + '.' + (it.ext || 'mp4'); }
async function shareItem(it) {
  if (N) return N.shareItem(it.id);
  try {
    const b = await IDB.get('blobs', it.id);
    const file = new File([b], fileName(it), { type: it.mime || b.type || 'video/mp4' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: it.title });
    else saveItem(it);
  } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
}
async function saveItem(it) {
  if (N) { N.saveToGallery(it.id); return; }
  // iPhone: the share sheet offers "Save Video" (Photos) and "Save to Files"
  try {
    const b = await IDB.get('blobs', it.id);
    const file = new File([b], fileName(it), { type: it.mime || b.type || 'video/mp4' });
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
}

/* ---------------------------- Player ---------------------------- */
async function play(it, list) {
  list = list || (State.folder ? (folderList().find((f) => f.id === State.folder) || {}).items : Store.items) || Store.items;
  let idx = Math.max(0, list.findIndex((x) => x.id === it.id));
  let src;
  try { src = await Store.mediaUrl(it); } catch (e) { return toast(e.message); }
  const el = document.createElement('div'); el.className = 'player';
  el.innerHTML = `<div class="pl-top"><button data-x aria-label="close">${I.close}</button><b>${esc(it.title)}</b><button data-sh aria-label="share">${I.share}</button></div>
    <video controls playsinline autoplay preload="metadata"></video>
    <div class="pl-bot"><button data-prev aria-label="previous">${I.prev}</button><button data-speed>1×</button><button data-loop aria-label="loop">${I.loop}</button>${document.pictureInPictureEnabled ? `<button data-pip aria-label="picture in picture">${I.pip}</button>` : ''}<button data-next aria-label="next">${I.next}</button></div>`;
  const v = $('video', el);
  v.src = src; v.loop = !!S.loop;
  if (S.loop) $('[data-loop]', el).classList.add('on');
  try { const pos = +localStorage.getItem('vv.pos.' + it.id); if (pos > 5) v.currentTime = pos; } catch (e) {}
  v.ontimeupdate = () => { if (Math.round(v.currentTime) % 5 === 0) localStorage.setItem('vv.pos.' + it.id, v.ended ? 0 : v.currentTime); };
  v.onended = () => { localStorage.removeItem('vv.pos.' + it.id); if (!v.loop && idx < list.length - 1) step(1); };
  v.onerror = () => toast(t('err.cantPlay'));
  const cleanup = () => { if (!N && src.startsWith('blob:')) URL.revokeObjectURL(src); };
  el._close = () => { v.pause(); cleanup(); };
  $('[data-x]', el).onclick = closeTop;
  $('[data-sh]', el).onclick = () => shareItem(list[idx]);
  const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75]; let si = 0;
  $('[data-speed]', el).onclick = (e) => { si = (si + 1) % speeds.length; v.playbackRate = speeds[si]; e.currentTarget.textContent = speeds[si] + '×'; };
  $('[data-loop]', el).onclick = (e) => { v.loop = !v.loop; S.loop = v.loop; save(); e.currentTarget.classList.toggle('on', v.loop); };
  const pipB = $('[data-pip]', el); if (pipB) pipB.onclick = () => { (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {}); };
  async function step(d) {
    const ni = idx + d; if (ni < 0 || ni >= list.length) return;
    idx = ni; cleanup();
    try { src = await Store.mediaUrl(list[idx]); } catch (e) { return toast(e.message); }
    v.src = src; $('.pl-top b', el).textContent = list[idx].title; v.play().catch(() => {});
  }
  $('[data-prev]', el).onclick = () => step(-1);
  $('[data-next]', el).onclick = () => step(1);
  pushLayer(el);
}

/* ---------------------------- Analyze & choose quality ---------------------------- */
async function analyze(url) {
  url = extractUrl(url) || url;
  const p = platformOf(url);
  const sh = sheet(t('an.title'), `<div class="spinner"></div><div class="centered">${esc(t('an.loading', { site: p.name }))}<br><small>${esc(url)}</small></div>`);
  let info;
  try { info = await Engine.info(url); }
  catch (e) {
    if (sh._closed) return;
    if (e.code === 'NO_SERVER') return showNoServer(sh);
    $('.sh-body', sh).innerHTML = `<div class="errbox"><b>${esc(t('an.failed'))}</b>${esc(t('an.failedTip'))}<code>${esc(e.message || e)}</code></div>
      <button class="btn accent block" id="anRetry" style="margin-top:14px">${I.refresh}${esc(t('retry'))}</button>
      ${IS_ANDROID_APP ? `<button class="btn ghost block" id="anUpd" style="margin-top:10px">${esc(t('set.updateEngine'))}</button>` : ''}`;
    $('#anRetry', sh).onclick = () => { closeTop(); analyze(url); };
    const up = $('#anUpd', sh); if (up) up.onclick = () => { closeTop(); updateEngine(); };
    return;
  }
  if (sh._closed) return;
  addHistory(info.webpage_url || url, info.title);
  showChoices(sh, url, info, 0);
}
function showNoServer(sh) {
  $('.sh-body', sh).innerHTML = `<div class="errbox"><b>${esc(t('ns.title'))}</b>${esc(t('ns.body'))}</div>
    <button class="btn accent block" id="nsSet" style="margin-top:14px">${I.server}${esc(t('ns.connect'))}</button>
    <a class="btn ghost block" style="margin-top:10px" href="${REPO}#iphone--ipad--web-setup" target="_blank" rel="noopener">${esc(t('ns.guide'))}</a>
    ${!IS_ANDROID_APP ? `<a class="btn ghost block" style="margin-top:10px" href="${APK_URL}">${I.phone}${esc(t('ns.android'))}</a>` : ''}`;
  $('#nsSet', sh).onclick = () => { closeTop(); State.tab = 'settings'; State.settingsPage = 'server'; render(); };
}
function showChoices(sh, url, info, entryIdx) {
  const entries = info.entries && info.entries.length ? info.entries : null;
  const cur = entries ? Object.assign({}, info, entries[entryIdx], { title: entries[entryIdx].title || info.title }) : info;
  const p = platformOf(info.webpage_url || url);
  const choices = buildChoices(cur);
  let folder = State.folder && FOLDERS.includes(State.folder) ? State.folder : (S.lastFolder && FOLDERS.includes(S.lastFolder) ? S.lastFolder : '');
  const startJob = (c, eIdx) => {
    const e = entries ? Object.assign({}, info, entries[eIdx]) : info;
    const ch = eIdx === entryIdx ? c : (buildChoices(e).find((x) => x.key === c.key) || buildChoices(e)[0]);
    Jobs.start({
      url: info.webpage_url || url, item: entries ? eIdx + 1 : null, format: ch.format, kind: ch.kind,
      title: (e.title || info.title || p.name) + (entries && entries.length > 1 ? ' (' + (eIdx + 1) + ')' : ''),
      thumbnail: e.thumbnail || info.thumbnail || '', duration: e.duration || 0, platform: p.id, folder,
      uploader: info.uploader || info.channel || '', quality: ch.label,
    });
  };
  const auto = pickDefault(choices);
  if (auto && !entries) {
    startJob(auto, 0); closeTop(); toast(t('an.added', { q: auto.label })); setTab('downloads'); return;
  }
  $('.sh-body', sh).innerHTML = `
    <div class="vinfo"><div class="thumb" style="${cur.thumbnail ? `background-image:url('${esc(cur.thumbnail)}')` : ''}">${cur.thumbnail ? '' : I.play}${cur.duration ? `<span class="dur">${fmtDur(cur.duration)}</span>` : ''}<span class="pf" style="background:${p.bg}">${p.abbr}</span></div>
      <div style="min-width:0"><b>${esc(cur.title || p.name)}</b><small>${esc([info.uploader || info.channel, p.name].filter(Boolean).join(' · '))}</small></div></div>
    ${entries && entries.length > 1 ? `<div class="chips" style="margin-top:12px">${entries.map((e, i) => `<button class="chip ${i === entryIdx ? 'on' : ''}" data-e="${i}">${esc(t('an.item', { n: numLocal(i + 1) }))}</button>`).join('')}</div>` : ''}
    <div class="group" style="margin-top:12px"><button class="row tap" id="anFolder"><span class="ic">${I.folder}</span><span class="lbl">${esc(t('an.saveIn'))}</span><span class="val" id="anFolderV">${esc(folder || t('f.none'))}</span>${I.chev}</button></div>
    <div class="group-title">${esc(t('an.choose'))}</div>
    <div class="group">${choices.map((c, i) => `<button class="q" data-c="${i}"><span class="qb ${['HD', '2K', '4K', '8K'].includes(c.tag) ? 'hd' : ''}">${c.kind === 'video' ? esc(c.tag || 'MP4') : I.music}</span><span class="lbl"><b>${esc(c.label)}</b><small>${esc([c.sub, c.size ? '≈ ' + fmtBytes(c.size) : ''].filter(Boolean).join(' · '))}</small></span><span class="dl">${I.download}</span></button>`).join('')}</div>
    ${entries && entries.length > 1 ? `<button class="btn accent block" id="anAll" style="margin-top:14px">${I.download}${esc(t('an.all', { n: numLocal(entries.length) }))}</button>` : ''}
    <p class="note" style="margin:12px 4px 0">${esc(t('an.note'))}</p>`;
  $$('[data-e]', sh).forEach((b) => b.onclick = () => showChoices(sh, url, info, +b.dataset.e));
  $('#anFolder', sh).onclick = async () => { const d = await chooseFolder(folder); if (d !== null) { folder = d; save({ lastFolder: d }); $('#anFolderV', sh).textContent = d || t('f.none'); } };
  $$('[data-c]', sh).forEach((b) => b.onclick = () => {
    const c = choices[+b.dataset.c]; startJob(c, entryIdx); closeTop(); toast(t('an.added', { q: c.label })); setTab('downloads');
  });
  const all = $('#anAll', sh); if (all) all.onclick = () => {
    const best = choices[0]; entries.forEach((_, i) => startJob(best, i)); closeTop(); toast(t('an.addedN', { n: entries.length })); setTab('downloads');
  };
}

/* ---------------------------- Settings tab ---------------------------- */
function sw(id, on, disabled) { return `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></label>`; }
function renderSettings(m) {
  if (State.settingsPage === 'pin') return renderPinPage(m);
  if (State.settingsPage === 'server') return renderServerPage(m);
  setTopbar(t('tab.settings'));
  const notifOk = S.notify && (N ? true : (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
  const engineVer = N && N.engineVersion ? N.engineVersion() : '';
  m.innerHTML = `<div class="tab">
    <div class="brand"><span class="logo-word">VidVault</span></div>
    <div class="group">
      <a class="row tap" href="${REPO}/issues" target="_blank" rel="noopener"><span class="ic">${I.mail}</span><span class="lbl" style="color:var(--accent)">${esc(t('set.support'))}</span></a>
      <button class="row tap" id="stShare"><span class="ic">${I.gift}</span><span class="lbl" style="color:var(--accent)">${esc(t('set.shareApp'))}</span></button>
      <button class="row tap" id="stUpdate"><span class="ic">${I.refresh}</span><span class="lbl" style="color:var(--accent)">${esc(t('set.checkUpdate'))}</span></button>
    </div>
    <p class="note">VidVault ${APP_VERSION}${N && N.appVersion ? ' (' + esc(N.appVersion()) + ')' : ' · Web'}${engineVer ? ' · yt-dlp ' + esc(engineVer) : ''}</p>

    <div class="group" style="margin-top:22px">
      <div class="row ${notifOk ? '' : 'warn'}"><span class="ic">${notifOk ? I.bell : ''}</span><span class="lbl">${esc(t('set.notify'))}</span>${notifOk ? sw('stNotif', true) : `<button id="stNotif" class="ic" style="color:var(--danger)">${I.warn}</button>`}</div>
    </div>
    <p class="note">${esc(t('set.notifyNote'))}</p>

    <div class="group" style="margin-top:22px">
      <button class="row tap" id="stPin"><span class="ic">${I.lock}</span><span class="lbl">${esc(t('set.pin'))}</span><span class="val">${esc(S.pinHash ? t('on') : t('off'))}</span>${I.chev}</button>
    </div>

    <div class="group" style="margin-top:22px">
      <div class="row"><span class="ic">${I.vpn}</span><span class="lbl">${esc(t('set.vpn'))}${S.proxyOn && S.proxy ? `<small>${esc(S.proxy)}</small>` : ''}</span>${sw('stVpn', S.proxyOn)}</div>
    </div>
    <p class="note">${esc(t('set.vpnNote'))}</p>

    <div class="group-title">${esc(t('set.browser'))}</div>
    <div class="group">
      <button class="row tap noicon" id="stSearch"><span class="lbl">${esc(t('set.search'))}</span><span class="val">${esc(SEARCH[S.search].name)}</span>${I.chev}</button>
      <button class="row tap noicon" id="stUa"><span class="lbl">${esc(t('set.ua'))}</span><span class="val">${esc(t('ua.' + S.ua))}</span>${I.chev}</button>
      <div class="row noicon"><span class="lbl">${esc(t('set.adblock'))}</span>${sw('stAd', S.adblock)}</div>
      <button class="row tap noicon link" id="stClear"><span class="lbl">${esc(t('set.clear'))}</span></button>
    </div>

    <div class="group" style="margin-top:22px">
      <div class="row"><span class="ic">${I.wifi}</span><span class="lbl">${esc(t('set.wifi'))}${S.wifiShare && N ? `<small id="wifiAddr">${esc(N.wifiAddress ? N.wifiAddress() : '')}</small>` : ''}</span>${sw('stWifi', S.wifiShare && !!N, !N)}</div>
    </div>
    <p class="note">${esc(N ? t('set.wifiNote') : t('set.wifiWeb'))}</p>

    <div class="group-title">${esc(t('set.downloads'))}</div>
    <div class="group">
      ${N ? `<button class="row tap" id="stEngine"><span class="ic">${I.phone}</span><span class="lbl">${esc(t('set.engine'))}</span><span class="val">${esc(t('engine.' + S.engine))}</span>${I.chev}</button>` : ''}
      <button class="row tap" id="stServer"><span class="ic">${I.server}</span><span class="lbl">${esc(t('set.server'))}${N ? `<small>${esc(t('set.serverOpt'))}</small>` : ''}</span><span class="val">${esc(serverBase() ? new URL(serverBase()).hostname : t('set.notSet'))}</span>${I.chev}</button>
      <button class="row tap" id="stQuality"><span class="ic">${I.hd}</span><span class="lbl">${esc(t('set.quality'))}</span><span class="val">${esc(t('qd.' + S.quality))}</span>${I.chev}</button>
      <div class="row"><span class="ic">${I.play}</span><span class="lbl">${esc(t('set.h264'))}<small>${esc(t('set.h264Note'))}</small></span>${sw('stH264', S.h264)}</div>
      ${N ? `<div class="row"><span class="ic">${I.wifi}</span><span class="lbl">${esc(t('set.wifiOnly'))}</span>${sw('stWifiOnly', S.wifiOnly)}</div>
      <div class="row"><span class="ic">${I.photo}</span><span class="lbl">${esc(t('set.autoGallery'))}</span>${sw('stGallery', S.autoGallery)}</div>
      <button class="row tap" id="stUpdEngine"><span class="ic">${I.refresh}</span><span class="lbl" style="color:var(--accent)">${esc(t('set.updateEngine'))}<small style="color:var(--text-2)">${esc(t('set.updateEngineNote'))}</small></span></button>` : ''}
      <div class="row"><span class="ic">${I.archive}</span><span class="lbl">${esc(t('set.storage'))}</span><span class="val">${fmtBytes(Store.totalSize()) || '0 B'}</span></div>
      <button class="row tap danger" id="stWipe"><span class="ic" style="color:var(--danger)">${I.trash}</span><span class="lbl">${esc(t('set.wipe'))}</span></button>
    </div>

    <div class="group-title">${esc(t('set.appearance'))}</div>
    <div class="group">
      <div class="row noicon"><span class="lbl">${esc(t('set.dark'))}</span><span class="seg" id="stTheme">${['dark', 'light', 'system'].map((k) => `<button data-v="${k}" class="${S.theme === k ? 'on' : ''}">${esc(t('theme.' + k))}</button>`).join('')}</span></div>
      <div class="row noicon"><span class="lbl">${esc(t('set.color'))}</span><span class="dots" id="stColor">${[['pink', '#ff375f'], ['cyan', '#32ade6'], ['blue', '#0a84ff'], ['green', '#30b158'], ['orange', '#ff9500'], ['purple', '#af52de']].map(([k, c]) => `<button class="dot ${S.accent === k ? 'on' : ''}" data-v="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')}</span></div>
      <div class="row noicon"><span class="lbl">${esc(t('set.lang'))}</span><span class="seg" id="stLang"><button data-v="en" class="${S.lang === 'en' ? 'on' : ''}">English</button><button data-v="ar" class="${S.lang === 'ar' ? 'on' : ''}">العربية</button></span></div>
    </div>

    <div class="group-title">${esc(t('set.about'))}</div>
    <div class="group">
      <div class="row noicon"><span class="lbl">${esc(t('set.sites'))}<small>YouTube · Instagram · Facebook · X (Twitter) · TikTok · Threads ${esc(t('set.sitesMore'))}</small></span></div>
      ${!N ? `<a class="row tap noicon" href="${APK_URL}"><span class="lbl" style="color:var(--accent)">${esc(t('set.getApk'))}</span></a>` : `<a class="row tap noicon" href="${WEB_URL}" target="_blank" rel="noopener"><span class="lbl" style="color:var(--accent)">${esc(t('set.webApp'))}</span></a>`}
      <a class="row tap noicon" href="${REPO}" target="_blank" rel="noopener"><span class="lbl" style="color:var(--accent)">${esc(t('set.source'))}</span></a>
    </div>
    <p class="note">${esc(t('set.legal'))}</p>
  </div>`;
  const on = (id, fn) => { const el = $('#' + id, m); if (el) el.onclick = fn; };
  const chg = (id, fn) => { const el = $('#' + id, m); if (el) el.onchange = () => fn(el.checked); };
  on('stShare', () => shareText(t('set.shareText') + '\n' + WEB_URL + '\nAndroid: ' + APK_URL, 'VidVault'));
  on('stUpdate', () => { if (N) N.openExternal(REPO + '/releases/latest'); else { navigator.serviceWorker?.getRegistration().then((r) => r && r.update()); toast(t('set.updated')); setTimeout(() => location.reload(), 900); } });
  const nb = $('#stNotif', m);
  if (nb && nb.tagName === 'BUTTON') nb.onclick = enableNotifications; else chg('stNotif', (v) => { save({ notify: v }); render(); });
  on('stPin', () => { State.settingsPage = 'pin'; render(); });
  chg('stVpn', async (v) => {
    if (v) {
      const p = (await prompt2(t('set.vpn'), S.proxy || '', 'socks5://user:pass@host:1080', t('set.vpnPrompt'))).trim();
      if (!p) { render(); return; }
      if (!/^(https?|socks5h?|socks4a?):\/\//i.test(p)) { toast(t('err.badProxy')); render(); return; }
      save({ proxyOn: true, proxy: p });
    } else save({ proxyOn: false });
    render();
  });
  on('stSearch', async () => { const v = await pick(t('set.search'), Object.entries(SEARCH).map(([k, x]) => ({ v: k, label: x.name })), S.search); if (v) { save({ search: v }); render(); } });
  on('stUa', async () => { const v = await pick(t('set.ua'), ['default', 'desktop', 'iphone', 'android'].map((k) => ({ v: k, label: t('ua.' + k) })), S.ua); if (v) { save({ ua: v }); render(); } });
  chg('stAd', (v) => save({ adblock: v }));
  on('stClear', async () => {
    if (!(await confirm2(t('set.clear'), t('set.clearNote'), t('set.clearBtn'), true))) return;
    HISTORY = []; saveHistory(); HIST_POS = -1; if (N && N.clearBrowserData) N.clearBrowserData();
    toast(t('set.cleared'));
  });
  chg('stWifi', (v) => {
    if (!N) return;
    const addr = N.wifiShare(v);
    if (v && !addr) { toast(t('err.noWifi')); save({ wifiShare: false }); }
    else save({ wifiShare: v });
    render();
  });
  on('stEngine', async () => { const v = await pick(t('set.engine'), [{ v: 'device', label: t('engine.device') }, { v: 'server', label: t('engine.server') }], S.engine); if (v) { if (v === 'server' && !serverBase()) { State.settingsPage = 'server'; } save({ engine: v }); render(); } });
  on('stServer', () => { State.settingsPage = 'server'; render(); });
  on('stQuality', async () => { const v = await pick(t('set.quality'), ['ask', 'best', '2160', '1080', '720', '480', '360', 'audio'].map((k) => ({ v: k, label: t('qd.' + k) })), S.quality); if (v) { save({ quality: v }); render(); } });
  chg('stH264', (v) => save({ h264: v }));
  chg('stWifiOnly', (v) => save({ wifiOnly: v }));
  chg('stGallery', (v) => save({ autoGallery: v }));
  on('stUpdEngine', updateEngine);
  on('stWipe', async () => {
    if (!Store.items.length) return toast(t('f.libEmptyT'));
    if (!(await confirm2(t('set.wipe'), t('set.wipeNote', { n: Store.items.length }), t('delete'), true))) return;
    for (const it of Store.items.slice()) await Store.remove(it.id);
    render(); toast(t('set.wiped'));
  });
  $$('#stTheme button', m).forEach((b) => b.onclick = () => { save({ theme: b.dataset.v }); applyLook(); render(); });
  $$('#stColor button', m).forEach((b) => b.onclick = () => { save({ accent: b.dataset.v }); applyLook(); render(); });
  $$('#stLang button', m).forEach((b) => b.onclick = () => { save({ lang: b.dataset.v }); applyLook(); render(); });
}
async function enableNotifications() {
  if (N) {
    try { await nativeCall('requestNotifications'); save({ notify: true }); } catch (e) { toast(t('err.notifDenied')); }
    return render();
  }
  if (typeof Notification === 'undefined') return toast(t('err.notifUnsupported'));
  const r = await Notification.requestPermission();
  if (r === 'granted') save({ notify: true }); else toast(t('err.notifDenied'));
  render();
}
async function updateEngine() {
  if (!N) return;
  toast(t('eng.updating'));
  try { const r = await nativeCall('updateEngine'); toast(r && r.status === 'ALREADY_UP_TO_DATE' ? t('eng.latest', { v: r.version || '' }) : t('eng.updated', { v: (r && r.version) || '' })); }
  catch (e) { toast(t('eng.failed') + ' ' + e.message); }
  if (State.tab === 'settings') render();
}
function renderServerPage(m) {
  setTopbar(t('set.server'), `<button id="spBack"><span class="flip" style="display:inline-block;vertical-align:middle">${I.back}</span></button>`);
  m.innerHTML = `<div class="tab">
    <p class="note" style="margin:6px 4px 16px;font-size:14px">${esc(N ? t('srv.introApp') : t('srv.intro'))}</p>
    <div class="group-title">${esc(t('srv.address'))}</div>
    <div class="group" style="padding:4px 12px"><input id="srvUrl" class="row" style="border:0;background:none;color:var(--text);font:inherit;outline:none;padding:10px 4px" type="url" inputmode="url" autocapitalize="off" placeholder="https://vidvault-xxxx.onrender.com" value="${esc(S.server)}"></div>
    <div class="group-title">${esc(t('srv.key'))}</div>
    <div class="group" style="padding:4px 12px"><input id="srvKey" class="row" style="border:0;background:none;color:var(--text);font:inherit;outline:none;padding:10px 4px" type="password" autocapitalize="off" placeholder="${esc(t('srv.keyPh'))}" value="${esc(S.serverKey)}"></div>
    <button class="btn accent block" id="srvSave" style="margin-top:18px">${esc(t('srv.save'))}</button>
    <div id="srvStatus" class="hint" style="text-align:center"></div>
    <div class="group-title">${esc(t('srv.howT'))}</div>
    <div class="group"><div class="row noicon"><span class="lbl" style="font-size:14px;line-height:1.5">${t('srv.how')}</span></div>
      <a class="row tap noicon" href="https://render.com/deploy?repo=${encodeURIComponent(REPO)}" target="_blank" rel="noopener"><span class="lbl" style="color:var(--accent)">${esc(t('srv.deploy'))}</span>${I.chev}</a>
      <a class="row tap noicon" href="${REPO}#iphone--ipad--web-setup" target="_blank" rel="noopener"><span class="lbl" style="color:var(--accent)">${esc(t('ns.guide'))}</span>${I.chev}</a></div>
  </div>`;
  $('#spBack').onclick = () => { State.settingsPage = null; render(); };
  $('#srvSave').onclick = async () => {
    let u = $('#srvUrl').value.trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    save({ server: u.replace(/\/+$/, ''), serverKey: $('#srvKey').value.trim() });
    const st = $('#srvStatus'); if (!u) { st.textContent = ''; return; }
    st.textContent = t('srv.testing');
    try { const h = await serverFetch('/api/health'); st.innerHTML = `<span style="color:var(--ok)">✓ ${esc(t('srv.ok'))}</span> · yt-dlp ${esc(h.ytdlp || '')}`; }
    catch (e) { st.innerHTML = `<span style="color:var(--danger)">✗ ${esc(e.message)}</span><br>${esc(t('srv.sleepy'))}`; }
  };
}
function renderPinPage(m) {
  setTopbar(t('set.pin'), `<button id="ppBack"><span class="flip" style="display:inline-block;vertical-align:middle">${I.back}</span></button>`);
  const bioOk = N && N.canBiometric && N.canBiometric();
  m.innerHTML = `<div class="tab">
    <div class="group" style="margin-top:12px">
      ${S.pinHash ? `<button class="row tap noicon" id="ppChange"><span class="lbl" style="color:var(--accent)">${esc(t('pin.change'))}</span></button>
      <button class="row tap noicon" id="ppOff"><span class="lbl" style="color:var(--danger)">${esc(t('pin.off'))}</span></button>`
      : `<button class="row tap noicon" id="ppOn"><span class="lbl" style="color:var(--accent)">${esc(t('pin.on'))}</span></button>`}
    </div>
    <p class="note">${esc(t('pin.note'))}</p>
    ${bioOk ? `<div class="group" style="margin-top:22px"><div class="row"><span class="ic">${I.fp}</span><span class="lbl">${esc(t('pin.bio'))}</span>${sw('ppBio', S.bio, !S.pinHash)}</div></div>` : ''}
  </div>`;
  $('#ppBack').onclick = () => { State.settingsPage = null; render(); };
  const setNew = async () => {
    const a = await askPin(t('pin.new')); if (!a) return;
    const b = await askPin(t('pin.confirm')); if (!b) return;
    if (a !== b) return toast(t('pin.mismatch'));
    save({ pinHash: await hashPin(a) }); toast(t('pin.set')); render();
  };
  const verify = async () => { const p = await askPin(t('pin.current')); return p && (await hashPin(p)) === S.pinHash; };
  const on = $('#ppOn'); if (on) on.onclick = setNew;
  const ch = $('#ppChange'); if (ch) ch.onclick = async () => { if (await verify()) setNew(); else toast(t('pin.wrong')); };
  const off = $('#ppOff'); if (off) off.onclick = async () => { if (await verify()) { save({ pinHash: '', bio: false }); render(); } else toast(t('pin.wrong')); };
  const bio = $('#ppBio'); if (bio) bio.onchange = () => save({ bio: bio.checked });
}

/* ---------------------------- Passcode lock ---------------------------- */
async function hashPin(p) {
  const d = new TextEncoder().encode('vidvault:' + p);
  if (crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', d); return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  let h = 0; for (const c of d) h = (h * 31 + c) >>> 0; return 'x' + h.toString(16);
}
function pinPad(title, onDone, opts = {}) {
  const el = document.createElement('div'); el.className = 'lock';
  el.innerHTML = `<div style="color:var(--accent)">${I.lock.replace('<svg', '<svg width="34" height="34"')}</div><h2>${esc(title)}</h2><div class="pins">${'<i></i>'.repeat(4)}</div><div class="sub"></div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<button class="t" data-k="${opts.bio ? 'bio' : opts.cancel ? 'cancel' : ''}">${opts.bio ? I.fp.replace('<svg', '<svg width="30" height="30" style="margin:auto"') : opts.cancel ? esc(t('cancel')) : ''}</button><button data-n="0">0</button><button class="t" data-k="del">⌫</button></div>`;
  let code = '';
  const draw = () => $$('.pins i', el).forEach((i, k) => i.classList.toggle('f', k < code.length));
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.n !== undefined) { if (code.length < 4) code += b.dataset.n; draw(); if (code.length === 4) { const ok = await onDone(code, el); if (ok === false) { $('.pins', el).classList.add('shake'); setTimeout(() => { $('.pins', el).classList.remove('shake'); code = ''; draw(); }, 380); } } }
    else if (b.dataset.k === 'del') { code = code.slice(0, -1); draw(); }
    else if (b.dataset.k === 'cancel') { onDone(null, el); }
    else if (b.dataset.k === 'bio' && opts.bio) opts.bio();
  };
  return el;
}
function askPin(title) {
  return new Promise((res) => {
    const el = pinPad(title, (code) => { el.remove(); res(code); }, { cancel: true });
    document.body.appendChild(el);
  });
}
let locked = false;
function lockApp() {
  if (!S.pinHash || locked) return;
  locked = true;
  const bio = N && S.bio && N.canBiometric && N.canBiometric();
  const unlock = () => { locked = false; el.remove(); };
  const tryBio = () => nativeCall('biometric', t('pin.bioPrompt')).then(unlock).catch(() => {});
  const el = pinPad(t('pin.enter'), async (code) => {
    if ((await hashPin(code)) === S.pinHash) { unlock(); return true; }
    $('.sub', el).textContent = t('pin.wrong'); return false;
  }, { bio: bio ? tryBio : null });
  document.body.appendChild(el);
  if (bio) setTimeout(tryBio, 300);
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (S.pinHash && hiddenAt && Date.now() - hiddenAt > 30000 && !$('.player')) lockApp();
});

/* ---------------------------- components ---------------------------- */
const LAYERS = [];
function pushLayer(el, scrim) {
  const layer = $('#layer');
  if (scrim) { const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { if (LAYERS[LAYERS.length - 1] === el) closeTop(); }; el._scrim = s; layer.appendChild(s); requestAnimationFrame(() => s.classList.add('show')); }
  layer.appendChild(el);
  LAYERS.push(el);
  return el;
}
function closeTop() {
  const el = LAYERS.pop(); if (!el) return;
  el._closed = true;
  if (el._close) el._close();
  if (el._resolve) { const r = el._resolve; el._resolve = null; r(el._cancelValue === undefined ? null : el._cancelValue); }
  const s = el._scrim;
  if (el.classList.contains('sheet')) { el.classList.remove('show'); setTimeout(() => el.remove(), 280); } else el.remove();
  if (s) { s.classList.remove('show'); setTimeout(() => s.remove(), 280); }
}
const hasLayer = () => LAYERS.length > 0;
function sheet(title, body, action, onAction) {
  const el = document.createElement('div'); el.className = 'sheet';
  el.innerHTML = `<div class="grab"></div><div class="sh-head"><h3>${esc(title)}</h3>${action ? `<button data-act style="color:var(--danger)">${esc(action)}</button>` : ''}<button data-x>${esc(t('done'))}</button></div><div class="sh-body">${body}</div>`;
  $('[data-x]', el).onclick = closeTop;
  if (action) $('[data-act]', el).onclick = onAction;
  // swipe down to close
  let y0 = null;
  $('.grab', el).ontouchstart = $('.sh-head', el).ontouchstart = (e) => { y0 = e.touches[0].clientY; };
  el.ontouchmove = (e) => { if (y0 !== null) { const dy = e.touches[0].clientY - y0; if (dy > 0) el.style.transform = `translateY(${dy}px)`; } };
  el.ontouchend = (e) => { if (y0 === null) return; const dy = (e.changedTouches[0].clientY - y0); y0 = null; el.style.transform = ''; if (dy > 90) closeTop(); };
  pushLayer(el, true);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return el;
}
function pick(title, options, current) {
  return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'actionsheet';
    el.innerHTML = `<div class="as-group">${title ? `<div class="as-title">${esc(title)}</div>` : ''}${options.map((o, i) => `<button data-i="${i}" class="${o.red ? 'red' : ''} ${current !== undefined && o.v === current ? 'cur' : ''}">${current !== undefined && o.v === current ? '✓ ' : ''}${esc(o.label)}</button>`).join('')}</div><button class="cancel" data-c>${esc(t('cancel'))}</button>`;
    el._resolve = res;
    $$('[data-i]', el).forEach((b) => b.onclick = () => { el._resolve = null; closeTop(); res(options[+b.dataset.i].v); });
    $('[data-c]', el).onclick = closeTop;
    pushLayer(el, true);
  });
}
function dialog(title, msg, buttons, input) {
  return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'dialog';
    el.innerHTML = `<div class="box"><h4>${esc(title)}</h4>${msg ? `<p>${esc(msg)}</p>` : ''}${input ? `<input value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocapitalize="off">` : ''}<div class="acts">${buttons.map((b, i) => `<button data-i="${i}" class="${b.red ? 'red' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
    el._resolve = res; el._cancelValue = input ? '' : false;
    const inp = $('input', el);
    $$('[data-i]', el).forEach((b) => b.onclick = () => { const v = buttons[+b.dataset.i].value; el._resolve = null; closeTop(); res(input ? (v ? inp.value : '') : v); });
    if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') $$('[data-i]', el).pop().click(); };
    pushLayer(el, true);
    if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
const confirm2 = (title, msg, ok, red) => dialog(title, msg, [{ label: t('cancel'), value: false }, { label: ok || t('ok'), value: true, red }]);
const prompt2 = (title, value, placeholder, msg) => dialog(title, msg || '', [{ label: t('cancel'), value: false }, { label: t('ok'), value: true }], { value, placeholder });
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
async function shareText(text, title) {
  if (N && N.shareText) return N.shareText(text);
  try { if (navigator.share) await navigator.share({ text, title }); else { await navigator.clipboard.writeText(text); toast(t('copied')); } } catch (e) {}
}

/* ============================== start ============================== */
async function start() {
  applyLook();
  if (N) { try { N.setPrefs(JSON.stringify(S)); } catch (e) {} try { safeJSON(N.jobs(), []).forEach((j) => Jobs.list.push(j)); } catch (e) {} }
  await Store.refresh(); await Store.loadThumbs();
  render();
  lockApp();
  if (!N && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!N && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // links shared to the web app (Android share target) or ?url= in the address
  const q = new URLSearchParams(location.search);
  const shared = extractUrl(q.get('url') || q.get('text') || q.get('title') || '');
  if (shared) { history.replaceState(null, '', location.pathname); setTimeout(() => analyze(shared), 300); }
  if (N && N.ready) N.ready();
}
document.addEventListener('DOMContentLoaded', start);
