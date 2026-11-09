#!/usr/bin/env python3
"""Puts the 3D icons (noor/icons3d/*.png) into the phone page as data URIs, so the TV serves one self-contained file.
Usage: inline-icons.py <phone-page.html> <out.html>"""
import base64, json, pathlib, sys

src, out = map(pathlib.Path, sys.argv[1:3])
icons = {p.stem: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
         for p in sorted((pathlib.Path(__file__).parent / "icons3d").glob("*.png"))}
html = src.read_text(encoding="utf-8")
assert "/*ICONS*/{}" in html, "no /*ICONS*/{} placeholder in the page"
out.write_text(html.replace("/*ICONS*/{}", json.dumps(icons)), encoding="utf-8")
print(f"{len(icons)} icons, {out.stat().st_size // 1024} KB")
