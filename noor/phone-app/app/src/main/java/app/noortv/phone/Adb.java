package app.noortv.phone;

import android.content.Context;

import java.io.File;

import dadb.AdbKeyPair;
import dadb.AdbShellResponse;
import dadb.Dadb;

/** Runs shell commands on the TV over network ADB (port 5555), with this phone's own key. */
final class Adb {
    private Adb() {
    }

    private static AdbKeyPair key(Context c) {
        File priv = new File(c.getFilesDir(), "adbkey");
        File pub = new File(c.getFilesDir(), "adbkey.pub");
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub);
        return AdbKeyPair.read(priv, pub);
    }

    /**
     * Runs one shell command and returns its output. The first time, the TV asks "Allow USB debugging?" for
     * this phone; the generous read timeout leaves time to answer it with the remote.
     */
    static String shell(Context c, String host, String command) throws Exception {
        try (Dadb d = Dadb.Companion.create(host, 5555, key(c), 10_000, 90_000)) {
            AdbShellResponse r = d.shell(command);
            return r.getAllOutput();
        }
    }
}
