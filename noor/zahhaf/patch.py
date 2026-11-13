#!/usr/bin/env python3
"""Turns a checkout of the Clean Your TV app (github.com/udhaykumarbala/cleanyourtv-app, MIT) into «زحاف TV»:
its own application id and name, so it installs next to the original. Further Noor changes are added here.
Usage: patch.py <cleanyourtv-app checkout> [<noor launcher.apk> <signer cert .der> <version code> [<folder of Noor TV apps>]]"""
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

# 3. «نور»: a row on each TV's page that opens the Noor screen (NoorScreen.kt): the Noor apps put on through the
#    app's own TV session, with the overlay and usage permissions the adhan and adhkar need, the city from the
#    phone's location, and the TV's own page (live writing and drawing, adhan and adhkar settings).
here = pathlib.Path(__file__).resolve().parent
shutil.copyfile(here / "NoorScreen.kt", root / "app/src/main/kotlin/tv/cleanyour/app/NoorScreen.kt")
sub("core/flows/src/main/kotlin/tv/cleanyour/core/flows/ManageMachine.kt",
    'RESTORE_POINT("restore"), TV_SETTINGS("tvsettings"),', 'RESTORE_POINT("restore"), TV_SETTINGS("tvsettings"), NOOR("noor"),')
sub("feature/manage/src/main/kotlin/tv/cleanyour/feature/manage/ManageScreens.kt",
    "                ListRow(stringResource(R.string.manage_row_home),",
    """                ListRow("نور: الأذان والأذكار والرسائل", subtitle = "الأذان في كل صلاة، والأذكار، والكتابة والرسم على التلفاز",
                    onClick = { onIntent(ManageIntent.Open(ManageSection.NOOR)) })
                ListDivider()
                ListRow(stringResource(R.string.manage_row_home),""")
sub("app/src/main/kotlin/tv/cleanyour/app/AppRoot.kt",
    "    @Serializable data class TvSettings(val tvId: String) : Dest",
    "    @Serializable data class TvSettings(val tvId: String) : Dest\n    @Serializable data class Noor(val tvId: String) : Dest")
sub("app/src/main/kotlin/tv/cleanyour/app/AppRoot.kt",
    '        "tvsettings" -> id?.let { Dest.TvSettings(it) }',
    '        "tvsettings" -> id?.let { Dest.TvSettings(it) }\n        "noor" -> id?.let { Dest.Noor(it) }')
sub("app/src/main/kotlin/tv/cleanyour/app/AppRoot.kt",
    "                entry<Dest.Modules> { key ->",
    """                entry<Dest.Noor> { key -> NoorScreen(graph, TvId(key.tvId), onBack = { go("back") }) }
                entry<Dest.Modules> { key ->""")
sub("app/src/main/AndroidManifest.xml",
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />')
# The Noor page and city are plain HTTP on the TV's own address on the home network.
sub("app/src/full/res/xml/network_security_config.xml",
    '<base-config cleartextTrafficPermitted="false">', '<base-config cleartextTrafficPermitted="true">')
if len(sys.argv) > 5:
    dest = root / "app/src/main/assets/noor"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("noor-kahf", "noor-baqara", "noor-sabah", "noor-masa", "noor-ruqya", "prayer-times"):
        shutil.copyfile(pathlib.Path(sys.argv[5]) / f"{name}.apk", dest / f"{name}.apk")
print("zahhaf: Noor screen added")
