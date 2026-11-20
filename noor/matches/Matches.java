package com.gathin.tvhome;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Today's matches as a row of the home screen's own layout, under the clock header and above the apps: every match
 * of today (the TV's own day) in LaLiga, the Premier League, the Bundesliga, Ligue 1 and the Champions League, and every
 * match of Morocco's
 * national team, in kick-off order. Each card has the competition, both teams with their badges and Arabic names,
 * and the kick-off time, or the score and the minute while it is played, or the final score. The row scrolls
 * sideways with the remote (up from the dock reaches it), the first match on the right as Arabic reads. Data from
 * ESPN's public scoreboard: once a minute while a match is on or about to start, otherwise every 20 minutes.
 * Updated from MainActivity.updateGreeting (on resume and once a minute); see noor/matches/apply.py.
 */
final class Matches {
    private Matches() {
    }

    private static final String API = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
    /**
     * The competitions and their weight, most followed first. The big tournaments are only played in their season,
     * so when they have matches today they come first by themselves, and the leagues follow when they do not.
     * ALL: every match. CUP: a domestic cup, from the round of 16 or with a club the row knows (no amateur rounds).
     * MAR: only Morocco's matches (ESPN team id 2869).
     */
    private static final int ALL = 0, CUP = 1, MAR = 2;
    private static final Object[][] COMPS = {
            {"fifa.world", 1000, ALL}, {"caf.nations", 950, ALL}, {"uefa.euro", 900, ALL}, {"conmebol.america", 850, ALL},
            {"fifa.cwc", 800, ALL}, {"uefa.champions", 700, ALL},
            {"eng.1", 500, ALL}, {"esp.1", 490, ALL}, {"ita.1", 480, ALL}, {"ger.1", 470, ALL}, {"fra.1", 460, ALL},
            {"uefa.europa", 420, ALL}, {"ksa.1", 400, ALL}, {"caf.champions", 390, ALL},
            {"por.1", 350, ALL}, {"ned.1", 340, ALL}, {"tur.1", 330, ALL},
            {"eng.fa", 320, CUP}, {"esp.copa_del_rey", 315, CUP}, {"ita.coppa_italia", 310, CUP}, {"ger.dfb_pokal", 305, CUP},
            {"fra.coupe_de_france", 300, CUP}, {"eng.league_cup", 290, CUP}, {"uefa.champions_qual", 250, ALL},
            {"fifa.worldq.caf", 0, MAR}, {"caf.nations_qual", 0, MAR}, {"fifa.friendly", 0, MAR}};
    private static final String MOROCCO = "2869";
    /** Clubs and teams whose meeting is a big match (⭐), and the derbies. ESPN's English names. */
    private static final java.util.Set<String> BIG = new java.util.HashSet<>(java.util.Arrays.asList(
            "Real Madrid", "Barcelona", "Atlético Madrid", "Atletico Madrid", "Manchester City", "Liverpool", "Arsenal",
            "Manchester United", "Chelsea", "Tottenham Hotspur", "Newcastle United", "Bayern Munich", "Borussia Dortmund",
            "Bayer Leverkusen", "Paris Saint-Germain", "Marseille", "Internazionale", "AC Milan", "Juventus", "Napoli",
            "AS Roma", "Benfica", "FC Porto", "Sporting CP", "Ajax Amsterdam", "Ajax", "PSV Eindhoven", "Galatasaray",
            "Fenerbahce", "Al Hilal", "Al Nassr", "Al Ittihad", "Al Ahly", "Zamalek",
            "Morocco", "Brazil", "Argentina", "France", "Spain", "England", "Germany", "Portugal", "Italy", "Netherlands"));
    private static final String[][] DERBIES = {
            {"Real Madrid", "Atlético Madrid"}, {"Real Madrid", "Atletico Madrid"}, {"Internazionale", "AC Milan"},
            {"AS Roma", "Lazio"}, {"Sevilla", "Real Betis"}, {"Barcelona", "Espanyol"}, {"Arsenal", "Tottenham Hotspur"},
            {"Liverpool", "Everton"}, {"Borussia Dortmund", "Schalke 04"}, {"Benfica", "Sporting CP"},
            {"Galatasaray", "Besiktas"}, {"Fenerbahce", "Besiktas"}, {"Celtic", "Rangers"}, {"Juventus", "Torino"},
            {"Al Hilal", "Al Ittihad"}, {"Al Nassr", "Al Ittihad"}, {"Ajax Amsterdam", "Feyenoord"}, {"Athletic Club", "Real Sociedad"}};

    private static boolean big(String a, String b) {
        if (BIG.contains(a) && BIG.contains(b)) return true;
        for (String[] d : DERBIES) if ((d[0].equals(a) && d[1].equals(b)) || (d[0].equals(b) && d[1].equals(a))) return true;
        return false;
    }

    /** A knockout stage from ESPN's season slug: its Arabic name and how much it adds. Null for a league round. */
    private static Object[] stage(String slug) {
        if (slug == null) return null;
        String x = slug.toLowerCase(Locale.US);
        if (x.contains("semi")) return new Object[]{"نصف النهائي", 200};
        if (x.contains("quarter")) return new Object[]{"ربع النهائي", 120};
        if (x.equals("final") || x.endsWith("-final") || x.startsWith("final")) return new Object[]{"النهائي", 300};
        if (x.contains("round-of-16") || x.contains("last-16")) return new Object[]{"ثمن النهائي", 60};
        if (x.contains("round-of-32") || x.contains("playoff") || x.contains("knockout")) return new Object[]{"الأدوار الإقصائية", 30};
        if (x.contains("third")) return new Object[]{"المركز الثالث", 40};
        return null;
    }

    static final class Game {
        String id, league, leagueLogo, home, away, homeLogo, awayLogo, homeScore, awayScore, state, clock, status, stage;
        long start;
        int prio;
        boolean star;
    }

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final ExecutorService io = Executors.newFixedThreadPool(3);
    private static final LruCache<String, Bitmap> logos = new LruCache<>(120);
    private static volatile List<Game> games;
    private static volatile long fetchedAt, nextFetch;
    private static volatile boolean fetching, failed;
    private static volatile int fetchedDay = -1;

    private static LinearLayout box, row;
    private static TextView title, empty;
    private static HorizontalScrollView scroll;
    private static String shownKey = "";
    private static final Map<String, View[]> cardViews = new HashMap<>();

    static void update(Activity a) {
        LinearLayout b = a.findViewById(R.id.noorMatches);
        if (b == null) return;
        if (b != box) build(a, b);
        int day = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        if (!fetching && (System.currentTimeMillis() >= nextFetch || day != fetchedDay)) fetch(a.getApplicationContext(), day);
        fill();
    }

    // ---------- data ----------

    /** Competitions with a match today, from the last full fetch: the only ones asked again while a match is on. */
    private static volatile java.util.Set<String> active = new java.util.HashSet<>();
    private static volatile long fullAt;

    private static void fetch(Context c, int day) {
        fetching = true;
        new Thread(() -> {
            long now = System.currentTimeMillis();
            List<Game> old = games;
            // A full look (every competition) every 20 minutes or on a new day; in between, only today's competitions.
            boolean full = old == null || day != fetchedDay || now - fullAt > 20 * 60_000L;
            Calendar today = Calendar.getInstance(), before = Calendar.getInstance();
            before.add(Calendar.DAY_OF_YEAR, -1);
            SimpleDateFormat ymd = new SimpleDateFormat("yyyyMMdd", Locale.US);
            // ESPN's days are US days, not the TV's: ask for yesterday and today (one day per request, it takes no
            // range) and keep what starts on the TV's today.
            String[] days = {ymd.format(before.getTime()), ymd.format(today.getTime())};
            List<Game> out = new ArrayList<>();
            java.util.Set<String> asked = new java.util.HashSet<>(), ok = new java.util.HashSet<>();
            for (Object[] comp : COMPS) if (full || active.contains((String) comp[0])) asked.add((String) comp[0]);
            for (Object[] comp : COMPS) {
                String l = (String) comp[0];
                if (!asked.contains(l)) continue;
                boolean good = false;
                java.util.Set<String> seen = new java.util.HashSet<>();
                for (String d : days) good |= read(l, (Integer) comp[1], (Integer) comp[2], d, today, out, seen);
                if (good) ok.add(l);
            }
            if (!full && old != null) {
                // Keep the other competitions' matches, and those of any competition that did not answer this time.
                for (Game g : old) if (!asked.contains(g.league) || !ok.contains(g.league)) out.add(g);
            }
            // On now first, then to come, then over; within each, the most followed first, then by kick-off.
            Collections.sort(out, (x, y) -> {
                int gx = "in".equals(x.state) ? 0 : "pre".equals(x.state) ? 1 : 2, gy = "in".equals(y.state) ? 0 : "pre".equals(y.state) ? 1 : 2;
                if (gx != gy) return Integer.compare(gx, gy);
                if (x.prio != y.prio) return Integer.compare(y.prio, x.prio);
                return Long.compare(x.start, y.start);
            });
            long soon = Long.MAX_VALUE;
            java.util.Set<String> act = new java.util.HashSet<>();
            for (Game g : out) {
                act.add(g.league);
                if ("in".equals(g.state)) soon = now;
                else if ("pre".equals(g.state)) soon = Math.min(soon, g.start - 15 * 60_000L);
            }
            boolean anyOk = !ok.isEmpty();
            failed = !anyOk;
            if (anyOk) {
                games = out;
                active = act;
                fetchedDay = day;
                fetchedAt = now;
                if (full) fullAt = now;
            }
            // Live or starting within the quarter hour: every minute; otherwise every 20 minutes, sooner for a start.
            nextFetch = !anyOk ? now + 2 * 60_000L : soon <= now ? now + 60_000L : Math.min(now + 20 * 60_000L, soon);
            fetching = false;
            main.post(Matches::fill);
        }, "matches").start();
    }

    private static boolean read(String league, int weight, int mode, String date, Calendar today, List<Game> out,
                                java.util.Set<String> seen) {
        try {
            JSONObject j = new JSONObject(get(API + league + "/scoreboard?dates=" + date + "&limit=200"));
            String leagueLogo = "";
            JSONArray ls = j.optJSONArray("leagues");
            if (ls != null && ls.length() > 0) {
                JSONArray lg = ls.getJSONObject(0).optJSONArray("logos");
                if (lg != null && lg.length() > 0) leagueLogo = lg.getJSONObject(0).optString("href");
            }
            JSONArray ev = j.optJSONArray("events");
            for (int i = 0; ev != null && i < ev.length(); i++) {
                JSONObject e = ev.getJSONObject(i);
                long start = parse(e.optString("date"));
                if (start <= 0 || !sameDay(start, today)) continue;
                JSONObject comp = e.getJSONArray("competitions").getJSONObject(0);
                JSONArray cs = comp.getJSONArray("competitors");
                JSONObject home = null, away = null;
                for (int k = 0; k < cs.length(); k++) {
                    JSONObject x = cs.getJSONObject(k);
                    if ("home".equals(x.optString("homeAway"))) home = x;
                    else away = x;
                }
                if (home == null || away == null) continue;
                JSONObject ht = home.getJSONObject("team"), at = away.getJSONObject("team");
                boolean morocco = MOROCCO.equals(ht.optString("id")) || MOROCCO.equals(at.optString("id"));
                if (mode == MAR && !morocco) continue;
                JSONObject season = e.optJSONObject("season");
                Object[] st = stage(season == null ? null : season.optString("slug"));
                String hn = ht.optString("displayName"), an = at.optString("displayName");
                if (mode == CUP && (st == null || (Integer) st[1] < 60) && !TeamNames.known(hn) && !TeamNames.known(an)) continue;
                Game g = new Game();
                g.id = league + ":" + e.optString("id");
                if (!seen.add(g.id)) continue; // the same match on both days asked
                g.league = league;
                g.leagueLogo = leagueLogo;
                g.start = start;
                g.home = TeamNames.ar(hn, ht.optString("shortDisplayName"));
                g.away = TeamNames.ar(an, at.optString("shortDisplayName"));
                g.stage = st == null ? null : (String) st[0];
                g.star = big(hn, an);
                g.prio = weight + (st == null ? 0 : (Integer) st[1]) + (g.star ? 150 : 0) + (morocco ? 10000 : 0);
                g.homeLogo = ht.optString("logo");
                g.awayLogo = at.optString("logo");
                g.homeScore = home.optString("score");
                g.awayScore = away.optString("score");
                JSONObject so = e.optJSONObject("status");
                JSONObject type = so == null ? null : so.optJSONObject("type");
                g.state = type == null ? "pre" : type.optString("state", "pre");
                g.status = type == null ? "" : type.optString("name");
                g.clock = so == null ? "" : so.optString("displayClock");
                out.add(g);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static long parse(String iso) {
        for (String f : new String[]{"yyyy-MM-dd'T'HH:mmX", "yyyy-MM-dd'T'HH:mm:ssX", "yyyy-MM-dd'T'HH:mm:ss.SSSX"}) {
            try {
                SimpleDateFormat p = new SimpleDateFormat(f, Locale.US);
                p.setTimeZone(TimeZone.getTimeZone("UTC"));
                return p.parse(iso).getTime();
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    private static boolean sameDay(long t, Calendar today) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return c.get(Calendar.YEAR) == today.get(Calendar.YEAR) && c.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR);
    }

    // ---------- the row ----------

    private static float dp(Context c, float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    private static int px(Context c, float v) {
        return Math.round(dp(c, v));
    }

    private static TextView text(Context c, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        t.setIncludeFontPadding(false);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        t.setShadowLayer(dp(c, 3), 0, dp(c, 1), 0x80000000);
        return t;
    }

    private static GradientDrawable glass(Context c, int top, int bottom, int stroke, float width) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{top, bottom});
        g.setCornerRadius(dp(c, 16));
        g.setStroke(Math.max(1, px(c, width)), stroke);
        return g;
    }

    // ---------- folding away under the apps ----------

    private static boolean folded;
    private static android.animation.ValueAnimator foldAnim;

    /**
     * Below the first row of apps the row folds away (its height and its light go together, so the apps move up
     * smoothly into its place instead of passing under it); back in the first row, the top buttons or the row itself,
     * it unfolds. Decided by where the focus is, not by the scroll, so the change of room cannot set it going back
     * and forth. A single sideways row of apps never folds it.
     */
    private static void onFocus(Activity a, View n) {
        if (box == null || n == null) return;
        androidx.recyclerview.widget.RecyclerView grid = a.findViewById(R.id.grid);
        View item = grid == null ? null : grid.findContainingItemView(n);
        if (item == null) {
            fold(false);
            return;
        }
        androidx.recyclerview.widget.RecyclerView.LayoutManager lm = grid.getLayoutManager();
        if (!(lm instanceof androidx.recyclerview.widget.GridLayoutManager)
                || ((androidx.recyclerview.widget.GridLayoutManager) lm).getOrientation() != androidx.recyclerview.widget.RecyclerView.VERTICAL) {
            fold(false);
            return;
        }
        int span = ((androidx.recyclerview.widget.GridLayoutManager) lm).getSpanCount();
        int pos = grid.getChildAdapterPosition(item);
        fold(pos >= span);
    }

    private static void fold(boolean f) {
        if (f == folded || box == null) return;
        folded = f;
        if (foldAnim != null) foldAnim.cancel();
        LinearLayout b = box;
        android.view.ViewGroup.LayoutParams lp = b.getLayoutParams();
        int from, to;
        if (f) {
            from = b.getHeight();
            to = 0;
        } else {
            b.setVisibility(View.VISIBLE);
            int w = ((View) b.getParent()).getWidth() - ((View) b.getParent()).getPaddingLeft() - ((View) b.getParent()).getPaddingRight();
            b.measure(View.MeasureSpec.makeMeasureSpec(Math.max(0, w), View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            from = lp.height == android.view.ViewGroup.LayoutParams.WRAP_CONTENT ? 0 : Math.max(0, lp.height);
            to = b.getMeasuredHeight();
        }
        android.view.ViewGroup.MarginLayoutParams mlp = (android.view.ViewGroup.MarginLayoutParams) lp;
        int margin = px(b.getContext(), 16);
        foldAnim = android.animation.ValueAnimator.ofFloat(0f, 1f).setDuration(260);
        foldAnim.setInterpolator(new DecelerateInterpolator());
        foldAnim.addUpdateListener(v -> {
            float t = (float) v.getAnimatedValue();
            lp.height = Math.round(from + (to - from) * t);
            float shown = f ? 1f - t : t;
            mlp.topMargin = Math.round(margin * shown);
            b.setAlpha(shown);
            b.setLayoutParams(lp);
        });
        foldAnim.addListener(new android.animation.AnimatorListenerAdapter() {
            private boolean cancelled;

            @Override
            public void onAnimationCancel(android.animation.Animator x) {
                cancelled = true;
            }

            @Override
            public void onAnimationEnd(android.animation.Animator x) {
                if (cancelled) return;
                if (f) b.setVisibility(View.GONE);
                lp.height = android.view.ViewGroup.LayoutParams.WRAP_CONTENT;
                mlp.topMargin = f ? 0 : margin;
                b.setAlpha(f ? 0f : 1f);
                b.setLayoutParams(lp);
            }
        });
        foldAnim.start();
    }

    private static void build(Activity a, LinearLayout b) {
        box = b;
        folded = false;
        a.getWindow().getDecorView().getViewTreeObserver().addOnGlobalFocusChangeListener((o, n) -> onFocus(a, n));
        shownKey = "";
        cardViews.clear();
        b.removeAllViews();
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x8014204A, 0x660A1230});
        bg.setCornerRadius(dp(a, 22));
        bg.setStroke(px(a, 1), 0x29FFFFFF);
        b.setBackground(bg);
        b.setPadding(px(a, 12), px(a, 8), px(a, 12), px(a, 8));

        // The launcher lays out left to right (no supportsRtl): the title is put on the right by hand, and the
        // cards are added last-first with the row scrolled to its right end, so the first match is on the right.
        title = text(a, 15, 0xF2FFFFFF, true);
        title.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.rightMargin = px(a, 6);
        tlp.bottomMargin = px(a, 6);
        b.addView(title, tlp);

        empty = text(a, 15.5f, 0xCCFFFFFF, true);
        empty.setGravity(Gravity.CENTER);
        empty.setText("لا توجد مباريات اليوم في هذه البطولات");
        empty.setPadding(0, px(a, 10), 0, px(a, 10));
        b.addView(empty, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        scroll = new HorizontalScrollView(a);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setFillViewport(true);
        scroll.setClipChildren(false);
        scroll.setClipToPadding(false);
        scroll.setPadding(px(a, 4), px(a, 4), px(a, 4), px(a, 4));
        scroll.setHorizontalFadingEdgeEnabled(true);
        scroll.setFadingEdgeLength(px(a, 24));
        row = new LinearLayout(a);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.RIGHT);
        row.setClipChildren(false);
        scroll.addView(row, new HorizontalScrollView.LayoutParams(HorizontalScrollView.LayoutParams.WRAP_CONTENT, HorizontalScrollView.LayoutParams.WRAP_CONTENT));
        b.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private static void fill() {
        if (box == null) return;
        List<Game> g = games;
        // Always there (unless folded under the apps): a line while the first answer is on its way or the internet
        // is down, so the row never just disappears.
        int vis = folded ? View.GONE : View.VISIBLE;
        if (box.getVisibility() != vis && (foldAnim == null || !foldAnim.isRunning())) box.setVisibility(vis);
        if (g == null) {
            title.setText("⚽  مباريات اليوم");
            empty.setText(failed ? "تعذّر جلب المباريات، سأعيد المحاولة بعد قليل" : "جارٍ جلب مباريات اليوم…");
            empty.setVisibility(View.VISIBLE);
            scroll.setVisibility(View.GONE);
            return;
        }
        empty.setText("لا توجد مباريات اليوم في هذه البطولات");
        int live = 0;
        for (Game x : g) if ("in".equals(x.state)) live++;
        title.setText("⚽  مباريات اليوم  ·  " + g.size() + (live > 0 ? "  ·  " + live + " مباشر" : ""));
        empty.setVisibility(g.isEmpty() ? View.VISIBLE : View.GONE);
        scroll.setVisibility(g.isEmpty() ? View.GONE : View.VISIBLE);
        StringBuilder key = new StringBuilder();
        for (Game x : g) key.append(x.id).append(',');
        Context c = box.getContext();
        if (!key.toString().equals(shownKey)) {
            // A new set of matches (a new day, a new answer): build the cards again, last match first.
            shownKey = key.toString();
            boolean hadFocus = row.hasFocus();
            row.removeAllViews();
            cardViews.clear();
            for (int i = g.size() - 1; i >= 0; i--) {
                View card = card(c, g.get(i));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(px(c, 240), LinearLayout.LayoutParams.WRAP_CONTENT);
                if (i < g.size() - 1) lp.leftMargin = px(c, 10);
                row.addView(card, lp);
            }
            scroll.post(() -> {
                scroll.fullScroll(View.FOCUS_RIGHT);
                if (hadFocus && row.getChildCount() > 0) row.getChildAt(row.getChildCount() - 1).requestFocus();
            });
        }
        for (Game x : g) {
            View[] v = cardViews.get(x.id);
            if (v != null) state(c, x, v);
        }
    }

    /** One match: competition, the two teams (badge on the right of the name), and the time or the score. */
    private static View card(Context c, Game g) {
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(px(c, 12), px(c, 8), px(c, 12), px(c, 8));
        card.setFocusable(true);
        card.setClickable(true);
        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, glass(c, 0xCC2B3F86, 0xBF162452, 0xE6FFFFFF, 2));
        bg.addState(new int[]{}, g.star ? glass(c, 0xB3302A4A, 0xA6151231, 0x99E8C987, 1.5f) : glass(c, 0xA61A2556, 0x990B1336, 0x33FFFFFF, 1));
        card.setBackground(bg);
        card.setOnFocusChangeListener((v, has) -> v.animate().scaleX(has ? 1.05f : 1f).scaleY(has ? 1.05f : 1f)
                .setDuration(180).setInterpolator(new DecelerateInterpolator()).start());

        LinearLayout lg = new LinearLayout(c);
        lg.setOrientation(LinearLayout.HORIZONTAL);
        lg.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        TextView league = text(c, 12.5f, g.star ? 0xFFE8C987 : 0xCCFFFFFF, true);
        league.setText((g.star ? "⭐ " : "") + TeamNames.league(g.league) + (g.stage == null ? "" : "  ·  " + g.stage));
        league.setTextDirection(View.TEXT_DIRECTION_RTL);
        ImageView ll = new ImageView(c);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(px(c, 16), px(c, 16));
        llp.leftMargin = px(c, 5);
        lg.addView(league);
        lg.addView(ll, llp);
        logo(ll, g.leagueLogo, px(c, 28));
        card.addView(lg);

        View[] home = team(c, card, g.home, g.homeLogo, 6);
        View[] away = team(c, card, g.away, g.awayLogo, 5);

        TextView status = text(c, 14.5f, 0xFFE8C987, true);
        status.setGravity(Gravity.CENTER);
        status.setTextDirection(View.TEXT_DIRECTION_RTL);
        status.setFontFeatureSettings("tnum");
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = px(c, 7);
        card.addView(status, slp);
        cardViews.put(g.id, new View[]{home[0], away[0], status, card});
        return card;
    }

    /** A team line: score on the left, name, badge on the right. Returns {score view}. */
    private static View[] team(Context c, LinearLayout card, String name, String logoUrl, int top) {
        LinearLayout line = new LinearLayout(c);
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);
        TextView score = text(c, 21, 0xFFFFFFFF, true);
        score.setFontFeatureSettings("tnum");
        score.setMinWidth(px(c, 22));
        TextView n = text(c, 17, 0xFFFFFFFF, true);
        n.setText(name);
        n.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        n.setTextDirection(View.TEXT_DIRECTION_RTL);
        ImageView badge = new ImageView(c);
        badge.setScaleType(ImageView.ScaleType.FIT_CENTER);
        line.addView(score, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        nlp.leftMargin = px(c, 6);
        nlp.rightMargin = px(c, 8);
        line.addView(n, nlp);
        line.addView(badge, new LinearLayout.LayoutParams(px(c, 30), px(c, 30)));
        logo(badge, logoUrl, px(c, 60));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = px(c, top);
        card.addView(line, lp);
        return new View[]{score};
    }

    /** Scores and the status line, updated in place so the focus stays where it is. */
    private static void state(Context c, Game g, View[] v) {
        TextView hs = (TextView) v[0], as = (TextView) v[1], st = (TextView) v[2];
        boolean pre = "pre".equals(g.state), live = "in".equals(g.state);
        hs.setText(pre ? "" : g.homeScore);
        as.setText(pre ? "" : g.awayScore);
        String s;
        int col;
        if (g.status.contains("POSTPONED")) {
            s = "مؤجلة";
            col = 0xB3FFFFFF;
        } else if (g.status.contains("CANCELED") || g.status.contains("CANCELLED")) {
            s = "ملغاة";
            col = 0xB3FFFFFF;
        } else if (live) {
            s = g.status.contains("HALFTIME") ? "● استراحة" : "● مباشر  " + g.clock;
            col = 0xFFFF6B6B;
        } else if (pre) {
            s = new SimpleDateFormat("HH:mm", Locale.US).format(g.start);
            col = 0xFFE8C987;
        } else {
            s = "انتهت";
            col = 0x99FFFFFF;
        }
        st.setText(s);
        st.setTextColor(col);
    }

    // ---------- badges ----------

    /** A badge from ESPN's image server at the size it is shown, kept in memory and on disk for the day. */
    private static void logo(ImageView iv, String url, int size) {
        if (url == null || url.isEmpty()) return;
        String key = url + "@" + size;
        Bitmap b = logos.get(key);
        if (b != null) {
            iv.setImageBitmap(b);
            return;
        }
        iv.setTag(key);
        Context c = iv.getContext().getApplicationContext();
        io.execute(() -> {
            Bitmap bm = null;
            File f = new File(c.getCacheDir(), "badge-" + Integer.toHexString(key.hashCode()) + ".png");
            try {
                if (f.exists() && System.currentTimeMillis() - f.lastModified() < 7 * 24 * 3600_000L) bm = BitmapFactory.decodeFile(f.getPath());
                if (bm == null) {
                    String path = url.replaceFirst("^https?://a\\.espncdn\\.com", "");
                    String small = path.startsWith("/") ? "https://a.espncdn.com/combiner/i?img=" + path + "&w=" + size + "&h=" + size : url;
                    byte[] d;
                    try {
                        d = bytes(small);
                    } catch (Exception e) {
                        d = bytes(url);
                    }
                    bm = BitmapFactory.decodeByteArray(d, 0, d.length);
                    if (bm != null && bm.getWidth() > size * 2) bm = Bitmap.createScaledBitmap(bm, size, size * bm.getHeight() / bm.getWidth(), true);
                    if (bm != null) try (FileOutputStream o = new FileOutputStream(f)) {
                        bm.compress(Bitmap.CompressFormat.PNG, 100, o);
                    }
                }
            } catch (Exception ignored) {
            }
            if (bm == null) return;
            logos.put(key, bm);
            Bitmap fb = bm;
            main.post(() -> {
                if (key.equals(iv.getTag())) iv.setImageBitmap(fb);
            });
        });
    }

    private static byte[] bytes(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(6000);
        c.setReadTimeout(8000);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) TV");
        try (InputStream raw = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = raw.read(buf)) > 0) b.write(buf, 0, n);
            byte[] d = b.toByteArray();
            // ESPN can send a range of days gzipped even unasked: unpack it when it is.
            if (d.length > 2 && (d[0] & 0xff) == 0x1f && (d[1] & 0xff) == 0x8b) {
                try (InputStream in = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(d))) {
                    b.reset();
                    while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                    d = b.toByteArray();
                }
            }
            return d;
        } finally {
            c.disconnect();
        }
    }

    private static String get(String url) throws Exception {
        return new String(bytes(url), "UTF-8");
    }
}
