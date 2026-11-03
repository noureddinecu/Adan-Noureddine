"""
Saxophone + Clean Electric Guitar arrangement.

Analyses the original saxophone track (tempo, tuning, chords), synthesises a
warm clean electric guitar part (physical-model plucked string), arranges it
around the saxophone (accompaniment + fills in the sax's breathing spaces),
then mixes and masters the result.

Usage:  python3 arrange_guitar.py <input.mp3> <output_dir>
Requires: numpy, scipy, librosa, soundfile, ffmpeg
"""
import sys, os, json, subprocess
import numpy as np
import scipy.signal as ss
import librosa
import soundfile as sf

SR = 44100
RNG = np.random.default_rng(7)
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------- analysis
src, _ = librosa.load(SRC, sr=SR, mono=False)
if src.ndim == 1:
    src = np.vstack([src, src])
mono = src.mean(0)
y22 = librosa.resample(mono, orig_sr=SR, target_sr=22050)
TUNING = float(librosa.estimate_tuning(y=y22, sr=22050, resolution=0.01))  # semitone fraction
_, beats = librosa.beat.beat_track(y=y22, sr=22050, start_bpm=143)
bt = librosa.frames_to_time(beats, sr=22050)
BEAT = float(np.median(np.diff(bt)))
grid = list(bt)
while grid[0] - BEAT > -0.05:
    grid.insert(0, grid[0] - BEAT)
while grid[-1] < len(mono) / SR + 4 * BEAT:
    grid.append(grid[-1] + BEAT)
grid = np.array(grid)
print(f"tempo {60/BEAT:.1f} bpm, tuning {TUNING*100:+.0f} cents, {len(grid)} grid beats")


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69 + TUNING) / 12)


# ------------------------------------------------- chord chart (from analysis)
# chord per 2-beat cell, starting at grid index of beat 1.81 s
def cell_time(t):
    return float(grid[np.argmin(np.abs(grid - t))])

CHART = [  # (approx time, chord)
    (1.81, 'Bm'), (2.67, 'Bm'), (3.41, 'Bm'), (4.27, 'D'), (5.16, 'D'),
    (6.04, 'F#m'), (6.94, 'F#m'), (7.83, 'E'), (8.71, 'E'), (9.57, 'Bm'),
    (10.47, 'Bm'), (11.33, 'D'), (12.21, 'F#m'), (13.03, 'F#m'), (13.86, 'F#m'),
    (14.70, 'A'), (15.53, 'G#5'),
    (16.37, 'G'), (17.21, 'A'), (18.07, 'Bm'), (18.92, 'Em'),
    (19.78, 'G'), (20.64, 'A'), (21.50, 'Bm'), (22.31, 'Em'),
    (23.17, 'G'), (24.01, 'A'), (24.85, 'Bm'), (25.68, 'Em'),
    (26.52, 'G'), (27.33, 'A'), (28.17, 'Bm'), (28.98, 'D'),
]
# guitar voicings: low arpeggio notes (kept under the sax) + a "sparkle" above it
VOICE = {
    'Bm':  ([47, 54, 59, 61], 73),   # B F# B C#  (add9)    sparkle C#5
    'D':   ([50, 54, 57, 64], 69),   # D F# A E   (add9)    sparkle A4
    'F#m': ([54, 57, 61, 64], 73),   # F# A C# E  (m7)      sparkle C#5
    'E':   ([52, 56, 59, 64], 71),   # E G# B E             sparkle B4
    'A':   ([45, 52, 57, 61], 76),   # A E A C#             sparkle E5
    'G#5': ([44, 51, 56, 63], 75),   # G# D# G# D#          sparkle D#5
    'G':   ([43, 50, 54, 59], 74),   # G D F# B   (maj7)    sparkle D5
    'Em':  ([52, 55, 59, 54], 71),   # E G B F#   (add9)    sparkle B4
}
SECTION_B = 16.3
END_T = 29.81

