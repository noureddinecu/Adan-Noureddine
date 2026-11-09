#!/usr/bin/env bash
# Builds everything the TV needs (run by GitHub Actions; see .github/workflows/noor-tv.yml).
# Expects noor-tv/ and cleanyourtv/ checked out next to noor/, and ANDROID_HOME + JDK 17 on the runner.
set -euo pipefail
source noor/city.env
OUT="$PWD/out"; rm -rf "$OUT"; mkdir -p "$OUT"
# One version number for every app of this build, so the phone app knows when a TV needs updating.
VER=$((1000 + ${GITHUB_RUN_NUMBER:-0}))
sed -i -E "s/^( *versionCode) [0-9]+/\1 $VER/" noor-tv/noor-app/app/build.gradle cleanyourtv/launcher/app/build.gradle \
  cleanyourtv/addons/prayer-times/app/build.gradle noor/phone-app/app/build.gradle
grep -q "versionCode $VER" noor-tv/noor-app/app/build.gradle
# Every APK is signed with noor/debug.keystore, so a new build installs over the apps already on the TV.
KS="$PWD/noor/debug.keystore"
SIGN=(-Pandroid.injected.signing.store.file="$KS" -Pandroid.injected.signing.store.password=android
      -Pandroid.injected.signing.key.alias=androiddebugkey -Pandroid.injected.signing.key.password=android)

python3 -I noor-tv/launcher-patch/apply.py cleanyourtv "$LAT" "$LON" "$METHOD" "$CITY"
# The city then comes from the phone at run time; the one above is only the starting value.
python3 -I noor/city-runtime.py "$LAT" "$LON" "$METHOD" "$CITY"

# Own package name: this TV already has another build of the CleanYourTV launcher (com.gathin.tvhome, another
# signing key), which cannot be updated in place and, by the skill's rule, is disabled rather than uninstalled.
HOME_ID=app.noortv.home
(cd cleanyourtv/launcher && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain -PlauncherApplicationId=$HOME_ID "${SIGN[@]}")
cp cleanyourtv/launcher/app/build/outputs/apk/release/app-release.apk "$OUT/launcher.apk"

(cd cleanyourtv/addons/prayer-times && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain "${SIGN[@]}")
cp cleanyourtv/addons/prayer-times/app/build/outputs/apk/release/app-release.apk "$OUT/prayer-times.apk"

# The adhan recording comes from the phone (tv.sh adhan); the app's behaviour is the owner's choice.
python3 -I noor/patch-adhan.py noor-tv/noor-app/app/src/main/java/app/noortv/Adhan.java
# The phone page studio: draw, write, stickers and photos on the TV.
python3 -I noor/patch-phone-page.py noor-tv/noor-app/app/src/main/java/app/noortv/MessageServer.java
mkdir -p noor-tv/noor-app/app/src/main/assets && python3 -I noor/inline-icons.py noor/phone-page.html noor-tv/noor-app/app/src/main/assets/page.html
# Adhkar on screen, in Amiri (SIL Open Font License); the salawat line every 45 minutes is now one of the adhkar.
cp noor/Dhikr.java noor-tv/noor-app/app/src/main/java/app/noortv/Dhikr.java
# The chime for a new message on the TV.
mkdir -p noor-tv/noor-app/app/src/main/res/raw && python3 -I noor/make-chime.py noor-tv/noor-app/app/src/main/res/raw/chime.wav
curl -fsSL -o noor-tv/noor-app/app/src/main/assets/amiri.ttf https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Bold.ttf || echo "no Amiri; serif fallback"
python3 -I - noor-tv/noor-app/app/src/main/java/app/noortv/Reminder.java <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
old = """        if (!friday) {
            show(app, "صلّ على النبي ﷺ");
            return;
        }"""
assert old in s, "Reminder.java changed upstream"
open(p, "w", encoding="utf-8").write(s.replace(old, "        if (!friday) return; // the salawat line comes with the adhkar now"))
PY

sed -i "s/static final String HOME = \"com.gathin.tvhome\";/static final String HOME = \"$HOME_ID\";/" noor-tv/noor-app/app/src/main/java/app/noortv/Adhan.java
grep -q "HOME = \"$HOME_ID\"" noor-tv/noor-app/app/src/main/java/app/noortv/Adhan.java

P=noor-tv/noor-app/gradle.properties
sed -i "s/^noor.lat=.*/noor.lat=$LAT/; s/^noor.lon=.*/noor.lon=$LON/; s/^noor.method=.*/noor.method=$METHOD/" "$P"
(cd noor-tv/noor-app && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain "${SIGN[@]}")
for f in kahf baqara sabah masa ruqya; do
  cp "noor-tv/noor-app/app/build/outputs/apk/$f/release/app-$f-release.apk" "$OUT/noor-$f.apk"
done

mkdir -p themes-out
for t in zakhrafa masjid-layl awqat plain; do python3 -I noor-tv/tools/make-theme.py "$t" "themes-out/$t"; done
tar -czf "$OUT/themes.tar.gz" -C themes-out .

# The phone app carries everything a TV needs, so it can set one up on its own: the TV apps, the themes,
# CleanYourTV's tested per-model lists and the setup screens.
A=noor/phone-app/app/src/main/assets
rm -rf "$A" && mkdir -p "$A/tv" "$A/themes"
cp "$OUT"/launcher.apk "$OUT"/prayer-times.apk "$OUT"/noor-*.apk "$A/tv/"
echo "$VER" > "$A/tv/version.txt"
cp -r themes-out/. "$A/themes/"
python3 -I noor/make-debloat-index.py cleanyourtv "$A/debloat.json"
python3 -I noor/inline-icons.py noor/setup.html "$A/setup.html"
python3 -I noor/inline-icons.py noor/home.html "$A/home.html"
cp -r noor-tv/noor-app/gradlew noor-tv/noor-app/gradle noor/phone-app/
(cd noor/phone-app && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain "${SIGN[@]}")
cp noor/phone-app/app/build/outputs/apk/release/app-release.apk "$OUT/noor-phone.apk"

# Refuse to publish an APK that is not signed with the repo key.
keytool -exportcert -alias androiddebugkey -keystore "$KS" -storepass android -file key.der
python3 -I - "$OUT"/*.apk <<'PY'
import sys
key = open("key.der", "rb").read()
bad = [f for f in sys.argv[1:] if key not in open(f, "rb").read()]
sys.exit(f"not signed with noor/debug.keystore: {bad}" if bad else 0)
PY

cp noor/tv.sh "$OUT/tv.sh"
printf '{"version":%s,"name":"%s"}\n' "$VER" "$(sed -n "s/.*versionName '\(.*\)'.*/\1/p" noor/phone-app/app/build.gradle)" > "$OUT/version.json"
ls -la "$OUT"
