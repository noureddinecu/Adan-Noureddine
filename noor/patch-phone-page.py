#!/usr/bin/env python3
"""Phone page studio (noor-app/MessageServer.java), applied at build time:
- GET serves assets/page.html (noor/phone-page.html): draw, write, stickers and photos, plus the quick message and live drawing;
- POST /image?s=<seconds> takes the composed picture (PNG with transparency, or JPEG over a photo) and shows it
  full screen over whatever is on the TV, for s seconds (0 = until POST /hide);
- POST /hide takes it down; POST /hidetext takes down the quick message.
Usage: patch-phone-page.py <MessageServer.java>"""
import sys

path = sys.argv[1]
s = open(path, encoding="utf-8").read()


def sub(old, new):
    global s
    if old not in s:
        sys.exit(f"patch-phone-page: could not find:\n{old}")
    s = s.replace(old, new, 1)


sub("""            reply(s.getOutputStream(), "text/html", PAGE);
            return;
        }
        String body = readBody(in, head);""",
    """            reply(s.getOutputStream(), "text/html", page());
            return;
        }
        if (first.startsWith("POST /image")) {
            byte[] img = readBytes(in, head, 8 * 1024 * 1024);
            int secs = 60;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&]s=(\\\\d{1,5})").matcher(first);
            if (m.find()) secs = Integer.parseInt(m.group(1));
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(img, 0, img.length);
            int sec = secs;
            if (bmp != null) main.post(() -> showImage(bmp, sec));
            reply(s.getOutputStream(), "text/plain", bmp == null ? "bad" : "ok");
            return;
        }
        String body = readBody(in, head);
        if (first.startsWith("POST /hidetext")) {
            main.post(this::hideText);
            reply(s.getOutputStream(), "text/plain", "ok");
            return;
        }
        if (first.startsWith("POST /hide")) {
            main.post(this::hideImage);
            reply(s.getOutputStream(), "text/plain", "ok");
            return;
        }""")

sub("""                try (Socket s = server.accept()) {
                    s.setSoTimeout(5000);""",
    """                try (Socket s = server.accept()) {
                    s.setSoTimeout(20000); // a photo from the phone takes longer than a message""")

sub("""    private static void reply(OutputStream out, String type, String body) throws Exception {""",
    """    /** Index of the next prayer today from "HH:mm" times, or 0 (Fajr) once Isha has passed. */
    static int nextPrayer(String[] t) {
        if (t == null) return 0;
        java.util.Calendar now = java.util.Calendar.getInstance();
        int m = now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE);
        for (int i = 0; i < t.length; i++) {
            String[] hm = t[i].split(":");
            if (Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]) > m) return i;
        }
        return 0;
    }

    private String prayerJson() {
        String[] t = Adhan.times(this, java.util.Calendar.getInstance());
        StringBuilder b = new StringBuilder("{\\"times\\":[");
        if (t != null) for (int i = 0; i < t.length; i++) b.append(i == 0 ? "" : ",").append('"').append(t[i]).append('"');
        int vol = getSharedPreferences("adhan", MODE_PRIVATE).getInt("vol", 100);
        return b.append("],\\"next\\":").append(nextPrayer(t)).append(",\\"vol\\":").append(vol).append('}').toString();
    }

    private String pageCache;

    private String page() {
        if (pageCache == null) {
            try (InputStream in = getAssets().open("page.html")) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                pageCache = b.toString("UTF-8");
            } catch (Exception e) {
                pageCache = PAGE;
            }
        }
        return pageCache;
    }

    private static byte[] readBytes(InputStream in, String head, int max) throws Exception {
        int len = 0;
        for (String line : head.split("\\r\\n")) {
            if (line.toLowerCase().startsWith("content-length:")) len = Integer.parseInt(line.substring(15).trim());
        }
        byte[] body = new byte[Math.min(len, max)];
        int got = 0;
        while (got < body.length) {
            int r = in.read(body, got, body.length - got);
            if (r < 0) break;
            got += r;
        }
        return got == body.length ? body : java.util.Arrays.copyOf(body, got);
    }

    private android.widget.ImageView picture;
    private final Runnable hidePicture = this::hideImage;

    private void showImage(android.graphics.Bitmap bmp, int secs) {
        if (!Settings.canDrawOverlays(this)) return;
        WindowManager wm = getSystemService(WindowManager.class);
        hideImageNow(wm);
        android.widget.ImageView v = new android.widget.ImageView(this);
        v.setImageBitmap(bmp);
        v.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        v.setAlpha(0f);
        try {
            wm.addView(v, overlay(WindowManager.LayoutParams.MATCH_PARENT));
        } catch (Exception e) {
            return;
        }
        picture = v;
        v.animate().alpha(1f).setDuration(400).start();
        main.removeCallbacks(hidePicture);
        if (secs > 0) main.postDelayed(hidePicture, secs * 1000L);
    }

    private void hideImageNow(WindowManager wm) {
        main.removeCallbacks(hidePicture);
        if (picture == null) return;
        try {
            wm.removeView(picture);
        } catch (Exception ignored) {
        }
        picture = null;
    }

    private void hideText() {
        if (shown == null) return;
        View v = shown;
        shown = null;
        v.animate().alpha(0f).setDuration(400).withEndAction(() -> {
            try {
                getSystemService(WindowManager.class).removeView(v);
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void hideImage() {
        main.removeCallbacks(hidePicture);
        if (picture == null) return;
        android.widget.ImageView v = picture;
        picture = null;
        v.animate().alpha(0f).setDuration(600).withEndAction(() -> {
            try {
                getSystemService(WindowManager.class).removeView(v);
            } catch (Exception ignored) {
            }
        }).start();
    }

    private static void reply(OutputStream out, String type, String body) throws Exception {""")

