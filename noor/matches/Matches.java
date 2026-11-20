package com.gathin.tvhome;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
    private static TextView title, empty, moreLeft, moreRight;
    /** Card width that fits a whole number of cards in the row, so none is ever cut at an edge. */
    private static int cardW;
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
            android.util.Log.w("Matches", league + " " + date + ": " + e);
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
        b.setBackground(new Glass(dp(a, 1), Glass.BAND));
        b.setPadding(px(a, 6), px(a, 7), px(a, 6), px(a, 3));
        b.setClipChildren(true);

        // The launcher lays out left to right (no supportsRtl): the title is put on the right by hand, and the
        // cards are added last-first with the row scrolled to its right end, so the first match is on the right.
        // Title line: how many matches lie beyond each edge on the outsides, the title on the right.
        LinearLayout head = new LinearLayout(a);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        moreLeft = text(a, 14, 0xD9E8C987, true);
        moreRight = text(a, 14, 0xD9E8C987, true);
        title = text(a, 15, 0xF2FFFFFF, true);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        View gap = new View(a);
        LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ml.leftMargin = px(a, 14);
        head.addView(moreLeft, ml);
        head.addView(gap, new LinearLayout.LayoutParams(0, 1, 1f));
        LinearLayout.LayoutParams mr = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mr.rightMargin = px(a, 12);
        head.addView(moreRight, mr);
        head.addView(title);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.rightMargin = px(a, 12);
        tlp.bottomMargin = px(a, 1);
        b.addView(head, tlp);

        empty = text(a, 15.5f, 0xCCFFFFFF, true);
        empty.setGravity(Gravity.CENTER);
        empty.setText("لا توجد مباريات اليوم في هذه البطولات");
        empty.setPadding(0, px(a, 10), 0, px(a, 10));
        b.addView(empty, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        // Whole cards only: the cards are sized so a whole number of them fills the row (see fit), and the row moves
        // one whole card at a time, so no card is ever cut at an edge. The padding is the room for the focused card's
        // slight lift; the next card beyond an edge starts a gap further than the padding, so it stays hidden.
        final int gapPx = px(a, 16); // wider than the edge padding, so no sliver of the next card shows
        scroll = new HorizontalScrollView(a) {
            @Override
            protected int computeScrollDeltaToGetChildRectOnScreen(android.graphics.Rect r) {
                return 0; // the cards' own keys move the row (step), so it never shifts by itself
            }
        };
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setHorizontalFadingEdgeEnabled(false);
        scroll.setSmoothScrollingEnabled(true);
        scroll.setFillViewport(true);
        scroll.setClipChildren(false);
        scroll.setClipToPadding(false);
        scroll.setPadding(px(a, 14), px(a, 8), px(a, 14), px(a, 8));
        scroll.addOnLayoutChangeListener((v, l, t, r, bt, ol, ot, or, ob) -> fit(gapPx));
        scroll.setOnScrollChangeListener((v, x, y, ox, oy) -> marks(gapPx));
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
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(cardW > 0 ? cardW : px(c, 240), LinearLayout.LayoutParams.WRAP_CONTENT);
                if (i < g.size() - 1) lp.leftMargin = px(c, 16);
                row.addView(card, lp);
            }
            scroll.post(() -> {
                fit(px(c, 16));
                scroll.scrollTo(Math.max(0, row.getWidth() + scroll.getPaddingLeft() + scroll.getPaddingRight() - scroll.getWidth()), 0);
                marks(px(c, 16));
                if (hadFocus && row.getChildCount() > 0) row.getChildAt(row.getChildCount() - 1).requestFocus();
            });
        }
        for (Game x : g) {
            View[] v = cardViews.get(x.id);
            if (v != null) state(c, x, v);
        }
    }

    /** Slides the row, smoothly, to the nearest place where this card is whole inside it. */
    private static void step(View card) {
        if (scroll == null) return;
        int left = scroll.getScrollX() + scroll.getPaddingLeft(), right = scroll.getScrollX() + scroll.getWidth() - scroll.getPaddingRight();
        int x = scroll.getScrollX();
        if (card.getLeft() + scroll.getPaddingLeft() < left) x += card.getLeft() + scroll.getPaddingLeft() - left;
        else if (card.getRight() + scroll.getPaddingLeft() > right) x += card.getRight() + scroll.getPaddingLeft() - right;
        int max = Math.max(0, row.getWidth() + scroll.getPaddingLeft() + scroll.getPaddingRight() - scroll.getWidth());
        scroll.smoothScrollTo(Math.max(0, Math.min(max, x)), 0);
    }

    /** Sizes the cards so a whole number of them, at least 230dp each, fills the row exactly. */
    private static void fit(int gap) {
        if (scroll == null || row == null) return;
        int avail = scroll.getWidth() - scroll.getPaddingLeft() - scroll.getPaddingRight();
        if (avail <= 0) return;
        int min = px(scroll.getContext(), 230);
        int n = Math.max(1, (avail + gap) / (min + gap));
        int w = (avail - (n - 1) * gap) / n;
        if (w == cardW && !(row.getChildCount() > 0 && row.getChildAt(0).getLayoutParams().width != w)) return;
        cardW = w;
        for (int i = 0; i < row.getChildCount(); i++) {
            View ch = row.getChildAt(i);
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) ch.getLayoutParams();
            if (lp.width != w) {
                lp.width = w;
                ch.setLayoutParams(lp);
            }
        }
        scroll.post(() -> {
            if (!row.hasFocus()) scroll.scrollTo(Math.max(0, row.getWidth() + scroll.getPaddingLeft() + scroll.getPaddingRight() - scroll.getWidth()), 0);
            marks(gap);
        });
    }

    /** How many whole cards lie beyond each edge, shown quietly on the title line. */
    private static void marks(int gap) {
        if (scroll == null || row == null || moreLeft == null || cardW <= 0) return;
        int max = Math.max(0, row.getWidth() + scroll.getPaddingLeft() + scroll.getPaddingRight() - scroll.getWidth());
        int step = cardW + gap;
        int leftN = Math.round(scroll.getScrollX() / (float) step), rightN = Math.round((max - scroll.getScrollX()) / (float) step);
        moreLeft.setText(leftN > 0 ? "◂  " + leftN : "");
        moreRight.setText(rightN > 0 ? rightN + "  ▸" : "");
    }

    /** One match: competition, the two teams (badge on the right of the name), and the time or the score. */
    private static View card(Context c, Game g) {
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);

        card.setFocusable(true);
        card.setClickable(true);
        Glass gl = new Glass(dp(c, 1), g.star ? Glass.STAR : Glass.CARD);
        card.setBackground(gl);
        card.setLayerType(View.LAYER_TYPE_SOFTWARE, null); // blurred shadow and glow
        int in = Math.round(Glass.INSET * dp(c, 1));
        card.setPadding(in + px(c, 12), in + px(c, 6), in + px(c, 12), in + px(c, 7));
        card.setOnFocusChangeListener((v, has) -> {
            gl.setFocused(has);
            v.animate().scaleX(has ? 1.03f : 1f).scaleY(has ? 1.03f : 1f).setDuration(200)
                    .setInterpolator(new DecelerateInterpolator()).start();
        });
        // Left and right are ours: the next card gets the focus and the row slides to the place where it is whole;
        // at either end nothing happens, so the row can never be pushed past its first or last match.
        card.setOnKeyListener((v, code, ev) -> {
            if (code != android.view.KeyEvent.KEYCODE_DPAD_LEFT && code != android.view.KeyEvent.KEYCODE_DPAD_RIGHT) return false;
            if (ev.getAction() != android.view.KeyEvent.ACTION_DOWN) return true;
            int i = row.indexOfChild(v) + (code == android.view.KeyEvent.KEYCODE_DPAD_LEFT ? -1 : 1);
            if (i < 0 || i >= row.getChildCount()) return true;
            View next = row.getChildAt(i);
            step(next);
            next.requestFocus();
            v.playSoundEffect(code == android.view.KeyEvent.KEYCODE_DPAD_LEFT
                    ? android.view.SoundEffectConstants.NAVIGATION_LEFT : android.view.SoundEffectConstants.NAVIGATION_RIGHT);
            return true;
        });

        // Top line: the time or the status on the left, the competition on the right (one line instead of two keeps
        // the band short enough for the apps under it on a 16:9 TV).
        LinearLayout lg = new LinearLayout(c);
        lg.setOrientation(LinearLayout.HORIZONTAL);
        lg.setGravity(Gravity.CENTER_VERTICAL);
        TextView status = text(c, 15, 0xFFE8C987, true);
        status.setTextDirection(View.TEXT_DIRECTION_RTL);
        status.setFontFeatureSettings("tnum");
        lg.addView(status, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        TextView league = text(c, 12.5f, g.star ? 0xFFE8C987 : 0xCCFFFFFF, true);
        league.setText((g.star ? "⭐ " : "") + TeamNames.league(g.league) + (g.stage == null ? "" : "  ·  " + g.stage));
        league.setTextDirection(View.TEXT_DIRECTION_RTL);
        league.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        ImageView ll = new ImageView(c);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(px(c, 16), px(c, 16));
        llp.leftMargin = px(c, 5);
        LinearLayout.LayoutParams lgp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lgp.leftMargin = px(c, 8);
        lg.addView(league, lgp);
        lg.addView(ll, llp);
        logo(ll, g.leagueLogo, px(c, 28));
        card.addView(lg);

        View[] home = team(c, card, g.home, g.homeLogo, 6);
        View[] away = team(c, card, g.away, g.awayLogo, 4);
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
        line.addView(badge, new LinearLayout.LayoutParams(px(c, 28), px(c, 28)));
        logo(badge, logoUrl, px(c, 56));
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
            s = g.status.contains("HALFTIME") ? "● استراحة" : "● " + g.clock;
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

    // ---------- glass ----------

    /**
     * Glass with depth: a soft shadow under it, a body that is lighter at the top, a sheen over its upper part and
     * an edge that catches the light along the top. BAND for the row itself; CARD for a match, STAR for a big one
     * (a gold edge); a focused card glows white. Drawn inside INSET dp so the shadow and the glow stay in its bounds.
     */
    static final class Glass extends android.graphics.drawable.Drawable {
        static final int BAND = 0, CARD = 1, STAR = 2;
        static final float INSET = 5;
        private final float d;
        private final int kind;
        private boolean focused;
        private final android.graphics.Paint shadow = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG),
                glow = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG),
                body = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG),
                sheen = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG),
                edge = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final android.graphics.RectF r = new android.graphics.RectF(), q = new android.graphics.RectF();

        Glass(float density, int kind) {
            d = density;
            this.kind = kind;
            shadow.setColor(kind == BAND ? 0x59000000 : 0x8C000000);
            shadow.setMaskFilter(new android.graphics.BlurMaskFilter((kind == BAND ? 8 : 6) * d, android.graphics.BlurMaskFilter.Blur.NORMAL));
            glow.setMaskFilter(new android.graphics.BlurMaskFilter(7 * d, android.graphics.BlurMaskFilter.Blur.OUTER));
            edge.setStyle(android.graphics.Paint.Style.STROKE);
        }

        void setFocused(boolean f) {
            if (focused != f) {
                focused = f;
                invalidateSelf();
            }
        }

        @Override
        public void draw(android.graphics.Canvas c) {
            r.set(getBounds());
            float in = kind == BAND ? 0 : INSET * d;
            r.inset(in, in);
            if (kind == BAND) r.bottom -= 3 * d;
            float rad = (kind == BAND ? 22 : 16) * d;
            q.set(r);
            q.offset(0, (kind == BAND ? 2 : 3) * d);
            if (kind != BAND) c.drawRoundRect(q, rad, rad, shadow);
            if (focused) {
                glow.setColor(0x99FFFFFF);
                c.drawRoundRect(r, rad, rad, glow);
            }
            int top, bottom;
            if (kind == BAND) {
                top = 0x8C1B2A5E;
                bottom = 0x730A1236;
            } else if (focused) {
                top = 0xE63C55B0;
                bottom = 0xD91A2A66;
            } else if (kind == STAR) {
                top = 0xD93A3460;
                bottom = 0xCC181433;
            } else {
                top = 0xD92D3F86;
                bottom = 0xCC111B48;
            }
            body.setShader(new android.graphics.LinearGradient(0, r.top, 0, r.bottom, top, bottom, android.graphics.Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, body);
            // The sheen: light on the upper part of the glass, fading out by the middle.
            sheen.setShader(new android.graphics.LinearGradient(0, r.top, 0, r.top + r.height() * 0.55f,
                    kind == BAND ? 0x1FFFFFFF : focused ? 0x40FFFFFF : 0x2EFFFFFF, 0x00FFFFFF, android.graphics.Shader.TileMode.CLAMP));
            c.drawRoundRect(r, rad, rad, sheen);
            // The edge: brighter along the top than the bottom, which reads as a raised pane.
            float w = (focused ? 2f : kind == STAR ? 1.5f : 1f) * d;
            edge.setStrokeWidth(w);
            int et = focused ? 0xF2FFFFFF : kind == STAR ? 0xE6F0D9A0 : kind == BAND ? 0x47FFFFFF : 0x66FFFFFF;
            int eb = focused ? 0xB3FFFFFF : kind == STAR ? 0x80B8934A : 0x14FFFFFF;
            edge.setShader(new android.graphics.LinearGradient(0, r.top, 0, r.bottom, et, eb, android.graphics.Shader.TileMode.CLAMP));
            q.set(r);
            q.inset(w / 2, w / 2);
            c.drawRoundRect(q, rad - w / 2, rad - w / 2, edge);
        }

        @Override
        public void setAlpha(int a) {
        }

        @Override
        public void setColorFilter(android.graphics.ColorFilter f) {
        }

        @Override
        public int getOpacity() {
            return android.graphics.PixelFormat.TRANSLUCENT;
        }
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
