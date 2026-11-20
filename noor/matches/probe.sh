#!/usr/bin/env bash
# Prints the shape of ESPN's public soccer scoreboard for the matches row (run on GitHub Actions: the build needs it).
set -u
B=https://site.api.espn.com/apis/site/v2/sports/soccer
get() { curl -sS -m 20 -A "Mozilla/5.0" "$1"; }
echo "== esp.1 structure"; get "$B/esp.1/scoreboard" | jq -c '{n:(.events|length), leagues:[.leagues[0]|{name,abbreviation,logo:(.logos[0].href)}], ev:(.events[0]|{date,name,status:.status, comp:(.competitions[0]|{venue:.venue.fullName, competitors:[.competitors[]|{homeAway,score,team:(.team|{id,displayName,shortDisplayName,abbreviation,logo})}]})})}'
for q in "lang=ar&region=sa" "lang=es&region=es"; do echo "== esp.1 $q"; get "$B/esp.1/scoreboard?$q" | jq -c '[.events[0:2][]|.competitions[0].competitors[].team.displayName]'; done
for l in eng.1 uefa.champions fifa.friendly caf.nations fifa.worldq.caf fifa.world caf.nations_qual fifa.wcq.caf uefa.champions_qual; do
  echo "== $l"; get "$B/$l/scoreboard" | jq -c '{league:.leagues[0].name, n:(.events|length), cal:(.leagues[0].calendar|length), sample:[.events[0:3][]|{date,name}]}' 2>&1 | head -c 600; echo; done
echo "== dates"; get "$B/esp.1/scoreboard?dates=$(date -u +%Y%m%d)" | jq -c '[.events[]|{date,name}]' | head -c 800; echo
echo "== morocco"; for l in fifa.friendly caf.nations fifa.worldq.caf fifa.world; do get "$B/$l/teams" | jq -c --arg l "$l" '[.sports[0].leagues[0].teams[]?.team|select(.abbreviation=="MAR" or .displayName=="Morocco")|{l:$l,id,displayName,abbreviation,logo:(.logos[0].href)}]'; done
echo "== morocco schedule"; for l in fifa.friendly caf.nations fifa.worldq.caf; do get "$B/$l/teams/2869/schedule" | jq -c '{team:.team.displayName, n:(.events|length), next:[.events[-3:][]?|{date,name,league:.league.abbreviation}]}' 2>&1 | head -c 500; echo; done
echo "== all scoreboard"; get "$B/all/scoreboard" | jq -c '{n:(.events|length), leagues:[.leagues[]?.slug][0:20]}' 2>&1 | head -c 600; echo
