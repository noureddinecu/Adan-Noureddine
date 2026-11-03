#!/usr/bin/env bash
# Builds a signed Android APK (offline WebView shell + bundled web app) without Gradle.
# Requirements (Ubuntu): apt-get install android-sdk android-sdk-platform-23 apksigner zipalign
#                        + D8 jar: https://storage.googleapis.com/r8-releases/raw/8.5.35/r8.jar → /opt/r8/r8.jar
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
PLATFORM="$SDK/platforms/android-23/android.jar"
D8_JAR="${D8_JAR:-/opt/r8/r8.jar}"
OUT="$ROOT/build/apk"
KEYSTORE="$ROOT/android/keystore/release.jks"
KS_PASS="${KS_PASS:-dalil-muraqaba-2025}"
VERSION=$(node -p "require('$ROOT/package.json').version")

rm -rf "$OUT" && mkdir -p "$OUT"/{res,gen,classes,assets/www} "$ROOT/release"

echo "› web build (APK mode)"
(cd "$ROOT" && VITE_APK=1 npm run build --silent >/dev/null)
cp -r "$ROOT/dist/." "$OUT/assets/www/"
rm -f "$OUT"/assets/www/sw.js "$OUT"/assets/www/workbox-*.js "$OUT"/assets/www/registerSW.js

echo "› launcher icons"
node "$ROOT/scripts/build-icons.mjs" --android "$OUT/res-icons" >/dev/null
cp -r "$ROOT/android/res/." "$OUT/res-src/" 2>/dev/null || { mkdir -p "$OUT/res-src"; cp -r "$ROOT/android/res/." "$OUT/res-src/"; }
cp -r "$OUT/res-icons/." "$OUT/res-src/"

echo "› aapt2"
aapt2 compile --dir "$OUT/res-src" -o "$OUT/res/compiled.zip"
aapt2 link -o "$OUT/unsigned.apk" -I "$PLATFORM" --manifest "$ROOT/android/AndroidManifest.xml" \
  --min-sdk-version 21 --target-sdk-version 34 --version-name "$VERSION" \
  -A "$OUT/assets" --java "$OUT/gen" --auto-add-overlay "$OUT/res/compiled.zip"

echo "› javac + d8"
javac -nowarn -source 8 -target 8 -bootclasspath "$PLATFORM" -classpath "$PLATFORM" -d "$OUT/classes" \
  $(find "$ROOT/android/src" "$OUT/gen" -name '*.java') 2>&1 | grep -v -e '^Picked up' -e 'warning:' || true
java -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api 21 --lib "$PLATFORM" --output "$OUT" \
  $(find "$OUT/classes" -name '*.class') 2>&1 | grep -v '^Picked up' || true
(cd "$OUT" && zip -q -u unsigned.apk classes.dex)

echo "› zipalign + sign"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias dalil \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Dalil Muraqaba Tarqiya, O=Dalil, C=MA" 2>&1 | grep -v '^Picked up' || true
fi
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
APK="$ROOT/release/dalil-muraqaba-tarqiya-v$VERSION.apk"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias dalil --out "$APK" "$OUT/aligned.apk"
apksigner verify --print-certs "$APK" | head -1
echo "✔ $APK ($(du -h "$APK" | cut -f1))"
