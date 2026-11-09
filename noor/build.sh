#!/usr/bin/env bash
# Builds everything the TV needs (run by GitHub Actions; see .github/workflows/noor-tv.yml).
# Expects noor-tv/ and cleanyourtv/ checked out next to noor/, and ANDROID_HOME + JDK 17 on the runner.
set -euo pipefail
source noor/city.env
OUT="$PWD/out"; rm -rf "$OUT"; mkdir -p "$OUT"

python3 -I noor-tv/launcher-patch/apply.py cleanyourtv "$LAT" "$LON" "$METHOD" "$CITY"

(cd cleanyourtv/launcher && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain)
cp cleanyourtv/launcher/app/build/outputs/apk/release/app-release.apk "$OUT/launcher.apk"

(cd cleanyourtv/addons/prayer-times && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain)
cp cleanyourtv/addons/prayer-times/app/build/outputs/apk/release/app-release.apk "$OUT/prayer-times.apk"

P=noor-tv/noor-app/gradle.properties
sed -i "s/^noor.lat=.*/noor.lat=$LAT/; s/^noor.lon=.*/noor.lon=$LON/; s/^noor.method=.*/noor.method=$METHOD/" "$P"
(cd noor-tv/noor-app && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain)
for f in kahf baqara sabah masa ruqya; do
  cp "noor-tv/noor-app/app/build/outputs/apk/$f/release/app-$f-release.apk" "$OUT/noor-$f.apk"
done

mkdir -p themes-out
for t in zakhrafa masjid-layl awqat plain; do python3 -I noor-tv/tools/make-theme.py "$t" "themes-out/$t"; done
tar -czf "$OUT/themes.tar.gz" -C themes-out .
cp noor/tv.sh "$OUT/tv.sh"
ls -la "$OUT"
