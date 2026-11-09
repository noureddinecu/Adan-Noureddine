package app.noortv.phone;

import android.Manifest;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import dadb.AdbKeyPair;
import dadb.Dadb;

/**
 * Sets up a TV from the phone, everything done today in one go: finds the TV, connects over network ADB, recognises
 * the model in CleanYourTV's tested lists, keeps a backup of how it was, turns the clutter off (never uninstalls a
 * system app), installs the Noor apps, the new home screen, the prayer-times card and the theme, sets the city from
 * the phone's location and puts the chosen adhan on it. The screens are assets/setup.html; this class does the work.
 */
public class SetupActivity extends Activity {
    static final String HOME = "app.noortv.home", HOME_ACT = HOME + "/com.gathin.tvhome.MainActivity";
    static final String[] NOOR = {"kahf", "baqara", "sabah", "masa", "ruqya"};
    /** Never turned off, whatever a list says: the TV needs these to work, to be set up, or to be reached. */
    static final String[] KEEP = {"settings", "systemui", "inputmethod", "keyboard", "com.google.android.gms", "com.google.android.gsf",
            "packageinstaller", "permissioncontroller", "webview", "setupwraith", "setupwizard", "launcher", "tvinput", "tv.input",
            "tvcenter", "wwtv", "provider", "bluetooth", "remote", "mediashell", "com.android.", "android.ext", "app.noortv",
            "com.majnioui", "tvhome.atv.home"};
    /** For a model nobody has tested yet, only the reporting apps that are safe everywhere. */
    static final String[] SAFE = {"com.google.android.feedback", "com.google.android.tv.bugreportsender",
            "com.miui.tv.analytics", "com.xiaomi.statistic", "com.xiaomi.mitv.tvmanager", "tv.samba.ssm", "tv.samba.ssm.ui"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private SharedPreferences prefs;
    private final List<String> noorTvs = new ArrayList<>();
    private int locId;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("noor", MODE_PRIVATE);
        getWindow().setStatusBarColor(MainActivity.BG);
        getWindow().setNavigationBarColor(MainActivity.BG);
        web = new WebView(this);
        web.setBackgroundColor(MainActivity.BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(this, "Z");
        setContentView(web);
        web.loadUrl("file:///android_asset/setup.html?lang=" + prefs.getString("lang", "ar"));
    }

    // ---------- talking back to the page ----------

    private void result(int id, Object json) {
        String js = "onResult(" + id + "," + JSONObject.quote(String.valueOf(json)) + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    private void step(String key, String state, String detail) {
        String js = "onStep(" + JSONObject.quote(key) + "," + JSONObject.quote(state) + "," + JSONObject.quote(detail == null ? "" : detail) + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    private void async(Runnable r) {
        new Thread(r, "setup").start();
    }

    @JavascriptInterface
    public void close() {
        main.post(this::finish);
    }

    @JavascriptInterface
    public void useTv(String ip) {
        prefs.edit().putString("tv", ip).apply();
    }

    // ---------- 1. finding the TV ----------

    @JavascriptInterface
    public void scan(int id) {
        async(() -> {
            JSONArray out = new JSONArray();
            String prefix = prefix();
            if (prefix != null) {
                List<String> adb = java.util.Collections.synchronizedList(new ArrayList<>());
                List<String> noor = java.util.Collections.synchronizedList(new ArrayList<>());
                ExecutorService pool = Executors.newFixedThreadPool(64);
                for (int i = 1; i < 255; i++) {
                    String ip = prefix + i;
                    pool.execute(() -> {
                        if (open(ip, 5555)) adb.add(ip);
                        if (open(ip, 8080) && text("http://" + ip + ":8080/ping").startsWith("zahhaf")) noor.add(ip);
                    });
                }
                pool.shutdown();
                try {
                    pool.awaitTermination(25, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                }
                synchronized (noorTvs) {
                    noorTvs.clear();
                    noorTvs.addAll(noor);
                }
                Set<String> all = new HashSet<>(adb);
                all.addAll(noor);
                for (String ip : all) {
                    try {
                        out.put(new JSONObject().put("ip", ip).put("adb", adb.contains(ip)).put("noor", noor.contains(ip)));
                    } catch (Exception ignored) {
                    }
                }
            }
            result(id, out);
        });
    }

    private String prefix() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            Network n = cm.getActiveNetwork();
            LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
            if (lp == null) return null;
            for (LinkAddress a : lp.getLinkAddresses()) {
                if (a.getAddress() instanceof Inet4Address && !a.getAddress().isLoopbackAddress()) {
                    String ip = a.getAddress().getHostAddress();
                    return ip.substring(0, ip.lastIndexOf('.') + 1);
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean open(String ip, int port) {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress(ip, port), 600);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ---------- 2. connecting and recognising it ----------

    private Dadb adb(String ip) throws Exception {
        File priv = new File(getFilesDir(), "adbkey"), pub = new File(getFilesDir(), "adbkey.pub");
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub);
        return Dadb.Companion.create(ip, 5555, AdbKeyPair.read(priv, pub), 10_000, 90_000);
    }

    private static String sh(Dadb d, String cmd) throws Exception {
        return d.shell(cmd).getAllOutput().replace("\r", "");
    }

    @JavascriptInterface
    public void connect(int id, String ip) {
        async(() -> {
            try (Dadb d = adb(ip)) {
                String props = sh(d, "for p in ro.product.model ro.product.manufacturer ro.build.version.release ro.product.device "
                        + "ro.build.display.id ro.serialno; do echo \"$p=$(getprop $p)\"; done");
                JSONObject info = new JSONObject();
                for (String l : props.split("\n")) {
                    int i = l.indexOf('=');
                    if (i > 0) info.put(l.substring(0, i).replace("ro.", "").replace('.', '_'), l.substring(i + 1).trim());
                }
                Set<String> all = pkgs(sh(d, "pm list packages")), off = pkgs(sh(d, "pm list packages -d"));
                info.put("home", home(d));
                info.put("ip", ip);
                JSONObject plan = plan(info, all, off);
                result(id, new JSONObject().put("ok", true).put("info", info).put("plan", plan)
                        .put("hasNoor", all.contains("app.noortv.kahf")).put("backup", backup(info.optString("product_serialno", ip)) != null));
            } catch (Exception e) {
                result(id, "{\"ok\":false,\"error\":" + JSONObject.quote(e.getClass().getSimpleName()) + "}");
            }
        });
    }

    private static Set<String> pkgs(String out) {
        Set<String> s = new HashSet<>();
        for (String l : out.split("\n")) if (l.startsWith("package:")) s.add(l.substring(8).trim());
        return s;
    }

    private static String home(Dadb d) throws Exception {
        String[] l = sh(d, "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME").trim().split("\n");
        return l[l.length - 1].trim();
    }

    /** The best tested model for this TV, and what to turn off on it: installed, still on, and not on the keep list. */
    private JSONObject plan(JSONObject info, Set<String> all, Set<String> off) throws Exception {
        String model = norm(info.optString("product_model")), device = norm(info.optString("product_device"));
        String brand = info.optString("product_manufacturer").toLowerCase(Locale.ROOT), release = info.optString("build_version_release");
        JSONArray index = new JSONArray(asset("debloat.json"));
        JSONObject best = null;
        int bestScore = 0;
        for (int i = 0; i < index.length(); i++) {
            JSONObject m = index.getJSONObject(i);
            String text = m.getString("text");
            int score = 0;
            if (!model.isEmpty() && text.contains(" " + model + " ")) score += 10;
            else if (!model.isEmpty() && text.contains(model.replace(" ", ""))) score += 8;
            if (!device.isEmpty() && text.contains(" " + device + " ")) score += 5;
            if (!brand.isEmpty() && m.optString("brand").toLowerCase(Locale.ROOT).startsWith(brand.split(" ")[0])) score += 1;
            if (!release.isEmpty() && m.optString("os").matches(".*\\b" + release.split("\\.")[0] + "\\b.*")) score += 2;
            if (score > bestScore) {
                bestScore = score;
                best = m;
            }
        }
        boolean tested = best != null && bestScore >= 8;
        JSONArray list = new JSONArray();
        Set<String> seen = new HashSet<>();
        if (tested) {
            JSONArray p = best.getJSONArray("pkgs");
            for (int i = 0; i < p.length(); i++) add(list, seen, all, off, p.getJSONArray(i).getString(0), p.getJSONArray(i).optString(1));
        } else {
            for (String p : SAFE) add(list, seen, all, off, p, "");
        }
        JSONObject r = new JSONObject().put("tested", tested).put("pkgs", list);
        if (best != null && tested) r.put("model", new JSONObject().put("id", best.getString("id")).put("tv", best.optString("tv")).put("os", best.optString("os")));
        return r;
    }

    private static void add(JSONArray list, Set<String> seen, Set<String> all, Set<String> off, String p, String note) {
        if (!all.contains(p) || off.contains(p) || !seen.add(p)) return;
        String lower = p.toLowerCase(Locale.ROOT);
        for (String k : KEEP) if (lower.contains(k)) return;
        list.put(new JSONArray().put(p).put(note));
    }

    private static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private String asset(String name) throws Exception {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private File assetFile(String name) throws Exception {
        File f = new File(getCacheDir(), name.replace('/', '_'));
        try (InputStream in = getAssets().open(name); OutputStream o = new FileOutputStream(f)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        }
        return f;
    }

    // ---------- 3. the city, from the phone's location ----------

    @JavascriptInterface
    public void location(int id) {
        locId = id;
        main.post(() -> {
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
            } else {
                async(this::locate);
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] g) {
        async(this::locate);
    }

    @SuppressWarnings("deprecation")
    private void locate() {
        Location loc = null;
        try {
            LocationManager lm = getSystemService(LocationManager.class);
            for (String p : new String[]{LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                Location l = lm.isProviderEnabled(p) || p.equals(LocationManager.PASSIVE_PROVIDER) ? lm.getLastKnownLocation(p) : null;
                if (l != null && (loc == null || l.getTime() > loc.getTime())) loc = l;
            }
            if (loc == null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                final Location[] got = new Location[1];
                java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
                main.post(() -> lm.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, new android.location.LocationListener() {
                    public void onLocationChanged(Location l) {
                        got[0] = l;
                        done.countDown();
                    }

                    public void onStatusChanged(String a, int b, Bundle c) {
                    }

                    public void onProviderEnabled(String a) {
                    }

                    public void onProviderDisabled(String a) {
                    }
                }, Looper.getMainLooper()));
                done.await(10, TimeUnit.SECONDS);
                loc = got[0];
            }
        } catch (SecurityException | InterruptedException ignored) {
        }
        try {
            if (loc == null) {
                result(locId, "{\"ok\":false}");
                return;
            }
            String place = "", country = "";
            try {
                List<Address> a = new Geocoder(this, new Locale(prefs.getString("lang", "ar"))).getFromLocation(loc.getLatitude(), loc.getLongitude(), 1);
                if (a != null && !a.isEmpty()) {
                    Address ad = a.get(0);
                    place = ad.getLocality() != null ? ad.getLocality() : ad.getSubAdminArea() != null ? ad.getSubAdminArea() : ad.getAdminArea();
                    country = ad.getCountryCode() == null ? "" : ad.getCountryCode();
                }
            } catch (Exception ignored) {
            }
            result(locId, new JSONObject().put("ok", true).put("lat", String.format(Locale.US, "%.4f", loc.getLatitude()))
                    .put("lon", String.format(Locale.US, "%.4f", loc.getLongitude())).put("place", place == null ? "" : place)
                    .put("country", country).put("method", method(country)));
        } catch (Exception e) {
            result(locId, "{\"ok\":false}");
        }
    }

    /** Aladhan's calculation method used in that country. */
    static int method(String cc) {
        switch (cc.toUpperCase(Locale.ROOT)) {
            case "SA": return 4;
            case "KW": return 9;
            case "QA": return 10;
            case "AE": return 16;
            case "BH": case "OM": return 8;
            case "EG": case "SD": case "LY": case "SY": case "LB": case "JO": case "IQ": case "PS": return 5;
            case "MA": return 21;
            case "DZ": return 19;
            case "TN": return 18;
            case "TR": return 13;
            case "FR": return 12;
            case "US": case "CA": return 2;
            case "SG": return 11;
            case "MY": return 17;
            case "ID": return 20;
            case "RU": return 14;
            case "PT": return 22;
            case "IR": return 7;
            case "PK": case "IN": case "BD": case "AF": return 1;
            default: return 3; // Muslim World League, used across Europe
        }
    }

    // ---------- 4. everything, in one go ----------

    @JavascriptInterface
    public void start(int id, String json) {
        async(() -> {
            JSONObject r = new JSONObject();
            try {
                JSONObject o = new JSONObject(json);
                String ip = o.getString("ip");
                try (Dadb d = adb(ip)) {
                    run(d, ip, o, r);
                }
                r.put("ok", true);
            } catch (Exception e) {
                try {
                    r.put("ok", false).put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                } catch (Exception ignored) {
                }
            }
            result(id, r);
        });
    }

    private void run(Dadb d, String ip, JSONObject o, JSONObject r) throws Exception {
        String serial = sh(d, "getprop ro.serialno").trim();
        if (serial.isEmpty()) serial = ip;

        // Backup: kept from the first time, so «restore» goes back to how the TV came, not to an earlier setup.
        step("backup", "run", null);
        JSONObject bk = backup(serial);
        if (bk == null) {
            bk = new JSONObject().put("serial", serial).put("model", sh(d, "getprop ro.product.model").trim())
                    .put("home", home(d)).put("disabledBefore", new JSONArray(pkgs(sh(d, "pm list packages -d"))))
                    .put("disabledByUs", new JSONArray()).put("installedByUs", new JSONArray());
        }
        bk.put("ip", ip);
        saveBackup(bk);
        step("backup", "ok", null);

        // Clean-up: every package in one go, disabled, never uninstalled.
        JSONArray list = o.optJSONArray("pkgs");
        step("clean", "run", null);
        int n = 0;
        if (list != null && list.length() > 0) {
            StringBuilder c = new StringBuilder("for p in");
            for (int i = 0; i < list.length(); i++) {
                String p = list.getString(i);
                if (p.matches("[A-Za-z][\\w.]+")) c.append(' ').append(p);
            }
            c.append("; do pm disable-user --user 0 $p 2>/dev/null | grep -q disabled-user && echo \"off=$p\"; done");
            for (String l : sh(d, c.toString()).split("\n")) {
                if (l.startsWith("off=")) {
                    addOnce(bk.getJSONArray("disabledByUs"), l.substring(4).trim());
                    n++;
                }
            }
            saveBackup(bk);
        }
        step("clean", "ok", String.valueOf(n));

        // The Noor apps: cards, adhan, adhkar, the page the phone talks to.
        step("noor", "run", null);
        for (String f : NOOR) {
            d.install(assetFile("tv/noor-" + f + ".apk"), "-r");
            addOnce(bk.getJSONArray("installedByUs"), "app.noortv." + f);
        }
        saveBackup(bk);
        sh(d, "appops set app.noortv.kahf SYSTEM_ALERT_WINDOW allow; appops set app.noortv.kahf GET_USAGE_STATS allow");
        Thread.sleep(6000);
        sh(d, "am broadcast -n app.noortv.kahf/app.noortv.Reminder");
        step("noor", "ok", null);

        // The city from the phone, once the Noor page answers.
        step("city", "run", null);
        JSONObject city = o.optJSONObject("city");
        boolean cityOk = false;
        if (city != null) {
            String q = "lat=" + city.getString("lat") + "&lon=" + city.getString("lon") + "&method=" + city.optInt("method", 3)
                    + "&place=" + URLEncoder.encode(city.optString("place"), "UTF-8");
            for (int i = 0; i < 15 && !cityOk; i++) {
                cityOk = "ok".equals(post("http://" + ip + ":8080/city?" + q).trim());
                if (!cityOk) Thread.sleep(1000);
            }
        }
        step("city", cityOk ? "ok" : "skip", city == null ? null : city.optString("place"));

        // The adhan: the one kept on this phone, or fetched from a TV that already has it.
        step("adhan", "run", null);
        File mp3 = adhan(ip);
        if (mp3 != null) {
            String dir = "/sdcard/Android/data/app.noortv.kahf/files";
            sh(d, "mkdir -p " + dir);
            d.push(mp3, dir + "/adhan.mp3", 0644, System.currentTimeMillis());
        }
        step("adhan", mp3 != null ? "ok" : "skip", null);

        // The new home screen: it has to start before the stock one is turned off.
        step("home", "run", null);
        String stock = home(d).split("/")[0];
        d.install(assetFile("tv/launcher.apk"), "-r");
        addOnce(bk.getJSONArray("installedByUs"), HOME);
        saveBackup(bk);
        String started = sh(d, "am start -W -a android.intent.action.MAIN -c android.intent.category.HOME -n " + HOME_ACT);
        if (!started.contains("Status: ok") || started.contains("Error")) {
            step("home", "fail", started.trim());
        } else {
            sh(d, "pm grant " + HOME + " android.permission.ACCESS_FINE_LOCATION 2>/dev/null");
            boolean stockKnown = stock.equals("com.google.android.tvlauncher") || stock.equals("com.google.android.apps.tv.launcherx")
                    || stock.equals("com.google.android.leanbacklauncher") || stock.equals("com.mitv.tvhome") || stock.equals("com.gathin.tvhome");
            if (stockKnown && sh(d, "pm disable-user --user 0 " + stock).contains("disabled-user")) addOnce(bk.getJSONArray("disabledByUs"), stock);
            saveBackup(bk);
            sh(d, "cmd package set-home-activity --user 0 " + HOME_ACT);
            if (home(d).startsWith(HOME + "/")) {
                step("home", "ok", null);
            } else {
                if (stockKnown) {
                    sh(d, "pm enable --user 0 " + stock);
                    sh(d, "cmd package set-home-activity --user 0 $(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME " + stock + " | tail -n 1)");
                }
                step("home", "fail", home(d));
            }
        }

        // The prayer-times card on the home screen.
        step("prayer", "run", null);
        d.install(assetFile("tv/prayer-times.apk"), "-r");
        addOnce(bk.getJSONArray("installedByUs"), "com.majnioui.tv.prayer");
        saveBackup(bk);
        step("prayer", "ok", null);

        // The theme.
        String theme = o.optString("theme", "awqat");
        step("theme", "run", theme);
        theme(d, theme);
        step("theme", "ok", theme);
        prefs.edit().putString("tv", ip).apply();
        r.put("disabled", n).put("theme", theme).put("adhan", mp3 != null).put("city", cityOk);
    }

    private static void addOnce(JSONArray a, String v) throws Exception {
        for (int i = 0; i < a.length(); i++) if (a.getString(i).equals(v)) return;
        a.put(v);
    }

    private void theme(Dadb d, String name) throws Exception {
        String pkg = HOME, dir = "/sdcard/Android/data/" + pkg + "/files", uri = "content://" + pkg + ".theme", tmp = "/data/local/tmp/noor-theme";
        List<String> files = new ArrayList<>();
        files.add("config.json");
        String[] top = getAssets().list("themes/" + name);
        for (String f : top == null ? new String[0] : top) if (f.equals("wallpaper.jpg")) files.add(f);
        String[] walls = getAssets().list("themes/" + name + "/wallpapers");
        sh(d, "mkdir -p " + dir + "; rm -f " + dir + "/wallpaper.jpg " + dir + "/wallpapers/* 2>/dev/null; content delete --uri " + uri
                + "/wallpaper.jpg 2>/dev/null; content delete --uri " + uri + "/wallpapers 2>/dev/null");
        for (String f : walls == null ? new String[0] : walls) files.add("wallpapers/" + f);
        File rev = new File(getCacheDir(), "theme_revision");
        try (OutputStream o = new FileOutputStream(rev)) {
            o.write(Long.toHexString(System.nanoTime()).getBytes());
        }
        for (String rel : files) put(d, assetFile("themes/" + name + "/" + rel), rel, dir, uri, tmp);
        put(d, rev, "theme_revision", dir, uri, tmp);
        sh(d, "am force-stop " + pkg + "; am start -a android.intent.action.MAIN -c android.intent.category.HOME -n " + HOME_ACT);
    }

    private static void put(Dadb d, File f, String rel, String dir, String uri, String tmp) throws Exception {
        d.push(f, tmp, 0644, System.currentTimeMillis());
        sh(d, "mkdir -p $(dirname " + dir + "/" + rel + ") 2>/dev/null; rm -f " + dir + "/" + rel + " 2>/dev/null; "
                + "o=$(content write --uri " + uri + "/" + rel + " < " + tmp + " 2>&1) || o=fail; "
                + "case \"$o\" in *fail*|*Unsupported*|*Error*) cp " + tmp + " " + dir + "/" + rel + " ;; esac; rm -f " + tmp);
    }

    /** The adhan recording: kept on this phone after the first time, else fetched from a Noor TV that has one. */
    private File adhan(String target) {
        File keep = new File(getFilesDir(), "adhan.mp3");
        if (keep.length() > 10_000) return keep;
        List<String> tvs;
        synchronized (noorTvs) {
            tvs = new ArrayList<>(noorTvs);
        }
        String saved = prefs.getString("tv", "");
        if (!saved.isEmpty() && !tvs.contains(saved)) tvs.add(saved);
        for (String ip : tvs) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://" + ip + ":8080/adhan.mp3").openConnection();
                c.setConnectTimeout(2000);
                c.setReadTimeout(15000);
                if (c.getResponseCode() != 200) continue;
                File tmp = new File(getFilesDir(), "adhan.part");
                try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
                }
                if (tmp.length() > 10_000 && tmp.renameTo(keep)) return keep;
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    // ---------- backups, one per TV (by serial number) ----------

    private File backupFile(String serial) {
        return new File(getFilesDir(), "tv-" + serial.replaceAll("[^A-Za-z0-9._-]", "_") + ".json");
    }

    JSONObject backup(String serial) {
        try {
            File f = backupFile(serial);
            if (!f.exists()) return null;
            byte[] b = java.nio.file.Files.readAllBytes(f.toPath());
            return new JSONObject(new String(b, "UTF-8"));
        } catch (Exception e) {
            return null;
        }
    }

    private void saveBackup(JSONObject bk) throws Exception {
        try (OutputStream o = new FileOutputStream(backupFile(bk.getString("serial")))) {
            o.write(bk.toString(2).getBytes("UTF-8"));
        }
    }

    // ---------- small HTTP helpers ----------

    private static String text(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(800);
            c.setReadTimeout(1200);
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[64];
                int n = in.read(b);
                return n > 0 ? new String(b, 0, n) : "";
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return "";
        }
    }

    private static String post(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(1500);
            c.setReadTimeout(4000);
            c.getOutputStream().close();
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[64];
                int n = in.read(b);
                return n > 0 ? new String(b, 0, n) : "";
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return "";
        }
    }
}