# The phone app: GET /ping (discovery), GET /prayer (today's times, next prayer, adhan volume) and
# POST /adhan?do=play|stop&vol=N (try the adhan now, stop it, set its volume).
sub("""        if (!first.startsWith("POST ")) {""",
    """        if (first.startsWith("GET /ping")) {
            reply(s.getOutputStream(), "text/plain", "zahhaf");
            return;
        }
        if (first.startsWith("GET /prayer")) {
            reply(s.getOutputStream(), "application/json", prayerJson());
            return;
        }
        if (!first.startsWith("POST ")) {""")
sub("""        if (first.startsWith("POST /image")) {""",
    """        if (first.startsWith("POST /adhan")) {
            readBody(in, head);
            java.util.regex.Matcher v = java.util.regex.Pattern.compile("[?&]vol=(\\\\d{1,3})").matcher(first);
            if (v.find()) Adhan.volume(this, Integer.parseInt(v.group(1)));
            if (first.contains("do=play")) {
                int next = nextPrayer(Adhan.times(this, java.util.Calendar.getInstance()));
                main.post(() -> Adhan.fire(getApplicationContext(), next, true));
            } else if (first.contains("do=stop")) {
                main.post(Adhan::stop);
            }
            reply(s.getOutputStream(), "text/plain", "ok");
            return;
        }
        if (first.startsWith("POST /image")) {""")

# Adhkar on screen (Dhikr.java): started with the server, set from the phone with GET/POST /dhikr.
sub("""        new Thread(this::serve, "msg-server").start();""",
    """        new Thread(this::serve, "msg-server").start();
        Dhikr.start(this);""")
sub("""        if (first.startsWith("GET /prayer")) {""",
    """        if (first.startsWith("GET /dhikr")) {
            reply(s.getOutputStream(), "application/json", Dhikr.json(this));
            return;
        }
        if (first.startsWith("POST /dhikr")) {
            readBody(in, head);
            android.content.SharedPreferences.Editor e = Dhikr.prefs(this).edit();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&](on|every|secs|corner|chime)=([a-z0-9]{1,3})").matcher(first);
            while (m.find()) {
                String k = m.group(1), v = m.group(2);
                if (k.equals("on") || k.equals("chime")) e.putBoolean(k, v.equals("1"));
                else if (k.equals("corner")) { if (v.matches("[tb][lr]")) e.putString("corner", v); }
                else if (v.matches("\\\\d+")) e.putInt(k, Math.max(1, Math.min(k.equals("secs") ? 30 : 240, Integer.parseInt(v))));
            }
            e.apply();
            Dhikr.reschedule();
            if (first.contains("do=test")) Dhikr.show();
            reply(s.getOutputStream(), "text/plain", "ok");
            return;
        }
        if (first.startsWith("GET /prayer")) {""")

# Live messages (the phone sends a frame on every change): a frame updates the picture in place; a new message
# comes in with a soft animation and, if switched on, a chime; pos=ticker scrolls the strip along the bottom.
sub("""            if (bmp != null) main.post(() -> showImage(bmp, sec));""",
    """            boolean live = first.contains("live=1"), ticker = first.contains("pos=ticker"), rtl = first.contains("dir=rtl");
            if (bmp != null) main.post(() -> showImage(bmp, sec, live, ticker, rtl));""")
