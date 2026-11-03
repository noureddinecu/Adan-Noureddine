"""
Beat-matched merge of two clips of the same 123 BPM track.

A = cinematic music-video clip (portrait, letterboxed), B = cover-art clip (longer, ends on the drop).
A's audio from ~12 s onward is the same arrangement as B shifted by OFFSET seconds, so we play A,
DJ-crossfade into B over two bars with a bass swap (A's footage runs out exactly as A's audio
finishes leaving), then continue B to the end. Output: 1080x1920 30 fps H.264, -14 LUFS.

Usage: python3 merge_videos.py A.mp4 B.mp4 out.mp4
"""
import sys, subprocess, json, os, tempfile
import numpy as np, librosa, soundfile as sf, scipy.signal as ss

A, B, OUT = sys.argv[1:4]
SR = 48000
tmp = tempfile.mkdtemp()

def load(p):
    w = os.path.join(tmp, os.path.basename(p) + '.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', p, '-vn', '-ac', '2', '-ar', str(SR), w], check=True)
    y, _ = sf.read(w, always_2d=True); y = y.T
    return y if y.ndim == 2 else np.vstack([y, y])

ya, yb = load(A), load(B)
dur_a, dur_b = ya.shape[1] / SR, yb.shape[1] / SR

# ---- sync: A time = B time + OFFSET (refined by onset-envelope correlation)
h = 64; fps = SR / h
oa = librosa.onset.onset_strength(y=ya.mean(0), sr=SR, hop_length=h)
ob = librosa.onset.onset_strength(y=yb.mean(0), sr=SR, hop_length=h)
seg = oa[int(12 * fps):int(22 * fps)]; seg = seg - seg.mean()
lags = np.arange(int(5 * fps), int(10 * fps))
scores = []
for L in lags:
    b = ob[int(12 * fps) - L:int(12 * fps) - L + len(seg)]; b = b - b.mean()
    scores.append(seg @ b / (np.linalg.norm(seg) * np.linalg.norm(b) + 1e-9))
OFFSET = lags[int(np.argmax(scores))] / fps
print(f"offset {OFFSET:.3f}s  (corr {max(scores):.2f})")

# ---- beat grid of B (bars of 4; downbeat phase from the drop at ~18.1 s)
_, bb = librosa.beat.beat_track(y=yb.mean(0), sr=SR, start_bpm=123)
bt = librosa.frames_to_time(bb, sr=SR)
b0 = float(np.median(np.diff(bt)))
idx = np.round((bt - bt[0]) / b0)
beat, t0 = np.polyfit(idx, bt, 1)          # robust linear beat grid
t0 = t0 % beat
grid = lambda n: t0 + n * beat
X_START = grid(25)      # B time where B starts fading in   (~12.3 s)
X_SWAP = grid(29)       # bass swap downbeat                (~14.2 s)
X_END = grid(33)        # A fully gone                      (~16.2 s, A footage ends ~0.7 s later)
DROP = grid(37)
print(f"beat {beat:.4f}s  xfade B {X_START:.2f}->{X_END:.2f}  drop {DROP:.2f}")

# ---- loudness match the two sources on the shared section
def lufs(x):
    p = os.path.join(tmp, 'm.wav'); sf.write(p, x.T, SR)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', p, '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    return float(r.split('I:')[-1].split('LUFS')[0])
la = lufs(ya[:, int((X_START + OFFSET - 4) * SR):int((X_END + OFFSET) * SR)])
lb = lufs(yb[:, int((X_START - 4) * SR):int(X_END * SR)])
yb = yb * 10 ** ((la - lb) / 20)

def filt(x, kind, f):
    sos = ss.butter(4, f, btype=kind, fs=SR, output='sos')
    return ss.sosfiltfilt(sos, x, axis=-1)   # zero-phase: keeps the beats aligned

# ---- build output timeline (output time == A time until the end of the crossfade)
cut_a = X_END + OFFSET
n_out = int((cut_a + dur_b - X_END) * SR)
out = np.zeros((2, n_out))
out[:, :int(cut_a * SR)] = ya[:, :int(cut_a * SR)]
b_start_out = X_START + OFFSET
seg_b = yb[:, int(X_START * SR):]
out_b = np.zeros_like(out); n = min(seg_b.shape[1], n_out - int(b_start_out * SR))
out_b[:, int(b_start_out * SR):int(b_start_out * SR) + n] = seg_b[:, :n]

