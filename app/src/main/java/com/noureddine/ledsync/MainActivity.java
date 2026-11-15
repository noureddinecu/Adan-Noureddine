package com.noureddine.ledsync;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Single screen, fully usable with the TV remote (D-pad). */
@SuppressLint("MissingPermission")
public class MainActivity extends Activity {
    private static final String[] MODES = {"الصورة + الصوت", "الصورة فقط", "الصوت فقط"};
    private static final String[] SMOOTH = {"انسيابي بزاف", "انسيابي", "متوسط", "سريع", "سريع بزاف"};
    private static final int[][] TEST = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 255}};

    private SharedPreferences prefs;
    private LedBle ble;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView status;
    private Button startBtn, modeBtn, brightBtn, smoothBtn, protoBtn, scanBtn;
    private LinearLayout devices;
    private final Map<String, String> found = new LinkedHashMap<>();
    private BluetoothLeScanner scanner;
    private boolean scanning;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("cfg", MODE_PRIVATE);
        ble = LedBle.get(this);
        ble.protoOverride = prefs.getInt("proto", LedBle.AUTO);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(32);
        root.setPadding(pad, pad, pad, pad);
        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);

        TextView title = new TextView(this);
        title.setText("LED Sync");
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        status = new TextView(this);
        status.setTextSize(18);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(8), 0, dp(16));
        root.addView(status);

        startBtn = button(root, "", v -> toggle());
        modeBtn = button(root, "", v -> cycle("mode", 0, 3));
        brightBtn = button(root, "", v -> {
            int x = prefs.getInt("bright", 100) - 20;
            prefs.edit().putInt("bright", x < 20 ? 100 : x).apply();
            refresh();
        });
        smoothBtn = button(root, "", v -> cycle("smooth", 2, 5));
        scanBtn = button(root, "", v -> scan());
        devices = new LinearLayout(this);
        devices.setOrientation(LinearLayout.VERTICAL);
        devices.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(devices);
        button(root, "تجربة الألوان (أحمر، أخضر، أزرق، أبيض)", v -> test());
        protoBtn = button(root, "", v -> {
            cycle("proto", 0, 3);
            ble.protoOverride = prefs.getInt("proto", LedBle.AUTO);
        });

        TextView hint = new TextView(this);
        hint.setText("سد تطبيق Magic Lantern في الهاتف قبل الاتصال: الشريط كيقبل جهاز واحد فقط.");
        hint.setTextSize(14);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(16), 0, 0);
        root.addView(hint);

        requestPerms();
        startBtn.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        ble.listener = s -> refresh();
        String mac = prefs.getString("mac", null);
        if (mac != null && !ble.ready && hasBtPerm()) ble.connect(mac);
        refresh();
    }

    @Override
    protected void onPause() {
        super.onPause();
        ble.listener = null;
        stopScan();
    }

    private Button button(LinearLayout parent, String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(460), LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(6);
        parent.addView(b, lp);
        return b;
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private void cycle(String key, int def, int count) {
        prefs.edit().putInt(key, (prefs.getInt(key, def) + 1) % count).apply();
        refresh();
    }

    private void refresh() {
        String name = prefs.getString("name", null);
        status.setText((name == null ? "ما تختار حتى شريط" : name) + " — " + ble.state);
        startBtn.setText(SyncService.running ? "■ إيقاف التنسيق" : "▶ بدء التنسيق");
        modeBtn.setText("الوضع: " + MODES[prefs.getInt("mode", 0)]);
        brightBtn.setText("السطوع: " + prefs.getInt("bright", 100) + "%");
        smoothBtn.setText("الانتقال: " + SMOOTH[prefs.getInt("smooth", 2)]);
        protoBtn.setText("البروتوكول: " + LedBle.PROTO_NAMES[prefs.getInt("proto", 0)]);
        scanBtn.setText(scanning ? "جاري البحث..." : "البحث عن الشريط (بلوتوث)");
    }

    // ---------- Permissions ----------

    private boolean hasBtPerm() {
        return Build.VERSION.SDK_INT < 31
                || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestPerms() {
        List<String> want = new ArrayList<>();
        want.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 31) {
            want.add(Manifest.permission.BLUETOOTH_SCAN);
            want.add(Manifest.permission.BLUETOOTH_CONNECT);
        } else {
            want.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33) want.add(Manifest.permission.POST_NOTIFICATIONS);
        List<String> need = new ArrayList<>();
        for (String p : want) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        String mac = prefs.getString("mac", null);
        if (mac != null && !ble.ready && hasBtPerm()) ble.connect(mac);
    }

    // ---------- Scan ----------

    private final ScanCallback scanCb = new ScanCallback() {
        @Override
        public void onScanResult(int type, ScanResult r) {
            String name = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
            if (name == null) name = r.getDevice().getName();
            if (name == null || name.trim().isEmpty()) return;
            String mac = r.getDevice().getAddress();
            if (found.containsKey(mac)) return;
            found.put(mac, name);
            final String n = name;
            Button b = button(devices, (looksLikeLed(n) ? "★ " : "") + n + "  (" + mac + ")", v -> {
                stopScan();
                prefs.edit().putString("mac", mac).putString("name", n).apply();
                ble.connect(mac);
                devices.removeAllViews();
                refresh();
                startBtn.requestFocus();
            });
            // Likely LED controllers go to the top of the list.
            if (looksLikeLed(n)) {
                devices.removeView(b);
                devices.addView(b, 0);
            }
        }
    };

    private static boolean looksLikeLed(String n) {
        String u = n.toUpperCase();
        return u.startsWith("ELK") || u.startsWith("MELK") || u.startsWith("LED") || u.startsWith("TRIONES")
                || u.contains("BLEDOM") || u.contains("LANTERN") || u.startsWith("QHM") || u.startsWith("JACKYLED");
    }

    private void scan() {
        if (scanning) return;
        if (!hasBtPerm()) {
            requestPerms();
            return;
        }
        try {
            BluetoothAdapter ad = ((BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE)).getAdapter();
            if (ad == null || !ad.isEnabled()) {
                status.setText("شعل البلوتوث في إعدادات التلفاز");
                return;
            }
            found.clear();
            devices.removeAllViews();
            scanner = ad.getBluetoothLeScanner();
            scanner.startScan(scanCb);
            scanning = true;
            refresh();
            ui.postDelayed(this::stopScan, 12000);
        } catch (Exception e) {
            status.setText("خطأ في البحث: " + e.getMessage());
        }
    }

    private void stopScan() {
        if (!scanning) return;
        scanning = false;
        try { scanner.stopScan(scanCb); } catch (Exception ignored) { }
        refresh();
    }

    // ---------- Test + start/stop ----------

    private void test() {
        if (!ble.ready) {
            status.setText("الشريط ماشي متصل");
            return;
        }
        for (int i = 0; i < TEST.length; i++) {
            int[] c = TEST[i];
            ui.postDelayed(() -> ble.setColor(c[0], c[1], c[2]), i * 900L);
        }
    }

    private void toggle() {
        if (SyncService.running) {
            startService(new Intent(this, SyncService.class).setAction(SyncService.ACTION_STOP));
            ui.postDelayed(this::refresh, 400);
            return;
        }
        if (prefs.getString("mac", null) == null) {
            status.setText("اختار الشريط أولا بزر البحث");
            return;
        }
        if (prefs.getInt("mode", 0) == SyncService.MODE_MUSIC) {
            launch(0, null);
            return;
        }
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            startActivityForResult(mpm.createScreenCaptureIntent(), 7);
        } catch (Exception e) {
            status.setText("هاد التلفاز ما كيسمحش بقراءة الشاشة، جرب وضع الصوت فقط");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != 7) return;
        if (res == RESULT_OK && data != null) launch(res, data);
        else status.setText("خاصك تقبل طلب قراءة الشاشة باش يخدم التنسيق مع الصورة");
    }

    private void launch(int code, Intent data) {
        Intent i = new Intent(this, SyncService.class).putExtra("code", code);
        if (data != null) i.putExtra("data", data);
        startForegroundService(i);
        ui.postDelayed(this::refresh, 500);
    }
}
