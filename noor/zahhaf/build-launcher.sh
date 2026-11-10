#!/usr/bin/env bash
# Builds the Noor launcher under Clean Your TV's own package (com.gathin.tvhome), signed with the repo key, for
# Zahhaf TV to bundle in place of the Clean Your TV launcher. Expects noor-tv/ and cleanyourtv/ checked out.
# Prints the APK path. Usage: noor/zahhaf/build-launcher.sh <version code>
set -euo pipefail
VER="$1"
source noor/city.env
python3 -I noor-tv/launcher-patch/apply.py cleanyourtv "$LAT" "$LON" "$METHOD" "$CITY" >&2
python3 -I noor/city-runtime.py "$LAT" "$LON" "$METHOD" "$CITY" >&2
python3 -I noor/prayer-row.py >&2
sed -i -E "s/^( *versionCode) [0-9]+/\1 $VER/" cleanyourtv/launcher/app/build.gradle
KS="$PWD/noor/debug.keystore"
(cd cleanyourtv/launcher && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease -q --console=plain \
  -Pandroid.injected.signing.store.file="$KS" -Pandroid.injected.signing.store.password=android \
  -Pandroid.injected.signing.key.alias=androiddebugkey -Pandroid.injected.signing.key.password=android) >&2
echo "$PWD/cleanyourtv/launcher/app/build/outputs/apk/release/app-release.apk"