# ------------------------------------------------------- guitar synthesis
def pluck(midi, dur, vel=0.7, bright=0.5, t60=None, detune=0.0):
    """Extended Karplus-Strong string with pick-position and neck-pickup combs."""
    f0 = midi_hz(midi) * 2 ** (detune / 1200)
    D = SR / f0 - 0.5
    N = int(D); frac = D - N
    if t60 is None:
        t60 = np.interp(midi, [40, 80], [4.5, 1.8])
    rho = 10 ** (-3.0 / (t60 * f0))
    L = int((dur + 0.05) * SR)
    exc = RNG.uniform(-1, 1, N)
    a = 0.15 + 0.6 * bright * vel          # softer pick => darker excitation
    exc = ss.lfilter([a], [1, -(1 - a)], exc)
    p = max(1, int(0.18 * N))              # pick position comb
    exc[p:] -= exc[:-p] * 0.9
    x = np.zeros(L); x[:N] = exc * vel
    den = np.zeros(N + 3); den[0] = 1
    den[N] -= rho * 0.5 * (1 - frac); den[N + 1] -= rho * 0.5; den[N + 2] -= rho * 0.5 * frac
    y = ss.lfilter([1.0], den, x)
    q = max(1, int(0.27 * N))              # neck pickup position: warm, round
    y[q:] = y[q:] - 0.55 * y[:-q]
    fade = int(0.09 * SR)                  # gentle damping at note end
    y[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    att = int(0.002 * SR)
    y[:att] *= np.linspace(0, 1, att)
    return y


class Track:
    def __init__(self, length):
        self.buf = np.zeros(length)

    def note(self, t, midi, dur, vel, bright=0.5, human=True):
        if human:
            t += RNG.normal(0, 0.006)
            vel *= 1 + RNG.normal(0, 0.06)
        s = max(0, int(t * SR))
        y = pluck(midi, dur, vel, bright, detune=RNG.normal(0, 2))
        e = min(len(self.buf), s + len(y))
        self.buf[s:e] += y[:e - s]

    def strum(self, t, notes, dur, vel, spread=0.035, bright=0.45):
        for i, m in enumerate(notes):
            self.note(t + i * spread, m, dur - i * spread, vel * (0.85 + 0.15 * i / len(notes)), bright)


TOTAL = int((len(mono) / SR + 4.0) * SR)
arp = Track(TOTAL)    # main fingerpicked part (left of centre)
pad = Track(TOTAL)    # soft rolled chords / swells (right of centre)
fill = Track(TOTAL)   # melodic answers between sax phrases (right of centre)
E8 = BEAT / 2

# Intro: gentle F#m7 pickup that leads into the sax entrance
for i, (m, v) in enumerate([(54, .32), (57, .36), (61, .40), (64, .45), (66, .38)]):
    fill.note(cell_time(0.07) + i * BEAT * 0.85, m, 2.2, v, 0.35)

for idx, (t0, ch) in enumerate(CHART):
    t0 = cell_time(t0)
    low, spark = VOICE[ch]
    nxt = cell_time(CHART[idx + 1][0]) if idx + 1 < len(CHART) else END_T
    cell = nxt - t0
    if t0 < SECTION_B:
        # Section A: sparse, ballad-like - bass note + let-ring dyad, fading in
        fade_in = min(1.0, 0.55 + 0.45 * (t0 - 1.8) / 4.0)
        arp.note(t0, low[0], cell + 0.9, 0.52 * fade_in, 0.4)
        arp.note(t0 + BEAT, low[2], cell, 0.36 * fade_in, 0.4)
        arp.note(t0 + BEAT + 0.012, low[3], cell, 0.33 * fade_in, 0.4)
        if idx % 2 == 1:
            arp.note(t0 + BEAT + E8, low[1], cell - E8, 0.26 * fade_in, 0.35)
    else:
        # Section B: flowing 8th-note fingerpicking + sparkle above the sax
        pat = [low[0], low[1], low[2], low[3]]
        for k, m in enumerate(pat):
            acc = [0.55, 0.36, 0.42, 0.34][k]
            arp.note(t0 + k * E8, m, cell + 0.4 - k * E8, acc, 0.5)
        if idx % 2 == 0:
            fill.note(t0 + 3 * E8, spark, 1.6, 0.22, 0.55)
        pad.strum(t0, sorted(low[:3]) , cell + 0.3, 0.17, spread=0.045, bright=0.3)

# Fill: answer the sax across the long breath (A -> G#5 -> into section B)
for t, m, v in [(14.91, 76, .40), (15.12, 73, .36), (15.53, 75, .42), (15.74, 72, .36),
                (15.95, 68, .34), (16.16, 72, .32), (16.37, 74, .38)]:
    fill.note(t, m, 0.9, v, 0.55)
# small answer in the breath at ~24.8 s
fill.note(24.80, 71, 0.6, 0.30, 0.55); fill.note(24.97, 73, 1.0, 0.30, 0.55)

# Ending: slow rolled Bm(add9) + high B harmonic ringing into the reverb
pad.strum(END_T, [47, 54, 59, 62, 66, 73], 4.0, 0.42, spread=0.07, bright=0.4)
fill.note(END_T + 0.9, 83, 3.0, 0.20, 0.25)

# --------------------------------------------------------------- DSP tools
def biquad(kind, f, q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q); c = np.cos(w)
    if kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind in ('ls', 'hs'):
        sq = 2 * np.sqrt(A) * al; s = 1 if kind == 'ls' else -1
        b = [A * ((A + 1) - s * (A - 1) * c + sq), s * 2 * A * ((A - 1) - s * (A + 1) * c), A * ((A + 1) - s * (A - 1) * c - sq)]
        a = [(A + 1) + s * (A - 1) * c + sq, -s * 2 * ((A - 1) + s * (A + 1) * c), (A + 1) + s * (A - 1) * c - sq]
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x, *bands):
    for bd in bands:
        b, a = biquad(*bd); x = ss.lfilter(b, a, x, axis=-1)
    return x


def chorus(x, rate=0.7, depth=0.0022, base=0.012, phase=0.0):
    n = np.arange(len(x))
    d = (base + depth * np.sin(2 * np.pi * rate * n / SR + phase)) * SR
    return np.interp(n - d, n, x, left=0)


