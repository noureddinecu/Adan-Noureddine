# Video Downloader — Architecture

## 1. Goals & constraints

| Requirement | Decision |
|---|---|
| Real downloads from Facebook, TikTok, Instagram, X, Vimeo, other sites | On-device **yt-dlp** engine (open-source, actively maintained) via `youtubedl-android` + bundled FFmpeg for merging audio/video. No third-party download websites, no remote proxies. |
| Direct media links (`…/clip.mp4`) | Native OkHttp downloader with HTTP `Range` resume. |
| YouTube "via authorized methods" | YouTube ToS forbids third-party downloads and Google Play rejects such apps. The app reads public metadata through YouTube's **official oEmbed API**, shows the card, and offers "Open in official app". Controlled by `BuildConfig.ALLOW_YOUTUBE_DOWNLOAD = false`. |
| Respect protections | Public content only: no cookies/login import, no DRM circumvention, no paywall bypass. Engine errors (login required, DRM, private) are mapped to clear messages. |
| Pause / resume | Pause = stop worker + kill engine process while keeping partial data in `noBackupFilesDir/partial/<id>`; resume = re-run with `--continue` (yt-dlp) or `Range:` (HTTP). Also survives process death. |
| Background reliability | WorkManager `CoroutineWorker` promoted to a `dataSync` foreground service with progress notification + "Pause" action. Optional Wi-Fi-only constraint. |
| Storage | `Download/VideoDownloader` via MediaStore (Android 10+, no permission), legacy public folder with `WRITE_EXTERNAL_STORAGE` (≤ 9), or the private app folder. |
| Monetization | AdMob banner (Home, Library) + frequency-capped interstitial after starting a download; Google UMP consent; **no ads while the player is visible**. |
| UI | Jetpack Compose + Material 3, custom premium palette, light/dark/dynamic colors, RTL Arabic + French + English (per-app language). |

## 2. Layers

```
ui/            Compose screens + ViewModels (MVVM, unidirectional state)
 ├─ home/      paste → analyze → choose quality → download; active downloads
 ├─ library/   completed files: date groups, platform filter, sort, play/share/rename/delete
 ├─ history/   every attempt; search, retry, download again, copy/share link
 ├─ player/    Media3 ExoPlayer (ads suppressed)
 ├─ settings/  theme, language, storage, default quality, Wi-Fi only, engine update, legal
 └─ components/, navigation/, theme/
domain/        pure Kotlin: models, PlatformDetector, PlatformPolicy, repository interfaces
data/
 ├─ extractor/ MediaExtractor chain: YouTubeOEmbed → DirectLink → YtDlp; FormatMapper; ErrorMapper
 ├─ download/  DownloadWorker, YtDlpDownloader, HttpDownloader, scheduler, notifications
 ├─ storage/   MediaStorage (MediaStore / files, FileProvider, rename, delete)
 ├─ local/     Room (DownloadEntity, DAO)
 ├─ settings/  DataStore preferences
 └─ repository/ implementations
ads/           AdsManager (UMP + AdMob), InterstitialPolicy (pure, tested), BannerAd
di/            Hilt modules
```

Dependencies point inward: `ui → domain ← data`. ViewModels depend only on domain interfaces, so they are unit-tested with fakes.

## 3. Download flow

```
Home: URL ─▶ MediaRepository.analyze
             ├─ UrlUtils (extract/validate) ─▶ PlatformDetector
             └─ first MediaExtractor.canHandle() ─▶ MediaInfo + QualityOptions
User picks quality ─▶ DownloadRepository.enqueue
             └─ Room row (QUEUED) ─▶ WorkManager unique work "download-<id>"
DownloadWorker
   ├─ status DOWNLOADING, foreground notification
   ├─ YtDlpDownloader | HttpDownloader  (progress → throttled Room + notification)
   ├─ MediaStorage.save(location)       (MediaStore or file)
   └─ status COMPLETED (+ uri, size)  | FAILED(errorCode) | PAUSED (kept partial)
UI observes Room via Flow → progress bars, library, history update live.
```

State machine: `QUEUED → DOWNLOADING → COMPLETED`, `DOWNLOADING ⇄ PAUSED`, `* → CANCELED` (partial data deleted), `DOWNLOADING → FAILED → (retry) QUEUED`.

## 4. Testing

* Unit tests (`app/src/test`): platform detection & policy, URL utilities, file-name sanitising, formatters, yt-dlp progress parsing, format → quality mapping, error mapping, date grouping, library organising, interstitial frequency policy, `HomeViewModel` behaviour with fakes.
* CI (`.github/workflows/android.yml`): unit tests, debug APKs, lint, R8-minified release APK + AAB.

## 5. Extending

* New site: usually nothing to do — yt-dlp supports 1000+ sites; add the host to `PlatformDetector` for a branded badge.
* New engine/source: implement `MediaExtractor` (+ a `Downloader` if needed) and insert it into the chain in `MediaRepositoryImpl`.
* Keep the engine fresh: Settings → *Update engine* pulls the latest stable yt-dlp release.
