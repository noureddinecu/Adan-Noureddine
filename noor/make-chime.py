#!/usr/bin/env python3
"""Writes a soft two-note bell (E6 then A6, about a second) as a small WAV, for a new message on the TV.
Usage: make-chime.py <out.wav>"""
import math, struct, sys, wave

rate, out = 22050, sys.argv[1]
samples = [0.0] * int(rate * 1.1)
for start, freq in ((0.0, 1318.5), (0.14, 1760.0)):
    for i in range(int(rate * 0.95)):
        t = i / rate
        env = math.exp(-t * 5.5) * min(1.0, t * 300)
        v = env * (math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * freq * 2.01 * t))
        j = int(start * rate) + i
        if j < len(samples):
            samples[j] += 0.28 * v
with wave.open(out, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 32767)) for x in samples))
