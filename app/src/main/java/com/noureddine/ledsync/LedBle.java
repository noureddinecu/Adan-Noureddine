package com.noureddine.ledsync;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/** Bluetooth LE link to the LED strip controller (Magic Lantern / Lotus Lantern / Triones families). */
@SuppressLint("MissingPermission")
public final class LedBle {
    public static final int AUTO = 0, ELK = 1, TRIONES = 2;
    public static final String[] PROTO_NAMES = {"تلقائي", "ELK / Magic Lantern", "Triones"};

    public interface Listener { void onState(String state); }

    private static LedBle inst;

    public static synchronized LedBle get(Context c) {
        if (inst == null) inst = new LedBle(c.getApplicationContext());
        return inst;
    }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic ch;
    private int detected = ELK;
    private int writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;
    private int lastRgb = -1;
    private String mac;
    private boolean wantConnected;

    public volatile boolean ready;
    public volatile int protoOverride = AUTO;
    public volatile String state = "غير متصل";
    public volatile Listener listener;

    private LedBle(Context c) { ctx = c; }

    private void setState(String s) {
        state = s;
        Listener l = listener;
        if (l != null) main.post(() -> l.onState(s));
    }

    public synchronized void connect(String address) {
        closeGatt();
        mac = address;
        wantConnected = true;
        open();
    }

    public synchronized void disconnect() {
        wantConnected = false;
        closeGatt();
        setState("غير متصل");
    }

    private synchronized void open() {
        if (!wantConnected || mac == null || gatt != null) return;
        try {
            BluetoothAdapter ad = ((BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE)).getAdapter();
            if (ad == null || !ad.isEnabled()) {
                setState("البلوتوث مطفي");
                retryLater();
                return;
            }
            setState("جاري الاتصال...");
            gatt = ad.getRemoteDevice(mac).connectGatt(ctx, false, cb, BluetoothDevice.TRANSPORT_LE);
        } catch (Exception e) {
            setState("خطأ: " + e.getMessage());
            retryLater();
        }
    }

    private void retryLater() {
        main.removeCallbacks(reopen);
        main.postDelayed(reopen, 4000);
    }

    private final Runnable reopen = this::open;

    private synchronized void closeGatt() {
        ready = false;
        ch = null;
        lastRgb = -1;
        if (gatt != null) {
            try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) { }
            gatt = null;
        }
    }

    private final BluetoothGattCallback cb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                synchronized (LedBle.this) {
                    if (g != gatt) return;
                    closeGatt();
                }
                if (wantConnected) {
                    setState("انقطع الاتصال، إعادة المحاولة...");
                    retryLater();
                }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattCharacteristic best = null;
            int bestScore = 0, proto = ELK;
            for (BluetoothGattService s : g.getServices()) {
                for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                    int p = c.getProperties();
                    boolean w = (p & (BluetoothGattCharacteristic.PROPERTY_WRITE
                            | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0;
                    if (!w) continue;
                    String id = c.getUuid().toString().substring(4, 8).toLowerCase();
                    int score = 1, pr = ELK;
                    switch (id) {
                        case "fff3": score = 5; break;
                        case "ffd9": score = 5; pr = TRIONES; break;
                        case "ffe9": score = 4; pr = TRIONES; break;
                        case "ffe1": score = 3; break;
                        default:
                            // Skip standard GATT/GAP characteristics.
                            if (id.startsWith("2a") || id.startsWith("2b")) score = 0;
                    }
                    if (score > bestScore) { bestScore = score; best = c; proto = pr; }
                }
            }
            if (best == null) {
                setState("هاد الجهاز ماشي شريط LED معروف");
                return;
            }
            synchronized (LedBle.this) {
                if (g != gatt) return;
                ch = best;
                detected = proto;
                writeType = (best.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                        ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
            }
            String name = g.getDevice().getName();
            boolean melk = name != null && name.toUpperCase().startsWith("MELK");
            // Init + power on, spaced out so the controller accepts each packet.
            int t = 100;
            if (melk) {
                main.postDelayed(() -> write(new byte[]{0x7e, 0x07, (byte) 0x83}), t); t += 200;
                main.postDelayed(() -> write(new byte[]{0x7e, 0x04, 0x04}), t); t += 200;
            }
            main.postDelayed(LedBle.this::powerOn, t); t += 250;
            main.postDelayed(() -> {
                ready = true;
                setState("متصل ✓ " + (name == null ? "" : name));
            }, t);
        }
    };

    public int proto() {
        int o = protoOverride;
        return o == AUTO ? detected : o;
    }

    private synchronized boolean write(byte[] data) {
        if (gatt == null || ch == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                return gatt.writeCharacteristic(ch, data, writeType) == BluetoothStatusCodes.SUCCESS;
            }
            ch.setWriteType(writeType);
            ch.setValue(data);
            return gatt.writeCharacteristic(ch);
        } catch (Exception e) {
            return false;
        }
    }

    public void powerOn() {
        if (proto() == TRIONES) write(new byte[]{(byte) 0xcc, 0x23, 0x33});
        else write(new byte[]{0x7e, 0x04, 0x04, (byte) 0xf0, 0x00, 0x01, (byte) 0xff, 0x00, (byte) 0xef});
    }

    /** Sends a colour; skipped when unchanged or when the link is still busy with the previous packet. */
    public void setColor(int r, int g, int b) {
        if (!ready) return;
        int rgb = (r << 16) | (g << 8) | b;
        if (rgb == lastRgb) return;
        byte[] d = proto() == TRIONES
                ? new byte[]{0x56, (byte) r, (byte) g, (byte) b, 0x00, (byte) 0xf0, (byte) 0xaa}
                : new byte[]{0x7e, 0x07, 0x05, 0x03, (byte) r, (byte) g, (byte) b, 0x10, (byte) 0xef};
        if (write(d)) lastRgb = rgb;
    }
}
