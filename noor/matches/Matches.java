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
 * of today (the TV's own day) in LaLiga, the Premier League and the Champions League, and every match of Morocco's
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
    /** Club competitions: every match. National-team ones: only Morocco's (ESPN team id 2869). */
    private static final String[] CLUBS = {"uefa.champions", "uefa.champions_qual", "esp.1", "eng.1"};
    private static final String[] NATIONS = {"fifa.world", "fifa.worldq.caf", "caf.nations", "caf.nations_qual", "fifa.friendly"};
    private static final String MOROCCO = "2869";

    static final class Game {
        String id, league, leagueLogo, home, away, homeLogo, awayLogo, homeScore, awayScore, state, clock, status;
        long start;
    }

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final ExecutorService io = Executors.newFixedThreadPool(3);
    private static final LruCache<String, Bitmap> logos = new LruCache<>(120);
    private static volatile List<Game> games;
    private static volatile long fetchedAt, nextFetch;
    private static volatile boolean fetching;
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
            for (String l : CLUBS) if (full || active.contains(l)) asked.add(l);
            for (String l : NATIONS) if (full || active.contains(l)) asked.add(l);
            for (String l : asked) {
                boolean nation = java.util.Arrays.asList(NATIONS).contains(l);
                boolean good = false;
                java.util.Set<String> seen = new java.util.HashSet<>();
                for (String d : days) good |= read(l, d, nation, today, out, seen);
                if (good) ok.add(l);
            }
            if (!full && old != null) {
                // Keep the other competitions' matches, and those of any competition that did not answer this time.
                for (Game g : old) if (!asked.contains(g.league) || !ok.contains(g.league)) out.add(g);
            }
            Collections.sort(out, (x, y) -> Long.compare(x.start, y.start));
            long soon = Long.MAX_VALUE;
            java.util.Set<String> act = new java.util.HashSet<>();
            for (Game g : out) {
                act.add(g.league);
                if ("in".equals(g.state)) soon = now;
                else if ("pre".equals(g.state)) soon = Math.min(soon, g.start - 15 * 60_000L);
            }
            boolean anyOk = !ok.isEmpty();
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

    private static boolean read(String league, String date, boolean moroccoOnly, Calendar today, List<Game> out,
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
                if (moroccoOnly && !MOROCCO.equals(ht.optString("id")) && !MOROCCO.equals(at.optString("id"))) continue;
                Game g = new Game();
                g.id = league + ":" + e.optString("id");
                if (!seen.add(g.id)) continue; // the same match on both days asked
                g.league = league;
                g.leagueLogo = leagueLogo;
                g.start = start;
                g.home = TeamNames.ar(ht.optString("displayName"), ht.optString("shortDisplayName"));
                g.away = TeamNames.ar(at.optString("displayName"), at.optString("shortDisplayName"));
                g.homeLogo = ht.optString("logo");
                g.awayLogo = at.optString("logo");
                g.homeScore = home.optString("score");
                g.awayScore = away.optString("score");
                JSONObject st = e.optJSONObject("status");
                JSONObject type = st == null ? null : st.optJSONObject("type");
                g.state = type == null ? "pre" : type.optString("state", "pre");
                g.status = type == null ? "" : type.optString("name");
                g.clock = st == null ? "" : st.optString("displayClock");
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

    private static void build(Activity a, LinearLayout b) {
        box = b;
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
        title = text(a, 13, 0xE6FFFFFF, true);
        title.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        title.setTextDirection(View.TEXT_DIRECTION_RTL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.rightMargin = px(a, 6);
        tlp.bottomMargin = px(a, 6);
        b.addView(title, tlp);

        empty = text(a, 14, 0xB3FFFFFF, false);
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
        // Gone until the first answer, so the layout does not jump; then always there, with a line when there is none.
        int vis = g == null ? View.GONE : View.VISIBLE;
        if (box.getVisibility() != vis) box.setVisibility(vis);
        if (g == null) return;
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
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(px(c, 214), LinearLayout.LayoutParams.WRAP_CONTENT);
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
        bg.addState(new int[]{}, glass(c, 0xA61A2556, 0x990B1336, 0x33FFFFFF, 1));
        card.setBackground(bg);
        card.setOnFocusChangeListener((v, has) -> v.animate().scaleX(has ? 1.05f : 1f).scaleY(has ? 1.05f : 1f)
                .setDuration(180).setInterpolator(new DecelerateInterpolator()).start());

        LinearLayout lg = new LinearLayout(c);
        lg.setOrientation(LinearLayout.HORIZONTAL);
        lg.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        TextView league = text(c, 11, 0xB3FFFFFF, false);
        league.setText(TeamNames.league(g.league));
        league.setTextDirection(View.TEXT_DIRECTION_RTL);
        ImageView ll = new ImageView(c);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(px(c, 14), px(c, 14));
        llp.leftMargin = px(c, 5);
        lg.addView(league);
        lg.addView(ll, llp);
        logo(ll, g.leagueLogo, px(c, 28));
        card.addView(lg);

        View[] home = team(c, card, g.home, g.homeLogo, 6);
        View[] away = team(c, card, g.away, g.awayLogo, 5);

        TextView status = text(c, 12.5f, 0xFFE8C987, true);
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
        TextView score = text(c, 18, 0xFFFFFFFF, true);
        score.setFontFeatureSettings("tnum");
        score.setMinWidth(px(c, 22));
        TextView n = text(c, 14.5f, 0xF2FFFFFF, true);
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
        line.addView(badge, new LinearLayout.LayoutParams(px(c, 26), px(c, 26)));
        logo(badge, logoUrl, px(c, 52));
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
