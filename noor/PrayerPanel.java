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
 * Today's five prayer times on the home screen, always in view: a small glass panel in the top corner that shows
 * while the home screen is in front and steps aside the moment an app, a channel or HDMI opens. The next prayer is
 * in gold with the time left. Started by MessageServer; switched on and off from the phone (/dhikr panel=1|0).
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
    private static TextView left;
    private static String[] today;
    private static int todayDay = -1;
    private static String lastTop;
    private static long lastQuery;
    private static Typeface font;
    private static final Runnable tick = PrayerPanel::tick;

    static void start(Context c) {
        app = c.getApplicationContext();
        try {
            font = Typeface.createFromAsset(app.getAssets(), "amiri.ttf");
        } catch (Exception e) {
            font = Typeface.DEFAULT_BOLD;
        }
        main.removeCallbacks(tick);
        main.postDelayed(tick, 3000);
    }

    private static boolean on() {
        return Dhikr.prefs(app).getBoolean("panel", true);
    }

    private static void tick() {
        main.postDelayed(tick, 1500);
        boolean show = on() && Settings.canDrawOverlays(app) && app.getSystemService(PowerManager.class).isInteractive() && homeInFront();
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

    private static int px(float dp) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, app.getResources().getDisplayMetrics()));
    }

    private static TextView text(float sp, int color) {
        TextView t = new TextView(app);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(font);
        t.setShadowLayer(px(4), 0, px(1), 0x99000000);
        return t;
    }

    private static void build() {
        panel = new LinearLayout(app);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        panel.setPadding(px(16), px(10), px(16), px(10));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0x8C101428, 0x73081A14});
        bg.setCornerRadius(px(18));
        bg.setStroke(px(1), 0x33FFE08A);
        panel.setBackground(bg);
        title = text(11, 0xB3FFE08A);
        title.setLetterSpacing(0.05f);
        panel.addView(title);
        for (int i = 0; i < 5; i++) {
            LinearLayout row = new LinearLayout(app);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            row.setPadding(0, px(2), 0, px(2));
            names[i] = text(15, 0xE6FFFFFF);
            times[i] = text(15, 0xE6FFFFFF);
            times[i].setTextDirection(View.TEXT_DIRECTION_LTR);
            row.addView(names[i], new LinearLayout.LayoutParams(px(78), LinearLayout.LayoutParams.WRAP_CONTENT));
            row.addView(times[i]);
            panel.addView(row);
        }
        left = text(11.5f, GOLD);
        panel.addView(left);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.RIGHT;
        lp.x = px(28);
        lp.y = px(96); // under the header's buttons, clear of the dock at the bottom
        try {
            app.getSystemService(WindowManager.class).addView(panel, lp);
        } catch (Exception e) {
            panel = null;
            return;
        }
        panel.setAlpha(0f);
        panel.animate().alpha(1f).setDuration(500).start();
    }

    private static void fill() {
        if (panel == null) return;
        String place = NoorCity.place(app);
        title.setText(place == null || place.isEmpty() ? "✦ مواقيت الصلاة" : "✦ مواقيت الصلاة · " + place);
        if (today == null) {
            for (int i = 0; i < 5; i++) {
                names[i].setText(NAMES[i]);
                times[i].setText("--:--");
            }
            left.setText("");
            return;
        }
        Calendar now = Calendar.getInstance();
        int m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        int next = -1;
        for (int i = 0; i < 5; i++) {
            String[] hm = today[i].split(":");
            int t = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
            if (next < 0 && t > m) next = i;
        }
        for (int i = 0; i < 5; i++) {
            boolean n = i == next;
            names[i].setText((n ? "◂ " : "") + NAMES[i]);
            times[i].setText(today[i]);
            int col = n ? GOLD : (next >= 0 && i < next) || next < 0 ? 0x80FFFFFF : 0xE6FFFFFF;
            names[i].setTextColor(col);
            times[i].setTextColor(col);
        }
        if (next >= 0) {
            String[] hm = today[next].split(":");
            int mins = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]) - m;
            left.setText("بعد " + (mins >= 60 ? (mins / 60) + " س " : "") + (mins % 60) + " د");
        } else {
            left.setText("");
        }
    }

    private static void hide() {
        if (panel == null) return;
        View v = panel;
        panel = null;
        try {
            app.getSystemService(WindowManager.class).removeView(v);
        } catch (Exception ignored) {
        }
    }
}
