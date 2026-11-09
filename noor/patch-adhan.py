#!/usr/bin/env python3
"""Owner's choice for the adhan (noor-app/Adhan.java), applied at build time:
- the adhan sounds at every prayer (Fajr too) whatever is on screen; other audio pauses for it (transient
  audio focus) and resumes after;
- it stops if the viewer switches to another app while it plays, and its banner goes with it;
- the recording is read from the app's own folder on the TV (/sdcard/Android/data/app.noortv.kahf/files/adhan.mp3,
  put there by `tv.sh adhan`), falling back to res/raw/adhan when the build has one.
Usage: patch-adhan.py <Adhan.java>"""
import sys

path = sys.argv[1]
s = open(path, encoding="utf-8").read()


def sub(old, new):
    global s
    if old not in s:
        sys.exit(f"patch-adhan: could not find:\n{old}")
    s = s.replace(old, new, 1)


sub("""        boolean idle = prayer != 0 && HOME.equals(topApp(app))
                && !app.getSystemService(AudioManager.class).isMusicActive();
        fire(app, prayer, idle);""",
    """        fire(app, prayer, true); // owner's choice: the adhan at every prayer, whatever is on""")

sub("""        int raw = app.getResources().getIdentifier("adhan", "raw", app.getPackageName());
        if (raw == 0) {
            banner(app, text, 30_000);
            return;
        }
        stop();
        player = MediaPlayer.create(app, raw, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build(),
                app.getSystemService(AudioManager.class).generateAudioSessionId());
        if (player == null) {
            banner(app, text, 30_000);
            return;
        }
        player.setOnCompletionListener(mp -> stop());
        player.start();""",
    """        stop();
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        java.io.File dir = app.getExternalFilesDir(null);
        java.io.File file = dir == null ? null : new java.io.File(dir, "adhan.mp3");
        try {
            if (file != null && file.length() > 0) {
                player = new MediaPlayer();
                player.setAudioAttributes(attrs);
                player.setDataSource(file.getPath());
                player.prepare();
            } else {
                int raw = app.getResources().getIdentifier("adhan", "raw", app.getPackageName());
                player = raw == 0 ? null : MediaPlayer.create(app, raw, attrs,
                        app.getSystemService(AudioManager.class).generateAudioSessionId());
            }
        } catch (Exception e) {
            if (player != null) player.release();
            player = null;
        }
        if (player == null) {
            banner(app, text, 30_000);
            return;
        }
        AudioManager am = app.getSystemService(AudioManager.class);
        focus = new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs).build();
        am.requestAudioFocus(focus); // pauses YouTube, a film or a channel's sound; they resume after
        audio = am;
        player.setOnCompletionListener(mp -> stop());
        player.start();""")

sub("""    private static MediaPlayer player;""",
    """    private static MediaPlayer player;
    private static android.media.AudioFocusRequest focus;
    private static AudioManager audio;""")

# Stop when the viewer opens another app during the adhan, rather than when anything but Home is in front.
sub("""        Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(new Runnable() {""",
    """        Handler h = new Handler(Looper.getMainLooper());
        final String start = topApp(app);
        h.postDelayed(new Runnable() {""")
sub("""                if (top != null && !HOME.equals(top)) {""",
    """                if (top != null && start != null && !start.equals(top)) {""")

sub("""        player.release();
        player = null;
    }""",
    """        player.release();
        player = null;
        if (audio != null && focus != null) audio.abandonAudioFocusRequest(focus);
        focus = null;
    }""")

# The banner goes away with the adhan: when it ends, when the viewer switches app, or when a new one starts.
sub("""    private static android.media.AudioFocusRequest focus;""",
    """    private static android.media.AudioFocusRequest focus;
    private static TextView bannerView;
    private static WindowManager bannerWm;

    private static void removeBanner() {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (bannerView == null) return;
            try {
                bannerWm.removeView(bannerView);
            } catch (Exception ignored) {
            }
            bannerView = null;
        });
    }""")
sub("""            try {
                wm.addView(v, lp);
            } catch (Exception e) {
                return;
            }
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    wm.removeView(v);
                } catch (Exception ignored) {
                }
            }, ms);""",
    """            if (bannerView != null) {
                try {
                    bannerWm.removeView(bannerView);
                } catch (Exception ignored) {
                }
            }
            try {
                wm.addView(v, lp);
            } catch (Exception e) {
                return;
            }
            bannerView = v;
            bannerWm = wm;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (bannerView != v) return;
                try {
                    wm.removeView(v);
                } catch (Exception ignored) {
                }
                bannerView = null;
            }, ms);""")
sub("""    private static void stop() {
        if (player == null) return;""",
    """    private static void stop() {
        removeBanner();
        if (player == null) return;""")

# For the phone app's prayer page (MessageServer): today's times, play/stop now, and the adhan's own volume.
sub("""    private static String[] times(Context c, Calendar day) {""",
    """    static String[] times(Context c, Calendar day) {""")
sub("""    private static void stop() {""", """    static boolean playing() {
        return player != null;
    }

    static void stop() {""")
sub("""        player.setOnCompletionListener(mp -> stop());
        player.start();""",
    """        float vol = app.getSharedPreferences("adhan", Context.MODE_PRIVATE).getInt("vol", 100) / 100f;
        player.setVolume(vol, vol);
        player.setOnCompletionListener(mp -> stop());
        player.start();""")
sub("""    static void stop() {""",
    """    /** The adhan's own volume, 0-100, kept for the next one and applied to one playing now. */
    static void volume(Context c, int v) {
        v = Math.max(0, Math.min(100, v));
        c.getSharedPreferences("adhan", Context.MODE_PRIVATE).edit().putInt("vol", v).apply();
        if (player != null) {
            try {
                player.setVolume(v / 100f, v / 100f);
            } catch (Exception ignored) {
            }
        }
    }

    static void stop() {""")

# The city comes from the phone now (NoorCity, kept by this app): times for the city that is set.
sub("""            JSONObject t = new JSONObject(get("https://api.aladhan.com/v1/timings/" + date + "?latitude=" + LAT
                    + "&longitude=" + LON + "&method=" + BuildConfig.METHOD)).getJSONObject("data").getJSONObject("timings");""",
    """            JSONObject t = new JSONObject(get("https://api.aladhan.com/v1/timings/" + date + "?latitude=" + NoorCity.lat(c)
                    + "&longitude=" + NoorCity.lon(c) + "&method=" + NoorCity.method(c))).getJSONObject("data").getJSONObject("timings");""")

open(path, "w", encoding="utf-8").write(s)
print("adhan patch applied")
