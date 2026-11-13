#!/data/data/com.termux/files/usr/bin/bash
# Noor TV from an Android phone (Termux + adb), using the APKs GitHub Actions built from noor/.
# It does what noor-tv's SKILL.md step 7-8 do with CleanYourTV's scripts, but with plain adb, so no
# computer, JDK or Python is needed on the phone.
#
#   bash tv.sh get                                  download the build into ~/noor-build
#   bash tv.sh launcher <tv-ip> <backup-folder>     install the new Home; disables the stock one only once the new one runs
#   bash tv.sh prayer <tv-ip>                       install the prayer-times addon
#   bash tv.sh theme <tv-ip> <zakhrafa|masjid-layl|awqat|plain>
#   bash tv.sh noor <tv-ip>                         install the Kahf/Baqarah/adhkar/ruqyah cards, reminders and phone page,
#                                                   and update the Home screen when it is ours
#   bash tv.sh adhan <tv-ip> [youtube-url]          download the adhan on the phone and put it on the TV
#   bash tv.sh test-adhan <tv-ip>                   play the adhan and its banner now, to check
#   bash tv.sh doctor <tv-ip>                       adhkar or adhan not showing: check and fix, then show a dhikr
#   bash tv.sh restore <tv-ip> [backup-folder]      the TV as it was: apps turned back on, its own Home back, and only
#                                                   the apps this setup installed removed (never a system app)
set -euo pipefail
URL=https://github.com/noureddinecu/Adan-Noureddine/releases/download/noor-tv-build
B=~/noor-build
PKG=app.noortv.home
ACT=$PKG/com.gathin.tvhome.MainActivity
HOMEQ='cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME'
CMD="${1:-}"; IP="${2:-}"; D="$IP:5555"

need_ip() { [ -n "$IP" ] || { echo "usage: bash tv.sh $CMD <tv-ip> ..."; exit 1; }; }
sh_() { adb -s "$D" shell "$@" | tr -d '\r'; }
home_now() { sh_ "$HOMEQ" | tail -n 1; }
# The adhkar and the adhan run in the Noor app's background service: allow it over other apps, keep the system from
# putting it to sleep or killing it, and start it.
keep_alive() {
  sh_ "appops set app.noortv.kahf SYSTEM_ALERT_WINDOW allow; appops set app.noortv.kahf GET_USAGE_STATS allow; \
dumpsys deviceidle whitelist +app.noortv.kahf; am set-standby-bucket app.noortv.kahf active; \
appops set app.noortv.kahf RUN_IN_BACKGROUND allow" >/dev/null 2>&1 || true
}
install_apk() {
  local out; out=$(adb -s "$D" install -r "$1" 2>&1 | tr -d '\r') || true
  case "$out" in *Success*) echo "✅ $(basename "$1")" ;; *) echo "⛔ $(basename "$1"): $out"; return 1 ;; esac
}

case "$CMD" in
get)
  mkdir -p "$B"
  for f in launcher.apk prayer-times.apk noor-kahf.apk noor-baqara.apk noor-sabah.apk noor-masa.apk noor-ruqya.apk themes.tar.gz; do
    curl -fsSL -o "$B/$f" "$URL/$f" && echo "✅ $f"
  done
  rm -rf "$B/themes"; mkdir -p "$B/themes"; tar -xzf "$B/themes.tar.gz" -C "$B/themes"
  # This script too, so the next run uses the newest one (moved into place, not written over while it runs).
  curl -fsSL -o ~/tv.sh.new "$URL/tv.sh" && mv ~/tv.sh.new ~/tv.sh && echo "✅ tv.sh"
  echo "ready: $B"
  ;;

