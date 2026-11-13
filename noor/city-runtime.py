#!/usr/bin/env python3
"""Makes the TV apps take the city from the phone (NoorCity.java) instead of the one baked in at build time:
copies NoorCity into the Noor app, the launcher and the prayer-times card, and points their uses at it.
Usage: city-runtime.py <lat> <lon> <method> <place>"""
import pathlib, re, sys

lat, lon, method, place = sys.argv[1:5]
here = pathlib.Path(__file__).resolve().parent
tmpl = (here / "NoorCity.java").read_text(encoding="utf-8")


def put(folder, pkg, local):
    code = (tmpl.replace("@PKG@", pkg).replace("@LOCAL@", "true" if local else "false")
            .replace("@LAT@", lat).replace("@LON@", lon).replace("@METHOD@", method).replace("@PLACE@", place))
    (pathlib.Path(folder) / "NoorCity.java").write_text(code, encoding="utf-8")


put("noor-tv/noor-app/app/src/main/java/app/noortv", "app.noortv", True)

launcher = pathlib.Path("cleanyourtv/launcher/app/src/main/java/com/gathin/tvhome")
put(launcher, "com.gathin.tvhome", False)
noor = launcher / "Noor.java"
s = noor.read_text(encoding="utf-8")
s, n = re.subn(r"\+ (LAT|LON|METHOD)\b", lambda m: "+ NoorCity." + m.group(1).lower() + "(null)", s)
assert n >= 5, f"launcher Noor.java: only {n} uses replaced"
noor.write_text(s, encoding="utf-8")

prayer = pathlib.Path("cleanyourtv/addons/prayer-times/app/src/main/java/com/majnioui/tv/prayer")
put(prayer, "com.majnioui.tv.prayer", False)
total = 0
for f in prayer.glob("*.java"):
    if f.name == "NoorCity.java":
        continue
    s = f.read_text(encoding="utf-8")
    s, n = re.subn(r"(?:\b(\w+)\.)?getString\(R\.string\.(latitude|longitude|method|place)\)",
                   lambda m: "NoorCity." + {"latitude": "lat", "longitude": "lon"}.get(m.group(2), m.group(2))
                   + "(" + (m.group(1) or "this") + ")", s)
    total += n
    f.write_text(s, encoding="utf-8")
assert total >= 8, f"prayer card: only {total} uses replaced"
print(f"city from the phone: launcher and prayer card ({total} uses)")
