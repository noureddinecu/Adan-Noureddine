#!/usr/bin/env python3
"""Turns CleanYourTV's tested per-model lists (examples/*/debloat.txt + tv.json, MIT) into one JSON for the phone app:
[{"id", "tv", "os", "brand", "text", "pkgs": [[package, note], ...]}, ...]. Commented-out lines stay out.
Usage: make-debloat-index.py <cleanyourtv folder> <out.json>"""
import json, pathlib, re, sys

root, out = pathlib.Path(sys.argv[1]) / "examples", pathlib.Path(sys.argv[2])
models = []
for d in sorted(p for p in root.iterdir() if p.is_dir()):
    deb, meta = d / "debloat.txt", d / "tv.json"
    if not deb.exists():
        continue
    info = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}
    pkgs = []
    for line in deb.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, note = line.partition("#")
        name = name.split()[0] if name.split() else ""
        if re.fullmatch(r"[A-Za-z][\w]*(\.[\w]+)+", name):
            pkgs.append([name, note.strip()])
    if not pkgs:
        continue
    tv = info.get("tv", "")
    text = re.sub(r"[^a-z0-9]+", " ", (d.name + " " + tv).lower())
    models.append({"id": d.name, "tv": tv, "os": info.get("os", ""), "brand": info.get("brand", d.name.split("-")[0]),
                   "text": " " + text + " ", "pkgs": pkgs})
out.write_text(json.dumps(models, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(models)} TV models, {sum(len(m['pkgs']) for m in models)} entries, {out.stat().st_size // 1024} KB")
