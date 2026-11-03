# Generates Moroccan zellige (khatam / 8-point star) SVG tiles used as backgrounds.
# Pure geometry, a few hundred bytes each: no raster image, no runtime cost.
import math, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'patterns')

def star(cx, cy, R, rot=0.0):
    r = R * math.cos(math.pi / 4) / math.cos(math.pi / 8)
    pts = []
    for k in range(16):
        a = math.radians(rot + k * 22.5 - 90)
        rr = R if k % 2 == 0 else r
        pts.append(f'{cx + rr * math.cos(a):.2f},{cy + rr * math.sin(a):.2f}')
    return ' '.join(pts)

def octagon(cx, cy, R, rot=22.5):
    return ' '.join(f'{cx + R*math.cos(math.radians(rot+k*45)):.2f},{cy + R*math.sin(math.radians(rot+k*45)):.2f}' for k in range(8))

def tile(S, fills, stroke, sw, mode):
    c = S / 2
    R = S * 0.345
    parts = []
    corners = [(0, 0), (S, 0), (0, S), (S, S)]
    if mode == 'color':
        # corner stars (red), centre star (green), gold octagons, ivory hearts, gold crosses on edges
        for x, y in corners:
            parts.append(f'<polygon points="{star(x, y, R)}" fill="{fills["red"]}"/>')
            parts.append(f'<polygon points="{octagon(x, y, R*0.42)}" fill="{fills["gold"]}"/>')
        parts.append(f'<polygon points="{star(c, c, R)}" fill="{fills["green"]}"/>')
        parts.append(f'<polygon points="{octagon(c, c, R*0.42)}" fill="{fills["gold"]}"/>')
        parts.append(f'<polygon points="{star(c, c, R*0.22, 22.5)}" fill="{fills["ivory"]}"/>')
        for x, y in [(c, 0), (0, c), (S, c), (c, S)]:
            parts.append(f'<polygon points="{star(x, y, R*0.32, 22.5)}" fill="{fills["blue"]}"/>')
    # strapwork outlines
    for x, y in corners + [(c, c)]:
        parts.append(f'<polygon points="{star(x, y, R)}" fill="none" stroke="{stroke}" stroke-width="{sw}"/>')
    for x, y in [(c, 0), (0, c), (S, c), (c, S)]:
        parts.append(f'<polygon points="{octagon(x, y, R*0.36)}" fill="none" stroke="{stroke}" stroke-width="{sw}"/>')
    # interlace lines linking the stars
    d = S * 0.5 - R * 0.77
    for (x1, y1, x2, y2) in [(c, c - R, c, 0), (c, c + R, c, S), (c - R, c, 0, c), (c + R, c, S, c)]:
        parts.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{sw}" stroke-dasharray="{d:.1f} {S:.1f}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">{"".join(parts)}</svg>'

palette = {'green': '#006233', 'red': '#c1272d', 'gold': '#c9a227', 'ivory': '#f8f3e6', 'blue': '#0b3d2e'}
os.makedirs(OUT, exist_ok=True)
files = {
    'zellige-color.svg': tile(96, palette, '#c9a227', 1.2, 'color'),   # body / splash (used at low opacity)
    'zellige-line-gold.svg': tile(72, palette, '#d9b54a', 1.1, 'line'),  # header on green
    'zellige-line-green.svg': tile(72, palette, '#006233', 1.0, 'line'),  # light surfaces
}
for n, s in files.items():
    open(os.path.join(OUT, n), 'w').write(s)
    print(n, len(s), 'bytes')
