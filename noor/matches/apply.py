#!/usr/bin/env python3
"""Adds today's matches (Matches.java) to a plain CleanYourTV launcher: a row of its own between the clock header
and the apps, in the same vertical flow, so it never covers the clock, the date or the buttons. Nothing else of
Noor goes in. Run from the folder holding cleanyourtv/. Safe to run twice."""
import pathlib, re, shutil, sys

here = pathlib.Path(__file__).resolve().parent
src = pathlib.Path("cleanyourtv/launcher/app/src/main")
pkg = src / "java/com/gathin/tvhome"


def patch(path, old, new, marker):
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    if text.count(old) != 1:
        sys.exit(f"matches: the spot in {path} changed upstream ({text.count(old)} matches)")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


shutil.copy(here / "Matches.java", pkg / "Matches.java")
patch(src / "res/layout/activity_main.xml",
      """        </RelativeLayout>

        <!-- The wrapper clips at the grid's edge;""",
      """        </RelativeLayout>

        <!-- Today's matches, a row of its own under the header (filled by Matches; gone until the first answer).
             Its cards take focus from the dock with Up and scroll sideways. -->
        <LinearLayout
            android:id="@+id/noorMatches"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="16dp"
            android:orientation="vertical"
            android:clipChildren="false"
            android:clipToPadding="false"
            android:focusable="false"
            android:visibility="gone" />

        <!-- The wrapper clips at the grid's edge;""",
      'android:id="@+id/noorMatches"')
main = pkg / "MainActivity.java"
patch(main, "    private void updateGreeting() {\n",
      "    private void updateGreeting() {\n        Matches.update(this);\n", "Matches.update(this)")
# The app's title above the dock keeps its room under the row instead of rising into it.
patch(main, "if (MainActivity.this.dockRow && cfg.dockTitle && rowsBelowDock > 0) want",
      "if (MainActivity.this.dockRow && cfg.dockTitle) want", "cfg.dockTitle) want = Math.max(want, (int) (AppAdapter.TITLE_ROOM_DP")
manifest = src / "AndroidManifest.xml"
if "android.permission.INTERNET" not in manifest.read_text(encoding="utf-8"):
    patch(manifest, '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
          '    <uses-permission android:name="android.permission.INTERNET" />\n'
          '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />', "android.permission.INTERNET")
# This launcher is for the Xiaomi Google TV (MiTV-MOOR2): its Live TV app, and the remote's YouTube button, which
# Google's home alone answered (CleanYourTV examples/xiaomi-mitv-moor2).
cfg = src / "res/values/config.xml"
patch(cfg, '<string name="live_tv_package" translatable="false">com.mediatek.wwtv.tvcenter</string>',
      '<string name="live_tv_package" translatable="false">com.mitv.livetv</string>', ">com.mitv.livetv</string>")
patch(cfg, """    <string-array name="app_keys" translatable="false">
    </string-array>""", """    <string-array name="app_keys" translatable="false">
        <item>190:com.google.android.youtube.tv</item>
    </string-array>""", "<item>190:com.google.android.youtube.tv</item>")
# Its own name in the Home chooser: the original CleanYourTV launcher is also called «Home» in every language, and a
# TV with both showed two identical choices.
for f in src.glob("res/values*/strings.xml"):
    t = f.read_text(encoding="utf-8")
    t2 = re.sub(r'(<string name="app_name"[^>]*>)[^<]*(</string>)', r"\g<1>Home ⚽\g<2>", t)
    if t2 != t:
        f.write_text(t2, encoding="utf-8")
print("matches row: in the home layout, under the header")