def plate_ir(seconds=2.6, predelay=0.022):
    L = int(seconds * SR); t = np.arange(L) / SR
    ir = []
    for ch in range(2):
        nz = RNG.normal(0, 1, L)
        lo = ss.lfilter(*biquad('lp', 2500), nz) * np.exp(-6.9 * t / 2.4)
        hi = (nz - ss.lfilter(*biquad('lp', 2500), nz)) * np.exp(-6.9 * t / 1.2)
        r = lo + 0.6 * hi
        r = eq(r, ('hp', 180), ('lp', 9000))
        r *= np.minimum(1, t / 0.008)
        ir.append(np.concatenate([np.zeros(int(predelay * SR)), r]))
    ir = np.array(ir); return ir / np.sqrt((ir ** 2).sum(1, keepdims=True))


def reverb(st, ir, wet):
    out = np.stack([ss.fftconvolve(st[c], ir[c])[:st.shape[1]] for c in range(2)])
    return st + wet * out


def pan(x, p):  # constant-power, p in [-1, 1]
    th = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)])


def env_follow(x, att=0.01, rel=0.25):
    e = np.abs(x); out = np.zeros_like(e)
    ka, kr = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    # fast vectorised approximation: smooth with two one-pole filters
    up = ss.lfilter([1 - ka], [1, -ka], e)
    return ss.lfilter([1 - kr], [1, -kr], up)


# ------------------------------------------------------------------ guitar bus
def guitar_tone(x):
    x = eq(x, ('hp', 95), ('peak', 220, 1.0, 1.5), ('peak', 480, 0.9, -2.5),
           ('peak', 2800, 1.2, 1.2), ('lp', 6200, 0.6))
    x = np.tanh(1.6 * x / (np.max(np.abs(x)) + 1e-9)) / np.tanh(1.6)   # gentle valve-style warmth
    return x

g_arp, g_pad, g_fill = (guitar_tone(t.buf) for t in (arp, pad, fill))

# ducking: guitar breathes under the saxophone
src_pad = np.pad(mono, (0, TOTAL - len(mono)))
sax_band = eq(src_pad, ('hp', 300), ('lp', 2500))
env = env_follow(sax_band, 0.015, 0.3); env /= env.max()
duck = 1 - 0.38 * np.clip(env / 0.6, 0, 1)

arp_st = pan(g_arp * duck, -0.38)
arp_st[1] += 0.25 * chorus(g_arp * duck, phase=1.3)
pad_st = pan(g_pad * duck, 0.42)
pad_st[0] += 0.22 * chorus(g_pad * duck, rate=0.5, phase=0.4)
fill_st = pan(g_fill, 0.28)
fill_st[0] += 0.30 * chorus(g_fill, rate=0.9)

guitar = 0.55 * arp_st + 0.42 * pad_st + 0.62 * fill_st
ir = plate_ir()
guitar = reverb(guitar, ir, 0.38)

# ------------------------------------------------------------------ sax/source
srcp = np.pad(src, ((0, 0), (0, TOTAL - src.shape[1])))
srcp = eq(srcp, ('hp', 32), ('peak', 260, 0.9, -1.8), ('peak', 1600, 1.0, 0.8),
          ('hs', 4500, 0.7, 3.0))
srcp = reverb(srcp, ir, 0.10)

# level: guitar sits ~9 dB below the saxophone/backing (RMS)
rms = lambda z: np.sqrt(np.mean(z ** 2))
guitar *= (rms(srcp) / rms(guitar)) * 10 ** (-9 / 20)

mix = srcp + guitar
fade = int(1.5 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 2
mix /= np.max(np.abs(mix)) * 1.05

pre = os.path.join(OUT, '_premaster.wav')
sf.write(pre, mix.T, SR, subtype='FLOAT')
sf.write(os.path.join(OUT, 'guitar_stem.wav'), (guitar / np.max(np.abs(guitar)) * 0.9).T, SR, subtype='PCM_24')

# ---------------------------------------------------------------- mastering
chain = "acompressor=threshold=-20dB:ratio=2:attack=25:release=250:makeup=2,"
r = subprocess.run(['ffmpeg', '-hide_banner', '-y', '-i', pre, '-af',
                    chain + 'loudnorm=I=-14:TP=-1.2:LRA=11:print_format=json', '-f', 'null', '-'],
                   capture_output=True, text=True)
js = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.2:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
      f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
final_wav = os.path.join(OUT, 'sax_guitar_arrangement.wav')
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', pre, '-af',
                chain + ln + ',alimiter=limit=0.84:attack=5:release=60:asc=1', '-ar', str(SR), '-c:a', 'pcm_s24le', final_wav], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', final_wav,
                '-c:a', 'libmp3lame', '-b:a', '320k', final_wav[:-4] + '.mp3'], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(OUT, 'guitar_stem.wav'),
                '-c:a', 'libmp3lame', '-b:a', '320k', os.path.join(OUT, 'guitar_stem.mp3')], check=True)
os.remove(pre)
print('done ->', final_wav)
