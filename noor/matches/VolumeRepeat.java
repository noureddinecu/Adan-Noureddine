package com.gathin.tvhome;

import android.content.Context;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;

/**
 * A held Volume Up/Down keeps going. On the Xiaomi Google TV (MiTV-MOOR2/4/6) the firmware stops repeating a held
 * key once a key service filters keys (CleanYourTV examples/xiaomi-mitv-moor2: "held Volume stepped once per
 * press"). consume_volume_keys does not fit there: it swallows the press and relies on a firmware first step this
 * TV does not take. Here the press itself is left alone (the TV takes its one step as before) and, while the key
 * is held, the volume keeps stepping from Android's usual delay at about its usual rate, until the key comes up.
 * If the firmware does send its own repeats, they are left to it and this one stays out, so it never runs double.
 * Called from both key services with every key event; the state is per process, like VolumeKeys.
 */
final class VolumeRepeat {
    private VolumeRepeat() {
    }

    static final long DELAY_MS = 520, INTERVAL_MS = 70;
    private static Handler handler;
    private static Runnable step;
    private static int heldKey;
    private static long downAt;

    /** Never consumes the event: it only notices a press, a firmware repeat and a release. */
    static void see(Context c, KeyEvent e) {
        int key = e.getKeyCode();
        int dir = key == KeyEvent.KEYCODE_VOLUME_UP ? AudioManager.ADJUST_RAISE
                : key == KeyEvent.KEYCODE_VOLUME_DOWN ? AudioManager.ADJUST_LOWER : 0;
        if (dir == 0) return;
        if (e.getAction() == KeyEvent.ACTION_UP) {
            stop();
            return;
        }
        if (e.getAction() != KeyEvent.ACTION_DOWN) return;
        if (e.getRepeatCount() > 0) {
            stop(); // the firmware repeats this key itself: leave it to it
            return;
        }
        // The same press seen by the second service: already counted.
        if (key == heldKey && step != null && Math.abs(e.getDownTime() - downAt) < 5) return;
        stop();
        AudioManager audio = c.getSystemService(AudioManager.class);
        if (audio == null) return;
        if (handler == null) handler = new Handler(Looper.getMainLooper());
        heldKey = key;
        downAt = e.getDownTime();
        step = new Runnable() {
            @Override
            public void run() {
                // A release lost on the way (the service rebound, the screen changed): give up after 15 s held.
                if (SystemClock.uptimeMillis() - downAt > 15_000) {
                    stop();
                    return;
                }
                audio.adjustSuggestedStreamVolume(dir, AudioManager.USE_DEFAULT_STREAM_TYPE, AudioManager.FLAG_SHOW_UI);
                handler.postDelayed(this, INTERVAL_MS);
            }
        };
        handler.postDelayed(step, DELAY_MS);
    }

    static void stop() {
        if (handler != null && step != null) handler.removeCallbacks(step);
        step = null;
        heldKey = 0;
    }
}
