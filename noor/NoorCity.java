package @PKG@;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Looper;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The city for the prayer times and the weather, set from the phone (the Zahhaf TV app takes it from the phone's
 * location). The Noor app keeps it (POST /city on its page server); the launcher line and the prayer-times card ask
 * that server on this TV (GET http://127.0.0.1:8080/city) and keep the last answer. Until a city is set, the one
 * this build was made with is used. Copied into each app at build time (see noor/build.sh).
 */
final class NoorCity {
    private NoorCity() {
    }

    /** True in the Noor app itself, which keeps the city: it reads its own settings rather than asking itself. */
    private static final boolean LOCAL = @LOCAL@;
    private static volatile String lat = "@LAT@", lon = "@LON@", method = "@METHOD@", place = "@PLACE@";
    private static volatile long checked;
    private static volatile boolean loaded;

    static String lat(Context c) {
        refresh(c);
        return lat;
    }

    static String lon(Context c) {
        refresh(c);
        return lon;
    }

    static String method(Context c) {
        refresh(c);
        return method;
    }

    static String place(Context c) {
        refresh(c);
        return place;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("noor_city", Context.MODE_PRIVATE);
    }

    private static void fromPrefs(Context c) {
        if (c == null) return;
        SharedPreferences p = prefs(c);
        lat = p.getString("lat", lat);
        lon = p.getString("lon", lon);
        method = p.getString("method", method);
        place = p.getString("place", place);
    }

    /** Kept by the Noor app when the phone sends a city. */
    static void save(Context c, String la, String lo, String me, String pl) {
        prefs(c).edit().putString("lat", la).putString("lon", lo).putString("method", me).putString("place", pl).apply();
        lat = la;
        lon = lo;
        method = me;
        place = pl;
    }

    private static void refresh(Context c) {
        if (!loaded) {
            loaded = true;
            fromPrefs(c);
        }
        if (LOCAL) {
            fromPrefs(c);
            return;
        }
        if (System.currentTimeMillis() - checked < 60_000) return;
        checked = System.currentTimeMillis();
        if (Looper.myLooper() == Looper.getMainLooper()) new Thread(() -> fetch(c), "noor-city").start();
        else fetch(c);
    }

    private static void fetch(Context c) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL("http://127.0.0.1:8080/city").openConnection();
            h.setConnectTimeout(1500);
            h.setReadTimeout(1500);
            try (InputStream in = h.getInputStream()) {
                byte[] b = new byte[512];
                int n = in.read(b);
                String[] f = new String(b, 0, Math.max(0, n), "UTF-8").trim().split("\n");
                if (f.length >= 4 && !f[0].isEmpty()) {
                    lat = f[0];
                    lon = f[1];
                    method = f[2];
                    place = f[3];
                    if (c != null) save(c, lat, lon, method, place);
                }
            } finally {
                h.disconnect();
            }
        } catch (Exception ignored) {
            // The Noor app is not running yet: keep the last city.
        }
    }
}
