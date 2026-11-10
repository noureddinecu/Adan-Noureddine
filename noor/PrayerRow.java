package com.gathin.tvhome;

import android.animation.ArgbEvaluator;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
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
import java.util.Locale;

/**
 * Today's five prayer times as a row of the home screen's own layout: under the clock header, above the apps, so
 * nothing floats over the clock, the date, the weather or the buttons. Five glass cards of one width share the row,
 * Fajr on the right through Isha on the left, each with a small line icon, the prayer's name in Amiri and its time.
 * Each card shows where the day is: prayers already past are muted, the current one (whose time has come and the
 * next has not) is royal blue with «الآن», the next one has a matte-gold frame, a second-by-second countdown and a
 * thin gold bar that fills from the current prayer to it; the rest are plain glass. When the next prayer changes the
 * cards fade to their new look. Up from the dock reaches the cards (a soft glow and a sweep of light show which
 * one), OK opens the prayer-times app. The times are the adhan's own (GET /prayer on the Noor app's server on this
 * TV) and the phone's switch (/dhikr panel) shows or hides the row. Updated once a minute with the greeting, and
 * every second for the countdown while Home is in front (see noor/prayer-row.py).
 */
final class PrayerRow {
    private PrayerRow() {
    }

    private static final String[] NAMES = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};
    private static final String PRAYER_APP = "com.majnioui.tv.prayer";

    // The four looks of a card: upcoming, past, current, next. Royal blue glass and matte gold.
    static final int UPCOMING = 0, PAST = 1, CURRENT = 2, NEXT = 3;
    private static final int[] NAME_C = {0xD9FFFFFF, 0x6BFFFFFF, 0xFFCFDCFF, 0xFFD9B66A};
    private static final int[] TIME_C = {0xF2FFFFFF, 0x6BFFFFFF, 0xFFFFFFFF, 0xFFF3E3B8};
    private static final int[] ICON_C = {0xB3FFFFFF, 0x4DFFFFFF, 0xFFA9C2FF, 0xFFD9B66A};
    private static final int MATTE_GOLD = 0xFFD9B66A, SKY = 0xFFA9C2FF;

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
    private static final int[] state = {-1, -1, -1, -1, -1};
    private static int[] at; // minutes after midnight, -1 where a time could not be read
    private static int next = -1, highlight = -1, current = -1, lastMinute = -1;
    private static boolean ticking;

    /** Called from MainActivity.updateGreeting: on resume and once a minute. */
    static void update(Activity a) {
        LinearLayout box = a.findViewById(R.id.noorPrayers);
        if (box == null) return;
        if (box != row) build(a, box);
        refresh();
        fill();
        startTicker();
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

    /** The countdown and the bar, once a second on the second, only while the row is on screen. */
    private static final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (row == null || row.getVisibility() != View.VISIBLE || row.getWindowVisibility() != View.VISIBLE) {
                ticking = false; // Home went to the background: update() starts it again on return
                return;
            }
            Calendar now = Calendar.getInstance();
            int minute = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            if (minute != lastMinute) fill(); // a prayer's time may have come: new looks
            else countdown(now);
            main.postDelayed(this, 1000 - now.get(Calendar.MILLISECOND) + 5);
        }
    };

    private static void startTicker() {
        if (ticking) return;
        ticking = true;
        main.post(tick);
    }

    private static float dp(Context c, float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    private static int px(Context c, float v) {
        return Math.round(dp(c, v));
    }

    /** Amiri (SIL Open Font License) from the launcher's assets for the Arabic, if the build could fetch it. */
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
        for (int i = 0; i < 5; i++) state[i] = -1;
        box.removeAllViews();
        Typeface arabic = amiri(a);
        Typeface figures = Typeface.create("sans-serif-medium", Typeface.NORMAL);

        // The band: royal blue glass, a faint light along its top edge, a matte-gold hairline.
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x801A2A66, 0x660D1A4A, 0x590A1238});
        bg.setCornerRadius(dp(a, 26));
        bg.setStroke(px(a, 1), 0x33D9B66A);
        box.setBackground(bg);
        box.setPadding(px(a, 14), px(a, 8), px(a, 14), px(a, 8));

        // The launcher lays out left to right (no supportsRtl), so the right-to-left order is built by hand: the
        // title sits on the right, and the cards are added Isha first so that Fajr ends up on the right.
        title = text(a, 13.5f, 0xE6D9B66A, arabic);
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
            // Blurred shadow and glow are drawn in software; five small cards, redrawn once a second at most.
            c.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            int in = Math.round(Glass.INSET * dp(a, 1));
            // The bottom keeps room for the next prayer's progress bar, drawn by the card's glass.
            c.setPadding(in + px(a, 6), in + px(a, 4), in + px(a, 6), in + px(a, 9));

            names[k] = text(a, 16.5f, NAME_C[UPCOMING], arabic);
            names[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            icons[k] = new Icon(k, dp(a, 1));
            int s = px(a, 15);
            icons[k].setBounds(0, 0, s, s);
            names[k].setCompoundDrawables(null, null, icons[k], null); // right of the name, where Arabic starts
            names[k].setCompoundDrawablePadding(px(a, 6));
            clocks[k] = text(a, 31, TIME_C[UPCOMING], figures);
            clocks[k].setTextDirection(View.TEXT_DIRECTION_LTR);
            clocks[k].setLetterSpacing(0.03f);
            clocks[k].setFontFeatureSettings("tnum");
            lefts[k] = text(a, 13, MATTE_GOLD, figures);
            lefts[k].setTextDirection(View.TEXT_DIRECTION_RTL);
            lefts[k].setFontFeatureSettings("tnum"); // the countdown's figures keep their width as they change
            LinearLayout.LayoutParams g1 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            g1.topMargin = 0; // Amiri already leaves room under its letters
            LinearLayout.LayoutParams g2 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            g2.topMargin = px(a, 3);
            c.addView(names[k]);
            c.addView(clocks[k], g1);
            c.addView(lefts[k], g2);

            // The remote: up from the dock lands here; a soft glow, a sweep of light and a slight lift show the card,
            // OK opens the prayer-times app. Down goes back to the apps, up to the top buttons, as focus search finds.
            c.setFocusable(true);
            c.setClickable(true);
            c.setOnFocusChangeListener((v, has) -> {
                glasses[i].setFocused(has);
                v.animate().scaleX(has ? 1.045f : 1f).scaleY(has ? 1.045f : 1f).setDuration(200)
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
        lastMinute = m;
        int[] mins = new int[5];
        next = -1;
        for (int i = 0; i < 5; i++) {
            try {
                String[] hm = t[i].split(":");
                mins[i] = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
            } catch (Exception e) {
                mins[i] = -1;
            }
            if (next < 0 && mins[i] > m) next = i;
        }
        at = mins;
        // After Isha the next one is tomorrow's Fajr and Isha is still the current one; before Fajr, last night's
        // Isha is current, which today's cards do not show.
        highlight = next < 0 ? 0 : next;
        current = next < 0 ? 4 : next - 1;
        for (int i = 0; i < 5; i++) {
            int s = i == highlight ? NEXT : i == current ? CURRENT
                    : (next < 0 ? i < 4 : i < current) ? PAST : UPCOMING;
            names[i].setText(NAMES[i]);
            clocks[i].setText(mins[i] < 0 ? "--:--" : t[i]);
            setState(i, s);
        }
        countdown(now);
    }

    /** Moves card i to look s: a soft fade when it changes on screen, at once the first time. */
    private static void setState(int i, int s) {
        int old = state[i];
        if (old == s) return;
        state[i] = s;
        boolean animate = old >= 0 && row.isShown();
        glasses[i].setState(s, animate);
        icons[i].setColor(ICON_C[s]);
        fade(names[i], NAME_C[s], animate);
        fade(clocks[i], TIME_C[s], animate);
        lefts[i].setTextColor(s == CURRENT ? SKY : MATTE_GOLD);
        if (s != NEXT && s != CURRENT) lefts[i].setText(" "); // keeps every card the same height
        if (s == CURRENT) lefts[i].setText("الآن");
        if (animate && s == NEXT) {
            lefts[i].setAlpha(0f);
            lefts[i].animate().alpha(1f).setDuration(700).start();
        }
    }

    private static void fade(TextView v, int to, boolean animate) {
        if (!animate) {
            v.setTextColor(to);
            return;
        }
        ObjectAnimator o = ObjectAnimator.ofInt(v, "textColor", v.getCurrentTextColor(), to);
        o.setEvaluator(new ArgbEvaluator());
        o.setDuration(700);
        o.start();
    }

    /** The next prayer's countdown to the second, and how far the time has run from the current prayer to it. */
    private static void countdown(Calendar now) {
        int[] mins = at;
        if (row == null || mins == null || highlight < 0 || mins[highlight] < 0) return;
        int sec = (now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)) * 60 + now.get(Calendar.SECOND);
        int target = mins[highlight] * 60;
        if (target <= sec) target += 24 * 3600; // tomorrow's Fajr
        int left = target - sec;
        int h = left / 3600, mm = left / 60 % 60, ss = left % 60;
        lefts[highlight].setText("بعد  " + (h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, mm, ss)
                : String.format(Locale.US, "%02d:%02d", mm, ss)));
        // From the current prayer (last night's Isha before Fajr, taken as today's) to the next one.
        int from;
        if (current >= 0 && mins[current] >= 0) from = mins[current] * 60;
        else from = mins[4] >= 0 ? mins[4] * 60 - 24 * 3600 : target - 6 * 3600;
        if (from > sec) from -= 24 * 3600;
        float span = Math.max(60, target - from);
        glasses[highlight].setProgress(Math.max(0f, Math.min(1f, (sec - from) / span)));
    }

    /**
     * A card of glass: a soft shadow under it, a royal blue body with a faint sheen on its upper part and a hairline
     * edge, in one of four looks (upcoming, past, current, next) that it fades between. The next prayer has a matte
     * gold frame with a light glow and, along its foot, a thin gold bar of the time gone by. The card under the
     * remote glows softly and a band of light sweeps once across it. Drawn inside INSET dp, so the shadow and the
     * glow never leave the card's own bounds.
     */
    static final class Glass extends Drawable {
        static final float INSET = 6;
        //                                       upcoming     past        current     next
        private static final int[] TOP =        {0xA61D2D70, 0x6614204A, 0xB82A4CA8, 0xC23D3320};
        private static final int[] BOTTOM =     {0x990B1650, 0x59080F30, 0xA6122A6E, 0xB31A140A};
        private static final int[] EDGE =       {0x33FFFFFF, 0x1AFFFFFF, 0x8CA9C2FF, 0xFFD9B66A};
        private static final int[] GLOW =       {0x00000000, 0x00000000, 0x40A9C2FF, 0x66D9B66A};
        private static final int[] SHEEN =      {0x1FFFFFFF, 0x0DFFFFFF, 0x29FFFFFF, 0x24FFE9B0};
        private static final ArgbEvaluator ARGB = new ArgbEvaluator();

        private final float d;
        private int from = UPCOMING, to = UPCOMING;
        private float mix = 1f, progress = -1f, sweep = -1f;
        private boolean focused;
        private ValueAnimator stateAnim, sweepAnim;
        private final Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG), glow = new Paint(Paint.ANTI_ALIAS_FLAG),
                body = new Paint(Paint.ANTI_ALIAS_FLAG), sheen = new Paint(Paint.ANTI_ALIAS_FLAG),
                edge = new Paint(Paint.ANTI_ALIAS_FLAG), bar = new Paint(Paint.ANTI_ALIAS_FLAG),
                light = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF(), s = new RectF();
        private final Path clip = new Path();

        Glass(float density) {
            d = density;
            shadow.setColor(0x80000000);
            shadow.setMaskFilter(new BlurMaskFilter(5 * d, BlurMaskFilter.Blur.NORMAL));
            edge.setStyle(Paint.Style.STROKE);
        }

        void setState(int s, boolean animate) {
            if (stateAnim != null) stateAnim.cancel();
            from = mix >= 1f ? to : from;
            to = s;
            if (s != NEXT) progress = -1f;
            if (!animate) {
                mix = 1f;
                invalidateSelf();
                return;
            }
            mix = 0f;
            stateAnim = ValueAnimator.ofFloat(0f, 1f).setDuration(800);
            stateAnim.setInterpolator(new DecelerateInterpolator());
            stateAnim.addUpdateListener(v -> {
                mix = (float) v.getAnimatedValue();
                invalidateSelf();
            });
            stateAnim.start();
        }

        void setProgress(float p) {
            if (Math.abs(p - progress) > 0.0005f) {
                progress = p;
                invalidateSelf();
            }
        }

        void setFocused(boolean v) {
            if (focused == v) return;
            focused = v;
            if (sweepAnim != null) sweepAnim.cancel();
            sweep = -1f;
            if (v) {
                sweepAnim = ValueAnimator.ofFloat(0f, 1f).setDuration(900);
                sweepAnim.setInterpolator(new DecelerateInterpolator());
                sweepAnim.addUpdateListener(a -> {
                    sweep = (float) a.getAnimatedValue();
                    invalidateSelf();
                });
                sweepAnim.start();
            }
            invalidateSelf();
        }

        private int col(int[] set) {
            return (int) ARGB.evaluate(mix, set[from], set[to]);
        }

        @Override
        public void draw(Canvas c) {
            r.set(getBounds());
            r.inset(INSET * d, INSET * d);
            float rad = 18 * d;
            s.set(r);
            s.offset(0, 2.5f * d);
            c.drawRoundRect(s, rad, rad, shadow);
            int g = focused ? 0x8CFFEFC2 : col(GLOW);
            if ((g >>> 24) > 4) {
                glow.setColor(g);
                glow.setMaskFilter(new BlurMaskFilter((focused ? 7 : 5) * d, BlurMaskFilter.Blur.OUTER));
                c.drawRoundRect(r, rad, rad, glow);
            }
            int top = col(TOP), bottom = col(BOTTOM);
            if (focused) { // a touch more light in the glass under the remote
                top = (int) ARGB.evaluate(0.18f, top, 0xCC3A5AB8);
                bottom = (int) ARGB.evaluate(0.12f, bottom, 0xB31E3478);
            }
            body.setShader(new LinearGradient(0, r.top, 0, r.bottom, top, bottom, Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, body);
            sheen.setShader(new LinearGradient(0, r.top, 0, r.top + r.height() * 0.5f, col(SHEEN), 0x00FFFFFF, Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, sheen);
            if (sweep >= 0f && sweep < 1f) { // the band of light crossing the focused card once
                c.save();
                clip.reset();
                clip.addRoundRect(r, rad, rad, Path.Direction.CW);
                c.clipPath(clip);
                float w = r.width() * 0.45f, x = r.left - w + (r.width() + 2 * w) * sweep;
                int a = (int) (0x2E * (1f - sweep * 0.6f));
                light.setShader(new LinearGradient(x, r.top, x + w, r.bottom,
                        new int[]{0x00FFFFFF, (a << 24) | 0xFFFFFF, 0x00FFFFFF}, null, Shader.TileMode.CLAMP));
                c.drawRect(r, light);
                c.restore();
            }
            boolean gold = to == NEXT;
            float ew = (gold ? 1.6f : focused ? 1.4f : 1f) * d;
            edge.setStrokeWidth(ew);
            if (gold && mix >= 1f) {
                edge.setShader(new LinearGradient(0, r.top, 0, r.bottom, 0xFFF0D9A0, 0xCCA9853F, Shader.TileMode.CLAMP));
            } else {
                edge.setShader(null);
                edge.setColor(focused && !gold ? 0xB3FFF1CF : col(EDGE));
            }
            float h = ew / 2;
            s.set(r);
            s.inset(h, h);
            c.drawRoundRect(s, rad - h, rad - h, edge);
            if (to == NEXT && progress >= 0f) { // the thin gold bar along the foot of the next prayer's card
                float bh = 2.5f * d, left = r.left + 16 * d, right = r.right - 16 * d, y = r.bottom - 7 * d;
                bar.setShader(null);
                bar.setColor((int) ((0x33 * mix)) << 24 | 0xD9B66A);
                s.set(left, y, right, y + bh);
                c.drawRoundRect(s, bh / 2, bh / 2, bar);
                // Fills from the right, the way Arabic reads, brightest at its leading edge.
                float start = right - (right - left) * progress;
                if (start < right - bh) {
                    bar.setShader(new LinearGradient(right, 0, start, 0, 0xFFB8934A, 0xFFF0D9A0, Shader.TileMode.CLAMP));
                    bar.setAlpha((int) (255 * mix));
                    s.set(start, y, right, y + bh);
                    c.drawRoundRect(s, bh / 2, bh / 2, bar);
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
