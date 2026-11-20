package app.noortv.phone;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;

/**
 * What the app keeps on the phone: the TVs set up from it (one profile each: name, address, model, id, theme,
 * city) and, per TV, the backup of how it was before, which restore goes back to.
 */
final class Store {
    private Store() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("noor", Context.MODE_PRIVATE);
    }

    static JSONArray tvs(Context c) {
        try {
            return new JSONArray(prefs(c).getString("tvs", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void saveTvs(Context c, JSONArray a) {
        prefs(c).edit().putString("tvs", a.toString()).apply();
    }

    /** The profile with this key (the TV's serial number), or null. */
    static JSONObject tv(Context c, String key) {
        JSONArray a = tvs(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject t = a.optJSONObject(i);
            if (t != null && key.equals(t.optString("key"))) return t;
        }
        return null;
    }

    /** Adds the profile, or updates the one with the same key, keeping fields the update does not carry. */
    static synchronized void putTv(Context c, JSONObject t) {
        JSONArray a = tvs(c), out = new JSONArray();
        boolean found = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            if (o.optString("key").equals(t.optString("key"))) {
                try {
                    for (java.util.Iterator<String> k = t.keys(); k.hasNext(); ) {
                        String n = k.next();
                        o.put(n, t.get(n));
                    }
                } catch (Exception ignored) {
                }
                found = true;
            }
            out.put(o);
        }
        if (!found) out.put(t);
        saveTvs(c, out);
    }

    static synchronized void removeTv(Context c, String key) {
        JSONArray a = tvs(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !o.optString("key").equals(key)) out.put(o);
        }
        saveTvs(c, out);
    }

    // ---------- backups ----------

    static File backupFile(Context c, String serial) {
        return new File(c.getFilesDir(), "tv-" + serial.replaceAll("[^A-Za-z0-9._-]", "_") + ".json");
    }

    static JSONObject backup(Context c, String serial) {
        try {
            File f = backupFile(c, serial);
            return f.exists() ? new JSONObject(new String(Files.readAllBytes(f.toPath()), "UTF-8")) : null;
        } catch (Exception e) {
            return null;
        }
    }

    static void saveBackup(Context c, JSONObject bk) throws Exception {
        try (OutputStream o = new FileOutputStream(backupFile(c, bk.getString("serial")))) {
            o.write(bk.toString(2).getBytes("UTF-8"));
        }
    }

    /** Everything the app keeps, as one JSON (the adhan as base64), to move it to another phone. */
    static JSONObject exportAll(Context c) throws Exception {
        JSONObject all = new JSONObject().put("app", "zahhaf-tv").put("tvs", tvs(c)).put("lang", prefs(c).getString("lang", "ar"));
        JSONArray backups = new JSONArray();
        File[] fs = c.getFilesDir().listFiles((d, n) -> n.startsWith("tv-") && n.endsWith(".json"));
        for (File f : fs == null ? new File[0] : fs) backups.put(new JSONObject(new String(Files.readAllBytes(f.toPath()), "UTF-8")));
        all.put("backups", backups);
        File adhan = new File(c.getFilesDir(), "adhan.mp3");
        if (adhan.length() > 0) all.put("adhan", android.util.Base64.encodeToString(Files.readAllBytes(adhan.toPath()), android.util.Base64.NO_WRAP));
        return all;
    }

    static int importAll(Context c, JSONObject all) throws Exception {
        if (!"zahhaf-tv".equals(all.optString("app"))) throw new IllegalArgumentException("not a Zahhaf TV file");
        JSONArray t = all.optJSONArray("tvs");
        for (int i = 0; t != null && i < t.length(); i++) putTv(c, t.getJSONObject(i));
        JSONArray b = all.optJSONArray("backups");
        for (int i = 0; b != null && i < b.length(); i++) {
            JSONObject bk = b.getJSONObject(i);
            if (backup(c, bk.getString("serial")) == null) saveBackup(c, bk);
        }
        if (all.has("adhan")) {
            try (OutputStream o = new FileOutputStream(new File(c.getFilesDir(), "adhan.mp3"))) {
                o.write(android.util.Base64.decode(all.getString("adhan"), android.util.Base64.NO_WRAP));
            }
        }
        if (all.has("lang")) prefs(c).edit().putString("lang", all.getString("lang")).apply();
        return t == null ? 0 : t.length();
    }
}
