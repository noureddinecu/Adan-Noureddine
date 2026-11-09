package app.noortv.phone;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * «زحاف TV» on the phone: the studio served by the TV (draw, write, stickers, photos, camera, prayer times) in a
 * WebView, finding the TV on the Wi-Fi by itself, in Arabic or Spanish, plus a PIN-protected button that gives the
 * TV back its own home screen and apps over network ADB.
 */
public class MainActivity extends Activity {
    static final String PIN = "0000";
    static final int PICK = 7;
    static final int BG = 0xFF0D0F1E, CARD = 0x1AFFFFFF;

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
    /** Apps this setup installed (never a system app); removed on request. The Kahf app last: it serves the page. */
    static final String[] OURS = {"app.noortv.home", "com.majnioui.tv.prayer", "app.noortv.baqara",
            "app.noortv.sabah", "app.noortv.masa", "app.noortv.ruqya", "app.noortv.kahf"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private WebView web;
    private ValueCallback<Uri[]> pending;
    private long camAt;

    private boolean es() {
        return "es".equals(prefs.getString("lang", "ar"));
    }

    /** The Arabic (Darija) or Spanish wording, by the language chosen with 🌐. */
    private String tr(String ar, String es) {
        return es() ? es : ar;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("noor", MODE_PRIVATE);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setLayoutDirection(es() ? View.LAYOUT_DIRECTION_LTR : View.LAYOUT_DIRECTION_RTL);

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(10), dp(10), dp(10));
        TextView title = new TextView(this);
        title.setText(tr("زحاف TV", "Zahhaf TV"));
        title.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_tv, 0, 0, 0);
        title.setCompoundDrawablePadding(dp(10));
        title.setTextColor(Color.WHITE);
        title.setTextSize(19);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        bar.addView(small(R.drawable.ic_search, false, v -> connect(true)));
        bar.addView(small(R.drawable.ic_globe, false, v -> {
            prefs.edit().putString("lang", es() ? "ar" : "es").apply();
            recreate();
        }));
        bar.addView(small(R.drawable.ic_settings, false, v -> settings()));
        bar.addView(small(R.drawable.ic_restore, true, v -> askPin()));
        root.addView(bar);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void search() {
                main.post(() -> connect(true));
            }
        }, "Zahhaf");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) offline(false);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                try {
                    startActivityForResult(p.isCaptureEnabled() ? camera()
                            : Intent.createChooser(new Intent(Intent.ACTION_GET_CONTENT).setType("image/*")
                                    .addCategory(Intent.CATEGORY_OPENABLE), tr("اختار تصويرة", "Elige una foto"))
                            .putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera()}), PICK);
                } catch (Exception e) {
                    pending = null;
                    return false;
                }
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        connect(false);
    }

    // ---------- finding the TV ----------

    private String host() {
        return prefs.getString("tv", "192.168.1.35");
    }

    private void load() {
        web.loadUrl("http://" + host() + ":8080/?app=1&lang=" + (es() ? "es" : "ar"));
    }

    /** Opens the saved TV if it answers; otherwise searches the Wi-Fi for it (or straight away from the search button). */
    private void connect(boolean searchNow) {
        String saved = host();
        if (!searchNow) {
            new Thread(() -> {
                boolean ok = ping(saved);
                main.post(() -> {
                    if (ok) load();
                    else connect(true);
                });
            }, "ping-tv").start();
            return;
        }
        searching();
        new Thread(() -> {
            Scan r = discover(n -> main.post(() -> web.evaluateJavascript("p(" + n + ")", null)));
            main.post(() -> found(r));
        }, "find-tv").start();
    }

    private void found(Scan r) {
        if (r.noor.size() == 1) {
            use(r.noor.get(0));
            return;
        }
        if (r.noor.size() > 1) {
            String[] ips = r.noor.toArray(new String[0]);
            new AlertDialog.Builder(this).setTitle(tr("لقيت " + ips.length + " ديال التلفزيونات، اختار واحد", "Encontré " + ips.length + " teles, elige una"))
                    .setItems(ips, (d, w) -> use(ips[w])).setCancelable(false).show();
            return;
        }
        offline(true);
        if (!r.adb.isEmpty()) {
            String[] ips = r.adb.toArray(new String[0]);
            new AlertDialog.Builder(this)
                    .setTitle(tr("لقيت تلفزيون، ولكن تطبيقات نور ماشي فيه", "Encontré una tele, pero sin las apps de Noor"))
                    .setMessage(tr("الرسم والصلاة كيحتاجو تطبيقات نور فالتلفزيون. تقدر تحفظ هاد العنوان باش يخدم زر الرجوع.",
                            "El dibujo y la oración necesitan las apps de Noor en la tele. Puedes guardar esta dirección para el botón de restaurar."))
                    .setItems(ips, (d, w) -> prefs.edit().putString("tv", ips[w]).apply())
                    .setNegativeButton(tr("إلغاء", "Cancelar"), null).show();
        }
    }

    private void use(String ip) {
        prefs.edit().putString("tv", ip).apply();
        load();
    }

    private static boolean ping(String ip) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL("http://" + ip + ":8080/ping").openConnection();
            c.setConnectTimeout(700);
            c.setReadTimeout(900);
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[16];
                int n = in.read(b);
                return n > 0 && new String(b, 0, n).startsWith("zahhaf");
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean adbOpen(String ip) {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress(ip, 5555), 500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static final class Scan {
        final java.util.List<String> noor = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        final java.util.List<String> adb = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
    }

    interface Progress {
        void at(int done);
    }

    /**
     * Asks every address of this phone's Wi-Fi network (a /24) for the TV's page, 64 at a time; an address with
     * no page but network ADB open is noted as a TV without the Noor apps.
     */
    private Scan discover(Progress progress) {
        Scan r = new Scan();
        String prefix = null;
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            Network n = cm.getActiveNetwork();
            LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
            if (lp != null) {
                for (LinkAddress a : lp.getLinkAddresses()) {
                    if (a.getAddress() instanceof Inet4Address && !a.getAddress().isLoopbackAddress()) {
                        String ip = a.getAddress().getHostAddress();
                        prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        if (prefix == null) return r;
        java.util.concurrent.atomic.AtomicInteger done = new java.util.concurrent.atomic.AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(64);
        for (int i = 1; i < 255; i++) {
            String ip = prefix + i;
            pool.execute(() -> {
                if (ping(ip)) r.noor.add(ip);
                else if (adbOpen(ip)) r.adb.add(ip);
                int d = done.incrementAndGet();
                if (d % 6 == 0 || d == 254) progress.at(d);
            });
        }
        pool.shutdown();
        try {
            pool.awaitTermination(20, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        pool.shutdownNow();
        return r;
    }

    private void page(String body) {
        String html = "<html dir=" + (es() ? "ltr" : "rtl") + "><head><meta name=viewport content='width=device-width,initial-scale=1'><style>"
                + "body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:"
                + "radial-gradient(120% 60% at 100% 0%,#2a1f6b 0%,transparent 60%),#0d0f1e;color:#fff;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box}"
                + ".r{position:relative;width:180px;height:180px;margin-bottom:28px}.r i{position:absolute;inset:0;border-radius:50%;border:2px solid #7c5cff;opacity:0;animation:w 2.4s infinite}"
                + ".r i:nth-child(2){animation-delay:.8s}.r i:nth-child(3){animation-delay:1.6s}@keyframes w{0%{transform:scale(.2);opacity:.9}100%{transform:scale(1);opacity:0}}"
                + ".r svg{position:absolute;inset:60px;width:60px;height:60px}.bar{width:220px;height:6px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:18px}"
                + ".bar b{display:block;height:100%;width:0;background:linear-gradient(90deg,#7c5cff,#00d4ff);transition:width .3s}"
                + "p{opacity:.72;line-height:1.8;font-size:16px;max-width:340px}button{margin-top:22px;padding:15px 28px;font-size:17px;font-weight:700;border:0;border-radius:16px;"
                + "color:#fff;background:linear-gradient(135deg,#7c5cff,#00d4ff);display:inline-flex;align-items:center;gap:10px}</style></head><body>" + body
                + "<script>function p(n){var b=document.querySelector('.bar b');if(b)b.style.width=(n/254*100)+'%'}</script></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private static final String SEARCH_ICON = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' "
            + "stroke-linejoin='round' width='22' height='22'><path d='M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM21 21l-4.3-4.3'/></svg>";

    private void searching() {
        page("<div class=r><i></i><i></i><i></i><svg viewBox='0 0 24 24' fill='none' stroke='#00d4ff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>"
                + "<path d='M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM17 2l-5 5-5-5'/></svg></div>"
                + "<h2>" + tr("كنقلّب على التلفزيون…", "Buscando la tele…") + "</h2>"
                + "<p>" + tr("التيليفون كيقلّب فالواي فاي ديالك بوحدو.", "El móvil busca la tele en tu wifi él solo.") + "</p><div class=bar><b></b></div>");
    }

    private void offline(boolean searched) {
        page("<svg viewBox='0 0 24 24' width='72' height='72' fill='none' stroke='#ff6b8a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>"
                + "<path d='M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM17 2l-5 5-5-5M9 11l6 6M15 11l-6 6'/></svg>"
                + "<h2>" + tr("ما لقيتش التلفزيون", "No encuentro la tele") + "</h2><p>"
                + tr("تأكد بلّي التيليفون والتلفزيون فنفس الواي فاي، والتلفزيون شاعل.",
                        "Comprueba que el móvil y la tele están en el mismo wifi y que la tele está encendida.")
                + (searched ? "" : "<br>" + tr("العنوان: ", "Dirección: ") + host()) + "</p>"
                + "<button onclick='Zahhaf.search()'>" + SEARCH_ICON + tr("قلّب مرة أخرى", "Buscar otra vez") + "</button>");
    }

    // ---------- photos and the camera ----------

    private Intent camera() {
        CamProvider.file(this).delete();
        camAt = System.currentTimeMillis();
        Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, CamProvider.URI)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.setClipData(ClipData.newRawUri("", CamProvider.URI));
        return i;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != PICK || pending == null) return;
        Uri u = null;
        if (res == RESULT_OK) {
            u = data != null ? data.getData() : null;
            java.io.File shot = CamProvider.file(this);
            if (u == null && shot.length() > 0 && shot.lastModified() >= camAt - 2000) u = CamProvider.URI;
        }
        pending.onReceiveValue(u == null ? null : new Uri[]{u});
        pending = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ---------- settings ----------

    private void settings() {
        LinearLayout box = column();
        EditText ip = new EditText(this);
        ip.setText(host());
        ip.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        box.addView(label(tr("عنوان التلفزيون (IP):", "Dirección de la tele (IP):")));
        box.addView(ip);
        box.addView(label(tr("«جرّب الربط» كيطلب من التلفزيون يقبل هاد التيليفون: ملي يطلع السؤال فالتلفزيون، اختار «السماح دائماً» ووافق. "
                        + "هادشي خاصو باش يخدم زر ♻️.",
                "«Probar conexión» pide a la tele que acepte este móvil: cuando salga la pregunta en la tele, elige «Permitir siempre» y acepta. "
                        + "Hace falta para el botón ♻️.")));
        Button find = new Button(this);
        find.setText(tr("قلّب على التلفزيون", "Buscar la tele"));
        find.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_search, 0, 0, 0);
        find.setCompoundDrawablePadding(dp(8));
        find.setAllCaps(false);
        box.addView(find);
        AlertDialog d = new AlertDialog.Builder(this)
                .setTitle(tr("الإعدادات", "Ajustes"))
                .setView(box)
                .setPositiveButton(tr("حفظ", "Guardar"), (x, w) -> {
                    prefs.edit().putString("tv", ip.getText().toString().trim()).apply();
                    connect(false);
                })
                .setNeutralButton(tr("جرّب الربط", "Probar conexión"), (x, w) -> {
                    prefs.edit().putString("tv", ip.getText().toString().trim()).apply();
                    run(tr("كنتصل بالتلفزيون… إلى طلع سؤال فالتلفزيون، وافق عليه", "Conectando… si sale una pregunta en la tele, acéptala"),
                            "echo ok", out -> out.trim().endsWith("ok")
                                    ? tr("✅ التيليفون مربوط بالتلفزيون", "✅ El móvil está conectado a la tele") : "⚠️ " + out);
                })
                .setNegativeButton(tr("إلغاء", "Cancelar"), null)
                .create();
        find.setOnClickListener(v -> {
            d.dismiss();
            connect(true);
        });
        d.show();
    }

    // ---------- restore ----------

    private void askPin() {
        EditText pin = new EditText(this);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setGravity(Gravity.CENTER);
        pin.setTextSize(28);
        LinearLayout box = column();
        box.addView(pin);
        new AlertDialog.Builder(this)
                .setTitle(tr("دخّل الكود", "Introduce el código"))
                .setView(box)
                .setPositiveButton(tr("دخول", "Entrar"), (x, w) -> {
                    if (PIN.equals(pin.getText().toString())) confirmRestore();
                    else toastDialog(tr("❌ الكود غالط", "❌ Código incorrecto"));
                })
                .setNegativeButton(tr("إلغاء", "Cancelar"), null)
                .show();
        pin.requestFocus();
    }

    private void confirmRestore() {
        LinearLayout box = column();
        box.addView(label(tr("هادشي غادي:\n• يشعّل جميع التطبيقات اللي تطفاو (Netflix، Prime، الإعلانات ديال شاومي…)\n• يرجّع شاشة قوقل الأصلية هي الرئيسية",
                "Esto va a:\n• Volver a activar todas las apps desactivadas (Netflix, Prime, la publicidad de Xiaomi…)\n• Devolver la pantalla de inicio original de Google")));
        CheckBox ours = new CheckBox(this);
        ours.setText(tr("وحتى يحيد تطبيقات نور (الشاشة الجديدة، الأذان، البطاقات، مواقيت الصلاة)",
                "Y quitar también las apps de Noor (pantalla nueva, adhan, tarjetas, horarios de oración)"));
        ours.setChecked(true);
        box.addView(ours);
        new AlertDialog.Builder(this)
                .setTitle(tr("نرجّعو التلفزيون كيما كان؟", "¿Dejamos la tele como estaba?"))
                .setView(box)
                .setPositiveButton(tr("إيه، رجّعو", "Sí, restaurar"), (d, w) -> restore(ours.isChecked()))
                .setNegativeButton(tr("لا", "No"), null)
                .show();
    }

    private void restore(boolean removeOurs) {
        StringBuilder sh = new StringBuilder("D=$(pm list packages -d); n=0; for p in");
        for (String p : OFF) sh.append(' ').append(p);
        sh.append("; do case \"$D\" in *\"package:$p\"*) pm enable --user 0 $p >/dev/null 2>&1 && n=$((n+1));; esac; done; ")
                .append("echo \"on=$n\"; ")
                .append("cmd package set-home-activity --user 0 com.google.android.tvlauncher/.MainActivity >/dev/null 2>&1; ")
                .append("H=$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tail -n 1); ")
                .append("echo \"home=$H\"; ");
        if (removeOurs) {
            // Only once Google's home really owns Home, so the TV is never left without one.
            sh.append("case \"$H\" in com.google.android.tvlauncher/*) for p in");
            for (String p : OURS) sh.append(' ').append(p);
            sh.append("; do pm list packages -s $p | grep -qx \"package:$p\" && continue; ")
                    .append("pm uninstall $p 2>/dev/null | grep -q Success && echo \"gone=$p\"; done;; esac; ");
        }
        sh.append("am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null 2>&1; echo done");
        run(tr("كنرجّعو التلفزيون… (إلى طلع سؤال فالتلفزيون، وافق عليه)", "Restaurando la tele… (si sale una pregunta en la tele, acéptala)"),
                sh.toString(), out -> {
                    if (!out.contains("done")) return tr("⚠️ ما كملش:\n", "⚠️ No terminó:\n") + out;
                    int on = 0, gone = 0;
                    boolean home = false;
                    for (String line : out.split("\n")) {
                        if (line.startsWith("on=")) on = Integer.parseInt(line.substring(3).trim());
                        if (line.startsWith("gone=")) gone++;
                        if (line.startsWith("home=com.google.android.tvlauncher/")) home = true;
                    }
                    return (home ? tr("✅ رجعات شاشة قوقل الأصلية\n", "✅ Vuelve la pantalla original de Google\n")
                            : tr("⚠️ الشاشة الرئيسية ما تبدّلاتش\n", "⚠️ La pantalla de inicio no cambió\n"))
                            + tr("✅ تشعّلو " + on + " تطبيقات\n", "✅ " + on + " apps activadas\n")
                            + (removeOurs ? tr("🗑️ تحيدو " + gone + " تطبيقات ديال نور\n", "🗑️ " + gone + " apps de Noor quitadas\n") : "")
                            + tr("\nالتلفزيون رجع كيما كان 🌿", "\nLa tele está como antes 🌿");
                });
    }

    // ---------- helpers ----------

    interface Result {
        String of(String output);
    }

    private void run(String wait, String command, Result result) {
        ProgressDialog p = ProgressDialog.show(this, null, wait, true, false);
        String h = host();
        new Thread(() -> {
            String msg;
            try {
                msg = result.of(Adb.shell(this, h, command));
            } catch (Exception e) {
                msg = tr("⚠️ ما قدرتش نتصل بالتلفزيون.\n\nتأكد بلّي:\n• «تصحيح أخطاء USB» مشعّل فخيارات المطوّر ديال التلفزيون\n"
                                + "• التيليفون والتلفزيون فنفس الواي فاي\n• وافقتي على السؤال اللي طلع فالتلفزيون",
                        "⚠️ No pude conectar con la tele.\n\nComprueba que:\n• «Depuración USB» está activada en las opciones de desarrollador de la tele\n"
                                + "• El móvil y la tele están en el mismo wifi\n• Aceptaste la pregunta que salió en la tele")
                        + "\n\n(" + e.getClass().getSimpleName() + ")";
            }
            String m = msg;
            main.post(() -> {
                p.dismiss();
                toastDialog(m);
            });
        }, "adb").start();
    }

    private void toastDialog(String msg) {
        new AlertDialog.Builder(this).setMessage(msg).setPositiveButton(tr("مزيان", "Vale"), null).show();
    }

    private android.widget.ImageButton small(int icon, boolean red, View.OnClickListener l) {
        android.widget.ImageButton b = new android.widget.ImageButton(this);
        b.setImageResource(icon);
        if (red) b.setColorFilter(0xFFFFD0DA);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(red ? 0x33FF6B8A : CARD);
        bg.setStroke(dp(1), red ? 0x59FF6B8A : 0x22FFFFFF);
        bg.setCornerRadius(dp(13));
        b.setBackground(bg);
        b.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(42), dp(42));
        lp.setMarginStart(dp(7));
        b.setLayoutParams(lp);
        b.setOnClickListener(v -> {
            v.animate().scaleX(.88f).scaleY(.88f).setDuration(80).withEndAction(() -> v.animate().scaleX(1).scaleY(1).setDuration(140).start()).start();
            v.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
            l.onClick(v);
        });
        return b;
    }

    private LinearLayout column() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        return box;
    }

    private TextView label(String t) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(15);
        v.setLineSpacing(0, 1.2f);
        v.setPadding(0, dp(6), 0, dp(6));
        return v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
