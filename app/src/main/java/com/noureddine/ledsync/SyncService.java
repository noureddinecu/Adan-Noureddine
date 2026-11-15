package com.noureddine.ledsync;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.audiofx.Visualizer;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;

import java.nio.ByteBuffer;

/** Foreground service: reads screen colours and audio level, drives the LED strip smoothly. */
public class SyncService extends Service {
    public static final String ACTION_STOP = "com.noureddine.ledsync.STOP";
    public static final int MODE_BOTH = 0, MODE_SCREEN = 1, MODE_MUSIC = 2;
    public static volatile boolean running;

    private static final int W = 96, H = 54;
    private static final float[] ALPHAS = {0.04f, 0.07f, 0.12f, 0.2f, 0.35f};

    private LedBle ble;
    private SharedPreferences prefs;
    private HandlerThread thread;
    private Handler handler;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private Visualizer visualizer;
    private Thread audioThread;
    private volatile boolean alive;

    // Screen state (written on handler thread, read by the render loop on the same thread).
    private final float[] screen = {0, 0, 0};
    private boolean haveScreen;
    private long blackSince;

    // Audio state.
    private volatile float level;
    private volatile long lastSound;
    private float peak = 0.02f, avg, env, gain = 1f, hue;
    private long lastBeat;

    private final float[] cur = {0, 0, 0};
    private final float[] hsv = new float[3];

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (running) return START_NOT_STICKY;
        prefs = getSharedPreferences("cfg", MODE_PRIVATE);
        ble = LedBle.get(this);
        int mode = prefs.getInt("mode", MODE_BOTH);
        Intent data = intent.getParcelableExtra("data");
        boolean wantScreen = mode != MODE_MUSIC && data != null;

        startForegroundCompat(wantScreen);
        running = true;
        alive = true;
        thread = new HandlerThread("ledsync");
        thread.start();
        handler = new Handler(thread.getLooper());

        if (wantScreen) startProjection(intent.getIntExtra("code", 0), data);
        if (mode != MODE_SCREEN) startAudio();

