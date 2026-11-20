#!/usr/bin/env python3
"""Today's list as the TV will show it (same rules as Matches.java), for the build log: python3 today.py [Europe/Madrid]"""
import datetime, gzip, json, pathlib, sys, urllib.request, zoneinfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import names  # noqa: E402

tz = zoneinfo.ZoneInfo(sys.argv[1] if len(sys.argv) > 1 else "Europe/Madrid")
COMPS = [("fifa.world", 1000, "ALL"), ("caf.nations", 950, "ALL"), ("uefa.euro", 900, "ALL"), ("conmebol.america", 850, "ALL"),
         ("fifa.cwc", 800, "ALL"), ("uefa.champions", 700, "ALL"), ("eng.1", 500, "ALL"), ("esp.1", 490, "ALL"),
         ("ita.1", 480, "ALL"), ("ger.1", 470, "ALL"), ("fra.1", 460, "ALL"), ("uefa.europa", 420, "ALL"), ("ksa.1", 400, "ALL"),
         ("caf.champions", 390, "ALL"), ("por.1", 350, "ALL"), ("ned.1", 340, "ALL"), ("tur.1", 330, "ALL"),
         ("eng.fa", 320, "CUP"), ("esp.copa_del_rey", 315, "CUP"), ("ita.coppa_italia", 310, "CUP"), ("ger.dfb_pokal", 305, "CUP"),
         ("fra.coupe_de_france", 300, "CUP"), ("eng.league_cup", 290, "CUP"), ("uefa.champions_qual", 250, "ALL"),
         ("fifa.worldq.caf", 0, "MAR"), ("caf.nations_qual", 0, "MAR"), ("fifa.friendly", 0, "MAR")]
teams = {**names.CLUBS, **names.NATIONS}
today = datetime.datetime.now(tz).date()


def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read()
    return json.loads(gzip.decompress(r) if r[:2] == b"\x1f\x8b" else r)


rows, seen = [], set()
for l, w, mode in COMPS:
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
            mar = "2869" in (h["team"]["id"], a["team"]["id"])
            slug = (e.get("season") or {}).get("slug", "")
            boost = 200 if "semi" in slug else 120 if "quarter" in slug else 300 if slug == "final" else 60 if "round-of-16" in slug else 0
            hn, an = h["team"]["displayName"], a["team"]["displayName"]
            if mode == "MAR" and not mar:
                continue
            if mode == "CUP" and boost < 60 and hn not in teams and an not in teams:
                continue
            seen.add((l, e["id"]))
            ar = lambda x: teams.get(x["team"]["displayName"]) or teams.get(x["team"].get("shortDisplayName")) or "⚠ " + x["team"]["displayName"]
            st = e["status"]["type"]["state"]
            prio = w + boost + (10000 if mar else 0)
            g = {"in": 0, "pre": 1}.get(st, 2)
            rows.append(((g, -prio, t), f"{t:%H:%M}  [{prio:>5}] {names.LEAGUES[l]:<22} {ar(h)} – {ar(a)}  [{st}] {slug}"))
print(f"== today on the TV ({today}, {tz}): {len(rows)} matches, in the row's order")
for _, r in sorted(rows):
    print(r)
