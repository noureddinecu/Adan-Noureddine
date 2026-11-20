#!/usr/bin/env python3
"""Puts today's five prayer times into the launcher's own home layout (PrayerRow.java): a row of its own between
the clock header and the apps, in the same vertical flow, so it can never cover the clock, the date, the weather
or the top buttons. Run after noor-tv's launcher-patch/apply.py and city-runtime.py. Safe to run twice."""
import pathlib
import shutil
import sys

here = pathlib.Path(__file__).resolve().parent
src = pathlib.Path("cleanyourtv/launcher/app/src/main")
pkg = src / "java/com/gathin/tvhome"


def patch(path, old, new, marker):
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    if text.count(old) != 1:
        sys.exit(f"prayer-row: the spot in {path} changed upstream ({text.count(old)} matches)")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


shutil.copy(here / "PrayerRow.java", pkg / "PrayerRow.java")
# Amiri Bold (SIL Open Font License) for the prayer names; without it the row falls back to the system serif.
try:
    import urllib.request
    (src / "assets").mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve("https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Bold.ttf", src / "assets/noor-amiri.ttf")
except Exception as e:
    print("prayer row: no Amiri (", e, "), serif fallback")

# The row, in the column that holds the header and the apps: header (wrap) / prayers (wrap) / apps (weight 1).
patch(src / "res/layout/activity_main.xml",
      """        </RelativeLayout>

        <!-- The wrapper clips at the grid's edge;""",
      """        </RelativeLayout>

        <!-- Noor: today's prayer times, a row of its own under the header (filled by PrayerRow; gone until the
             times arrive or when switched off from the phone). Its cards take focus from the dock with Up. -->
        <LinearLayout
            android:id="@+id/noorPrayers"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="34dp"
            android:orientation="vertical"
            android:clipChildren="false"
            android:clipToPadding="false"
            android:focusable="false"
            android:importantForAccessibility="no"
            android:visibility="gone" />

        <!-- The wrapper clips at the grid's edge;""",
      'android:id="@+id/noorPrayers"')

main = pkg / "MainActivity.java"
patch(main, "    private void updateGreeting() {\n",
      "    private void updateGreeting() {\n        PrayerRow.update(this);\n", "PrayerRow.update(this)")
# The app's title above the dock keeps its room whenever it is shown, so with the prayer row taking height it
# stays under the row instead of rising into it.
patch(main, "if (MainActivity.this.dockRow && cfg.dockTitle && rowsBelowDock > 0) want",
      "if (MainActivity.this.dockRow && cfg.dockTitle) want", "cfg.dockTitle) want = Math.max(want, (int) (AppAdapter.TITLE_ROOM_DP")

# Tells the Noor app's floating panel (PrayerPanel) that this home draws the times itself.
patch(src / "AndroidManifest.xml",
      """        android:localeConfig="@xml/locales_config">
""",
      """        android:localeConfig="@xml/locales_config">
        <meta-data android:name="app.noortv.prayerRow" android:value="true" />
""",
      "app.noortv.prayerRow")
# The times come from the Noor app on this same TV over plain HTTP (127.0.0.1:8080), which Android blocks by
# default for this target SDK: allow it for this TV itself only, nothing on the network.
(src / "res/xml").mkdir(parents=True, exist_ok=True)
(src / "res/xml/noor_network.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>
""", encoding="utf-8")
patch(src / "AndroidManifest.xml",
      """        android:localeConfig="@xml/locales_config">""",
      """        android:localeConfig="@xml/locales_config"
        android:networkSecurityConfig="@xml/noor_network">""",
      "@xml/noor_network")
print("prayer row: in the home layout, under the header")
