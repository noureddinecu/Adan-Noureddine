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

    /** Back to the start screen, opening the TV just set up. */
    @JavascriptInterface
    public void openControl(String key) {
        main.post(() -> {
            setResult(RESULT_OK, new android.content.Intent().putExtra("open", key));
            finish();
        });
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
                        if (open(ip, 8080) && Tv.text("http://" + ip + ":8080/ping", 1200).startsWith("zahhaf")) noor.add(ip);
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

    @JavascriptInterface
    public void connect(int id, String ip) {
        async(() -> {
            try {
                Tv tv = new Tv(this, ip);
                String props = tv.shell("for p in ro.product.model ro.product.manufacturer ro.build.version.release ro.product.device "
                        + "ro.build.display.id ro.serialno; do echo \"$p=$(getprop $p)\"; done");
                JSONObject info = new JSONObject();
                for (String l : props.split("\n")) {
                    int i = l.indexOf('=');
                    if (i > 0) info.put(l.substring(0, i).replace("ro.", "").replace('.', '_'), l.substring(i + 1).trim());
                }
                Set<String> all = Tv.pkgs(tv.shell("pm list packages")), off = Tv.pkgs(tv.shell("pm list packages -d"));
                info.put("home", tv.home());
                info.put("ip", ip);
                JSONObject plan = plan(info, all, off);
                String serial = info.optString("product_serialno", ip);
                JSONObject known = Store.tv(this, serial.isEmpty() ? ip : serial);
                result(id, new JSONObject().put("ok", true).put("info", info).put("plan", plan)
                        .put("hasNoor", all.contains("app.noortv.kahf")).put("name", known == null ? "" : known.optString("name")));
            } catch (Exception e) {
                result(id, "{\"ok\":false,\"error\":" + JSONObject.quote(e.getClass().getSimpleName()) + "}");
            }
        });
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
                run(ip, o, r);
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

    private void run(String ip, JSONObject o, JSONObject r) throws Exception {
        Tv tv = new Tv(this, ip);
        String serial = tv.prop("ro.serialno");
        if (serial.isEmpty()) serial = ip;

        // Backup: kept from the first time, so «restore» goes back to how the TV came, not to an earlier setup.
        step("backup", "run", null);
        JSONObject bk = Store.backup(this, serial);
        if (bk == null) {
            bk = new JSONObject().put("serial", serial).put("model", tv.prop("ro.product.model")).put("home", tv.home())
                    .put("disabledBefore", new JSONArray(Tv.pkgs(tv.shell("pm list packages -d"))))
                    .put("disabledByUs", new JSONArray()).put("installedByUs", new JSONArray());
        }
        bk.put("ip", ip);
        Store.saveBackup(this, bk);
        step("backup", "ok", null);

        // Clean-up: the whole list in one go, disabled, never uninstalled.
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
            for (String l : tv.shell(c.toString()).split("\n")) {
                if (l.startsWith("off=")) {
                    Tv.addOnce(bk.getJSONArray("disabledByUs"), l.substring(4).trim());
                    n++;
                }
            }
            Store.saveBackup(this, bk);
        }
        step("clean", "ok", String.valueOf(n));

        step("noor", "run", null);
        tv.noorApps(bk);
        Store.saveBackup(this, bk);
        step("noor", "ok", null);

        JSONObject city = o.optJSONObject("city");
        step("city", "run", null);
        boolean cityOk = tv.city(city);
        step("city", cityOk ? "ok" : "skip", city == null ? null : city.optString("place"));

        step("adhan", "run", null);
        List<String> others;
        synchronized (noorTvs) {
            others = new ArrayList<>(noorTvs);
        }
        JSONArray known = Store.tvs(this);
        for (int i = 0; i < known.length(); i++) others.add(known.getJSONObject(i).optString("ip"));
        boolean adhan = tv.adhan(others);
        step("adhan", adhan ? "ok" : "skip", null);

        step("home", "run", null);
        String home = tv.launcher(bk);
        Store.saveBackup(this, bk);
        step("home", "ok".equals(home) ? "ok" : "fail", "ok".equals(home) ? null : home);

        step("prayer", "run", null);
        tv.prayerCard(bk);
        Store.saveBackup(this, bk);
        step("prayer", "ok", null);

        String theme = o.optString("theme", "awqat");
        step("theme", "run", theme);
        tv.theme(theme);
        step("theme", "ok", theme);

        // The TV joins the list on the start screen.
        String name = o.optString("name").trim();
        Store.putTv(this, new JSONObject().put("key", serial).put("ip", ip).put("name", name.isEmpty() ? bk.optString("model") : name)
                .put("model", bk.optString("model")).put("id", tv.id()).put("theme", theme).put("city", city == null ? JSONObject.NULL : city)
                .put("version", Tv.bundled(this)).put("setupAt", System.currentTimeMillis()));
        prefs.edit().putString("tv", ip).apply();
        r.put("disabled", n).put("theme", theme).put("adhan", adhan).put("city", cityOk).put("key", serial);
    }
}
