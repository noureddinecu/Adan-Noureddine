#!/usr/bin/env python3
"""Phone page studio (noor-app/MessageServer.java), applied at build time:
- GET serves assets/page.html (noor/phone-page.html): draw, write, stickers and photos, plus the quick message and live drawing;
- POST /image?s=<seconds> takes the composed picture (PNG with transparency, or JPEG over a photo) and shows it
  full screen over whatever is on the TV, for s seconds (0 = until POST /hide);
- POST /hide takes it down.
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
    """    private String pageCache;

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

open(path, "w", encoding="utf-8").write(s)
print("phone page patch applied")
