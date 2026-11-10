package com.gathin.tvhome;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
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
 * nothing floats over the clock, the date, the weather or the buttons. Five glass cards of one width share the row,
 * Fajr on the right through Isha on the left, each with a small line icon, the prayer's name in Amiri and its time in
 * large figures; the next prayer has a softly glowing gold frame and the time left. Up from the dock reaches the
 * cards (a soft glow shows which one), OK opens the prayer-times app. The times are the adhan's own (GET /prayer on
 * the Noor app's server on this TV) and the phone's switch (/dhikr panel) shows or hides the row. Updated once a
 * minute with the greeting (see noor/prayer-row.py).
 */
final class PrayerRow {
    private PrayerRow() {
    }

    private static final String[] NAMES = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};
    private static final int TEXT = 0xF5FFFFFF, SOFT = 0xCCFFFFFF, DIM = 0x80FFFFFF;
    private static final int GOLD = 0xFFF2D48A, GOLD_LIGHT = 0xFFFFF1CF;
    private static final String PRAYER_APP = "com.majnioui.tv.prayer";

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static volatile String[] times;
    private static volatile boolean enabled = true;
    private static volatile long fetchedAt;
    private static volatile boolean fetching;

    private static LinearLayout row;
    private static TextView title;
    private static final LinearLayout[] cards = new LinearLayout[5];
    private static final Glass[] glasses = new Glass[5];
    private static final Icon[] icons = new Icon[5];
    private static final TextView[] names = new TextView[5], clocks = new TextView[5], lefts = new TextView[5];

    /** Called from MainActivity.updateGreeting: on resume and once a minute. */
    static void update(Activity a) {
        LinearLayout box = a.findViewById(R.id.noorPrayers);
        if (box == null) return;
        if (box != row) build(a, box);
        refresh();
        fill();
    }

    private static void refresh() {
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

    private static float dp(Context c, float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    private static int px(Context c, float v) {
        return Math.round(dp(c, v));
    }

    /** Amiri (SIL Open Font License) from the launcher's assets for the Arabic names, if the build could fetch it. */
    private static Typeface amiri(Context c) {
        try {
            return Typeface.createFromAsset(c.getAssets(), "noor-amiri.ttf");
        } catch (Exception e) {
            return Typeface.create("serif", Typeface.BOLD);
        }
    }

    private static TextView text(Context c, float sp, int color, Typeface face) {
        TextView t = new TextView(c);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(face);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        t.setSingleLine(true);
        t.setShadowLayer(dp(c, 4), 0, dp(c, 1.5f), 0x99000000);
        return t;
    }

    private static void build(Activity a, LinearLayout box) {
        row = box;
        box.removeAllViews();
        Typeface arabic = amiri(a);
        Typeface figures = Typeface.create("sans-serif-medium", Typeface.NORMAL);

        // The band: deep navy glass, a faint light along its top edge, a gold hairline.
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x801A2350, 0x660B1230, 0x590A0F24});
        bg.setCornerRadius(dp(a, 26));
        bg.setStroke(px(a, 1), 0x2EF2D48A);
        box.setBackground(bg);
        box.setPadding(px(a, 14), px(a, 8), px(a, 14), px(a, 8));

        // The launcher lays out left to right (no supportsRtl), so the right-to-left order is built by hand: the
        // title sits on the right, and the cards are added Isha first so that Fajr ends up on the right.
        title = text(a, 13.5f, 0xE6F2D48A, arabic);
        title.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        title.setShadowLayer(0, 0, 0, 0);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.bottomMargin = px(a, 2);
        tlp.rightMargin = px(a, 10);
        box.addView(title, tlp);

        LinearLayout cardRow = new LinearLayout(a);
        cardRow.setOrientation(LinearLayout.HORIZONTAL);
        cardRow.setClipChildren(false);
        cardRow.setClipToPadding(false);
        for (int k = 4; k >= 0; k--) {
            final int i = k;
            LinearLayout c = new LinearLayout(a);
            c.setOrientation(LinearLayout.VERTICAL);
            c.setGravity(Gravity.CENTER);
            glasses[k] = new Glass(dp(a, 1));
            c.setBackground(glasses[k]);
            // Blurred shadow and glow are drawn in software; five small cards, redrawn once a minute or on focus.
            c.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            int in = Math.round(Glass.INSET * dp(a, 1));
            c.setPadding(in + px(a, 6), in + px(a, 4), in + px(a, 6), in + px(a, 5));

            names[k] = text(a, 16, SOFT, arabic);
            names[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            icons[k] = new Icon(k, dp(a, 1));
            int s = px(a, 15);
            icons[k].setBounds(0, 0, s, s);
            names[k].setCompoundDrawables(null, null, icons[k], null); // right of the name, where Arabic starts
            names[k].setCompoundDrawablePadding(px(a, 6));
            clocks[k] = text(a, 30, TEXT, figures);
            clocks[k].setTextDirection(View.TEXT_DIRECTION_LTR);
            clocks[k].setLetterSpacing(0.02f);
            lefts[k] = text(a, 12.5f, GOLD, figures);
            lefts[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            LinearLayout.LayoutParams g1 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            g1.topMargin = px(a, 0); // Amiri already leaves room under its letters
            LinearLayout.LayoutParams g2 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            g2.topMargin = px(a, 3);
            c.addView(names[k]);
            c.addView(clocks[k], g1);
            c.addView(lefts[k], g2);

            // The remote: up from the dock lands here; a soft glow and a slight lift show the card, OK opens the
            // prayer-times app. Down goes back to the apps, up to the top buttons, as the focus search finds them.
            c.setFocusable(true);
            c.setClickable(true);
            c.setOnFocusChangeListener((v, has) -> {
                glasses[i].setFocused(has);
                v.animate().scaleX(has ? 1.045f : 1f).scaleY(has ? 1.045f : 1f).setDuration(180)
                        .setInterpolator(new DecelerateInterpolator()).start();
            });
            c.setOnClickListener(v -> openPrayerApp(a));

            // Five equal shares of the row, whatever the screen: the same width and the same gap for every card.
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            if (k < 4) clp.leftMargin = px(a, 6); // plus the cards' own glow room, about 14dp between faces
            cardRow.addView(c, clp);
            cards[k] = c;
        }
        box.addView(cardRow, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private static void openPrayerApp(Activity a) {
        try {
            Intent i = a.getPackageManager().getLeanbackLaunchIntentForPackage(PRAYER_APP);
            if (i == null) i = a.getPackageManager().getLaunchIntentForPackage(PRAYER_APP);
            if (i != null) a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
        }
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
            names[i].setTextColor(n ? GOLD : past ? DIM : SOFT);
            clocks[i].setTextColor(n ? GOLD_LIGHT : past ? DIM : TEXT);
            icons[i].setColor(n ? GOLD : past ? 0x66FFFFFF : 0xB3FFFFFF);
            glasses[i].setNext(n);
            if (n && at[i] >= 0) {
                int mins = at[i] - m;
                if (mins <= 0) mins += 24 * 60;
                lefts[i].setText("بعد " + (mins >= 60 ? (mins / 60) + " س " : "") + (mins % 60) + " د");
            } else {
                lefts[i].setText(" "); // keeps every card the same height
            }
        }
    }

    /**
     * A card of glass: a soft shadow under it, a navy body with a faint sheen on its upper part and a hairline edge;
     * the next prayer gets a warm body, a gold edge and a light gold glow; the card under the remote a soft white-gold
     * glow. Drawn inside INSET dp so the shadow and the glow never leave the card's own bounds.
     */
    static final class Glass extends Drawable {
        static final float INSET = 6;
        private final float d;
        private boolean next, focused;
        private final Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG), glow = new Paint(Paint.ANTI_ALIAS_FLAG),
                body = new Paint(Paint.ANTI_ALIAS_FLAG), sheen = new Paint(Paint.ANTI_ALIAS_FLAG),
                edge = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF(), s = new RectF();

        Glass(float density) {
            d = density;
            shadow.setColor(0x80000000);
            shadow.setMaskFilter(new BlurMaskFilter(5 * d, BlurMaskFilter.Blur.NORMAL));
            edge.setStyle(Paint.Style.STROKE);
        }

        void setNext(boolean v) {
            if (next != v) {
                next = v;
                invalidateSelf();
            }
        }

        void setFocused(boolean v) {
            if (focused != v) {
                focused = v;
                invalidateSelf();
            }
        }

        @Override
        public void draw(Canvas c) {
            r.set(getBounds());
            r.inset(INSET * d, INSET * d);
            float rad = 18 * d;
            s.set(r);
            s.offset(0, 2.5f * d);
            c.drawRoundRect(s, rad, rad, shadow);
            if (next || focused) {
                glow.setColor(focused ? 0x8CFFEFC2 : 0x59F2C46A);
                glow.setMaskFilter(new BlurMaskFilter((focused ? 7 : 5) * d, BlurMaskFilter.Blur.OUTER));
                c.drawRoundRect(r, rad, rad, glow);
            }
            body.setShader(new LinearGradient(0, r.top, 0, r.bottom,
                    next ? 0xC2463B1C : focused ? 0xB3243262 : 0xA61B2552,
                    next ? 0xB31C160A : focused ? 0xA6121A3C : 0x99080E2A, Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, body);
            sheen.setShader(new LinearGradient(0, r.top, 0, r.top + r.height() * 0.5f,
                    next ? 0x26FFE9B0 : 0x1FFFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, sheen);
            if (next) {
                edge.setStrokeWidth(1.6f * d);
                edge.setShader(new LinearGradient(0, r.top, 0, r.bottom, 0xFFFFE7A8, 0xB3B8913F, Shader.TileMode.CLAMP));
            } else {
                edge.setStrokeWidth((focused ? 1.4f : 1f) * d);
                edge.setShader(null);
                edge.setColor(focused ? 0xB3FFF1CF : 0x2EFFFFFF);
            }
            float h = edge.getStrokeWidth() / 2;
            s.set(r);
            s.inset(h, h);
            c.drawRoundRect(s, rad - h, rad - h, edge);
        }

        @Override
        public void setAlpha(int alpha) {
        }

        @Override
        public void setColorFilter(ColorFilter cf) {
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    /**
     * Small line icons, one per prayer: dawn (the sun coming up over the horizon), noon (the full sun), afternoon
     * (the sun lower, half lit), sunset (the sun going down) and night (a crescent and a star).
     */
    static final class Icon extends Drawable {
        private final int kind;
        private final float d;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), f = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final RectF o = new RectF();

        Icon(int kind, float density) {
            this.kind = kind;
            d = density;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(1.4f * d);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            f.setStyle(Paint.Style.FILL);
        }

        void setColor(int c) {
            if (p.getColor() != c) {
                p.setColor(c);
                f.setColor(c);
                invalidateSelf();
            }
        }

        @Override
        public void draw(Canvas c) {
            float w = getBounds().width(), x0 = getBounds().left, y0 = getBounds().top;
            float cx = x0 + w / 2, cy = y0 + w / 2;
            switch (kind) {
                case 0: // Fajr: the sun rising over the horizon, an arrow up
                case 3: { // Maghrib: the sun setting, an arrow down
                    float hy = y0 + w * 0.78f, r = w * 0.26f;
                    c.drawLine(x0 + w * 0.06f, hy, x0 + w * 0.94f, hy, p);
                    o.set(cx - r, hy - r, cx + r, hy + r);
                    c.drawArc(o, 180, 180, false, p);
                    float ay = y0 + w * 0.12f, by = y0 + w * 0.34f;
                    boolean up = kind == 0;
                    c.drawLine(cx, ay, cx, by, p);
                    float tip = up ? ay : by, dir = up ? 1 : -1;
                    c.drawLine(cx, tip, cx - w * 0.09f, tip + dir * w * 0.09f, p);
                    c.drawLine(cx, tip, cx + w * 0.09f, tip + dir * w * 0.09f, p);
                    break;
                }
                case 1: { // Dhuhr: the full sun with eight rays
                    float r = w * 0.2f;
                    c.drawCircle(cx, cy, r, p);
                    for (int i = 0; i < 8; i++) {
                        double a = Math.PI / 4 * i;
                        float c1 = (float) Math.cos(a), s1 = (float) Math.sin(a);
                        c.drawLine(cx + c1 * w * 0.33f, cy + s1 * w * 0.33f, cx + c1 * w * 0.45f, cy + s1 * w * 0.45f, p);
                    }
                    break;
                }
                case 2: { // Asr: the sun past its height, its lower half lit, four short rays above
                    float r = w * 0.24f, sy = cy + w * 0.08f;
                    c.drawCircle(cx, sy, r, p);
                    o.set(cx - r, sy - r, cx + r, sy + r);
                    c.drawArc(o, 0, 180, true, f);
                    for (int i = 0; i < 5; i++) {
                        double a = Math.PI + Math.PI / 4 * i;
                        float c1 = (float) Math.cos(a), s1 = (float) Math.sin(a);
                        c.drawLine(cx + c1 * w * 0.36f, sy + s1 * w * 0.36f, cx + c1 * w * 0.47f, sy + s1 * w * 0.47f, p);
                    }
                    break;
                }
                default: { // Isha: a crescent and a small star
                    float r = w * 0.34f, mx = x0 + w * 0.42f, my = y0 + w * 0.56f;
                    path.reset();
                    o.set(mx - r, my - r, mx + r, my + r);
                    path.addCircle(mx, my, r, Path.Direction.CW);
                    Path cut = new Path();
                    cut.addCircle(mx + r * 0.55f, my - r * 0.35f, r * 0.85f, Path.Direction.CW);
                    path.op(cut, Path.Op.DIFFERENCE);
                    c.drawPath(path, f);
                    float sx = x0 + w * 0.8f, sy = y0 + w * 0.2f, sr = w * 0.12f;
                    c.drawLine(sx - sr, sy, sx + sr, sy, p);
                    c.drawLine(sx, sy - sr, sx, sy + sr, p);
                    break;
                }
            }
        }

        @Override
        public void setAlpha(int alpha) {
        }

        @Override
        public void setColorFilter(ColorFilter cf) {
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }

        @Override
        public int getIntrinsicWidth() {
            return Math.round(15 * d);
        }

        @Override
        public int getIntrinsicHeight() {
            return Math.round(15 * d);
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
