package com.livequizgame.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Runs the LIVE QUIZ GAME server (Node.js via nodejs-mobile) inside the app, as a foreground service
 * so it keeps receiving TikTok comments while you use other apps (e.g. the TikTok app itself).
 * Node.js can only be started once per process: "stop" ends the whole app process.
 */
public class NodeService extends Service {
    public static final int PORT = 3000;
    public static final String ACTION_STOP = "com.livequizgame.app.STOP";
    private static final String CHANNEL = "server";
    private static final int NOTIFICATION_ID = 7;

    static volatile boolean started = false;
    static volatile String startError = null;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private static native int startNode(String[] arguments, String[] environment, String logPath);

    // ------------------------------------------------------------------ public helpers

    public static void start(Context c) {
        Intent i = new Intent(c, NodeService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    /** 6-digit code needed once to create the dashboard password (shown in the app only). */
    public static String setupCode(Context c) {
        SharedPreferences p = c.getSharedPreferences("lqg", MODE_PRIVATE);
        String code = p.getString("setupCode", "");
        if (code.isEmpty()) {
            code = String.format(Locale.US, "%06d", new SecureRandom().nextInt(900000) + 100000);
            p.edit().putString("setupCode", code).apply();
        }
        return code;
    }

    /** Local network addresses other devices (OBS, a tablet…) can use to reach this phone. */
    public static List<String> lanUrls(Context c) {
        List<String> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress a = la.getAddress();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String u = "http://" + a.getHostAddress() + ":" + PORT;
                        if (!out.contains(u)) out.add(u);
                    }
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    public static File logFile(Context c) { return new File(c.getFilesDir(), "server.log"); }

    public static String logTail(Context c, int maxLines) {
        List<String> lines = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new FileReader(logFile(c)))) {
            String l;
            while ((l = r.readLine()) != null) { lines.add(l); if (lines.size() > maxLines) lines.remove(0); }
        } catch (Exception ignored) { }
        return android.text.TextUtils.join("\n", lines);
    }

    // ------------------------------------------------------------------ service

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            android.os.Process.killProcess(android.os.Process.myPid()); // Node cannot be restarted in-process
            return START_NOT_STICKY;
        }
        goForeground();
        acquireLocks();
        if (!started) {
            started = true;
            Thread t = new Thread(null, this::runNode, "nodejs", 16L * 1024 * 1024);
            t.start();
        }
        return START_STICKY;
    }

    private void runNode() {
        try {
            File project = prepareProject();
            File data = new File(getFilesDir(), "storage");
            data.mkdirs();
            File tmp = getCacheDir();
            String lan = android.text.TextUtils.join(",", lanUrls(this));
            String[] env = new String[] {
                "DATA_DIR=" + data.getAbsolutePath(),
                "PORT=" + PORT,
                "HOST=0.0.0.0",
                "NODE_ENV=production",
                "LQG_EMBEDDED=1",
                "LQG_SETUP_CODE=" + setupCode(this),
                "LQG_LAN_URLS=" + lan,
                "TMPDIR=" + tmp.getAbsolutePath(),
                "HOME=" + getFilesDir().getAbsolutePath(),
            };
            String[] args = new String[] { "node", new File(project, "server/index.mjs").getAbsolutePath() };
            startNode(args, env, logFile(this).getAbsolutePath());
            startError = "Node.js exited";
        } catch (Throwable e) {
            startError = e.toString();
        }
    }

    /** Unzips assets/nodejs-project.zip into filesDir once per installed version. */
    private File prepareProject() throws Exception {
        File dir = new File(getFilesDir(), "nodejs-project");
        File marker = new File(dir, ".installed");
        long stamp = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        if (marker.exists()) {
            try (FileInputStream in = new FileInputStream(marker)) {
                byte[] b = new byte[64];
                int n = in.read(b);
                if (n > 0 && new String(b, 0, n).trim().equals(String.valueOf(stamp))) return dir;
            }
        }
        deleteRecursive(dir);
        dir.mkdirs();
        String root = dir.getCanonicalPath() + File.separator;
        byte[] buf = new byte[64 * 1024];
        try (InputStream raw = getAssets().open("nodejs-project.zip"); ZipInputStream zip = new ZipInputStream(raw)) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                File f = new File(dir, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) continue; // zip-slip guard
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(f)) {
                    int n;
                    while ((n = zip.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
        try (FileOutputStream out = new FileOutputStream(marker)) { out.write(String.valueOf(stamp).getBytes()); }
        return dir;
    }

    private static void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        f.delete();
    }

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LiveQuiz:server");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "LiveQuiz:wifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        }
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "LIVE QUIZ server", NotificationManager.IMPORTANCE_LOW));
        }
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), piFlags);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, NodeService.class).setAction(ACTION_STOP), piFlags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification n = b.setContentTitle("LIVE QUIZ GAME")
            .setContentText("الخادم يعمل داخل التطبيق · Server running on port " + PORT)
            .setSmallIcon(R.drawable.ic_stat_quiz)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(new Notification.Action.Builder(null, "إيقاف · Stop", stop).build())
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICATION_ID, n);
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
