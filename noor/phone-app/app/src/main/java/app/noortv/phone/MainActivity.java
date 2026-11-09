package app.noortv.phone;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * «زحاف TV»: one screen that starts on the list of TVs set up from this phone (assets/home.html), opens the setup
 * for a new one (SetupActivity), keeps each TV up to date by itself, and opens a TV's own page (write, draw,
 * settings) served by the Noor app on it. Everything the pages ask for goes through the «Zahhaf» bridge below.
 */
public class MainActivity extends Activity {
    static final int BG = 0xFF0D0F1E;
    static final int SETUP = 1, EXPORT = 2, IMPORT = 3;
    static final String RELEASE = "https://github.com/noureddinecu/Adan-Noureddine/releases/download/noor-tv-build/";

    /** Everything this setup (and the CleanYourTV app before it) may have turned off; restore turns them back on. */
    static final String[] OFF = {
            "com.miui.tv.analytics", "com.xiaomi.statistic", "com.google.android.feedback",
            "com.google.android.tv.bugreportsender", "com.xiaomi.mitv.tvmanager", "com.mitv.tvhome.atv",
            "com.mitv.tvhome.michannel", "com.xm.webcontent", "com.xiaomi.floatingframe",
            "com.google.android.tvrecommendations", "android.autoinstalls.config.xiaomi.amelie",
            "com.xiaomi.mimusic2", "com.google.android.play.games", "com.google.android.videos", "com.mitv.gallery",
            "com.google.android.katniss", "com.google.android.backdrop", "com.mitv.dream",
            "com.netflix.ninja", "com.amazon.amazonvideo.livingroom", "com.google.android.youtube.tvmusic",
            "com.google.android.leanbacklauncher", "com.google.android.leanbacklauncher.recommendations",
            "com.google.android.tvlauncher"};
    /** Apps this setup installs (never a system app). The Kahf app last: it serves the TV's page. */
    static final String[] OURS = {Tv.HOME, "com.majnioui.tv.prayer", "app.noortv.baqara",
            "app.noortv.sabah", "app.noortv.masa", "app.noortv.ruqya", "app.noortv.kahf"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private WebView web;
    private boolean onHome = true, firstShow = true;
    private int pendingId;

    @Override
    protected void onCreate(Bundle b) {
        setTheme(R.style.App); // the launch theme only covers the cold start
        super.onCreate(b);
        prefs = Store.prefs(this);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Zahhaf");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame() && !onHome) home(); // the TV went away: back to the list, which says so
            }
        });
        setContentView(web);
        home();
    }

    private String lang() {
        return prefs.getString("lang", "ar");
    }

    private void home() {
        onHome = true;
        web.loadUrl("file:///android_asset/home.html");
    }

    private void js(String code) {
        main.post(() -> web.evaluateJavascript(code, null));
    }

    private void result(int id, Object json) {
        js("window.onResult&&onResult(" + id + "," + JSONObject.quote(String.valueOf(json)) + ")");
    }

    private void async(Runnable r) {
        new Thread(r, "zahhaf").start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (onHome && !firstShow) js("window.resumed&&resumed()");
    }

    @Override
    public void onBackPressed() {
        if (!onHome) home();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == SETUP) {
            String key = data == null ? null : data.getStringExtra("open");
            if (key != null) openControl(key);
            else home();
            return;
        }
        if (req == EXPORT || req == IMPORT) {
            Uri u = res == RESULT_OK && data != null ? data.getData() : null;
            int id = pendingId;
            if (u == null) {
                result(id, "{\"ok\":false}");
                return;
            }
            async(() -> {
                try {
                    if (req == EXPORT) {
                        try (OutputStream o = getContentResolver().openOutputStream(u)) {
                            o.write(Store.exportAll(this).toString().getBytes("UTF-8"));
                        }
                        result(id, "{\"ok\":true}");
                    } else {
                        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                        try (InputStream in = getContentResolver().openInputStream(u)) {
                            byte[] buf = new byte[65536];
                            int n;
                            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                        }
                        Store.importAll(this, new JSONObject(b.toString("UTF-8")));
                        result(id, "{\"ok\":true}");
                    }
                } catch (Exception e) {
                    result(id, "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
                }
            });
        }
    }

    private void openControl(String key) {
        JSONObject t = Store.tv(this, key);
        if (t == null) {
            home();
            return;
        }
        onHome = false;
        try {
            web.loadUrl("http://" + t.getString("ip") + ":8080/?app=1&lang=" + lang() + "&name="
                    + java.net.URLEncoder.encode(t.optString("name", t.optString("model")), "UTF-8"));
        } catch (Exception e) {
            home();
        }
    }

    // ---------- finding TVs on the Wi-Fi ----------

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

    /** Every Noor TV answering on the Wi-Fi (its page on 8080), with its id. Cached for a few seconds. */
    private List<String[]> lastScan;
    private long lastScanAt;

    private synchronized List<String[]> scanNoor() {
        if (lastScan != null && System.currentTimeMillis() - lastScanAt < 8000) return lastScan;
        List<String[]> out = Collections.synchronizedList(new ArrayList<>());
        String prefix = prefix();
        if (prefix != null) {
            ExecutorService pool = Executors.newFixedThreadPool(64);
            for (int i = 1; i < 255; i++) {
                String ip = prefix + i;
                pool.execute(() -> {
                    if (Tv.text("http://" + ip + ":8080/ping", 900).startsWith("zahhaf")) out.add(new String[]{ip, new Tv(this, ip).id()});
                });
            }
            pool.shutdown();
            try {
                pool.awaitTermination(15, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
            }
        }
        lastScan = out;
        lastScanAt = System.currentTimeMillis();
        return out;
    }

    // ---------- the TV's own backup, for restore ----------

    private String restoreScript(Tv tv, boolean removeOurs) throws Exception {
        String serial = tv.prop("ro.serialno");
        JSONObject bk = serial.isEmpty() ? null : Store.backup(this, serial);
        Set<String> on = new LinkedHashSet<>(Arrays.asList(OFF)), ours = new LinkedHashSet<>(Arrays.asList(OURS));
        String homeAct = "com.google.android.tvlauncher/.MainActivity";
        if (bk != null) {
            JSONArray a = bk.optJSONArray("disabledByUs");
            for (int i = 0; a != null && i < a.length(); i++) on.add(a.getString(i));
            JSONArray b = bk.optJSONArray("installedByUs");
            for (int i = 0; b != null && i < b.length(); i++) ours.add(b.getString(i));
            String hm = bk.optString("home");
            if (hm.contains("/") && !hm.startsWith(Tv.HOME)) homeAct = hm;
            JSONArray before = bk.optJSONArray("disabledBefore");
            for (int i = 0; before != null && i < before.length(); i++) on.remove(before.getString(i));
        }
        StringBuilder sh = new StringBuilder("D=$(pm list packages -d); n=0; for p in");
        for (String p : on) if (p.matches("[A-Za-z][\\w.]+")) sh.append(' ').append(p);
        sh.append("; do case \"$D\" in *\"package:$p\"*) pm enable --user 0 $p >/dev/null 2>&1 && n=$((n+1));; esac; done; echo \"on=$n\"; ")
                .append("cmd package set-home-activity --user 0 ").append(homeAct).append(" >/dev/null 2>&1; ")
                .append("H=$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tail -n 1); echo \"home=$H\"; ");
        if (removeOurs) {
            sh.append("case \"$H\" in ").append(Tv.HOME).append("/*|\"\") ;; *) for p in");
            for (String p : ours) if (p.matches("[A-Za-z][\\w.]+")) sh.append(' ').append(p);
            sh.append("; do pm list packages -s $p | grep -qx \"package:$p\" && continue; ")
                    .append("pm uninstall $p 2>/dev/null | grep -q Success && echo \"gone=$p\"; done;; esac; ");
        }
        sh.append("am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null 2>&1; echo done");
        return sh.toString();
    }

    // ---------- the bridge the pages talk to ----------

    final class Bridge {
        @JavascriptInterface
        public String lang() {
            return MainActivity.this.lang();
        }

        @JavascriptInterface
        public void setLang(String l) {
            prefs.edit().putString("lang", "es".equals(l) ? "es" : "ar").apply();
        }

        @JavascriptInterface
        public String tvs() {
            return Store.tvs(MainActivity.this).toString();
        }

        @JavascriptInterface
        public boolean firstShow() {
            boolean f = firstShow;
            firstShow = false;
            return f;
        }

        @JavascriptInterface
        public void tap() {
            main.post(() -> web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY));
        }

        @JavascriptInterface
        public void buzz() {
            main.post(() -> web.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS));
        }

        @JavascriptInterface
        public void setup() {
            main.post(() -> startActivityForResult(new Intent(MainActivity.this, SetupActivity.class), SETUP));
        }

        @JavascriptInterface
        public void control(String key) {
            main.post(() -> openControl(key));
        }

        @JavascriptInterface
        public void home() {
            main.post(MainActivity.this::home);
        }

        @JavascriptInterface
        public void rename(String key, String name) {
            try {
                if (!name.isEmpty()) Store.putTv(MainActivity.this, new JSONObject().put("key", key).put("name", name));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void remove(String key) {
            Store.removeTv(MainActivity.this, key);
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url.startsWith("https://github.com/noureddinecu/")) main.post(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }

        @JavascriptInterface
        public String about() {
            try {
                android.content.pm.PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return new JSONObject().put("name", p.versionName).put("code", p.getLongVersionCode()).toString();
            } catch (Exception e) {
                return "{\"name\":\"?\",\"code\":0}";
            }
        }

        /** Where the TV is now (its address can change: it is found again by its id) and which version it runs. */
        @JavascriptInterface
        public void status(int id, String key) {
            async(() -> {
                JSONObject t = Store.tv(MainActivity.this, key);
                JSONObject r = new JSONObject();
                try {
                    if (t == null) throw new IllegalStateException();
                    String ip = t.optString("ip");
                    boolean online = new Tv(MainActivity.this, ip).online();
                    if (!online && !t.optString("id").isEmpty()) {
                        for (String[] f : scanNoor()) {
                            if (t.optString("id").equals(f[1])) {
                                ip = f[0];
                                online = true;
                                Store.putTv(MainActivity.this, new JSONObject().put("key", key).put("ip", ip));
                            }
                        }
                    }
                    r.put("online", online).put("ip", ip).put("latest", Tv.bundled(MainActivity.this))
                            .put("version", online ? new Tv(MainActivity.this, ip).version() : 0);
                } catch (Exception e) {
                    try {
                        r.put("online", false);
                    } catch (Exception ignored) {
                    }
                }
                result(id, r);
            });
        }

        /** Brings the TV's apps to this app's version (or reinstalls them for a repair), keeping its clean-up and settings. */
        @JavascriptInterface
        public void update(int id, String key, boolean repair) {
            async(() -> {
                JSONObject r = new JSONObject();
                try {
                    JSONObject t = Store.tv(MainActivity.this, key);
                    Tv tv = new Tv(MainActivity.this, t.getString("ip"));
                    JSONObject bk = Store.backup(MainActivity.this, key);
                    tv.noorApps(bk);
                    JSONObject city = t.optJSONObject("city");
                    if (city != null) tv.city(city);
                    List<String> others = new ArrayList<>();
                    JSONArray all = Store.tvs(MainActivity.this);
                    for (int i = 0; i < all.length(); i++) others.add(all.getJSONObject(i).optString("ip"));
                    tv.adhan(others);
                    String home = tv.launcher(bk);
                    tv.prayerCard(bk);
                    tv.theme(t.optString("theme", "awqat"));
                    if (bk != null) Store.saveBackup(MainActivity.this, bk);
                    Store.putTv(MainActivity.this, new JSONObject().put("key", key).put("version", Tv.bundled(MainActivity.this)).put("id", tv.id()));
                    r.put("ok", "ok".equals(home)).put("home", home);
                } catch (Exception e) {
                    try {
                        r.put("ok", false).put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                    } catch (Exception ignored) {
                    }
                }
                result(id, r);
            });
        }

        /** Noor TVs on the Wi-Fi that are not in the list yet (set up before this app could). */
        @JavascriptInterface
        public void discover(int id) {
            async(() -> {
                JSONArray out = new JSONArray();
                Set<String> known = new java.util.HashSet<>();
                JSONArray all = Store.tvs(MainActivity.this);
                for (int i = 0; i < all.length(); i++) {
                    known.add(all.optJSONObject(i).optString("ip"));
                    known.add(all.optJSONObject(i).optString("id"));
                }
                for (String[] f : scanNoor()) {
                    if (known.contains(f[0]) || (!f[1].isEmpty() && known.contains(f[1]))) continue;
                    try {
                        out.put(new JSONObject().put("ip", f[0]).put("id", f[1]));
                    } catch (Exception ignored) {
                    }
                }
                result(id, out);
            });
        }

        /** Adds a Noor TV found on the Wi-Fi to the list, with a backup of how it is now if there is none. */
        @JavascriptInterface
        public void adopt(int id, String ip) {
            async(() -> {
                JSONObject r = new JSONObject();
                try {
                    Tv tv = new Tv(MainActivity.this, ip);
                    String serial = tv.prop("ro.serialno");
                    if (serial.isEmpty()) serial = ip;
                    String model = tv.prop("ro.product.model");
                    if (Store.backup(MainActivity.this, serial) == null) {
                        JSONArray ours = new JSONArray();
                        for (String p : Tv.pkgs(tv.shell("pm list packages"))) if (p.startsWith("app.noortv.") || p.equals("com.majnioui.tv.prayer")) ours.put(p);
                        Store.saveBackup(MainActivity.this, new JSONObject().put("serial", serial).put("model", model)
                                .put("home", "com.google.android.tvlauncher/.MainActivity").put("disabledBefore", new JSONArray())
                                .put("disabledByUs", new JSONArray()).put("installedByUs", ours).put("ip", ip));
                    }
                    Store.putTv(MainActivity.this, new JSONObject().put("key", serial).put("ip", ip).put("name", model).put("model", model)
                            .put("id", tv.id()).put("theme", "awqat").put("version", tv.version()));
                    r.put("ok", true).put("key", serial);
                } catch (Exception e) {
                    try {
                        r.put("ok", false).put("error", e.getClass().getSimpleName());
                    } catch (Exception ignored) {
                    }
                }
                result(id, r);
            });
        }

        @JavascriptInterface
        public void restore(int id, String key, boolean removeOurs) {
            async(() -> {
                JSONObject r = new JSONObject();
                try {
                    JSONObject t = Store.tv(MainActivity.this, key);
                    Tv tv = new Tv(MainActivity.this, t.getString("ip"));
                    String out = tv.shell(restoreScript(tv, removeOurs));
                    if (!out.contains("done")) throw new IllegalStateException(out.trim());
                    if (removeOurs) {
                        Store.removeTv(MainActivity.this, key);
                        Store.backupFile(MainActivity.this, key).delete();
                    }
                    r.put("ok", true);
                } catch (Exception e) {
                    try {
                        r.put("ok", false).put("error", lang().equals("es") ? "No pude conectar con la tele." : "تعذّر الاتصال بالتلفاز.");
                    } catch (Exception ignored) {
                    }
                }
                result(id, r);
            });
        }

        /** The newest build on GitHub, for «check for a new version». */
        @JavascriptInterface
        public void checkUpdate(int id) {
            async(() -> {
                try {
                    HttpURLConnection h = (HttpURLConnection) new URL(RELEASE + "version.json").openConnection();
                    h.setConnectTimeout(5000);
                    h.setReadTimeout(5000);
                    h.setInstanceFollowRedirects(true);
                    java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                    try (InputStream in = h.getInputStream()) {
                        byte[] buf = new byte[4096];
                        int n;
                        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                    }
                    JSONObject v = new JSONObject(b.toString("UTF-8"));
                    result(id, new JSONObject().put("ok", true).put("version", v.optLong("version")).put("name", v.optString("name"))
                            .put("url", RELEASE + "noor-phone.apk"));
                } catch (Exception e) {
                    result(id, "{\"ok\":false}");
                }
            });
        }

        @JavascriptInterface
        public void exportData(int id) {
            pendingId = id;
            main.post(() -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json").putExtra(Intent.EXTRA_TITLE, "zahhaf-tv.json"), EXPORT));
        }

        @JavascriptInterface
        public void importData(int id) {
            pendingId = id;
            main.post(() -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*"), IMPORT));
        }
    }
}