sub("""    private android.widget.ImageView picture;""",
    """    private View picture;
    private android.widget.ImageView pictureImg;
    private boolean pictureTicker;
    private android.animation.ValueAnimator scroller;""")
old_show = s[s.index("    private void showImage(android.graphics.Bitmap bmp, int secs) {"):s.index("    private void hideImageNow(WindowManager wm) {")]
sub(old_show, """    private void showImage(android.graphics.Bitmap bmp, int secs, boolean live, boolean ticker, boolean rtl) {
        if (!Settings.canDrawOverlays(this)) return;
        WindowManager wm = getSystemService(WindowManager.class);
        main.removeCallbacks(hidePicture);
        if (picture != null && live && pictureTicker == ticker) {
            pictureImg.setImageBitmap(bmp); // a live frame: swap it in place, no animation, no chime
            if (ticker) scroll(bmp, rtl);
        } else {
            hideImageNow(wm);
            android.widget.ImageView img = new android.widget.ImageView(this);
            img.setImageBitmap(bmp);
            View v;
            WindowManager.LayoutParams lp;
            if (ticker) {
                android.widget.FrameLayout strip = new android.widget.FrameLayout(this);
                strip.setClipChildren(true);
                img.setScaleType(android.widget.ImageView.ScaleType.FIT_XY);
                strip.addView(img);
                v = strip;
                lp = overlay(WindowManager.LayoutParams.MATCH_PARENT);
                lp.height = Math.round(bmp.getHeight() * scale());
                lp.gravity = Gravity.BOTTOM;
                lp.y = Math.round(36 * scale());
            } else {
                img.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
                v = img;
                lp = overlay(WindowManager.LayoutParams.MATCH_PARENT);
            }
            try {
                wm.addView(v, lp);
            } catch (Exception e) {
                return;
            }
            picture = v;
            pictureImg = img;
            pictureTicker = ticker;
            if (ticker) scroll(bmp, rtl);
            v.setAlpha(0f);
            v.setScaleX(.94f);
            v.setScaleY(.94f);
            v.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(450)
                    .setInterpolator(new android.view.animation.OvershootInterpolator(1.4f)).start();
            chime();
        }
        if (secs > 0) main.postDelayed(hidePicture, secs * 1000L);
    }

    /** Phone frames are drawn for a 1280-wide screen. */
    private float scale() {
        return getResources().getDisplayMetrics().widthPixels / 1280f;
    }

    /** The ticker strip runs across the screen and round again: left to right for Arabic, right to left otherwise. */
    private void scroll(android.graphics.Bitmap bmp, boolean rtl) {
        if (scroller != null) scroller.cancel();
        float k = scale();
        int w = Math.round(bmp.getWidth() * k), h = Math.round(bmp.getHeight() * k);
        int screen = getResources().getDisplayMetrics().widthPixels;
        pictureImg.setLayoutParams(new android.widget.FrameLayout.LayoutParams(w, h));
        float from = rtl ? -w : screen, to = rtl ? screen : -w;
        scroller = android.animation.ValueAnimator.ofFloat(from, to);
        scroller.setDuration(Math.max(4000, (long) ((screen + w) / (180f * k) * 1000)));
        scroller.setInterpolator(new android.view.animation.LinearInterpolator());
        scroller.setRepeatCount(android.animation.ValueAnimator.INFINITE);
        android.widget.ImageView img = pictureImg;
        scroller.addUpdateListener(a -> img.setTranslationX((Float) a.getAnimatedValue()));
        scroller.start();
    }

    /** A soft two-note chime when a new message comes in, unless switched off on the phone. */
    private void chime() {
        if (!Dhikr.prefs(this).getBoolean("chime", true)) return;
        int id = getResources().getIdentifier("chime", "raw", getPackageName());
        if (id == 0) return;
        try {
            android.media.MediaPlayer mp = android.media.MediaPlayer.create(this, id);
            if (mp == null) return;
            mp.setVolume(.6f, .6f);
            mp.setOnCompletionListener(android.media.MediaPlayer::release);
            mp.start();
        } catch (Exception ignored) {
        }
    }

""")
sub("""    private void hideImageNow(WindowManager wm) {
        main.removeCallbacks(hidePicture);""",
    """    private void hideImageNow(WindowManager wm) {
        main.removeCallbacks(hidePicture);
        if (scroller != null) scroller.cancel();
        scroller = null;""")