t = np.arange(n_out) / SR
s_out, w_out, e_out = X_START + OFFSET, X_SWAP + OFFSET, X_END + OFFSET
ramp = lambda a, b: np.clip((t - a) / (b - a), 0, 1)
# B: highs fade in over bar 1, full-band from swap downbeat
gb = np.sin(np.pi / 2 * ramp(s_out, w_out))
b_hi, b_lo = filt(out_b, 'high', 180), filt(out_b, 'low', 180)
b_lo_gain = (t >= w_out).astype(float)
b_lo_gain = np.convolve(b_lo_gain, np.hanning(int(0.03 * SR)) / np.hanning(int(0.03 * SR)).sum(), 'same')
mix_b = b_hi * gb + b_lo * b_lo_gain
# A: bass out at swap, highs fade over bar 2
a_seg = out
a_hi, a_lo = filt(a_seg, 'high', 180), filt(a_seg, 'low', 180)
ga = np.cos(np.pi / 2 * ramp(w_out, e_out))
mix_a = a_hi * ga + a_lo * (1 - b_lo_gain)
mix = mix_a + mix_b
fo = int(2.0 * SR); mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2
mix /= np.abs(mix).max() * 1.02
pre = os.path.join(tmp, 'pre.wav'); sf.write(pre, mix.T, SR, subtype='FLOAT')

# ---- master (two-pass loudnorm)
af = 'acompressor=threshold=-16dB:ratio=1.8:attack=20:release=200,'
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', pre, '-af', af + 'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json',
                    '-f', 'null', '-'], capture_output=True, text=True).stderr
js = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=9:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
      f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
audio = os.path.join(tmp, 'audio.wav')
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', pre, '-af',
                af + ln + ',alimiter=limit=0.8:level=false', '-ar', str(SR), audio], check=True)

# ---- video: A (cropped, blurred-fill portrait) -> dissolve -> B cover with slow zoom + drop punch
total = n_out / SR
xf_start = e_out                          # visual dissolve starts when A's audio has left
xf_dur = max(0.4, min(dur_a, total) - xf_start - 0.02)
b_vid_start = X_END                        # B footage time at output xf_start
drop_rel = DROP - b_vid_start
crop = subprocess.run(['ffmpeg', '-i', A, '-t', '10', '-vf', 'cropdetect=24:2:0', '-f', 'null', '-'],
                      capture_output=True, text=True).stderr
crops = [l.split('crop=')[1].split()[0] for l in crop.splitlines() if 'crop=' in l]
CROP = max(set(crops), key=crops.count)
punch = f"(1+0.10*(t/{total - xf_start:.2f})+0.06*gt(t,{drop_rel:.3f})*exp(-(t-{drop_rel:.3f})*5))"
fc = (
    f"[0:v]trim=0:{xf_start + xf_dur:.3f},setpts=PTS-STARTPTS,fps=30,crop={CROP},split[a1][a2];"
    f"[a1]scale=-2:1920,crop=1080:1920,boxblur=40:2,eq=brightness=-0.12:saturation=0.8[abg];"
    f"[a2]scale=1080:-2[afg];[abg][afg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[va];"
    f"[1:v]trim=start={b_vid_start:.3f},setpts=PTS-STARTPTS,fps=30,split[b1][b2];"
    f"[b1]scale=1920:1920,crop=1080:1920,boxblur=40:2,eq=brightness=-0.15:saturation=0.9[bbg];"
    f"[b2]scale=w='trunc(980*{punch}/2)*2':h=-2:eval=frame[bfg];"
    f"[bbg][bfg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[vb];"
    f"[va][vb]xfade=transition=fade:duration={xf_dur:.3f}:offset={xf_start:.3f},"
    f"fade=t=in:st=0:d=0.4,fade=t=out:st={total - 1.5:.3f}:d=1.5[v]"
)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', A, '-i', B, '-i', audio,
                '-filter_complex', fc, '-map', '[v]', '-map', '2:a', '-t', f'{total:.3f}',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', OUT], check=True)
print(f"done -> {OUT}  ({total:.1f}s)")