        String mac = prefs.getString("mac", null);
        if (mac != null && !ble.ready) ble.connect(mac);
        handler.post(tick);
        return START_NOT_STICKY;
    }

    private void startForegroundCompat(boolean withProjection) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("sync", "LED Sync", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 0,
                new Intent(this, SyncService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "sync")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("LED Sync خدام")
                .setContentText("الشريط كيتبع الشاشة والصوت")
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "إيقاف", stop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            int type = withProjection ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    : ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            startForeground(1, n, type);
        } else {
            startForeground(1, n);
        }
    }

    // ---------- Screen ----------

    private void startProjection(int code, Intent data) {
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = mpm.getMediaProjection(code, data);
            if (projection == null) return;
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() { stopSelf(); }
            }, handler);
            reader = ImageReader.newInstance(W, H, PixelFormat.RGBA_8888, 2);
            reader.setOnImageAvailableListener(this::onFrame, handler);
            display = projection.createVirtualDisplay("ledsync", W, H, 80,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
        } catch (Exception e) {
            projection = null;
        }
    }

    private void onFrame(ImageReader r) {
        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null) return;
            Image.Plane p = img.getPlanes()[0];
            ByteBuffer b = p.getBuffer();
            int rs = p.getRowStride(), ps = p.getPixelStride();
            float sr = 0, sg = 0, sb = 0, sw = 0, sv = 0;
            int n = 0;
            for (int y = 1; y < H; y += 2) {
                for (int x = 1; x < W; x += 2) {
                    int o = y * rs + x * ps;
                    int cr = b.get(o) & 255, cg = b.get(o + 1) & 255, cb = b.get(o + 2) & 255;
                    int mx = Math.max(cr, Math.max(cg, cb)), mn = Math.min(cr, Math.min(cg, cb));
                    float val = mx / 255f;
                    float sat = mx == 0 ? 0 : (mx - mn) / (float) mx;
                    // Vivid pixels count more, so the light is not a muddy grey average.
                    float w = 0.04f + sat * val;
                    sr += cr * w; sg += cg * w; sb += cb * w; sw += w;
                    sv += val;
                    n++;
                }
            }
            float avgVal = sv / n;
            long now = SystemClock.elapsedRealtime();
            if (avgVal < 0.02f) {
                if (blackSince == 0) blackSince = now;
            } else {
                blackSince = 0;
            }
            Color.RGBToHSV((int) (sr / sw), (int) (sg / sw), (int) (sb / sw), hsv);
            hsv[1] = Math.min(1f, hsv[1] * 1.35f);
            hsv[2] = Math.min(1f, avgVal * 1.7f);
            int c = Color.HSVToColor(hsv);
            screen[0] = Color.red(c); screen[1] = Color.green(c); screen[2] = Color.blue(c);
            haveScreen = true;
        } catch (Exception ignored) {
        } finally {
            if (img != null) img.close();
        }
    }

    // ---------- Audio ----------

    private void startAudio() {
        try {
            // Session 0 = the TV's global output mix: works for every app, including protected video.
            visualizer = new Visualizer(0);
            visualizer.setEnabled(false);
            visualizer.setCaptureSize(Visualizer.getCaptureSizeRange()[0]);
            visualizer.setScalingMode(Visualizer.SCALING_MODE_AS_PLAYED);
            visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                @Override
                public void onWaveFormDataCapture(Visualizer v, byte[] wave, int rate) {
                    double s = 0;
                    for (byte x : wave) {
                        int d = (x & 255) - 128;
                        s += d * d;
                    }
                    feedRms((float) Math.sqrt(s / wave.length) / 128f);
                }

                @Override
                public void onFftDataCapture(Visualizer v, byte[] fft, int rate) { }
            }, Visualizer.getMaxCaptureRate(), true, false);
            visualizer.setEnabled(true);
        } catch (Throwable t) {
            releaseVisualizer();
            startPlaybackCapture();
        }
    }

    @SuppressLint("MissingPermission")
    private void startPlaybackCapture() {
        if (Build.VERSION.SDK_INT < 29 || projection == null) return;
        audioThread = new Thread(() -> {
            AudioRecord rec = null;
            try {
                AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(projection)
                        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                        .addMatchingUsage(AudioAttributes.USAGE_GAME)
                        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                        .build();
                AudioFormat fmt = new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(44100)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .build();
                rec = new AudioRecord.Builder()
                        .setAudioFormat(fmt)
                        .setBufferSizeInBytes(8192)
                        .setAudioPlaybackCaptureConfig(cfg)
                        .build();
                rec.startRecording();
                short[] buf = new short[1764]; // 40 ms
                while (alive) {
                    int n = rec.read(buf, 0, buf.length);
                    if (n <= 0) continue;
                    double s = 0;
                    for (int i = 0; i < n; i++) s += (double) buf[i] * buf[i];
                    feedRms((float) Math.sqrt(s / n) / 32768f);
                }
            } catch (Throwable ignored) {
            } finally {
                if (rec != null) try { rec.release(); } catch (Exception ignored) { }
            }
        }, "ledsync-audio");
        audioThread.start();
    }

    /** Turns a raw RMS into a 0..1 level that adapts to the current volume. */
    private void feedRms(float rms) {
        if (rms < 0.004f) {
            level = 0;
            return;
        }
        lastSound = SystemClock.elapsedRealtime();
        peak = Math.max(peak * 0.997f, Math.max(rms, 0.02f));
        level = Math.min(1f, rms / peak);
    }

    // ---------- Render loop ----------

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!alive) return;
            long now = SystemClock.elapsedRealtime();
            int mode = prefs.getInt("mode", MODE_BOTH);
            boolean audioOn = mode != MODE_SCREEN;
            boolean sound = audioOn && now - lastSound < 3000;
            float lv = level;

            // Beat: a jump above the recent average pushes the hue forward.
            avg = avg * 0.95f + lv * 0.05f;
            boolean beat = sound && lv > 0.35f && lv > avg * 1.45f && now - lastBeat > 280;
            if (beat) lastBeat = now;

            // Protected video (Netflix...) arrives as a black frame: fall back to music colours.
            boolean black = blackSince != 0 && now - blackSince > 2500;
            boolean useScreen = mode != MODE_MUSIC && haveScreen && !(black && sound);

            float tr, tg, tb;
            if (useScreen) {
                tr = screen[0]; tg = screen[1]; tb = screen[2];
            } else {
                hue = (hue + 0.3f + (beat ? 40f : 0f)) % 360f;
                hsv[0] = hue; hsv[1] = 1f; hsv[2] = 1f;
                int c = Color.HSVToColor(hsv);
                tr = Color.red(c); tg = Color.green(c); tb = Color.blue(c);
            }

            float a = ALPHAS[Math.max(0, Math.min(4, prefs.getInt("smooth", 2)))];
            cur[0] += (tr - cur[0]) * a;
            cur[1] += (tg - cur[1]) * a;
            cur[2] += (tb - cur[2]) * a;

            // Audio envelope: quick rise, soft fall, so the light pulses without flicker.
            env += (lv - env) * (lv > env ? 0.5f : 0.1f);
            float targetGain;
            if (!audioOn) targetGain = 1f;
            else if (useScreen) targetGain = sound ? 0.6f + 0.4f * env : 1f;
            else targetGain = 0.18f + 0.82f * env;
            gain += (targetGain - gain) * 0.3f;

            float k = gain * prefs.getInt("bright", 100) / 100f;
            ble.setColor(clamp(cur[0] * k), clamp(cur[1] * k), clamp(cur[2] * k));
            handler.postDelayed(this, 40);
        }
    };

    private static int clamp(float v) {
        return v < 0 ? 0 : v > 255 ? 255 : (int) (v + 0.5f);
    }

    // ---------- Teardown ----------

    private void releaseVisualizer() {
        if (visualizer != null) {
            try { visualizer.setEnabled(false); visualizer.release(); } catch (Exception ignored) { }
            visualizer = null;
        }
    }

    @Override
    public void onDestroy() {
        alive = false;
        running = false;
        releaseVisualizer();
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }
}
