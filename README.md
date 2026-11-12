# VidVault

Save videos from **YouTube, Instagram, Facebook, X (Twitter), TikTok, Threads and Snapchat** in any resolution the site offers, from 144p up to 4K/8K or audio only (M4A/MP3). Saved videos stay on your device, so you can watch them without Wi-Fi. The interface is in English and Arabic.

| | Link |
|---|---|
| 📱 **Android app** (phones & tablets) | [**VidVault.apk**](https://github.com/Barzandh/Youdownload-/releases/latest/download/VidVault.apk) · [all builds](https://github.com/Barzandh/Youdownload-/releases/latest) |
| 🌐 **Web app** (iPhone, iPad, computer) | **https://barzandh.github.io/Youdownload-/** |

## Features
- **Browser tab**: in-app browser (Android) with shortcuts to all seven sites, search engine choice, user-agent switch, ad blocking, bookmarks and history. Tap **⬇ Download** on any video page.
- **Paste link** or **Share → VidVault** from the YouTube, Instagram or TikTok apps (Android).
- **Every resolution** the site provides (2160p, 1440p, 1080p60, 720p, 480p, 360p, 240p, 144p…), with codec and estimated size. Audio-only M4A/MP3 too. Instagram/X carousels: pick one video or download all.
- **Downloads tab**: live progress, speed, time left, cancel/retry. On Android, downloads keep going in the background.
- **Folders tab**: offline library sorted automatically by site, plus your own folders. You can search, rename, move, share, save to the Gallery/Photos, multi-select and delete.
- **Player**: resume where you left off, speed 0.5–2×, loop, picture-in-picture, next/previous.
- **Settings** (laid out like Tap Browser): notifications, **passcode lock** (+ fingerprint/face on Android), VPN/proxy, search engine, user agent, ad block, clear history & website data, **Wi-Fi Sharing** (open your downloads from a computer on the same Wi-Fi), default quality, Wi-Fi-only downloads, auto-save to Gallery, update download engine, dark mode On/Off/System, 6 accent colours, English/العربية.

## Android: install
1. On your phone, open the [**VidVault.apk**](https://github.com/Barzandh/Youdownload-/releases/latest/download/VidVault.apk) link.
2. Open the downloaded file and tap **Install**. If asked, allow *Install unknown apps* for your browser.
3. Updates: install the newer APK over the old one; your library is kept.

The Android app downloads on the phone itself (it bundles [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg), so you don't need a server. It updates its download engine once a day; **Settings → Update download engine** does it on demand. If a site stops working, try that first.

## iPhone / iPad / web setup
1. Open **https://barzandh.github.io/Youdownload-/** in **Safari** → **Share** → **Add to Home Screen**.
2. Paste a link and pick a quality. That's it: the web app downloads straight away through free public download servers ([cobalt](https://github.com/imputnet/cobalt) instances, tried one after another). The finished video is saved inside the app so you can watch it offline. Tap **Save to Photos / Files** to put a copy in your Photos.

The list of public servers lives in [`web/instances.json`](web/instances.json). If one stops working, edit that file and the app picks up the change without an update.

**Optional: your own server.** Public servers can be busy, and YouTube sometimes blocks them. Your own free server is more reliable and lists every exact resolution:
1. Open **[Deploy to Render](https://render.com/deploy?repo=https://github.com/Barzandh/Youdownload-)**, sign in, type any password for `ACCESS_KEY`, and press **Deploy**.
2. In VidVault go to **Settings → Download server**, paste the address (like `https://vidvault-xxxx.onrender.com`) and your password, then tap **Save & test**.

Any Docker host works too: `docker build -f server/Dockerfile -t vidvault . && docker run -p 8000:8000 -e ACCESS_KEY=yourpassword vidvault`.

## Project layout
```
web/       the app interface (shared by the web app and the Android app)
android/   Android shell: WebView UI, on-device yt-dlp engine, background downloads, in-app browser, Wi-Fi sharing
server/    download server for the web app (Python + yt-dlp + ffmpeg, Docker)
.github/workflows/build.yml   builds the APKs into Releases and publishes web/ to GitHub Pages on every push
```

## Responsible use
Only download videos you own or have permission to save, and follow each site's terms. VidVault is not affiliated with YouTube, Instagram, Facebook, X, TikTok, Threads or Snapchat.

---

## بالعربية
**VidVault** يحفظ الفيديوهات من يوتيوب وإنستغرام وفيسبوك وX وتيك توك وثريدز وسناب شات بكل الدقّات المتاحة (من 144p حتى 4K) أو كصوت فقط، لتشاهدها دون إنترنت.

- **أندرويد (هواتف وأجهزة لوحية):** نزّل [VidVault.apk](https://github.com/Barzandh/Youdownload-/releases/latest/download/VidVault.apk)، ثم افتحه واضغط «تثبيت».
- **آيفون وآيباد:** افتح https://barzandh.github.io/Youdownload-/ في Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية». الصق الرابط واختر الجودة، فيُنزَّل الفيديو مباشرة دون أي إعداد.
- يمكنك تغيير اللغة من: الإعدادات ← اللغة ← العربية.
