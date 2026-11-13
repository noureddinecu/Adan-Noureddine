package app.noortv;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Random;

/**
 * Adhkar on screen, over whatever is playing (a match, YouTube, a channel): every few minutes one dhikr fades in
 * small in a corner, with its virtue under it and a thin gold line that runs out with the seconds, then fades
 * away. The choice follows the time of day (morning, evening, night, Friday), never repeats the last few, and
 * nothing shows while the adhan plays or the TV is off. Started by MessageServer; set from the phone (/dhikr).
 */
final class Dhikr {
    private Dhikr() {
    }

    private static final int ANY = 0, MORNING = 1, EVENING = 2, NIGHT = 3, FRIDAY = 4;
    private static final Object[][] ALL = {
            {ANY, "سبحان الله وبحمده، سبحان الله العظيم", "كلمتان خفيفتان على اللسان، ثقيلتان في الميزان"},
            {ANY, "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير", "من قالها عشرًا كان كمن أعتق أربعة أنفس"},
            {ANY, "أستغفر الله العظيم وأتوب إليه", "من لزم الاستغفار جعل الله له من كل همّ فرجًا"},
            {ANY, "لا حول ولا قوة إلا بالله", "كنز من كنوز الجنة"},
            {ANY, "اللهم صلِّ وسلِّم على نبينا محمد ﷺ", "من صلّى عليّ صلاة صلّى الله عليه بها عشرًا"},
            {ANY, "سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر", "أحبّ الكلام إلى الله"},
            {ANY, "الحمد لله حمدًا كثيرًا طيبًا مباركًا فيه", ""},
            {ANY, "حسبي الله لا إله إلا هو، عليه توكلت وهو رب العرش العظيم", ""},
            {ANY, "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", "سورة البقرة ٢٠١"},
            {ANY, "لا إله إلا أنت سبحانك إني كنت من الظالمين", "دعوة ذي النون، ما دعا بها مسلم إلا استجاب الله له"},
            {ANY, "يا حيّ يا قيّوم، برحمتك أستغيث", ""},
            {ANY, "اللهم إنك عفوّ تحب العفو فاعفُ عنّا", ""},
            {ANY, "سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته", ""},
            {ANY, "رضيت بالله ربًّا، وبالإسلام دينًا، وبمحمد ﷺ نبيًّا", ""},
            {ANY, "اللهم أعنّي على ذكرك وشكرك وحسن عبادتك", ""},
            {ANY, "رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ", ""},
            {ANY, "رَبِّ زِدْنِي عِلْمًا", "سورة طه ١١٤"},
            {ANY, "اللهم إني أسألك العفو والعافية في الدنيا والآخرة", ""},
            {ANY, "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ", "سورة الرعد ٢٨"},
            {ANY, "فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ", "سورة البقرة ١٥٢"},
            {ANY, "سبحان الله", "تملأ الميزان مع الحمد لله"},
            {ANY, "الله أكبر كبيرًا، والحمد لله كثيرًا، وسبحان الله بكرةً وأصيلًا", ""},
            {MORNING, "أصبحنا وأصبح الملك لله، والحمد لله", "من أذكار الصباح"},
            {MORNING, "اللهم بك أصبحنا، وبك أمسينا، وبك نحيا، وبك نموت، وإليك النشور", "من أذكار الصباح"},
            {MORNING, "بسم الله الذي لا يضرّ مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم", "ثلاث مرات، لم يضرّه شيء"},
            {MORNING, "اللهم إني أسألك علمًا نافعًا، ورزقًا طيبًا، وعملًا متقبّلًا", "من أذكار الصباح"},
            {EVENING, "أمسينا وأمسى الملك لله، والحمد لله", "من أذكار المساء"},
            {EVENING, "اللهم بك أمسينا، وبك أصبحنا، وبك نحيا، وبك نموت، وإليك المصير", "من أذكار المساء"},
            {EVENING, "أعوذ بكلمات الله التامّات من شرّ ما خلق", "ثلاث مرات في المساء"},
            {NIGHT, "باسمك اللهم أموت وأحيا", "من أذكار النوم"},
            {NIGHT, "اللهم قِني عذابك يوم تبعث عبادك", "من أذكار النوم"},
            {FRIDAY, "اللهم صلِّ على محمد وعلى آل محمد كما صلّيت على إبراهيم", "أكثِروا الصلاة عليّ يوم الجمعة"},
            {FRIDAY, "جمعة مباركة 🌿 لا تنسَ سورة الكهف", "من قرأها يوم الجمعة أضاء له من النور ما بين الجمعتين"},
    };

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final Random rnd = new Random();
    private static final List<Integer> recent = new ArrayList<>();
    private static Context app;
    private static View shown;
    private static Typeface font;
    private static final Runnable tick = Dhikr::tick;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("dhikr", Context.MODE_PRIVATE);
    }

    static void start(Context c) {
        app = c.getApplicationContext();
        try {
            font = Typeface.createFromAsset(app.getAssets(), "amiri.ttf");
        } catch (Exception e) {
            font = Typeface.create(Typeface.SERIF, Typeface.BOLD);
        }
        reschedule();
    }

    /** After a change from the phone: the next one comes a full interval from now. */
    static void reschedule() {
        main.removeCallbacks(tick);
        if (app == null) return;
        main.postDelayed(tick, Math.max(1, prefs(app).getInt("every", 10)) * 60_000L);
    }

    private static void tick() {
        reschedule();
        SharedPreferences p = prefs(app);
        if (!p.getBoolean("on", true)) return;
        if (!app.getSystemService(PowerManager.class).isInteractive()) return; // TV is off
        if (Adhan.playing() || dua != null) return;
        show();
    }

    private static int[] pick() {
        Calendar now = Calendar.getInstance();
        int h = now.get(Calendar.HOUR_OF_DAY);
        boolean friday = now.get(Calendar.DAY_OF_WEEK) == Calendar.FRIDAY;
        int slot = h >= 4 && h < 12 ? MORNING : h >= 16 && h < 20 ? EVENING : h >= 22 || h < 4 ? NIGHT : -1;
        List<Integer> pool = new ArrayList<>();
        for (int i = 0; i < ALL.length; i++) {
            int kind = (Integer) ALL[i][0];
            if (recent.contains(i)) continue;
            if (kind == ANY) pool.add(i);
            // The time-of-day and Friday ones come up three times as often in their window.
            if ((kind == slot) || (kind == FRIDAY && friday && h < 20)) {
                pool.add(i);
                pool.add(i);
                pool.add(i);
            }
        }
        if (pool.isEmpty()) {
            recent.clear();
            return pick();
        }
        int i = pool.get(rnd.nextInt(pool.size()));
        recent.add(i);
        if (recent.size() > 8) recent.remove(0);
        return new int[]{i};
    }

    /** One dhikr now, in the corner chosen on the phone (tl, tr, bl, br). */
    static void show() {
        if (app == null || !Settings.canDrawOverlays(app)) return;
        main.post(() -> {
            hide(0);
            Object[] d = ALL[pick()[0]];
            SharedPreferences p = prefs(app);
            int secs = Math.max(3, p.getInt("secs", 5));
            String corner = p.getString("corner", "br");

            LinearLayout box = new LinearLayout(app);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            box.setPadding(px(22), px(12), px(22), px(10));
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xB3101428, 0x99081A14});
            bg.setCornerRadius(px(22));
            bg.setStroke(px(1), 0x40FFE08A);
            box.setBackground(bg);

            TextView ornament = text("✦ ذِكر ✦", 11, 0xB3FFE08A);
            ornament.setLetterSpacing(0.15f);
            box.addView(ornament);
            TextView body = text((String) d[1], 19, 0xF2FFFFFF);
            body.setMaxWidth(px(380));
            body.setShadowLayer(px(6), 0, px(1), 0xAA000000);
            box.addView(body);
            String virtue = (String) d[2];
            if (!virtue.isEmpty()) {
                TextView sub = text(virtue, 12, 0xCCFFE08A);
                sub.setMaxWidth(px(380));
                box.addView(sub);
            }
            View line = new View(app);
            GradientDrawable gold = new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, new int[]{0xFFFFE08A, 0x33FFE08A});
            gold.setCornerRadius(px(2));
            line.setBackground(gold);
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, px(2));
            llp.topMargin = px(8);
            box.addView(line, llp);

            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = (corner.startsWith("t") ? Gravity.TOP : Gravity.BOTTOM)
                    | (corner.endsWith("l") ? Gravity.LEFT : Gravity.RIGHT);
            lp.x = px(40);
            lp.y = px(corner.startsWith("t") ? 36 : 44);
            try {
                app.getSystemService(WindowManager.class).addView(box, lp);
            } catch (Exception e) {
                return;
            }
            shown = box;
            box.setAlpha(0f);
            box.setTranslationY(px(corner.startsWith("t") ? -14 : 14));
            box.animate().alpha(1f).translationY(0).setDuration(700).start();
            // The gold thread runs out with the seconds, from the start of the line towards its end.
            line.post(() -> {
                line.setPivotX(0);
                line.animate().scaleX(0f).setDuration(secs * 1000L).setStartDelay(500).start();
            });
            main.postDelayed(() -> hide(1100), 600 + secs * 1000L);
        });
    }

    // ---------- the dua after the adhan ----------

    static final String DUA_TITLE = "✦  دعاء ما بعد الأذان  ✦";
    /** Sahih al-Bukhari 614 (from Jabir ibn Abdillah), as it is said after the adhan. */
    static final String DUA = "اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ القَائِمَةِ، آتِ مُحَمَّدًا الوَسِيلَةَ"
            + " وَالفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ";
    static final String DUA_SOURCE = "رواه البخاري";
    private static final int DUA_SECS = 25;
    private static View dua;

    /**
     * Right after the adhan has played to its end: the dua after the adhan, larger than a dhikr and at the bottom
     * centre, over whatever is on screen, for DUA_SECS seconds with the gold thread running out. Not focusable, so
     * the remote keeps working; the adhkar wait while it is up.
     */
    static void afterAdhan(Context c) {
        if (app == null) start(c);
        if (!Settings.canDrawOverlays(app)) return;
        main.post(() -> {
            hideDua(0);
            hide(0);
            LinearLayout box = new LinearLayout(app);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            box.setGravity(Gravity.CENTER_HORIZONTAL);
            box.setPadding(px(28), px(14), px(28), px(12));
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xD9142152, 0xCC0A1233});
            bg.setCornerRadius(px(24));
            bg.setStroke(px(1), 0x66D9B66A);
            box.setBackground(bg);

            TextView title = text(DUA_TITLE, 14, 0xE6E8C987);
            title.setGravity(Gravity.CENTER);
            title.setLetterSpacing(0.05f);
            box.addView(title);
            TextView body = text(DUA, 22, 0xF7FFFFFF);
            body.setGravity(Gravity.CENTER);
            body.setMaxLines(4);
            body.setMaxWidth(px(620));
            body.setLineSpacing(0, 1.25f);
            body.setShadowLayer(px(6), 0, px(1), 0xAA000000);
            LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            blp.topMargin = px(6);
            box.addView(body, blp);
            TextView src = text(DUA_SOURCE, 12, 0xB3E8C987);
            src.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            slp.topMargin = px(6);
            box.addView(src, slp);
            View line = new View(app);
            GradientDrawable gold = new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, new int[]{0xFFE8C987, 0x33E8C987});
            gold.setCornerRadius(px(2));
            line.setBackground(gold);
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, px(2));
            llp.topMargin = px(10);
            box.addView(line, llp);

            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            lp.y = px(48);
            try {
                app.getSystemService(WindowManager.class).addView(box, lp);
            } catch (Exception e) {
                return;
            }
            dua = box;
            box.setAlpha(0f);
            box.setTranslationY(px(16));
            box.animate().alpha(1f).translationY(0).setDuration(800).start();
            line.post(() -> {
                line.setPivotX(0);
                line.animate().scaleX(0f).setDuration(DUA_SECS * 1000L).setStartDelay(600).start();
            });
            main.postDelayed(() -> hideDua(1200), 700 + DUA_SECS * 1000L);
        });
    }

    private static void hideDua(int fade) {
        View v = dua;
        if (v == null) return;
        dua = null;
        Runnable gone = () -> {
            try {
                app.getSystemService(WindowManager.class).removeView(v);
            } catch (Exception ignored) {
            }
        };
        if (fade == 0) gone.run();
        else v.animate().alpha(0f).translationY(px(8)).setDuration(fade).withEndAction(gone).start();
    }

    private static void hide(int fade) {
        View v = shown;
        if (v == null) return;
        shown = null;
        Runnable gone = () -> {
            try {
                app.getSystemService(WindowManager.class).removeView(v);
            } catch (Exception ignored) {
            }
        };
        if (fade == 0) gone.run();
        else v.animate().alpha(0f).translationY(px(6)).setDuration(fade).withEndAction(gone).start();
    }

    private static TextView text(String s, float sp, int color) {
        TextView t = new TextView(app);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(font);
        t.setGravity(Gravity.START);
        t.setTextDirection(View.TEXT_DIRECTION_RTL);
        t.setLineSpacing(0, 1.15f);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setMaxLines(3);
        return t;
    }

    private static int px(int dp) {
        return Math.round(dp * app.getResources().getDisplayMetrics().density);
    }

    /** Settings as JSON for the phone page. */
    static String json(Context c) {
        SharedPreferences p = prefs(c);
        return "{\"on\":" + p.getBoolean("on", true) + ",\"every\":" + p.getInt("every", 10)
                + ",\"secs\":" + p.getInt("secs", 5) + ",\"corner\":\"" + p.getString("corner", "br")
                + "\",\"chime\":" + p.getBoolean("chime", true) + ",\"panel\":" + p.getBoolean("panel", true) + "}";
    }
}
