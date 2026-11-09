package app.noortv.phone;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

/**
 * «نور للتلفزيون» on the phone: the studio served by the TV (draw, write, stickers, photos) in a WebView, plus a
 * PIN-protected button that gives the TV back its own home screen and apps over network ADB.
 */
public class MainActivity extends Activity {
    static final String PIN = "0000";
    static final int PICK = 7;
    static final int BG = 0xFF0F1A17, CARD = 0xFF16241F, ACC = 0xFF1F6F50;

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

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("noor", MODE_PRIVATE);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(8), dp(12), dp(8));
        TextView title = new TextView(this);
        title.setText("📺 نور للتلفزيون");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        bar.addView(small("🔄", v -> load()));
        bar.addView(small("⚙️", v -> settings()));
        bar.addView(small("♻️ رجّع التلفزيون", v -> askPin()));
        root.addView(bar);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) offline();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "اختار تصويرة"), PICK);
                } catch (Exception e) {
                    pending = null;
                    return false;
                }
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        load();
    }

    private String host() {
        return prefs.getString("tv", "192.168.1.35");
    }

    private void load() {
        web.loadUrl("http://" + host() + ":8080/");
    }

    private void offline() {
        String html = "<html dir=rtl><body style='background:#0f1a17;color:#fff;font-family:sans-serif;text-align:center;padding:40px 20px'>"
                + "<div style='font-size:60px'>📡</div><h2>ما لقيتش التلفزيون</h2>"
                + "<p style='opacity:.8;line-height:1.7'>تأكد بلّي التيليفون والتلفزيون فنفس الواي فاي، والتلفزيون شاعل.<br>"
                + "العنوان دابا: <b>" + host() + "</b> (تقدر تبدّلو من ⚙️)</p>"
                + "<p style='opacity:.8'>ومن بعد ضغط 🔄 الفوق.</p></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != PICK || pending == null) return;
        Uri u = res == RESULT_OK && data != null ? data.getData() : null;
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
        TextView l = label("عنوان التلفزيون (IP):");
        EditText ip = new EditText(this);
        ip.setText(host());
        ip.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        box.addView(l);
        box.addView(ip);
        box.addView(label("«🔌 جرّب الربط» كيطلب من التلفزيون يقبل هاد التيليفون: ملي يطلع السؤال فالتلفزيون، "
                + "اختار «السماح دائماً» ووافق. هادشي خاصو باش يخدم زر «رجّع التلفزيون»."));
        new AlertDialog.Builder(this)
                .setTitle("⚙️ الإعدادات")
                .setView(box)
                .setPositiveButton("حفظ", (d, w) -> {
                    prefs.edit().putString("tv", ip.getText().toString().trim()).apply();
                    load();
                })
                .setNeutralButton("🔌 جرّب الربط", (d, w) -> {
                    prefs.edit().putString("tv", ip.getText().toString().trim()).apply();
                    run("كنتصل بالتلفزيون… إلى طلع سؤال فالتلفزيون، وافق عليه", "echo ok",
                            out -> out.trim().endsWith("ok") ? "✅ التيليفون مربوط بالتلفزيون" : "⚠️ " + out);
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    // ---------- restore ----------

    private void askPin() {
        EditText pin = new EditText(this);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setGravity(Gravity.CENTER);
        pin.setTextSize(28);
        LinearLayout box = column();
        box.addView(pin);
        AlertDialog d = new AlertDialog.Builder(this)
                .setTitle("🔒 دخّل الكود")
                .setView(box)
                .setPositiveButton("دخول", (x, w) -> {
                    if (PIN.equals(pin.getText().toString())) confirmRestore();
                    else toastDialog("❌ الكود غالط");
                })
                .setNegativeButton("إلغاء", null)
                .create();
        d.show();
        pin.requestFocus();
    }

    private void confirmRestore() {
        LinearLayout box = column();
        box.addView(label("هادشي غادي:\n• يشعّل جميع التطبيقات اللي تطفاو (Netflix، Prime، الإعلانات ديال شاومي…)\n"
                + "• يرجّع شاشة قوقل الأصلية هي الرئيسية"));
        CheckBox ours = new CheckBox(this);
        ours.setText("وحتى يحيد تطبيقات نور (الشاشة الجديدة، الأذان، البطاقات، مواقيت الصلاة)");
        ours.setChecked(true);
        box.addView(ours);
        new AlertDialog.Builder(this)
                .setTitle("♻️ نرجّعو التلفزيون كيما كان؟")
                .setView(box)
                .setPositiveButton("إيه، رجّعو", (d, w) -> restore(ours.isChecked()))
                .setNegativeButton("لا", null)
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
        run("كنرجّعو التلفزيون… (إلى طلع سؤال فالتلفزيون، وافق عليه)", sh.toString(), out -> {
            if (!out.contains("done")) return "⚠️ ما كملش:\n" + out;
            int on = 0, gone = 0;
            boolean home = false;
            for (String line : out.split("\n")) {
                if (line.startsWith("on=")) on = Integer.parseInt(line.substring(3).trim());
                if (line.startsWith("gone=")) gone++;
                if (line.startsWith("home=com.google.android.tvlauncher/")) home = true;
            }
            return (home ? "✅ رجعات شاشة قوقل الأصلية\n" : "⚠️ الشاشة الرئيسية ما تبدّلاتش\n")
                    + "✅ تشعّلو " + on + " تطبيقات\n"
                    + (removeOurs ? "🗑️ تحيدو " + gone + " تطبيقات ديال نور\n" : "")
                    + "\nالتلفزيون رجع كيما كان 🌿";
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
                msg = "⚠️ ما قدرتش نتصل بالتلفزيون.\n\nتأكد بلّي:\n• «تصحيح أخطاء USB» مشعّل فخيارات المطوّر ديال التلفزيون\n"
                        + "• التيليفون والتلفزيون فنفس الواي فاي\n• وافقتي على السؤال اللي طلع فالتلفزيون\n\n(" + e.getClass().getSimpleName() + ")";
            }
            String m = msg;
            main.post(() -> {
                p.dismiss();
                toastDialog(m);
            });
        }, "adb").start();
    }

    private void toastDialog(String msg) {
        new AlertDialog.Builder(this).setMessage(msg).setPositiveButton("مزيان", null).show();
    }

    private Button small(String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(14);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(text.startsWith("♻️") ? 0xFF3A2A2A : CARD);
        bg.setCornerRadius(dp(12));
        b.setBackground(bg);
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
        lp.setMarginStart(dp(6));
        b.setLayoutParams(lp);
        b.setOnClickListener(l);
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
