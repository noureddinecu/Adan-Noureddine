package com.livequizgame.app;

import android.content.Context;
import android.content.pm.PackageInfo;

/** Reads the app version without relying on generated BuildConfig (disabled by default in AGP 8). */
final class BuildConfigCompat {
    private BuildConfigCompat() { }

    @SuppressWarnings("deprecation")
    static String versionName(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return p.versionName == null ? "1.0" : p.versionName;
        } catch (Exception e) {
            return "1.0";
        }
    }
}