old_hide = s[s.index("    private void hideImage() {"):]
old_hide = old_hide[:old_hide.index("        }).start();\n    }\n")+len("        }).start();\n    }\n")]
sub(old_hide, """    private void hideImage() {
        main.removeCallbacks(hidePicture);
        if (picture == null) return;
        View v = picture;
        picture = null;
        android.animation.ValueAnimator sc = scroller;
        scroller = null;
        v.animate().alpha(0f).scaleX(.96f).scaleY(.96f).setDuration(500).withEndAction(() -> {
            if (sc != null) sc.cancel();
            try {
                getSystemService(WindowManager.class).removeView(v);
            } catch (Exception ignored) {
            }
        }).start();
    }
""")

# The phone app sets the city (GET/POST /city) and fetches the adhan recording from a TV that has it (GET /adhan.mp3).
sub("""        if (first.startsWith("GET /ping")) {""",
    """        if (first.startsWith("GET /city")) {
            reply(s.getOutputStream(), "text/plain", NoorCity.lat(this) + "\\n" + NoorCity.lon(this) + "\\n"
                    + NoorCity.method(this) + "\\n" + NoorCity.place(this));
            return;
        }
        if (first.startsWith("POST /city")) {
            readBody(in, head);
            java.util.Map<String, String> q = new java.util.HashMap<>();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&](lat|lon|method|place)=([^& ]*)").matcher(first);
            while (m.find()) q.put(m.group(1), java.net.URLDecoder.decode(m.group(2), "UTF-8"));
            if (q.containsKey("lat") && q.containsKey("lon") && q.get("lat").matches("-?\\\\d{1,3}(\\\\.\\\\d+)?")
                    && q.get("lon").matches("-?\\\\d{1,3}(\\\\.\\\\d+)?")) {
                String me = q.getOrDefault("method", "3");
                NoorCity.save(this, q.get("lat"), q.get("lon"), me.matches("\\\\d{1,2}") ? me : "3", q.getOrDefault("place", ""));
                android.content.SharedPreferences a = getSharedPreferences("adhan", MODE_PRIVATE);
                android.content.SharedPreferences.Editor e = a.edit();
                for (String k : a.getAll().keySet()) if (k.matches("\\\\d\\\\d-\\\\d\\\\d-\\\\d{4}")) e.remove(k);
                e.apply();
                Adhan.schedule(this);
                reply(s.getOutputStream(), "text/plain", "ok");
            } else {
                reply(s.getOutputStream(), "text/plain", "bad");
            }
            return;
        }
        if (first.startsWith("GET /adhan.mp3")) {
            java.io.File f = new java.io.File(getExternalFilesDir(null), "adhan.mp3");
            OutputStream o = s.getOutputStream();
            if (!f.exists()) {
                o.write("HTTP/1.1 404 Not Found\\r\\nContent-Length: 0\\r\\nConnection: close\\r\\n\\r\\n".getBytes(StandardCharsets.UTF_8));
                return;
            }
            o.write(("HTTP/1.1 200 OK\\r\\nContent-Type: audio/mpeg\\r\\nContent-Length: " + f.length()
                    + "\\r\\nConnection: close\\r\\n\\r\\n").getBytes(StandardCharsets.UTF_8));
            try (InputStream fi = new java.io.FileInputStream(f)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = fi.read(buf)) > 0) o.write(buf, 0, n);
            }
            o.flush();
            return;
        }
        if (first.startsWith("GET /ping")) {""")

# The phone app recognises each TV (GET /id, this app's ANDROID_ID) and keeps it up to date (GET /version).
sub("""        if (first.startsWith("GET /ping")) {""",
    """        if (first.startsWith("GET /id")) {
            reply(s.getOutputStream(), "text/plain", android.provider.Settings.Secure.getString(getContentResolver(),
                    android.provider.Settings.Secure.ANDROID_ID));
            return;
        }
        if (first.startsWith("GET /version")) {
            long v = 0;
            try {
                v = getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
            } catch (Exception ignored) {
            }
            reply(s.getOutputStream(), "text/plain", String.valueOf(v));
            return;
        }
        if (first.startsWith("GET /ping")) {""")

open(path, "w", encoding="utf-8").write(s)
print("phone page patch applied")
