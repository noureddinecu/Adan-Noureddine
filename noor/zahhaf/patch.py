#!/usr/bin/env python3
"""Turns a checkout of the Clean Your TV app (github.com/udhaykumarbala/cleanyourtv-app, MIT) into «زحاف TV»:
its own application id and name, so it installs next to the original. Further Noor changes are added here.
Usage: patch.py <cleanyourtv-app checkout> [<noor launcher.apk> <signer cert .der> <version code>]"""
import hashlib, pathlib, re, shutil, sys

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

# 2. The home screen: the Noor launcher (Hijri date, next prayer, Friday greeting; city from the phone) in place of
#    the bundled Clean Your TV launcher, with the pins the build checks it against (Pins.kt, verifyLauncherPin).
if len(sys.argv) > 4:
    apk, der, version = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), sys.argv[4]
    dest = root / "android/platform/src/main/assets/bundled/cleanyourtv-launcher.apk"
    shutil.copyfile(apk, dest)
    data = apk.read_bytes()
    pins = root / "core/trust/src/main/kotlin/tv/cleanyour/core/trust/Pins.kt"
    s = pins.read_text(encoding="utf-8")
    start, end = s.index("object PinnedLauncher {"), s.index("}", s.index("object PinnedLauncher {"))
    block = s[start:end]
    original_signer = re.search(r'SIGNER_SHA256 = "([0-9a-f]{64})"', block).group(1)
    new = block
    for name, value in (("SHA256", hashlib.sha256(data).hexdigest()), ("SIGNER_SHA256", hashlib.sha256(der.read_bytes()).hexdigest())):
        new = re.sub(rf'(const val {name} = )"[0-9a-f]{{64}}"', rf'\g<1>"{value}"', new)
    new = re.sub(r"(const val SIZE = )[0-9_]+L", rf"\g<1>{len(data)}L", new)
    new = re.sub(r"(const val VERSION_CODE = )[0-9]+L", rf"\g<1>{version}L", new)
    new = re.sub(r'(const val VERSION_NAME = )"[^"]*"', r'\g<1>"3.4-noor"', new)
    s = s[:start] + new + s[end:]
    # The curtain is still Clean Your TV's, signed with their launcher key: pin its own signer, not ours.
    s = s.replace("const val SIGNER_SHA256 = PinnedLauncher.SIGNER_SHA256", f'const val SIGNER_SHA256 = "{original_signer}"')
    pins.write_text(s, encoding="utf-8")
    print(f"zahhaf: Noor launcher bundled ({len(data)} bytes, version {version})")
