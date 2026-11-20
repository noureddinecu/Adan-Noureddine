#!/usr/bin/env bash
# Builds the plain CleanYourTV launcher with today's matches (and nothing of Noor), signed with the repo key.
# Expects cleanyourtv/ checked out next to noor/, ANDROID_HOME and JDK 17. Writes out/matches-launcher.apk.
set -euo pipefail
OUT="$PWD/out"; mkdir -p "$OUT"
VER=$((1000 + ${GITHUB_RUN_NUMBER:-0}))
sed -i -E "s/^( *versionCode) [0-9]+/\1 $VER/" cleanyourtv/launcher/app/build.gradle
python3 -I noor/matches/apply.py
# The teams of this season, to list any without an Arabic name (the build goes on; they show in English).
T=$(mktemp -d)
for l in esp.1 eng.1 uefa.champions; do
  curl -sS -m 20 -A "Mozilla/5.0" -o "$T/$l.json" "https://site.api.espn.com/apis/site/v2/sports/soccer/$l/teams" || true
done
python3 -I noor/matches/gen-names.py cleanyourtv/launcher/app/src/main/java/com/gathin/tvhome "$T"/*.json
KS="$PWD/noor/debug.keystore"
(cd cleanyourtv/launcher && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain \
  -PlauncherApplicationId=app.zahhaf.matches \
  -Pandroid.injected.signing.store.file="$KS" -Pandroid.injected.signing.store.password=android \
  -Pandroid.injected.signing.key.alias=androiddebugkey -Pandroid.injected.signing.key.password=android)
cp cleanyourtv/launcher/app/build/outputs/apk/release/app-release.apk "$OUT/matches-launcher.apk"
ls -la "$OUT/matches-launcher.apk"
