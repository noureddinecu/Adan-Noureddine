#!/usr/bin/env bash
# Builds everything the TV needs (run by GitHub Actions; see .github/workflows/noor-tv.yml).
# Expects noor-tv/ and cleanyourtv/ checked out next to noor/, and ANDROID_HOME + JDK 17 on the runner.
set -euo pipefail
source noor/city.env
OUT="$PWD/out"; rm -rf "$OUT"; mkdir -p "$OUT"

python3 -I noor-tv/launcher-patch/apply.py cleanyourtv "$LAT" "$LON" "$METHOD" "$CITY"

# Own package name: this TV already has another build of the CleanYourTV launcher (com.gathin.tvhome, another
# signing key), which cannot be updated in place and, by the skill's rule, is disabled rather than uninstalled.
HOME_ID=app.noortv.home
(cd cleanyourtv/launcher && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain -PlauncherApplicationId=$HOME_ID)
cp cleanyourtv/launcher/app/build/outputs/apk/release/app-release.apk "$OUT/launcher.apk"

(cd cleanyourtv/addons/prayer-times && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain)
cp cleanyourtv/addons/prayer-times/app/build/outputs/apk/release/app-release.apk "$OUT/prayer-times.apk"

# Adhan (SKILL.md step 8): pick a full adhan (2.5-6 min) by Anas Tazi from a YouTube search.
# If YouTube refuses the runner, the build goes on and the banner is silent.
if [ -n "${ADHAN_URL:-}${ADHAN_QUERY:-}" ]; then
  pip install -q yt-dlp || true
  yt-dlp --flat-playlist --print "%(id)s"$'\t'"%(duration)s"$'\t'"%(channel)s"$'\t'"%(title)s" "ytsearch15:$ADHAN_QUERY" > adhan-search.tsv 2>adhan-err.txt || true
  cat adhan-search.tsv
  if [ -n "${ADHAN_URL:-}" ]; then ID="${ADHAN_URL##*v=}"; else ID=$(awk -F'\t' '$2>=150 && $2<=360 && ($4 ~ /التازي|Tazi|tazi/) {print $1; exit}' adhan-search.tsv); fi
  if [ -n "$ID" ] && (cd noor-tv && bash tools/fetch-adhan.sh "https://www.youtube.com/watch?v=$ID" 2>>../adhan-err.txt); then
    echo "adhan: https://www.youtube.com/watch?v=$ID $(grep "^$ID" adhan-search.tsv | cut -f4)" > "$OUT/adhan.txt"
  else
    { echo "adhan: none (silent banner)"; cat adhan-err.txt; } > "$OUT/adhan.txt"
  fi
  cp adhan-search.tsv "$OUT/adhan-search.txt" 2>/dev/null || true
fi

sed -i "s/static final String HOME = \"com.gathin.tvhome\";/static final String HOME = \"$HOME_ID\";/" noor-tv/noor-app/app/src/main/java/app/noortv/Adhan.java
grep -q "HOME = \"$HOME_ID\"" noor-tv/noor-app/app/src/main/java/app/noortv/Adhan.java

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
