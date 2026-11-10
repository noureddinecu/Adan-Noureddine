package com.gathin.tvhome;

import android.app.Activity;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

/**
 * Today's five prayer times as a row of the home screen's own layout: under the clock header, above the apps, so
 * nothing floats over the clock, the date, the weather or the buttons. Five cards of one width share the row, Fajr
 * on the right through Isha on the left; the next prayer is gold with the time left. The times are the adhan's own
 * (GET /prayer on the Noor app's server on this TV) and the phone's switch (/dhikr panel) shows or hides the row.
 * Not focusable: the remote still goes from the top buttons straight to the apps. Updated once a minute with the
 * greeting (see noor/prayer-row.py).
 */
final class PrayerRow {
    private PrayerRow() {
    }

    private static final String[] NAMES = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};
    private static final int TEXT = 0xF2FFFFFF, DIM = 0x8CFFFFFF, GOLD = 0xFFFFE08A;

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static volatile String[] times;
    private static volatile boolean enabled = true;
    private static volatile long fetchedAt;
    private static volatile boolean fetching;

    private static LinearLayout row;
    private static TextView title;
    private static final LinearLayout[] cards = new LinearLayout[5];
    private static final TextView[] names = new TextView[5], clocks = new TextView[5], lefts = new TextView[5];
    private static int shown = -2;

    /** Called from MainActivity.updateGreeting: on resume and once a minute. */
    static void update(Activity a) {
        LinearLayout box = a.findViewById(R.id.noorPrayers);
        if (box == null) return;
        if (box != row) build(a, box);
        refresh(a);
        fill();
    }

    private static void refresh(Activity a) {
        if (fetching || System.currentTimeMillis() - fetchedAt < 55_000) return;
        fetching = true;
        new Thread(() -> {
            try {
                JSONObject p = new JSONObject(get("http://127.0.0.1:8080/prayer"));
                JSONArray t = p.getJSONArray("times");
                if (t.length() >= 5) {
                    String[] out = new String[5];
                    for (int i = 0; i < 5; i++) out[i] = t.getString(i);
                    times = out;
                }
                enabled = new JSONObject(get("http://127.0.0.1:8080/dhikr")).optBoolean("panel", true);
                fetchedAt = System.currentTimeMillis();
            } catch (Exception ignored) {
                // The Noor app is not up yet: try again next minute, keep what we have.
            } finally {
                fetching = false;
            }
            main.post(PrayerRow::fill);
        }, "noor-prayers").start();
    }

    private static int px(View v, float dp) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, v.getResources().getDisplayMetrics()));
    }

    private static TextView text(LinearLayout box, float sp, int color, Typeface face) {
        TextView t = new TextView(box.getContext());
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(face);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        t.setSingleLine(true);
        t.setShadowLayer(px(box, 3), 0, px(box, 1), 0x80000000);
        return t;
    }

    /** Glass: a deep navy gradient, see-through, with a hairline edge; gold and brighter for the next prayer. */
    private static GradientDrawable glass(View v, boolean next) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                next ? new int[]{0xB8423A1E, 0xA6201A0C} : new int[]{0x99182040, 0x8C0B1124});
        g.setCornerRadius(px(v, 16));
        g.setStroke(px(v, next ? 2 : 1), next ? 0xE6FFD27A : 0x33FFFFFF);
        return g;
    }

    private static void build(Activity a, LinearLayout box) {
        row = box;
        shown = -2;
        box.removeAllViews();
        Typeface modern = Typeface.create("sans-serif-medium", Typeface.NORMAL);
        Typeface bold = Typeface.create("sans-serif", Typeface.BOLD);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0x66101633, 0x4D0A0F22});
        bg.setCornerRadius(px(box, 22));
        bg.setStroke(px(box, 1), 0x26FFE08A);
        box.setBackground(bg);
        box.setPadding(px(box, 14), px(box, 8), px(box, 14), px(box, 10));

        // The launcher lays out left to right (no supportsRtl), so the right-to-left order is built by hand: the
        // title sits on the right, and the cards are added Isha first so that Fajr ends up on the right.
        title = text(box, 12.5f, 0xD9FFE08A, modern);
        title.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.bottomMargin = px(box, 7);
        tlp.rightMargin = px(box, 4);
        box.addView(title, tlp);

        LinearLayout cardRow = new LinearLayout(a);
        cardRow.setOrientation(LinearLayout.HORIZONTAL);
        cardRow.setClipChildren(false);
        for (int k = 4; k >= 0; k--) {
            LinearLayout c = new LinearLayout(a);
            c.setOrientation(LinearLayout.VERTICAL);
            c.setGravity(Gravity.CENTER);
            c.setBackground(glass(box, false));
            c.setPadding(px(box, 6), px(box, 7), px(box, 6), px(box, 7));
            names[k] = text(box, 15, TEXT, modern);
            names[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            clocks[k] = text(box, 26, TEXT, bold);
            clocks[k].setTextDirection(View.TEXT_DIRECTION_LTR);
            lefts[k] = text(box, 12, 0xFFFFD27A, modern);
            lefts[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            gap.topMargin = px(box, 4);
            LinearLayout.LayoutParams gap2 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            gap2.topMargin = px(box, 4);
            c.addView(names[k]);
            c.addView(clocks[k], gap);
            c.addView(lefts[k], gap2);
            // Five equal shares of the row, whatever the screen: the same width and the same gap for every card.
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            if (k < 4) clp.leftMargin = px(box, 12);
            cardRow.addView(c, clp);
            cards[k] = c;
        }
        box.addView(cardRow, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private static void fill() {
        if (row == null) return;
        String[] t = times;
        // Gone until the Noor app has answered with today's times, or while the phone has the row switched off.
        int vis = enabled && t != null ? View.VISIBLE : View.GONE;
        if (row.getVisibility() != vis) row.setVisibility(vis);
        if (vis != View.VISIBLE) return;
        String place = NoorCity.place(row.getContext());
        title.setText(place == null || place.isEmpty() ? "✦  مواقيت الصلاة" : "✦  مواقيت الصلاة  ·  " + place);
        Calendar now = Calendar.getInstance();
        int m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        int[] at = new int[5];
        int next = -1;
        for (int i = 0; i < 5; i++) {
            try {
                String[] hm = t[i].split(":");
                at[i] = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
            } catch (Exception e) {
                at[i] = -1;
            }
            if (next < 0 && at[i] > m) next = i;
        }
        int highlight = next < 0 ? 0 : next; // after Isha the next one is tomorrow's Fajr
        for (int i = 0; i < 5; i++) {
            boolean n = i == highlight;
            boolean past = next >= 0 && i < next;
            names[i].setText(NAMES[i]);
            clocks[i].setText(at[i] < 0 ? "--:--" : t[i]);
            names[i].setTextColor(n ? GOLD : past ? DIM : 0xD9FFFFFF);
            clocks[i].setTextColor(n ? 0xFFFFF3D0 : past ? DIM : TEXT);
            if (n && at[i] >= 0) {
                int mins = at[i] - m;
                if (mins <= 0) mins += 24 * 60;
                lefts[i].setText("◂ بعد " + (mins >= 60 ? (mins / 60) + " س " : "") + (mins % 60) + " د");
            } else {
                lefts[i].setText(" "); // keeps every card the same height
            }
        }
        if (shown != highlight) {
            for (int i = 0; i < 5; i++) cards[i].setBackground(glass(row, i == highlight));
            shown = highlight;
        }
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(1500);
        c.setReadTimeout(2500);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[2048];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
