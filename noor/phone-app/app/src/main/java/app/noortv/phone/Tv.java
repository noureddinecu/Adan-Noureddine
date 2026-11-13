package app.noortv.phone;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import dadb.AdbKeyPair;
import dadb.Dadb;

/**
 * One TV, reached over network ADB with this phone's key, and the work done on it: every step opens its own
 * connection and tries again after a dropped one (a TV can close it while it installs or restarts a service).
 */
final class Tv {
    static final String HOME = "app.noortv.home", HOME_ACT = HOME + "/com.gathin.tvhome.MainActivity";
    static final String[] NOOR = {"kahf", "baqara", "sabah", "masa", "ruqya"};
    static final String[] STOCK = {"com.google.android.tvlauncher", "com.google.android.apps.tv.launcherx",
            "com.google.android.leanbacklauncher", "com.mitv.tvhome", "com.gathin.tvhome"};

    final Context c;
    final String ip;

    Tv(Context c, String ip) {
        this.c = c.getApplicationContext();
        this.ip = ip;
    }

    interface Op<T> {
        T run(Dadb d) throws Exception;
    }

    private Dadb open() throws Exception {
        File priv = new File(c.getFilesDir(), "adbkey"), pub = new File(c.getFilesDir(), "adbkey.pub");
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub);
        return Dadb.Companion.create(ip, 5555, AdbKeyPair.read(priv, pub), 10_000, 90_000);
    }

    /** Runs one step on a fresh connection, three times at most when the connection drops. */
    <T> T adb(Op<T> op) throws Exception {
        Exception last = null;
        for (int i = 0; i < 3; i++) {
            try (Dadb d = open()) {
                return op.run(d);
            } catch (IOException e) {
                last = e;
                Thread.sleep(1500L * (i + 1));
            }
        }
        throw last;
    }

    static String sh(Dadb d, String cmd) throws Exception {
        return d.shell(cmd).getAllOutput().replace("\r", "");
    }

    String shell(String cmd) throws Exception {
        return adb(d -> sh(d, cmd));
    }

    static Set<String> pkgs(String out) {
        Set<String> s = new HashSet<>();
        for (String l : out.split("\n")) if (l.startsWith("package:")) s.add(l.substring(8).trim());
        return s;
    }

    String home() throws Exception {
        String[] l = shell("cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME").trim().split("\n");
        return l[l.length - 1].trim();
    }

    String prop(String name) throws Exception {
        return shell("getprop " + name).trim();
    }

    // ---------- installing ----------

    File asset(String name) throws Exception {
        File f = new File(c.getCacheDir(), name.replace('/', '_'));
        try (InputStream in = c.getAssets().open(name); OutputStream o = new FileOutputStream(f)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        }
        return f;
    }

    /** Copies the APK to the TV first, then installs it there: steadier on older TVs than a streamed install. */
    void install(String assetApk) throws Exception {
        File f = asset(assetApk);
        adb(d -> {
            d.push(f, "/data/local/tmp/zahhaf.apk", 0644, System.currentTimeMillis());
            String out = sh(d, "pm install -r /data/local/tmp/zahhaf.apk; rm -f /data/local/tmp/zahhaf.apk");
            if (!out.contains("Success")) throw new IllegalStateException(assetApk + ": " + out.trim());
            return null;
        });
    }

    /** The Noor apps: the cards, the adhan, the adhkar and the page the phone talks to. */
    void noorApps(JSONObject bk) throws Exception {
        for (String f : NOOR) {
            install("tv/noor-" + f + ".apk");
            if (bk != null) addOnce(bk.getJSONArray("installedByUs"), "app.noortv." + f);
        }
        // Over other apps, and kept awake and alive: the adhkar and the adhan run in its background service.
        shell("appops set app.noortv.kahf SYSTEM_ALERT_WINDOW allow; appops set app.noortv.kahf GET_USAGE_STATS allow; "
                + "appops set app.noortv.kahf RUN_IN_BACKGROUND allow; dumpsys deviceidle whitelist +app.noortv.kahf; "
                + "am set-standby-bucket app.noortv.kahf active");
        Thread.sleep(5000);
        shell("am broadcast -n app.noortv.kahf/app.noortv.Reminder");
    }

    /** The new home screen, started before the stock one is turned off, and the stock one back if Home is lost. */
    String launcher(JSONObject bk) throws Exception {
        String stock = home().split("/")[0];
        shell("pm enable --user 0 " + HOME + " >/dev/null 2>&1"); // a restore that kept the Noor apps switched it off
        install("tv/launcher.apk");
        if (bk != null) addOnce(bk.getJSONArray("installedByUs"), HOME);
        String started = shell("am start -W -a android.intent.action.MAIN -c android.intent.category.HOME -n " + HOME_ACT);
        if (!started.contains("Status: ok") || started.contains("Error")) return started.trim();
        shell("pm grant " + HOME + " android.permission.ACCESS_FINE_LOCATION 2>/dev/null");
        boolean known = false;
        for (String k : STOCK) known |= k.equals(stock);
        if (known && shell("pm disable-user --user 0 " + stock).contains("disabled-user") && bk != null)
            addOnce(bk.getJSONArray("disabledByUs"), stock);
        shell("cmd package set-home-activity --user 0 " + HOME_ACT);
        if (home().startsWith(HOME + "/")) return "ok";
        if (known) {
            shell("pm enable --user 0 " + stock);
            shell("cmd package set-home-activity --user 0 $(cmd package resolve-activity --brief -a android.intent.action.MAIN "
                    + "-c android.intent.category.HOME " + stock + " | tail -n 1)");
        }
        return home();
    }

    void prayerCard(JSONObject bk) throws Exception {
        install("tv/prayer-times.apk");
        if (bk != null) addOnce(bk.getJSONArray("installedByUs"), "com.majnioui.tv.prayer");
    }

    /** A theme from the app's assets, written through the launcher's theme provider (or copied), then Home restarted. */
    void theme(String name) throws Exception {
        String dir = "/sdcard/Android/data/" + HOME + "/files", uri = "content://" + HOME + ".theme", tmp = "/data/local/tmp/noor-theme";
        List<String> files = new ArrayList<>();
        files.add("config.json");
        String[] top = c.getAssets().list("themes/" + name);
        for (String f : top == null ? new String[0] : top) if (f.equals("wallpaper.jpg")) files.add(f);
        String[] walls = c.getAssets().list("themes/" + name + "/wallpapers");
        for (String f : walls == null ? new String[0] : walls) files.add("wallpapers/" + f);
        shell("mkdir -p " + dir + "; rm -f " + dir + "/wallpaper.jpg " + dir + "/wallpapers/* 2>/dev/null; content delete --uri " + uri
                + "/wallpaper.jpg 2>/dev/null; content delete --uri " + uri + "/wallpapers 2>/dev/null");
        File rev = new File(c.getCacheDir(), "theme_revision");
        try (OutputStream o = new FileOutputStream(rev)) {
            o.write(Long.toHexString(System.nanoTime()).getBytes());
        }
        List<File> src = new ArrayList<>();
        for (String rel : files) src.add(asset("themes/" + name + "/" + rel));
        files.add("theme_revision");
        src.add(rev);
        adb(d -> {
            for (int i = 0; i < files.size(); i++) {
                String rel = files.get(i);
                d.push(src.get(i), tmp, 0644, System.currentTimeMillis());
                sh(d, "mkdir -p $(dirname " + dir + "/" + rel + ") 2>/dev/null; rm -f " + dir + "/" + rel + " 2>/dev/null; "
                        + "o=$(content write --uri " + uri + "/" + rel + " < " + tmp + " 2>&1) || o=fail; "
                        + "case \"$o\" in *fail*|*Unsupported*|*Error*) cp " + tmp + " " + dir + "/" + rel + " ;; esac; rm -f " + tmp);
            }
            sh(d, "am force-stop " + HOME + "; am start -a android.intent.action.MAIN -c android.intent.category.HOME -n " + HOME_ACT);
            return null;
        });
    }

    /** The city on the TV's Noor app, once its page answers. */
    boolean city(JSONObject city) throws Exception {
        if (city == null) return false;
        String q = "lat=" + city.getString("lat") + "&lon=" + city.getString("lon") + "&method=" + city.optInt("method", 3)
                + "&place=" + URLEncoder.encode(city.optString("place"), "UTF-8");
        for (int i = 0; i < 15; i++) {
            if ("ok".equals(post("http://" + ip + ":8080/city?" + q).trim())) return true;
            Thread.sleep(1000);
        }
        return false;
    }

    /** The adhan recording on the TV: the one kept on this phone, or fetched from another Noor TV first. */
    boolean adhan(List<String> otherTvs) throws Exception {
        File keep = new File(c.getFilesDir(), "adhan.mp3");
        if (keep.length() < 10_000) {
            List<String> from = new ArrayList<>(otherTvs);
            from.add(ip);
            for (String t : from) if (download("http://" + t + ":8080/adhan.mp3", keep)) break;
        }
        if (keep.length() < 10_000) return false;
        String dir = "/sdcard/Android/data/app.noortv.kahf/files";
        adb(d -> {
            sh(d, "mkdir -p " + dir);
            d.push(keep, dir + "/adhan.mp3", 0644, System.currentTimeMillis());
            return null;
        });
        return true;
    }

    // ---------- what the TV says over its page ----------

    String id() {
        return text("http://" + ip + ":8080/id", 1500).trim();
    }

    long version() {
        try {
            return Long.parseLong(text("http://" + ip + ":8080/version", 1500).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    boolean online() {
        return text("http://" + ip + ":8080/ping", 1200).startsWith("zahhaf");
    }

    static long bundled(Context c) {
        try (InputStream in = c.getAssets().open("tv/version.txt")) {
            byte[] b = new byte[32];
            int n = in.read(b);
            return Long.parseLong(new String(b, 0, n).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------- helpers ----------

    static void addOnce(JSONArray a, String v) throws Exception {
        for (int i = 0; i < a.length(); i++) if (a.getString(i).equals(v)) return;
        a.put(v);
    }

    static String text(String url, int timeout) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(timeout);
            h.setReadTimeout(timeout);
            try (InputStream in = h.getInputStream()) {
                byte[] b = new byte[256];
                int n = in.read(b);
                return n > 0 ? new String(b, 0, n, "UTF-8") : "";
            } finally {
                h.disconnect();
            }
        } catch (Exception e) {
            return "";
        }
    }

    static String post(String url) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setRequestMethod("POST");
            h.setDoOutput(true);
            h.setConnectTimeout(1500);
            h.setReadTimeout(4000);
            h.getOutputStream().close();
            try (InputStream in = h.getInputStream()) {
                byte[] b = new byte[64];
                int n = in.read(b);
                return n > 0 ? new String(b, 0, n) : "";
            } finally {
                h.disconnect();
            }
        } catch (Exception e) {
            return "";
        }
    }

    static boolean download(String url, File to) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(2000);
            h.setReadTimeout(15000);
            if (h.getResponseCode() != 200) return false;
            File tmp = new File(to.getPath() + ".part");
            try (InputStream in = h.getInputStream(); OutputStream o = new FileOutputStream(tmp)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            }
            return tmp.length() > 10_000 && tmp.renameTo(to);
        } catch (Exception e) {
            return false;
        }
    }
}
