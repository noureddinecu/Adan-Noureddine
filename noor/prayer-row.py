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

# The row, in the column that holds the header and the apps: header (wrap) / prayers (wrap) / apps (weight 1).
patch(src / "res/layout/activity_main.xml",
      """        </RelativeLayout>

        <!-- The wrapper clips at the grid's edge;""",
      """        </RelativeLayout>

        <!-- Noor: today's prayer times, a row of its own under the header (filled by PrayerRow; gone until the
             times arrive or when switched off from the phone). Not focusable, so the remote skips it. -->
        <LinearLayout
            android:id="@+id/noorPrayers"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="14dp"
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
print("prayer row: in the home layout, under the header")
