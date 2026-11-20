#!/usr/bin/env python3
"""Today's list as the TV will show it (same rules as Matches.java), for the build log: python3 today.py [Europe/Madrid]"""
import datetime, gzip, json, pathlib, sys, urllib.request, zoneinfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import names  # noqa: E402

tz = zoneinfo.ZoneInfo(sys.argv[1] if len(sys.argv) > 1 else "Europe/Madrid")
CLUBS = ["uefa.champions", "uefa.champions_qual", "esp.1", "eng.1"]
NATIONS = ["fifa.world", "fifa.worldq.caf", "caf.nations", "caf.nations_qual", "fifa.friendly"]
teams = {**names.CLUBS, **names.NATIONS}
today = datetime.datetime.now(tz).date()


def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read()
    return json.loads(gzip.decompress(r) if r[:2] == b"\x1f\x8b" else r)


rows, seen = [], set()
for l in CLUBS + NATIONS:
    for d in (today - datetime.timedelta(days=1), today):
        try:
            j = get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{l}/scoreboard?dates={d:%Y%m%d}&limit=200")
        except Exception as e:
            print("failed", l, d, e)
            continue
        for e in j.get("events", []):
            t = datetime.datetime.fromisoformat(e["date"].replace("Z", "+00:00")).astimezone(tz)
            if t.date() != today or (l, e["id"]) in seen:
                continue
            c = e["competitions"][0]["competitors"]
            h = next(x for x in c if x["homeAway"] == "home")
            a = next(x for x in c if x["homeAway"] != "home")
            if l in NATIONS and "2869" not in (h["team"]["id"], a["team"]["id"]):
                continue
            seen.add((l, e["id"]))
            ar = lambda x: teams.get(x["team"]["displayName"]) or teams.get(x["team"].get("shortDisplayName")) or "⚠ " + x["team"]["displayName"]
            st = e["status"]["type"]["state"]
            rows.append((t, f"{t:%H:%M}  {names.LEAGUES[l]:<22} {ar(h)} – {ar(a)}  [{st} {h.get('score','')}-{a.get('score','')}]"))
print(f"== today on the TV ({today}, {tz}): {len(rows)} matches")
for _, r in sorted(rows):
    print(r)
