#!/usr/bin/env python3
"""Writes TeamNames.java (Arabic names for the matches row) from names.py into the launcher, and, given ESPN team
lists (JSON files from the build runner), prints the current teams that have no Arabic name yet.
Usage: gen-names.py <launcher java folder> [teams.json ...]"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import names  # noqa: E402

out = pathlib.Path(sys.argv[1]) / "TeamNames.java"
teams = {**names.CLUBS, **names.NATIONS}


def jstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


lines = [f"        T.put({jstr(k)}, {jstr(v)});" for k, v in sorted(teams.items())]
leagues = [f"        L.put({jstr(k)}, {jstr(v)});" for k, v in names.LEAGUES.items()]
out.write_text("""package com.gathin.tvhome;

import java.util.HashMap;
import java.util.Map;

/** Arabic names for the matches row, generated from noor/matches/names.py (ESPN gives English names only). */
final class TeamNames {
    private TeamNames() {
    }

    private static final Map<String, String> T = new HashMap<>(), L = new HashMap<>();

    static {
""" + "\n".join(lines + leagues) + """
    }

    /** The Arabic name, or ESPN's short English name for a team not in the list yet. */
    static String ar(String display, String shortName) {
        String a = T.get(display);
        if (a == null) a = T.get(shortName);
        return a != null ? a : (shortName == null || shortName.isEmpty() ? display : shortName);
    }

    static String league(String slug) {
        String a = L.get(slug);
        return a == null ? slug : a;
    }
}
""", encoding="utf-8")
print(f"TeamNames.java: {len(teams)} teams, {len(names.LEAGUES)} competitions")

missing = set()
for f in sys.argv[2:]:
    try:
        j = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        for t in j["sports"][0]["leagues"][0]["teams"]:
            n = t["team"]["displayName"]
            if n not in teams and t["team"].get("shortDisplayName") not in teams:
                missing.add(f"{pathlib.Path(f).stem}: {n}")
    except Exception as e:
        print("could not read", f, e)
for m in sorted(missing):
    print("no Arabic name:", m)