launcher)
  need_ip; BK="${3:?usage: bash tv.sh launcher <tv-ip> <backup-folder>}"
  [ -f "$BK/disabled-by-us.txt" ] || { echo "no backup in $BK"; exit 1; }
  STOCK=$(home_now | cut -d/ -f1)
  case "$STOCK" in
    com.google.android.tvlauncher|com.google.android.leanbacklauncher|com.google.android.apps.tv.launcherx|com.gathin.tvhome) ;;
    "$PKG") STOCK=none ;;
    *) echo "⛔ Home is '$STOCK', which this script does not know. Nothing was changed."; exit 1 ;;
  esac
  echo "stock launcher: $STOCK"
  # A stock launcher someone else already disabled goes into the backup list too, so restore.sh brings it back.
  DIS=$(sh_ "pm list packages -d")
  for p in com.google.android.tvlauncher com.google.android.leanbacklauncher; do
    if printf '%s\n' "$DIS" | grep -qx "package:$p" && ! grep -qx "$p" "$BK/disabled-by-us.txt"; then
      echo "$p" >> "$BK/disabled-by-us.txt"; echo "noted for restore: $p (was already off)"
    fi
  done
  install_apk "$B/launcher.apk"
  # Start the new Home first; the stock one is only disabled once this one is really up.
  OUT=$(sh_ "am start -W -a android.intent.action.MAIN -c android.intent.category.HOME -n $ACT")
  echo "$OUT" | grep -q 'Status: ok' && ! echo "$OUT" | grep -qi '^Error' || {
    echo "⛔ the new Home did not start; $STOCK was left as it was."; echo "$OUT"; exit 1; }
  sh_ "pm grant $PKG android.permission.ACCESS_FINE_LOCATION" 2>/dev/null || true
  echo "optimising (about a minute)..."; sh_ "cmd package compile -m speed -f $PKG" >/dev/null || true
  if [ "$STOCK" != none ]; then
    R=$(sh_ "pm disable-user --user 0 $STOCK")
    case "$R" in *disabled-user*) echo "$STOCK" >> "$BK/disabled-by-us.txt" ;; esac
  fi
  sh_ "cmd package set-home-activity --user 0 $ACT" >/dev/null || true
  NOW=$(home_now)
  case "$NOW" in
    "$PKG"/*) echo "✅ the new Home is set" ;;
    *)
      echo "⛔ Home went to '$NOW'; putting $STOCK back"
      if [ "$STOCK" != none ]; then
        sh_ "pm enable --user 0 $STOCK" >/dev/null
        sed -i "/^${STOCK//./\\.}\$/d" "$BK/disabled-by-us.txt"
        sh_ "cmd package set-home-activity --user 0 \$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME $STOCK | tail -n 1)" >/dev/null || true
      fi
      echo "Home is now: $(home_now)"; exit 1 ;;
  esac
  ;;

prayer)
  need_ip; install_apk "$B/prayer-times.apk" ;;

theme)
  need_ip; NAME="${3:?usage: bash tv.sh theme <tv-ip> <zakhrafa|masjid-layl|awqat|plain>}"
  T="$B/themes/$NAME"; [ -f "$T/config.json" ] || { echo "no theme $NAME in $B/themes"; exit 1; }
  DIR=/sdcard/Android/data/$PKG/files; URI=content://$PKG.theme; TMP=/data/local/tmp/noor-theme
  put() {  # put <local file> <path inside the launcher's theme folder>
    adb -s "$D" push "$1" "$TMP" >/dev/null
    local want got; want=$(wc -c < "$1" | tr -d ' ')
    got=$(sh_ "mkdir -p \$(dirname $DIR/$2) 2>/dev/null; rm -f $DIR/$2 2>/dev/null
      o=\$(content write --uri $URI/$2 < $TMP 2>&1) || o=fail
      case \"\$o\" in *fail*|*Unsupported*|*Error*) cp $TMP $DIR/$2 ;; esac
      rm -f $TMP
      if [ -e $DIR/$2 ]; then wc -c < $DIR/$2; else content read --uri $URI/$2 2>/dev/null | wc -c; fi" | tail -n 1 | tr -d ' ')
    [ "$got" = "$want" ] && echo "✅ $2" || { echo "⛔ $2 did not reach the TV"; exit 1; }
  }
  del() { sh_ "rm -f $DIR/$1 2>/dev/null; content delete --uri $URI/$1 2>/dev/null" >/dev/null || true; }
  sh_ "mkdir -p $DIR" >/dev/null 2>&1 || true
  put "$T/config.json" config.json
  if [ -f "$T/wallpaper.jpg" ]; then put "$T/wallpaper.jpg" wallpaper.jpg; else del wallpaper.jpg; fi
  sh_ "rm -f $DIR/wallpapers/* 2>/dev/null; content delete --uri $URI/wallpapers 2>/dev/null" >/dev/null || true
  if [ -d "$T/wallpapers" ]; then for w in "$T"/wallpapers/*; do [ -f "$w" ] && put "$w" "wallpapers/$(basename "$w")"; done; fi
  REV="$B/theme_revision"; head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$REV"
  put "$REV" theme_revision
  sh_ "am force-stop $PKG; am start -W -a android.intent.action.MAIN -c android.intent.category.HOME -n $ACT" | grep -q 'Status: ok' \
    && echo "✅ theme $NAME is on the TV" || echo "⚠️ theme is on the TV; press Home on the remote to see it"
  ;;

noor)
  need_ip
  for f in kahf baqara sabah masa ruqya; do install_apk "$B/noor-$f.apk"; done
  # The Home screen (prayer row, Noor line) is part of the update too when it is ours.
  HP=$(home_now | cut -d/ -f1)
  if [ "$HP" = "$PKG" ]; then
    install_apk "$B/launcher.apk"
    sh_ "am start -a android.intent.action.MAIN -c android.intent.category.HOME" >/dev/null || true
  else
    echo "⚠️ Home on the TV is '$HP', not $PKG: the Home screen was not updated (bash tv.sh launcher $IP <backup-folder>)"
  fi
  echo "versions: $(sh_ "dumpsys package $PKG | grep -m1 versionCode; dumpsys package app.noortv.kahf | grep -m1 versionCode" | tr -s ' \n' ' ')"
  keep_alive
  sleep 8  # Android restarts the app right after an update
  sh_ "am broadcast -n app.noortv.kahf/app.noortv.Reminder" >/dev/null
  echo "Phone page: http://$IP:8080"
  ;;

doctor)
  # Why the adhkar or the adhan do not show, and the fix: permissions, sleep, the service, the next adhan alarm.
  need_ip
  echo "over other apps: $(sh_ "appops get app.noortv.kahf SYSTEM_ALERT_WINDOW")"
  echo "service running: $(sh_ "dumpsys activity services app.noortv.kahf/.MessageServer | grep -c ServiceRecord")"
  echo "adhan alarm set: $(sh_ "dumpsys alarm | grep -c 'app.noortv.kahf'")"
  echo "adhkar settings: $(curl -s -m 3 "http://$IP:8080/dhikr" || echo 'no answer from the Noor app')"
  keep_alive
  sh_ "am broadcast -n app.noortv.kahf/app.noortv.Reminder" >/dev/null
  sleep 4
  curl -s -m 3 -X POST "http://$IP:8080/dhikr?on=1&do=test" >/dev/null && echo "✅ fixed; a dhikr is on the TV now" \
    || echo "⛔ the Noor app does not answer: bash tv.sh noor $IP"
  ;;

adhan)
  need_ip; YT="${3:-https://www.youtube.com/watch?v=yzZwAt1DRKA}"
  command -v ffmpeg >/dev/null || pkg install -y ffmpeg
  command -v yt-dlp >/dev/null || { command -v pip >/dev/null || pkg install -y python; pip install -q yt-dlp; }
  T=$(mktemp -d); yt-dlp -q -x --audio-format mp3 -o "$T/a.%(ext)s" "$YT"
  ffmpeg -v error -y -i "$T/a.mp3" -af "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-18:TP=-2" \
    -ar 44100 -ac 1 -b:a 96k "$B/adhan.mp3"
  rm -rf "$T"
  F=/sdcard/Android/data/app.noortv.kahf/files
  sh_ "mkdir -p $F" >/dev/null; adb -s "$D" push "$B/adhan.mp3" "$F/adhan.mp3" >/dev/null
  [ "$(sh_ "wc -c < $F/adhan.mp3" | tr -d ' ')" = "$(wc -c < "$B/adhan.mp3" | tr -d ' ')" ] \
    && echo "✅ adhan on the TV ($(( $(wc -c < "$B/adhan.mp3") / 1024 )) KB)" || { echo "⛔ adhan did not reach the TV"; exit 1; }
  ;;

restore|reset-ours)
  # The TV as it was: everything turned off is on again, Home goes back to the TV's own screen (the first stock one
  # really there), and only then the apps this setup installed are removed, the new home screen first. With no stock
  # home found nothing is removed, so the TV is never left without one. The same script as the phone app's restore.
  need_ip; BK="${3:-}"
  ON="$([ -n "$BK" ] && [ -f "$BK/disabled-by-us.txt" ] && grep -E '^[A-Za-z][A-Za-z0-9_.]+$' "$BK/disabled-by-us.txt" | tr '\n' ' ')"
  OUT=$(sh_ "D=\$(pm list packages -d); n=0; for p in $ON com.miui.tv.analytics com.xiaomi.statistic com.google.android.feedback com.google.android.tv.bugreportsender com.xiaomi.mitv.tvmanager com.mitv.tvhome.atv com.mitv.tvhome.michannel com.xm.webcontent com.xiaomi.floatingframe com.google.android.tvrecommendations android.autoinstalls.config.xiaomi.amelie com.xiaomi.mimusic2 com.google.android.play.games com.google.android.videos com.mitv.gallery com.google.android.katniss com.google.android.backdrop com.mitv.dream com.netflix.ninja com.amazon.amazonvideo.livingroom com.google.android.youtube.tvmusic com.google.android.leanbacklauncher com.google.android.leanbacklauncher.recommendations com.google.android.tvlauncher; do case \"\$D\" in *\"package:\$p\"*) pm enable --user 0 \$p >/dev/null 2>&1 && n=\$((n+1));; esac; done; echo \"on=\$n\"; S=; for p in com.google.android.tvlauncher com.google.android.apps.tv.launcherx com.mitv.tvhome.atv com.mitv.tvhome com.google.android.leanbacklauncher; do pm list packages -e \$p | grep -qx \"package:\$p\" || continue; a=\$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME \$p | tail -n 1); case \"\$a\" in */*) S=\$a; break;; esac; done; [ -n \"\$S\" ] || for a in \$(cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.\$]+'); do case \"\$a\" in app.noortv.home/*|com.gathin.tvhome/*|com.android.tv.settings/*|com.android.settings/*) ;; *) S=\$a; break;; esac; done; echo \"stock=\$S\"; if [ -n \"\$S\" ]; then cmd package set-home-activity --user 0 \$S >/dev/null 2>&1; pm list packages -s app.noortv.home | grep -q . || { pm uninstall app.noortv.home 2>/dev/null | grep -q Success && echo \"gone=app.noortv.home\"; }; cmd package set-home-activity --user 0 \$S >/dev/null 2>&1; for p in com.majnioui.tv.prayer app.noortv.baqara app.noortv.sabah app.noortv.masa app.noortv.ruqya app.noortv.kahf; do pm list packages \$p | grep -qx \"package:\$p\" || continue; pm list packages -s \$p | grep -qx \"package:\$p\" && continue; pm uninstall \$p 2>/dev/null | grep -q Success && echo \"gone=\$p\"; done; fi; am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null 2>&1; echo \"home=\$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tail -n 1)\"; echo done")
  echo "$OUT" | sed -n 's/^on=/turned back on: /p; s/^stock=/the TV'"'"'s own home: /p; s/^gone=/🗑️ removed: /p'
  H=$(echo "$OUT" | sed -n 's/^home=//p'); S=$(echo "$OUT" | sed -n 's/^stock=//p')
  if [ -z "$S" ]; then echo "⛔ no stock home screen found on the TV: nothing was removed"; exit 1; fi
  case "$H" in "$PKG"/*|"") echo "⛔ Home is still '$H': run this again"; exit 1 ;; esac
  [ -n "$BK" ] && [ -f "$BK/disabled-by-us.txt" ] && : > "$BK/disabled-by-us.txt"
  echo "✅ the TV is back as it was (Home: $H)"
  ;;

test-adhan)
  need_ip
  sh_ "am broadcast -n app.noortv.kahf/app.noortv.Adhan -a app.noortv.ADHAN --ei p 2" >/dev/null
  echo "▶️ the Asr adhan should play on the TV now"
  ;;

*) sed -n '2,13p' "$0"; exit 1 ;;
esac
