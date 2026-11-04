# Video Downloader (temporary name)

Native Android app (Kotlin + Jetpack Compose) for saving **public** videos from Facebook, TikTok, Instagram, X (Twitter), Vimeo, direct media links and many other sites — with a premium Material 3 UI, Arabic (RTL) / French / English, dark mode, built-in player and AdMob monetization.

> ⚖️ Respects copyright and platform terms: public content only, no login/DRM/paywall bypass. YouTube downloading is **disabled** (YouTube ToS + Google Play policy); YouTube links show their info and open in the official app.

## Features
- Paste / share-to-app a link → analyze → thumbnail, title, author, duration → pick quality (with size estimate) or audio-only → download.
- Live progress (in-app + notification), **pause / resume / cancel / retry**, Wi-Fi-only option, survives app restarts.
- Library: grouped by date, filter by platform, sort by date/name/size; play in the built-in Media3 player, share, rename, delete, copy/open source link.
- History of every download with search, retry, download again, copy & share link.
- Save to `Download/VideoDownloader` (MediaStore) or the private app folder.
- Settings: theme (system/light/dark), dynamic colors, language, default quality, storage location, engine update, ad-privacy options, legal notice.
- AdMob banners on Home/Library + respectful, frequency-capped interstitials; never during playback; Google UMP consent.

## Build
Requirements: JDK 17, Android SDK 35.
```bash
./gradlew testDebugUnitTest      # unit tests
./gradlew assembleDebug          # per-ABI debug APKs in app/build/outputs/apk/debug/
./gradlew bundleRelease          # Play Store AAB (R8 minified)
```
CI builds everything on each push (see the *Actions* tab → artifacts for the APK/AAB).

### Release configuration
- **Signing**: create `keystore.properties` in the project root (git-ignored):
  ```
  storeFile=release.jks
  storePassword=…
  keyAlias=…
  keyPassword=…
  ```
- **AdMob**: `gradle.properties` contains Google's *test* IDs. For production, override `ADMOB_APP_ID`, `ADMOB_BANNER_ID`, `ADMOB_INTERSTITIAL_ID` in `~/.gradle/gradle.properties` or as environment variables. Set `ADS_ENABLED=false` to ship without ads.
- Bump `versionCode` / `versionName` in `app/build.gradle.kts`.

### Google Play notes
- Declare the **dataSync foreground service** use (long user-initiated downloads) in Play Console.
- Data safety: no account, no personal data collected by the app itself; AdMob collects advertising ID per Google's disclosures.
- Store listing must not reference YouTube downloading.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.
