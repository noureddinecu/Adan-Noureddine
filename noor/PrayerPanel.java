package app.noortv;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Calendar;

/**
 * Today's five prayer times on the home screen, always in view: one row of five glass cards in the top right, Fajr
 * on the right through Isha on the left, each with the prayer's name and its time in large figures. The next prayer
 * glows gold, slightly larger, with the time left. Shows while the home screen is in front and steps aside the
 * moment an app, a channel or HDMI opens. Started by MessageServer; switched on and off from the phone (/dhikr panel=1|0).
 * A home that draws the times in its own layout (PrayerRow, noor/prayer-row.py) gets no floating panel on top.
 */
final class PrayerPanel {
    private PrayerPanel() {
    }

    private static final String[] NAMES = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};
    private static final String[] HOMES = {"app.noortv.home", "com.gathin.tvhome"};
    private static final int GOLD = 0xFFFFE08A;

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static Context app;
    private static LinearLayout panel;
    private static TextView title;
    private static final TextView[] names = new TextView[5], times = new TextView[5];
    private static String[] today;
    private static int todayDay = -1;
    private static String lastTop;
    private static long lastQuery;
    private static final Runnable tick = PrayerPanel::tick;

    static void start(Context c) {
        app = c.getApplicationContext();
        main.removeCallbacks(tick);
        main.postDelayed(tick, 3000);
    }

    private static boolean on() {
        return Dhikr.prefs(app).getBoolean("panel", true);
    }

    private static void tick() {
        main.postDelayed(tick, 1500);
        boolean show = on() && Settings.canDrawOverlays(app) && app.getSystemService(PowerManager.class).isInteractive() && homeInFront()
                && !drawsOwnRow(lastTop);
        if (!show) {
            hide();
            return;
        }
        int day = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        if (today == null || todayDay != day) {
            todayDay = day;
            new Thread(() -> {
                String[] t = Adhan.times(app, Calendar.getInstance());
                if (t != null) main.post(() -> {
                    today = t;
                    fill();
                });
            }, "noor-panel").start();
        }
        if (panel == null) build();
        fill();
    }

    /** Whether the home screen is the app in front, from the last few seconds of usage events. */
    private static boolean homeInFront() {
        long now = System.currentTimeMillis();
        try {
            UsageStatsManager usm = app.getSystemService(UsageStatsManager.class);
            UsageEvents ev = usm.queryEvents(lastQuery == 0 ? now - 24 * 3600_000L : lastQuery - 2000, now);
            UsageEvents.Event e = new UsageEvents.Event();
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e);
                if (e.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) lastTop = e.getPackageName();
            }
            lastQuery = now;
        } catch (Exception ignored) {
        }
        if (lastTop == null) return false;
        for (String h : HOMES) if (h.equals(lastTop)) return true;
        return false;
    }

    private static String rowChecked;
    private static boolean rowOwn;

    /** A home built with noor/prayer-row.py shows the times in its own layout: this panel then stays out of its way. */
    private static boolean drawsOwnRow(String pkg) {
        if (pkg == null) return false;
        if (!pkg.equals(rowChecked)) {
            rowChecked = pkg;
            try {
                android.os.Bundle md = app.getPackageManager().getApplicationInfo(pkg, android.content.pm.PackageManager.GET_META_DATA).metaData;
                rowOwn = md != null && md.getBoolean("app.noortv.prayerRow", false);
            } catch (Exception e) {
                rowOwn = false;
            }
        }
        return rowOwn;
    }

    private static int px(float dp) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, app.getResources().getDisplayMetrics()));
    }

    // Sizes for a 16:9 TV read from the sofa: five cards of one size in one row, right to left in prayer order.
    private static final int CARD_W = 98, CARD_H = 96, GAP = 10;
    private static final int TEXT = 0xF2FFFFFF, DIM = 0x8CFFFFFF;
    private static final LinearLayout[] cards = new LinearLayout[5];
    private static final TextView[] lefts = new TextView[5];

    private static TextView text(float sp, int color, Typeface face) {
        TextView t = new TextView(app);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(face);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        t.setMaxLines(1);
        t.setShadowLayer(px(3), 0, px(1), 0x80000000);
        return t;
    }

    /** Glass: a deep navy gradient, see-through, with a hairline edge; gold and brighter for the next prayer. */
    private static GradientDrawable glass(boolean next) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                next ? new int[]{0xB8423A1E, 0xA6201A0C} : new int[]{0x99182040, 0x8C0B1124});
        g.setCornerRadius(px(18));
        g.setStroke(px(next ? 2 : 1), next ? 0xE6FFD27A : 0x33FFFFFF);
        return g;
    }

    private static void build() {
        Typeface modern = Typeface.create("sans-serif-medium", Typeface.NORMAL);
        Typeface bold = Typeface.create("sans-serif", Typeface.BOLD);
        panel = new LinearLayout(app);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        panel.setPadding(px(14), px(10), px(14), px(12));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0x66101633, 0x4D0A0F22});
        bg.setCornerRadius(px(24));
        bg.setStroke(px(1), 0x26FFE08A);
        panel.setBackground(bg);

        title = text(12.5f, 0xD9FFE08A, modern);
        title.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.bottomMargin = px(8);
        tlp.setMarginStart(px(4));
        panel.addView(title, tlp);

        LinearLayout row = new LinearLayout(app);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL); // the first child, Fajr, is on the right
        row.setPadding(px(4), px(4), px(4), px(4)); // room for the next card's 1.06 scale, so it is never clipped
        row.setClipChildren(false);
        panel.setClipChildren(false);
        for (int i = 0; i < 5; i++) {
            LinearLayout c = new LinearLayout(app);
            c.setOrientation(LinearLayout.VERTICAL);
            c.setGravity(Gravity.CENTER);
            c.setBackground(glass(false));
            c.setPadding(px(6), px(8), px(6), px(8));
            names[i] = text(15, TEXT, modern);
            names[i].setTextDirection(View.TEXT_DIRECTION_RTL);
            times[i] = text(25, TEXT, bold);
            times[i].setTextDirection(View.TEXT_DIRECTION_LTR);
            lefts[i] = text(11.5f, 0xFFFFD27A, modern);
            lefts[i].setTextDirection(View.TEXT_DIRECTION_RTL);
            LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            gap.topMargin = px(4);
            c.addView(names[i]);
            c.addView(times[i], gap);
            c.addView(lefts[i], gap);
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(px(CARD_W), px(CARD_H));
            if (i > 0) clp.setMarginStart(px(GAP));
            row.addView(c, clp);
            cards[i] = c;
        }
        panel.addView(row);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        // Top right, under the header's buttons: clear of the clock block on the left and of the dock below.
        lp.gravity = Gravity.TOP | Gravity.RIGHT;
        lp.x = px(28);
        lp.y = px(92);
        try {
            app.getSystemService(WindowManager.class).addView(panel, lp);
        } catch (Exception e) {
            panel = null;
            return;
        }
        panel.setAlpha(0f);
        panel.setTranslationY(-px(8));
        panel.animate().alpha(1f).translationY(0).setDuration(500).start();
    }

    private static int shown = -2;

    private static void fill() {
        if (panel == null) return;
        String place = NoorCity.place(app);
        title.setText(place == null || place.isEmpty() ? "✦  مواقيت الصلاة" : "✦  مواقيت الصلاة  ·  " + place);
        if (today == null) {
            for (int i = 0; i < 5; i++) {
                names[i].setText(NAMES[i]);
                times[i].setText("--:--");
                lefts[i].setText(" ");
            }
            return;
        }
        Calendar now = Calendar.getInstance();
        int m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        int next = -1;
        for (int i = 0; i < 5; i++) {
            String[] hm = today[i].split(":");
            if (next < 0 && Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]) > m) next = i;
        }
        // After Isha the next one is tomorrow's Fajr.
        int highlight = next < 0 ? 0 : next;
        for (int i = 0; i < 5; i++) {
            boolean n = i == highlight;
            boolean past = next >= 0 && i < next;
            names[i].setText(NAMES[i]);
            times[i].setText(today[i]);
            names[i].setTextColor(n ? 0xFFFFE08A : past ? DIM : 0xD9FFFFFF);
            times[i].setTextColor(n ? 0xFFFFF3D0 : past ? DIM : TEXT);
            if (n) {
                String[] hm = today[i].split(":");
                int mins = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]) - m;
                if (mins <= 0) mins += 24 * 60;
                lefts[i].setText("◂ بعد " + (mins >= 60 ? (mins / 60) + " س " : "") + (mins % 60) + " د");
            } else {
                lefts[i].setText(" ");
            }
        }
        if (shown != highlight) {
            for (int i = 0; i < 5; i++) {
                cards[i].setBackground(glass(i == highlight));
                cards[i].animate().scaleX(i == highlight ? 1.06f : 1f).scaleY(i == highlight ? 1.06f : 1f).setDuration(400).start();
            }
            shown = highlight;
        }
    }

    private static void hide() {
        if (panel == null) return;
        View v = panel;
        panel = null;
        shown = -2;
        try {
            app.getSystemService(WindowManager.class).removeView(v);
        } catch (Exception ignored) {
        }
    }
}
