# VidVault

Save videos from **YouTube, Instagram, Facebook, X (Twitter), TikTok and Threads** in any resolution the site offers, from 144p up to 4K/8K or audio only (M4A/MP3). Saved videos stay on your device, so you can watch them without Wi-Fi. The interface is in English and Arabic.

| | Link |
|---|---|
| 📱 **Android app** (phones & tablets) | [**VidVault.apk**](https://github.com/Barzandh/Youdownload-/releases/latest/download/VidVault.apk) · [all builds](https://github.com/Barzandh/Youdownload-/releases/latest) |
| 🌐 **Web app** (iPhone, iPad, computer) | **https://barzandh.github.io/Youdownload-/** |

## Features
- **Browser tab**: in-app browser (Android) with shortcuts to all six sites, search engine choice, user-agent switch, ad blocking, bookmarks and history. Tap **⬇ Download** on any video page.
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
Apple doesn't allow APK files, and browsers aren't allowed to pull videos from these sites directly. On iPhone the web app therefore sends links to **your own free VidVault server** (the `server/` folder), which fetches the video and hands the finished file back to your phone. You only set this up once:

1. **Deploy the server (free, about 3 minutes):** open
   **[Deploy to Render](https://render.com/deploy?repo=https://github.com/Barzandh/Youdownload-)**, sign in, type any password for `ACCESS_KEY`, and press **Deploy**.
2. When it shows **Live**, copy its address (like `https://vidvault-xxxx.onrender.com`).
3. On your iPhone, open **https://barzandh.github.io/Youdownload-/** in **Safari** → **Share** → **Add to Home Screen**.
4. Open VidVault from the Home Screen → **Settings → Download server**, paste the address and your password, then tap **Save & test**.

Downloaded videos are kept inside the app for offline viewing. Use **⋯ → Save to Photos / Files** to put a copy in Photos.

Notes:
- Render's free server sleeps after 15 minutes idle, so the first link after a break can take up to a minute.
- Some sites block cloud servers. If YouTube says *"Sign in to confirm you're not a bot"*, add your browser cookies (Netscape format) as a `COOKIES` environment variable on Render, or use the Android app, which downloads from your own connection.
- Any Docker host works too: `docker build -f server/Dockerfile -t vidvault . && docker run -p 8000:8000 -e ACCESS_KEY=yourpassword vidvault`.

## Project layout
```
web/       the app interface (shared by the web app and the Android app)
android/   Android shell: WebView UI, on-device yt-dlp engine, background downloads, in-app browser, Wi-Fi sharing
server/    download server for the web app (Python + yt-dlp + ffmpeg, Docker)
.github/workflows/build.yml   builds the APKs into Releases and publishes web/ to GitHub Pages on every push
```

## Responsible use
Only download videos you own or have permission to save, and follow each site's terms. VidVault is not affiliated with YouTube, Instagram, Facebook, X, TikTok or Threads.

---

## بالعربية
**VidVault** يحفظ الفيديوهات من يوتيوب وإنستغرام وفيسبوك وX وتيك توك وثريدز بكل الدقّات المتاحة (من 144p حتى 4K) أو كصوت فقط، لتشاهدها دون إنترنت.

- **أندرويد (هواتف وأجهزة لوحية):** نزّل [VidVault.apk](https://github.com/Barzandh/Youdownload-/releases/latest/download/VidVault.apk)، ثم افتحه واضغط «تثبيت».
- **آيفون وآيباد:** افتح https://barzandh.github.io/Youdownload-/ في Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية». ثم أنشئ خادمك المجاني مرة واحدة عبر زر [Deploy to Render](https://render.com/deploy?repo=https://github.com/Barzandh/Youdownload-)، والصق عنوانه وكلمة المرور في: الإعدادات ← خادم التنزيل.
- يمكنك تغيير اللغة من: الإعدادات ← اللغة ← العربية.
