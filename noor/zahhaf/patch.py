#!/usr/bin/env python3
"""Turns a checkout of the Clean Your TV app (github.com/udhaykumarbala/cleanyourtv-app, MIT) into «زحاف TV»:
its own application id and name, so it installs next to the original. Further Noor changes are added here.
Usage: patch.py <cleanyourtv-app checkout>"""
import pathlib, sys

root = pathlib.Path(sys.argv[1])


def sub(rel, old, new, count=1):
    p = root / rel
    s = p.read_text(encoding="utf-8")
    if old not in s:
        sys.exit(f"zahhaf patch: {rel}: could not find {old[:60]!r} - the app changed upstream")
    p.write_text(s.replace(old, new, count), encoding="utf-8")


# 1. Its own identity: installs next to Clean Your TV, never over it.
sub("build-logic/convention/src/main/kotlin/AndroidConventionPlugins.kt",
    'applicationId = "tv.cleanyour.app"', 'applicationId = "app.noortv.zahhaf"')
sub("app/src/main/res/values/strings.xml",
    '<string name="app_name" translatable="false">Clean Your TV</string>',
    '<string name="app_name" translatable="false">زحاف TV</string>')
print("zahhaf: identity patched")
